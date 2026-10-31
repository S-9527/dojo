/**
 * 斜杠指令候选菜单的测试。
 * 覆盖：过滤、别名解析、参数区判定、菜单渲染、说明联动。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  COMMANDS,
  filterCommands,
  resolveCommandName,
  findCommand,
  shouldShowMenu,
  argChoices,
  TOPIC_CHOICES,
} from '../src/commands.ts';
import { CommandMenu } from '../src/tui/components/CommandMenu.tsx';

test('COMMANDS: 每条都有说明和用法，不允许空字段', () => {
  assert.ok(COMMANDS.length >= 8);
  for (const cmd of COMMANDS) {
    assert.ok(cmd.name, '指令名不能为空');
    assert.ok(cmd.summary.trim().length > 0, `${cmd.name} 缺少说明`);
    assert.ok(cmd.usage.startsWith('/'), `${cmd.name} 的 usage 应以斜杠开头`);
    assert.ok(cmd.detail.trim().length > 4, `${cmd.name} 缺少详细说明`);
  }
});

test('COMMANDS: 指令名不重复', () => {
  const names = COMMANDS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test('filterCommands: 空输入返回全部', () => {
  assert.equal(filterCommands('/').length, COMMANDS.length);
  assert.equal(filterCommands('').length, COMMANDS.length);
});

test('filterCommands: 按前缀过滤', () => {
  const names = filterCommands('/s').map((c) => c.name);
  assert.ok(names.includes('stats'));
  assert.ok(!names.includes('hint'));
});

test('filterCommands: 无匹配返回空数组', () => {
  assert.deepEqual(filterCommands('/zzz'), []);
});

test('filterCommands: 有参数时只看指令名部分', () => {
  const names = filterCommands('/topic te').map((c) => c.name);
  assert.deepEqual(names, ['topic']);
});

test('filterCommands: 别名也能命中', () => {
  assert.deepEqual(filterCommands('/q').map((c) => c.name), ['quit']);
});

test('resolveCommandName: 名称与别名', () => {
  assert.equal(resolveCommandName('hint'), 'hint');
  assert.equal(resolveCommandName('q'), 'quit');
  assert.equal(resolveCommandName('exit'), 'quit');
  assert.equal(resolveCommandName('nope'), null);
});

test('findCommand: 返回完整定义', () => {
  const cmd = findCommand('q');
  assert.equal(cmd?.name, 'quit');
  assert.ok(cmd?.detail.includes('进度'));
});

test('shouldShowMenu: 斜杠开头弹菜单', () => {
  assert.equal(shouldShowMenu('/'), true);
  assert.equal(shouldShowMenu('/hi'), true);
  assert.equal(shouldShowMenu('ls -la'), false, '普通命令不弹菜单');
  assert.equal(shouldShowMenu(''), false);
});

test('shouldShowMenu: /topic 空格后应进入参数候选', () => {
  assert.equal(shouldShowMenu('/topic '), true, '这是实际踩过的 bug：带空格曾导致菜单消失');
  assert.equal(shouldShowMenu('/topic te'), true);
  assert.equal(shouldShowMenu('/topic text'), true);
});

test('shouldShowMenu: 无参数候选的指令进入参数区后不再弹', () => {
  assert.equal(shouldShowMenu('/hint '), false);
  assert.equal(shouldShowMenu('/stats x'), false);
});

test('argChoices: 只对 /topic 生效', () => {
  assert.ok(argChoices('/topic ').length >= 8);
  assert.ok(argChoices('/topic te').length >= 1);
  assert.deepEqual(argChoices('/hint '), []);
  assert.deepEqual(argChoices('/ask '), []);
});

test('argChoices: 前缀过滤与中文标签匹配', () => {
  assert.deepEqual(argChoices('/topic net').map((c) => c.value), ['network']);
  assert.deepEqual(argChoices('/topic 文本').map((c) => c.value), ['text']);
  assert.deepEqual(argChoices('/topic zzz'), []);
});

test('argChoices: 已输入完整参数后不再提示', () => {
  assert.deepEqual(argChoices('/topic text '), []);
});

test('TOPIC_CHOICES: 每个主题都有中文标签', () => {
  for (const c of TOPIC_CHOICES) {
    assert.ok(c.label.length > 0, `${c.value} 缺标签`);
  }
});

test('CommandMenu: 渲染候选与选中项说明', () => {
  const items = filterCommands('/');
  const { lastFrame } = render(
    React.createElement(CommandMenu, { items, activeIndex: 0, input: '/', argItems: [] }),
  );
  const frame = lastFrame() ?? '';
  assert.match(frame, /hint/, '应列出指令名');
  assert.match(frame, /要提示，逐级加深/, '应显示说明');
  assert.match(frame, /用法/, '应显示用法区');
});

test('CommandMenu: 切换选中项时说明随之变化', () => {
  const items = filterCommands('/');
  const first = render(React.createElement(CommandMenu, { items, activeIndex: 0, input: '/', argItems: [] }));
  const second = render(React.createElement(CommandMenu, { items, activeIndex: 2, input: '/', argItems: [] }));
  assert.notEqual(first.lastFrame(), second.lastFrame(), '不同选中项应渲染不同说明');
  assert.match(second.lastFrame() ?? '', /参考答案/);
});

test('CommandMenu: 无匹配时给出提示而不是空白', () => {
  const { lastFrame } = render(
    React.createElement(CommandMenu, { items: [], activeIndex: 0, input: '/zzz', argItems: [] }),
  );
  assert.match(lastFrame() ?? '', /没有匹配的指令/);
});

test('CommandMenu: 参数区展示可选值与标签', () => {
  const { lastFrame } = render(
    React.createElement(CommandMenu, { items: [], activeIndex: 0, input: '/topic ', argItems: argChoices('/topic ') }),
  );
  const frame = lastFrame() ?? '';
  assert.match(frame, /可选值/);
  assert.match(frame, /files/);
  assert.match(frame, /文件与目录/);
  assert.ok(!frame.includes('没有匹配的指令'), '参数区不应误报“没有匹配的指令”');
});

test('CommandMenu: 需要参数的指令带 <参数> 标记', () => {
  const { lastFrame } = render(
    React.createElement(CommandMenu, { items: filterCommands('/'), activeIndex: 0, input: '/', argItems: [] }),
  );
  assert.match(lastFrame() ?? '', /<参数>/);
});
