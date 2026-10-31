import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';
import { INSERT_KEYS, NORMAL_KEYS, insertHint, normalHint, type Mode } from '../keymap.js';

/**
 * 模式指示条。
 *
 * 模态界面最容易让人困惑的是「我现在在哪个模式、按键会怎样」。
 * 所以这一行始终可见：normal 时列出命令键，insert 时提示怎么退出。
 */
export function ModeBar({ mode, notice }: { mode: Mode; notice?: string }): React.JSX.Element {
  const isNormal = mode === 'normal';
  const color = isNormal ? theme.accent : theme.brand;

  return (
    <Box justifyContent="space-between">
      <Text>
        <Text color={color} bold>
          {` ${isNormal ? 'NORMAL' : 'INSERT'} `}
        </Text>
        <Text color={theme.dim}>{`  ${isNormal ? normalHint(NORMAL_KEYS) : insertHint()}`}</Text>
      </Text>
      {notice ? <Text color={theme.warn}>{notice}</Text> : null}
    </Box>
  );
}

/** 帮助面板：列出当前模式的全部按键。 */
export function KeyHelp({ mode }: { mode: Mode }): React.JSX.Element {
  const keys = mode === 'normal' ? NORMAL_KEYS : INSERT_KEYS;
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Text color={theme.text} bold>
        {mode === 'normal' ? '命令模式按键' : '输入模式按键'}
      </Text>
      <Box flexDirection="column">
        {keys.map((k) => (
          <Box key={k.keys}>
            <Box width={10} flexShrink={0}>
              <Text color={theme.accent}>{k.keys}</Text>
            </Box>
            <Text color={theme.muted}>{k.detail}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>
          {mode === 'normal' ? 'i 进入输入模式 · Esc 中断请求' : 'Esc 回到命令模式'}
        </Text>
      </Box>
    </Box>
  );
}
