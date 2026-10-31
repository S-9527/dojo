import React from 'react';
import { Box, Text } from 'ink';
import type { Exercise } from '../../types.js';
import { DIFFICULTIES, TOPICS } from '../../topics.js';
import { theme } from '../theme.js';

/**
 * 题目卡片（只负责「题目本身」）。
 *
 * 提示与答案不再写进卡片，而是各自成为独立的块（HintPanel / AnswerPanel）。
 * 原因是卡片会被放进 <Static> 永久写入终端回滚缓冲区，
 * 而 Static 里的内容只渲染一次、之后不再更新 —— 可切换的内容（看答案）
 * 放在里面就不会生效。
 *
 * 另外：不渲染 reference_answer / explanation，避免自己剧透。
 */
export function ExerciseCard({
  exercise,
  index,
}: {
  exercise: Exercise;
  index: number;
}): React.JSX.Element {
  const difficult = DIFFICULTIES[exercise.difficulty];
  const label = (text: string) => (
    <Box width={7} flexShrink={0}>
      <Text color={theme.text.muted}>{text}</Text>
    </Box>
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      marginTop={1}
    >
      <Box justifyContent="space-between">
        <Text>
          <Text color={theme.text.muted}>{`题目 ${index}  `}</Text>
          <Text color={theme.status.warning} bold>
            {exercise.title}
          </Text>
        </Text>
        <Text color={theme.text.muted}>
          {`${TOPICS[exercise.topic].label} · ${difficult.label} · ${difficult.points} 分`}
        </Text>
      </Box>

      {/* 标签列 + 内容列：内容列自己折行，续行才会与文字左边缘对齐 */}
      <Box marginTop={1}>
        {label('场景')}
        <Box flexGrow={1}>
          <Text color={theme.text.secondary}>{exercise.scenario}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        {label('要求')}
        <Box flexGrow={1}>
          <Text color={theme.text.primary}>{exercise.question}</Text>
        </Box>
      </Box>

      {exercise.acceptance.length ? (
        <Box marginTop={1}>
          {label('验收点')}
          <Box flexDirection="column" flexGrow={1}>
            {exercise.acceptance.map((point, i) => (
              <Text key={i} color={theme.text.secondary}>{`${i + 1}. ${point}`}</Text>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
