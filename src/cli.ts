import { resolveConfig, describeConfig, configPath, saveConfigFile, PROVIDER_PRESETS } from './config.js';
import { probeConnection, describeProbe } from './probe.js';
import { loadProgress, summarize, dataPath } from './store.js';
import { createTutor } from './tutor.js';
import { DIFFICULTIES, TOPICS, TOPIC_KEYS, DIFFICULTY_KEYS, resolveTopic, resolveDifficulty, randomTopic } from './topics.js';
import { runPlainSession, printStats } from './plain.js';
import type { Difficulty, ResolvedConfig, TopicKey } from './types.js';

export interface ParsedArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

/** 极简参数解析：支持 --key=value 与 --key value。 */
export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const asString = (v: string | boolean | string[] | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;

export function printHelp(): void {
  console.log(`
  dojo — 大模型出题、判题的 Linux 练习工具

  用法
    dojo                      启动 TUI 开始练习
    dojo --topic text         指定主题
    dojo --difficulty hard    指定难度
    dojo --mock               离线演示，不调用大模型
    dojo --plain              用纯文本界面（非 TTY 时自动启用）
    dojo stats                查看统计
    dojo review               让模型复盘薄弱点
    dojo config               检查配置
    dojo connect              非交互式配置接口（配合 --base-url/--api-key/--model）

  TUI 快捷键
    Tab 切换面板   Ctrl-N 换题   Ctrl-G 提示   Ctrl-X 答案
    Ctrl-A 提问    Ctrl-R 复盘   Ctrl-T 思考过程   Ctrl-C 退出

  主题  ${TOPIC_KEYS.map((k) => `${k}(${TOPICS[k].label})`).join('  ')}
  难度  ${DIFFICULTY_KEYS.map((k) => `${k}(${DIFFICULTIES[k].label})`).join('  ')}

  配置
    export DOJO_API_KEY=sk-xxx
    export DOJO_BASE_URL=https://api.deepseek.com/v1
    export DOJO_MODEL=deepseek-chat
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const sub = args._[0];

  if (args.help || args.h || sub === 'help') {
    printHelp();
    return 0;
  }

  const config = resolveConfig({
    argv: Object.fromEntries(
      Object.entries(args).filter(([k, v]) => k !== '_' && (typeof v === 'string' || typeof v === 'boolean')),
    ) as Record<string, string | boolean | undefined>,
  });

  if (sub === 'config') {
    console.log('\n当前配置');
    describeConfig(config).forEach((l) => console.log(`  ${l}`));
    console.log(`\n  配置文件: ${configPath()}`);
    console.log(`  数据文件: ${dataPath()}`);
    if (!config.mock && !config.apiKey) console.log('\n  还没有配置 API Key，可用 --mock 先体验离线流程，或运行 dojo connect。');
    console.log('');
    return 0;
  }

  // 非交互式配置：dojo connect --base-url ... --api-key ... --model ...
  if (sub === 'connect') {
    return runConnectCommand(args, config);
  }

  const rawTopic = asString(args.topic);
  const rawDifficulty = asString(args.difficulty);
  const topic = resolveTopic(rawTopic);
  const difficulty = resolveDifficulty(rawDifficulty);

  if (rawTopic && !topic) {
    console.error(`未知主题「${rawTopic}」，可选：${TOPIC_KEYS.join(' / ')}`);
    return 1;
  }
  if (rawDifficulty && !difficulty) {
    console.error(`未知难度「${rawDifficulty}」，可选：${DIFFICULTY_KEYS.join(' / ')}`);
    return 1;
  }

  const progress = loadProgress();

  // stats 只读本地记录，不需要联网，因此放在 Key 检查之前
  if (sub === 'stats') {
    printStats(summarize(progress.records));
    return 0;
  }

  // 没配 Key 时不直接报错退出：TUI 里可直接进 /connect 向导，省掉一次“查文档”的往返。
  // 纯文本模式没有向导，只能明确列出几条出路。
  if (!config.mock && !config.apiKey) {
    const canUseTui = !args.plain && Boolean(process.stdout.isTTY);
    if (!canUseTui) {
      console.error('\n✗ 没有配置 API Key。');
      console.error('  方式一：export DOJO_API_KEY=sk-xxx');
      console.error('  方式二：dojo connect --base-url <URL> --api-key <KEY> --model <MODEL>');
      console.error('  方式三：先体验离线流程  dojo --mock\n');
      return 1;
    }
    const { startTui } = await import('./tui/index.js');
    await startTui({
      tutor: createTutor(config, progress),
      config,
      topic: topic ?? randomTopic(),
      difficulty: difficulty ?? 'easy',
      progress,
      startWithConnect: true,
    });
    return 0;
  }

  const tutor = createTutor(config, progress);

  if (sub === 'review') {
    process.stdout.write('模型正在复盘…\r');
    try {
      const text = await tutor.review(progress.records);
      process.stdout.write('\r\x1b[K');
      console.log(`\n${text}\n`);
      return 0;
    } catch (err) {
      process.stdout.write('\r\x1b[K');
      console.error(`复盘失败：${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  const finalTopic: TopicKey = topic ?? randomTopic();
  const finalDifficulty: Difficulty = difficulty ?? 'easy';

  const useTui = !args.plain && Boolean(process.stdout.isTTY);
  if (useTui) {
    // 延迟加载 Ink：非 TTY 场景不必付出加载 React 的代价
    const { startTui } = await import('./tui/index.js');
    await startTui({ tutor, config, topic: finalTopic, difficulty: finalDifficulty, progress });
    return 0;
  }

  return runPlainSession({ tutor, config, topic: finalTopic, difficulty: finalDifficulty, progress });
}

/**
 * `dojo connect`：非交互式配置。
 * TUI 里的 /connect 是向导，这里给脚本和纯终端用，参数直接落盘并测试。
 */
async function runConnectCommand(args: ParsedArgs, current: ResolvedConfig): Promise<number> {
  const baseUrl = asString(args['base-url']) ?? asString(args.baseUrl);
  const apiKey = asString(args['api-key']) ?? asString(args.apiKey);
  const model = asString(args.model);

  // 不带参数时列出预设，方便用户挑一个复制
  if (!baseUrl && !apiKey && !model) {
    console.log('\n用法：dojo connect --base-url <URL> --api-key <KEY> --model <MODEL>');
    console.log('\n常用服务商：');
    for (const p of PROVIDER_PRESETS) {
      console.log(`  ${p.name.padEnd(16, ' ')} ${p.baseUrl.padEnd(52, ' ')} ${p.model}`);
      console.log(`  ${''.padEnd(16, ' ')} ${p.note}`);
    }
    console.log(`\n示例：\n  dojo connect --base-url ${PROVIDER_PRESETS[0]?.baseUrl} --model ${PROVIDER_PRESETS[0]?.model}`);
    console.log('\n也可以直接在 TUI 里输入 /connect 走分步向导。\n');
    return 0;
  }

  const next: ResolvedConfig = {
    ...current,
    mock: false,
    baseUrl: (baseUrl ?? current.baseUrl).replace(/\/+$/, ''),
    apiKey: apiKey ?? current.apiKey,
    model: model ?? current.model,
  };

  if (!next.baseUrl || !next.model) {
    console.error('base-url 和 model 不能为空');
    return 1;
  }

  process.stdout.write('正在测试连接…\r');
  const result = await probeConnection(next);
  process.stdout.write('\r\x1b[K');

  if (!result.ok) {
    console.error(`✗ 连接失败：${result.message}`);
    console.error('  配置未写入。检查地址/Key/模型名后重试。');
    return 1;
  }

  saveConfigFile({
    baseUrl: next.baseUrl,
    model: next.model,
    ...(next.apiKey ? { apiKey: next.apiKey } : {}),
  });

  console.log(`✓ ${describeProbe(result)}`);
  console.log(`  已写入 ${configPath()}（权限 0600）`);
  return 0;
}
