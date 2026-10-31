/**
 * 极简 OpenAI 兼容客户端。
 * 只要服务端实现 POST /chat/completions 即可：
 *   DeepSeek / Kimi / Qwen / 智谱 / OpenAI / Ollama(/v1) / vLLM / LM Studio ...
 */
import { extractContent, extractReasoning, looksLikeErrorPayload, summarizePayload } from './extract.js';
import type { ChatMessage, ChatOptions, ResolvedConfig, StreamOptions } from './types.js';

export type LlmErrorCode = 'reasoning-exhausted' | 'aborted';

export class LlmError extends Error {
  readonly status?: number;
  readonly body?: string;
  readonly retryable: boolean;
  /** 机器可读的错误类型，供上层做补救（例如自动放大 token 预算后重试） */
  readonly code?: LlmErrorCode;

  constructor(
    message: string,
    options: { status?: number; body?: string; retryable?: boolean; code?: LlmErrorCode } = {},
  ) {
    super(message);
    this.name = 'LlmError';
    this.status = options.status;
    this.body = options.body;
    this.retryable = options.retryable ?? false;
    this.code = options.code;
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
  response_format?: { type: 'json_object' };
}

/** 非流式对话，返回完整文本。 */
export async function chat(config: ResolvedConfig, messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const { temperature = 0.7, jsonMode = false, maxTokens = 1600, signal } = options;

  const body: ChatRequestBody = {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const text = await requestWithRetry(config, body, signal);
  if (!text.trim()) throw new LlmError('模型返回了空内容，请重试或换一个模型');
  return text;
}

async function requestWithRetry(
  config: ResolvedConfig,
  body: ChatRequestBody,
  signal: AbortSignal | undefined,
  attempt = 0,
): Promise<string> {
  const maxAttempts = 3;
  try {
    return await requestOnce(config, body, signal);
  } catch (err) {
    const canRetry = err instanceof LlmError && err.retryable && attempt < maxAttempts - 1;
    if (!canRetry || signal?.aborted) throw err;
    const wait = 800 * 2 ** attempt;
    process.stderr.write(`\x1b[2m接口暂时不可用（${err.status ?? '网络'}），${wait}ms 后重试…\x1b[0m\n`);
    await sleep(wait);
    return requestWithRetry(config, body, signal, attempt + 1);
  }
}

async function requestOnce(config: ResolvedConfig, body: ChatRequestBody, outerSignal?: AbortSignal): Promise<string> {
  if (!config.apiKey) {
    throw new LlmError('缺少 API Key。请设置环境变量 DOJO_API_KEY，或运行 `dojo config` 查看配置方法');
  }

  // 已经取消的 signal 必须立刻返回。
  // 只监听 abort 事件是不够的：如果 signal 在发起前就已中断，
  // 监听器永远不会触发，请求照样发出去，用户按了 Esc 却还在干等。
  if (outerSignal?.aborted) {
    throw new LlmError('请求已取消', { code: 'aborted' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), config.timeoutMs || 90_000);
  const onAbort = () => controller.abort(new Error('cancelled'));
  outerSignal?.addEventListener('abort', onAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // 不能用 err.name === 'AbortError' 判断：Node 的 fetch 在被中断时
    // 抛出的往往是 abort reason 本身（我们传的是 Error('cancelled')），
    // name 仍是 'Error'。直接看 signal 状态最可靠。
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      const timedOut = reason instanceof Error && reason.message === 'timeout';
      // 区分「超时」与「用户取消」：前者可重试，后者不该重试
      throw timedOut
        ? new LlmError(`请求超时（${config.timeoutMs}ms）`)
        : new LlmError('请求已取消', { code: 'aborted' });
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new LlmError(
      `无法连接到 ${config.baseUrl}：${detail}\n请检查网络、BASE_URL 是否正确、代理是否需要设置。`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onAbort);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new LlmError(humanizeHttpError(response.status, bodyText, config), {
      status: response.status,
      body: bodyText,
      retryable: RETRYABLE_STATUS.has(response.status),
    });
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const content = extractContent(payload);

  // 有些平台用 HTTP 200 返回业务错误，要当成错误处理
  const errMsg = looksLikeErrorPayload(payload);
  if (errMsg && typeof content !== 'string') {
    throw new LlmError(`接口返回错误：${errMsg}\n完整返回：${summarizePayload(payload, 400)}`);
  }

  if (typeof content !== 'string') {
    // 推理模型把 token 全花在 reasoning 上时，content 为空、finish_reason=length。
    // 这不是"结构不对"，而是预算不够 —— 要说清楚，否则用户会去怀疑配置。
    const reasoning = extractReasoning(payload);
    const finishReason = (payload as any)?.choices?.[0]?.finish_reason;
    if (reasoning && finishReason === 'length') {
      throw new LlmError(
        `模型的思考过程耗尽了 token 预算，最终回答还没开始就被截断了。\n` +
          `  这是推理模型的特性：它先输出 reasoning，再输出 content。\n` +
          `  当前 max_tokens=${body.max_tokens}。\n` +
          `  思考过程（前 200 字）：${summarizePayload(reasoning, 200)}`,
        { code: 'reasoning-exhausted' },
      );
    }
    throw new LlmError(
      `接口返回结构不符合预期，未找到回复文本。\n实际收到：${summarizePayload(payload, 500)}\n` +
        '已尝试：choices[0].message.content、choices[0].text、delta.content、content、data.content、result.content' +
        (reasoning ? `\n（发现 reasoning 字段，finish_reason=${finishReason}）` : ''),
    );
  }
  return content;
}

function humanizeHttpError(status: number, bodyText: string, config: ResolvedConfig): string {
  const short = bodyText.length > 300 ? `${bodyText.slice(0, 300)}…` : bodyText;
  if (status === 401 || status === 403) {
    return `鉴权失败（HTTP ${status}）。API Key 无效、过期或无权限。\n接口: ${config.baseUrl}\n返回: ${short}`;
  }
  if (status === 404) {
    return `接口不存在（HTTP 404）。BASE_URL 通常要以 /v1 结尾，例如 https://api.deepseek.com/v1\n当前: ${config.baseUrl}\n返回: ${short}`;
  }
  if (status === 429) {
    return `触发限流或余额不足（HTTP 429）。稍后重试或检查账户余额。\n返回: ${short}`;
  }
  return `接口报错（HTTP ${status}）。\n返回: ${short}`;
}

/**
 * 流式对话：边收边回调，最后返回完整文本。
 * 服务端不支持 SSE 时自动退化为非流式。
 */
export async function chatStream(
  config: ResolvedConfig,
  messages: ChatMessage[],
  options: StreamOptions = {},
): Promise<string> {
  const { onDelta, onReasoning, onProgress, temperature = 0.7, maxTokens = 900, signal } = options;
  if (!config.apiKey) return chat(config, messages, { temperature, maxTokens, signal });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), config.timeoutMs || 90_000);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        accept: 'text/event-stream',
      },
      body: JSON.stringify({ model: config.model, messages, temperature, max_tokens: maxTokens, stream: true }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      // 退化为非流式：多数兼容服务都支持 stream:false
      return chat(config, messages, { temperature, maxTokens, signal });
    }

    const reader = response.body.getReader();
    const decoder = new globalThis.TextDecoder();
    let buffer = '';
    let full = '';
    let received = ''; // 正文 + 思考过程，用于 token 估算

    for await (const chunk of chunksOf(reader, decoder)) {
      buffer += chunk;
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown } }>;
          };
          const delta = parsed?.choices?.[0]?.delta;
          // 推理模型的思考过程单独走通道，不混进正式回答
          const reasoning =
            typeof delta?.reasoning === 'string'
              ? delta.reasoning
              : typeof delta?.reasoning_content === 'string'
                ? delta.reasoning_content
                : '';
          if (reasoning) {
            onReasoning?.(reasoning);
            received += reasoning;
          }

          if (typeof delta?.content === 'string' && delta.content) {
            full += delta.content;
            received += delta.content;
            onDelta?.(delta.content);
          }
          if (reasoning || delta?.content) onProgress?.(received);
        } catch {
          // 忽略无法解析的心跳/注释行
        }
      }
    }
    return full;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmError('请求已取消', { code: 'aborted' });
    }
    if (err instanceof LlmError) throw err;
    throw new LlmError(`流式请求失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function* chunksOf(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: { decode: (input?: Uint8Array, options?: { stream?: boolean }) => string }) {
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    yield decoder.decode(value, { stream: true });
  }
}
