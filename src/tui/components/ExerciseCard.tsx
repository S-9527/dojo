import React from 'react';
import { Box, Text } from 'ink';
import type { Exercise } from '../../types.js';
import { DIFFICULTIES, TOPICS } from '../../topics.js';
import { Field, Section } from './base.js';
import { theme } from '../theme.js';

/** 题目卡片。不渲染 reference_answer / explanation，避免自己剧透。 */
export function ExerciseCard({
  exercise,
  index,
  revealed,
  showHints,
}: {
  exercise: Exercise;
  index: number;
  revealed: boolean;
  showHints: boolean;
}): React.JSX.Element {
  const difficult = DIFFICULTIES[exercise.difficulty];

  return (
    <Box flexDirection="column">
      <Box marginTop={1} justifyContent="space-between">
        <Text>
          <Text color={theme.muted}>题目 </Text>
          <Text color={theme.brand} bold>
            {index}
          </Text>
          <Text color={theme.muted}> · </Text>
          <Text color={theme.warn} bold>
            {exercise.title}
          </Text>
        </Text>
        <Text color={theme.dim}>
          {TOPICS[exercise.topic].label} · {difficult.label} · {difficult.points} 分
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Field label="场景" value={exercise.scenario} labelWidth={6} color={theme.muted} />
        <Field label="要求" value={exercise.question} labelWidth={6} color={theme.text} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.dim}>验收点</Text>
        {exercise.acceptance.map((point, i) => (
          <Box key={i}>
            <Text color={theme.dim}>{`  ${i + 1}. `}</Text>
            <Text color={theme.muted}>{point}</Text>
          </Box>
        ))}
      </Box>

      {showHints ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>提示</Text>
          {exercise.hints.map((hint, i) => (
            <Box key={i}>
              <Text color={theme.warn}>{`  ${i + 1}. `}</Text>
              <Text color={theme.muted}>{hint}</Text>
            </Box>
          ))}
        </Box>
      ) : null}

      {revealed ? (
        <Box flexDirection="column" marginTop={1}>
          <Section title="参考答案" color={theme.warn} />
          <Text color={theme.accent}>{`  ${exercise.reference_answer}`}</Text>
          {exercise.explanation ? (
            <Box marginTop={1}>
              <Text color={theme.muted}>{`  ${exercise.explanation}`}</Text>
            </Box>
          ) : null}
          {exercise.common_mistakes.length ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.dim}>  常见错误</Text>
              {exercise.common_mistakes.map((m, i) => (
                <Text key={i} color={theme.dim}>{`    · ${m}`}</Text>
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
