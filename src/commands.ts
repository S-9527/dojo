/**
 * 斜杠指令的单一事实来源。
 * TUI 的候选菜单、帮助面板、纯文本界面的指令表都从这里读，
 * 避免出现「菜单里写了但实际不支持」这种前后不一致。
 */
import { TOPIC_KEYS, DIFFICULTY_KEYS, TOPICS, DIFFICULTIES } from './topics.js';

export interface CommandSpec {
  /** 指令名，不含斜杠 */
  name: string;
  /** 一句话说明，候选菜单里展示 */
  summary: string;
  /** 用法示例，选中后展示在菜单下方 */
  usage: string;
  /** 更详细的解释 */
  detail: string;
  /** 别名（不含斜杠） */
  aliases?: string[];
  /** 是否需要参数 */
  takesArg?: boolean;
}

export const COMMANDS: CommandSpec[] = [
  {
    name: 'hint',
    summary: '要提示，逐级加深',
    usage: '/hint',
    detail: '第 1 级只给方向，第 2 级给命令名，第 3 级几乎给出答案。每题最多 3 次。',
  },
  {
    name: 'ask',
    summary: '向助教提问',
    usage: '/ask uniq 为什么要先 sort？',
    detail: '就当前题目提问，流式回答。助教不会直接告诉你答案，只会引导。不带参数会追问。',
    takesArg: true,
  },
  {
    name: 'answer',
    summary: '看参考答案与解析',
    usage: '/answer',
    detail: '展开标准命令、解题思路和常见错误。看过之后仍可继续作答。',
  },
  {
    name: 'next',
    summary: '换一题',
    usage: '/next',
    detail: '按当前主题和难度重新出题，历史记录会用来避免重复。',
  },
  {
    name: 'topic',
    summary: '切换主题',
    usage: `/topic text`,
    detail: `可选：${TOPIC_KEYS.map((k) => `${k}（${TOPICS[k].label}）`).join('、')}`,
    takesArg: true,
  },
  {
    name: 'connect',
    summary: '配置大模型接口',
    usage: '/connect',
    detail: '分步填写接口地址、API Key、模型名，保存前会先测试连接。保存后立即生效，无需重启。',
  },
  {
    name: 'stats',
    summary: '看学习统计',
    usage: '/stats',
    detail: '正确率、各主题进度、薄弱点。数据来自本地记录，不联网。',
  },
  {
    name: 'review',
    summary: '复盘薄弱点',
    usage: '/review',
    detail: '让模型根据最近的练习记录总结已掌握和待加强的点，并给出下一阶段建议。',
  },
  {
    name: 'help',
    summary: '查看全部指令',
    usage: '/help',
    detail: '列出所有指令与快捷键。',
  },
  {
    name: 'quit',
    summary: '退出',
    usage: '/quit',
    detail: '退出程序，进度自动保存。',
    aliases: ['q', 'exit'],
  },
];

/** 主题和难度的候选项，供 /topic 的二级补全使用。 */
export const TOPIC_CHOICES = TOPIC_KEYS.map((key) => ({
  value: key,
  label: TOPICS[key].label,
}));

export const DIFFICULTY_CHOICES = DIFFICULTY_KEYS.map((key) => ({
  value: key,
  label: DIFFICULTIES[key].label,
}));

/** 把输入里的指令名解析成规范名（处理别名）。 */
export function resolveCommandName(name: string): string | null {
  const lower = name.toLowerCase();
  const hit = COMMANDS.find((c) => c.name === lower || c.aliases?.includes(lower));
  return hit ? hit.name : null;
}

export function findCommand(name: string): CommandSpec | null {
  const resolved = resolveCommandName(name);
  return resolved ? (COMMANDS.find((c) => c.name === resolved) ?? null) : null;
}

/**
 * 按输入前缀过滤候选。
 * 传入的是斜杠之后的部分（可能带参数，例如 "topic te" 只取第一段做匹配）。
 */
export function filterCommands(input: string): CommandSpec[] {
  const withoutSlash = input.startsWith('/') ? input.slice(1) : input;
  const namePart = withoutSlash.split(/\s+/)[0]?.toLowerCase() ?? '';

  if (!namePart) return COMMANDS;

  return COMMANDS.filter(
    (c) => c.name.startsWith(namePart) || c.aliases?.some((a) => a.startsWith(namePart)),
  );
}

/**
 * 当前输入是否应该弹出候选菜单。
 * 两种情况：
 *   1) `/` 或 `/前缀`：弹出指令名候选；
 *   2) `/topic ` 或 `/topic te`：进入参数区，弹出参数候选。
 */
export function shouldShowMenu(input: string): boolean {
  if (!input.startsWith('/')) return false;
  const [, ...rest] = input.split(/\s+/);
  // 已经进入参数区的，只有当该指令确实有参数候选时才继续显示
  if (rest.length > 0) return argChoices(input).length > 0;
  return true;
}

/**
 * 参数补全候选项。
 * 目前只有 /topic 有二级候选。
 */
export function argChoices(input: string): Array<{ value: string; label: string }> {
  const [name, ...rest] = input.replace(/^\//, '').split(/\s+/);
  if (resolveCommandName(name ?? '') !== 'topic') return [];

  const prefix = (rest[0] ?? '').toLowerCase();
  if (rest.length > 1) return [];
  return TOPIC_CHOICES.filter((c) => c.value.startsWith(prefix) || c.label.includes(prefix));
}
