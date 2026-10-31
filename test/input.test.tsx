/**
 * InputBar 的行为测试：重点验证“快捷键不会漏进输入框”。
 * 这是实际踩过的坑——用 ink-text-input 时 Ctrl-G 会把 'g' 插进输入框。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { InputBar, type ShortcutKey } from '../src/tui/components/InputBar.tsx';

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
  onShortcut,
  active = true,
  onSubmitSpy,
  onChangeSpy,
}: {
  initial?: string;
  onShortcut?: (input: string, key: ShortcutKey) => boolean;
  active?: boolean;
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
    onShortcut,
    active,
  });
}

test('InputBar: 普通字符进入输入框', async () => {
  const seen: string[] = [];
  const instance = render(
    React.createElement(Harness, { onChangeSpy: (v: string) => seen.push(v) }),
  );
  await type(instance, 'ls -la');
  assert.equal(seen.at(-1), 'ls -la');
});

test('InputBar: 回车触发 onSubmit', async () => {
  let submitted = '';
  const instance = render(
    React.createElement(Harness, {
      initial: 'ls',
      onSubmitSpy: (v: string) => {
        submitted = v;
      },
    }),
  );
  instance.stdin.write('\r');
  await tick();
  assert.equal(submitted, 'ls');
});

test('InputBar: 快捷键命中时不插入文本', async () => {
  const seen: string[] = [];
  const hits: string[] = [];
  const instance = render(
    React.createElement(Harness, {
      onChangeSpy: (v: string) => seen.push(v),
      onShortcut: (input: string, key: ShortcutKey) => {
        if (key.ctrl) {
          hits.push(input);
          return true;
        }
        return false;
      },
    }),
  );

  // Ctrl-G = \u0007
  instance.stdin.write('\u0007');
  await tick();
  assert.deepEqual(hits, ['g'], '应识别为 ctrl+g');
  assert.deepEqual(seen, [], '快捷键不得把 g 插入输入框');

  // Ctrl-X = \u0018
  instance.stdin.write('\u0018');
  await tick();
  assert.deepEqual(hits, ['g', 'x']);
  assert.deepEqual(seen, [], '快捷键不得把 x 插入输入框');
});

test('InputBar: 未被消费的 ctrl 组合也不插入字母', async () => {
  const seen: string[] = [];
  const instance = render(
    React.createElement(Harness, { onChangeSpy: (v: string) => seen.push(v), onShortcut: () => false }),
  );
  instance.stdin.write('\u0002'); // Ctrl-B
  await tick();
  assert.deepEqual(seen, [], 'ctrl 组合不是文本输入');
});

test('InputBar: active=false 时不接收字符，但快捷键仍生效', async () => {
  const seen: string[] = [];
  const hits: string[] = [];
  const instance = render(
    React.createElement(Harness, {
      active: false,
      onChangeSpy: (v: string) => seen.push(v),
      onShortcut: (input: string, key: ShortcutKey) => {
        if (key.ctrl) {
          hits.push(input);
          return true;
        }
        return false;
      },
    }),
  );

  await type(instance, 'abc');
  assert.deepEqual(seen, [], '忙碌时不应接受输入');

  instance.stdin.write('\u0001'); // Ctrl-A
  await tick();
  assert.deepEqual(hits, ['a'], '忙碌时快捷键仍可用');
});

test('InputBar: 退格删除光标前一个字符', async () => {
  const seen: string[] = [];
  const instance = render(
    React.createElement(Harness, { initial: 'ls -la', onChangeSpy: (v: string) => seen.push(v) }),
  );
  instance.stdin.write('\u007f'); // backspace
  await tick();
  assert.equal(seen.at(-1), 'ls -l');
});

test('InputBar: 空值显示占位符', () => {
  const instance = render(
    React.createElement(InputBar, { value: '', onChange: () => {}, onSubmit: () => {}, placeholder: '输入命令' }),
  );
  assert.match(instance.lastFrame() ?? '', /输入命令/);
});
