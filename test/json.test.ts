import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonLoose, stripTrailingCommas, sliceBalancedObject } from '../src/json.ts';

test('parseJsonLoose: 纯 JSON', () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
});

test('parseJsonLoose: 带 ```json 围栏', () => {
  const raw = '好的，题目如下：\n```json\n{"title":"测试","hints":["a"]}\n```\n希望有帮助';
  assert.equal(parseJsonLoose<{ title: string }>(raw).title, '测试');
});

test('parseJsonLoose: 前后有解释文字', () => {
  const raw = '这是结果 {"verdict":"correct","score":90} 以上。';
  assert.equal(parseJsonLoose<{ verdict: string }>(raw).verdict, 'correct');
});

test('parseJsonLoose: 尾逗号', () => {
  assert.deepEqual(parseJsonLoose('{"a":[1,2,],"b":{"c":3,},}'), { a: [1, 2], b: { c: 3 } });
});

test('parseJsonLoose: 字符串内的括号和逗号不干扰', () => {
  const raw = '{"cmd":"awk \'{print $1}\' f | sort","note":"a,}"}';
  const parsed = parseJsonLoose<{ cmd: string; note: string }>(raw);
  assert.equal(parsed.cmd, "awk '{print $1}' f | sort");
  assert.equal(parsed.note, 'a,}');
});

test('parseJsonLoose: 嵌套多行 JSON', () => {
  const raw = `啊哈
{
  "title": "x",
  "hints": [
    "h1",
    "h2"
  ]
}`;
  assert.deepEqual(parseJsonLoose<{ hints: string[] }>(raw).hints, ['h1', 'h2']);
});

test('parseJsonLoose: 空输入报错', () => {
  assert.throws(() => parseJsonLoose('   '), /为空/);
});

test('parseJsonLoose: 非 JSON 报错并带预览', () => {
  assert.throws(() => parseJsonLoose('抱歉，我无法完成'), /不是合法 JSON/);
});

test('sliceBalancedObject: 正确截断', () => {
  assert.equal(sliceBalancedObject('xx{"a":{"b":1}}yy', 2), '{"a":{"b":1}}');
});

test('stripTrailingCommas: 不动字符串里的逗号', () => {
  assert.equal(stripTrailingCommas('{"a":"x,]",}'), '{"a":"x,]"}');
});
