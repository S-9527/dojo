import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme.js';

/**
 * 单行输入框，**只在 insert 模式下工作**。
 *
 * 模态之后这里不再需要拦截快捷键：
 * normal 模式由 App 统一处理（那时本组件 isActive=false），
 * 所以「按快捷键却把字母打进输入框」这类问题在设计上就不存在了。
 */
export interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  /** 回车提交 */
  onSubmit: (value: string) => void;
  /** Esc：回到命令模式 */
  onEscape: () => void;
  /** Ctrl-C：退出程序（insert 模式下 App 收不到按键，所以这里转发） */
  onQuit?: () => void;
  placeholder?: string;
  /** 是否处于输入模式 */
  active?: boolean;
  /** 前缀提示符，默认 ❯ */
  prompt?: string;
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  onEscape,
  onQuit,
  placeholder = '',
  active = true,
  prompt = '❯ ',
}: InputBarProps): React.JSX.Element {
  const [cursor, setCursor] = React.useState(value.length);

  // 外部替换/清空内容时把光标收进合法范围
  React.useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
  }, [value.length]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        onQuit?.();
        return;
      }
      if (key.escape) {
        onEscape();
        return;
      }
      if (key.return) {
        onSubmit(value);
        return;
      }
      // 上下键在输入行里没有意义（历史由 normal 模式管理），忽略即可
      if (key.upArrow || key.downArrow || key.tab) return;
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
        onChange(value.slice(0, cursor - 1) + value.slice(cursor));
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      // ctrl/meta 组合不是文本，避免把 'a'..'z' 打进输入框
      if (key.ctrl || key.meta) return;
      if (!input) return;

      onChange(value.slice(0, cursor) + input + value.slice(cursor));
      setCursor((c) => c + input.length);
    },
    { isActive: active },
  );

  const before = value.slice(0, cursor);
  const atCursor = value.slice(cursor, cursor + 1);
  const after = value.slice(cursor + 1);

  return (
    <Box>
      <Text color={active ? theme.brand : theme.dim} bold>
        {`  ${prompt}`}
      </Text>
      {!active ? (
        // 命令模式下不显示光标，明确「现在打字不会进去」
        <Text color={theme.dim}>{value || placeholder}</Text>
      ) : value.length === 0 ? (
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
