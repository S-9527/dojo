import { createInterface } from 'node:readline';
import type { createTutor } from './tutor.js';
import { loadProgress, recordAttempt, summarize } from './store.js';
import type { Difficulty, Exercise, Grade, Progress, ResolvedConfig, TopicKey } from './types.js';
import { DIFFICULTIES, TOPICS, TOPIC_KEYS } from './topics.js';
import { COMMANDS, resolveCommandName } from './commands.js';

/**
 * 纯文本交互界面。
 * 用在两种场景：
 *   1) stdout 不是 TTY（管道、CI、`| less`），Ink 无法工作；
 *   2) 用户显式指定 --plain。
 * 交互模型与 TUI 一致：输入命令即作答，斜杠开头是指令。
 */

export interface PlainSessionOptions {
  tutor: ReturnType<typeof createTutor>;
  config: ResolvedConfig;
  topic: TopicKey;
  difficulty: Difficulty;
  progress: Progress;
}

const line = (char = '─') => char.repeat(Math.min(process.stdout.columns || 80, 80));

/** 清掉「正在…」那一行的残留，避免日志/管道输出里出现垃圾字符。 */
const clearStatusLine = () => {
  if (process.stdout.isTTY) {
    process.stdout.write('\r\x1b[K');
    return;
  }
  // 非 TTY 时 \r 不会回到行首，直接补一个换行，避免和下一行粘在一起
  process.stdout.write('\n');
};

/** 只在 TTY 下显示进度文字，管道/CI 里不输出噪音。 */
const status = (text: string) => {
  if (process.stdout.isTTY) process.stdout.write(`${text}\r`);
};

function createPrompter() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });

  // 管道输入时 readline 会一次性读完并 close，用行队列避免丢行或抛错。
  const buffered: string[] = [];
  const waiters: Array<(value: string | null) => void> = [];
  let closed = false;

  rl.on('line', (text) => {
    const waiter = waiters.shift();
    if (waiter) waiter(text);
    else buffered.push(text);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()?.(null);
  });

  const ask = (prompt: string): Promise<string | null> => {
    if (process.stdin.isTTY) {
      rl.setPrompt(prompt);
      rl.prompt();
    }
    if (buffered.length) {
      const text = buffered.shift() as string;
      if (!process.stdin.isTTY) process.stdout.write(`${prompt}${text}\n`);
      return Promise.resolve(text);
    }
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  };

  return {
    ask,
    close: () => {
      closed = true;
      try {
        rl.close();
      } catch {
        /* 已关闭 */
      }
    },
  };
}

function printExercise(exercise: Exercise, index: number): void {
  console.log(line());
  console.log(
    `题目 ${index}  ${exercise.title}  [${exercise.topic}/${DIFFICULTIES[exercise.difficulty].label}]`,
  );
  console.log(line());
  console.log(`场景  ${exercise.scenario}`);
  console.log(`要求  ${exercise.question}`);
  if (exercise.acceptance.length) {
    console.log('验收点：');
    exercise.acceptance.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  }
  console.log('\n输入命令回车提交 · /hint 提示 · /ask 提问 · /answer 答案 · /next 换题 · /stats 统计 · /quit 退出\n');
}

function printGrade(grade: Grade, exercise: Exercise): void {
  const label = { correct: '✓ 正确', partial: '△ 部分正确', wrong: '✗ 不正确' }[grade.verdict];
  console.log(`\n${label}   得分 ${grade.score}/100\n${grade.reason}`);
  if (grade.corrected_answer) console.log(`\n参考写法：\n  ${grade.corrected_answer}`);
  if (grade.knowledge_points.length) console.log(`\n知识点：${grade.knowledge_points.join(' · ')}`);
  if (grade.verdict !== 'correct' && exercise.explanation) console.log(`\n解析：${exercise.explanation}`);
  console.log('');
}

/** 纯文本统计输出。 */
export function printStats(summary: ReturnType<typeof summarize>): void {
  console.log(line());
  console.log(`学习统计   共 ${summary.total} 题 · 平均 ${summary.avgScore} 分 · 连续 ${summary.streak} 天`);
  console.log(line());
  if (!summary.total) {
    console.log('还没有记录，先做一道题吧。');
    return;
  }
  const { byVerdict, byTopic } = summary;
  console.log(`\n  ✓ ${byVerdict.correct}   △ ${byVerdict.partial}   ✗ ${byVerdict.wrong}\n`);
  console.log('按主题：');
  for (const [topic, stat] of Object.entries(byTopic)) {
    if (!stat) continue;
    const rate = Math.round((stat.correct / stat.total) * 100);
    const blocks = '█'.repeat(Math.round(rate / 10)).padEnd(10, '░');
    const label = TOPICS[topic as TopicKey]?.label ?? topic;
    console.log(`  ${label.padEnd(10, ' ')} ${blocks} ${String(rate).padStart(3)}%  ${stat.total} 题`);
  }
  if (summary.weakTopics.length) {
    console.log('\n建议加强：');
    console.log(
      `  ${summary.weakTopics.map((t) => `${TOPICS[t.topic].label}(${Math.round(t.rate * 100)}%)`).join('  ')}`,
    );
  }
  console.log('');
}

export async function runPlainSession({
  tutor,
  topic: initialTopic,
  difficulty,
  progress,
}: PlainSessionOptions): Promise<number> {
  const { ask, close } = createPrompter();

  // 用状态对象持有当前题，避免闭包赋值导致调用方的类型窄化失效
  const state: {
    topic: TopicKey;
    exercise: Exercise | null;
    index: number;
    hintLevel: number;
    asked: Array<{ q: string; a: string }>;
  } = { topic: initialTopic, exercise: null, index: 0, hintLevel: 0, asked: [] };

  const currentExercise = (): Exercise | null => state.exercise;

  const onSigint = () => {
    close();
    console.log('\n已退出，进度已保存。');
    process.exit(0);
  };
  process.on('SIGINT', onSigint);

  const newExercise = async (nextTopic: TopicKey = state.topic): Promise<Exercise> => {
    state.topic = nextTopic;
    status('大模型正在出题…');
    try {
      const fresh = await tutor.generateExercise({ topic: nextTopic, difficulty });
      state.exercise = fresh;
      return fresh;
    } finally {
      clearStatusLine();
    }
  };

  const startRound = async (nextTopic: TopicKey = state.topic) => {
    const fresh = await newExercise(nextTopic);
    state.index += 1;
    state.hintLevel = 0;
    state.asked = [];
    printExercise(fresh, state.index);
  };

  try {
    console.log(`\n  Linux 练习助手 · ${TOPICS[state.topic].label} · ${DIFFICULTIES[difficulty].label}\n`);
    await startRound();

    for (;;) {
      const input = await ask('❯ ');
      if (input === null) {
        console.log('\n再见，进度已保存。');
        return 0;
      }
      const text = input.trim();
      if (!text) continue;

      if (text.startsWith('/')) {
        const [rawCmd = '', ...rest] = text.slice(1).split(/\s+/);
        // 走统一的别名解析，`/q` 与 `/quit` 等价
        const cmd = resolveCommandName(rawCmd) ?? rawCmd;
        const arg = rest.join(' ');
        switch (cmd) {
          case 'quit':
            console.log('再见，进度已保存。');
            return 0;

          case 'help':
            // 复用 commands.ts 的定义，避免纯文本界面和 TUI 的指令表不一致
            console.log('');
            COMMANDS.forEach((c) => console.log(`  ${c.usage.padEnd(28, ' ')} ${c.summary}`));
            console.log('');
            break;

          case 'hint': {
            const ex = currentExercise();
            if (!ex) break;
            if (state.hintLevel >= ex.hints.length) {
              console.log('提示用完啦，试试 /answer。');
              break;
            }
            try {
              const hint = await tutor.hint(ex, state.hintLevel);
              state.hintLevel += 1;
              console.log(`\n提示 ${state.hintLevel}/${ex.hints.length}：${hint}\n`);
            } catch (err) {
              console.error(`获取提示失败：${err instanceof Error ? err.message : String(err)}`);
            }
            break;
          }

          case 'ask': {
            const question = arg || (await ask('你的问题 ❯ '));
            if (!question) break;
            console.log('\n助教：');
            try {
              const reply = await tutor.ask(question, {
                exercise: currentExercise(),
                history: state.asked,
                onDelta: (chunk) => process.stdout.write(chunk),
              });
              process.stdout.write('\n\n');
              state.asked.push({ q: question, a: reply });
            } catch (err) {
              console.error(`\n回答失败：${err instanceof Error ? err.message : String(err)}`);
            }
            break;
          }

          case 'answer': {
            const ex = currentExercise();
            if (!ex) break;
            console.log(`\n参考答案：\n  ${ex.reference_answer}`);
            if (ex.explanation) console.log(`\n${ex.explanation}`);
            if (ex.common_mistakes.length) {
              console.log('\n常见错误：');
              ex.common_mistakes.forEach((m) => console.log(`  · ${m}`));
            }
            console.log('');
            break;
          }

          case 'next':
            await startRound();
            break;

          case 'topic': {
            const next = TOPIC_KEYS.find((k) => k === arg);
            if (!next) {
              console.log(`用法：/topic <${TOPIC_KEYS.join('|')}>`);
              break;
            }
            await startRound(next);
            break;
          }

          case 'stats':
            printStats(summarize(loadProgress().records));
            break;

          case 'review': {
            status('模型正在复盘…');
            try {
              const text = await tutor.review(progress.records);
              clearStatusLine();
              console.log(`\n${text}\n`);
            } catch (err) {
              clearStatusLine();
              console.error(`复盘失败：${err instanceof Error ? err.message : String(err)}`);
            }
            break;
          }

          default:
            console.log(`未知指令 /${cmd}`);
        }
        continue;
      }

      const ex = currentExercise();
      if (!ex) continue;

      status('大模型正在判题…');
      try {
        const grade = await tutor.grade(ex, text);
        clearStatusLine();
        printGrade(grade, ex);
        const updated = recordAttempt({
          title: ex.title,
          topic: ex.topic,
          difficulty: ex.difficulty,
          verdict: grade.verdict,
          score: grade.score,
          reason: grade.reason,
          question: ex.question,
          answer: text,
        });
        progress.records = updated.records;

        if (grade.verdict === 'correct') {
          const next = await ask('\n回车出下一题（/quit 退出） ');
          if (next === null || next.trim() === '/quit') {
            console.log('再见，进度已保存。');
            return 0;
          }
          await startRound();
        } else {
          console.log('可以修改后重新提交，或输入 /next 换题、/hint 看提示。\n');
        }
      } catch (err) {
        clearStatusLine();
        console.error(`判题失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    close();
    process.removeListener('SIGINT', onSigint);
  }
}
