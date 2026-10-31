/** 全局领域类型。 */

export type Verdict = 'correct' | 'partial' | 'wrong';

export type TopicKey =
  | 'files'
  | 'text'
  | 'permissions'
  | 'process'
  | 'disk'
  | 'network'
  | 'shell'
  | 'package';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** 一道练习题。reference_answer 只在看答案/判题时使用，界面默认不展示。 */
export interface Exercise {
  title: string;
  scenario: string;
  question: string;
  acceptance: string[];
  reference_answer: string;
  explanation: string;
  common_mistakes: string[];
  hints: string[];
  topic: TopicKey;
  difficulty: Difficulty;
}

/** 判题结果。 */
export interface Grade {
  verdict: Verdict;
  score: number;
  reason: string;
  corrected_answer: string;
  knowledge_points: string[];
}

/** 一条练习记录（落盘用）。 */
export interface AttemptRecord {
  title: string;
  topic: TopicKey;
  difficulty: Difficulty;
  verdict: Verdict;
  score: number;
  reason: string;
  question: string;
  answer: string;
  at: string;
}

export interface Progress {
  version: 1;
  createdAt: string;
  records: AttemptRecord[];
}

export interface ResolvedConfig {
  mock: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  stream: boolean;
  timeoutMs: number;
  /** token 预算倍数，给推理模型留 reasoning 空间，默认 1 */
  tokenScale?: number;
  /** 已知是推理模型：自动放大预算，首次遇到截断时置位 */
  isReasoningModel?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StreamOptions extends ChatOptions {
  onDelta?: (chunk: string) => void;
  /** 推理模型的思考过程增量（不混入正文） */
  onReasoning?: (chunk: string) => void;
}

/** 可注入的对话函数签名，便于 mock 与测试。 */
export type ChatFn = (
  config: ResolvedConfig,
  messages: ChatMessage[],
  options?: ChatOptions,
) => Promise<string>;

export type StreamFn = (
  config: ResolvedConfig,
  messages: ChatMessage[],
  options?: StreamOptions,
) => Promise<string>;

/** 主题元数据。 */
export interface TopicMeta {
  label: string;
  seeds: string[];
}

export interface DifficultyMeta {
  label: string;
  hint: string;
  points: number;
}

export interface TopicStats {
  total: number;
  correct: number;
}

export interface Summary {
  total: number;
  byVerdict: Record<Verdict, number>;
  byTopic: Partial<Record<TopicKey, TopicStats>>;
  byDifficulty: Partial<Record<Difficulty, TopicStats>>;
  avgScore: number;
  weakTopics: Array<{ topic: TopicKey; rate: number; total: number }>;
  streak: number;
}

export interface AskTurn {
  q: string;
  a: string;
  /** 推理模型的思考过程；非推理模型为 undefined */
  reasoning?: string;
}
