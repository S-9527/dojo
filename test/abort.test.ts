/**
 * 请求中断（Esc 取消）。
 * Claude Code / opencode 都把「随时能中断」当基本能力：
 * 慢请求不能变成只能干等，用户必须能取消。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Tutor, isAbortError } from '../src/tutor.ts';
import type { ResolvedConfig } from '../src/types.ts';

/** 起一个一直不返回的服务，用于测试中断。 */
async function withHangingServer(fn: (baseUrl: string) => Promise<void>) {
  const server = createServer((req) => {
    req.resume(); // 收下请求但永不响应
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  try {
    await fn(`http://127.0.0.1:${addr.port}/v1`);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

const cfg = (baseUrl: string): ResolvedConfig => ({
  mock: false,
  baseUrl,
  apiKey: 'k',
  model: 'm',
  stream: true,
  timeoutMs: 30_000,
});

test('generateExercise: 传入已中断的 signal 应立即失败而不是干等', async () => {
  await withHangingServer(async (baseUrl) => {
    const tutor = new Tutor({ config: cfg(baseUrl) });
    const controller = new AbortController();
    controller.abort();

    const startedAt = Date.now();
    await assert.rejects(() => tutor.generateExercise({ topic: 'files', difficulty: 'easy', signal: controller.signal }));
    assert.ok(Date.now() - startedAt < 5000, '应立刻返回，不能等到超时');
  });
});

test('grade: 同样支持中断', async () => {
  await withHangingServer(async (baseUrl) => {
    const tutor = new Tutor({ config: cfg(baseUrl) });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() =>
      tutor.grade(
        { title: 't', scenario: 's', question: 'q', acceptance: [], reference_answer: 'ls', explanation: '', common_mistakes: [], hints: [], topic: 'files', difficulty: 'easy' },
        'ls',
        { signal: controller.signal },
      ),
    );
  });
});

test('hint: 同样支持中断', async () => {
  await withHangingServer(async (baseUrl) => {
    const tutor = new Tutor({ config: cfg(baseUrl) });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() =>
      tutor.hint(
        { title: 't', scenario: 's', question: 'q', acceptance: [], reference_answer: 'ls', explanation: '', common_mistakes: [], hints: [], topic: 'files', difficulty: 'easy' },
        0,
        { signal: controller.signal },
      ),
    );
  });
});

test('运行中中断：请求被取消，不会一直挂着', async () => {
  await withHangingServer(async (baseUrl) => {
    const tutor = new Tutor({ config: cfg(baseUrl) });
    const controller = new AbortController();
    const startedAt = Date.now();
    const pending = tutor.generateExercise({ topic: 'files', difficulty: 'easy', signal: controller.signal });

    setTimeout(() => controller.abort(), 200);
    await assert.rejects(() => pending, (err: unknown) => {
      assert.ok(isAbortError(err), `应为中断错误，实际：${String(err)}`);
      return true;
    });
    assert.ok(Date.now() - startedAt < 5000, '中断应立即生效');
  });
});

test('isAbortError: 只在真正的取消场景返回 true', () => {
  assert.equal(isAbortError(new Error('请求已取消或超时')), true);
  const aborted = new Error('aborted');
  aborted.name = 'AbortError';
  assert.equal(isAbortError(aborted), true);
  assert.equal(isAbortError(new Error('接口报错（HTTP 500）')), false);
  assert.equal(isAbortError('字符串错误'), false);
});
