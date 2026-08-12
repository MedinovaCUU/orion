import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DhlBrowser } from './dhl-browser.mjs';
import { OrionTrackingApi } from './orion-api.mjs';

const VERSION = '1.0.5';
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = process.env.ORION_TRACKING_AGENT_CONFIG || path.join(APP_DIR, 'config.json');
const DATA_DIR = process.env.ORION_TRACKING_AGENT_DATA || path.join(APP_DIR, 'data');
const ONCE = process.argv.includes('--once');
const SELF_TEST = process.argv.includes('--self-test');

fs.mkdirSync(DATA_DIR, { recursive: true });

const logPath = path.join(DATA_DIR, 'agent.log');
const writeLog = (level, message) => {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`, 'utf8');
};
const logger = {
  info: (message) => writeLog('INFO', message),
  warn: (message) => writeLog('WARN', message),
  error: (message) => writeLog('ERROR', message),
};

const loadConfig = () => {
  const fileConfig = fs.existsSync(CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, ''))
    : {};
  const config = {
    ...fileConfig,
    supabaseUrl: process.env.ORION_SUPABASE_URL || fileConfig.supabaseUrl,
    supabaseAnonKey: process.env.ORION_SUPABASE_ANON_KEY || fileConfig.supabaseAnonKey,
    agentToken: process.env.ORION_TRACKING_AGENT_TOKEN || fileConfig.agentToken,
    browserExecutablePath:
      process.env.ORION_TRACKING_BROWSER_EXECUTABLE || fileConfig.browserExecutablePath,
    browserDebugPort: process.env.ORION_TRACKING_BROWSER_DEBUG_PORT || fileConfig.browserDebugPort,
    pollSeconds: process.env.ORION_TRACKING_POLL_SECONDS || fileConfig.pollSeconds,
    batchSize: process.env.ORION_TRACKING_BATCH_SIZE || fileConfig.batchSize,
  };

  if (!fs.existsSync(CONFIG_PATH) && !config.supabaseUrl && !config.supabaseAnonKey && !config.agentToken) {
    throw new Error(`No existe la configuración del agente: ${CONFIG_PATH}`);
  }

  for (const key of ['supabaseUrl', 'supabaseAnonKey', 'agentToken']) {
    if (!String(config[key] || '').trim()) {
      throw new Error(`Falta ${key} en ${CONFIG_PATH}.`);
    }
  }

  return {
    ...config,
    pollSeconds: Math.max(10, Number(config.pollSeconds) || 15),
    batchSize: Math.max(1, Math.min(Number(config.batchSize) || 5, 20)),
    dataDir: DATA_DIR,
  };
};

const resolveAgentIdentity = () => {
  const statePath = path.join(DATA_DIR, 'agent-state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (state.agentId) {
      return state;
    }
  }

  const state = {
    agentId: `${os.hostname().replace(/[^A-Za-z0-9_.-]/g, '-')}-${randomUUID()}`,
    hostname: os.hostname(),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  return state;
};

const acquireProcessLock = () => {
  const lockPath = path.join(DATA_DIR, 'agent.lock');
  if (fs.existsSync(lockPath)) {
    const existingPid = Number(fs.readFileSync(lockPath, 'utf8'));
    if (existingPid) {
      try {
        process.kill(existingPid, 0);
        throw new Error(`El agente ya se está ejecutando con PID ${existingPid}.`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('ya se está ejecutando')) {
          throw error;
        }
      }
    }
    fs.unlinkSync(lockPath);
  }

  fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  return () => {
    if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8').trim() === String(process.pid)) {
      fs.unlinkSync(lockPath);
    }
  };
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let releaseLock = () => undefined;
let browser = null;
let api = null;
let stopping = false;

const shutdown = async (reason) => {
  if (stopping) {
    return;
  }
  stopping = true;
  logger.info(`Deteniendo agente: ${reason}`);
  if (api) {
    await api.heartbeat({ status: 'offline' }).catch(() => undefined);
  }
  if (browser) {
    await browser.close();
  }
  releaseLock();
};

process.on('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
process.on('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.on('uncaughtException', (error) => {
  logger.error(`Excepción no controlada: ${error.stack || error.message}`);
  void shutdown('uncaughtException').finally(() => process.exit(1));
});
process.on('unhandledRejection', (error) => {
  logger.error(`Promesa rechazada: ${error instanceof Error ? error.stack || error.message : String(error)}`);
});

const run = async () => {
  const config = loadConfig();
  const identity = resolveAgentIdentity();
  releaseLock = acquireProcessLock();
  const agent = { ...identity, version: VERSION };
  api = new OrionTrackingApi(config, agent);
  browser = new DhlBrowser(config, logger);

  logger.info(`Orion Tracking Agent ${VERSION} iniciado como ${agent.agentId}.`);
  await api.heartbeat({ status: 'online', metadata: browser.metadata() });

  if (SELF_TEST) {
    logger.info('Autodiagnostico completado: Node.js, configuracion y Supabase disponibles.');
    await shutdown('autodiagnostico terminado');
    return;
  }

  do {
    try {
      const jobs = await api.claim(config.batchSize);
      if (jobs.length === 0) {
        await api.heartbeat({ status: 'online', metadata: browser.metadata() });
      }

      for (const job of jobs) {
        if (stopping) {
          break;
        }

        logger.info(`Consultando DHL ${job.trackingNumber}${job.manualRefresh ? ' (solicitud manual)' : ''}.`);
        await api.heartbeat({
          status: 'busy',
          currentTrackingNumber: job.trackingNumber,
          metadata: browser.metadata(),
        });
        const result = await browser.resolve(job.trackingNumber);
        await api.report(job.id, result);

        if (result.ok) {
          logger.info(`DHL ${job.trackingNumber}: ${result.status} · ${result.portalStatusText}`);
        } else {
          logger.warn(`DHL ${job.trackingNumber}: ${result.error}`);
        }
      }

      await api.heartbeat({ status: 'online', metadata: browser.metadata() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      await api.heartbeat({ status: 'degraded', error: message, metadata: browser?.metadata() || {} }).catch(() => undefined);
    }

    if (!ONCE && !stopping) {
      await sleep(config.pollSeconds * 1000);
    }
  } while (!ONCE && !stopping);

  await shutdown(ONCE ? 'ejecución manual terminada' : 'cierre solicitado');
};

run().catch((error) => {
  logger.error(error instanceof Error ? error.stack || error.message : String(error));
  void shutdown('error de inicio').finally(() => process.exit(1));
});
