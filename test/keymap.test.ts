/**
 * 模态按键定义与提示。
 * 模态的核心价值：命令和文本走不同通道，冲突从设计上消失。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { INSERT_KEYS, NORMAL_KEYS, insertHint, isPrintable, normalHint } from '../src/tui/keymap.ts';
import { KeyHelp, ModeBar } from '../src/tui/components/ModeBar.tsx';

test('NORMAL_KEYS: 每条都有键位与说明', () => {
  assert.ok(NORMAL_KEYS.length >= 10);
  for (const k of NORMAL_KEYS) {
    assert.ok(k.keys.length > 0, '键位不能为空');
    assert.ok(k.label.length > 0, `${k.keys} 缺少简短说明`);
    assert.ok(k.detail.length > 4, `${k.keys} 缺少详细说明`);
  }
});

test('NORMAL_KEYS: 键位不重复', () => {
  const keys = NORMAL_KEYS.map((k) => k.keys);
  assert.equal(new Set(keys).size, keys.length);
});

test('NORMAL_KEYS: 关键动作都已绑定', () => {
  const all = NORMAL_KEYS.map((k) => k.keys).join(' ');
  for (const key of ['i', 'n', 'h', 'a', 'A', 'zo/zc', 'Tab', '?', 'q']) {
    assert.ok(all.includes(key), `缺少 ${key}`);
  }
});

test('INSERT_KEYS: 说明提交与退出方式', () => {
  const keys = INSERT_KEYS.map((k) => k.keys).join(' ');
  assert.match(keys, /Enter/);
  assert.match(keys, /Esc/);
});

test('normalHint: 只列常用键，不把全部键塞进状态栏', () => {
  const hint = normalHint();
  assert.match(hint, /i 输入/);
  assert.match(hint, /n 换题/);
  assert.ok(hint.length < 120, '状态栏提示不应过长');
});

test('insertHint: 提示怎么退回命令模式', () => {
  assert.match(insertHint(), /Esc/);
});

test('isPrintable: 区分可打印字符与控制序列', () => {
  assert.equal(isPrintable('a'), true);
  assert.equal(isPrintable('中'), true);
  assert.equal(isPrintable('\r'), false);
  assert.equal(isPrintable('\u001b'), false);
  assert.equal(isPrintable('ab'), false, '多字符（粘贴）不该当命令');
});

test('ModeBar: normal 模式显示 NORMAL 与命令提示', () => {
  const { lastFrame, unmount } = render(React.createElement(ModeBar, { mode: 'normal' }));
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /NORMAL/);
  assert.match(frame, /换题/);
});

test('ModeBar: insert 模式显示 INSERT 与退出方式', () => {
  const { lastFrame, unmount } = render(React.createElement(ModeBar, { mode: 'insert' }));
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /INSERT/);
  assert.match(frame, /Esc/);
});

test('ModeBar: 提示信息会显示出来', () => {
  const { lastFrame, unmount } = render(
    React.createElement(ModeBar, { mode: 'normal', notice: '请求进行中' }),
  );
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /请求进行中/);
});

test('KeyHelp: 列出当前模式的全部按键', () => {
  const { lastFrame, unmount } = render(React.createElement(KeyHelp, { mode: 'normal' }));
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /命令模式按键/);
  for (const k of NORMAL_KEYS) {
    assert.ok(frame.includes(k.keys), `帮助里缺少 ${k.keys}`);
  }
});

test('KeyHelp: insert 模式列出输入相关说明', () => {
  const { lastFrame, unmount } = render(React.createElement(KeyHelp, { mode: 'insert' }));
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /输入模式按键/);
  assert.match(frame, /回到命令模式/);
});
