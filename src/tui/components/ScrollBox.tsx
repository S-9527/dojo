import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';
import { displayWidth, visibleWindow, wrapToLines, type ViewportState } from '../scroll.js';

/** 按显示列截断，超出部分用 … 表示。 */
function truncateToWidth(text: string, max: number): string {
  if (displayWidth(text) <= max) return text;
  let out = '';
  let w = 0;
  for (const ch of text) {
    const cw = displayWidth(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return `${out}…`;
}

/**
 * 只渲染可见窗口的文本区域。
 *
 * 为什么不用 Ink 的 overflow 裁剪：Ink 会把整棵组件树渲染成字符串再裁，
 * 思考过程动辄几千字，全量渲染会明显卡顿。这里先算好窗口，只输出窗口内的行。
 */
export function ScrollBox({
  text,
  height,
  width,
  state,
  title,
  color = theme.text.muted,
}: {
  text: string;
  height: number;
  width: number;
  state: ViewportState;
  /** 左上角标题，例如「思考过程」 */
  title?: string;
  color?: string;
}): React.JSX.Element {
  const allLines = wrapToLines(text, width);
  const win = visibleWindow(allLines, height, state);

  return (
    <Box flexDirection="column">
      {title ? (
        <Box justifyContent="space-between">
          <Text color={theme.text.muted}>{title}</Text>
          <Text color={theme.text.muted}>
            {win.hiddenAbove > 0 ? `↑ ${win.hiddenAbove} 行` : ''}
            {win.hiddenAbove > 0 && win.hiddenBelow > 0 ? ' · ' : ''}
            {win.hiddenBelow > 0 ? `↓ ${win.hiddenBelow} 行` : ''}
            {win.hiddenAbove === 0 && win.hiddenBelow === 0 ? '' : '  '}
          </Text>
        </Box>
      ) : null}

      {/*
        限制行数的两道保险：
        1) 只渲染窗口内的行（上面已经算好）
        2) 每行用 wrap="truncate-end" 强制单行 —— 只要有一行被 Ink 折成两行，
           总行数就会超出 height，把下面的内容顶掉。
      */}
      <Box flexDirection="column" height={height} flexShrink={0} overflow="hidden">
        {win.lines.map((line, i) => (
          // 硬截断到 width 列：即使 Ink 想再折行也没有空间，保证「一行就是一行」
          <Box key={`${win.start}-${i}`} height={1} flexShrink={0} overflow="hidden">
            <Text color={color} wrap="truncate-end">
              {truncateToWidth(line || ' ', width)}
            </Text>
          </Box>
        ))}
        {/* 内容不足时补空行，保证占位稳定，避免布局跳动 */}
        {Array.from({ length: Math.max(0, height - win.lines.length) }, (_, i) => (
          <Text key={`pad-${i}`}> </Text>
        ))}
      </Box>
    </Box>
  );
}
