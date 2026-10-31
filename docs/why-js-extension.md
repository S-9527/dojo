# 为什么 import 写 `./xxx.js` 而不是 `./xxx`

这条最容易被当成笔误"顺手改掉"，改完测试仍能过（因为测试用 `tsx` 跑），
但 `npm run build` 出的 `dist/` 会直接崩在 `ERR_MODULE_NOT_FOUND`。所以专门记一笔。

## 结论

`tsc` **不做路径重写**：源码里写什么，产物里原样保留。
而运行时是 Node ESM，**要求导入路径带扩展名**。两者夹在一起，
源码里就必须写成运行时能解析的形式。

## 验证

**1. Node ESM 不接受无扩展名导入**

```
$ node no-ext.js        # import { x } from "./a"
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/tmp/esmtest/a'

$ node with-ext.js      # import { x } from "./a.js"
with .ext ok 1
```

这是 ESM 规范要求。Webpack / Vite 会自动补扩展名，Node 不会。

**2. tsc 原样保留路径**

```
源码 src/cli.ts:   from './config.js'
产物 dist/cli.js:  from './config.js'      ← 一字不差
```

所以写 `./config` → 产物也是 `./config` → 运行时找不到文件。

**3. 为什么不是 `./config.ts`**

产物是 `.js`。若源码字面量写 `.ts`，编译后仍是 `./config.ts`，运行时同样找不到
（除非开 `--rewriteRelativeImportExtensions`，见下）。

## 本项目的三种写法（有意的）

| 位置 | 写法 | 原因 |
| --- | --- | --- |
| `src/**/*.ts` | `./config.js` | tsc 不改路径，产物要能被 Node 直接跑 |
| `src/**/*.tsx` | `./components/base.js` | `.tsx` 会编译成 `.js` |
| `test/**` | `../src/schema.ts` | `noEmit` + `tsx` 直接跑 TS，写 `.ts` 更准确 |

`tsconfig.json`（构建）：`module`/`moduleResolution` = `NodeNext`，`verbatimModuleSyntax`。
`tsconfig.test.json`（检查）：`noEmit` + `allowImportingTsExtensions`，所以测试能写 `.ts`。

## 曾经评估过的替代方案

**A. `--rewriteRelativeImportExtensions`（TS 5.7+）**
源码写 `.ts`，编译自动改写为 `.js`。最小案例实测通过：

```
源码 ./a.ts  →  产物 ./a.js  →  node dist/main.js 输出 ok 1
```

代价：所有 import 都要带 `.ts`/`.tsx`，依赖 tsc 版本下限。**未采用**，因为
现状已经工作良好，而 `.js` 后缀的写法兼容 `tsx`、`tsc`、`node` 三者，不依赖新特性。

**B. esbuild / tsup 打包成单文件**
源码可写无扩展名。代价：多一层构建依赖、调试栈变复杂、`dist/` 不再是纯 tsc 产物。

**C. `"module": "bundler"`**
允许无扩展名，但产出**不能被 Node 直接执行**，必须再经打包器。

## 如果以后真要改

不要手工替换。用这两步验证是否安全：

```bash
# 1. 全量替换
grep -rl "from '\./" src | xargs sed -i "s|from '\(\./[^']*\)\.js'|from '\1.ts'|g"

# 2. 必须两个都过：类型检查（走 tsx）+ 构建产物能实际运行
npm run typecheck
npm run build && node dist/cli.js --help
```

只看 `npm test` 通过是不够的——测试走 `tsx`，它比 Node 宽容，会掩盖这个问题。
