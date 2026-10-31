#!/usr/bin/env node
// 可执行入口：只做转发。
import { main } from '../dist/cli.js';

main()
  .then((code) => {
    process.exitCode = typeof code === 'number' ? code : 0;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
