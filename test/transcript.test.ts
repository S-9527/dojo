/**
 * 转录视口的窗口计算。
 * 全屏模式下终端没有回滚缓冲区，滚动完全靠应用内实现，
 * 所以「哪些块可见」必须在渲染前算准，不能交给 Ink 裁剪。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateLines, scrollBy } from '../src/tui/scroll.ts';

test('estimateLines: 短文本占 1 行', () => {
  assert.equal(estimateLines('短', 40), 1);
});

test('estimateLines: 按显示宽度折行', () => {
  // 40 个汉字 = 80 显示列，宽度 40 应折成 2 行
  assert.equal(estimateLines('中'.repeat(40), 40), 2);
});

test('estimateLines: 保留空行', () => {
  assert.equal(estimateLines('a\n\nb', 40), 3);
});

test('estimateLines: 空串算 1 行', () => {
  assert.equal(estimateLines('', 40), 1);
});

test('scrollBy: 向下滚到底会恢复自动跟随', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `l${i}`);
  const state = scrollBy(lines, 10, { offset: 85 }, 100);
  assert.equal(state.offset, null, '到底后应恢复跟随，新内容才会自动出现');
});

test('scrollBy: 向上滚不会越过顶部', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `l${i}`);
  assert.deepEqual(scrollBy(lines, 10, { offset: 3 }, -50), { offset: 0 });
});
