import React from 'react';
import { Box, Text } from 'ink';
import type { Exercise } from '../../types.js';
import { DIFFICULTIES, TOPICS } from '../../topics.js';
import { theme } from '../theme.js';

/**
 * 题目卡片。
 *
 * 用圆角边框把题目从其余内容里框出来（参考 Gemini CLI 的 Banner 做法）：
 * 之前是一堆平铺的键值行，题目、状态、回答挤在一起，很难一眼看出边界。
 * 边框承担「这是一道题」的视觉锚点。
 *
 * 注意：不渲染 reference_answer / explanation，避免自己剧透。
 */
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
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      marginTop={1}
    >
      {/* 标题行：题号与题目名靠左，元信息靠右 */}
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

      {/* 场景与要求用「标签列 + 内容列」两栏排版：
          内容列自己负责折行，折行后才会与文字左边缘对齐，而不是顶到最左边 */}
      <Box marginTop={1}>
        <Box width={7} flexShrink={0}>
          <Text color={theme.text.muted}>场景</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={theme.text.secondary}>{exercise.scenario}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Box width={7} flexShrink={0}>
          <Text color={theme.text.muted}>要求</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={theme.text.primary}>{exercise.question}</Text>
        </Box>
      </Box>

      {/* 验收点 */}
      {exercise.acceptance.length ? (
        <Box marginTop={1}>
          <Box width={7} flexShrink={0}>
            <Text color={theme.text.muted}>验收点</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {exercise.acceptance.map((point, i) => (
              <Text key={i} color={theme.text.secondary}>{`${i + 1}. ${point}`}</Text>
            ))}
          </Box>
        </Box>
      ) : null}

      {showHints ? (
        <Box marginTop={1}>
          <Box width={7} flexShrink={0}>
            <Text color={theme.text.muted}>提示</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            {exercise.hints.map((hint, i) => (
              <Text key={i} color={theme.status.warning}>{`${i + 1}. ${hint}`}</Text>
            ))}
          </Box>
        </Box>
      ) : null}

      {revealed ? (
        <Box marginTop={1}>
          <Box width={7} flexShrink={0}>
            <Text color={theme.text.muted}>答案</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Text color={theme.text.code}>{exercise.reference_answer}</Text>
            {exercise.explanation ? (
              <Box marginTop={1}>
                <Text color={theme.text.secondary}>{exercise.explanation}</Text>
              </Box>
            ) : null}
            {exercise.common_mistakes.length ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color={theme.text.muted}>常见错误</Text>
                {exercise.common_mistakes.map((m, i) => (
                  <Text key={i} color={theme.text.muted}>{`· ${m}`}</Text>
                ))}
              </Box>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
