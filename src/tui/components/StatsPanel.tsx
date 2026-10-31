import React from 'react';
import { Box, Text } from 'ink';
import type { Summary } from '../../types.js';
import { TOPICS } from '../../topics.js';
import { bar, theme } from '../theme.js';
import { Empty, Section } from './base.js';

/** 统计面板：正确率柱状图 + 薄弱点。 */
export function StatsPanel({ summary }: { summary: Summary }): React.JSX.Element {
  if (!summary.total) {
    return (
      <Box flexDirection="column">
        <Section title="学习统计" />
        <Empty>还没有练习记录，先做一道题吧。</Empty>
      </Box>
    );
  }

  const { total, byVerdict, byTopic, avgScore, weakTopics, streak } = summary;
  const rate = total ? byVerdict.correct / total : 0;

  return (
    <Box flexDirection="column">
      <Section title="学习统计" hint={`共 ${total} 题 · 平均 ${avgScore} 分 · 连续 ${streak} 天`} />

      <Box marginTop={1}>
        <Text color={theme.dim}>正确率 </Text>
        <Text color={theme.correct}>{bar(rate, 20)}</Text>
        <Text color={theme.text} bold>{`  ${Math.round(rate * 100)}%`}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.correct}>{`✓ ${byVerdict.correct}`}</Text>
        <Text color={theme.dim}>   </Text>
        <Text color={theme.partial}>{`△ ${byVerdict.partial}`}</Text>
        <Text color={theme.dim}>   </Text>
        <Text color={theme.wrong}>{`✗ ${byVerdict.wrong}`}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>按主题</Text>
        {Object.entries(byTopic).map(([topic, stat]) => {
          if (!stat) return null;
          const topicRate = stat.total ? stat.correct / stat.total : 0;
          const label = TOPICS[topic as keyof typeof TOPICS]?.label ?? topic;
          return (
            <Box key={topic}>
              <Text color={theme.muted}>{label.padEnd(12, ' ')}</Text>
              <Text color={theme.accent}>{bar(topicRate, 12)}</Text>
              <Text color={theme.dim}>{`  ${Math.round(topicRate * 100)}%  ${stat.total} 题`}</Text>
            </Box>
          );
        })}
      </Box>

      {weakTopics.length ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.warn}>建议加强</Text>
          {weakTopics.map((t) => (
            <Text key={t.topic} color={theme.muted}>
              {`  · ${TOPICS[t.topic].label}（${Math.round(t.rate * 100)}%，${t.total} 题）`}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={theme.dim}>按 Tab 回到练习</Text>
      </Box>
    </Box>
  );
}
