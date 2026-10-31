/**
 * 动画帧与 token 估算。
 * 帧序列与「字符数 ÷ 4」的估算思路参考了 Claude Code 的状态行，
 * 但中文场景下 ÷4 会严重低估，所以这里按字符类型分开算。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  formatCount,
  formatElapsed,
  spinnerFrames,
  supportsUnicode,
} from '../src/tui/spinner.ts';

test('spinnerFrames: 正常终端用盲文点阵', () => {
  const frames = spinnerFrames({ TERM: 'xterm-256color' });
  assert.equal(frames.length, 10);
  assert.equal(frames[0], '⠋');
  assert.ok(frames.every((f) => /^[\u2800-\u28ff]$/.test(f)), '应为盲文点阵字符');
});

test('spinnerFrames: dumb 终端退回 ASCII', () => {
  const frames = spinnerFrames({ TERM: 'dumb' });
  for (const f of frames) {
    assert.ok(/^[\x20-\x7e]$/.test(f), `纯 ASCII 终端不该出现 ${f}`);
  }
});

test('spinnerFrames: 可显式关闭 Unicode', () => {
  assert.equal(spinnerFrames({ NO_UNICODE: '1' }).includes('⠋'), false);
});

test('supportsUnicode: 常规环境为真', () => {
  assert.equal(supportsUnicode({ TERM: 'xterm-256color' }), true);
  assert.equal(supportsUnicode({ TERM: 'dumb' }), false);
});

test('estimateTokens: 英文约 4 字符 1 token', () => {
  assert.equal(estimateTokens('abcdefgh'), 2);
});

test('estimateTokens: 中文不能按 ÷4 算', () => {
  // 15 个汉字：÷4 会得到 4，明显偏低；按 1.5 字/token 应约 10
  const n = estimateTokens('这是一段用来测试的中文内容大概十五个字');
  assert.ok(n >= 8 && n <= 14, `中文估算 ${n} 不合理`);
});

test('estimateTokens: 中英混排分别计算', () => {
  const n = estimateTokens('ls 命令');
  assert.ok(n >= 2, `混排估算 ${n} 偏低`);
});

test('estimateTokens: 空串为 0', () => {
  assert.equal(estimateTokens(''), 0);
});

test('estimateTokens: 随内容增长而单调不减', () => {
  let prev = 0;
  for (let i = 1; i <= 20; i += 1) {
    const n = estimateTokens('内容'.repeat(i));
    assert.ok(n >= prev, 'token 数不应随内容增加而减少');
    prev = n;
  }
});

test('formatCount: 大数紧凑显示', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1234), '1.2k');
  assert.equal(formatCount(12345), '12k');
});

test('formatCount: 非法输入不崩', () => {
  assert.equal(formatCount(NaN), '0');
  assert.equal(formatCount(-5), '0');
});

test('formatElapsed: 不足 1 秒返回空（避免刷屏）', () => {
  assert.equal(formatElapsed(0), '');
  assert.equal(formatElapsed(999), '');
});

test('formatElapsed: 秒与分钟', () => {
  assert.equal(formatElapsed(1000), '1s');
  assert.equal(formatElapsed(45_000), '45s');
  assert.equal(formatElapsed(65_000), '1m05s');
});
