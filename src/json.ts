/**
 * 从小模型输出里稳健地抠出 JSON。
 * 模型常在 JSON 前后加解释、包 ```json 围栏、或多写尾逗号，这里逐级兜底。
 */

/** 从 start 处的 '{' 开始，找与之配对的 '}'（跳过字符串内的括号）。 */
export function sliceBalancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 去掉对象/数组里多余的尾逗号（不动字符串内部）。 */
export function stripTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j] as string)) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

/** 拆掉 ```json ... ``` 围栏。 */
function unwrapFence(text: string): string | null {
  const match = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  return match?.[1] ?? null;
}

const CANDIDATES: Array<(text: string) => string | null> = [
  (t) => t,
  unwrapFence,
  (t) => {
    const at = t.indexOf('{');
    return at === -1 ? null : sliceBalancedObject(t, at);
  },
  (t) => {
    const at = t.indexOf('{');
    const sliced = at === -1 ? null : sliceBalancedObject(t, at);
    return sliced === null ? null : stripTrailingCommas(sliced);
  },
];

/**
 * 解析模型返回的 JSON 对象。
 * @param raw 模型原始输出
 * @param context 报错时说明是哪一步失败
 */
export function parseJsonLoose<T = unknown>(raw: string, context = '模型输出'): T {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`${context}为空，无法解析 JSON`);
  }
  const text = raw.trim();

  for (const transform of CANDIDATES) {
    let candidate: string | null = null;
    try {
      candidate = transform(text);
    } catch {
      continue;
    }
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // 换下一种策略
    }
  }

  const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  throw new Error(`${context}不是合法 JSON。原始内容开头：\n${preview}`);
}
