import React from 'react';
import { Box, Text } from 'ink';
import { theme, wrapText } from '../theme.js';

/** 应用外壳：顶栏 + 主体 + 底部快捷键。 */
export function Frame({
  title,
  status,
  footer,
  footerSuffix,
  children,
}: {
  title: string;
  status: React.ReactNode;
  /** 底部主行：模式指示等长期可见的信息 */
  footer: React.ReactNode;
  /** 底部附加行：上下文相关的临时提示（可为空） */
  footerSuffix?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={theme.border}
        borderBottom={false}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text>
          <Text color={theme.brand} bold>
            ◆ dojo
          </Text>
        </Text>
        <Text color={theme.muted}>{status}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {children}
      </Box>
      <Box paddingX={1} flexDirection="column">
        {footer}
        {footerSuffix ? <Text color={theme.dim}>{footerSuffix}</Text> : null}
      </Box>
    </Box>
  );
}

/** 分节标题：左侧强调竖条 + 标题 + 右侧灰色说明。 */
export function Section({
  title,
  hint,
  color = theme.accent,
}: {
  title: string;
  hint?: string;
  color?: string;
}): React.JSX.Element {
  return (
    <Box marginTop={1} marginBottom={0} justifyContent="space-between">
      <Text>
        <Text color={color}>▌ </Text>
        <Text color={theme.text} bold>
          {title}
        </Text>
      </Text>
      {hint ? <Text color={theme.dim}>{hint}</Text> : null}
    </Box>
  );
}

/** 键值行：左侧固定宽度标签，右侧自动换行。 */
export function Field({
  label,
  value,
  labelWidth = 6,
  color = theme.text,
}: {
  label: string;
  value: string;
  labelWidth?: number;
  color?: string;
}): React.JSX.Element {
  return (
    <Box>
      <Box width={labelWidth} flexShrink={0}>
        <Text color={theme.dim}>{label}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Text color={color}>{value}</Text>
      </Box>
    </Box>
  );
}

/** 代码/命令行：等宽感的前缀 + 高亮内容。 */
export function CodeLine({ children, prefix = '│' }: { children: string; prefix?: string }): React.JSX.Element {
  return (
    <Box>
      <Text color={theme.dim}>{prefix} </Text>
      <Text color={theme.accent}>{children}</Text>
    </Box>
  );
}

/** 渲染可能含 ``` 代码块的模型回复。 */
export function RichText({ text, width }: { text: string; width: number }): React.JSX.Element {
  const blocks: React.JSX.Element[] = [];
  let inCode = false;
  let buffer: string[] = [];
  let key = 0;

  const flush = () => {
    if (!buffer.length) return;
    const lines = buffer;
    buffer = [];
    const joined = inCode ? lines.join('\n') : lines.join('\n');
    const wrapped = wrapText(joined, Math.max(10, width - 2));
    blocks.push(
      <Box key={`b${key++}`} flexDirection="column">
        {wrapped.map((line, i) => (
          <Text key={i} color={inCode ? theme.accent : theme.text}>
            {line || ' '}
          </Text>
        ))}
      </Box>,
    );
  };

  for (const raw of text.split('\n')) {
    if (raw.trim().startsWith('```')) {
      flush();
      inCode = !inCode;
      continue;
    }
    buffer.push(raw);
  }
  flush();

  return <Box flexDirection="column">{blocks}</Box>;
}

/** 空状态提示。 */
export function Empty({ children }: { children: string }): React.JSX.Element {
  return (
    <Box marginTop={1}>
      <Text color={theme.dim}>{children}</Text>
    </Box>
  );
}
