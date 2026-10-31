/**
 * 可滚动文本视口。
 *
 * 用途：思考过程、长回答这类内容远超屏幕高度的场景。
 * 关键约束是 Ink 会重绘整屏，所以必须**只渲染可见窗口内的行**，
 * 不能把整段内容交给 Ink 自己裁剪 —— 内容一长就会卡。
 *
 * 滚动状态由外部持有（受控组件），这样 App 能用快捷键操作，
 * 也能在流式输出时自动跟随到底部。
 */

export interface ViewportState {
  /** 从顶部算起的偏移行数；null 表示自动跟随底部（流式输出用） */
  offset: number | null;
}

export const initialViewport: ViewportState = { offset: null };

/**
 * 单个字符占多少显示列。
 * 中文、日文、全角标点等占 2 列，终端按列排版，用 length 算会严重低估。
 */
export function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  // 东亚宽字符主要区间
  if (
    (code >= 0x1100 && code <= 0x115f) || // 韩文字母
    (code >= 0x2e80 && code <= 0x303e) || // 中日韩部首、标点
    (code >= 0x3041 && code <= 0x33ff) || // 假名、CJK 兼容
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 基本区
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) || // 韩文音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) || // 全角
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) || // emoji
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd) // CJK 扩展 B 及以后
  ) {
    return 2;
  }
  return 1;
}

/** 字符串的显示宽度（列数）。 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += charWidth(ch);
  return width;
}

/** 把文本按**显示宽度**折行；保留原有空行。 */
export function wrapToLines(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width);
  const out: string[] = [];

  for (const raw of text.split('\n')) {
    if (displayWidth(raw) <= safeWidth) {
      out.push(raw);
      continue;
    }

    let line = '';
    let lineWidth = 0;
    for (const ch of raw) {
      const w = charWidth(ch);
      if (lineWidth + w > safeWidth) {
        out.push(line);
        line = ch === ' ' ? '' : ch;
        lineWidth = ch === ' ' ? 0 : w;
        continue;
      }
      line += ch;
      lineWidth += w;
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * 计算可见窗口。
 * @param lines 全部行
 * @param height 可见行数
 * @param state 滚动状态
 */
export function visibleWindow(
  lines: string[],
  height: number,
  state: ViewportState,
): { lines: string[]; start: number; total: number; atBottom: boolean; hiddenAbove: number; hiddenBelow: number } {
  const total = lines.length;
  const maxStart = Math.max(0, total - height);
  // offset 为 null 时跟随底部
  const start = state.offset === null ? maxStart : Math.max(0, Math.min(maxStart, state.offset));
  const windowLines = lines.slice(start, start + height);

  return {
    lines: windowLines,
    start,
    total,
    atBottom: start >= maxStart,
    hiddenAbove: start,
    hiddenBelow: Math.max(0, total - (start + windowLines.length)),
  };
}

/** 向上/向下滚动；自动跟随状态下向上滚会从底部接管。 */
export function scrollBy(lines: string[], height: number, state: ViewportState, delta: number): ViewportState {
  const maxStart = Math.max(0, lines.length - height);
  const current = state.offset === null ? maxStart : state.offset;
  const next = Math.max(0, Math.min(maxStart, current + delta));
  // 滚到底部时恢复自动跟随，这样流式输出能继续跟
  return { offset: next >= maxStart ? null : next };
}

/**
 * 估算转录内容的总行数。
 *
 * 精确测量需要知道每个块的折行结果，成本高且容易和实际渲染不一致；
 * 这里按字符数折行估算，只用于把滚动偏移夹在合理范围内。
 * 宁可略高估——低估会让用户滚不到底。
 */
export function estimateLines(text: string, width: number): number {
  if (!text) return 1;
  return wrapToLines(text, width).length;
}

/**
 * 估算整份转录渲染出来有多少行。
 *
 * 用途仅限于把滚动偏移夹在合理范围内（滚过头会露出空白），
 * 所以按内容字符数粗略估算即可，不必与真实渲染逐行相等。
 * 每类块额外加边框/间距的固定开销。
 */
export function estimateTranscriptLines(items: Array<{
  kind: string;
  exercise?: { title: string; scenario: string; question: string; acceptance: string[] };
  answer?: string;
  grade?: { reason: string; corrected_answer: string; knowledge_points: string[] };
  text?: string;
}>, width: number): number {
  const inner = Math.max(20, width - 8);
  let total = 0;

  for (const item of items) {
    if (item.kind === 'header') {
      total += 1;
    } else if (item.kind === 'exercise' && item.exercise) {
      // 上下边框 2 + 标题 1 + 场景/要求各按折行算 + 验收点
      total += 2 + 1;
      total += estimateLines(item.exercise.title, inner);
      total += estimateLines(item.exercise.scenario, inner) + 1;
      total += estimateLines(item.exercise.question, inner) + 1;
      for (const a of item.exercise.acceptance) total += estimateLines(a, inner);
      total += 1;
    } else if (item.kind === 'hint' && item.text) {
      total += estimateLines(item.text, inner) + 3;
    } else if (item.kind === 'attempt') {
      total += 1; // 「你 ❯ …」
      total += estimateLines(item.answer ?? '', inner);
      total += 2; // 判题面板边框
      total += estimateLines(item.grade?.reason ?? '', inner);
      if (item.grade?.corrected_answer) total += 1 + estimateLines(item.grade.corrected_answer, inner);
      if (item.grade?.knowledge_points.length) total += 1;
      total += 1;
    }
  }
  return total;
}
