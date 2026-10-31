import React from 'react';
import { Box, Text } from 'ink';
import type { AskTurn } from '../../types.js';
import { Empty, RichText, Section } from './base.js';
import { ReasoningPanel } from './ReasoningPanel.js';
import { theme } from '../theme.js';
import type { ViewportState } from '../scroll.js';

export interface ChatPanelProps {
  history: AskTurn[];
  streaming: string;
  /** 正在生成的思考过程（流式） */
  reasoning?: string;
  /** 是否展开思考过程 */
  showReasoning?: boolean;
  /** 展开时的滚动位置（流式生成中用它滚动查看） */
  reasoningView?: ViewportState;
  width: number;
  maxTurns?: number;
  /** 是否正在生成（用于标题文案） */
  generating?: boolean;
}

/**
 * 对话面板：历史问答 + 正在流式输出的回答 + 可滚动的思考过程。
 *
 * 思考过程的两种形态：
 *   · 生成中：实时流入，可展开并滚动查看（默认跟随底部，向上翻即接管）
 *   · 已完成：折叠成一行，展开看末尾摘要，避免长历史撑爆屏幕
 */
export function ChatPanel({
  history,
  streaming,
  reasoning = '',
  showReasoning = false,
  reasoningView = { offset: null },
  width,
  maxTurns = 4,
  generating = false,
}: ChatPanelProps): React.JSX.Element {
  const shown = history.slice(-maxTurns);
  const innerWidth = Math.max(20, width - 6);

  return (
    <Box flexDirection="column">
      <Section title="向助教提问" hint="Enter 发送 · Esc 返回 · 回答不会直接给当前题答案" />

      {shown.length === 0 && !streaming && !reasoning ? (
        <Empty>还没有对话。输入问题后回车，例如「sort -rn 和 sort -n 有什么区别？」</Empty>
      ) : null}

      {shown.map((turn, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Box>
            <Text color={theme.brand} bold>
              {'你 ❯ '}
            </Text>
            <Text color={theme.text}>{turn.q}</Text>
          </Box>
          <Box marginTop={0}>
            <Text color={theme.accent}>{'助教  '}</Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            <RichText text={turn.a} width={innerWidth} />
          </Box>
        </Box>
      ))}

      <ReasoningPanel
        text={reasoning}
        expanded={showReasoning}
        view={reasoningView}
        generating={generating}
        width={width}
      />

      {streaming ? (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color={theme.accent}>{'助教  '}</Text>
            <Text color={theme.dim}>输出中…</Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            <RichText text={streaming} width={innerWidth} />
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
