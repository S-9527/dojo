import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AttemptRecord, Difficulty, Progress, Summary, TopicKey, TopicStats, Verdict } from './types.js';

/** 练习记录路径；可用 DOJO_DATA 覆盖（测试用）。 */
export function dataPath(): string {
  if (process.env.DOJO_DATA) return process.env.DOJO_DATA;
  const base = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(base, 'dojo', 'progress.json');
}

const emptyProgress = (): Progress => ({
  version: 1,
  createdAt: new Date().toISOString(),
  records: [],
});

export function loadProgress(path: string = dataPath()): Progress {
  if (!existsSync(path)) return emptyProgress();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Progress> | null;
    if (!parsed || !Array.isArray(parsed.records)) return emptyProgress();
    return {
      version: 1,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      records: parsed.records.filter(isRecordLike),
    };
  } catch {
    // 文件损坏不阻塞学习，重建即可
    return emptyProgress();
  }
}

/** 落盘数据可能被手改，读回时做最低限度的形状校验。 */
function isRecordLike(value: unknown): value is AttemptRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.title === 'string' &&
    typeof r.topic === 'string' &&
    typeof r.difficulty === 'string' &&
    typeof r.verdict === 'string'
  );
}

export function saveProgress(progress: Progress, path: string = dataPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
}

export type NewRecord = Omit<AttemptRecord, 'at'> & { at?: string };

/** 追加一条练习记录。 */
export function recordAttempt(record: NewRecord, path: string = dataPath()): Progress {
  const progress = loadProgress(path);
  progress.records.push({ ...record, at: record.at ?? new Date().toISOString() });
  saveProgress(progress, path);
  return progress;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function toLocalDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 连续答对天数（按本地日期）。 */
export function streak(records: AttemptRecord[]): number {
  // 记录里的 at 是 ISO(UTC) 字符串，必须转成本地日期再比较，
  // 直接用 slice(0,10) 会按 UTC 切，在东八区凌晨会错位一天。
  const days = new Set(
    records
      .filter((r) => r.verdict === 'correct' && r.at)
      .map((r) => {
        const d = new Date(r.at);
        return Number.isNaN(d.getTime()) ? null : toLocalDay(d);
      })
      .filter((d): d is string => d !== null),
  );

  let count = 0;
  const cursor = new Date();
  while (days.has(toLocalDay(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

const VERDICTS: Verdict[] = ['correct', 'partial', 'wrong'];

/** 汇总统计，供 stats 命令使用。 */
export function summarize(records: AttemptRecord[]): Summary {
  const byVerdict: Record<Verdict, number> = { correct: 0, partial: 0, wrong: 0 };
  const byTopic: Partial<Record<TopicKey, TopicStats>> = {};
  const byDifficulty: Partial<Record<Difficulty, TopicStats>> = {};

  for (const r of records) {
    if (VERDICTS.includes(r.verdict)) byVerdict[r.verdict] += 1;

    const topic = (byTopic[r.topic] ??= { total: 0, correct: 0 });
    topic.total += 1;
    if (r.verdict === 'correct') topic.correct += 1;

    const diff = (byDifficulty[r.difficulty] ??= { total: 0, correct: 0 });
    diff.total += 1;
    if (r.verdict === 'correct') diff.correct += 1;
  }

  const total = records.length;
  const avgScore = total
    ? Math.round(records.reduce((sum, r) => sum + (Number(r.score) || 0), 0) / total)
    : 0;

  // 薄弱主题：只挑真正没过关的（正确率 < 80%），全对时不制造虚假焦虑
  const weakTopics = (Object.entries(byTopic) as Array<[TopicKey, TopicStats]>)
    .map(([topic, s]) => ({ topic, rate: s.correct / s.total, total: s.total }))
    .filter((t) => t.rate < 0.8)
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, 3);

  return { total, byVerdict, byTopic, byDifficulty, avgScore, weakTopics, streak: streak(records) };
}
