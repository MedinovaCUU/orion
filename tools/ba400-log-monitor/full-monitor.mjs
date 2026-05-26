#!/usr/bin/env node

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    config: path.join(__dirname, 'config.windows.completo.json'),
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--config' && argv[index + 1]) {
      args.config = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (current === '--once') {
      args.once = true;
    }
  }

  return args;
}

async function readJson(filePath) {
  const raw = await fsPromises.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function timestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function expandPlaceholders(value, context) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/\$\{CONFIG_DIR\}/g, context.configDir)
    .replace(/\$\{SCRIPT_DIR\}/g, __dirname)
    .replace(/\$\{ENV:([A-Z0-9_]+)\}/gi, (_, name) => {
      return process.env[name] || process.env[name.toUpperCase()] || process.env[name.toLowerCase()] || '';
    });
}

function deepExpandPlaceholders(value, context) {
  if (Array.isArray(value)) {
    return value.map((item) => deepExpandPlaceholders(item, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepExpandPlaceholders(item, context)]),
    );
  }

  return expandPlaceholders(value, context);
}

function normalizeConfig(rawConfig, options = {}) {
  const configDir = options.configDir || __dirname;
  const expanded = deepExpandPlaceholders(rawConfig, { configDir });

  return {
    suiteName: expanded.suiteName || 'ax00-equipment-monitor',
    restartDelayMs: Number(expanded.restartDelayMs || 5000),
    logDir: path.resolve(expanded.logDir || path.join(configDir, 'logs')),
    monitors: (expanded.monitors || [])
      .filter((monitor) => monitor && monitor.enabled !== false)
      .map((monitor) => ({
        name: monitor.name,
        script: path.resolve(monitor.script),
        config: path.resolve(monitor.config),
        workingDirectory: path.resolve(monitor.workingDirectory || path.dirname(monitor.script)),
      })),
  };
}

async function ensureLogDir(logDir) {
  await fsPromises.mkdir(logDir, { recursive: true });
}

function pipeWithPrefix(stream, logStream, prefix) {
  let pending = '';

  stream.on('data', (chunk) => {
    const text = `${pending}${chunk.toString('utf8')}`;
    const lines = text.split(/\r?\n/);
    pending = lines.pop() || '';

    for (const line of lines) {
      if (!line) {
        continue;
      }
      const formatted = `[${timestamp()}] [${prefix}] ${line}\n`;
      process.stdout.write(formatted);
      logStream.write(formatted);
    }
  });

  stream.on('end', () => {
    if (!pending) {
      return;
    }
    const formatted = `[${timestamp()}] [${prefix}] ${pending}\n`;
    process.stdout.write(formatted);
    logStream.write(formatted);
    pending = '';
  });
}

class MonitorSupervisor {
  constructor(config, options = {}) {
    this.config = config;
    this.once = Boolean(options.once);
    this.children = new Map();
    this.stopping = false;
    this.exitResolvers = [];
  }

  async startAll() {
    await ensureLogDir(this.config.logDir);

    for (const monitor of this.config.monitors) {
      this.startMonitor(monitor);
    }
  }

  startMonitor(monitor) {
    const logPath = path.join(this.config.logDir, `${monitor.name}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const args = [monitor.script, '--config', monitor.config];

    if (this.once) {
      args.push('--once');
    }

    const child = spawn(process.execPath, args, {
      cwd: monitor.workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    this.children.set(monitor.name, {
      child,
      monitor,
      logStream,
    });

    log(`iniciado ${monitor.name} (pid ${child.pid || 'n/a'})`);

    pipeWithPrefix(child.stdout, logStream, monitor.name);
    pipeWithPrefix(child.stderr, logStream, `${monitor.name}:stderr`);

    child.on('exit', async (code, signal) => {
      logStream.write(`[${timestamp()}] [${monitor.name}] exit code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
      logStream.end();
      this.children.delete(monitor.name);

      if (this.stopping) {
        this.resolveIfDone();
        return;
      }

      if (this.once) {
        log(`${monitor.name} finalizo modo once`);
        this.resolveIfDone();
        return;
      }

      log(`${monitor.name} termino; reinicio en ${this.config.restartDelayMs} ms`);
      await sleep(this.config.restartDelayMs);
      if (!this.stopping) {
        this.startMonitor(monitor);
      }
    });
  }

  async stopAll() {
    this.stopping = true;

    for (const { child } of this.children.values()) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore shutdown races.
      }
    }

    if (!this.children.size) {
      return;
    }

    await new Promise((resolve) => {
      this.exitResolvers.push(resolve);
    });
  }

  async waitUntilDone() {
    if (!this.children.size) {
      return;
    }

    await new Promise((resolve) => {
      this.exitResolvers.push(resolve);
    });
  }

  resolveIfDone() {
    if (this.children.size) {
      return;
    }

    for (const resolve of this.exitResolvers.splice(0)) {
      resolve();
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = normalizeConfig(await readJson(args.config), {
    configDir: path.dirname(args.config),
  });

  if (!config.monitors.length) {
    throw new Error('No hay monitores habilitados en la configuracion.');
  }

  log(`supervisor iniciado: ${config.suiteName}`);
  log(`monitores: ${config.monitors.map((item) => item.name).join(', ')}`);
  log(`logs: ${config.logDir}`);

  const supervisor = new MonitorSupervisor(config, { once: args.once });
  await supervisor.startAll();

  const stop = async () => {
    if (supervisor.stopping) {
      return;
    }
    log('deteniendo supervisor');
    await supervisor.stopAll();
  };

  process.on('SIGINT', () => {
    void stop();
  });
  process.on('SIGTERM', () => {
    void stop();
  });

  if (args.once) {
    await supervisor.waitUntilDone();
    return;
  }

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
