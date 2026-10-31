import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';
import { SPINNER_INTERVAL_MS, formatCount, formatElapsed, spinnerFrames } from '../spinner.js';

/**
 * 进行中/已完成的单行状态。
 *
 * 布局参考 Claude Code 的状态行，从左到右依次是：
 *   已用秒数 · 动画 + token 数 · esc 中断提示
 * 任务结束后保留一行摘要，而不是像纯 Loading 那样直接消失 ——
 * 否则用户会不知道「刚才到底跑完没有、花了多久」。
 */

export interface StatusLineProps {
  /** 进行中的文案，例如「正在出题」 */
  busyText: string;
  /** 完成后是否保留这一行 */
  done?: boolean;
  /** 完成后的文案 */
  doneText?: string;
  /** 耗时毫秒 */
  elapsedMs?: number;
  /** 完成时的附加信息，例如模型名 */
  meta?: string;
  /** 失败时用错误色 */
  failed?: boolean;
  /** 已被中断：与失败区分开，用中性色 */
  aborted?: boolean;
  /** 进行中显示「esc 中断」提示 */
  interruptHint?: boolean;
  /** 已接收的 token 估算值；0 或缺省时不显示 */
  tokens?: number;
}

export function StatusLine({
  busyText,
  done = false,
  doneText,
  elapsedMs,
  meta,
  failed = false,
  aborted = false,
  interruptHint = true,
  tokens = 0,
}: StatusLineProps): React.JSX.Element {
  const frames = React.useMemo(() => spinnerFrames(), []);
  const [frame, setFrame] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);

  // 进行中：走动画帧
  React.useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % frames.length), SPINNER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [done, frames.length]);

  // 进行中：每秒更新时间。
  // 只有转圈看不出「卡住了」还是「还在跑」，秒数能给出可判断的信号。
  React.useEffect(() => {
    if (done) return;
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [done]);

  if (!done) {
    const elapsedText = formatElapsed(elapsed);
    return (
      <Box marginTop={1}>
        {elapsedText ? <Text color={theme.dim}>{`${elapsedText}  `}</Text> : <Text color={theme.dim}>{'  '}</Text>}
        <Text color={theme.accent}>{frames[frame]} </Text>
        <Text color={theme.muted}>{busyText}</Text>
        {tokens > 0 ? <Text color={theme.dim}>{`  ${formatCount(tokens)} tokens`}</Text> : null}
        {interruptHint ? (
          <Text>
            <Text color={theme.dim}>{'  '}</Text>
            <Text color={theme.dim} bold>
              {'esc '}
            </Text>
            <Text color={theme.dim}>中断</Text>
          </Text>
        ) : null}
      </Box>
    );
  }

  const icon = aborted ? '⏹ ' : failed ? '✗ ' : '✓ ';
  const iconColor = aborted ? theme.warn : failed ? theme.danger : theme.correct;
  const elapsedText = elapsedMs !== undefined ? formatElapsed(elapsedMs) || '<1s' : '';

  return (
    <Box marginTop={1}>
      <Text color={iconColor}>{icon}</Text>
      <Text color={theme.dim}>{doneText ?? '完成'}</Text>
      {elapsedText ? <Text color={theme.dim}>{`  ${elapsedText}`}</Text> : null}
      {meta ? <Text color={theme.dim}>{`  ${meta}`}</Text> : null}
    </Box>
  );
}
