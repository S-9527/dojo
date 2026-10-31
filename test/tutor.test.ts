import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExercise, normalizeGrade } from '../src/schema.ts';
import { resolveTopic, resolveDifficulty, TOPIC_KEYS, DIFFICULTY_KEYS, randomTopic } from '../src/topics.ts';

test('normalizeExercise: 字段缺失时全部兜底', () => {
  const ex = normalizeExercise({}, { topic: 'text', difficulty: 'easy' });
  assert.equal(ex.title, '未命名练习');
  assert.equal(ex.hints.length, 3);
  assert.equal(ex.acceptance.length, 1);
  assert.equal(ex.topic, 'text');
});

test('normalizeExercise: hints 不足 3 条时补齐', () => {
  const ex = normalizeExercise({ hints: ['只有一个'] }, { topic: 'text', difficulty: 'easy' });
  assert.equal(ex.hints.length, 3);
  assert.equal(ex.hints[0], '只有一个');
});

test('normalizeExercise: hints 超过 3 条时截断', () => {
  const ex = normalizeExercise({ hints: ['1', '2', '3', '4'] }, { topic: 'text', difficulty: 'easy' });
  assert.deepEqual(ex.hints, ['1', '2', '3']);
});

test('normalizeExercise: acceptance 给成字符串也能用', () => {
  const ex = normalizeExercise({ acceptance: '输出一行' }, { topic: 'text', difficulty: 'easy' });
  assert.deepEqual(ex.acceptance, ['输出一行']);
});

test('normalizeExercise: 非对象输入不崩', () => {
  const ex = normalizeExercise(null, { topic: 'files', difficulty: 'easy' });
  assert.equal(ex.title, '未命名练习');
  assert.equal(normalizeExercise('字符串', { topic: 'files', difficulty: 'easy' }).hints.length, 3);
});

test('normalizeExercise: 字段类型错误时被修正', () => {
  const ex = normalizeExercise(
    { title: 123, acceptance: [1, 'ok', null], hints: [{}, 'h'] },
    { topic: 'files', difficulty: 'easy' },
  );
  assert.equal(ex.title, '未命名练习');
  assert.deepEqual(ex.acceptance, ['ok']);
  assert.equal(ex.hints[0], 'h');
});

test('normalizeGrade: 未知 verdict 降级为 partial', () => {
  assert.equal(normalizeGrade({ verdict: 'maybe' }).verdict, 'partial');
  assert.equal(normalizeGrade({}).verdict, 'partial');
});

test('normalizeGrade: score 越界被夹住', () => {
  assert.equal(normalizeGrade({ verdict: 'correct', score: 250 }).score, 100);
  assert.equal(normalizeGrade({ verdict: 'wrong', score: -5 }).score, 0);
});

test('normalizeGrade: score 非数字时按 verdict 给默认分', () => {
  assert.equal(normalizeGrade({ verdict: 'correct', score: 'abc' }).score, 95);
  assert.equal(normalizeGrade({ verdict: 'wrong' }).score, 20);
});

test('normalizeGrade: 小数四舍五入', () => {
  assert.equal(normalizeGrade({ verdict: 'partial', score: 66.7 }).score, 67);
});

/**
 * 回归测试：zod 4 里 z.unknown() 不接受 undefined，
 * 字段缺失会让整个 safeParse 失败并静默回退到默认值，
 * 表现为“所有判题都变成 partial/60 分”，模型真实返回被全部丢弃。
 */
test('normalizeGrade: 模型真实内容不得被静默丢弃（缺字段时也要保留已有字段）', () => {
  const grade = normalizeGrade({ verdict: 'correct', score: 100, reason: '达成全部验收点。' });
  assert.equal(grade.verdict, 'correct', 'verdict 不应回退');
  assert.equal(grade.score, 100, 'score 不应回退');
  assert.equal(grade.reason, '达成全部验收点。', 'reason 不应回退');
});

test('normalizeExercise: 缺字段时也要保留模型给出的字段', () => {
  const ex = normalizeExercise(
    { title: '统计行数', scenario: '有 500 行', question: '统计行数', reference_answer: 'wc -l f' },
    { topic: 'text', difficulty: 'easy' },
  );
  assert.equal(ex.title, '统计行数');
  assert.equal(ex.reference_answer, 'wc -l f');
  assert.equal(ex.hints.length, 3, 'hints 仍需补齐');
});

test('resolveTopic: 支持 key、中文名、命令名', () => {
  assert.equal(resolveTopic('text'), 'text');
  assert.equal(resolveTopic('文本处理'), 'text');
  assert.equal(resolveTopic('grep'), 'text');
  assert.equal(resolveTopic('文件与目录'), 'files');
  assert.equal(resolveTopic('不存在'), null);
  assert.equal(resolveTopic(''), null);
  assert.equal(resolveTopic(undefined), null);
});

test('resolveDifficulty: 支持 key 与中文标签', () => {
  assert.equal(resolveDifficulty('hard'), 'hard');
  assert.equal(resolveDifficulty('挑战'), 'hard');
  assert.equal(resolveDifficulty('入门'), 'easy');
  assert.equal(resolveDifficulty('nope'), null);
});

test('randomTopic: 总是在合法集合内', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.ok(TOPIC_KEYS.includes(randomTopic()));
  }
});

test('topic/difficulty 键表非空', () => {
  assert.ok(TOPIC_KEYS.length >= 5);
  assert.deepEqual(DIFFICULTY_KEYS, ['easy', 'medium', 'hard']);
});
