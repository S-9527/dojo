import React from 'react';
import { Box, Text } from 'ink';
import type { Grade } from '../../types.js';
import { theme, verdictStyle } from '../theme.js';

/** 判题结果面板。 */
export function GradePanel({ grade }: { grade: Grade }): React.JSX.Element {
  const style = verdictStyle[grade.verdict];

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={style.color} paddingX={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text color={style.color} bold>
            {style.icon} {style.label}
          </Text>
        </Text>
        <Text color={theme.muted}>得分 {grade.score}/100</Text>
      </Box>

      <Box marginTop={0} flexDirection="column">
        <Text color={theme.text}>{grade.reason}</Text>
      </Box>

      {grade.corrected_answer ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.dim}>参考写法</Text>
          <Text color={theme.accent}>{`  ${grade.corrected_answer}`}</Text>
        </Box>
      ) : null}

      {grade.knowledge_points.length ? (
        <Box marginTop={1}>
          <Text color={theme.dim}>知识点 </Text>
          <Text color={theme.muted}>{grade.knowledge_points.join(' · ')}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** 提示气泡。 */
export function HintPanel({ text, level, total }: { text: string; level: number; total: number }): React.JSX.Element {
  return (
    <Box marginTop={1} borderStyle="round" borderColor={theme.warn} paddingX={1} flexDirection="column">
      <Text color={theme.warn} bold>
        提示 {level}/{total}
      </Text>
      <Text color={theme.text}>{text}</Text>
    </Box>
  );
}

/** 错误展示。 */
export function ErrorPanel({ message }: { message: string }): React.JSX.Element {
  return (
    <Box marginTop={1} borderStyle="round" borderColor={theme.danger} paddingX={1} flexDirection="column">
      <Text color={theme.danger} bold>
        ✗ 出错了
      </Text>
      <Text color={theme.muted}>{message}</Text>
    </Box>
  );
}



