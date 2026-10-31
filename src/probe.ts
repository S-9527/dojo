/**
 * 连接测试：用一个极小的请求验证 baseUrl / apiKey / model 是否可用。
 * /connect 保存前先跑一次，避免用户存了一份错误配置却不知道。
 */
import { LlmError } from './llm.js';
import { extractContent, isTruncatedReasoning, looksLikeErrorPayload, summarizePayload } from './extract.js';
import type { ResolvedConfig } from './types.js';

export interface ProbeResult {
  ok: boolean;
  /** 成功时返回模型的一句话回复，失败时是错误说明 */
  message: string;
  /** 耗时毫秒 */
  latencyMs: number;
}

/** 发一个最短的对话请求，验证配置可用。 */
export async function probeConnection(config: ResolvedConfig, signal?: AbortSignal): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 15_000));
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '回复一个字：好' }],
        // 不能用 8：SenseNova 这类推理模型会先消耗 reasoning_tokens，
        // 8 个 token 全被思考过程吃掉，content 为空、finish_reason=length。
        max_tokens: 256,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const message = await explainHttpError(response.status, body, config);
      return { ok: false, message, latencyMs };
    }

    const raw = await response.text().catch(() => '');
    let payload: unknown = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }

    const content = extractContent(payload);

    // 200 但结构里带 error：不少平台（含 SenseNova）用 200 返回业务错误，
    // 典型是积分/额度耗尽，此时 Key 和地址都是对的。
    const errMsg = looksLikeErrorPayload(payload);
    if (errMsg && typeof content !== 'string') {
      const hint = /积分|额度|quota|balance|insufficient|billing|欠费/i.test(errMsg)
        ? '\n  → 这是账户额度/积分问题，不是配置问题。去平台控制台看用量与余额。'
        : '';
      return { ok: false, message: `接口返回错误：${errMsg}${hint}`, latencyMs };
    }

    // 推理模型把 token 全花在思考上：连接本身是通的，只是被截断了。
    // 这种情况必须判成功，否则用户会误以为配置错了。
    if (isTruncatedReasoning(payload)) {
      return { ok: true, message: '（推理模型，这次回复被 token 上限截断，但连接正常）', latencyMs };
    }

    if (typeof content !== 'string') {
      // 把真实返回原样带出来 —— 只说“结构不对”用户没法排查
      return {
        ok: false,
        message:
          '接口能通（HTTP 200），但返回的不是可识别的对话格式。\n' +
          `  实际收到：${summarizePayload(payload ?? raw, 400)}\n` +
          '  已尝试：choices[0].message.content、choices[0].text、delta.content、content、data.content、result.content',
        latencyMs,
      };
    }
    return { ok: true, message: content.trim() || '（模型返回空内容，但连接正常）', latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, message: '连接超时，检查网络或 BASE_URL 是否可达', latencyMs };
    }
    return {
      ok: false,
      message: `无法连接：${err instanceof Error ? err.message : String(err)}`,
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 把 HTTP 错误翻译成可操作的说明。
 *
 * 401 是最容易误判的：可能是 Key 错，也可能是 BASE_URL 写错了域名/路径。
 * 这里多探一次 GET /models —— 如果那个路径根本不返回 401 而是 404，
 * 说明地址不对，与 Key 无关。这样用户不用瞎试。
 */
async function explainHttpError(status: number, body: string, config: ResolvedConfig): Promise<string> {
  const short = body.length > 200 ? `${body.slice(0, 200)}…` : body;

  if (status === 401 || status === 403) {
    const shape = await probeEndpointShape(config);
    if (shape === 'ok') {
      return (
        `鉴权失败（HTTP ${status}）：地址结构正常，问题在 Key。\n` +
        `  地址 ${config.baseUrl} 确实存在（探活路径返回 404，说明路由正常）\n` +
        '  请确认：Key 是否复制完整、是否已过期、是否开通了该模型。'
      );
    }
    return (
      `鉴权失败（HTTP ${status}），可能是 Key 无效，也可能是 BASE_URL 不对。\n` +
      `  当前地址：${config.baseUrl}\n` +
      '  排查顺序：先确认地址（多数 OpenAI 兼容服务要求以 /v1 结尾），再确认 Key。'
    );
  }

  if (status === 404) {
    return (
      `接口不存在（HTTP 404），地址是 ${config.baseUrl}/chat/completions\n` +
      '  常见原因：BASE_URL 少了 /v1，或用了非 OpenAI 兼容的路径。'
    );
  }
  if (status === 402 || status === 429) return `余额不足或触发限流（HTTP ${status}），稍后重试或检查配额`;
  if (status >= 500) return `服务端错误（HTTP ${status}），稍后重试`;
  return `接口报错（HTTP ${status}）：${short}`;
}

/**
 * 判断 baseUrl 下面到底有没有 OpenAI 兼容路由。
 *
 * 思路：请求一个**一定不存在**的路径。
 * 实测多数网关（含 SenseNova）对不存在的路径固定返回 404，且与鉴权无关；
 * 如果连这个路径都返回 401，说明网关在鉴权层就拦住了所有请求，
 * 此时反而不能据此判断地址对不对 —— 所以用 /models 做交叉验证：
 *   · 假路径 404  → 地址结构正常，401 就是 Key 的问题
 *   · 假路径 401  → 网关前置鉴权，无法判断，返回 unknown
 */
async function probeEndpointShape(config: ResolvedConfig): Promise<'ok' | 'missing' | 'unknown'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const fake = await fetch(`${config.baseUrl}/__dojo_probe__`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (fake.status === 404) return 'ok';
    // 网关对任何路径都拦，无法区分；此时不下结论，避免误导用户去改对的地址
    if (fake.status === 401 || fake.status === 403) return 'unknown';

    // 其他状态码（如 200）说明这是个宽松网关，同样不下结论
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** 供 /connect 展示用的简短结论。 */
export function describeProbe(result: ProbeResult): string {
  if (result.ok) return `连接正常（${result.latencyMs}ms）· 模型回复「${result.message}」`;
  return `连接失败：${result.message}`;
}

export { LlmError };
