/**
 * 语义化配色。
 *
 * 参考 Gemini CLI 的做法：不按「红/绿/蓝」命名，而按**用途**命名
 * （primary / secondary / accent / border / status.*）。
 * 好处是换配色时只改这一处，组件里不会散落硬编码色值。
 *
 * 色值选用 256 色近似值（如 #AFAFAF）而不是 truecolor，
 * 这样在只支持 256 色的终端里也能正确显示，不会退化成难看的近似色。
 */

export const palette = {
  /** 正文 */
  foreground: '#FFFFFF',
  /** 次要文字：说明、单位、路径 */
  gray: '#AFAFAF',
  /** 更弱：分隔符、占位符 */
  darkGray: '#878787',
  /** 强调：命令、可交互项 */
  accentBlue: '#87AFFF',
  /** 次强调：标题、品牌 */
  accentPurple: '#D7AFFF',
  accentCyan: '#87D7D7',
  /** 成功 */
  accentGreen: '#D7FFD7',
  /** 警告 */
  accentYellow: '#FFFFAF',
  /** 错误 */
  accentRed: '#FF87AF',
  /** 深绿底：完成态 */
  diffAdded: '#005F00',
} as const;

/** 语义 token：组件只应该用这些，不直接用 palette。 */
export const theme = {
  text: {
    primary: palette.foreground,
    secondary: palette.gray,
    /** 更弱的说明文字 */
    muted: palette.darkGray,
    accent: palette.accentBlue,
    /** 品牌与标题 */
    brand: palette.accentPurple,
    /** 命令、路径等需要突出的内容 */
    code: palette.accentCyan,
  },
  border: {
    default: palette.darkGray,
    focus: palette.accentBlue,
  },
  status: {
    success: palette.accentGreen,
    warning: palette.accentYellow,
    error: palette.accentRed,
    info: palette.accentBlue,
  },
  ui: {
    /** 分隔符、脚注 */
    comment: palette.darkGray,
    symbol: palette.accentCyan,
    /** 选中项 */
    active: palette.accentBlue,
  },
} as const;

/** 判定结果配色。 */
export const verdictStyle: Record<'correct' | 'partial' | 'wrong', { label: string; icon: string; color: string }> = {
  correct: { label: '正确', icon: '✓', color: theme.status.success },
  partial: { label: '部分正确', icon: '△', color: theme.status.warning },
  wrong: { label: '不正确', icon: '✗', color: theme.status.error },
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
