/**
 * 加载动画帧与 token 估算。
 *
 * 帧序列参考了 Claude Code 的做法：用 `· ✢ ✳ ✶ ✻ ✽` 这种「绽放」动画，
 * 比盲文点阵（⠋⠙⠹…）更细腻，且按终端能力降级。
 * 注意这里只借鉴观感与思路，代码是自己写的。
 */

/** 支持 Unicode 的终端用花式帧，否则退回 ASCII。 */
const BLOOM = ['·', '✢', '✳', '✶', '✻', '✽'];
const ASCII = ['|', '/', '-', '\\'];

/** 判断当前终端是否适合显示 Unicode 符号。 */
export function supportsUnicode(env: NodeJS.ProcessEnv = process.env): boolean {
  // 显式声明不支持
  if (env.TERM === 'dumb' || env.NO_UNICODE === '1') return false;
  // 常见 Windows 终端在老代码页下会显示乱码
  if (env.TERM_PROGRAM === 'Apple_Terminal' && env.LANG && !/utf-?8/i.test(env.LANG)) return false;
  return true;
}

/** 取动画帧。 */
export function spinnerFrames(env: NodeJS.ProcessEnv = process.env): string[] {
  return supportsUnicode(env) ? BLOOM : ASCII;
}

/** 帧间隔（毫秒）。太慢显得卡，太快晃眼。 */
export const SPINNER_INTERVAL_MS = 120;

/**
 * 估算 token 数。
 *
 * 为什么是估算：只有部分接口会在响应里返回真实 usage，
 * 流式过程中拿不到。Claude Code 的做法是字符数 ÷ 4，
 * 但那样对中文会低估约 4 倍（一个汉字≈0.5~0.7 token，而非 0.25）。
 * 所以这里按字符类型分开估算：
 *   · 拉丁字符 ≈ 4 字符/token
 *   · CJK 字符 ≈ 1.5 字符/token
 * 数量级够用，界面上的用途只是让人感知进度。
 */
export function estimateTokens(text: string): number {
  let latin = 0;
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isWide =
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0x20000 && code <= 0x3fffd);
    if (isWide) cjk += 1;
    else latin += 1;
  }
  return Math.round(latin / 4 + cjk / 1.5);
}

/** 紧凑数字：1234 → 1.2k。避免状态行被长数字撑宽。 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/** 时长显示：不足 1 秒不显示，避免刷屏。 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return '';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${String(s).padStart(2, '0')}s`;
}
