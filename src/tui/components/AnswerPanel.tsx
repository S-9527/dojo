import React from 'react';
import { Box, Text } from 'ink';
import type { Exercise } from '../../types.js';
import { theme } from '../theme.js';

/**
 * 参考答案块。
 * 单独成块而不是写进题目卡片：卡片在 <Static> 里只渲染一次，
 * 而「看答案」是可切换的交互，必须留在实时区域。
 */
export function AnswerPanel({ exercise }: { exercise: Exercise }): React.JSX.Element {
  const label = (text: string) => (
    <Box width={7} flexShrink={0}>
      <Text color={theme.text.muted}>{text}</Text>
    </Box>
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.warning}
      paddingX={1}
      marginTop={1}
    >
      <Text color={theme.status.warning} bold>
        参考答案
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.code}>{exercise.reference_answer}</Text>
      </Box>
      {exercise.explanation ? (
        <Box marginTop={1}>
          {label('解析')}
          <Box flexGrow={1}>
            <Text color={theme.text.secondary}>{exercise.explanation}</Text>
          </Box>
        </Box>
      ) : null}
      {exercise.common_mistakes.length ? (
        <Box marginTop={1}>
          {label('常见错误')}
          <Box flexDirection="column" flexGrow={1}>
            {exercise.common_mistakes.map((m, i) => (
              <Text key={i} color={theme.text.muted}>{`· ${m}`}</Text>
            ))}
          </Box>
        </Box>
      ) : null}
      {exercise.hints.length ? (
        <Box marginTop={1}>
          {label('提示')}
          <Box flexDirection="column" flexGrow={1}>
            {exercise.hints.map((h, i) => (
              <Text key={i} color={theme.text.muted}>{`${i + 1}. ${h}`}</Text>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
