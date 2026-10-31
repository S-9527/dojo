/**
 * 端到端验证：起一个假的 OpenAI 兼容服务，验证真实 HTTP 路径。
 * 覆盖：非流式 JSON 出题、流式答疑（SSE）、鉴权头、错误码提示。
 */
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { Tutor } from '../src/tutor.ts';
import type { ResolvedConfig } from '../src/types.ts';

const EXERCISE = {
  title: '统计行数',
  scenario: '假想环境：/tmp/app.log 有 500 行。',
  question: '统计 /tmp/app.log 的行数。',
  acceptance: ['输出一个数字'],
  reference_answer: 'wc -l /tmp/app.log',
  explanation: 'wc -l 统计行数。',
  common_mistakes: ['用 wc -c 统计字节'],
  hints: ['想想 wc 的参数', '用 -l 选项', 'wc -l /tmp/app.log'],
  difficulty: '入门',
};

interface Captured {
  url: string;
  auth: string | undefined;
  payload: Record<string, any>;
}

const requests: Captured[] = [];

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const payload = JSON.parse(body || '{}') as Record<string, any>;
    requests.push({ url: req.url ?? '', auth: req.headers.authorization, payload });

    // 模拟真实网关：路径不对就 404
    if (!(req.url ?? '').startsWith('/v1/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }

    if (req.headers.authorization !== 'Bearer test-key') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'bad key' } }));
      return;
    }

    const messages = (payload.messages ?? []) as Array<{ role: string; content: string }>;
    const userText = messages.map((m) => m.content).join('\n');

    if (payload.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const piece of ['流式', '回答', '正常']) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    let content: string;
    if (userText.includes('请出一道')) {
      // 故意包一层 ``` 围栏和解释文字，验证宽松解析
      content = `好的，题目如下：\n\`\`\`json\n${JSON.stringify(EXERCISE)}\n\`\`\``;
    } else if (userText.includes('请批改')) {
      content = JSON.stringify({
        verdict: 'correct',
        score: 100,
        reason: '等价写法',
        corrected_answer: '',
        knowledge_points: ['wc'],
      });
    } else {
      content = '普通回答';
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('无法获取端口');
const { port } = address;

const config: ResolvedConfig = {
  mock: false,
  baseUrl: `http://127.0.0.1:${port}/v1`,
  apiKey: 'test-key',
  model: 'fake-model',
  stream: true,
  timeoutMs: 5000,
};

try {
  const tutor = new Tutor({ config });

  // 1) 出题：验证围栏 + 解释文字能被解析
  const ex = await tutor.generateExercise({ topic: 'text', difficulty: 'easy' });
  assert.equal(ex.title, '统计行数');
  assert.equal(ex.hints.length, 3);
  assert.equal(requests[0]?.payload.response_format.type, 'json_object');
  assert.equal(requests[0]?.payload.model, 'fake-model');

  // 2) 判题
  const grade = await tutor.grade(ex, 'cat /tmp/app.log | wc -l');
  assert.equal(grade.verdict, 'correct');
  assert.equal(grade.score, 100);

  // 3) 流式答疑
  let streamed = '';
  const answer = await tutor.ask('wc 和 cat 有什么区别？', { onDelta: (d) => (streamed += d) });
  assert.equal(answer, '流式回答正常');
  assert.equal(streamed, '流式回答正常');
  assert.ok(requests.at(-1)?.payload.stream, '流式请求应带 stream: true');

  // 4) 鉴权失败要给出可读提示
  const badTutor = new Tutor({ config: { ...config, apiKey: 'wrong' } });
  await assert.rejects(
    () => badTutor.generateExercise({ topic: 'text', difficulty: 'easy' }),
    (err: Error) => {
      assert.match(err.message, /鉴权失败/);
      return true;
    },
  );

  // 5) BASE_URL 路径错误要提示 /v1
  const wrongPath = new Tutor({ config: { ...config, baseUrl: `http://127.0.0.1:${port}/nope` } });
  await assert.rejects(() => wrongPath.generateExercise({ topic: 'text', difficulty: 'easy' }), /404|接口不存在/);

  // 6) 连接失败要有可读提示
  const offline = new Tutor({ config: { ...config, baseUrl: 'http://127.0.0.1:1/v1', timeoutMs: 1000 } });
  await assert.rejects(() => offline.generateExercise({ topic: 'text', difficulty: 'easy' }), /无法连接/);

  console.log('\n✅ HTTP 端到端验证通过（出题 / 判题 / 流式答疑 / 鉴权 / 404 / 连接失败）');
} finally {
  server.close();
}
