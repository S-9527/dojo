import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme.js';

/**
 * 自实现的单行输入框。
 *
 * 为什么不用 ink-text-input：Ink 的 useInput 是事件广播，没有 stopPropagation，
 * 所有注册了 useInput 的组件都会收到同一个按键。ink-text-input 只拦截
 * ctrl+c / tab / 方向键，其它 ctrl 组合（如 ctrl+g）的字母仍会被插进输入框，
 * 导致按快捷键时输入框里多出 'g'。
 *
 * 这里改为「单一 useInput 统一分发」：先判断是否命中快捷键并消费掉该按键，
 * 否则才当作文本输入。快捷键与文本输入从此天然互斥。
 */
export interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  /** 快捷键回调：返回 true 表示该按键已被消费，不再插入文本。 */
  onShortcut?: (input: string, key: ShortcutKey) => boolean;
  /** 光标是否激活。false 时不接收普通字符，但快捷键仍然可用。 */
  active?: boolean;
}

export interface ShortcutKey {
  ctrl: boolean;
  tab: boolean;
  return: boolean;
  escape: boolean;
  backspace: boolean;
  delete: boolean;
  upArrow: boolean;
  downArrow: boolean;
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  onShortcut,
  active = true,
}: InputBarProps): React.JSX.Element {
  const [cursor, setCursor] = React.useState(value.length);

  // 外部清空/替换 value 时把光标跟到末尾
  React.useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
  }, [value.length]);

  useInput((input, key) => {
    const shortcutKey: ShortcutKey = {
      ctrl: key.ctrl,
      tab: key.tab,
      return: key.return,
      escape: key.escape,
      backspace: key.backspace,
      delete: key.delete,
      upArrow: key.upArrow,
      downArrow: key.downArrow,
    };

    // 快捷键优先，命中即消费，绝不落到文本输入
    if (onShortcut?.(input, shortcutKey)) return;
    if (!active) return;

    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.escape) return;
    // 上下键留给候选菜单导航；菜单没消费时才落到这里，此时不做任何事
    if (key.upArrow || key.downArrow) return;
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      const next = value.slice(0, cursor - 1) + value.slice(cursor);
      onChange(next);
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    // ctrl/meta 组合不是文本，避免把 'a'..'z' 插进输入框
    if (key.ctrl || key.meta) return;
    if (!input) return;

    const next = value.slice(0, cursor) + input + value.slice(cursor);
    onChange(next);
    setCursor((c) => c + input.length);
  });

  const before = value.slice(0, cursor);
  const atCursor = value.slice(cursor, cursor + 1);
  const after = value.slice(cursor + 1);

  return (
    <Box>
      <Text color={theme.brand} bold>
        {'  ❯ '}
      </Text>
      {value.length === 0 ? (
        <Text>
          <Text inverse>{placeholder.slice(0, 1) || ' '}</Text>
          <Text color={theme.dim}>{placeholder.slice(1)}</Text>
        </Text>
      ) : (
        <Text>
          <Text color={theme.text}>{before}</Text>
          <Text inverse>{atCursor || ' '}</Text>
          <Text color={theme.text}>{after}</Text>
        </Text>
      )}
    </Box>
  );
}
