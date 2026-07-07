import { spawn } from 'node:child_process';
import process from 'node:process';

const mode = process.argv[2] || 'dev';
const viteArgs = mode === 'preview' ? ['preview'] : [];
const viteExtraArgs = process.argv.slice(3);

const relay = spawn(process.execPath, ['./scripts/tracking-browser-relay.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

const app = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', ...viteArgs, ...viteExtraArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

let shuttingDown = false;

const shutdown = (code = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (!relay.killed) {
    relay.kill('SIGTERM');
  }

  if (!app.killed) {
    app.kill('SIGTERM');
  }

  setTimeout(() => {
    if (!relay.killed) {
      relay.kill('SIGKILL');
    }

    if (!app.killed) {
      app.kill('SIGKILL');
    }

    process.exit(code);
  }, 1500).unref();
};

relay.on('exit', (code, signal) => {
  if (shuttingDown) {
    return;
  }

  if (signal) {
    console.warn(`[tracking-relay] terminó por señal ${signal}.`);
    return;
  }

  if (code && code !== 0) {
    console.warn(`[tracking-relay] terminó con código ${code}. Orion seguirá arriba, pero DHL/Tresguerras pueden quedar sin consulta viva.`);
  }
});

app.on('exit', (code, signal) => {
  if (signal) {
    shutdown(0);
    return;
  }

  shutdown(code ?? 0);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
