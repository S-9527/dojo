import { LlmError, chat as realChat, chatStream as realChatStream } from './llm.js';
import { parseJsonLoose } from './json.js';
import { normalizeExercise, normalizeGrade } from './schema.js';
import {
  systemPrompt,
  buildExercisePrompt,
  buildGradePrompt,
  buildAskPrompt,
  buildHintPrompt,
  buildReviewPrompt,
} from './prompts.js';
import { DIFFICULTIES, TOPICS } from './topics.js';
import { mockChat, mockChatStream } from './mock.js';
import { detectForeignLanguage, describeLanguageIssue } from './lang.js';
import type {
  AskTurn,
  AttemptRecord,
  ChatFn,
  Difficulty,
  Exercise,
  Grade,
  Progress,
  ResolvedConfig,
  StreamFn,
  TopicKey,
} from './types.js';

export interface TutorOptions {
  config: ResolvedConfig;
  progress?: Progress;
  chatFn?: ChatFn;
  streamFn?: StreamFn;
}

export interface GenerateOptions {
  topic: TopicKey;
  difficulty: Difficulty;
  extraRequirement?: string;
  /** 用于中断请求（Esc 取消） */
  signal?: AbortSignal;
}

export interface AskOptions {
  exercise?: Exercise | null;
  history?: AskTurn[];
  onDelta?: (chunk: string) => void;
  /** 思考过程增量（推理模型才有） */
  onReasoning?: (chunk: string) => void;
  /** 进度回调：已接收的完整内容，用于 token 估算 */
  onProgress?: (received: string) => void;
  signal?: AbortSignal;
}

export class Tutor {
  readonly config: ResolvedConfig;
  progress: Progress;
  private readonly chatFn: ChatFn;
  private readonly streamFn: StreamFn;

  constructor({ config, progress = { version: 1, createdAt: new Date().toISOString(), records: [] }, chatFn, streamFn }: TutorOptions) {
    this.config = config;
    this.progress = progress;
    this.chatFn = chatFn ?? ((cfg, messages, opts) => realChat(cfg, messages, opts));
    this.streamFn = streamFn ?? ((cfg, messages, opts) => realChatStream(cfg, messages, opts));
  }

  /** 根据历史记录生成出题上下文：避免重复，并对没过的题出同类新场景。 */
  private contextFor(topic: TopicKey): { historyLines: string[]; avoidTitles: string[] } {
    const records = this.progress.records;
    const recent = records.slice(-8);
    const historyLines = recent.map((r) => `- ${r.title}（${r.topic}/${r.difficulty}）结果: ${r.verdict}`);
    const weak = recent.filter((r) => r.verdict !== 'correct').map((r) => r.title);
    if (weak.length) {
      historyLines.push(`学员在以下题目上没过：${weak.join('、')}，可以出同类但换了场景的题。`);
    }
    const avoidTitles = records
      .filter((r) => r.topic === topic)
      .slice(-10)
      .map((r) => r.title);
    return { historyLines, avoidTitles };
  }

  /** 出题。JSON 不合规时重试一次并降低温度提高稳定性。 */
  async generateExercise({ topic, difficulty, extraRequirement = '', signal }: GenerateOptions): Promise<Exercise> {
    const { historyLines, avoidTitles } = this.contextFor(topic);
    const prompt = buildExercisePrompt({
      topicLabel: TOPICS[topic].label,
      difficultyHint: DIFFICULTIES[difficulty].label,
      extraRequirement,
      historyLines,
      avoidTitles,
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // 第 3 次专门针对语言问题：把「上一次错在哪」明确告诉模型
      const suffix =
        attempt === 0
          ? ''
          : attempt === 1
            ? '\n\n注意：必须输出严格合法的 JSON，不要加任何解释文字。'
            : '\n\n注意：上一次的输出混入了日文/其它语言。这次必须全部使用简体中文叙述，' +
              '只保留命令、路径、文件名等专有名词为英文。';
      // 题目是一整个 JSON，推理模型的思考过程还要额外吃掉大量 token，
      // 用 callWithReasoningFallback 自动放大预算重试
      const raw = await this.callWithReasoningFallback('exercise', 2500, 6000, (maxTokens) =>
        this.chatFn(
          this.config,
          [
            { role: 'system', content: systemPrompt() },
            { role: 'user', content: prompt + suffix },
          ],
          {
            // 出题要有变化，但重试时要稳定
            temperature: attempt === 0 ? 0.85 : 0.4,
            jsonMode: true,
            maxTokens,
            signal,
          },
        ),
      );

      try {
        const exercise = normalizeExercise(parseJsonLoose(raw, '出题结果'), { topic, difficulty });

        // 语言漂移检测：提示词压不住时，靠重试兜底。
        // 中日双语模型（如 SenseNova）遇到日式路径容易把叙述也写成日文。
        const issue = detectForeignLanguage(
          [exercise.title, exercise.scenario, exercise.question, ...exercise.acceptance].join('\n'),
        );
        if (issue) {
          lastError = new Error(describeLanguageIssue(issue));
          continue; // 重新出题，不再用这次的
        }

        return exercise;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('出题失败');
  }

  /** 判题。温度压到 0.1，尽量让同样的答案得到同样的判定。 */
  async grade(exercise: Exercise, answer: string, options: { signal?: AbortSignal } = {}): Promise<Grade> {
    const raw = await this.callWithReasoningFallback('grade', 1500, 3500, (maxTokens) =>
      this.chatFn(
        this.config,
        [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: buildGradePrompt(exercise, answer) },
        ],
        { temperature: 0.1, jsonMode: true, maxTokens, signal: options.signal },
      ),
    );
    const grade = normalizeGrade(parseJsonLoose(raw, '判题结果'));
    const issue = detectForeignLanguage([grade.reason, grade.corrected_answer, ...grade.knowledge_points].join('\n'));
    if (issue) {
      // 判题结果不重试（已消耗一次请求），但把问题明确标出来，避免用户看到混杂文本却不知原因
      grade.reason = `${grade.reason}\n\n（注意：模型评语混入了${
        issue.language === 'japanese' ? '日文' : '韩文'
      }，如影响理解请重试本题）`;
    }
    return grade;
  }

  /** 答疑（流式输出，边生成边回调）。 */
  async ask(
    question: string,
    { exercise = null, history = [], onDelta, onReasoning, onProgress, signal }: AskOptions = {},
  ): Promise<string> {
    return this.streamFn(
      this.config,
      [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: buildAskPrompt({ exercise, history }) },
        { role: 'user', content: question },
      ],
      { onDelta, onReasoning, onProgress, temperature: 0.5, maxTokens: this.budget(1500), signal },
    );
  }

  /** 递进式提示：级别越高越接近答案。 */
  async hint(exercise: Exercise, hintLevel: number, options: { signal?: AbortSignal } = {}): Promise<string> {
    const raw = await this.chatFn(
      this.config,
      [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: buildHintPrompt(exercise, hintLevel) },
      ],
      { temperature: 0.4, maxTokens: this.budget(800), signal: options.signal },
    );
    return raw.trim();
  }

  /** 学习复盘。 */
  async review(records: AttemptRecord[]): Promise<string> {
    if (!records.length) return '还没有练习记录，先做一两道题再来复盘吧。';
    return this.chatFn(
      this.config,
      [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: buildReviewPrompt(records) },
      ],
      { temperature: 0.4, maxTokens: this.budget(1500) },
    );
  }

  /**
   * 统一放大 token 预算，给推理模型留出 reasoning 空间。
   * 配置项 maxTokensScale 可整体调节；默认 1，仅对已知推理模型有帮助。
   */
  private budget(base: number): number {
    const scale = Number(this.config.tokenScale ?? 1);
    const effective = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return Math.max(base, Math.round(base * effective));
  }

  /**
   * 已探明「够用」的预算，按调用类型记住。
   *
   * 为什么需要它：重试时若仍从 base 重新试探，每次都要先烧一次不足的预算，
   * 请求数会成倍增长（实测最坏 6 次 × 9000 token，用户要等两分钟以上）。
   * 记住之后，后续重试直接从够用的预算开始。
   */
  private learnedBudget = new Map<string, number>();

  /**
   * 带「推理模型自动补救」的调用。
   *
   * 推理模型会先花 token 思考，预算不够时 content 为空、finish_reason=length。
   * 这里捕获该错误，自动把预算翻倍重试一次，并记住这个模型是推理模型，
   * 后续调用直接用放大后的预算 —— 用户不需要手动调参。
   */
  private async callWithReasoningFallback(
    kind: string,
    base: number,
    cap: number,
    run: (maxTokens: number) => Promise<string>,
  ): Promise<string> {
    // 之前已经探明这个模型需要更多预算，就直接从那里开始，不再重试一遍
    const learned = this.learnedBudget.get(kind);
    const first = learned ?? this.budget(base);
    try {
      return await run(first);
    } catch (err) {
      // 被用户中断时不重试：重试等于无视用户的取消意图
      if (isAbortError(err)) throw err;
      if (!(err instanceof LlmError) || err.code !== 'reasoning-exhausted') throw err;

      // 只放大一档，且有硬上限：推理模型的思考长度不可控，
      // 不设上限会让一次出题烧掉几万 token、用户干等几分钟。
      const retryBudget = Math.min(cap, Math.round(first * 2));
      if (retryBudget <= first) throw err; // 已到上限，不再试
      this.config.isReasoningModel = true;
      try {
        const text = await run(retryBudget);
        this.learnedBudget.set(kind, retryBudget); // 记住这个预算够用
        return text;
      } catch (retryErr) {
        if (retryErr instanceof LlmError && retryErr.code === 'reasoning-exhausted') {
          this.learnedBudget.set(kind, retryBudget);
          throw new LlmError(
            `这个模型的思考过程太长，已经把 token 预算加到 ${retryBudget} 仍不够。\n` +
              `  建议：换一个非推理模型，或设置 DOJO_TOKEN_SCALE 手动指定倍数。`,
            { code: 'reasoning-exhausted' },
          );
        }
        throw retryErr;
      }
    }
  }
}

/**
 * 判断是否为「用户取消」。
 * 优先看错误码（可靠），其次看原生 AbortError，最后才退回文案匹配。
 * 注意要和「超时」区分开：超时是可重试的失败，取消不是。
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof LlmError) {
    return err.code === 'aborted' || /已取消|abort/i.test(err.message);
  }
  if (err instanceof Error) {
    return err.name === 'AbortError' || /已取消|abort/i.test(err.message);
  }
  return false;
}

/** 按配置组装 Tutor：mock 模式下换成离线实现，其余代码路径完全一致。 */
export function createTutor(config: ResolvedConfig, progress?: Progress): Tutor {
  if (config.mock) return new Tutor({ config, progress, chatFn: mockChat as ChatFn, streamFn: mockChatStream as StreamFn });
  return new Tutor({ config, progress });
}
