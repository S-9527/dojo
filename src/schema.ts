/**
 * 用 zod 校验模型输出。
 * 模型返回的 JSON 结构经常不达标（少字段、类型不对、hints 不够），
 * 这里做「校验 + 兜底」：schema 只负责把类型修对，业务约束在 normalize 里补。
 *
 * 注意 zod 4 的一个坑：z.unknown() 不接受 undefined。
 * 字段缺失时如果用 z.unknown()，整个 safeParse 会失败并静默回退到默认值，
 * 把模型真实返回的内容全部丢掉（曾经导致判题结果永远是“部分正确 60 分”）。
 * 所以这里一律用 z.unknown().optional()，并把默认值放在 transform 里。
 */
import { z } from 'zod';
import type { Difficulty, Exercise, Grade, TopicKey, Verdict } from './types.js';

/** 把模型可能给的 "a" / ["a"] / null 统一成字符串数组。 */
const stringList = z
  .unknown()
  .optional()
  .transform((value): string[] => {
    const raw = Array.isArray(value) ? value : [value];
    return raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  });

const text = (fallback: string) =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === 'string' && v.trim() ? v.trim() : fallback));

const exerciseSchema = z.object({
  title: text('未命名练习'),
  scenario: text('（模型未给出场景）'),
  question: text('（模型未给出题干）'),
  acceptance: stringList,
  reference_answer: text(''),
  explanation: text(''),
  common_mistakes: stringList,
  hints: stringList,
  difficulty: z.unknown().optional(),
});

const gradeSchema = z.object({
  verdict: z.unknown().optional(),
  score: z.unknown().optional(),
  reason: text('（模型未给出评语）'),
  corrected_answer: text(''),
  knowledge_points: stringList,
});

const VERDICT_SET = new Set<Verdict>(['correct', 'partial', 'wrong']);

const DEFAULT_HINTS: [string, string, string] = [
  '想想完成这件事需要操作哪类信息（文件内容 / 权限 / 进程 / 网络）。',
  '先写出命令名，再逐个补参数。',
  '把命令拆成两步：先用一个命令筛选出目标，再用另一个处理。',
];

const FALLBACK_EXERCISE = {
  title: '未命名练习',
  scenario: '（模型未给出场景）',
  question: '（模型未给出题干）',
  acceptance: [] as string[],
  reference_answer: '',
  explanation: '',
  common_mistakes: [] as string[],
  hints: [] as string[],
};

/** 规范化题目：zod 修类型，再补业务约束（hints 必须 3 条、acceptance 不能为空）。 */
export function normalizeExercise(raw: unknown, ctx: { topic: TopicKey; difficulty: Difficulty }): Exercise {
  const parsed = exerciseSchema.safeParse(raw ?? {});
  const base = parsed.success ? parsed.data : FALLBACK_EXERCISE;

  const hints = base.hints.slice(0, 3);
  // 兜底提示必须补满 3 条：TUI 的提示按钮按 hints.length 计数
  for (let i = 0; hints.length < 3; i += 1) {
    hints.push(DEFAULT_HINTS[i] ?? DEFAULT_HINTS[2]);
  }

  const acceptance = base.acceptance.length ? base.acceptance : ['命令能完成题干描述的目标'];

  return {
    title: base.title,
    scenario: base.scenario,
    question: base.question,
    acceptance,
    reference_answer: base.reference_answer,
    explanation: base.explanation,
    common_mistakes: base.common_mistakes,
    hints,
    topic: ctx.topic,
    difficulty: ctx.difficulty,
  };
}

/** 规范化判题结果：verdict 白名单，score 夹到 0-100。 */
export function normalizeGrade(raw: unknown): Grade {
  const parsed = gradeSchema.safeParse(raw ?? {});
  const base = parsed.success
    ? parsed.data
    : { verdict: undefined, score: undefined, reason: '（模型未给出评语）', corrected_answer: '', knowledge_points: [] };

  const verdict: Verdict =
    typeof base.verdict === 'string' && VERDICT_SET.has(base.verdict as Verdict)
      ? (base.verdict as Verdict)
      : 'partial';

  const scoreRaw = Number(base.score);
  const fallback = verdict === 'correct' ? 95 : verdict === 'partial' ? 60 : 20;
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : fallback;

  return {
    verdict,
    score,
    reason: base.reason,
    corrected_answer: base.corrected_answer,
    knowledge_points: base.knowledge_points,
  };
}
