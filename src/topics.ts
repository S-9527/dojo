import type { Difficulty, DifficultyMeta, TopicKey, TopicMeta } from './types.js';

export const DIFFICULTIES: Record<Difficulty, DifficultyMeta> = {
  easy: { label: '入门', hint: '单条命令即可完成，参数不超过两个', points: 1 },
  medium: { label: '进阶', hint: '需要管道、重定向或组合两条命令', points: 2 },
  hard: { label: '挑战', hint: '需要组合多条命令、处理边界情况，或使用 find/xargs/awk', points: 3 },
};

export const TOPICS: Record<TopicKey, TopicMeta> = {
  files: { label: '文件与目录', seeds: ['ls', 'cp', 'mv', 'rm', 'mkdir', 'ln', 'stat', 'file', 'touch'] },
  text: { label: '文本处理', seeds: ['grep', 'sed', 'awk', 'sort', 'uniq', 'cut', 'tr', 'wc', 'head', 'tail'] },
  permissions: { label: '权限与用户', seeds: ['chmod', 'chown', 'umask', 'useradd', 'groups', 'sudo'] },
  process: { label: '进程管理', seeds: ['ps', 'top', 'kill', 'jobs', 'nohup', 'systemctl', 'pgrep'] },
  disk: { label: '磁盘与存储', seeds: ['df', 'du', 'mount', 'lsblk', 'findmnt', 'tar', 'gzip'] },
  network: { label: '网络', seeds: ['ip', 'ss', 'curl', 'ping', 'dig', 'ssh', 'nc', 'traceroute'] },
  shell: { label: 'Shell 脚本', seeds: ['for', 'while', 'if', 'case', 'function', 'test', 'set -e', 'export'] },
  package: { label: '软件包管理', seeds: ['apt', 'dpkg', 'yum', 'dnf', 'rpm', 'pip', 'snap'] },
};

export const TOPIC_KEYS = Object.keys(TOPICS) as TopicKey[];
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES) as Difficulty[];

export function isTopicKey(value: string): value is TopicKey {
  return (TOPIC_KEYS as string[]).includes(value);
}

export function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTY_KEYS as string[]).includes(value);
}

/** 解析主题别名：支持 key、中文标签、命令名。 */
export function resolveTopic(input: string | undefined): TopicKey | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (isTopicKey(value)) return value;

  for (const key of TOPIC_KEYS) {
    const topic = TOPICS[key];
    if (topic.label.includes(value) || value.includes(topic.label)) return key;
    if (topic.seeds.some((seed) => seed.toLowerCase() === value)) return key;
  }
  return null;
}

/** 解析难度别名：支持 key 与中文标签。 */
export function resolveDifficulty(input: string | undefined): Difficulty | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (isDifficulty(value)) return value;

  for (const key of DIFFICULTY_KEYS) {
    if (DIFFICULTIES[key].label === value) return key;
  }
  return null;
}

/** 随机取一个主题。 */
export function randomTopic(): TopicKey {
  const index = Math.floor(Math.random() * TOPIC_KEYS.length);
  return TOPIC_KEYS[index] as TopicKey;
}
