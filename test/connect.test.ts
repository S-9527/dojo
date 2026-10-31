/**
 * /connect 相关测试。
 * 覆盖：配置落盘、权限、部分更新不冲掉其它字段、预设完整性、连接探测、Key 脱敏。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  saveConfigFile,
  loadConfigFile,
  resolveConfig,
  maskKey,
  PROVIDER_PRESETS,
} from '../src/config.ts';
import { probeConnection, describeProbe } from '../src/probe.ts';
import type { ResolvedConfig } from '../src/types.ts';

const withTempDir = async (fn: (dir: string) => Promise<void> | void) => {
  const dir = mkdtempSync(join(tmpdir(), 'lt-connect-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('saveConfigFile: 写入后可读回', async () => {
  await withTempDir((dir) => {
    const path = join(dir, 'config.json');
    saveConfigFile({ baseUrl: 'https://api.test/v1', model: 'm1', apiKey: 'sk-abc123456' }, path);

    const loaded = loadConfigFile(path);
    assert.equal(loaded.baseUrl, 'https://api.test/v1');
    assert.equal(loaded.model, 'm1');
    assert.equal(loaded.apiKey, 'sk-abc123456');
  });
});

test('saveConfigFile: 权限为 0600（含 Key，不能是全局可读）', async () => {
  await withTempDir((dir) => {
    const path = join(dir, 'config.json');
    saveConfigFile({ baseUrl: 'https://x/v1', model: 'm' }, path);
    const mode = statSync(path).mode & 0o777;
    assert.equal(mode, 0o600, `期望 0600，实际 ${mode.toString(8)}`);
  });
});

test('saveConfigFile: 只更新提供的字段，不冲掉其它设置', async () => {
  await withTempDir((dir) => {
    const path = join(dir, 'config.json');
    saveConfigFile({ baseUrl: 'https://a/v1', model: 'm1', apiKey: 'sk-1', timeoutMs: 5000 }, path);
    // 只改模型名
    saveConfigFile({ model: 'm2' }, path);

    const loaded = loadConfigFile(path);
    assert.equal(loaded.model, 'm2');
    assert.equal(loaded.baseUrl, 'https://a/v1', 'baseUrl 不应被清掉');
    assert.equal(loaded.apiKey, 'sk-1', 'apiKey 不应被清掉');
    assert.equal(loaded.timeoutMs, 5000, 'timeoutMs 不应被清掉');
  });
});

test('saveConfigFile: 空字符串不会覆盖已有值', async () => {
  await withTempDir((dir) => {
    const path = join(dir, 'config.json');
    saveConfigFile({ apiKey: 'sk-original' }, path);
    saveConfigFile({ apiKey: '' }, path);
    assert.equal(loadConfigFile(path).apiKey, 'sk-original');
  });
});

test('saveConfigFile: 目录不存在时自动创建', async () => {
  await withTempDir((dir) => {
    const path = join(dir, 'deep', 'nested', 'config.json');
    saveConfigFile({ model: 'x' }, path);
    assert.ok(existsSync(path));
  });
});

test('saveConfigFile: 配置文件损坏时能重建而不是崩', async () => {
  await withTempDir((dir) => {
    const path = join(dir, 'config.json');
    writeFileSync(path, '{broken json');
    saveConfigFile({ model: 'recovered' }, path);
    assert.equal(loadConfigFile(path).model, 'recovered');
  });
});

test('resolveConfig: 保存后的文件能被正确读取', async () => {
  await withTempDir((dir) => {
    const path = join(dir, 'config.json');
    saveConfigFile({ baseUrl: 'http://127.0.0.1:9999/v1', model: 'saved-model', apiKey: 'sk-saved' }, path);
    const cfg = resolveConfig({ env: {}, file: loadConfigFile(path), argv: {} });
    assert.equal(cfg.baseUrl, 'http://127.0.0.1:9999/v1');
    assert.equal(cfg.model, 'saved-model');
    assert.equal(cfg.apiKey, 'sk-saved');
  });
});

test('maskKey: 不泄露完整 Key', () => {
  const key = 'sk-1234567890abcdef';
  const masked = maskKey(key);
  assert.ok(!masked.includes(key), '不能原样返回');
  assert.ok(masked.length < key.length);
  assert.match(masked, /\*\*\*/);
});

test('maskKey: 短 Key 也做了掩码', () => {
  assert.equal(maskKey('abc'), 'a***');
  assert.equal(maskKey(''), '');
});

test('PROVIDER_PRESETS: 每个预设都有完整字段', () => {
  assert.ok(PROVIDER_PRESETS.length >= 5);
  const ids = new Set<string>();
  for (const p of PROVIDER_PRESETS) {
    assert.ok(p.id && !ids.has(p.id), `id 重复或为空: ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name.length > 0);
    assert.ok(p.baseUrl.startsWith('http'), `${p.name} 的 baseUrl 不合法`);
    assert.ok(p.model.length > 0);
    assert.ok(p.note.length > 0);
  }
});

test('PROVIDER_PRESETS: 云端预设都标为需要 Key，本地 Ollama 不需要', () => {
  const ollama = PROVIDER_PRESETS.find((p) => p.id === 'ollama');
  assert.equal(ollama?.needsKey, false);
  for (const p of PROVIDER_PRESETS.filter((x) => x.id !== 'ollama')) {
    assert.equal(p.needsKey, true, `${p.name} 应该需要 Key`);
  }
});

/** 起一个可控的假服务，测 probeConnection。 */
async function withServer(
  handler: (req: { auth?: string; url: string }, res: import('node:http').ServerResponse) => void,
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => handler({ auth: req.headers.authorization, url: req.url ?? '' }, res));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  try {
    await fn(`http://127.0.0.1:${addr.port}/v1`);
  } finally {
    server.close();
  }
}

const baseCfg: ResolvedConfig = {
  mock: false,
  baseUrl: '',
  apiKey: 'sk-test',
  model: 'test-model',
  stream: true,
  timeoutMs: 5000,
};

test('probeConnection: 正常返回结果并带上耗时', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '好' } }] }));
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, true);
      assert.equal(result.message, '好');
      assert.ok(result.latencyMs >= 0);
    },
  );
});

test('probeConnection: 401 给出鉴权提示', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(401);
      res.end('{"error":"bad key"}');
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /鉴权失败|API Key/);
    },
  );
});

test('probeConnection: 404 提示 BASE_URL 写法', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(404);
      res.end('not found');
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /404|BASE_URL/);
    },
  );
});

test('probeConnection: 返回结构不对时明确报错', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ unexpected: true }));
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /不是可识别|已尝试/);
    },
  );
});

test('probeConnection: 地址不可达时返回失败而不是抛异常', async () => {
  const result = await probeConnection({ ...baseCfg, baseUrl: 'http://127.0.0.1:1/v1', timeoutMs: 1500 });
  assert.equal(result.ok, false);
  assert.match(result.message, /无法连接|超时/);
});

test('probeConnection: 请求带上了 Bearer 鉴权头', async () => {
  let seenAuth: string | undefined;
  await withServer(
    (req, res) => {
      seenAuth = req.auth;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    },
    async (baseUrl) => {
      await probeConnection({ ...baseCfg, baseUrl, apiKey: 'sk-verify' });
      assert.equal(seenAuth, 'Bearer sk-verify');
    },
  );
});

test('describeProbe: 成功与失败文案不同', () => {
  assert.match(describeProbe({ ok: true, message: '好', latencyMs: 12 }), /连接正常.*12ms/);
  assert.match(describeProbe({ ok: false, message: '鉴权失败', latencyMs: 5 }), /连接失败/);
});

/**
 * 401 / 404 的区分能力。
 * 这是真实踩坑点：SenseNova 地址写错时也返回 401，
 * 用户看到「鉴权失败」会一直怀疑 Key，其实是路径问题。
 */
test('probeConnection: 假路径返回 404 时判定为地址错误', async () => {
  await withServer(
    (req, res) => {
      // 探活用的假路径返回 404，其余返回 401（模拟"路径正常但 Key 错"）
      if (req.url.includes('__dojo_probe__')) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(401);
      res.end('{"error":"bad key"}');
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /鉴权失败/);
      assert.match(result.message, /问题在 Key/, '假路径 404 说明路由正常，应指向 Key 问题');
    },
  );
});

test('probeConnection: 网关对任何路径都 401 时不武断下结论', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(401);
      res.end('{"error":"bad key"}');
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /可能是 Key 无效，也可能是 BASE_URL 不对/, '无法区分时应同时提示两种可能');
    },
  );
});

test('SenseNova 预设：地址与模型名符合官方要求', () => {
  const preset = PROVIDER_PRESETS.find((p) => p.id === 'sensenova');
  assert.ok(preset, '应有 sensenova 预设');
  assert.equal(preset.baseUrl, 'https://token.sensenova.cn/v1', '必须以 /v1 结尾');
  assert.match(preset.model, /^sensenova-\d+\.\d+-flash-lite$/, '模型名应为小写且带版本号');
});

/**
 * HTTP 200 但结构不对 —— 这是实际遇到的情况（SenseNova 额度问题时返回 200 + 错误体）。
 * 关键要求：必须把真实返回带出来，否则用户完全没法排查。
 */
test('probeConnection: 200 + 错误体应识别为业务错误而非"结构不对"', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 1001, message: '积分不足' } }));
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /积分不足/, '应带出服务端的原始错误信息');
    },
  );
});

test('probeConnection: 200 + 无法识别的结构应原样展示收到的内容', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ something: 'unexpected', value: 42 }));
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /unexpected/, '必须把实际收到的内容打出来');
      assert.match(result.message, /已尝试/, '应说明尝试过哪些字段路径');
    },
  );
});

test('probeConnection: 200 但返回 HTML（例如打到了网页入口）应明确提示', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>login page</body></html>');
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, false);
      assert.match(result.message, /login page|不是可识别/);
    },
  );
});

test('probeConnection: 兼容 choices[0].message.content 为分段数组', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: '好' }] } }] }));
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, true);
      assert.equal(result.message, '好');
    },
  );
});

/**
 * 推理模型（SenseNova / DeepSeek-R1 类）把 token 全花在 reasoning 上，
 * content 为空且 finish_reason=length。这是实测踩到的：
 * 原来 max_tokens=8 时 8 个 token 全被思考过程吃掉，误报“结构不对”。
 */
test('probeConnection: 推理模型被截断应判为连接正常', async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'x',
          model: 'sensenova-6.8-flash-lite',
          object: 'chat.completion',
          choices: [
            { index: 0, message: { role: 'assistant', reasoning: '我们只需要回复一个字"好"。用户' }, finish_reason: 'length' },
          ],
          usage: { prompt_tokens: 131, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 8 } },
        }),
      );
    },
    async (baseUrl) => {
      const result = await probeConnection({ ...baseCfg, baseUrl });
      assert.equal(result.ok, true, '连接本身是通的，不能因为被截断就判失败');
      assert.match(result.message, /推理模型|连接正常/);
    },
  );
});

test('probeConnection: 探测请求的 max_tokens 足够推理模型使用', async () => {
  let seen: Record<string, unknown> = {};
  await withServer(
    (req, res) => {
      void req;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    },
    async (baseUrl) => {
      // 直接抓取请求体
      const orig = globalThis.fetch;
      globalThis.fetch = (async (input: any, init: any) => {
        try {
          seen = JSON.parse(init?.body ?? '{}');
        } catch {
          seen = {};
        }
        return orig(input, init);
      }) as typeof fetch;
      try {
        await probeConnection({ ...baseCfg, baseUrl });
      } finally {
        globalThis.fetch = orig;
      }
      const maxTokens = Number(seen.max_tokens);
      assert.ok(maxTokens >= 64, `max_tokens 应给推理模型留足空间，实际 ${maxTokens}`);
    },
  );
});
