/**
 * /connect 的状态机。
 * 抽成 hook 是为了让 App.tsx 保持可读——向导有 5 步、3 种按键分支，
 * 塞进主组件会把状态机逻辑和渲染搅在一起。
 */
import React from 'react';
import { PROVIDER_PRESETS, configPath, loadConfigFile, resolveConfig, saveConfigFile } from '../config.js';
import { probeConnection, type ProbeResult } from '../probe.js';
import type { ResolvedConfig } from '../types.js';
import type { ConnectStep, ConnectionDraft } from '../tui/components/ConnectPanel.js';

export interface UseConnectOptions {
  config: ResolvedConfig;
  /** 保存成功后回调，让外层替换 Tutor 并刷新状态栏 */
  onApplied: (next: ResolvedConfig, message: string) => void;
}

export interface ConnectState {
  active: boolean;
  step: ConnectStep;
  draft: ConnectionDraft;
  providerIndex: number;
  input: string;
  probe: ProbeResult | null;
  error: string | null;
  setInput: (v: string) => void;
  open: () => void;
  cancel: () => void;
  submit: (value: string) => void;
  /** 上下键：仅在选服务商步骤生效 */
  move: (delta: number) => boolean;
  retest: () => void;
  save: () => void;
}

const STEP_SEQUENCE: ConnectStep[] = ['provider', 'baseUrl', 'apiKey', 'model'];

export function useConnect({ config, onApplied }: UseConnectOptions): ConnectState {
  const [active, setActive] = React.useState(false);
  const [step, setStep] = React.useState<ConnectStep>('provider');
  const [providerIndex, setProviderIndex] = React.useState(0);
  const [input, setInput] = React.useState('');
  const [probe, setProbe] = React.useState<ProbeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 草稿在打开时才初始化，保证每次都是当前生效的配置
  const [draft, setDraft] = React.useState<ConnectionDraft>({
    baseUrl: '',
    apiKey: '',
    model: '',
    providerId: 'custom',
  });

  const open = React.useCallback(() => {
    // 优先用配置文件里的真实值，而不是可能被环境变量覆盖的合并结果：
    // 这里编辑的是「要写进文件的东西」。
    const file = loadConfigFile();
    setDraft({
      baseUrl: file.baseUrl ?? config.baseUrl,
      apiKey: file.apiKey ?? config.apiKey,
      model: file.model ?? config.model,
      providerId: 'custom',
    });
    setStep('provider');
    setProviderIndex(0);
    setInput('');
    setProbe(null);
    setError(null);
    setActive(true);
  }, [config]);

  const cancel = React.useCallback(() => {
    setActive(false);
    setStep('provider');
    setInput('');
    setProbe(null);
    setError(null);
  }, []);

  const move = React.useCallback(
    (delta: number): boolean => {
      if (!active || step !== 'provider') return false;
      // 预设数 + 1 个「自定义」
      const total = PROVIDER_PRESETS.length + 1;
      setProviderIndex((i) => (i + delta + total) % total);
      return true;
    },
    [active, step],
  );

  const runProbe = React.useCallback(
    async (next: ConnectionDraft) => {
      setStep('testing');
      setError(null);
      const candidate: ResolvedConfig = {
        ...config,
        baseUrl: next.baseUrl.replace(/\/+$/, ''),
        apiKey: next.apiKey,
        model: next.model,
        mock: false,
      };

      if (!candidate.baseUrl) {
        setError('接口地址不能为空');
        setProbe(null);
        setStep('done');
        return;
      }
      // 本地服务可以不填 Key，其余情况缺 Key 直接报错，省一次网络往返
      const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(candidate.baseUrl);
      if (!candidate.apiKey && !isLocal) {
        setError('这个地址需要 API Key，请返回上一步填写');
        setProbe(null);
        setStep('done');
        return;
      }

      const result = await probeConnection(candidate);
      setProbe(result);
      setStep('done');
    },
    [config],
  );

  const submit = React.useCallback(
    (value: string) => {
      const trimmed = value.trim();

      if (step === 'provider') {
        const preset = PROVIDER_PRESETS[providerIndex];
        if (preset) {
          setDraft((d) => ({ ...d, baseUrl: preset.baseUrl, model: preset.model, providerId: preset.id }));
        } else {
          // 选「自定义」：保留现有值，让用户逐项改
          setDraft((d) => ({ ...d, providerId: 'custom' }));
        }
        setInput('');
        setStep('baseUrl');
        return;
      }

      if (step === 'baseUrl') {
        setDraft((d) => ({ ...d, baseUrl: trimmed || d.baseUrl }));
        setInput('');
        setStep('apiKey');
        return;
      }

      if (step === 'apiKey') {
        // 留空表示沿用当前 Key
        setDraft((d) => ({ ...d, apiKey: trimmed || d.apiKey }));
        setInput('');
        setStep('model');
        return;
      }

      if (step === 'model') {
        const model = trimmed || draft.model;
        const next: ConnectionDraft = { ...draft, model };
        setDraft(next);
        setInput('');
        void runProbe(next);
        return;
      }
    },
    [step, providerIndex, draft, runProbe],
  );

  const retest = React.useCallback(() => {
    void runProbe(draft);
  }, [runProbe, draft]);

  const save = React.useCallback(() => {
    if (!draft.baseUrl || !draft.model) {
      setError('接口地址和模型名不能为空');
      return;
    }
    try {
      saveConfigFile({
        baseUrl: draft.baseUrl.replace(/\/+$/, ''),
        model: draft.model,
        // 空 Key 不覆盖已有值
        ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
      });
      const next = resolveConfig({ argv: {}, env: process.env, file: loadConfigFile() });
      const restored = { ...next, mock: false };
      setActive(false);
      onApplied(restored, `已连接 ${restored.model}，配置写入 ${configPath()}`);
    } catch (err) {
      setError(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [draft, onApplied]);

  return {
    active,
    step,
    draft,
    providerIndex,
    input,
    probe,
    error,
    setInput,
    open,
    cancel,
    submit,
    move,
    retest,
    save,
  };
}

export { STEP_SEQUENCE };
