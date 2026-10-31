import type { Verdict } from '../types.js';

/** TUI 配色。集中管理，方便换主题。 */
export const theme = {
  brand: '#7ee787',
  accent: '#79c0ff',
  warn: '#f0b72f',
  danger: '#ff7b72',
  muted: '#8b949e',
  dim: '#6e7681',
  text: '#e6edf3',
  border: '#30363d',
  correct: '#3fb950',
  partial: '#f0b72f',
  wrong: '#ff7b72',
} as const;

export const verdictStyle: Record<Verdict, { label: string; icon: string; color: string }> = {
  correct: { label: '正确', icon: '✓', color: theme.correct },
  partial: { label: '部分正确', icon: '△', color: theme.partial },
  wrong: { label: '不正确', icon: '✗', color: theme.wrong },
};

/** 进度条：用方块字符画，width 为字符数。 */
export function bar(rate: number, width = 12): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(rate) ? rate : 0));
  const filled = Math.round(clamped * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** 把多行文本按可用宽度粗切，保留代码块缩进。 */
export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length <= width) {
      out.push(raw);
      continue;
    }
    let rest = raw;
    while (rest.length > width) {
      // 优先在空格处断行，中文没有空格时按宽度硬断
      const slice = rest.slice(0, width);
      const breakAt = slice.lastIndexOf(' ');
      const cut = breakAt > width * 0.6 ? breakAt : width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, '');
    }
    if (rest) out.push(rest);
  }
  return out;
}
