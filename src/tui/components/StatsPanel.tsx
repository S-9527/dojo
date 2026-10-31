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
        <Text color={theme.text.muted}>正确率 </Text>
        <Text color={theme.status.success}>{bar(rate, 20)}</Text>
        <Text color={theme.text.primary} bold>{`  ${Math.round(rate * 100)}%`}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.status.success}>{`✓ ${byVerdict.correct}`}</Text>
        <Text color={theme.text.muted}>   </Text>
        <Text color={theme.status.warning}>{`△ ${byVerdict.partial}`}</Text>
        <Text color={theme.text.muted}>   </Text>
        <Text color={theme.status.error}>{`✗ ${byVerdict.wrong}`}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.muted}>按主题</Text>
        {Object.entries(byTopic).map(([topic, stat]) => {
          if (!stat) return null;
          const topicRate = stat.total ? stat.correct / stat.total : 0;
          const label = TOPICS[topic as keyof typeof TOPICS]?.label ?? topic;
          return (
            <Box key={topic}>
              <Text color={theme.text.secondary}>{label.padEnd(12, ' ')}</Text>
              <Text color={theme.text.accent}>{bar(topicRate, 12)}</Text>
              <Text color={theme.text.muted}>{`  ${Math.round(topicRate * 100)}%  ${stat.total} 题`}</Text>
            </Box>
          );
        })}
      </Box>

      {weakTopics.length ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.status.warning}>建议加强</Text>
          {weakTopics.map((t) => (
            <Text key={t.topic} color={theme.text.secondary}>
              {`  · ${TOPICS[t.topic].label}（${Math.round(t.rate * 100)}%，${t.total} 题）`}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={theme.text.muted}>按 Tab 回到练习</Text>
      </Box>
    </Box>
  );
}
