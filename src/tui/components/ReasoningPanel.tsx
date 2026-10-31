import React from 'react';
import { Box, Text } from 'ink';
import { ScrollBox } from './ScrollBox.js';
import { theme } from '../theme.js';
import type { ViewportState } from '../scroll.js';

/** 思考区的固定高度：够看几行，又不会把题目和回答挤出屏幕。 */
export const REASONING_VIEWPORT_HEIGHT = 10;

export interface ReasoningPanelProps {
  /** 思考内容；为空则不渲染 */
  text: string;
  /** 是否展开 */
  expanded: boolean;
  /** 展开时的滚动位置 */
  view: ViewportState;
  /** 是否正在生成（影响标题文案） */
  generating?: boolean;
  /** 终端宽度，用于计算折行 */
  width: number;
}

/**
 * 思考过程展示区。
 *
 * 抽成独立组件是因为「练习」和「对话」两个面板都要用它：
 * 之前只有对话面板有这块 UI，导致练习面板按 zo 毫无反应 ——
 * 不是快捷键坏了，而是那里根本没有可展开的内容区。
 */
export function ReasoningPanel({
  text,
  expanded,
  view,
  generating = false,
  width,
}: ReasoningPanelProps): React.JSX.Element | null {
  if (!text) return null;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={2}>
      <Text color={theme.text.muted}>
        {expanded
          ? `▾ 思考过程${generating ? '（生成中…）' : '（已完成）'}  zc 收起`
          : `▸ 思考过程${generating ? '，生成中…' : ''}  zo 展开`}
      </Text>
      {expanded ? (
        <Box paddingLeft={1} flexDirection="column">
          <ScrollBox
            text={text}
            height={REASONING_VIEWPORT_HEIGHT}
            // 扣掉嵌套 padding 与终端余量；给宽了 Ink 会二次折行，视口就守不住
            width={Math.max(16, width - 12)}
            state={view}
          />
          <Text color={theme.text.muted}>{'↑↓ 逐行 · u/d 翻页 · g 顶部 · G 最新 · zo/zc 展开收起'}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
