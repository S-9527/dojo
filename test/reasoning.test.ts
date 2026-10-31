/**
 * 推理模型的自动补救。
 * 实测坑：SenseNova Flash-Lite 会先花 token 思考，
 * 预算不够时 content 为空、finish_reason=length，表现为“结构不对”。
 * 正确做法不是报错，而是自动放大预算重试。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Tutor } from '../src/tutor.ts';
import type { ResolvedConfig } from '../src/types.ts';

const EXERCISE = {
  title: '统计',
  scenario: '假想环境：/tmp 下有 3 个文件。',
  question: '统计文件个数。',
  acceptance: ['输出 3'],
  reference_answer: 'ls /tmp | wc -l',
  explanation: 'ls 列出，wc -l 计数。',
  common_mistakes: [],
  hints: ['用 ls', '配合 wc', 'ls /tmp | wc -l'],
};

/** 起一个"预算不足就只返回 reasoning"的假推理模型。 */
async function withReasoningServer(
  threshold: number,
  fn: (baseUrl: string, seen: number[]) => Promise<void>,
) {
  const seen: number[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = JSON.parse(body || '{}') as { max_tokens?: number };
      seen.push(Number(payload.max_tokens));
      res.writeHead(200, { 'content-type': 'application/json' });
      if (Number(payload.max_tokens) < threshold) {
        // 思考把 token 吃光，正文没开始
        res.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', reasoning: '我在认真思考这道题…' }, finish_reason: 'length' }],
            usage: { completion_tokens: payload.max_tokens, completion_tokens_details: { reasoning_tokens: payload.max_tokens } },
          }),
        );
        return;
      }
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(EXERCISE) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  try {
    await fn(`http://127.0.0.1:${addr.port}/v1`, seen);
  } finally {
    server.close();
  }
}

const baseConfig = (baseUrl: string): ResolvedConfig => ({
  mock: false,
  baseUrl,
  apiKey: 'k',
  model: 'reasoning-model',
  stream: true,
  timeoutMs: 5000,
});

test('推理模型预算不足时自动放大并重试成功', async () => {
  await withReasoningServer(4000, async (baseUrl, seen) => {
    const tutor = new Tutor({ config: baseConfig(baseUrl) });
    const ex = await tutor.generateExercise({ topic: 'files', difficulty: 'easy' });
    assert.equal(ex.title, '统计');
    assert.ok(seen.length >= 2, '应该重试过至少一次');
    assert.ok((seen[1] as number) > (seen[0] as number), '重试时的预算必须更大');
    assert.ok((seen[1] as number) <= 6000, `不得突破上限，实际 ${seen[1]}`);
  });
});

test('重试成功后记住这是推理模型，后续调用直接用放大预算', async () => {
  await withReasoningServer(4000, async (baseUrl) => {
    const tutor = new Tutor({ config: baseConfig(baseUrl) });
    await tutor.generateExercise({ topic: 'files', difficulty: 'easy' });
    assert.equal(tutor.config.isReasoningModel, true, '应记住模型特性');
  });
});

test('预算已经足够时只调用一次，不做多余重试', async () => {
  await withReasoningServer(0, async (baseUrl, seen) => {
    const tutor = new Tutor({ config: baseConfig(baseUrl) });
    await tutor.generateExercise({ topic: 'files', difficulty: 'easy' });
    assert.equal(seen.length, 1, '不该多花一次请求');
  });
});

test('两次都不够时给出明确建议而不是含糊报错', async () => {
  await withReasoningServer(999999, async (baseUrl) => {
    const tutor = new Tutor({ config: baseConfig(baseUrl) });
    await assert.rejects(
      () => tutor.generateExercise({ topic: 'files', difficulty: 'easy' }),
      (err: Error) => {
        assert.match(err.message, /推理模型|token/);
        assert.match(err.message, /DOJO_TOKEN_SCALE/, '应给出可操作的解决办法');
        return true;
      },
    );
  });
});

test('tokenScale 配置能整体放大预算', async () => {
  await withReasoningServer(0, async (baseUrl, seen) => {
    const tutor = new Tutor({ config: { ...baseConfig(baseUrl), tokenScale: 2 } });
    await tutor.generateExercise({ topic: 'files', difficulty: 'easy' });
    // 出题基础预算 2500，用户放大 2 倍
    assert.equal(seen[0], 5000);
  });
});

/**
 * 预算上限：这是实际踩到的坑。
 * 之前推理倍数(×3)与重试倍数(×1.5)相乘，再叠加语言重试，
 * 最坏情况 6 次请求 × 9000 token，用户出一次题要等近两分钟。
 */
test('预算有硬上限，不会随重试无限放大', async () => {
  await withReasoningServer(999_999, async (baseUrl, seen) => {
    const tutor = new Tutor({ config: baseConfig(baseUrl) });
    await assert.rejects(() => tutor.generateExercise({ topic: 'files', difficulty: 'easy' }));
    for (const n of seen) {
      assert.ok(n <= 6000, `单次预算 ${n} 超过上限 6000`);
    }
    assert.ok(seen.length <= 4, `请求次数 ${seen.length} 过多，说明在反复试探预算`);
  });
});

test('探明够用的预算会被记住，后续不再从小预算重新试探', async () => {
  // 阈值 4000：第一次 2500 不够，放大到 5000 才成功
  await withReasoningServer(4000, async (baseUrl, seen) => {
    const tutor = new Tutor({ config: baseConfig(baseUrl) });
    await tutor.generateExercise({ topic: 'files', difficulty: 'easy' });
    const firstRound = seen.length;

    // 第二次调用应直接使用记住的预算，不再有「小预算失败」那一步
    await tutor.generateExercise({ topic: 'files', difficulty: 'easy' });
    const secondRound = seen.slice(firstRound);
    assert.equal(secondRound.length, 1, '第二次应一次成功');
    assert.ok((secondRound[0] as number) >= 5000, `第二次应直接用够用的预算，实际 ${secondRound[0]}`);
  });
});
