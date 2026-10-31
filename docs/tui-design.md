# TUI 设计

## 屏幕结构

```
 ◆ dojo                              文本处理 · 进阶 · Mock    ← 顶栏：品牌 / 当前主题难度 / 连接状态

 题目 1 · 按访问量排序                            文本处理 · 进阶 · 2 分    ← 题目卡片

 场景  假想环境：/tmp/access.log 每行 "IP 路径 状态码"，共 1000 行。
 要求  统计每个 IP 出现的次数，按次数从高到低输出前 5 名。

 验收点
   1. 按出现次数降序
   2. 只输出前 5 行
   3. 结果含次数

   ❯ 输入命令，或 /hint 要提示…                                        ← 输入区

 回车提交 · /hint /ask /answer /next /topic /stats 也可用
 Tab 面板 · Ctrl-N 换题 · Ctrl-G 提示 · Ctrl-X 答案 · Ctrl-A 提问 · Ctrl-R 复盘 · Ctrl-C 退出
```

## 面板（Tab 循环）

1. **练习**（默认）：题目卡片 + 作答输入 + 判题结果 / 提示 / 答案
2. **对话**：向助教提问，流式输出，只保留最近 4 轮避免撑爆屏幕
3. **统计**：正确率柱状图、各主题进度、薄弱点

## 状态机

```
loading ──> awaiting ──提交──> grading ──> graded ──Esc/Ctrl-N──> loading
                 │                          │
                 │                          └─Ctrl-X──> revealed(答案叠在卡片下方)
                 │
                 ├─Ctrl-G──> hinting ──> graded(显示提示)
                 ├─Ctrl-A──> asking(聊天面板流式输出) ──> awaiting
                 └─Ctrl-R──> review(统计面板显示复盘) ──> awaiting
```

`busy`（loading/grading/hinting/asking）期间输入框 `active=false`：不接受字符，但快捷键仍然可用，
避免用户在请求进行中连按回车堆积请求。

## 为什么用 Ink

- React 心智模型，组件化好扩展（未来加 Web 可复用状态逻辑）
- 自带 flexbox 布局（Yoga），不用手算宽度
- 声明式渲染，状态变化自动重绘，比手写 ANSI 转义可靠

## 踩过的坑

### 1. Ink 没有事件冒泡

`useInput` 是基于 eventEmitter 的广播：**所有**注册了 `useInput` 的组件都会收到同一个按键，
没有 `stopPropagation`。

`ink-text-input` 内部只拦截 `ctrl+c` / `tab` / 方向键，其它 ctrl 组合的字母仍会被当作普通文本插入。
实测按 `Ctrl-G` 后输入框里会出现 `g`，按 `Ctrl-X` 会出现 `x`，变成 `gx`。

**解法**：自研 `InputBar`（`src/tui/components/InputBar.tsx`），用单一 `useInput` 统一分发：

```ts
if (onShortcut?.(input, shortcutKey)) return;  // 快捷键优先，命中即消费
if (!active) return;
if (key.ctrl || key.meta) return;              // ctrl 组合不是文本
// 其余才当文本处理
```

快捷键与文本输入从此天然互斥，且有测试锁定（`test/input.test.tsx`）。

### 2. Ctrl-H 不是 Ctrl-H

看起来 `Ctrl-H` 是 hint 的自然选择，但终端里 **Ctrl-H 就是退格**：

```
实测 useInput 收到的：input="" ctrl=false backspace=true
```

在 ASCII 中 `Ctrl-H` = 0x08 = Backspace，程序无法区分用户按的是哪个键。
所以提示键改用 `Ctrl-G`。同理要避开 `Ctrl-I`(=Tab)、`Ctrl-J`(=Enter)、`Ctrl-M`(=Enter)、`Ctrl-[`(=Esc)。

### 3. 用布尔值记录「菜单已关闭」会卡死

候选菜单的关闭状态最初写成 `menuDismissed: boolean`：

```ts
// 错的
const menuOpen = !menuDismissed && input.startsWith('/');
useEffect(() => { if (!input.startsWith('/')) setMenuDismissed(false); }, [input]);
```

问题：`/` 一直以 `/` 开头，用户按 `Esc` 关掉菜单后继续输入 `/s`，`menuDismissed` 永远是 `true`，
菜单再也不会弹出。

**解法**：记录「按下 Esc 那一刻的输入内容」，输入一变就自动恢复：

```ts
const [dismissedAt, setDismissedAt] = useState<string | null>(null);
const menuOpen = dismissedAt !== input && shouldShowMenu(input);
```

### 4. `shouldShowMenu` 曾把参数区判死

最初写成 `if (input.includes(' ')) return false;`，结果输入 `/topic ` 后菜单立刻消失，
参数补全永远看不到。正确逻辑是：**有参数候选时菜单应继续显示**：

```ts
export function shouldShowMenu(input: string): boolean {
  if (!input.startsWith('/')) return false;
  const [, ...rest] = input.split(/\s+/);
  if (rest.length > 0) return argChoices(input).length > 0;  // 参数区看有没有候选
  return true;
}
```

与此同时，进入参数区后 `menuItems` 要清空（否则 `Tab` 会把指令名又补一遍），
由独立的 `argItems` 提供参数候选。

## 指令定义的单一来源

`src/commands.ts` 导出 `COMMANDS`（名称、摘要、用法、详解、别名、是否带参数），
三处消费：

| 位置 | 用途 |
| --- | --- |
| `CommandMenu` | 候选列表 + 选中项说明 + 参数候选 |
| `App` 的 `/help` | 帮助面板 |
| `plain.ts` 的 `/help` | 纯文本界面的指令表 |

这样不会出现「菜单里有、实际没实现」或两边说明不一致。
新增指令只需改一个文件，有测试（`test/commands.test.tsx`）保证每条指令都有说明、用法和详解，
且指令名不重复。

## /connect 向导

### 状态机

```
provider → baseUrl → apiKey → model → testing → done
   ↑↓ 选择   可留空    可留空    可留空             ├─ Enter 保存
                                                  ├─ T 重测
                                                  └─ S 强制保存
```

草稿（`ConnectionDraft`）在**打开向导时才初始化**，来源优先级是
配置文件 > 当前生效配置。这样编辑的是「要写进文件的东西」，
不会被环境变量覆盖后的值污染。

### 几个刻意的设计

**分步而不是一行填三个值。** API Key 需要掩码，混在一起没法确认粘对没有；
而且每步都能看到「当前值」，留空回车即沿用，符合直觉。

**保存前强制测连接。** 用 `probe.ts` 发一个 `max_tokens: 8` 的请求，
能区分鉴权失败 / 404 路径写错 / 余额不足 / 不可达。失败时仍允许 `S` 强制保存
（有些内网服务不允许探活，不该堵死用户）。

**Key 掩码 + 0600。** 输入时只露末 4 位，摘要里显示 `sk-***23`，
落盘后 `chmod 0600`。写文件用「合并」而非「覆盖」：只改提供的字段，
不会把用户手写的 `timeoutMs` 之类冲掉。

**本地地址允许空 Key。** `localhost` / `127.0.0.1` 开头的地址跳过 Key 校验，
方便 Ollama。这个判断只在 `/connect` 里做，不影响主流程。

### 踩的坑：没有输入框的步骤收不到按键

Ink 的按键是**广播给所有注册了 `useInput` 的组件**。向导的 `provider` 和 `done`
两步没有输入框，最初就没有任何组件注册 `useInput`，结果：

```
按 ↑↓ 没反应、按 Enter 也没反应 —— 界面正常显示，但完全无法操作
```

**解法**：让 `ConnectPanel` 在「没有输入框的步骤」自己注册 `useInput`，
把按键转发给同一个 `onShortcut`：

```tsx
const hasInputBar = step === 'baseUrl' || step === 'apiKey' || step === 'model';
useInput((input, key) => {
  onShortcut(input, toShortcutKey(key));
}, { isActive: !hasInputBar });
```

这样按键处理始终只有一个入口，又不会和 `InputBar` 抢同一个按键。

### 踩的坑：Enter 的 input 是 "\r"

菜单里判断「输入是否与候选完全一致」时，最初写的是：

```ts
// 错的：Enter 时 input === '\r'
const typed = input.replace(/^\//, '').trim();
```

`\r` 解析不出指令名，于是永远走「先补全」分支，用户得按两次 Enter。
正确做法是基于**输入框当前内容**判断，而不是按键字符：

```ts
const typedName = input.replace(/^\//, '').split(/\s+/)[0] ?? '';
if (resolveCommandName(typedName) === picked.name) return false; // 交给 onSubmit
```

### 5. 中文按 length 折行会严重低估宽度

思考过程要在固定高度里滚动，所以必须自己算折行。第一版用 `str.length`：

```ts
if (raw.length <= width) { /* 不折 */ }
```

结果 84 列宽的区域，每行只放约 40 个中文字就换行了 —— 因为**终端按显示列排版，
一个汉字占 2 列**。`length` 算的是码元数，差了整整一倍。

修法是实现 `charWidth()`，覆盖 CJK 基本区、假名、全角标点、emoji 等宽字符区间，
再用 `displayWidth()` 折行：

```ts
for (const ch of raw) {
  const w = charWidth(ch);          // 中文 2，ASCII 1
  if (lineWidth + w > safeWidth) { push(line); /* 换行 */ }
}
```

这个 bug 的症状很迷惑：行数对不上、内容被截断成 `…`，看起来像布局问题，
实际是度量单位错了。

### 6. Ink 的 Box 会按内容撑开，`height` 不一定能裁住

给文本区设了 `height={10}`，屏幕上仍然显示 13 行。原因是 Ink 的布局是 flex，
子内容超出时父 Box 会被撑大。

两道保险才稳住：

```tsx
<Box height={height} flexShrink={0} overflow="hidden">
  {lines.map(line => (
    <Box height={1} flexShrink={0} overflow="hidden">   {/* 每行也钉死一行高 */}
      <Text wrap="truncate-end">{truncateToWidth(line, width)}</Text>
    </Box>
  ))}
</Box>
```

关键是**每行单独包一层 `height={1}` 的 Box**：只要有一行被 Ink 折成两行，
总高度就会溢出，视口立刻失效。

### 7. 思考过程不能存两份

最初把 `reasoning` 同时写进 `history` 和独立状态，结果展开后**渲染了两遍**，
内容重复且高度翻倍。

最终职责划分：

| 位置 | 存什么 | 谁渲染 |
| --- | --- | --- |
| `history[].a` | 正式回答 | ChatPanel 内联 |
| `App.reasoning` | 最近一次的思考过程 | 独立 ScrollBox 视口 |

思考过程**不写进 history**：它属于"当前这次交互"的临时视图，追问时会重置。
这样既不会重复渲染，也不会让历史越滚越长。

### 8. Ink 8 会主动丢弃鼠标事件，点击展开做不了

想要 opencode 那样「点一下展开」，实测不可行。Ink 的输入处理里有这样一段：

```js
// node_modules/ink/build/components/App.js
// A complete CSI or SS3 sequence that maps to no key Ink can represent
// is not printable text. Terminal replies (focus in/out, cursor position,
// mouse, device attributes) ... would otherwise reach useInput
if (isCompleteControlSequence(event)) {
  const key = parseKeypress(event);
  if (!key.isKittyProtocol && key.name === '') return;   // ← 鼠标事件在这里被丢弃
}
```

Ink 8 也没有 `onClick`，`useBoxMetrics` 只提供布局坐标，不接鼠标。
要支持点击得自己开 `\x1b[?1000h` 鼠标追踪并解析 SGR 序列，等于绕开 Ink 的输入层，
与它「单一 useInput 分发」的模型冲突，代价大于收益。

**替代方案**：改用 Vim 的 fold 键位 `zo`（展开）/ `zc`（收起）。
纯字母、不依赖 Ctrl 组合（`Ctrl-T` 在部分终端被占用），也不受鼠标支持缺失影响。

实现上需要一个 `z` 前缀状态：

```ts
if (!key.ctrl && input === 'z') { setZPending(true); return true; }  // 吃掉 z
if (zPending && input === 'o')  { setShowReasoning(true); return true; }
if (zPending && input === 'c')  { setShowReasoning(false); return true; }
// 不是 zo/zc：返回 false 让它落到输入框，不能吞掉用户输入
```

两个必要的保险：
- 前缀超时清除（1.2s），否则按了 `z` 后走神，下次按键会被误判成 zo/zc
- 前缀未命中时必须 `return false`，让字符正常进输入框（有测试锁定 `zebra` 能完整输入）

### 9. 没有输入框的时刻，按键同样无人接收

中断功能做好后实测「按 Esc 没反应」。原因是首次出题时 `exercise` 还是 `null`，
而输入框是挂在 `{exercise ? ...}` 里的 —— **没有任何组件注册 `useInput`**。

这和之前 `/connect` 向导的坑是同一个：Ink 的按键只在有 `useInput` 时才被消费。

修法是加一个兜底处理器，在没有输入框时接管：

```tsx
const inputBarVisible = connect.active
  ? connect.step === 'baseUrl' || connect.step === 'apiKey' || connect.step === 'model'
  : panel === 'chat' || panel === 'stats' || Boolean(exercise);

useInput((input, key) => handleShortcut(input, toShortcutKey(key)), {
  isActive: !inputBarVisible,   // 只在没有输入框时生效，避免和 InputBar 抢按键
});
```

判断条件必须和渲染条件**严格互补**，否则要么两处都处理（按键执行两次），
要么两处都不处理（按键丢失）。

### 10. 已取消的 AbortSignal 不会触发 abort 事件

```js
outerSignal?.addEventListener('abort', onAbort, { once: true });
```

如果 signal 在**注册监听之前就已中断**，这个监听器永远不会触发，
请求照样发出去 —— 用户按了 Esc 却还在干等。

必须先看状态：

```js
if (outerSignal?.aborted) throw new LlmError('请求已取消', { code: 'aborted' });
```

### 11. Node fetch 中断时抛的不是 AbortError

```js
// 错的：Node 抛出的是 abort reason 本身（我们传的 Error('cancelled')），
// name 仍然是 'Error'，这个判断不成立
if (err instanceof Error && err.name === 'AbortError') { ... }
```

可靠的做法是查 signal 状态：

```js
if (controller.signal.aborted) {
  const timedOut = controller.signal.reason?.message === 'timeout';
  throw timedOut ? new LlmError('请求超时') : new LlmError('请求已取消', { code: 'aborted' });
}
```

**超时与取消必须分开**：超时可重试，取消不可重试。否则用户按了 Esc，
重试逻辑会把请求又发一遍。

## 参考 Claude Code 的观察

Claude Code **没有公开源码**：`anthropics/claude-code` 仓库只有文档/示例/插件，
npm 包的 repository 指向私有的 `claude-cli-internal`。

不过 npm 上发布的**旧版本**（如 `1.0.30`）里带着打包后的 `cli.js`，可以观察它的实现。
2026 年的新版（2.1.x）已改为发布原生二进制（约 328MB），连打包 JS 都没有了。

从 `1.0.30` 的 `cli.js` 里能确认的事实：

- **技术栈属实**：`ink`（96 处）、`yoga`（9 处）、`createElement`（94 处）——React + Ink + Yoga
- **状态行的组成**（这是本次改动的主要参考）：

```js
let E = [
  <Text color="secondaryText">{D}s</Text>,                    // 已用秒数
  <Box><Spinner mode={A}/><Text>{fmt(Math.round(W/4))} tokens</Text></Box>,
  <Box><Text bold>esc </Text><Text>to interrupt</Text></Box>,
];
```

- **动画帧**是三套绽放字符，按终端选择：`["·","✢","✳","✶","✻","✽"]` 等
- **思考指示**：`✻ Thinking…`，用次级色 + 斜体
- **token 是估算**：`W/4`，即字符数 ÷ 4

借鉴时做了两处**刻意的改动**：

1. **token 估算不能照搬 ÷4**：那是按拉丁字符算的，中文一个汉字 ≈ 0.5~0.7 token，
   ÷4 会低估约 4 倍。改成按字符类型分开算（拉丁 ÷4、CJK ÷1.5）。
2. **不用 10ms 定时器做计数缓动**：它每 10ms 重算一次让数字平滑爬升，
   但在这个项目里 CPU 开销不值得，直接跟着数据更新即可。

> 只借鉴观感与思路，代码是自己写的。Claude Code 是专有软件
> （`SEE LICENSE IN README.md`），不应直接复制其代码。

## 非 TTY 回退

`stdout` 不是 TTY（管道、CI、`| less`）时 Ink 会报错，自动降级到 `src/plain.ts` 的纯文本界面。
纯文本界面的交互语义与 TUI 完全一致（同样的斜杠指令），所以脚本用法不受影响：

```bash
printf 'grep -c ERROR app.log\n/quit\n' | dojo --mock
```

纯文本模式的输入用「行队列 + 等待者队列」模型，而不是 `readline.question`：
因为管道输入时 readline 会一次性读完并立刻 `close`，`rl.question` 要么抛
`readline was closed`，要么丢掉已缓冲的行。

## 渲染细节

- 题目卡片在 `revealed=false` 时**绝不含** `reference_answer` / `explanation` / `common_mistakes`，
  有测试断言（`test/tui.test.tsx`：「未揭晓时绝不泄露参考答案」）。
- 进度条 `bar()` 对 `NaN`、超范围输入做钳制，不会画出负宽度。
- 模型回复里的 ``` 围栏由 `RichText` 解析，代码行用强调色显示。
- 配色集中在 `theme.ts`，换主题只改一处。
