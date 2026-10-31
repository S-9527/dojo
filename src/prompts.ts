/**
 * 提示词集中管理，方便调试与调优。
 * 设计原则：
 *  1) 出题时禁止把答案写进题干，答案单独放 reference_answer，只在判题/提示时按需暴露；
 *  2) 判题先做“等价性分析”再给分，避免直接按字面相似度打勾；
 *  3) 允许等价方案，因为同一目标常有多种写法，追求唯一答案会误判。
 */
import type { Exercise, AttemptRecord } from './types.js';

const PERSONA = `你是一位经验丰富的 Linux 讲师，面向中文母语的自学者。

【语言要求（最重要，违反即视为不合格）】
- 所有叙述文字必须使用简体中文，不得混入日文、韩文、繁体中文或其它语言。
- 只有命令、参数、文件路径、专有名词保留英文原文。
- 例如必须写「目录」，不能写「ディレクトリ」；写「有 3 个文件」，不能写「があります」。
- 即使题目场景涉及日文文件名或日式路径，叙述部分仍然必须是简体中文。

风格：简洁、准确、不废话；术语保留英文原文并给中文解释；
示例用 fenced code block 标注 bash。绝不编造不存在的命令参数。`;

export function systemPrompt(): string {
  return PERSONA;
}

export interface ExercisePromptContext {
  topicLabel: string;
  difficultyHint: string;
  extraRequirement?: string;
  historyLines?: string[];
  avoidTitles?: string[];
}

export function buildExercisePrompt({
  topicLabel,
  difficultyHint,
  extraRequirement = '',
  historyLines = [],
  avoidTitles = [],
}: ExercisePromptContext): string {
  return `请出一道 Linux 实操练习题。

【主题】${topicLabel}
【难度】${difficultyHint}
【形式约束】
- 题目必须能通过“输入一条或几条 shell 命令”完成。
- 提供一个贴近真实的场景（有具体的文件名、目录、数值），不要空泛。
- 必须给出一个假想的执行环境描述（例如：目录 /tmp/demo 下有 3 个文件 a.txt b.log c.md）。
- ${extraRequirement || '不要涉及需要 root 权限才能演示的危险操作。'}

【禁止事项】
- 题干中绝对不能出现答案命令、关键参数或解题步骤的提示。
${avoidTitles.length ? `- 不要与这些已出过的题目重复：${avoidTitles.join('、')}` : ''}

【参考信息】
${historyLines.length ? historyLines.join('\n') : '暂无，学员刚开始学。'}

只返回一个 JSON 对象，不要任何额外文字，结构如下：
{
  "title": "10 字以内的题目名",
  "scenario": "假想环境描述，1-2 句",
  "question": "具体要求学员做什么，明确验收点",
  "acceptance": ["验收点1", "验收点2"],
  "reference_answer": "标准命令，可多行",
  "explanation": "解题思路，2-4 句，讲清关键参数的作用",
  "common_mistakes": ["常见错误1", "常见错误2"],
  "hints": ["提示1（轻）", "提示2（中）", "提示3（几乎给出答案）"],
  "difficulty": "${difficultyHint}"
}`;
}

/** 判题提示词：逼模型做语义等价性分析，而不是字符串比对。 */
export function buildGradePrompt(exercise: Exercise, answer: string): string {
  return `请批改学员对下面这道 Linux 练习题的作答。

【题目】
场景：${exercise.scenario}
要求：${exercise.question}
验收点：
${exercise.acceptance.map((a, i) => `${i + 1}. ${a}`).join('\n')}

【参考答案（仅供你判断是否等价，学员看不到）】
${exercise.reference_answer}

【学员答案】
\`\`\`bash
${answer}
\`\`\`

【批改规则】
1. 先判断学员答案是否达成了全部验收点。允许等价写法（例如 cat|grep 与 grep file、ls -l 与 ll、awk 的不同实现），只要效果相同就算对。
2. 如果学员答案有语法错误、危险操作、或答非所问，判为错误并明确指出。
3. 如果答案不完整但方向正确，给 partial。
4. 不要因为“写法不是参考答案”而扣分；只有效果不同才扣分。
5. 评语要具体：指出哪一部分对、哪一部分错、错在哪。

只返回一个 JSON 对象：
{
  "verdict": "correct" | "partial" | "wrong",
  "score": 0 到 100 的整数,
  "reason": "2-4 句具体评语，说明判定依据",
  "corrected_answer": "如果学员答案有误或不完整，给出修改后的完整命令；如果全对则填空字符串",
  "knowledge_points": ["本题涉及的知识点，1-3 条"]
}`;
}

export interface AskPromptContext {
  exercise?: Exercise | null;
  history?: Array<{ q: string; a: string }>;
}

/** 答疑提示词：结合当前题目上下文，避免泛泛而谈。 */
export function buildAskPrompt({ exercise, history = [] }: AskPromptContext): string {
  const context = exercise
    ? `学员当前正在做的题目：
场景：${exercise.scenario}
要求：${exercise.question}
`
    : '学员目前没有正在做的题目。';

  const historyText = history.length
    ? `\n最近的问答（供参考，不要重复）：\n${history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join('\n')}\n`
    : '';

  return `${context}${historyText}
请用中文回答学员的提问。要求：
- 如果是概念问题，先给一句话结论，再解释原因，最后给一个最小可运行示例。
- 如果涉及危险命令（rm -rf、dd、chmod 777、> /dev/sda 等），先明确风险再给用法。
- 不要直接给出当前题目的最终答案；如果学员是在求答案，用反问或分步提示引导，最多给出关键参数的方向。
- 控制在 300 字以内，必要时用代码块。`;
}

const HINT_LADDER = [
  '只给一句方向性提示，不提任何命令名和参数。',
  '指出需要用到的命令名，但不给完整参数。',
  '给出近乎完整的命令结构，只留一个关键部分让学员填空。',
] as const;

/** 递进式提示：hintLevel 越大越接近答案。 */
export function buildHintPrompt(exercise: Exercise, hintLevel: number): string {
  const level = Math.min(Math.max(hintLevel, 0), HINT_LADDER.length - 1);
  const rule = HINT_LADDER[level] as string;
  return `学员在题目上卡住了，请给第 ${level + 1} 级提示。

【题目】${exercise.question}
【参考答案】${exercise.reference_answer}

【本次提示的要求】${rule}
只输出提示文字本身，不要输出其他内容，不要重复题干。`;
}

/** 把最近的错题整理成“薄弱点”提示，供复盘使用。 */
export function buildReviewPrompt(records: AttemptRecord[]): string {
  const lines = records
    .slice(-15)
    .map((r) => `- [${r.verdict}] ${r.title}（${r.topic}）：${r.reason ?? ''}`)
    .join('\n');
  return `以下是学员最近的练习记录：

${lines || '（无记录）'}

请用中文总结：
1. 已经掌握的 2-3 个点；
2. 最需要补强的 2-3 个薄弱点，并各给一条可立即练习的建议；
3. 下一阶段建议练习的主题顺序。

控制在 400 字以内，直接给结论，不要复述原始记录。`;
}
