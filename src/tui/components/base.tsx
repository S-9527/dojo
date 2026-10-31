import React from 'react';
import { Box, Text } from 'ink';
import { theme, wrapText } from '../theme.js';

/**
 * 终端总行数。
 * 根容器必须显式给高度：Ink 里 height="100%" 对根 Box 不生效，
 * 不给的话底栏会浮在屏幕中间、下方留一片空白。
 */
function terminalRows(): number {
  return process.stdout.rows ?? 24;
}

/** 应用外壳：顶栏 + 主体 + 底部快捷键。 */
export function Frame({
  title,
  status,
  hideHeader = false,
  footer,
  footerSuffix,
  children,
}: {
  /** 标题可选：品牌名只在启动时打印一次（放进转录），实时区域不再固定显示 */
  title?: string;
  status: React.ReactNode;
  /** 调用方自己画了顶栏时置 true，避免重复 */
  hideHeader?: boolean;
  /** 底部主行：模式指示等长期可见的信息 */
  footer: React.ReactNode;
  /** 底部附加行：上下文相关的临时提示（可为空） */
  footerSuffix?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    // 撑满整个终端高度：全屏模式下底栏必须贴在最下面，
    // 否则会浮在屏幕中间、下方留一片空白
    <Box flexDirection="column" height={terminalRows()}>
      {!hideHeader ? (
        <Box paddingX={1} justifyContent="space-between" flexShrink={0}>
          <Text>
            {title ? (
              <Text color={theme.text.brand} bold>
                {`◆ ${title}`}
              </Text>
            ) : null}
          </Text>
          <Text color={theme.text.secondary}>{status}</Text>
        </Box>
      ) : null}
      {/* 主体：撑满剩余空间，内部再自行分配（转录区弹性、实时区自然高度） */}
      <Box flexDirection="column" paddingX={1} flexGrow={1} flexShrink={1} minHeight={0}>
        {children}
      </Box>
      <Box paddingX={1} flexDirection="column" flexShrink={0}>
        {footer}
        {footerSuffix ? <Text color={theme.text.muted}>{footerSuffix}</Text> : null}
      </Box>
    </Box>
  );
}

/** 分节标题：左侧强调竖条 + 标题 + 右侧灰色说明。 */
export function Section({
  title,
  hint,
  color = theme.text.accent,
}: {
  title: string;
  hint?: string;
  color?: string;
}): React.JSX.Element {
  return (
    <Box marginTop={1} marginBottom={0} justifyContent="space-between">
      <Text>
        <Text color={color}>▌ </Text>
        <Text color={theme.text.primary} bold>
          {title}
        </Text>
      </Text>
      {hint ? <Text color={theme.text.muted}>{hint}</Text> : null}
    </Box>
  );
}

/** 键值行：左侧固定宽度标签，右侧自动换行。 */
export function Field({
  label,
  value,
  labelWidth = 6,
  color = theme.text.primary,
}: {
  label: string;
  value: string;
  labelWidth?: number;
  color?: string;
}): React.JSX.Element {
  return (
    <Box>
      <Box width={labelWidth} flexShrink={0}>
        <Text color={theme.text.muted}>{label}</Text>
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
      <Text color={theme.text.muted}>{prefix} </Text>
      <Text color={theme.text.accent}>{children}</Text>
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
          <Text key={i} color={inCode ? theme.text.accent : theme.text.primary}>
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
      <Text color={theme.text.muted}>{children}</Text>
    </Box>
  );
}
