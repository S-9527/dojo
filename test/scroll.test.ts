/**
 * 滚动视口的核心逻辑。
 * 单独测是因为它决定了「思考过程能否在有限高度内翻看」，
 * 而 Ink 的布局行为难以在测试里稳定复现，逻辑正确性是更可靠的保证。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wrapToLines,
  visibleWindow,
  scrollBy,
  displayWidth,
  charWidth,
} from '../src/tui/scroll.ts';

test('charWidth: 中文占 2 列，ASCII 占 1 列', () => {
  assert.equal(charWidth('中'), 2);
  assert.equal(charWidth('a'), 1);
  assert.equal(charWidth('，'), 2);
  assert.equal(charWidth('。'), 2);
  assert.equal(charWidth(' '), 1);
});

test('displayWidth: 中英混排按显示列计算', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('中文'), 4);
  assert.equal(displayWidth('a中b'), 4);
});

test('wrapToLines: 中文按显示宽度折行，不超界', () => {
  const text = '第20步思考：需要先比较相邻行，再统计重复次数。'.repeat(3);
  const width = 40;
  const lines = wrapToLines(text, width);
  assert.ok(lines.length > 1, '应该被折成多行');
  for (const line of lines) {
    assert.ok(displayWidth(line) <= width, `行宽 ${displayWidth(line)} 超过了 ${width}`);
  }
});

test('wrapToLines: 保留原有空行', () => {
  assert.deepEqual(wrapToLines('a\n\nb', 40), ['a', '', 'b']);
});

test('wrapToLines: 短行不折', () => {
  assert.deepEqual(wrapToLines('短', 40), ['短']);
});

test('visibleWindow: 跟随底部时显示最后 N 行', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
  const win = visibleWindow(lines, 10, { offset: null });
  assert.equal(win.lines.length, 10);
  assert.equal(win.lines[0], 'line90');
  assert.equal(win.atBottom, true);
  assert.equal(win.hiddenAbove, 90);
  assert.equal(win.hiddenBelow, 0);
});

test('visibleWindow: 指定 offset 时从该处开始', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
  const win = visibleWindow(lines, 10, { offset: 5 });
  assert.equal(win.lines[0], 'line5');
  assert.equal(win.hiddenAbove, 5);
  assert.equal(win.hiddenBelow, 85);
  assert.equal(win.atBottom, false);
});

test('visibleWindow: 内容比视口短时不出现空白窗口', () => {
  const win = visibleWindow(['a', 'b'], 10, { offset: null });
  assert.deepEqual(win.lines, ['a', 'b']);
  assert.equal(win.hiddenAbove, 0);
  assert.equal(win.hiddenBelow, 0);
});

test('visibleWindow: offset 越界时被夹住', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `l${i}`);
  assert.equal(visibleWindow(lines, 10, { offset: 999 }).start, 10);
  assert.equal(visibleWindow(lines, 10, { offset: -5 }).start, 0);
});

test('scrollBy: 向上滚动回到早期内容', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
  const next = scrollBy(lines, 10, { offset: null }, -5);
  assert.deepEqual(next, { offset: 85 });
});

test('scrollBy: 滚到底部时恢复自动跟随', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
  // 从 80 向下滚 5 行会到达底部（maxStart=90），应恢复跟随
  const next = scrollBy(lines, 10, { offset: 88 }, 5);
  assert.equal(next.offset, null, '到底部应恢复自动跟随，否则流式输出不会再滚');
});

test('scrollBy: 不能滚到负数', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line${i}`);
  assert.deepEqual(scrollBy(lines, 10, { offset: 3 }, -10), { offset: 0 });
});

test('scrollBy: 内容不足一屏时无滚动空间', () => {
  const lines = ['a', 'b'];
  assert.deepEqual(scrollBy(lines, 10, { offset: null }, -5), { offset: null });
});

test('wrapToLines: 极窄宽度也不崩', () => {
  const lines = wrapToLines('中文内容测试', 1);
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.ok(displayWidth(line) <= 8, '内部有最小宽度保护');
  }
});
