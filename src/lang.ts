/**
 * 语言检测：判断文本里是否混入了日文/韩文等非中文内容。
 *
 * 为什么需要这层：提示词已经要求「只用简体中文」，但模型仍会漂移
 * ——尤其是中日双语模型（如 SenseNova）在遇到日式路径、日文文件名时，
 * 会顺着语境把叙述也写成日文。实测出现过「ディレクトリがあります」这种混杂。
 * 靠提示词只能降低概率，拦不住，所以这里做确定性检测。
 */

/** 日文特有字符：平假名、片假名、以及只有日文才会用的标点。 */
const HIRAGANA = /[\u3040-\u309f]/;
const KATAKANA = /[\u30a0-\u30ff]/;
/** 韩文音节。 */
const HANGUL = /[\uac00-\ud7af\u1100-\u11ff]/;

/**
 * 常见日文词（用汉字书写，无法靠假名识别）。
 * 只收录在中文技术语境里不会自然出现的词。
 */
const JAPANESE_WORDS = [
  'ディレクトリ',
  'ファイル',
  'コマンド',
  'スクリプト',
  'があります',
  'してください',
  'という名前',
  'として',
  '場合',
  '実行',
];

export interface LanguageIssue {
  /** 检测到的语言 */
  language: 'japanese' | 'korean';
  /** 触发判定的证据，便于展示给用户 */
  evidence: string;
}

/**
 * 检测文本里是否混入了非中文语言。
 * 返回 null 表示干净。
 */
export function detectForeignLanguage(text: string): LanguageIssue | null {
  // 代码块里的内容不算（可能有日文测试数据）
  const prose = stripCodeBlocks(text);

  if (HANGUL.test(prose)) {
    return { language: 'korean', evidence: firstMatch(prose, HANGUL) };
  }

  if (HIRAGANA.test(prose)) {
    return { language: 'japanese', evidence: firstMatch(prose, HIRAGANA) };
  }
  if (KATAKANA.test(prose)) {
    return { language: 'japanese', evidence: firstMatch(prose, KATAKANA) };
  }

  for (const word of JAPANESE_WORDS) {
    if (prose.includes(word)) {
      return { language: 'japanese', evidence: word };
    }
  }

  return null;
}

/** 去掉 ``` 围栏内的内容，避免把测试数据误判成正文语言。 */
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function firstMatch(text: string, pattern: RegExp): string {
  const at = text.search(pattern);
  if (at === -1) return '';
  return text.slice(Math.max(0, at - 8), at + 12);
}

/** 给用户看的说明。 */
export function describeLanguageIssue(issue: LanguageIssue): string {
  if (issue.language === 'japanese') {
    return `模型输出混入了日文（例如「${issue.evidence.trim()}」）`;
  }
  return `模型输出混入了韩文（例如「${issue.evidence.trim()}」）`;
}
