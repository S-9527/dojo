/**
 * 离线 Mock：不需要 API Key 就能走完整流程，也用于自动化测试与 TUI 开发。
 * 按“提示词里出现了什么标记”决定返回什么，因此复用真实代码路径。
 */
import type { ChatMessage, ChatOptions, Exercise, ResolvedConfig, StreamOptions } from './types.js';

type BankEntry = Omit<Exercise, 'topic' | 'difficulty'>;
type Bank = Partial<Record<'easy' | 'medium' | 'hard', BankEntry>>;

const EXERCISE_BANK: Partial<Record<'files' | 'text', Bank>> = {
  files: {
    easy: {
      title: '找出最大的文件',
      scenario: '假想环境：/tmp/demo 下有 a.txt（2KB）、b.log（8KB）、c.md（1KB）三个普通文件。',
      question: '请写出一条命令，只列出 /tmp/demo 下大小最大的那个文件的完整路径。',
      acceptance: ['命令只输出一行', '输出的是 b.log 的路径', '使用了按大小排序的逻辑'],
      reference_answer: 'ls -S /tmp/demo | head -n 1',
      explanation: 'ls -S 按文件大小降序排列，head -n 1 取第一行即为最大文件。注意 ls -S 只在同一目录内比较。',
      common_mistakes: ['用 ls -l 后手工找最大的', '忘记 head -n 1 导致输出多个文件'],
      hints: [
        '先想想哪个命令能按大小排序。',
        'ls 有一个按大小排序的选项，是大写字母。',
        'ls -S <目录> 会按大小降序，再用 head -n 1 取第一个。',
      ],
    },
    medium: {
      title: '批量备份日志',
      scenario: '假想环境：/var/log/app 下有 a.log、b.log、c.txt，你只有普通用户权限。',
      question: '把 /var/log/app 下所有 .log 文件复制到 /tmp/backup，并保持文件名不变；一条命令完成。',
      acceptance: ['只复制 .log 文件', '目标目录为 /tmp/backup', '没有复制 c.txt'],
      reference_answer: 'mkdir -p /tmp/backup && cp /var/log/app/*.log /tmp/backup/',
      explanation: '先确保目标目录存在，再用通配符 *.log 精确匹配日志文件；cp 保留原文件名。',
      common_mistakes: ['直接用 cp /var/log/app/* 把 txt 也复制了', '没有先建目录导致 cp 报错'],
      hints: [
        '复制多个文件时，通配符可以帮你筛选。',
        '用 *.log 匹配，再用 cp 复制到目标目录。',
        'mkdir -p /tmp/backup && cp /var/log/app/*.log /tmp/backup/',
      ],
    },
  },
  text: {
    easy: {
      title: '统计错误行数',
      scenario: '假想环境：/tmp/app.log 共 500 行，其中包含 ERROR 的行有 37 行。',
      question: '写一条命令统计 /tmp/app.log 中含有 ERROR 的行数，只输出数字。',
      acceptance: ['输出为 37', '统计的是包含 ERROR 的行'],
      reference_answer: 'grep -c ERROR /tmp/app.log',
      explanation: 'grep -c 直接统计匹配行数，比 grep | wc -l 少一次管道。',
      common_mistakes: ['用 grep ERROR | wc -c 统计了字节数', '忘记 -c 导致输出所有匹配行'],
      hints: ['grep 有专门统计数量的选项。', '想想 -c 参数的作用。', 'grep -c ERROR /tmp/app.log'],
    },
    medium: {
      title: '按访问量排序',
      scenario: '假想环境：/tmp/access.log 每行格式为 "IP 路径 状态码"，共 1000 行，IP 有重复。',
      question: '统计每个 IP 出现的次数，并按次数从高到低输出前 5 名。',
      acceptance: ['按出现次数降序', '只输出前 5 行', '结果含次数'],
      reference_answer: "awk '{print $1}' /tmp/access.log | sort | uniq -c | sort -rn | head -n 5",
      explanation: 'awk 取第一列 IP，sort 让相同 IP 相邻，uniq -c 计数，再 sort -rn 按数字降序，head 取前 5。',
      common_mistakes: ['uniq 前没有 sort，导致相同 IP 不相邻而重复计数', '用 sort -n 而不是 -rn，变成升序'],
      hints: [
        'uniq -c 只能统计相邻的重复行。',
        '在 uniq -c 之前需要先 sort 一次。',
        "awk '{print $1}' f | sort | uniq -c | sort -rn | head -n 5",
      ],
    },
  },
};

const FALLBACK: BankEntry = {
  title: '查看当前目录',
  scenario: '假想环境：你刚登录一台 Linux 服务器，位于 /home/student。',
  question: '写一条命令列出当前目录下所有文件（包括隐藏文件）的详细信息。',
  acceptance: ['显示隐藏文件', '显示详细信息（权限、大小等）'],
  reference_answer: 'ls -la',
  explanation: '-l 输出详细信息，-a 显示以点开头的隐藏文件。',
  common_mistakes: ['只写 ls，看不到隐藏文件'],
  hints: ['ls 可以叠加多个短选项。', '需要“详细”和“全部”两个选项。', 'ls -la'],
};

function pickExercise(prompt: string): string {
  const topicLabel = prompt.match(/【主题】(.+)/)?.[1]?.trim() ?? '';
  const difficulty = prompt.includes('【难度】挑战') ? 'hard' : prompt.includes('【难度】进阶') ? 'medium' : 'easy';

  const key = topicLabel.includes('文件') ? 'files' : topicLabel.includes('文本') ? 'text' : null;
  const bank = key ? EXERCISE_BANK[key] : null;
  const chosen = bank?.[difficulty] ?? bank?.easy ?? FALLBACK;
  return JSON.stringify(chosen);
}

function gradeAnswer(prompt: string): string {
  const answer = (prompt.match(/【学员答案】\s*```bash\n([\s\S]*?)```/)?.[1] ?? '').trim();
  const reference = (prompt.match(/【参考答案（仅供你判断是否等价，学员看不到）】\n([\s\S]*?)\n\n【学员答案】/)?.[1] ?? '').trim();

  if (!answer) {
    return JSON.stringify({ verdict: 'wrong', score: 0, reason: '没有作答。', corrected_answer: reference, knowledge_points: [] });
  }

  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const same = norm(answer) === norm(reference);
  const sharesCore =
    reference.length > 0 &&
    norm(answer)
      .split(' ')
      .some((token) => token.length > 2 && reference.includes(token));

  if (same) {
    return JSON.stringify({
      verdict: 'correct',
      score: 100,
      reason: '命令与参考答案一致，能够达成全部验收点。',
      corrected_answer: '',
      knowledge_points: ['命令选项组合'],
    });
  }
  if (sharesCore) {
    return JSON.stringify({
      verdict: 'partial',
      score: 60,
      reason: '方向正确，用到了关键命令，但写法与验收点还不完全一致。',
      corrected_answer: reference,
      knowledge_points: ['命令选项组合'],
    });
  }
  return JSON.stringify({
    verdict: 'wrong',
    score: 20,
    reason: '答案没有达成题干要求的验收点。',
    corrected_answer: reference,
    knowledge_points: [],
  });
}

function hintReply(prompt: string): string {
  const level = prompt.match(/请给第 (\d+) 级提示/)?.[1] ?? '1';
  const question = prompt.match(/【题目】(.+)/)?.[1] ?? '这道题';
  return `（Mock）第 ${level} 级提示：想想哪个命令能完成“${question}”的核心动作。`;
}

/** 冒充 chat() 的离线实现。 */
export async function mockChat(_config: ResolvedConfig, messages: ChatMessage[], _options?: ChatOptions): Promise<string> {
  const user = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');
  await delay(120); // 模拟网络延迟，让加载动画可见

  if (user.includes('请出一道 Linux 实操练习题')) return pickExercise(user);
  if (user.includes('请批改学员')) return gradeAnswer(user);
  if (user.includes('级提示')) return hintReply(user);
  if (user.includes('以下是学员最近的练习记录')) {
    return '（Mock）已掌握：基础文件操作。薄弱点：管道组合、权限判断。建议下一阶段练习文本处理与权限主题。';
  }
  const question = messages[messages.length - 1]?.content ?? user;
  return askReply(question);
}

function askReply(question: string): string {
  return `（Mock 模式）你问的是：「${question}」。\n\n真实模式下这里会由大模型给出解释。当前未配置 API Key，所以用固定文本占位。\n\n先给结论，再解释原因，最后给示例——这是正式回答的结构。`;
}

/** 冒充 chatStream()：逐字回调，模拟打字机。 */
export async function mockChatStream(
  config: ResolvedConfig,
  messages: ChatMessage[],
  { onDelta }: StreamOptions = {},
): Promise<string> {
  const text = await mockChat(config, messages);
  if (!onDelta) return text;
  for (const ch of text) {
    onDelta(ch);
    await delay(8);
  }
  return text;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
