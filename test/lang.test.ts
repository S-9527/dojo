/**
 * 语言漂移检测。
 * 真实 case：SenseNova 出题时把叙述写成了日文
 * （"ディレクトリに numbers.txt があり…"），提示词约束不住，靠这层兜底。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectForeignLanguage, describeLanguageIssue } from '../src/lang.ts';

test('检测：截图里的真实日文混杂', () => {
  const text = '/tmp/demo ディレクトリに numbers.txt があり、1 から 10 までの整数が書かれています。';
  const issue = detectForeignLanguage(text);
  assert.ok(issue, '应该检测出来');
  assert.equal(issue?.language, 'japanese');
});

test('检测：正常中文不误报', () => {
  assert.equal(detectForeignLanguage('在 /tmp/demo 目录下有 numbers.txt，每行一个整数。'), null);
  assert.equal(detectForeignLanguage('统计每个 IP 出现的次数，按次数从高到低输出前 5 名。'), null);
});

test('检测：中文里夹日文文件名不算违规', () => {
  // 文件名属于专有名词，模型照抄是合理的
  assert.equal(detectForeignLanguage('请读取 /tmp/日本語.txt 的内容。'), null);
});

test('检测：代码块内的日文不算违规', () => {
  // 测试数据里出现日文是合理的，不该因此重试
  const text = '请执行：\n```bash\ngrep ディレクトリ file.txt\n```\n然后观察输出。';
  assert.equal(detectForeignLanguage(text), null);
});

test('检测：行内代码里的日文同样跳过', () => {
  assert.equal(detectForeignLanguage('把 `ディレクトリ` 替换成你的路径。'), null);
});

test('检测：韩文', () => {
  const issue = detectForeignLanguage('이 파일을 읽으세요');
  assert.equal(issue?.language, 'korean');
});

test('检测：日语汉字词（无假名）', () => {
  const issue = detectForeignLanguage('このファイルを実行してください');
  assert.ok(issue);
  assert.equal(issue?.language, 'japanese');
});

test('检测：纯英文不误报（术语保留英文是允许的）', () => {
  assert.equal(detectForeignLanguage('使用 grep 命令过滤 ERROR 行。'), null);
  assert.equal(detectForeignLanguage('The file contains 3 lines.'), null);
});

test('describeLanguageIssue: 带出证据便于定位', () => {
  const issue = detectForeignLanguage('ディレクトリ');
  assert.ok(issue);
  const desc = describeLanguageIssue(issue);
  assert.match(desc, /日文/);
  assert.match(desc, /ディレクトリ/);
});

test('检测：空字符串与纯符号不崩', () => {
  assert.equal(detectForeignLanguage(''), null);
  assert.equal(detectForeignLanguage('--- === ###'), null);
});
