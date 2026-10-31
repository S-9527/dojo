import React from 'react';
import { Box, Text } from 'ink';
import type { AskTurn } from '../../types.js';
import { Empty, RichText, Section } from './base.js';
import { ScrollBox } from './ScrollBox.js';
import { theme } from '../theme.js';
import type { ViewportState } from '../scroll.js';

/** 思考区的高度：给问答内容留出空间，同时保证滚动有意义。 */
export const REASONING_VIEWPORT_HEIGHT = 10;

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

      {/* 思考过程：生成中实时流入，结束后仍可展开与滚动 */}
      {reasoning ? (
        <Box flexDirection="column" marginTop={1} paddingLeft={2}>
          <Text color={theme.dim}>
            {showReasoning
              ? `▾ 思考过程${generating ? '（生成中…）' : '（已完成）'}  zc 收起`
              : `▸ 思考过程${generating ? '，生成中…' : ''}  zo 展开`}
          </Text>
          {showReasoning ? (
            <Box paddingLeft={1} flexDirection="column">
              <ScrollBox
                text={reasoning}
                height={REASONING_VIEWPORT_HEIGHT}
                // 必须扣掉：Frame paddingX(2) + 外层 paddingLeft(2) + 内层 paddingLeft(1) + 余量
                // 给宽了 Ink 会二次折行，10 行窗口会变成 20 行把屏幕顶掉
                width={Math.max(16, width - 16)}
                state={reasoningView}
              />
              <Text color={theme.dim}>
                {'↑↓ 逐行 · u/d 翻页 · g 顶部 · G 最新 · zo/zc 展开收起'}
              </Text>
            </Box>
          ) : null}
        </Box>
      ) : null}

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
