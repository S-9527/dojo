/**
 * 启动路径的测试。
 * 重点：确认「没有 API Key」时不会直接报错退出，而是把用户送进 /connect 向导。
 * 这是实际用起来最容易劝退的一步——新用户第一次运行就撞墙。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../src/cli.ts';
import { resolveConfig } from '../src/config.ts';

test('parseArgs: 解析位置参数', () => {
  const args = parseArgs(['stats']);
  assert.deepEqual(args._, ['stats']);
});

test('parseArgs: 解析 --key value', () => {
  assert.equal(parseArgs(['--topic', 'text']).topic, 'text');
});

test('parseArgs: 解析 --key=value', () => {
  assert.equal(parseArgs(['--topic=text']).topic, 'text');
});

test('parseArgs: 布尔开关不带值', () => {
  assert.equal(parseArgs(['--mock']).mock, true);
});

test('parseArgs: 开关后面跟另一个开关时不吞掉', () => {
  const args = parseArgs(['--mock', '--plain']);
  assert.equal(args.mock, true);
  assert.equal(args.plain, true);
});

test('parseArgs: 位置参数与选项混用', () => {
  const args = parseArgs(['connect', '--model', 'm1']);
  assert.deepEqual(args._, ['connect']);
  assert.equal(args.model, 'm1');
});

test('resolveConfig: mock 模式下即使无 Key 也放行', () => {
  const cfg = resolveConfig({ env: { DOJO_MOCK: '1' }, file: {}, argv: {} });
  assert.equal(!cfg.mock && !cfg.apiKey, false, 'mock 为真时不应被 Key 检查拦下');
});

test('resolveConfig: 有 Key 时正常放行', () => {
  const cfg = resolveConfig({ env: { DOJO_API_KEY: 'sk-x' }, file: {}, argv: {} });
  assert.equal(!cfg.mock && !cfg.apiKey, false);
});

/** 捕获一次 main() 的 stdout/stderr，避免污染测试输出。 */
async function captureMain(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...a: unknown[]) => chunks.push(a.join(' '));
  console.error = (...a: unknown[]) => errChunks.push(a.join(' '));
  try {
    const { main } = await import('../src/cli.ts');
    const code = await main(args);
    return { code, out: chunks.join('\n'), err: errChunks.join('\n') };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test('CLI 无 Key + 非 TTY：打印多条出路并返回非零', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lt-cli-'));
  try {
    process.env.XDG_CONFIG_HOME = dir;
    process.env.XDG_DATA_HOME = dir;
    delete process.env.DOJO_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DOJO_MOCK;

    const { code, err } = await captureMain([]);
    assert.notEqual(code, 0, '非 TTY 下应返回非零');
    assert.match(err, /没有配置 API Key/);
    assert.match(err, /DOJO_API_KEY/, '应给出环境变量方式');
    assert.match(err, /connect/, '应提示 connect 命令');
    assert.match(err, /--mock/, '应提示离线体验方式');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --help：返回 0 且列出 connect 与 mock', async () => {
  const { code, out } = await captureMain(['--help']);
  assert.equal(code, 0);
  assert.match(out, /connect/);
  assert.match(out, /--mock/);
});
