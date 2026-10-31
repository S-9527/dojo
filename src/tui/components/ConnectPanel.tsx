import React from 'react';
import { Box, Text, useInput } from 'ink';
import { PROVIDER_PRESETS, configPath, maskKey, type ProviderPreset } from '../../config.js';
import { describeProbe, probeConnection, type ProbeResult } from '../../probe.js';
import type { ResolvedConfig } from '../../types.js';
import { InputBar, type ShortcutKey } from './InputBar.js';
import { theme } from '../theme.js';

export interface ConnectionDraft {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 选中的预设 id，自定义时为 custom */
  providerId: string;
}

export type ConnectStep = 'provider' | 'baseUrl' | 'apiKey' | 'model' | 'testing' | 'done';

export interface ConnectPanelProps {
  /** 当前生效的配置，作为默认值 */
  config: ResolvedConfig;
  draft: ConnectionDraft;
  step: ConnectStep;
  /** 服务商列表里的选中下标 */
  providerIndex: number;
  probe: ProbeResult | null;
  error: string | null;
  input: string;
  setInput: (value: string) => void;
  onShortcut: (input: string, key: ShortcutKey) => boolean;
  onSubmit: (value: string) => void;
  onRetest: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const STEP_ORDER: ConnectStep[] = ['provider', 'baseUrl', 'apiKey', 'model', 'done'];
const STEP_LABEL: Record<ConnectStep, string> = {
  provider: '选服务商',
  baseUrl: '接口地址',
  apiKey: 'API Key',
  model: '模型名',
  testing: '测试连接',
  done: '完成',
};

/** 步骤进度条：①选服务商 ②地址 ③Key ④模型 ⑤测试 */
function StepBar({ step }: { step: ConnectStep }): React.JSX.Element {
  const currentIndex = STEP_ORDER.indexOf(step === 'testing' ? 'done' : step);
  return (
    <Box>
      {STEP_ORDER.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const color = done ? theme.correct : active ? theme.brand : theme.dim;
        return (
          <Box key={s} marginRight={2}>
            <Text color={color}>
              {done ? '✓' : active ? '●' : '○'} {STEP_LABEL[s]}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * /connect 向导。
 *
 * 为什么分步而不是一行填三个值：
 *   - API Key 需要掩码显示，混在一起没法确认到底粘对没有；
 *   - 每一步都能看到当前值来自哪里（预设/环境变量/配置文件）；
 *   - 保存前能强制跑一次连接测试，避免存下一份不可用的配置。
 */
export function ConnectPanel({
  config,
  draft,
  step,
  providerIndex,
  probe,
  error,
  input,
  setInput,
  onShortcut,
  onSubmit,
  onRetest,
  onSave,
  onCancel,
}: ConnectPanelProps): React.JSX.Element {
  // 这几个步骤没有输入框，必须由面板自己接收按键，
  // 否则 Tab/↑↓/Enter 会完全没有响应（Ink 的按键只在有 useInput 时才被消费）。
  const hasInputBar = step === 'baseUrl' || step === 'apiKey' || step === 'model';
  useInput(
    (input, key) => {
      onShortcut(input, {
        ctrl: key.ctrl,
        tab: key.tab,
        return: key.return,
        escape: key.escape,
        backspace: key.backspace,
        delete: key.delete,
        upArrow: key.upArrow,
        downArrow: key.downArrow,
      });
    },
    { isActive: !hasInputBar },
  );

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={theme.accent} paddingX={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>
          连接大模型
        </Text>
        <Text color={theme.dim}>Esc 取消</Text>
      </Box>

      <Box marginTop={0}>
        <StepBar step={step} />
      </Box>

      {step === 'provider' ? (
        <ProviderStep providerIndex={providerIndex} />
      ) : null}

      {step === 'baseUrl' ? (
        <FieldStep
          title="接口地址（BASE_URL）"
          hint="通常以 /v1 结尾。留空回车使用当前值。"
          current={draft.baseUrl}
          input={input}
          setInput={setInput}
          onShortcut={onShortcut}
          onSubmit={onSubmit}
          placeholder={draft.baseUrl || config.baseUrl}
        />
      ) : null}

      {step === 'apiKey' ? (
        <KeyStep
          input={input}
          setInput={setInput}
          onShortcut={onShortcut}
          onSubmit={onSubmit}
          hasExisting={Boolean(draft.apiKey)}
          masked={maskKey(draft.apiKey)}
        />
      ) : null}

      {step === 'model' ? (
        <FieldStep
          title="模型名（MODEL）"
          hint="例如 deepseek-chat、qwen2.5:7b。留空回车使用当前值。"
          current={draft.model}
          input={input}
          setInput={setInput}
          onShortcut={onShortcut}
          onSubmit={onSubmit}
          placeholder={draft.model || config.model}
        />
      ) : null}

      {step === 'testing' ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.accent}>正在测试连接…</Text>
        </Box>
      ) : null}

      {step === 'done' ? (
        <Box flexDirection="column" marginTop={1}>
          <Summary draft={draft} config={config} />
          {probe ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={probe.ok ? theme.correct : theme.danger}>
                {probe.ok ? '✓ ' : '✗ '}
                {describeProbe(probe)}
              </Text>
            </Box>
          ) : null}
          {error ? (
            <Box marginTop={1}>
              <Text color={theme.danger}>{error}</Text>
            </Box>
          ) : null}
          <Box marginTop={1}>
            <Text color={theme.dim}>
              {probe?.ok
                ? 'Enter 保存并应用 · T 重新测试 · Esc 取消'
                : 'T 重新测试 · S 仍然保存 · Esc 取消'}
            </Text>
          </Box>
        </Box>
      ) : null}

      {error && step !== 'done' ? (
        <Box marginTop={1}>
          <Text color={theme.danger}>{error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** 第一步：选服务商。 */
function ProviderStep({ providerIndex }: { providerIndex: number }): React.JSX.Element {
  const items: Array<ProviderPreset & { custom?: boolean }> = [
    ...PROVIDER_PRESETS,
    {
      id: 'custom',
      name: '自定义',
      baseUrl: '',
      model: '',
      needsKey: true,
      note: '手动填写任意 OpenAI 兼容地址',
      custom: true,
    },
  ];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.dim}>选择服务商（↑↓ 选择，Enter 确认）</Text>
      {items.map((item, i) => {
        const selected = i === providerIndex;
        return (
          <Box key={item.id} justifyContent="space-between">
            <Text>
              <Text color={selected ? theme.brand : theme.dim}>{selected ? '❯ ' : '  '}</Text>
              <Text color={selected ? theme.brand : theme.text} bold={selected}>
                {item.name}
              </Text>
              {item.needsKey ? null : <Text color={theme.dim}>{'  （无需 Key）'}</Text>}
            </Text>
            <Text color={theme.dim}>{item.note}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

/** 通用文本输入步骤。 */
function FieldStep({
  title,
  hint,
  current,
  input,
  setInput,
  onShortcut,
  onSubmit,
  placeholder,
}: {
  title: string;
  hint: string;
  current: string;
  input: string;
  setInput: (v: string) => void;
  onShortcut: (input: string, key: ShortcutKey) => boolean;
  onSubmit: (v: string) => void;
  placeholder: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.text} bold>
        {title}
      </Text>
      <Text color={theme.dim}>{hint}</Text>
      <Box marginTop={0}>
        <Text color={theme.dim}>当前 </Text>
        <Text color={theme.muted}>{current || '（空）'}</Text>
      </Box>
      <Box marginTop={1}>
        <InputBar
          value={input}
          onChange={setInput}
          onSubmit={onSubmit}
          onShortcut={onShortcut}
          placeholder={placeholder}
          active
        />
      </Box>
      <Box>
        <Text color={theme.dim}>留空回车 = 保持当前值</Text>
      </Box>
    </Box>
  );
}

/** Key 输入步骤：掩码显示，并说明会写到哪。 */
function KeyStep({
  input,
  setInput,
  onShortcut,
  onSubmit,
  hasExisting,
  masked,
}: {
  input: string;
  setInput: (v: string) => void;
  onShortcut: (input: string, key: ShortcutKey) => boolean;
  onSubmit: (v: string) => void;
  hasExisting: boolean;
  masked: string;
}): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.text} bold>
        API Key
      </Text>
      <Text color={theme.dim}>粘贴后回车。留空回车表示沿用当前 Key。</Text>
      {hasExisting ? (
        <Box>
          <Text color={theme.dim}>当前 </Text>
          <Text color={theme.muted}>{masked}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <MaskedInput value={input} onChange={setInput} onSubmit={onSubmit} onShortcut={onShortcut} />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>
          Key 会写入 {configPath()}（权限 0600）。用环境变量 DOJO_API_KEY 则不会落盘。
        </Text>
      </Box>
    </Box>
  );
}

/** 掩码输入：只显示末尾 4 位，避免肩窥和截图泄露。 */
function MaskedInput({
  value,
  onChange,
  onSubmit,
  onShortcut,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onShortcut: (input: string, key: ShortcutKey) => boolean;
}): React.JSX.Element {
  const visible = value.length <= 4 ? value : `••••••${value.slice(-4)}`;
  return (
    <Box flexDirection="column">
      <InputBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onShortcut={onShortcut}
        placeholder="sk-…"
        active
      />
      <Box>
        <Text color={theme.dim}>{`  显示为 ${visible || '（空）'}`}</Text>
      </Box>
    </Box>
  );
}

/** 完成页的配置摘要。 */
function Summary({ draft, config }: { draft: ConnectionDraft; config: ResolvedConfig }): React.JSX.Element {
  const rows: Array<[string, string]> = [
    ['接口', draft.baseUrl || config.baseUrl],
    ['模型', draft.model || config.model],
    ['Key', draft.apiKey ? maskKey(draft.apiKey) : '（沿用现有）'],
  ];
  return (
    <Box flexDirection="column">
      {rows.map(([key, value]) => (
        <Box key={key}>
          <Box width={6} flexShrink={0}>
            <Text color={theme.dim}>{key}</Text>
          </Box>
          <Text color={theme.text}>{value}</Text>
        </Box>
      ))}
    </Box>
  );
}
