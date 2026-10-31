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
}

export interface AskOptions {
  exercise?: Exercise | null;
  history?: AskTurn[];
  onDelta?: (chunk: string) => void;
  /** 思考过程增量（推理模型才有） */
  onReasoning?: (chunk: string) => void;
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
  async generateExercise({ topic, difficulty, extraRequirement = '' }: GenerateOptions): Promise<Exercise> {
    const { historyLines, avoidTitles } = this.contextFor(topic);
    const prompt = buildExercisePrompt({
      topicLabel: TOPICS[topic].label,
      difficultyHint: DIFFICULTIES[difficulty].label,
      extraRequirement,
      historyLines,
      avoidTitles,
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const suffix = attempt === 0 ? '' : '\n\n注意：必须输出严格合法的 JSON，不要加任何解释文字。';
      // 题目是一整个 JSON，推理模型的思考过程还要额外吃掉大量 token，
      // 用 callWithReasoningFallback 自动放大预算重试
      const raw = await this.callWithReasoningFallback(3000, (maxTokens) =>
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
          },
        ),
      );

      try {
        return normalizeExercise(parseJsonLoose(raw, '出题结果'), { topic, difficulty });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('出题失败');
  }

  /** 判题。温度压到 0.1，尽量让同样的答案得到同样的判定。 */
  async grade(exercise: Exercise, answer: string): Promise<Grade> {
    const raw = await this.callWithReasoningFallback(1500, (maxTokens) =>
      this.chatFn(
        this.config,
        [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: buildGradePrompt(exercise, answer) },
        ],
        { temperature: 0.1, jsonMode: true, maxTokens },
      ),
    );
    return normalizeGrade(parseJsonLoose(raw, '判题结果'));
  }

  /** 答疑（流式输出，边生成边回调）。 */
  async ask(
    question: string,
    { exercise = null, history = [], onDelta, onReasoning, signal }: AskOptions = {},
  ): Promise<string> {
    return this.streamFn(
      this.config,
      [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: buildAskPrompt({ exercise, history }) },
        { role: 'user', content: question },
      ],
      { onDelta, onReasoning, temperature: 0.5, maxTokens: this.budget(1500), signal },
    );
  }

  /** 递进式提示：级别越高越接近答案。 */
  async hint(exercise: Exercise, hintLevel: number): Promise<string> {
    const raw = await this.chatFn(
      this.config,
      [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: buildHintPrompt(exercise, hintLevel) },
      ],
      { temperature: 0.4, maxTokens: this.budget(800) },
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
    const effective = (Number.isFinite(scale) && scale > 0 ? scale : 1) * (this.config.isReasoningModel ? 3 : 1);
    return Math.max(base, Math.round(base * effective));
  }

  /**
   * 带「推理模型自动补救」的调用。
   *
   * 推理模型会先花 token 思考，预算不够时 content 为空、finish_reason=length。
   * 这里捕获该错误，自动把预算翻倍重试一次，并记住这个模型是推理模型，
   * 后续调用直接用放大后的预算 —— 用户不需要手动调参。
   */
  private async callWithReasoningFallback(
    base: number,
    run: (maxTokens: number) => Promise<string>,
  ): Promise<string> {
    try {
      return await run(this.budget(base));
    } catch (err) {
      if (!(err instanceof LlmError) || err.code !== 'reasoning-exhausted') throw err;

      // 记住：这个模型是推理模型，之后都按放大预算走。
      // 注意先置位再取 budget()，否则会拿旧预算；置位后已含 3 倍放大，
      // 这里只再乘 1.5，避免一次冲到 18000 这种荒唐值。
      this.config.isReasoningModel = true;
      const retryBudget = Math.min(9000, Math.round(this.budget(base) * 1.5));
      try {
        return await run(retryBudget);
      } catch (retryErr) {
        if (retryErr instanceof LlmError && retryErr.code === 'reasoning-exhausted') {
          throw new LlmError(
            `这个模型是推理模型，思考过程用掉了大部分 token 预算（已尝试 ${retryBudget}）。\n` +
              `  建议：设置环境变量 DOJO_TOKEN_SCALE=3，或换一个非推理模型。`,
            { code: 'reasoning-exhausted' },
          );
        }
        throw retryErr;
      }
    }
  }
}

/** 按配置组装 Tutor：mock 模式下换成离线实现，其余代码路径完全一致。 */
export function createTutor(config: ResolvedConfig, progress?: Progress): Tutor {
  if (config.mock) return new Tutor({ config, progress, chatFn: mockChat as ChatFn, streamFn: mockChatStream as StreamFn });
  return new Tutor({ config, progress });
}
