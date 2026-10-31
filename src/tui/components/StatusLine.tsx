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
}

export function StatusLine({
  busyText,
  done = false,
  doneText,
  elapsedMs,
  meta,
  failed = false,
}: StatusLineProps): React.JSX.Element {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, [done]);

  if (!done) {
    return (
      <Box marginTop={1}>
        <Text color={theme.accent}>{FRAMES[frame]} </Text>
        <Text color={theme.muted}>{busyText}…</Text>
      </Box>
    );
  }

  // 不足 0.1s 时显示 <0.1s，避免出现无意义的 0.0s
  const seconds =
    elapsedMs === undefined ? null : elapsedMs < 100 ? '<0.1s' : `${(elapsedMs / 1000).toFixed(1)}s`;

  return (
    <Box marginTop={1}>
      <Text color={failed ? theme.danger : theme.correct}>{failed ? '✗ ' : '✓ '}</Text>
      <Text color={theme.dim}>{doneText ?? '完成'}</Text>
      {seconds ? <Text color={theme.dim}>{`  ${seconds}`}</Text> : null}
      {meta ? <Text color={theme.dim}>{`  ${meta}`}</Text> : null}
    </Box>
  );
}
