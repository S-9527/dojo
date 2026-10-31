import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ResolvedConfig } from './types.js';

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_MODEL = 'deepseek-chat';
export const DEFAULT_TIMEOUT_MS = 90_000;

export interface ConfigFileShape {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  mock?: boolean;
  stream?: boolean;
  timeoutMs?: number;
  /** token 预算倍数（推理模型建议 2~3） */
  tokenScale?: number;
}

export interface ResolveInput {
  argv?: Record<string, string | boolean | undefined>;
  env?: Record<string, string | undefined>;
  file?: ConfigFileShape;
}

/** 用户配置文件路径。 */
export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'dojo', 'config.json');
}

/** 读配置文件；不存在或损坏时返回空对象，不抛错。 */
export function loadConfigFile(path: string = configPath()): ConfigFileShape {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as ConfigFileShape) : {};
  } catch {
    return {};
  }
}

/**
 * 合并配置。优先级：命令行参数 > 环境变量 > 配置文件 > 默认值。
 */
export function resolveConfig({ argv = {}, env = process.env, file = loadConfigFile() }: ResolveInput = {}): ResolvedConfig {
  // 注意：不能用 find 直接返回，否则全空时会得到 undefined，
  // 再经 String() 变成字符串 "undefined"，被误判为“已配置 Key”。
  const pick = (fallback: string | number, ...values: Array<string | number | boolean | undefined>) => {
    const hit = values.find((v) => v !== undefined && v !== null && String(v).trim() !== '');
    return hit === undefined ? fallback : hit;
  };

  const mock = Boolean(argv.mock) || env.DOJO_MOCK === '1' || file.mock === true;
  const baseUrl = String(
    pick(DEFAULT_BASE_URL, argv.baseUrl, env.DOJO_BASE_URL, env.OPENAI_BASE_URL, file.baseUrl),
  ).replace(/\/+$/, '');
  const apiKey = String(pick('', argv.apiKey, env.DOJO_API_KEY, env.OPENAI_API_KEY, file.apiKey));
  const model = String(pick(DEFAULT_MODEL, argv.model, env.DOJO_MODEL, env.OPENAI_MODEL, file.model));
  const timeoutRaw = Number(
    pick(DEFAULT_TIMEOUT_MS, argv.timeoutMs, env.DOJO_TIMEOUT_MS, file.timeoutMs),
  );

  const scaleRaw = Number(pick(1, argv.tokenScale, env.DOJO_TOKEN_SCALE, file.tokenScale));
  const tokenScale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 10) : 1;

  return {
    mock,
    baseUrl,
    apiKey,
    model,
    stream: argv.stream !== false && file.stream !== false,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
    tokenScale,
  };
}

/** 给用户看的配置体检结果（Key 脱敏）。 */
export function describeConfig(config: ResolvedConfig): string[] {
  if (config.mock) return ['模式: 离线 Mock（不调用大模型）'];
  return [
    `接口: ${config.baseUrl}`,
    `模型: ${config.model}`,
    `API Key: ${
      config.apiKey ? `已配置（${maskKey(config.apiKey)}）` : '未配置'
    }`,
  ];
}

/** Key 脱敏：短 Key 也不至于露出全部内容。 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return `${key.slice(0, 1)}***`;
  return `${key.slice(0, 3)}***${key.slice(-2)}`;
}

/**
 * 把配置写进配置文件。
 * 只写显式给出的字段，未提供的保持文件里原样，避免把用户的其它设置冲掉。
 * 权限设为 0600，因为里面含 API Key。
 */
export function saveConfigFile(patch: ConfigFileShape, path: string = configPath()): ConfigFileShape {
  const current = loadConfigFile(path);
  const merged: ConfigFileShape = { ...current };

  for (const [key, value] of Object.entries(patch) as Array<[keyof ConfigFileShape, unknown]>) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    (merged as Record<string, unknown>)[key] = value;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  // 文件已存在时 writeFileSync 不会改权限，显式补一次
  try {
    chmodSync(path, 0o600);
  } catch {
    /* 某些文件系统不支持，忽略 */
  }
  return merged;
}

/** 服务商预设，`/connect` 时可直接选。 */
export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  /** 是否需要 API Key（本地 Ollama 不需要） */
  needsKey: boolean;
  note: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    needsKey: true,
    note: '便宜、中文好，推荐入门',
  },
  {
    id: 'ollama',
    name: '本地 Ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    needsKey: false,
    note: '完全离线，需要先 ollama pull',
  },
  {
    id: 'sensenova',
    name: '商汤日日新',
    baseUrl: 'https://token.sensenova.cn/v1',
    model: 'sensenova-6.8-flash-lite',
    needsKey: true,
    note: '注意模型名要小写、带版本号',
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    needsKey: true,
    note: '长上下文',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    needsKey: true,
    note: '阿里云百炼',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    needsKey: true,
    note: '有免费额度',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
    note: '需自备网络条件',
  },
];
