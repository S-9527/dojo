/**
 * 按键定义的单一来源。
 *
 * 为什么改模态：之前命令和文本共用一条输入通道，于是不得不做一堆补丁 ——
 * 快捷键漏进输入框、`z` 前缀要加超时、没有输入框时按键无人接收、
 * Ctrl 组合被终端占用。这些都是同一个根因。
 * 分成 normal / insert 之后，两类按键在物理上互斥，补丁可以全部删掉。
 */

export type Mode = 'normal' | 'insert';

export interface KeySpec {
  /** 主键位（显示用） */
  keys: string;
  /** 简短说明，底部状态栏用 */
  label: string;
  /** 详细说明，帮助面板用 */
  detail: string;
}

/** normal 模式下可用的按键。 */
export const NORMAL_KEYS: KeySpec[] = [
  { keys: 'i', label: '输入', detail: '进入输入模式，可作答或打字' },
  { keys: 'n', label: '换题', detail: '按当前主题与难度重新出题' },
  { keys: 'h', label: '提示', detail: '逐级提示，最多 3 级' },
  { keys: 'a', label: '答案', detail: '显示参考答案与解析' },
  { keys: 'A', label: '提问', detail: '切到对话面板并进入输入模式' },
  { keys: 'zo/zc', label: '思考', detail: 'zo 展开、zc 收起模型的思考过程' },
  { keys: 'j/k', label: '滚动', detail: '展开思考后逐行滚动' },
  { keys: 'u/d', label: '翻页', detail: '展开思考后整页翻动' },
  { keys: 'g/G', label: '首尾', detail: '跳到思考过程的开头 / 最新' },
  { keys: 'Tab', label: '面板', detail: '在练习 / 对话 / 统计之间切换' },
  { keys: 's', label: '统计', detail: '查看学习统计' },
  { keys: 'r', label: '复盘', detail: '让模型复盘薄弱点' },
  { keys: 'c', label: '连接', detail: '配置大模型接口' },
  { keys: '?', label: '帮助', detail: '显示全部按键' },
  { keys: 'q', label: '退出', detail: '退出程序，进度自动保存' },
];

/** insert 模式下可用的按键。 */
export const INSERT_KEYS: KeySpec[] = [
  { keys: 'Enter', label: '提交', detail: '提交作答，或发送提问' },
  { keys: 'Esc', label: '返回', detail: '回到命令模式（不会中断请求）' },
  { keys: '←/→', label: '移动', detail: '在输入行内移动光标' },
];

/** 底部状态栏的提示行（只列最常用的）。 */
export function normalHint(keys: KeySpec[] = NORMAL_KEYS): string {
  const shown = ['i', 'n', 'h', 'a', 'A', 'zo/zc', 'Tab', '?', 'q'];
  const picked = keys.filter((k) => shown.includes(k.keys));
  return picked.map((k) => `${k.keys} ${k.label}`).join(' · ');
}

export function insertHint(): string {
  return 'Enter 提交 · Esc 返回命令模式';
}

/**
 * 该按键在 normal 模式下是否可打印字符。
 * 用来判断「未绑定的键」是敲错了，还是仅仅没绑定 —— 避免把随机字符当命令执行。
 */
export function isPrintable(input: string): boolean {
  return input.length === 1 && input >= ' ' && input !== '\u007f';
}
