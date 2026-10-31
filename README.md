# dojo

大模型出题 → 你写命令 → 大模型判题讲解。**不需要真实的 Linux 实验环境**。

TypeScript 编写，终端界面用 Ink（React）构建。

```
╭──────────────────────────────────────────────────────────────────────╮
│ ◆ dojo                              文本处理 · 进阶 · deepseek │
│                                                                      │
│ 题目 3 · 按访问量排序                              文本处理 · 进阶 · 2 分 │
│                                                                      │
│ 场景  假想环境：/tmp/access.log 每行 "IP 路径 状态码"，共 1000 行。      │
│ 要求  统计每个 IP 出现的次数，按次数从高到低输出前 5 名。                │
│                                                                      │
│ 验收点                                                                │
│   1. 按出现次数降序                                                    │
│   2. 只输出前 5 行                                                     │
│                                                                      │
│   ❯ awk '{print $1}' access.log | sort | uniq -c | sort -rn | head  │
│                                                                      │
│ ╭──────────────────────────────────────────────────────────────────╮ │
│ │ ✓ 正确                                              得分 100/100 │ │
│ │ 命令等价，达成全部验收点。                                        │ │
│ │ 知识点 uniq -c · sort -rn                                        │ │
│ ╰──────────────────────────────────────────────────────────────────╯ │
│                                                                      │
│ Tab 面板 · Ctrl-N 换题 · Ctrl-G 提示 · Ctrl-X 答案 · Ctrl-A 提问       │
╰──────────────────────────────────────────────────────────────────────╯
```

## 快速开始

```bash
npm install
npm run build

# 直接运行。没配 Key 会打开 /connect 向导，配好就能开始练习
node bin/dojo.mjs
```

如果已经有 Key，不必进向导，一条命令配好（会先测连接，成功才写文件）：

```bash
node bin/dojo.mjs connect --base-url https://api.deepseek.com/v1 \
                                 --api-key sk-xxxxxxxx --model deepseek-chat
```

或者只用环境变量，不落盘：

```bash
export DOJO_API_KEY=sk-xxxxxxxx
export DOJO_BASE_URL=https://api.deepseek.com/v1
export DOJO_MODEL=deepseek-chat
node bin/dojo.mjs --topic text --difficulty medium
```

### 关于 `--mock`：它不是「测试环境」

`--mock` 只把**大模型调用**换成本地固定回复，其余全是真实流程：题目结构、判题链路、
进度落盘、TUI 全靠同一套代码。用途是「没有 Key 时先试手感」和自动化测试。

| | `--mock` | 默认 |
| --- | --- | --- |
| 大模型回复 | 本地预置文本 | 真实 API |
| 出题/判题流程 | 同一套代码 | 同一套代码 |
| 进度保存 | 真实写入 | 真实写入 |
| 消耗 token | 不消耗 | 消耗 |

**没有「切换到真实环境」的开关**——配好 Key 后运行同一条命令就走真实 API。
判断当前状态看顶栏：显示 `Mock` 就是假回复，否则显示模型名（如 `deepseek-chat`）。

想看真实效果又不想先配 Key，用 `/connect` 选「本地 Ollama」，完全离线但走的是真实推理。

开发时直接跑源码，改完即时生效：

```bash
npm run dev -- --mock      # tsx 直接执行 src/cli.ts
```

## TUI 操作

三个面板用 `Tab` 循环切换：**练习** → **对话** → **统计**。

| 快捷键 | 作用 |
| --- | --- |
| `Tab` | 切换面板 |
| `Ctrl-N` | 换一题 |
| `Ctrl-G` | 逐级提示（第 1 级只给方向，第 3 级几乎给答案） |
| `Ctrl-X` | 显示/隐藏参考答案与解析 |
| `Ctrl-A` | 切到对话面板提问 |
| `Ctrl-R` | 让模型复盘你的薄弱点 |
| `zo` | 展开思考过程（Vim fold 键位） |
| `zc` | 收起思考过程 |
| `Esc` | **正在请求时中断**；空闲时返回练习面板，判题后按它进入下一题 |
| `Ctrl-C` | 退出（进度自动保存） |

### 斜杠指令与候选菜单

输入框里敲 `/`，会弹出**候选菜单**：列出所有指令和一句话说明，选中项下方固定显示用法与详细解释。

```
   ❯ /s
 ╭────────────────────────────────────────────────────────────────╮
 │ ❯ stats                                              看学习统计 │
 ╰────────────────────────────────────────────────────────────────╯

  用法  /stats
  说明  正确率、各主题进度、薄弱点。数据来自本地记录，不联网。

  ↑↓ 选择 · Tab / Enter 补全 · Esc 关闭 · 直接继续输入也行
```

- **输入即过滤**：敲 `/s` 只剩 `stats`，敲 `/z` 显示「没有匹配的指令」
- **`↑` `↓` 切换**，下方的用法/说明跟着变
- **`Tab` 补全**成选中项；**`Enter`** 在输入与候选完全一致时直接执行，否则先补全
- **`Esc`** 收起菜单，继续输入会重新弹出
- **参数补全**：`/topic ` 后面会列出全部主题及中文名，`Tab` 补全第一个

指令一览（TUI 菜单、`/help`、纯文本界面共用同一份定义 `src/commands.ts`）：

| 指令 | 说明 |
| --- | --- |
| `/connect` | 配置大模型接口（分步向导） |
| `/hint` | 要提示，逐级加深 |
| `/ask <问题>` | 向助教提问 |
| `/answer` | 看参考答案与解析 |
| `/next` | 换一题 |
| `/topic <主题>` | 切换主题 |
| `/stats` | 看学习统计 |
| `/review` | 复盘薄弱点 |
| `/help` | 查看全部指令 |
| `/quit`（别名 `/q`、`/exit`） | 退出 |

> **关于 Ctrl-H**：它看起来像「help/hint」的自然选择，但在终端里 Ctrl-H 就是退格（Backspace），
> 程序收到的是 `key.backspace=true, key.ctrl=false`，无法区分。所以提示键用 `Ctrl-G`。

## 配置大模型：/connect

在 TUI 里敲 `/connect` 打开分步向导，**不用改环境变量、不用重启**：

```
 ╭────────────────────────────────────────────────────────────────────────╮
 │ 连接大模型                                                    Esc 取消 │
 │ ✓ 选服务商  ✓ 接口地址  ✓ API Key  ✓ 模型名  ● 完成                   │
 │                                                                        │
 │ 接口  http://127.0.0.1:9933/v1                                         │
 │ 模型  deepseek-chat                                                    │
 │ Key   sk-***23                                                         │
 │                                                                        │
 │ ✓ 连接正常（28ms）· 模型回复「好」                                      │
 │                                                                        │
 │ Enter 保存并应用 · T 重新测试 · Esc 取消                               │
 ╰────────────────────────────────────────────────────────────────────────╯
```

四步走完：**选服务商 → 确认地址 → 填 Key → 确认模型名**，然后自动测试连接。

- 内置 6 个预设（DeepSeek / 本地 Ollama / Kimi / 通义千问 / 智谱 / OpenAI），选中后地址和模型自动填好
- 每一步都显示「当前值」，**留空回车即沿用**
- API Key 输入时**掩码显示**（只露末 4 位），保存后也只显示 `sk-***12`
- **保存前先测连接**：失败会给出具体原因（鉴权失败 / 404 / 余额不足 / 不可达），并允许 `T` 重测或 `S` 强制保存
- 保存后**立即生效**，顶栏从 `Mock` 变成实际模型名

配置写入 `~/.config/dojo/config.json`，权限 `0600`（因为含 Key）。
如果你更希望 Key 不落盘，用环境变量 `DOJO_API_KEY` 即可——向导会提示这件事。

### 非交互式：dojo connect

脚本或纯终端里用：

```bash
dojo connect                                    # 列出预设
dojo connect --base-url https://api.deepseek.com/v1 \
                    --api-key sk-xxx --model deepseek-chat
```

不带参数会打印所有预设。带参数时会**先测连接，成功才写文件**——失败的配置不会被存下来。

## 命令行参数

```bash
dojo                       # 启动 TUI，随机主题
dojo --topic text          # 指定主题
dojo --difficulty hard     # 指定难度
dojo --mock                # 离线模式
dojo --plain               # 强制纯文本界面
dojo stats                 # 统计
dojo review                # 复盘
dojo config                # 检查配置
```

**非 TTY 自动降级**：`stdout` 不是终端时（管道、CI、`| less`），Ink 无法工作，
会自动切到纯文本界面，脚本用法仍然可用：

```bash
printf 'grep -c ERROR app.log\n/quit\n' | dojo --mock
```

## 为什么不需要真实环境也靠谱

你的顾虑是对的：**纯让模型"看着像对"就打勾是不可靠的**。这个工具从三个层面降低误判：

**1. 判题不是比对字符串，而是逐条核对验收点。**
出题时模型必须先给出 `acceptance`（验收点）和 `reference_answer`（参考答案），判题时把两者一起喂回去，要求模型先做"语义等价性分析"再打分。所以
`cat app.log | grep -c ERROR`、`grep -c ERROR app.log`、`awk '/ERROR/{n++}END{print n}' app.log`
这类等价写法都会判对。

**2. 出题和判题在物理上分开。**
出题提示词明确禁止把答案写进题干（答案单独放在 `reference_answer` 字段，界面默认不显示）。
判题是一次独立的模型调用，温度压到 `0.1`，让同样的答案尽量得到同样的判定。
TUI 里按 `Ctrl-X` 之前，答案绝不会出现在屏幕上。

**3. 允许判定"部分正确"。**
判题结果是 `correct` / `partial` / `wrong` 三档，不是非黑即白。`partial` 会给出改法，可以改完再提交。

**它做不到的事**（如实说明）：
- 判题仍然是模型判断，存在小概率误判，尤其是**需要具体环境输出**的题（比如 `du -sh` 到底输出几 MB）。
  所以出题被约束为"写命令"，而不是"预测命令输出"。
- 模型可能给出一个语法正确但实际跑不通的命令。想验证的话，复制到真机跑一遍最稳妥。

## 支持哪些模型

任何实现了 `POST {BASE_URL}/chat/completions` 的服务：

| 服务 | BASE_URL | MODEL |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| 商汤日日新 | `https://token.sensenova.cn/v1` | `sensenova-6.8-flash-lite` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 本地 Ollama | `http://localhost:11434/v1` | `qwen2.5:7b`（Key 随便填） |

### 商汤日日新（SenseNova）特别说明

这家有三套接口，最容易接错，实测确认过的正确组合只有一个：

| | 地址 | 说明 |
| --- | --- | --- |
| ✅ 开放平台（推荐） | `https://token.sensenova.cn/v1` | OpenAI 兼容，本文预设用的就是这个 |
| ⚠️ 大装置 ModelStudio | `https://api.sensenova.cn/compatible-mode/v1` | 企业集成用，路径不同 |
| ❌ 旧地址 | `https://api.sensenova.cn/v1` | 已迁移，实测返回 404 |

两个高频坑：

1. **地址漏 `/v1`** —— `https://token.sensenova.cn` 会 404
2. **模型名大小写** —— 官方文档里写作 `SenseNova-6.8-Flash-Lite`，但 API 实际接受的是小写
   `sensenova-6.8-flash-lite`。很多教程两种写法混着写，照抄大写会报「模型不存在」

直接用预设：

```bash
dojo connect --base-url https://token.sensenova.cn/v1 \
                    --api-key sk-xxx --model sensenova-6.8-flash-lite
```

或者 TUI 里 `/connect` 选「商汤日日新」，地址和模型名自动填好，只需粘 Key。

### 推理模型（SenseNova / DeepSeek-R1 类）

这类模型会**先输出 `reasoning`（思考过程），再输出 `content`（正式回答）**。
token 预算不够时，思考过程会把额度吃光，`content` 为空、`finish_reason=length`，
看起来像"接口返回结构不对"，其实是预算不足。

工具的处理：

- **自动补救**：检测到这种情况会自动放大预算重试一次，并记住该模型是推理模型
- **可手动调**：`export DOJO_TOKEN_SCALE=3` 整体放大 token 预算
- **思考过程可滚动查看**：默认折叠成一行，`zo` 展开后可滚动翻看完整推理链

```
 你 ❯ uniq 为什么要先 sort
 助教
   因为 uniq 只比较相邻行，所以要先 sort。

   ▾ 思考过程（生成中…）
    第12步思考：需要先比较相邻行，再统计重复次数。第13步思考：需要先…
    第14步思考：需要先比较相邻行，再统计重复次数。第15步思考：需要先…
    ...
    ↑↓ 逐行 · u/d 翻页 · g 顶部 · G 最新 · zo/zc 展开收起
```

展开后的滚动操作（**生成过程中也能用**，不会打断流式输出）：

| 按键 | 作用 |
| --- | --- |
| `↑` `↓` | 逐行滚动 |
| `u` `d` | 翻页（`PgUp`/`PgDn` 亦可，但部分终端识别不到） |
| `g` | 跳到顶部 |
| `G` | 回到最新（恢复自动跟随） |

生成时默认**自动跟随底部**；一旦向上滚动就接管，按 `G` 或滚回底部则恢复跟随。
视口固定 10 行，长推理链不会把题目和回答挤出屏幕。

> **为什么用 `zo`/`zc` 而不是 Ctrl 组合或点击？**
> 快捷键方面，`Ctrl-T` 在部分终端被占作别用（例如有的终端用它开新标签页），程序收不到。
> 鼠标方面，Ink 8 会**主动丢弃鼠标事件**（源码注释里明确写了 mouse 属于"映射不到按键的
> CSI 序列"），所以 TUI 下无法实现点击展开。
> `zo`/`zc` 是 Vim 的 fold 键位，纯字母、无终端冲突，习惯 Vim 的人可以盲打。

**如果报「接口能通（HTTP 200）但返回的不是可识别的对话格式」**：

这说明地址和 Key 都是对的，问题在账户状态或服务端返回。工具现在会把真实返回原样打出来，例如：

```
接口返回错误：积分不足，请充值
  → 这是账户额度/积分问题，不是配置问题。去平台控制台看用量与余额。
```

SenseNova 的 Token Plan 按**积分**计费（分通用积分和 Flash-Lite 专属积分），
额度耗尽时它返回 **HTTP 200 + 错误体**，而不是 4xx——所以看起来"连上了但没内容"。
去[控制台](https://platform.sensenova.cn/)确认积分余额即可，配置本身不用改。

> 免费额度、模型列表、积分规则以[官网](https://platform.sensenova.cn/)当前公示为准，可能变动。

## 配置

优先级：命令行参数 > 环境变量 > 配置文件。

| 环境变量 | 说明 |
| --- | --- |
| `DOJO_API_KEY` | API Key（也认 `OPENAI_API_KEY`） |
| `DOJO_BASE_URL` | 接口地址（也认 `OPENAI_BASE_URL`） |
| `DOJO_MODEL` | 模型名 |
| `DOJO_MOCK=1` | 强制离线模式 |
| `DOJO_DATA` | 进度文件路径 |
| `DOJO_TIMEOUT_MS` | 请求超时，默认 90000 |
| `DOJO_TOKEN_SCALE` | token 预算倍数，推理模型可设 2~3 |
| `DOJO_DEBUG=1` | 出错时打印堆栈 |

配置文件 `~/.config/dojo/config.json`（明文，不想落盘就只用环境变量）：

```json
{ "baseUrl": "https://api.deepseek.com/v1", "apiKey": "sk-xxx", "model": "deepseek-chat" }
```

## 主题与难度

主题：`files` 文件与目录 · `text` 文本处理 · `permissions` 权限与用户 · `process` 进程管理 · `disk` 磁盘与存储 · `network` 网络 · `shell` Shell 脚本 · `package` 软件包管理

难度：`easy` 入门（单条命令）· `medium` 进阶（管道/重定向）· `hard` 挑战（多命令组合）

## 开发

```bash
npm run dev          # tsx 直跑源码
npm run build        # tsc → dist/
npm run typecheck    # 源码 + 测试全部类型检查
npm test             # 180 个测试
```

> **注意 `src/` 里 import 写 `./xxx.js` 不是笔误。** `tsc` 不做路径重写，
> 而 Node ESM 要求导入路径带扩展名，所以源码必须写成运行时的形式。
> 改成 `./xxx` 会让 `npm test` 依然通过（测试走 tsx，更宽容），
> 但 `dist/` 会在 `ERR_MODULE_NOT_FOUND` 上崩掉。详见
> [docs/why-js-extension.md](docs/why-js-extension.md)。

测试覆盖：

- **JSON 宽松解析**：围栏、前后废话、尾逗号、字符串内括号
- **schema 兜底**：缺字段、类型错误、hints 补齐、分数夹取
- **回归测试**：zod 4 的 `z.unknown()` 不接受 `undefined`，会让判题结果静默变成 "partial/60"
- **配置优先级**与 `undefined` Key 回归
- **连续天数**跨天与时区
- **HTTP 端到端**：假服务跑真实请求（出题 / 判题 / SSE 流式 / 401 / 404 / 连接失败）
- **TUI 组件**：题目卡片不泄露答案、判题面板、统计柱状图、对话裁剪
- **InputBar 按键**：快捷键不污染输入框
- **斜杠候选菜单**：前缀过滤、别名解析、`/topic` 参数区、说明渲染、无匹配提示
- **/connect**：配置落盘与 0600 权限、部分更新不冲掉其它字段、预设完整性、连接探测的成功/401/404/不可达、Key 脱敏
- **启动路径**：无 Key + 非 TTY 时给出多条出路并返回非零、`--help` 内容完整
- **响应结构兼容**：标准 OpenAI、分段 content 数组、delta、data/result 嵌套、200+错误体、HTML 误入
- **推理模型**：预算不足时自动放大重试、记住模型特性、两次都不够时给出可操作建议、`tokenScale` 生效
- **思考过程展示**：折叠不泄露内容、展开可见、视口限高不撑爆屏幕
- **滚动视口**：CJK 显示宽度计算、折行不超界、跟随底部、滚到底恢复跟随、边界夹取
- **语言检测**：日文/韩文识别、中文不误报、代码块与专有名词豁免
- **中断**：预取消的 signal 立即返回、运行中取消立即生效、超时与取消可区分
- **状态行**：动画帧按终端降级、token 估算（中文不按 ÷4 低估）、耗时格式化

### 项目结构

```
bin/dojo.mjs      入口
src/cli.ts               参数解析、TUI/纯文本分流
src/tutor.ts             出题/判题/答疑/提示/复盘编排
src/prompts.ts           全部提示词（调效果主要改这里）
src/schema.ts            zod 校验 + 兜底
src/llm.ts               OpenAI 兼容客户端：超时、重试、SSE
src/json.ts              从模型输出里稳健提取 JSON
src/config.ts            配置合并
src/store.ts             进度落盘与统计
src/topics.ts            主题/难度定义
src/commands.ts          斜杠指令定义（菜单/帮助的唯一来源）
src/probe.ts             连接测试（/connect 保存前校验）
src/extract.ts           兼容各家响应结构，提取回复文本
src/types.ts             领域类型
src/plain.ts             纯文本界面（非 TTY 回退）
src/mock.ts              离线模式
src/tui/
  App.tsx                主状态机、快捷键分发
  useConnect.ts          /connect 的状态机
  theme.ts               配色、进度条、换行
  scroll.ts              滚动视口逻辑（CJK 宽度、折行、窗口计算）
  spinner.ts             动画帧、token 估算、时长格式化
  components/
    base.tsx             Frame / Section / Field / RichText
    InputBar.tsx         自研输入框（快捷键与文本互斥）
    CommandMenu.tsx      斜杠指令候选菜单
    ScrollBox.tsx        限高可滚动文本视口
    StatusLine.tsx       进行中/完成状态行
    ConnectPanel.tsx     /connect 分步向导
    ExerciseCard.tsx     题目卡片
    GradePanel.tsx       判题结果、提示、错误、加载
    ChatPanel.tsx        对话面板
    StatsPanel.tsx       统计面板
docs/tui-design.md       TUI 设计说明
docs/why-js-extension.md 为什么 import 写 .js 而不是 .ts
```

## 中断请求

请求发出后可以随时按 `Esc` 取消，不用干等：

```
 ⠼ 大模型正在出题…  12s  Esc 中断      ← 进行中显示已用时间和中断提示
 ⏹ 已中断  12.4s  sensenova-6.8-flash-lite
```

几处刻意的设计：

- **区分「超时」与「取消」**：超时是可重试的失败，取消不是。取消后不会偷偷重试，
  否则按了 `Esc` 却还在发请求。
- **中断状态用中性色 `⏹`**，不用红色报错——这是用户的主动操作，不是故障。
- **中断后能立刻继续**：状态机会回到可操作状态，可直接按 `Ctrl-N` 换题。

> 注意：`Esc` 的优先级是「先中断，后导航」。也就是说请求进行中按 `Esc` 只会中断，
> 不会同时切换面板。

## 状态行

进行中的状态行长这样（布局参考 Claude Code）：

```
 3s  ✻ 助教正在回答  1.2k tokens  esc 中断
```

- **已用秒数**：只有转圈看不出「卡住了」还是「还在跑」，秒数给出可判断的信号
- **动画帧**：盲文点阵 `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`，`TERM=dumb` 时退回 ASCII
- **token 数**：流式过程中实时估算，都是估算值不是接口返回的真实用量
- **esc 中断**：随时可取消

任务结束后保留一行摘要，不会突然消失：

```
 ✓ 题目已生成  1.2s  sensenova-6.8-flash-lite
 ✓ 回答完成  4s  sensenova-6.8-flash-lite
 ⏹ 已中断  3.6s  sensenova-6.8-flash-lite
```

## 输出语言

题目和评语一律使用**简体中文**，只有命令、路径、文件名等专有名词保留英文。

中日双语模型（如 SenseNova）在遇到日式路径时有概率把叙述写成日文，
实测出现过 `ディレクトリに numbers.txt があります` 这种混杂。工具做了两层防护：

1. **提示词强约束**：`src/prompts.ts` 的 persona 里明确禁止混入日文/韩文/繁体
2. **代码级检测**：`src/lang.ts` 检测平假名、片假名、韩文与常见日语词，
   命中就重新出题（最多 3 次），第三次会把「上次错在哪」明确告诉模型

代码块里的内容不参与检测——测试数据里出现日文是合理的，不该因此重试。

## 想改进效果，改哪里

- **题目太难/太简单** → `src/prompts.ts` 的 `buildExercisePrompt`「形式约束」
- **判题太严/太松** → `buildGradePrompt`「批改规则」第 1、4 条
- **答疑太啰嗦** → `buildAskPrompt` 里的字数限制
- **输出语言** → `src/prompts.ts` 的 persona 语言要求，以及 `src/lang.ts` 的检测词表
- **想加真实校验** → 在 `Tutor.grade` 之后接沙箱（Docker / `bwrap`）跑一遍学员命令，把真实 stdout 也喂给判题。这是准确率最高的一步，但需要真实环境，与"不依赖环境"的目标冲突，故未默认实现。
