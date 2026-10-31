import React from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { AskTurn, Exercise, Grade, Progress, ResolvedConfig, Summary, TopicKey } from '../types.js';
import { createTutor, isAbortError, type Tutor } from '../tutor.js';
import { useConnect } from './useConnect.js';
import { ConnectPanel } from './components/ConnectPanel.js';
import { DIFFICULTIES, TOPICS, TOPIC_KEYS, resolveTopic } from '../topics.js';
import { recordAttempt, summarize } from '../store.js';
import { COMMANDS, argChoices, filterCommands, resolveCommandName, shouldShowMenu } from '../commands.js';
import { Frame } from './components/base.js';
import { KeyHelp, ModeBar } from './components/ModeBar.js';
import { ExerciseCard } from './components/ExerciseCard.js';
import { ChatPanel } from './components/ChatPanel.js';
import { StatsPanel } from './components/StatsPanel.js';
import { CommandMenu } from './components/CommandMenu.js';
import { ErrorPanel, GradePanel, HintPanel } from './components/GradePanel.js';
import { StatusLine } from './components/StatusLine.js';
import { ReasoningPanel } from './components/ReasoningPanel.js';
import { estimateTokens } from './spinner.js';
import { INSERT_KEYS, NORMAL_KEYS, insertHint, isPrintable, normalHint, type Mode } from './keymap.js';
import { InputBar } from './components/InputBar.js';
import { theme } from './theme.js';
import { scrollBy, wrapToLines, type ViewportState } from './scroll.js';
import { REASONING_VIEWPORT_HEIGHT } from './components/ReasoningPanel.js';

type Panel = 'practice' | 'chat' | 'stats';
type Phase = 'loading' | 'awaiting' | 'grading' | 'graded' | 'hinting' | 'asking';

export interface AppProps {
  tutor: Tutor;
  config: ResolvedConfig;
  initialTopic: TopicKey;
  initialDifficulty: keyof typeof DIFFICULTIES;
  progress: Progress;
  /** 启动即打开 /connect 向导（未配置 API Key 时用） */
  startWithConnect?: boolean;
}

const PANEL_ORDER: Panel[] = ['practice', 'chat', 'stats'];

/**
 * 主应用。
 *
 * 采用 Vim 风格的模态输入：normal 模式下所有按键都是命令，
 * insert 模式下所有按键都是文本。两个 useInput 严格互斥
 * （normal 由本组件处理且始终注册，insert 由 InputBar 处理）。
 *
 * 这样一次性消掉了之前一整类问题：快捷键漏进输入框、
 * 前缀键要加超时、没有输入框时按键无人接收、Ctrl 组合被终端占用。
 */
export function App({
  tutor: initialTutor,
  config: initialConfig,
  initialTopic,
  initialDifficulty,
  progress,
  startWithConnect = false,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const [panel, setPanel] = React.useState<Panel>('practice');
  const [phase, setPhase] = React.useState<Phase>('loading');
  const [topic, setTopic] = React.useState<TopicKey>(initialTopic);
  const [difficulty] = React.useState(initialDifficulty);

  // /connect 保存后需要换掉 Tutor 与配置，所以两者都提升为 state
  const [config, setConfig] = React.useState<ResolvedConfig>(initialConfig);
  const [tutor, setTutor] = React.useState<Tutor>(initialTutor);

  const [exercise, setExercise] = React.useState<Exercise | null>(null);
  // 用 ref 读最新值，避免把 exercise 加进 useCallback 依赖导致回调频繁重建
  const exerciseRef = React.useRef<Exercise | null>(null);
  exerciseRef.current = exercise;
  const [index, setIndex] = React.useState(0);
  const [answer, setAnswer] = React.useState('');
  const [grade, setGrade] = React.useState<Grade | null>(null);
  const [hint, setHint] = React.useState<{ text: string; level: number } | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [showAllHints, setShowAllHints] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState('');

  const [question, setQuestion] = React.useState('');
  const [history, setHistory] = React.useState<AskTurn[]>([]);
  const [streaming, setStreaming] = React.useState('');
  // 推理模型的思考过程：默认折叠，避免刷屏
  const [reasoning, setReasoning] = React.useState('');
  /** 流式过程中已接收内容的 token 估算，用于状态行显示进度 */
  const [liveTokens, setLiveTokens] = React.useState(0);
  const [showReasoning, setShowReasoning] = React.useState(false);
  /**
   * `z` 前缀：等待第二个键组成 zo(展开) / zc(关闭)。
   * Vim 的 fold 键位，比 Ctrl 组合更不容易被终端占用。
   */
  const [zPending, setZPending] = React.useState(false);

  /** 当前模式：normal = 所有按键都是命令；insert = 所有按键都是文本 */
  const [mode, setMode] = React.useState<Mode>('normal');

  // z 前缀不能一直挂着：超时自动清除，避免下一次按键被误当成 zo/zc
  React.useEffect(() => {
    if (!zPending) return;
    const timer = setTimeout(() => setZPending(false), 1200);
    return () => clearTimeout(timer);
  }, [zPending]);
  // 思考过程的滚动位置（null = 跟随底部，流式输出时自动滚）
  const [reasoningView, setReasoningView] = React.useState<ViewportState>({ offset: null });


  const [summary, setSummary] = React.useState<Summary>(() => summarize(progress.records));

  /**
   * 最近一次操作的完成态摘要。
   * 任务结束后保留在屏幕上，避免 Loading 一消失就什么都不留。
   */
  /**
   * 正在进行的请求的中断控制器。
   * 用 ref 而不是 state：中断需要立刻生效，不该等一次重渲染。
   */
  const abortRef = React.useRef<AbortController | null>(null);

  /** 发起请求前登记控制器；结束后清掉，避免误中断后续请求。 */
  const startAbortable = React.useCallback((): AbortSignal => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  }, []);

  const finishAbortable = React.useCallback(() => {
    abortRef.current = null;
  }, []);

  /**
   * 请求失败的统一处理。
   * 中断是用户主动行为，不该显示成红色报错，只留一行状态说明。
   */
  // 提示文案：有正文就说明进入回答阶段了，只看 reasoning 会一直停在「思考」
  const handleRequestError = React.useCallback(
    (err: unknown, startedAt: number, kind: 'exercise' | 'grade') => {
      const elapsedMs = Date.now() - startedAt;
      if (isAbortError(err)) {
        setNotice('已中断');
        setLastRun({ kind, elapsedMs, ok: false, aborted: true });
        setError(null);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setLastRun({ kind, elapsedMs, ok: false });
    },
    [],
  );

  const [lastRun, setLastRun] = React.useState<{
    kind: 'exercise' | 'grade' | 'hint' | 'ask';
    elapsedMs: number;
    ok: boolean;
    /** 被用户中断（不是失败，显示上要区分） */
    aborted?: boolean;
  } | null>(null);

  // 斜杠候选菜单的状态
  const [menuIndex, setMenuIndex] = React.useState(0);
  // 记录按下 Esc 时输入框的内容；内容一变就恢复候选，
  // 用布尔值会导致关闭后继续输入也不再弹出。
  const [dismissedAt, setDismissedAt] = React.useState<string | null>(null);
  const [showHelp, setShowHelp] = React.useState(false);

  /** /connect 保存后：换 Tutor、刷新状态栏、提示结果 */
  const applyConnection = React.useCallback(
    (next: ResolvedConfig, message: string) => {
      setConfig(next);
      const freshTutor = createTutor(next, progress);
      setTutor(freshTutor);
      setNotice(message);
      setError(null);

      // 从未连接状态配好的：立刻出一道题，避免停在空白页面
      if (!exerciseRef.current) {
        setPhase('loading');
        void freshTutor
          .generateExercise({ topic: initialTopic, difficulty: initialDifficulty })
          .then((ex) => {
            setExercise(ex);
            setIndex((i) => i + 1);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => setPhase('awaiting'));
      }
    },
    [progress, initialTopic, initialDifficulty],
  );

  const connect = useConnect({ config, onApplied: applyConnection });

  /** 当前面板对应的输入值。练习/统计面板写作答，对话面板写问题。 */
  const input = panel === 'chat' ? question : answer;
  const setInput = React.useCallback(
    (value: string) => {
      if (panel === 'chat') setQuestion(value);
      else setAnswer(value);
    },
    [panel],
  );

  // 对话面板的输入是自然语言，不弹指令菜单，避免打扰。
  // 进入参数区（已输入空格）后不再列指令名，改为由 argItems 提供参数候选。
  const inArgPhase = input.startsWith('/') && input.includes(' ');
  /** 输入框里已敲的指令名（不含量名前的斜杠与参数） */
  const typedName = input.replace(/^\//, '').split(/\s+/)[0] ?? '';
  const menuItems = React.useMemo(
    () => (panel === 'chat' || inArgPhase ? [] : filterCommands(input)),
    [input, panel, inArgPhase],
  );
  const argItems = React.useMemo(() => (panel === 'chat' ? [] : argChoices(input)), [input, panel]);
  const menuOpen = dismissedAt !== input && panel !== 'chat' && shouldShowMenu(input);

  // 输入内容变化后重置选中项；继续输入指令名时应重新弹出候选
  React.useEffect(() => {
    setMenuIndex(0);
    // 只有「清空输入」或「输入不再是斜杠开头」才解除关闭状态，
    // 否则用户 Esc 关掉后会一直被抑制。
    if (!input.startsWith("/")) setDismissedAt(null);
  }, [input]);

  /**
   * 可滚动的思考内容。
   * 只在生成中非空：结束后内容已随 history 保存，再传一次会重复渲染。
   */
  const reasoningText = reasoning;

  const busy = phase === 'loading' || phase === 'grading' || phase === 'hinting' || phase === 'asking';
  const disconnected = !config.mock && !config.apiKey;
  // 用 useStdout 获取终端尺寸：直接读 process.stdout.columns 在 Ink 下可能拿不到实时值，
  // 会导致换行宽度算错、每行被二次折行，视口高度就守不住了。
  const { stdout } = useStdout();
  const width = (stdout as unknown as { columns?: number })?.columns ?? process.stdout.columns ?? 80;

  const nextExercise = React.useCallback(
    async (nextTopic: TopicKey) => {
      setPhase('loading');
      setError(null);
      setNotice('');
      setGrade(null);
      setHint(null);
      setRevealed(false);
      setShowAllHints(false);
      setAnswer('');
      setReasoning('');
      setReasoningView({ offset: null });
      const startedAt = Date.now();
      const signal = startAbortable();
      try {
        const ex = await tutor.generateExercise({
          topic: nextTopic,
          difficulty,
          signal,
          onReasoning: (text) => setReasoning(text),
        });
        setExercise(ex);
        setIndex((i) => i + 1);
        setPanel('practice');
        setLastRun({ kind: 'exercise', elapsedMs: Date.now() - startedAt, ok: true });
      } catch (err) {
        handleRequestError(err, startedAt, 'exercise');
      } finally {
        finishAbortable();
        setPhase('awaiting');
      }
    },
    [tutor, difficulty],
  );

  React.useEffect(() => {
    // 没配 Key 时先出题必然失败，直接打开向导更省事；
    // 配置成功后由 applyConnection 触发首次出题。
    if (startWithConnect) {
      connect.open();
      return;
    }
    void nextExercise(initialTopic);
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = React.useCallback(
    async (text: string) => {
      if (!exercise || !text.trim()) return;
      setPhase('grading');
      setError(null);
      setNotice('');
      const startedAt = Date.now();
      const signal = startAbortable();
      try {
        const result = await tutor.grade(exercise, text, {
          signal,
          onReasoning: (text) => setReasoning(text),
        });
        setGrade(result);
        setPhase('graded');
        setLastRun({ kind: 'grade', elapsedMs: Date.now() - startedAt, ok: true });
        const updated = recordAttempt({
          title: exercise.title,
          topic: exercise.topic,
          difficulty: exercise.difficulty,
          verdict: result.verdict,
          score: result.score,
          reason: result.reason,
          question: exercise.question,
          answer: text,
        });
        progress.records = updated.records;
        setSummary(summarize(updated.records));
        setAnswer('');
      } catch (err) {
        handleRequestError(err, startedAt, 'grade');
      } finally {
        finishAbortable();
      }
    },
    [tutor, exercise, progress, startAbortable, finishAbortable, handleRequestError],
  );

  const requestHint = React.useCallback(async () => {
    if (!exercise) return;
    const level = hint?.level ?? 0;
    if (level >= exercise.hints.length) {
      setShowAllHints(true);
      setNotice('提示已全部展开');
      return;
    }
    setPhase('hinting');
    setError(null);
    try {
      const text = await tutor.hint(exercise, level, {
        signal: startAbortable(),
        onReasoning: (r) => setReasoning(r),
      });
      setHint({ text, level: level + 1 });
      setPhase('graded');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('awaiting');
    }
  }, [tutor, exercise, hint]);

  const askQuestion = React.useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setQuestion('');
      setStreaming('');
      setReasoning('');
      setLiveTokens(0);
      setReasoningView({ offset: null });
      setPhase('asking');
      setError(null);
      const startedAt = Date.now();
      try {
        let buffer = '';
        let think = '';
        const reply = await tutor.ask(q, {
          exercise,
          history,
          onDelta: (chunk) => {
            buffer += chunk;
            setStreaming(buffer);
          },
          onReasoning: (chunk) => {
            think += chunk;
            setReasoning(think);
          },
          // token 估算按累计内容算，不逐块相加（逐块相加误差会累积）
          onProgress: (received) => setLiveTokens(estimateTokens(received)),
        });
        // 思考过程不写进 history：由独立的「思考视口」展示，避免两处重复渲染。
        // 也不清空，让用户生成结束后仍能展开滚动回看。
        setHistory((prev) => [...prev, { q, a: reply }]);
        setLastRun({ kind: 'ask', elapsedMs: Date.now() - startedAt, ok: true });
        setStreaming('');
      } catch (err) {
        if (isAbortError(err)) {
          setNotice('已中断');
          setLastRun({ kind: 'ask', elapsedMs: Date.now() - startedAt, ok: false, aborted: true });
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setLastRun({ kind: 'ask', elapsedMs: Date.now() - startedAt, ok: false });
        }
        setStreaming('');
      } finally {
        setPhase('awaiting');
      }
    },
    [tutor, exercise, history],
  );

  const runReview = React.useCallback(async () => {
    setPanel('stats');
    setPhase('asking');
    setError(null);
    try {
      const text = await tutor.review(progress.records);
      setHistory((prev) => [...prev, { q: '请复盘我的练习情况', a: text }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase('awaiting');
    }
  }, [tutor, progress]);

  /** 斜杠指令：与纯文本 CLI 保持同一套语义。 */
  const runCommand = React.useCallback(
    (raw: string) => {
      const [cmd = '', ...rest] = raw.replace(/^\//, '').trim().split(/\s+/);
      const name = resolveCommandName(cmd) ?? cmd;
      switch (name) {
        case 'connect':
          connect.open();
          break;
        case 'next':
          void nextExercise(topic);
          break;
        case 'hint':
          void requestHint();
          break;
        case 'answer':
          setRevealed(true);
          break;
        case 'stats':
          setPanel('stats');
          break;
        case 'ask':
          setPanel('chat');
          setQuestion(rest.join(' '));
          break;
        case 'review':
          void runReview();
          break;
        case 'help':
          setShowHelp(true);
          break;
        case 'topic': {
          const next = resolveTopic(rest[0]);
          if (next) {
            setTopic(next);
            void nextExercise(next);
          } else if (rest[0]) {
            setNotice(`未知主题「${rest[0]}」，可选：${TOPIC_KEYS.join(' / ')}`);
          } else {
            setNotice(`用法 /topic <${TOPIC_KEYS.join('|')}>`);
          }
          break;
        }
        case 'quit':
          exit();
          break;
        default:
          setNotice(`未知指令 /${cmd}，输入 / 查看可用指令`);
      }
    },
    [nextExercise, requestHint, runReview, topic, exit, connect],
  );

  /** 练习/统计面板的提交入口：斜杠走指令，否则判题。 */
  const submitInput = React.useCallback(
    (value: string) => {
      const trimmed = value.trim();
      // 提交后一律回到命令模式（Vim 习惯）：否则接下来的按键会被当成文本，
      // 例如想按 zo 展开思考，却把 "zo" 打进了输入框。
      setMode('normal');
      if (!trimmed) return;
      if (trimmed.startsWith('/')) {
        setAnswer('');
        runCommand(trimmed);
        return;
      }
      void submit(trimmed);
    },
    [runCommand, submit],
  );

  /**
   * normal 模式的命令处理。
   *
   * 模态的关键：这个 useInput **始终注册**（除向导外），所以不存在
   * 「没有输入框就收不到按键」的问题 —— 之前那类 bug 从此在设计上消失。
   * insert 模式下本处理器停用，按键全部交给 InputBar。
   */
  const handleNormalKey = React.useCallback(
    (input: string, key: {
      ctrl: boolean; meta: boolean; tab: boolean; return: boolean; escape: boolean;
      upArrow: boolean; downArrow: boolean;
    }): void => {
      // ---- 思考过程的滚动（只在展开时有意义）----
      if (showReasoning && reasoningText) {
        const lines = wrapToLines(reasoningText, Math.max(16, (process.stdout.columns ?? 80) - 16));
        const move = (delta: number) => setReasoningView((v) => scrollBy(lines, REASONING_VIEWPORT_HEIGHT, v, delta));
        if (key.upArrow || input === 'k') return move(-1);
        if (key.downArrow || input === 'j') return move(1);
        if (input === 'u') return move(-REASONING_VIEWPORT_HEIGHT);
        if (input === 'd') return move(REASONING_VIEWPORT_HEIGHT);
        if (input === 'g') return setReasoningView({ offset: 0 });
        if (input === 'G') return setReasoningView({ offset: null });
      }

      // ---- zo / zc：展开与收起 ----
      // 模态下所有按键都是命令，不会再漏进输入框，所以不再需要「前缀未命中就交给输入框」
      if (zPending) {
        setZPending(false);
        if (input === 'o') {
          setShowReasoning(true);
          setReasoningView({ offset: null });
          return;
        }
        if (input === 'c') {
          setShowReasoning(false);
          return;
        }
        if (input === 'z') {
          setZPending(true); // 连按 zz 也当展开，跟 Vim 一致
          return;
        }
        return; // 其它键：忽略这一轮前缀
      }
      if (input === 'z') {
        setZPending(true);
        return;
      }

      // ---- 全局按键 ----
      if (key.escape) {
        // 正在请求时优先中断 —— 这是最需要 Esc 的时刻
        if (busy && abortRef.current) {
          abortRef.current.abort();
          setNotice('已中断');
          return;
        }
        if (showHelp) return setShowHelp(false);
        setInput(''); // 清空当前输入
        return;
      }
      if (key.tab) {
        const at = PANEL_ORDER.indexOf(panel);
        setPanel(PANEL_ORDER[(at + 1) % PANEL_ORDER.length] as Panel);
        return;
      }
      if (input === '?') return setShowHelp((v) => !v);
      if (input === 'q') {
        exit();
        return;
      }
      if (input === 'i' || key.return) {
        if (busy) {
          setNotice('请求进行中，Esc 可中断');
          return;
        }
        setNotice('');
        setMode('insert');
        return;
      }

      // ---- 面板相关 ----
      if (input === 'n') return void nextExercise(topic);
      if (input === 'h') {
        setPanel('practice');
        void requestHint();
        return;
      }
      if (input === 'a') return setRevealed(true);
      if (input === 'A') {
        if (busy) return setNotice('请求进行中，Esc 可中断');
        setPanel('chat');
        setMode('insert');
        return;
      }
      if (input === 's') return setPanel('stats');
      if (input === 'r') return void runReview();
      if (input === 'c') return connect.open();

      // 未绑定的键：给个提示，避免用户以为程序没反应
      if (isPrintable(input)) setNotice(`未绑定按键：${input}（按 ? 看全部）`);
    },
    [
      showReasoning, reasoningText, zPending, busy, showHelp, panel, topic,
      nextExercise, requestHint, runReview, connect, exit, setInput,
    ],
  );

  // normal 模式：命令处理。始终注册，因此不会出现「按键无人接收」。
  useInput(
    (input, key) => handleNormalKey(input, key),
    { isActive: !connect.active && mode === 'normal' },
  );

  // 底部提示：向导有自己的说明；候选菜单打开时优先提示菜单操作
  const footer = connect.active
    ? 'Esc 取消向导 · ↑↓ 选服务商 · Enter 下一步'
    : menuOpen
      ? '↑↓ 选择 · Tab / Enter 补全 · Esc 关闭候选'
      : '';

  // 状态栏优先显示连接状态，让用户随时知道当前在跟谁说话
  const status = disconnected
    ? '未连接 · 输入 /connect 配置'
    : `${TOPICS[topic].label} · ${DIFFICULTIES[difficulty].label} · ${
        config.mock ? 'Mock' : config.model
      }`;

  return (
    <Frame
      title="dojo"
      status={status}
      footer={<ModeBar mode={mode} notice={notice} />}
      footerSuffix={footer}
    >
      {connect.active ? (
        <ConnectPanel
          config={config}
          draft={connect.draft}
          step={connect.step}
          providerIndex={connect.providerIndex}
          probe={connect.probe}
          error={connect.error}
          input={connect.input}
          setInput={connect.setInput}
          onMove={connect.move}
          onConfirmProvider={() => connect.submit('')}
          onEscape={connect.cancel}
          onSubmit={connect.submit}
          onRetest={connect.retest}
          onSave={connect.save}
          onCancel={connect.cancel}
        />
      ) : null}

      {!connect.active && panel === 'practice' ? (
        <Box flexDirection="column">
          {/* 出题状态：完成后保留一行摘要，而不是直接消失 */}
          {phase === 'loading' || (lastRun?.kind === 'exercise' && !error) ? (
            <StatusLine
              busyText="大模型正在出题"
              done={phase !== 'loading'}
              doneText={lastRun?.aborted ? '已中断' : lastRun?.ok ? '题目已生成' : '出题失败'}
              elapsedMs={lastRun?.elapsedMs}
              meta={config.mock ? 'Mock' : config.model}
              failed={!lastRun?.ok && !lastRun?.aborted}
              aborted={lastRun?.aborted}
            />
          ) : null}

          {exercise ? (
            <ExerciseCard exercise={exercise} index={index} revealed={revealed} showHints={showAllHints} />
          ) : null}

          <ReasoningPanel
            text={reasoningText}
            expanded={showReasoning}
            view={reasoningView}
            generating={phase === 'loading' || phase === 'grading' || phase === 'hinting'}
            width={width}
          />

          {hint ? <HintPanel text={hint.text} level={hint.level} total={exercise?.hints.length ?? 3} /> : null}
          {grade ? <GradePanel grade={grade} /> : null}
          {error ? <ErrorPanel message={error} /> : null}
          {notice ? (
            <Box marginTop={1}>
              <Text color={theme.text.muted}>{notice}</Text>
            </Box>
          ) : null}
          {phase === 'grading' || (lastRun?.kind === 'grade' && grade) ? (
            <StatusLine
              busyText="大模型正在判题"
              done={phase !== 'grading'}
              doneText={lastRun?.aborted ? '已中断' : '判题完成'}
              elapsedMs={lastRun?.elapsedMs}
              meta={config.mock ? 'Mock' : config.model}
              aborted={lastRun?.aborted}
            />
          ) : null}
          {phase === 'hinting' ? <StatusLine busyText="正在生成提示" /> : null}

          {showHelp ? <KeyHelp mode={mode} /> : null}

          {exercise ? (
            <Box marginTop={1} flexDirection="column">
              <InputBar
                value={answer}
                onChange={setAnswer}
                onSubmit={submitInput}
                onEscape={() => setMode('normal')}
                onQuit={exit}
                placeholder="输入命令，或 /hint 要提示…"
                active={mode === 'insert' && !busy}
              />
              {menuOpen ? (
                <CommandMenu items={menuItems} activeIndex={menuIndex} input={input} argItems={argItems} />
              ) : null}
              <Box marginTop={1}>
                {/* 只在「刚判完题」这种需要指引下一步的时候提示；
                    通用按键交给底部的模式栏，避免两行重复 */}
                <Text color={theme.text.muted}>
                  {phase === 'graded' ? '按 n 换下一题 · a 看答案 · h 要提示' : ' '}
                </Text>
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : null}

      {!connect.active && panel === 'chat' ? (
        <Box flexDirection="column">
          <ChatPanel
            history={history}
            streaming={streaming}
            reasoning={reasoningText}
            showReasoning={showReasoning}
            reasoningView={reasoningView}
            generating={phase === 'asking'}
            width={width}
          />
          {error ? <ErrorPanel message={error} /> : null}
          {phase === 'asking' || (lastRun?.kind === 'ask' && !error) ? (
            <StatusLine
              busyText={streaming ? '助教正在回答' : '助教正在思考'}
              tokens={liveTokens}
              done={phase !== 'asking'}
              doneText={lastRun?.aborted ? '已中断' : lastRun?.ok ? '回答完成' : '回答失败'}
              elapsedMs={lastRun?.elapsedMs}
              meta={config.mock ? 'Mock' : config.model}
              aborted={lastRun?.aborted}
              failed={!lastRun?.ok && !lastRun?.aborted}
            />
          ) : null}

          <Box marginTop={1} flexDirection="column">
            <InputBar
              value={question}
              onChange={setQuestion}
              onSubmit={(value) => {
                const trimmed = value.trim();
                if (!trimmed) return;
                setMode('normal');
                void askQuestion(trimmed);
              }}
              onEscape={() => setMode('normal')}
              onQuit={exit}
              placeholder="问点什么，例如：uniq -c 为什么要先 sort？"
              active={mode === 'insert' && !busy}
            />
            <Box marginTop={1}>
              <Text color={theme.text.muted}>回车发送 · 回答不会直接给出当前题答案</Text>
            </Box>
          </Box>
        </Box>
      ) : null}

      {!connect.active && panel === 'stats' ? (
        <Box flexDirection="column">
          <StatsPanel summary={summary} />
          {error ? <ErrorPanel message={error} /> : null}
          <Box marginTop={1} flexDirection="column">
            <InputBar
              value={answer}
              onChange={setAnswer}
              onSubmit={submitInput}
              onEscape={() => setMode('normal')}
              onQuit={exit}
              placeholder="输入 / 查看指令，或 /topic <主题> 换主题…"
              active={mode === 'insert' && !busy}
            />
            {menuOpen ? (
              <CommandMenu items={menuItems} activeIndex={menuIndex} input={input} argItems={argItems} />
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Frame>
  );
}

/** 帮助面板：列出全部指令与快捷键，数据来自 commands.ts。 */
