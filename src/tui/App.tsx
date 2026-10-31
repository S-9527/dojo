import React from 'react';
import { Box, Text, useApp, useStdout } from 'ink';
import type { AskTurn, Exercise, Grade, Progress, ResolvedConfig, Summary, TopicKey } from '../types.js';
import { createTutor, type Tutor } from '../tutor.js';
import { useConnect } from './useConnect.js';
import { ConnectPanel } from './components/ConnectPanel.js';
import { DIFFICULTIES, TOPICS, TOPIC_KEYS, resolveTopic } from '../topics.js';
import { recordAttempt, summarize } from '../store.js';
import { COMMANDS, argChoices, filterCommands, resolveCommandName, shouldShowMenu } from '../commands.js';
import { Frame } from './components/base.js';
import { ExerciseCard } from './components/ExerciseCard.js';
import { ChatPanel } from './components/ChatPanel.js';
import { StatsPanel } from './components/StatsPanel.js';
import { CommandMenu } from './components/CommandMenu.js';
import { ErrorPanel, GradePanel, HintPanel, Loading } from './components/GradePanel.js';
import { InputBar, type ShortcutKey } from './components/InputBar.js';
import { theme } from './theme.js';
import { scrollBy, wrapToLines, type ViewportState } from './scroll.js';
import { REASONING_VIEWPORT_HEIGHT } from './components/ChatPanel.js';

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
 * 按键处理集中在一个 onShortcut 回调里（见 InputBar），
 * 这样快捷键与文本输入不会互相污染——Ink 没有事件冒泡，
 * 多个 useInput 会同时收到同一按键，用 ink-text-input 时
 * Ctrl-G 的 'g' 会被插进输入框。
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
  const [showReasoning, setShowReasoning] = React.useState(false);
  /**
   * `z` 前缀：等待第二个键组成 zo(展开) / zc(关闭)。
   * Vim 的 fold 键位，比 Ctrl 组合更不容易被终端占用。
   */
  const [zPending, setZPending] = React.useState(false);

  // z 前缀不能一直挂着：超时自动清除，避免下一次按键被误当成 zo/zc
  React.useEffect(() => {
    if (!zPending) return;
    const timer = setTimeout(() => setZPending(false), 1200);
    return () => clearTimeout(timer);
  }, [zPending]);
  // 思考过程的滚动位置（null = 跟随底部，流式输出时自动滚）
  const [reasoningView, setReasoningView] = React.useState<ViewportState>({ offset: null });


  const [summary, setSummary] = React.useState<Summary>(() => summarize(progress.records));

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
      try {
        const ex = await tutor.generateExercise({ topic: nextTopic, difficulty });
        setExercise(ex);
        setIndex((i) => i + 1);
        setPanel('practice');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
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
      try {
        const result = await tutor.grade(exercise, text);
        setGrade(result);
        setPhase('graded');
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
        setError(err instanceof Error ? err.message : String(err));
        setPhase('awaiting');
      }
    },
    [tutor, exercise, progress],
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
      const text = await tutor.hint(exercise, level);
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
      setReasoningView({ offset: null });
      setPhase('asking');
      setError(null);
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
        });
        // 思考过程不写进 history：由独立的「思考视口」展示，避免两处重复渲染。
        // 也不清空，让用户生成结束后仍能展开滚动回看。
        setHistory((prev) => [...prev, { q, a: reply }]);
        setStreaming('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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

  /** 统一按键分发：命中快捷键返回 true，该按键不会再进输入框。 */
  const handleShortcut = React.useCallback(
    (input: string, key: ShortcutKey): boolean => {
      if (key.ctrl && input === 'c') {
        exit();
        return true;
      }

      // 向导激活时接管全部按键，避免漏到主界面（例如 Tab 切面板）
      if (connect.active) {
        if (key.escape) {
          connect.cancel();
          return true;
        }
        if (key.upArrow || key.downArrow) {
          // 只有选服务商那一步用得到方向键
          return connect.move(key.upArrow ? -1 : 1);
        }
        if (connect.step === 'done') {
          if (key.return || input === 's' || input === 'S') {
            connect.save();
            return true;
          }
          if (input === 't' || input === 'T') {
            connect.retest();
            return true;
          }
          return true;
        }
        // provider 步骤没有输入框，Enter 直接确认；其余步骤交给 InputBar
        if (connect.step === 'provider' && key.return) {
          connect.submit('');
          return true;
        }
        return false;
      }

      // 候选菜单打开时优先处理导航键，Tab 用于补全而不是切面板
      if (menuOpen) {
        if (key.upArrow) {
          setMenuIndex((i) => (i - 1 + menuItems.length) % Math.max(1, menuItems.length));
          return true;
        }
        if (key.downArrow) {
          setMenuIndex((i) => (i + 1) % Math.max(1, menuItems.length));
          return true;
        }
        if (key.escape) {
          setDismissedAt(input);
          setMenuIndex(0);
          return true;
        }
        if (key.tab) {
          // 参数区优先补全参数，否则补全指令名
          if (inArgPhase) {
            const arg = argItems[0];
            if (arg) setInput(`/topic ${arg.value}`);
            return true;
          }
          const picked = menuItems[menuIndex];
          if (picked) {
            setInput(`/${picked.name}${picked.takesArg ? ' ' : ''}`);
            setMenuIndex(0);
          }
          return true;
        }
        // Enter 时：输入与候选完全一致就直接执行，否则先补全成选中项
        if (key.return) {
          if (inArgPhase) {
            const arg = argItems[0];
            if (arg) {
              // 只有一个候选就直接执行，多个则先补全等用户确认
              if (argItems.length === 1) {
                setInput(`/topic ${arg.value}`);
                return false;
              }
              setInput(`/topic ${arg.value}`);
              return true;
            }
            return false;
          }
          const picked = menuItems[menuIndex];
          // 注意：Enter 时 input 是 "\r"，不能拿它当输入内容，
          // 要判断的是输入框里已经敲的指令名。
          if (picked && resolveCommandName(typedName) === picked.name) {
            return false; // 交给 InputBar 走 onSubmit 执行
          }
          if (picked) {
            setInput(`/${picked.name}${picked.takesArg ? ' ' : ''}`);
            setMenuIndex(0);
            return true;
          }
          return false;
        }
      }

      if (key.tab) {
        const at = PANEL_ORDER.indexOf(panel);
        setPanel(PANEL_ORDER[(at + 1) % PANEL_ORDER.length] as Panel);
        return true;
      }
      if (key.ctrl && input === 'n') {
        void nextExercise(topic);
        return true;
      }
      // Ctrl-H 在终端里就是退格，无法作为快捷键，所以提示用 Ctrl-G
      if (key.ctrl && input === 'g') {
        setPanel('practice');
        void requestHint();
        return true;
      }
      if (key.ctrl && input === 'x') {
        setRevealed((r) => !r);
        return true;
      }
      if (key.ctrl && input === 'a') {
        setPanel('chat');
        return true;
      }
      if (key.ctrl && input === 'r') {
        void runReview();
        return true;
      }
      // 思考过程的展开/关闭：zo 展开、zc 关闭（沿用 Vim fold 键位）。
      // 不用 Ctrl 组合是因为 Ctrl-T 在部分终端被占用，且无法用鼠标点击
      // —— Ink 8 会主动丢弃鼠标事件。
      const canToggleReasoning = Boolean(reasoningText);
      if (canToggleReasoning) {
        if (zPending) {
          setZPending(false);
          if (input === 'o') {
            setShowReasoning(true);
            setReasoningView({ offset: null });
            return true;
          }
          if (input === 'c') {
            setShowReasoning(false);
            return true;
          }
          // 不是 zo/zc：把 z 当普通字符处理，交给输入框
          return false;
        }
        if (!key.ctrl && !key.meta && input === 'z') {
          setZPending(true);
          return true;
        }
        // 兼容旧习惯：Ctrl-T 仍然可切换
        if (key.ctrl && input === 't') {
          setShowReasoning((v) => !v);
          return true;
        }
      }

      // 思考过程展开时，方向键/PgUp/PgDn/Home/End 用于滚动
      if (showReasoning && reasoningText) {
        // 与 ChatPanel 里 ScrollBox 的换行宽度保持一致（按显示列，中文占 2 列）
        const lines = wrapToLines(reasoningText, Math.max(16, (process.stdout.columns ?? 80) - 16));
        const moved = (delta: number): true => {
          setReasoningView((v) => scrollBy(lines, REASONING_VIEWPORT_HEIGHT, v, delta));
          return true;
        };
        if (key.upArrow) return moved(-1);
        if (key.downArrow) return moved(1);
        // PgUp/PgDn 的转义序列在部分终端/复用器下识别不到，额外提供 u/d 单键
        if ((key as { pageUp?: boolean }).pageUp || input === 'u') return moved(-REASONING_VIEWPORT_HEIGHT);
        if ((key as { pageDown?: boolean }).pageDown || input === 'd') return moved(REASONING_VIEWPORT_HEIGHT);
        // Home/End 在各终端的转义序列不统一，额外提供 g / G 两个单键
        if ((key as { home?: boolean }).home || input === 'g') {
          setReasoningView({ offset: 0 });
          return true;
        }
        if ((key as { end?: boolean }).end || input === 'G') {
          setReasoningView({ offset: null });
          return true;
        }
      }
      if (key.escape) {
        if (showHelp) {
          setShowHelp(false);
          return true;
        }
        if (panel !== 'practice') {
          setPanel('practice');
          return true;
        }
        if (phase === 'graded') {
          void nextExercise(topic);
          return true;
        }
        return false;
      }
      return false;
    },
    [
      panel, phase, topic, nextExercise, requestHint, runReview, exit,
      menuOpen, menuItems, menuIndex, showHelp, setInput, connect, inArgPhase, argItems,
    ],
  );

  const footer = connect.active
    ? 'Esc 取消向导 · ↑↓ 选服务商 · Enter 下一步'
    : 'Tab 面板 · Ctrl-N 换题 · Ctrl-G 提示 · Ctrl-X 答案 · Ctrl-A 提问 · Ctrl-R 复盘 · zo/zc 思考 · Ctrl-C 退出';

  // 状态栏优先显示连接状态，让用户随时知道当前在跟谁说话
  const status = disconnected
    ? '未连接 · 输入 /connect 配置'
    : `${TOPICS[topic].label} · ${DIFFICULTIES[difficulty].label} · ${
        config.mock ? 'Mock' : config.model
      }`;

  const navHint = connect.active
    ? footer
    : menuOpen
      ? '↑↓ 选择 · Tab / Enter 补全 · Esc 关闭候选'
      : footer;

  return (
    <Frame title="dojo" status={status} footer={navHint}>
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
          onShortcut={handleShortcut}
          onSubmit={connect.submit}
          onRetest={connect.retest}
          onSave={connect.save}
          onCancel={connect.cancel}
        />
      ) : null}

      {!connect.active && panel === 'practice' ? (
        <Box flexDirection="column">
          {phase === 'loading' ? <Loading text="大模型正在出题…" /> : null}

          {exercise ? (
            <ExerciseCard exercise={exercise} index={index} revealed={revealed} showHints={showAllHints} />
          ) : null}

          {hint ? <HintPanel text={hint.text} level={hint.level} total={exercise?.hints.length ?? 3} /> : null}
          {grade ? <GradePanel grade={grade} /> : null}
          {error ? <ErrorPanel message={error} /> : null}
          {notice ? (
            <Box marginTop={1}>
              <Text color={theme.dim}>{notice}</Text>
            </Box>
          ) : null}
          {phase === 'grading' ? <Loading text="大模型正在判题…" /> : null}
          {phase === 'hinting' ? <Loading text="正在生成提示…" /> : null}

          {showHelp ? <HelpPanel onClose={() => setShowHelp(false)} /> : null}

          {exercise ? (
            <Box marginTop={1} flexDirection="column">
              <InputBar
                value={answer}
                onChange={setAnswer}
                onShortcut={handleShortcut}
                onSubmit={submitInput}
                placeholder="输入命令，或 /hint 要提示…"
                active={!busy}
              />
              {menuOpen ? (
                <CommandMenu items={menuItems} activeIndex={menuIndex} input={input} argItems={argItems} />
              ) : null}
              <Box marginTop={1}>
                <Text color={theme.dim}>
                  {phase === 'graded'
                    ? 'Esc / Ctrl-N 进入下一题 · Ctrl-X 看答案 · Ctrl-G 提示'
                    : '回车提交 · 输入 / 查看全部指令'}
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
          {phase === 'asking' && !streaming ? <Loading text="助教正在思考…" /> : null}

          <Box marginTop={1} flexDirection="column">
            <InputBar
              value={question}
              onChange={setQuestion}
              onShortcut={handleShortcut}
              onSubmit={(value) => {
                const trimmed = value.trim();
                if (trimmed) void askQuestion(trimmed);
              }}
              placeholder="问点什么，例如：uniq -c 为什么要先 sort？"
              active={!busy}
            />
            <Box marginTop={1}>
              <Text color={theme.dim}>回车发送 · 回答不会直接给出当前题答案</Text>
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
              onShortcut={handleShortcut}
              onSubmit={submitInput}
              placeholder="输入 / 查看指令，或 /topic <主题> 换主题…"
              active={!busy}
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
function HelpPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Box justifyContent="space-between">
        <Text color={theme.text} bold>
          指令一览
        </Text>
        <Text color={theme.dim}>Esc 关闭</Text>
      </Box>
      <Box flexDirection="column" marginTop={0}>
        {COMMANDS.map((cmd) => (
          <Box key={cmd.name}>
            <Box width={12} flexShrink={0}>
              <Text color={theme.accent}>{`/${cmd.name}`}</Text>
            </Box>
            <Text color={theme.muted}>{cmd.summary}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>Tab 面板 · Ctrl-N 换题 · Ctrl-G 提示 · Ctrl-X 答案 · Ctrl-A 提问 · Ctrl-R 复盘</Text>
      </Box>
    </Box>
  );
}
