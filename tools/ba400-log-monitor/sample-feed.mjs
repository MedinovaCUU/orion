#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sampleDir = path.join(__dirname, 'sample');
const sampleFile = path.join(sampleDir, 'live-log.txt');

const lines = [
  '[BOOT] Analyzer ready',
  '[RUN] Session started',
  '[WARN] E:(301) Reagent fridge temperature alarm',
  '[INFO] Sample rack loaded',
  '[ERROR] E:(610) washing station heater temperature alarm',
  '[ERROR] E:(700) pump home error',
  '[WARN] E:(100) vertical home error detected',
  '[RUN] Session still active',
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function appendLoop() {
  await fs.mkdir(sampleDir, { recursive: true });
  let index = 0;

  while (true) {
    const line = `${new Date().toISOString()} ${lines[index % lines.length]}\n`;
    await fs.appendFile(sampleFile, line, 'utf8');
    process.stdout.write(`append >> ${line}`);
    index += 1;
    await sleep(1500);
  }
}

appendLoop().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
