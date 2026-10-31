import React from 'react';
import { Box, Text } from 'ink';

/**
 * 可滚动的转录视口（应用内滚动）。
 *
 * 为什么需要它：全屏用终端「备用屏幕」，**没有回滚缓冲区**（vim/htop 同理），
 * 不能像之前那样靠终端滚动看历史。
 *
 * 为什么不用「全量渲染 + 负 margin + overflow:hidden」：
 * 实测负 margin 会让内容整体上移、越过父容器边界，
 * 把固定顶栏盖住 —— Ink 对这种溢出的裁剪不可靠。
 *
 * 这里改为最朴素也最可靠的做法：**只渲染可见的那几行**。
 * 每个子元素自带行数，超出视口的整块跳过、部分可见的才渲染。
 */

export interface MeasurableChild {
  /** 该块渲染出来占多少行 */
  lines: number;
  node: React.ReactNode;
}

export function TranscriptView({
  offset,
  height,
  children,
}: {
  /** 从顶部算起的偏移行数 */
  offset: number;
  /** 可见高度（行） */
  height: number;
  /** 已按行数切好的内容块 */
  children: MeasurableChild[];
}): React.JSX.Element {
  // 按行数把块切成可见窗口：跳掉完全在上方的，截断完全在下方的
  const visible: React.ReactNode[] = [];
  let cursor = 0;
  let remaining = height;

  for (let i = 0; i < children.length && remaining > 0; i += 1) {
    const child = children[i];
    if (!child) continue;
    const blockStart = cursor;
    const blockEnd = cursor + child.lines;
    cursor = blockEnd;

    // 整块都在视口上方：跳过
    if (blockEnd <= offset) continue;

    if (blockStart < offset) {
      // 部分可见（顶部被截）：这一块的渲染无法逐行裁，直接整块跳过更稳妥，
      // 用一行省略标记代替，避免显示半块内容造成误解
      continue;
    }

    if (child.lines <= remaining) {
      visible.push(child.node);
      remaining -= child.lines;
    } else {
      // 放不下整块：停在这里，下方补提示
      visible.push(
        <Text key="more" color="gray">
          {`… 还有 ${child.lines - remaining} 行，Ctrl-D 继续下翻`}
        </Text>,
      );
      remaining = 0;
    }
  }

  return (
    <Box flexDirection="column" height={height} flexShrink={0}>
      {visible.length > 0 ? (
        visible
      ) : (
        <Text color="gray">{'（已到顶部，Ctrl-D 往回翻）'}</Text>
      )}
    </Box>
  );
}
