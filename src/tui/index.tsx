import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { Tutor } from '../tutor.js';
import type { Difficulty, Progress, ResolvedConfig, TopicKey } from '../types.js';

export interface StartTuiOptions {
  tutor: Tutor;
  config: ResolvedConfig;
  topic: TopicKey;
  difficulty: Difficulty;
  progress: Progress;
  /** 未配置 API Key 时直接打开 /connect 向导，省掉「先看文档」的一步 */
  startWithConnect?: boolean;
}

/** 启动 TUI，返回退出时的 Promise。 */
export async function startTui({
  tutor,
  config,
  topic,
  difficulty,
  progress,
  startWithConnect = false,
}: StartTuiOptions): Promise<void> {
  const instance = render(
    React.createElement(App, {
      tutor,
      config,
      initialTopic: topic,
      initialDifficulty: difficulty,
      progress,
      startWithConnect,
    }),
    {
      exitOnCtrlC: false,
      // 全屏：使用终端备用屏幕缓冲区（vim / htop 同款机制）。
      // 代价是**没有终端回滚**，所以转录滚动必须在应用内实现
      // —— 见 App 里的 scrollOffset 与 TranscriptView。
      alternateScreen: true,
    },
  );

  await instance.waitUntilExit();
}
