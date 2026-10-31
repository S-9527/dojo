import React from 'react';
import { Box, Text } from 'ink';
import type { CommandSpec } from '../../commands.js';
import { theme } from '../theme.js';

export interface CommandMenuProps {
  /** 过滤后的候选 */
  items: CommandSpec[];
  /** 当前高亮项的下标 */
  activeIndex: number;
  /** 输入框里的原始内容，用于高亮匹配的前缀 */
  input: string;
  /** 二级补全（例如 /topic 的主题名） */
  argItems?: Array<{ value: string; label: string }>;
}

/**
 * 斜杠指令候选菜单。
 * 上方是候选列表，下方固定显示当前选中项的用法与详细说明，
 * 这样即使候选被过滤到只剩一条，用户也能看到它到底做什么。
 */
export function CommandMenu({ items, activeIndex, input, argItems = [] }: CommandMenuProps): React.JSX.Element {
  const active = items[activeIndex];
  const namePart = input.replace(/^\//, '').split(/\s+/)[0]?.toLowerCase() ?? '';

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
        {items.length === 0 ? (
          argItems.length > 0 ? (
            <Text color={theme.dim}>选择参数值，或直接输入主题名</Text>
          ) : (
            <Text color={theme.dim}>
              {'没有匹配的指令'}
              {namePart ? `（/${namePart}）` : ''}
            </Text>
          )
        ) : (
          items.map((item, i) => {
            const selected = i === activeIndex;
            return (
              <Box key={item.name} justifyContent="space-between">
                <Text>
                  <Text color={selected ? theme.brand : theme.dim}>{selected ? '❯ ' : '  '}</Text>
                  <Text color={selected ? theme.brand : theme.text} bold={selected}>
                    {highlight(item.name, namePart, selected)}
                  </Text>
                  {item.takesArg ? <Text color={theme.dim}>{' <参数>'}</Text> : null}
                </Text>
                <Text color={selected ? theme.muted : theme.dim}>{item.summary}</Text>
              </Box>
            );
          })
        )}
      </Box>

      {active ? (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text>
            <Text color={theme.dim}>{'用法  '}</Text>
            <Text color={theme.accent}>{active.usage}</Text>
          </Text>
          <Box marginTop={0}>
            <Text color={theme.dim}>{'说明  '}</Text>
            <Box flexDirection="column">
              <Text color={theme.muted}>{active.detail}</Text>
            </Box>
          </Box>
        </Box>
      ) : null}

      {argItems.length > 0 ? (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text color={theme.dim}>可选值（Tab 补全第一个）</Text>
          {argItems.map((arg, i) => (
            <Box key={arg.value}>
              <Text color={i === 0 ? theme.brand : theme.dim}>{i === 0 ? '❯ ' : '  '}</Text>
              <Text color={i === 0 ? theme.brand : theme.muted}>{arg.value}</Text>
              <Text color={theme.dim}>{`  ${arg.label}`}</Text>
            </Box>
          ))}
        </Box>
      ) : null}

      <Box marginTop={1} paddingX={1}>
        <Text color={theme.dim}>↑↓ 选择 · Tab / Enter 补全 · Esc 关闭 · 直接继续输入也行</Text>
      </Box>
    </Box>
  );
}

/** 把已输入的前缀用强调色标出，其余保持原色。 */
function highlight(name: string, prefix: string, selected: boolean): React.JSX.Element {
  if (!prefix || !name.toLowerCase().startsWith(prefix)) {
    return <Text>{name}</Text>;
  }
  const head = name.slice(0, prefix.length);
  const tail = name.slice(prefix.length);
  return (
    <Text>
      <Text color={selected ? theme.warn : theme.accent} bold>
        {head}
      </Text>
      <Text color={selected ? theme.brand : theme.text}>{tail}</Text>
    </Text>
  );
}
