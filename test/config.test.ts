import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig, describeConfig, DEFAULT_MODEL } from '../src/config.ts';
import { summarize, streak, recordAttempt, loadProgress } from '../src/store.ts';
import type { AttemptRecord } from '../src/types.ts';

test('resolveConfig: 无 Key 时 apiKey 必须是空串而不是 "undefined"', () => {
  const cfg = resolveConfig({ env: {}, file: {}, argv: {} });
  assert.equal(cfg.apiKey, '');
  assert.equal(cfg.mock, false);
  assert.equal(cfg.model, DEFAULT_MODEL);
});

test('resolveConfig: 环境变量优先于配置文件', () => {
  const cfg = resolveConfig({
    env: { DOJO_API_KEY: 'env-key' },
    file: { apiKey: 'file-key', model: 'file-model' },
    argv: {},
  });
  assert.equal(cfg.apiKey, 'env-key');
  assert.equal(cfg.model, 'file-model');
});

test('resolveConfig: 命令行参数优先级最高', () => {
  const cfg = resolveConfig({
    env: { DOJO_API_KEY: 'env-key' },
    file: { apiKey: 'file-key' },
    argv: { apiKey: 'argv-key', model: 'm1' },
  });
  assert.equal(cfg.apiKey, 'argv-key');
  assert.equal(cfg.model, 'm1');
});

test('resolveConfig: BASE_URL 末尾斜杠被去掉', () => {
  const cfg = resolveConfig({ env: { DOJO_BASE_URL: 'http://localhost:11434/v1///' }, file: {}, argv: {} });
  assert.equal(cfg.baseUrl, 'http://localhost:11434/v1');
});

test('resolveConfig: mock 可由环境变量开启', () => {
  assert.equal(resolveConfig({ env: { DOJO_MOCK: '1' }, file: {}, argv: {} }).mock, true);
});

test('resolveConfig: 非法 timeout 回退到默认值', () => {
  const cfg = resolveConfig({ env: { DOJO_TIMEOUT_MS: 'abc' }, file: {}, argv: {} });
  assert.equal(cfg.timeoutMs, 90_000);
  assert.equal(resolveConfig({ env: { DOJO_TIMEOUT_MS: '0' }, file: {}, argv: {} }).timeoutMs, 90_000);
});

test('describeConfig: 未配置 Key 时如实说明，且不泄露内容', () => {
  const text = describeConfig(resolveConfig({ env: {}, file: {}, argv: {} })).join('\n');
  assert.match(text, /未配置/);

  const masked = describeConfig({
    mock: false,
    baseUrl: 'x',
    model: 'y',
    apiKey: 'sk-1234567890',
    stream: true,
    timeoutMs: 1000,
  }).join('\n');
  assert.ok(!masked.includes('sk-1234567890'), '完整 Key 不应出现在输出中');
});

const sample: AttemptRecord[] = [
  { title: 'a', topic: 'text', difficulty: 'easy', verdict: 'correct', score: 100, reason: '', question: '', answer: '', at: '2026-01-01T10:00:00' },
  { title: 'b', topic: 'text', difficulty: 'easy', verdict: 'wrong', score: 20, reason: '', question: '', answer: '', at: '2026-01-01T11:00:00' },
  { title: 'c', topic: 'files', difficulty: 'medium', verdict: 'partial', score: 60, reason: '', question: '', answer: '', at: '2026-01-02T10:00:00' },
];

test('summarize: 统计口径正确', () => {
  const s = summarize(sample);
  assert.equal(s.total, 3);
  assert.deepEqual(s.byVerdict, { correct: 1, partial: 1, wrong: 1 });
  assert.equal(s.avgScore, 60);
  assert.equal(s.byTopic.text?.total, 2);
  assert.equal(s.byTopic.text?.correct, 1);
});

test('summarize: 全对时不报薄弱项', () => {
  const s = summarize([sample[0] as AttemptRecord]);
  assert.deepEqual(s.weakTopics, []);
});

test('summarize: 空记录不崩', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.avgScore, 0);
  assert.equal(s.streak, 0);
});

test('recordAttempt: 落盘后可读回', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lt-'));
  const path = join(dir, 'progress.json');
  try {
    recordAttempt({ title: 't', topic: 'files', difficulty: 'easy', verdict: 'correct', score: 100, reason: '', question: '', answer: '' }, path);
    const progress = loadProgress(path);
    assert.equal(progress.records.length, 1);
    assert.equal(progress.records[0]?.title, 't');
    assert.ok(progress.records[0]?.at, '应自动补时间戳');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadProgress: 文件损坏时返回空结构而不是抛错', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lt-'));
  const path = join(dir, 'broken.json');
  try {
    writeFileSync(path, '{not json');
    assert.deepEqual(loadProgress(path).records, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadProgress: 过滤掉形状不对的记录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lt-'));
  const path = join(dir, 'mixed.json');
  try {
    writeFileSync(path, JSON.stringify({ version: 1, records: [{ title: 'ok', topic: 'files', difficulty: 'easy', verdict: 'correct' }, { garbage: true }, null] }));
    const p = loadProgress(path);
    assert.equal(p.records.length, 1);
    assert.equal(p.records[0]?.title, 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('streak: 含有今天的连续记录才算', () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const mk = (offset: number): AttemptRecord => ({
    title: 'x',
    topic: 'files',
    difficulty: 'easy',
    verdict: 'correct',
    score: 100,
    reason: '',
    question: '',
    answer: '',
    at: new Date(`${day(offset)}T12:00:00`).toISOString(),
  });

  assert.equal(streak([mk(0)]), 1);
  assert.equal(streak([mk(0), mk(1), mk(2)]), 3);
  assert.equal(streak([mk(0), mk(2)]), 1, '中间断了只算 1 天');
  assert.equal(streak([mk(1)]), 0, '昨天答对但今天没答，连续天数归零');
  assert.equal(streak([]), 0);
});
