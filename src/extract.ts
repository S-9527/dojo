/**
 * 从各种可能的响应结构里取出文本。
 *
 * 不同厂商对「OpenAI 兼容」的落地程度不同，实测遇到的差异包括：
 *   · choices[0].message.content   标准 OpenAI（绝大多数）
 *   · choices[0].text              老的 /completions 格式
 *   · choices[0].delta.content     少数平台即使非流式也放在 delta
 *   · data.content / result.content 国产平台与大装置 ModelStudio
 *   · output_text                  新式 Responses 风格
 * 集中一处实现，probe（连接测试）与 llm（正式调用）共用，避免两边行为漂移。
 */

/** 取出推理模型的思考过程（reasoning），没有则返回 null。 */
export function extractReasoning(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, any>;
  const choice = Array.isArray(p.choices) ? p.choices[0] : undefined;
  const msg = choice?.message;
  if (typeof msg?.reasoning === 'string') return msg.reasoning;
  if (typeof msg?.reasoning_content === 'string') return msg.reasoning_content;

  // 也支持 content 里混排的 reasoning 分块
  if (Array.isArray(msg?.content)) {
    const parts = msg.content
      .filter((x: any) => x?.type === 'reasoning' || x?.type === 'thinking')
      .map((x: any) => (typeof x?.text === 'string' ? x.text : ''))
      .join('');
    if (parts) return parts;
  }
  return null;
}

/** 判断这个响应是否为一个「推理模型被截断」的合法返回。 */
export function isTruncatedReasoning(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, any>;
  const choice = Array.isArray(p.choices) ? p.choices[0] : undefined;
  if (!choice) return false;
  const hasReasoning =
    typeof choice.message?.reasoning === 'string' || typeof choice.message?.reasoning_content === 'string';
  const truncated = choice.finish_reason === 'length';
  const noContent = choice.message?.content === undefined || choice.message?.content === null;
  return hasReasoning && noContent && truncated;
}

/** 取出文本内容；取不到返回 null。 */
export function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  const choices = p.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as Record<string, any>;
    const message = choice?.message;
    if (typeof message?.content === 'string') return message.content;
    // 有些平台的 content 是分段数组：[{type:'text', text:'...'}]
    if (Array.isArray(message?.content)) {
      const joined = message.content
        .map((part: any) => (typeof part?.text === 'string' ? part.text : typeof part === 'string' ? part : ''))
        .join('');
      if (joined) return joined;
    }
    if (typeof choice?.text === 'string') return choice.text;
    if (typeof choice?.delta?.content === 'string') return choice.delta.content;
  }

  const nested = (obj: unknown, key: string): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : null;
  };

  return (
    nested(p, 'content') ??
    nested(p.data, 'content') ??
    nested(p.result, 'content') ??
    nested(p, 'output_text') ??
    // 有些平台把整段回答放在 data.text
    nested(p.data, 'text') ??
    null
  );
}

/**
 * 给用户看的响应摘要：把前若干字符原样带出来，便于判断到底收到了什么。
 * 只说“结构不对”用户没法排查。
 */
export function summarizePayload(payload: unknown, max = 400): string {
  let text: string;
  try {
    text = JSON.stringify(payload) ?? String(payload);
  } catch {
    text = String(payload);
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 判断是不是「不像对话补全」的错误体，用于给出更准的提示。 */
export function looksLikeErrorPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const err = p.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const msg = e.message ?? e.msg ?? e.code ?? e.type;
    if (msg !== undefined) return String(msg);
  }
  if (typeof p.message === 'string' && p.choices === undefined) return p.message;
  return null;
}
