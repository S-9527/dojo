/**
 * TUI 组件测试：用 ink-testing-library 渲染到字符串再断言。
 * 这样能真正验证“屏幕上会显示什么”，而不是只测状态逻辑。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { ExerciseCard } from '../src/tui/components/ExerciseCard.tsx';
import { GradePanel, HintPanel, ErrorPanel } from '../src/tui/components/GradePanel.tsx';
import { StatsPanel } from '../src/tui/components/StatsPanel.tsx';
import { StatusLine } from '../src/tui/components/StatusLine.tsx';
import { ChatPanel } from '../src/tui/components/ChatPanel.tsx';
import { bar } from '../src/tui/theme.ts';
import { normalizeExercise, normalizeGrade } from '../src/schema.ts';
import { summarize } from '../src/store.ts';
import type { AttemptRecord, Exercise } from '../src/types.ts';

const exercise: Exercise = normalizeExercise(
  {
    title: '找出最大的文件',
    scenario: '/tmp/demo 下有 a.txt、b.log、c.md。',
    question: '列出最大的文件。',
    acceptance: ['只输出一行', '输出 b.log'],
    reference_answer: 'ls -S /tmp/demo | head -n 1',
    explanation: 'ls -S 按大小降序。',
    common_mistakes: ['忘记 head'],
    hints: ['提示一', '提示二', '提示三'],
  },
  { topic: 'files', difficulty: 'easy' },
);

test('ExerciseCard: 显示题干与验收点', () => {
  const { lastFrame } = render(React.createElement(ExerciseCard, { exercise, index: 1, revealed: false, showHints: false }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /找出最大的文件/);
  assert.match(frame, /列出最大的文件/);
  assert.match(frame, /只输出一行/);
});

test('ExerciseCard: 未揭晓时绝不泄露参考答案', () => {
  const { lastFrame } = render(React.createElement(ExerciseCard, { exercise, index: 1, revealed: false, showHints: false }));
  const frame = lastFrame() ?? '';
  assert.ok(!frame.includes('ls -S'), '题干阶段不应出现答案命令');
  assert.ok(!frame.includes('提示一'), '未点提示时不应出现提示内容');
});

test('ExerciseCard: revealed 时展示答案与解析', () => {
  const { lastFrame } = render(React.createElement(ExerciseCard, { exercise, index: 1, revealed: true, showHints: false }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /参考答案/);
  assert.match(frame, /ls -S/);
  assert.match(frame, /按大小降序/);
});

test('ExerciseCard: showHints 时展示三级提示', () => {
  const { lastFrame } = render(React.createElement(ExerciseCard, { exercise, index: 1, revealed: false, showHints: true }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /提示一/);
  assert.match(frame, /提示三/);
});

test('GradePanel: 正确时显示绿色对勾与得分', () => {
  const grade = normalizeGrade({ verdict: 'correct', score: 100, reason: '达成全部验收点。', knowledge_points: ['ls -S'] });
  const { lastFrame } = render(React.createElement(GradePanel, { grade }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /正确/);
  assert.match(frame, /100\/100/);
  assert.match(frame, /达成全部验收点/);
  assert.match(frame, /ls -S/);
});

test('GradePanel: 错误时展示改法', () => {
  const grade = normalizeGrade({
    verdict: 'wrong',
    score: 20,
    reason: '没有达成验收点。',
    corrected_answer: 'ls -la',
  });
  const { lastFrame } = render(React.createElement(GradePanel, { grade }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /不正确/);
  assert.match(frame, /参考写法/);
  assert.match(frame, /ls -la/);
});

test('HintPanel: 显示级别与内容', () => {
  const { lastFrame } = render(React.createElement(HintPanel, { text: '想想哪个命令能排序', level: 2, total: 3 }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /提示 2\/3/);
  assert.match(frame, /排序/);
});

test('ErrorPanel: 显示错误信息', () => {
  const { lastFrame } = render(React.createElement(ErrorPanel, { message: '接口报错（HTTP 500）' }));
  assert.match(lastFrame() ?? '', /HTTP 500/);
});

test('StatsPanel: 无记录时不报错并提示开始', () => {
  const { lastFrame } = render(React.createElement(StatsPanel, { summary: summarize([]) }));
  assert.match(lastFrame() ?? '', /还没有练习记录/);
});

test('StatsPanel: 有记录时显示正确率与主题', () => {
  const records: AttemptRecord[] = [
    { title: 'a', topic: 'text', difficulty: 'easy', verdict: 'correct', score: 100, reason: '', question: '', answer: '', at: '2026-01-01T10:00:00' },
    { title: 'b', topic: 'text', difficulty: 'easy', verdict: 'wrong', score: 20, reason: '', question: '', answer: '', at: '2026-01-01T11:00:00' },
  ];
  const { lastFrame } = render(React.createElement(StatsPanel, { summary: summarize(records) }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /学习统计/);
  assert.match(frame, /50%/);
  assert.match(frame, /文本处理/);
});

test('ChatPanel: 空状态给出引导', () => {
  const { lastFrame } = render(React.createElement(ChatPanel, { history: [], streaming: '', width: 80 }));
  assert.match(lastFrame() ?? '', /还没有对话/);
});

test('ChatPanel: 流式输出时显示已收到的内容', () => {
  const { lastFrame } = render(
    React.createElement(ChatPanel, { history: [], streaming: 'uniq -c 只能统计相邻行', width: 80 }),
  );
  const frame = lastFrame() ?? '';
  assert.match(frame, /输出中/);
  assert.match(frame, /相邻行/);
});

test('ChatPanel: 历史只保留最近若干轮，避免撑爆屏幕', () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ q: `问题${i}`, a: `答案${i}` }));
  const { lastFrame } = render(React.createElement(ChatPanel, { history, streaming: '', width: 80, maxTurns: 2 }));
  const frame = lastFrame() ?? '';
  assert.ok(!frame.includes('问题0'), '最早的问题应被裁掉');
  assert.match(frame, /问题7/);
});

test('bar: 比例边界安全', () => {
  assert.equal(bar(0, 10).length, 10);
  assert.equal(bar(1, 10), '██████████');
  assert.equal(bar(NaN, 10), '░░░░░░░░░░');
  assert.equal(bar(2, 5), '█████');
});

/**
 * 推理模型的思考过程展示。
 * 设计：由 App 用独立的可滚动视口展示（见 scroll.test.ts），
 * 不走 history 内联渲染，避免两处重复渲染。
 */
test('ChatPanel: 传入 reasoning 时折叠，只显示提示行', () => {
  const { lastFrame } = render(
    React.createElement(ChatPanel, {
      history: [{ q: '为什么要 sort', a: '因为 uniq 只比较相邻行。' }],
      streaming: '',
      reasoning: '用户问的是为什么。因为 uniq 的机制。',
      showReasoning: false,
      width: 80,
    }),
  );
  const frame = lastFrame() ?? '';
  assert.match(frame, /思考过程/);
  assert.ok(!frame.includes('用户问的是为什么'), '折叠时不应显示思考内容');
  assert.match(frame, /zo/, '应提示用 zo 展开');
});

test('ChatPanel: 展开时渲染思考内容', () => {
  const { lastFrame } = render(
    React.createElement(ChatPanel, {
      history: [{ q: 'q', a: 'a' }],
      streaming: '',
      reasoning: '这是模型内部的推理链',
      showReasoning: true,
      width: 80,
    }),
  );
  assert.match(lastFrame() ?? '', /这是模型内部的推理链/);
});

test('ChatPanel: 无 reasoning 时不显示思考区域', () => {
  const { lastFrame } = render(
    React.createElement(ChatPanel, { history: [{ q: 'q', a: 'a' }], streaming: '', width: 80 }),
  );
  assert.ok(!(lastFrame() ?? '').includes('思考过程'), '普通模型不应出现思考过程区域');
});

test('ChatPanel: 展开的思考区受视口高度限制，不会撑爆屏幕', () => {
  const long = Array.from({ length: 200 }, (_, i) => `第${i}步思考内容`).join('\n');
  const { lastFrame } = render(
    React.createElement(ChatPanel, {
      history: [{ q: 'q', a: 'a' }],
      streaming: '',
      reasoning: long,
      showReasoning: true,
      width: 80,
    }),
  );
  const lines = (lastFrame() ?? '').split('\n');
  assert.ok(lines.length < 40, `渲染了 ${lines.length} 行，视口限高失效`);
});

/**
 * 状态行：任务结束后必须保留摘要，而不是像 Loading 那样直接消失。
 * 参考 opencode 的 Build 行（模型 · 耗时 · tok/s）。
 */
test('StatusLine: 进行中显示 spinner 与文案', () => {
  // 必须 unmount：进行中的 spinner 用 setInterval 驱动，
  // 不卸载会让定时器一直活着，node --test 跑完也退不出进程。
  const { lastFrame, unmount } = render(
    React.createElement(StatusLine, { busyText: '大模型正在出题' }),
  );
  try {
    const frame = lastFrame() ?? '';
    assert.match(frame, /大模型正在出题/);
    assert.ok(!frame.includes('✓'), '进行中不应显示完成标记');
  } finally {
    unmount();
  }
});

test('StatusLine: 完成后显示对勾、耗时与模型名', () => {
  const { lastFrame, unmount } = render(
    React.createElement(StatusLine, {
      busyText: '大模型正在出题',
      done: true,
      doneText: '题目已生成',
      elapsedMs: 1200,
      meta: 'sensenova-6.8-flash-lite',
    }),
  );
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /✓/);
  assert.match(frame, /题目已生成/);
  assert.match(frame, /1\.2s/, '应显示耗时');
  assert.match(frame, /sensenova/, '应显示模型名');
  assert.ok(!frame.includes('正在出题'), '完成后不应再显示进行中文案');
});

test('StatusLine: 不足 0.1 秒不显示 0.0s', () => {
  const { lastFrame, unmount } = render(
    React.createElement(StatusLine, { busyText: '判题', done: true, doneText: '完成', elapsedMs: 30 }),
  );
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /<0\.1s/);
  assert.ok(!frame.includes('0.0s'), '0.0s 是无意义的信息');
});

test('StatusLine: 失败时用叉号与失败文案', () => {
  const { lastFrame, unmount } = render(
    React.createElement(StatusLine, {
      busyText: '出题',
      done: true,
      doneText: '出题失败',
      elapsedMs: 800,
      failed: true,
    }),
  );
  const frame = lastFrame() ?? '';
  unmount();
  assert.match(frame, /✗/);
  assert.match(frame, /出题失败/);
});
