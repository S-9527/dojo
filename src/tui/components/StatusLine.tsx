import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

/**
 * 进行中/已完成的单行状态。
 *
 * 与 Loading 的区别：Loading 在任务结束时就卸载，屏幕上不留痕迹；
 * 这里任务完成后会**保留一行摘要**（耗时、模型名等），
 * 让人知道「刚才发生了什么、花了多久」，而不是突然消失。
 */

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface StatusLineProps {
  /** 进行中的文案，例如「大模型正在出题」 */
  busyText: string;
  /** 完成后是否保留这一行 */
  done?: boolean;
  /** 完成后的文案，例如「题目已生成」 */
  doneText?: string;
  /** 耗时毫秒，完成后显示 */
  elapsedMs?: number;
  /** 完成时的附加信息，例如模型名 */
  meta?: string;
  /** 失败时用错误色 */
  failed?: boolean;
  /** 已被中断：与失败区分开，用中性色 */
  aborted?: boolean;
  /** 进行中时显示「Esc 中断」提示 */
  interruptHint?: boolean;
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
}: StatusLineProps): React.JSX.Element {
  const [frame, setFrame] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);

  // 进行中：spinner 每 80ms 走一帧
  React.useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, [done]);

  // 进行中：每秒更新已用时间。
  // 光有转圈看不出「卡住了」还是「还在跑」，秒数能给出可判断的信号。
  React.useEffect(() => {
    if (done) return;
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(timer);
  }, [done]);

  if (!done) {
    return (
      <Box marginTop={1}>
        <Text color={theme.accent}>{FRAMES[frame]} </Text>
        <Text color={theme.muted}>{busyText}…</Text>
        {elapsed >= 1000 ? <Text color={theme.dim}>{`  ${(elapsed / 1000).toFixed(0)}s`}</Text> : null}
        {interruptHint ? <Text color={theme.dim}>{'  Esc 中断'}</Text> : null}
      </Box>
    );
  }

  // 不足 0.1s 时显示 <0.1s，避免出现无意义的 0.0s
  const seconds =
    elapsedMs === undefined ? null : elapsedMs < 100 ? '<0.1s' : `${(elapsedMs / 1000).toFixed(1)}s`;

  const icon = aborted ? '⏹ ' : failed ? '✗ ' : '✓ ';
  const iconColor = aborted ? theme.warn : failed ? theme.danger : theme.correct;

  return (
    <Box marginTop={1}>
      <Text color={iconColor}>{icon}</Text>
      <Text color={theme.dim}>{doneText ?? '完成'}</Text>
      {seconds ? <Text color={theme.dim}>{`  ${seconds}`}</Text> : null}
      {meta ? <Text color={theme.dim}>{`  ${meta}`}</Text> : null}
    </Box>
  );
}
