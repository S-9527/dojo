/**
 * InputBar 的行为测试（insert 模式）。
 *
 * 模态之后这个组件的职责变简单了：**只管文本**，不再拦截任何快捷键。
 * 原来那批「快捷键不能漏进输入框」的测试因此失去意义 ——
 * 冲突在设计上就不存在了：normal 模式下本组件 isActive=false。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { InputBar } from '../src/tui/components/InputBar.tsx';

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

async function type(instance: ReturnType<typeof render>, text: string) {
  for (const ch of text) {
    instance.stdin.write(ch);
    await tick();
  }
}

/** 受控组件测试壳：把 value 存进 React state，模拟真实用法。 */
function Harness({
  initial = '',
  active = true,
  onEscape,
  onQuit,
  onSubmitSpy,
  onChangeSpy,
}: {
  initial?: string;
  active?: boolean;
  onEscape?: () => void;
  onQuit?: () => void;
  onSubmitSpy?: (v: string) => void;
  onChangeSpy?: (v: string) => void;
}): React.JSX.Element {
  const [value, setValue] = React.useState(initial);
  return React.createElement(InputBar, {
    value,
    onChange: (v: string) => {
      setValue(v);
      onChangeSpy?.(v);
    },
    onSubmit: (v: string) => onSubmitSpy?.(v),
    onEscape: () => onEscape?.(),
    onQuit,
    active,
  });
}

test('InputBar: 普通字符进入输入框', async () => {
  const seen: string[] = [];
  const instance = render(React.createElement(Harness, { onChangeSpy: (v: string) => seen.push(v) }));
  await type(instance, 'ls -la');
  assert.equal(seen.at(-1), 'ls -la');
  instance.unmount();
});

test('InputBar: 中文与管道符也能正常输入', async () => {
  const seen: string[] = [];
  const instance = render(React.createElement(Harness, { onChangeSpy: (v: string) => seen.push(v) }));
  await type(instance, "awk '{print $1}' f | sort");
  assert.equal(seen.at(-1), "awk '{print $1}' f | sort");
  instance.unmount();
});

test('InputBar: 回车触发 onSubmit', async () => {
  let submitted = '';
  const instance = render(
    React.createElement(Harness, { initial: 'ls', onSubmitSpy: (v: string) => (submitted = v) }),
  );
  instance.stdin.write('\r');
  await tick();
  assert.equal(submitted, 'ls');
  instance.unmount();
});

test('InputBar: Esc 触发 onEscape，不提交也不改内容', async () => {
  let escaped = 0;
  let submitted = '';
  const seen: string[] = [];
  const instance = render(
    React.createElement(Harness, {
      initial: 'chmod 600 f',
      onEscape: () => (escaped += 1),
      onSubmitSpy: (v: string) => (submitted = v),
      onChangeSpy: (v: string) => seen.push(v),
    }),
  );
  instance.stdin.write('\u001b');
  await tick();
  assert.equal(escaped, 1, '应回到命令模式');
  assert.equal(submitted, '', 'Esc 不应提交');
  assert.deepEqual(seen, [], 'Esc 不应修改内容');
  instance.unmount();
});

test('InputBar: Ctrl-C 退出（insert 模式下 App 收不到按键，由这里转发）', async () => {
  let quit = 0;
  const instance = render(React.createElement(Harness, { onQuit: () => (quit += 1) }));
  instance.stdin.write('\u0003');
  await tick();
  assert.equal(quit, 1);
  instance.unmount();
});

test('InputBar: 未绑定的 ctrl 组合不插入字母', async () => {
  const seen: string[] = [];
  const instance = render(React.createElement(Harness, { onChangeSpy: (v: string) => seen.push(v) }));
  instance.stdin.write('\u0002'); // Ctrl-B
  await tick();
  assert.deepEqual(seen, [], 'ctrl 组合不是文本输入');
  instance.unmount();
});

test('InputBar: active=false 时完全不接收字符', async () => {
  const seen: string[] = [];
  let submitted = '';
  const instance = render(
    React.createElement(Harness, {
      active: false,
      onChangeSpy: (v: string) => seen.push(v),
      onSubmitSpy: (v: string) => (submitted = v),
    }),
  );
  await type(instance, 'abc');
  instance.stdin.write('\r');
  await tick();
  assert.deepEqual(seen, [], '非输入模式下不应接受字符');
  assert.equal(submitted, '', '非输入模式下回车不应提交');
  instance.unmount();
});

test('InputBar: 退格删除光标前一个字符', async () => {
  const seen: string[] = [];
  const instance = render(
    React.createElement(Harness, { initial: 'ls -la', onChangeSpy: (v: string) => seen.push(v) }),
  );
  instance.stdin.write('\u007f');
  await tick();
  assert.equal(seen.at(-1), 'ls -l');
  instance.unmount();
});

test('InputBar: 左右键移动光标后插入位置正确', async () => {
  const seen: string[] = [];
  const instance = render(
    React.createElement(Harness, { initial: 'ab', onChangeSpy: (v: string) => seen.push(v) }),
  );
  instance.stdin.write('\u001b[D'); // ← 光标移到 a 与 b 之间
  await tick();
  instance.stdin.write('X');
  await tick();
  assert.equal(seen.at(-1), 'aXb');
  instance.unmount();
});

test('InputBar: 空值显示占位符', () => {
  const instance = render(
    React.createElement(InputBar, {
      value: '',
      onChange: () => {},
      onSubmit: () => {},
      onEscape: () => {},
      placeholder: '输入命令',
      active: true,
    }),
  );
  assert.match(instance.lastFrame() ?? '', /输入命令/);
  instance.unmount();
});
