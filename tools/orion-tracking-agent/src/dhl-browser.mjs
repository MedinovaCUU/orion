import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const compact = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const normalize = (value = '') =>
  compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const buildExecutableCandidates = (configuredPath = '') => {
  const env = process.env;
  const candidates = [
    configuredPath,
    env.TRACKING_BROWSER_EXECUTABLE_PATH,
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/microsoft-edge',
  ];

  return Array.from(new Set(candidates.filter(Boolean))).filter((candidate) => fs.existsSync(candidate));
};

const normalizeDhlStatus = (description, statusCode) => {
  const text = normalize(description);
  const code = normalize(statusCode);

  if (code === 'delivered' || text.includes('entregado') || text.includes('proof of delivery') || text.includes('firmado')) {
    return 'entregado';
  }

  if (
    text.includes('mensajero para su entrega') ||
    text.includes('out for delivery') ||
    text.includes('disponible para recolectar') ||
    text.includes('en espera de ser recolectado por el destinatario') ||
    text.includes('recolectado por el destinatario')
  ) {
    return 'en_reparto';
  }

  if (
    text.includes('exception') ||
    text.includes('demora') ||
    text.includes('problema') ||
    text.includes('retenido') ||
    text.includes('incidencia')
  ) {
    return 'incidencia';
  }

  if (
    code === 'transit' ||
    text.includes('procesado') ||
    text.includes('ha salido de una estacion') ||
    text.includes('arribado a una estacion') ||
    text.includes('retirado/recolectado') ||
    text.includes('shipment picked up') ||
    text.includes('transito')
  ) {
    return 'en_transito';
  }

  if (text.includes('informacion recibida') || text.includes('label created')) {
    return 'etiqueta_generada';
  }

  return 'pendiente_consulta';
};

const toIsoDate = (value = '') => {
  const match = compact(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

const buildTimeline = (events = []) =>
  (Array.isArray(events) ? events : [])
    .map((event) => ({
      label: compact(event?.description),
      location: compact(event?.location?.address?.addressLocality),
      timestamp: compact(event?.timestamp),
      note: Array.isArray(event?.pieceIds) ? compact(event.pieceIds.join(', ')) : '',
    }))
    .filter((event) => event.label || event.location || event.timestamp || event.note);

const buildDhlResult = (trackingNumber, shipment) => {
  const description = compact(shipment?.status?.description);
  const remark = compact(shipment?.status?.remark);
  const nextSteps = compact(shipment?.status?.nextSteps);
  const status = normalizeDhlStatus(
    `${description} ${remark} ${nextSteps}`,
    shipment?.status?.statusCode,
  );

  return {
    ok: true,
    lookupMode: 'local_browser',
    carrier: 'dhl',
    trackingNumber,
    status,
    fulfillmentState: status === 'entregado' ? 'entregado' : 'pendiente',
    portalStatusText: description || remark || 'Sin descripción disponible en DHL.',
    lastEventLabel: remark || description || 'Sin evento visible',
    lastEventAt: compact(shipment?.status?.timestamp),
    estimatedDelivery: toIsoDate(
      shipment?.estimatedTimeOfDelivery ||
        shipment?.estimatedDeliveryDate ||
        shipment?.delivery?.estimated ||
        shipment?.status?.estimatedDelivery,
    ),
    recipient: compact(shipment?.details?.consignee?.name),
    origin: compact(shipment?.origin?.address?.addressLocality),
    destination: compact(shipment?.destination?.address?.addressLocality),
    serviceType: compact(shipment?.details?.product?.productName || shipment?.service),
    deliveryProofName: compact(shipment?.details?.proofOfDelivery?.signatory),
    timeline: buildTimeline(shipment?.events),
    rawSummary: JSON.stringify(
      {
        id: shipment?.id || trackingNumber,
        service: shipment?.details?.product?.productName || shipment?.service || '',
        status: shipment?.status || {},
        origin: shipment?.origin || {},
        destination: shipment?.destination || {},
        events: shipment?.events || [],
      },
      null,
      2,
    ).slice(0, 6000),
    note: [remark, nextSteps].filter(Boolean).join(' · '),
  };
};

export class DhlBrowser {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.browser = null;
    this.context = null;
    this.chromeProcess = null;
    this.executablePath = '';
    this.debugPort = Math.max(1024, Number(config.browserDebugPort) || 9223);
    this.profilePath = path.join(config.dataDir, 'chrome-profile');
  }

  async connectToChrome() {
    const endpoint = `http://127.0.0.1:${this.debugPort}`;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          this.browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
          this.context = this.browser.contexts()[0];
          if (!this.context) {
            throw new Error('Chrome no expuso un contexto navegable.');
          }
          return;
        }
      } catch {
        // Chrome tarda unos segundos en abrir el perfil y habilitar CDP.
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Chrome no habilitó el puerto local ${this.debugPort}.`);
  }

  async start() {
    if (this.browser?.isConnected() && this.context) {
      return;
    }

    this.chromeProcess?.kill();
    this.chromeProcess = null;
    this.browser = null;
    this.context = null;

    const candidates = buildExecutableCandidates(this.config.browserExecutablePath);
    if (candidates.length === 0) {
      throw new Error('No se encontró Google Chrome ni Microsoft Edge en este equipo.');
    }

    let lastError = null;
    for (const executablePath of candidates) {
      try {
        this.executablePath = executablePath;
        fs.mkdirSync(this.profilePath, { recursive: true });
        this.chromeProcess = spawn(
          executablePath,
          [
            `--remote-debugging-port=${this.debugPort}`,
            `--user-data-dir=${this.profilePath}`,
            '--disable-http2',
            '--no-first-run',
            '--no-default-browser-check',
            '--start-minimized',
            '--window-size=1280,900',
            '--lang=es-MX',
            'about:blank',
          ],
          { detached: false, stdio: 'ignore', windowsHide: false },
        );
        this.chromeProcess.unref();
        await this.connectToChrome();
        this.logger.info(`Chrome interactivo listo por CDP: ${executablePath}`);
        return;
      } catch (error) {
        lastError = error;
        this.chromeProcess?.kill();
        this.chromeProcess = null;
      }
    }

    throw new Error(
      lastError instanceof Error ? `No fue posible abrir Chrome/Edge: ${lastError.message}` : 'No fue posible abrir Chrome/Edge.',
    );
  }

  async resolve(trackingNumber) {
    await this.start();
    const page = await this.context.newPage();
    const screenshotDir = path.join(this.config.dataDir, 'screenshots');

    try {
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/utapi?') && response.status() === 200,
        { timeout: 90_000 },
      );

      await page
        .goto(
          `https://www.dhl.com/mx-es/home/rastreo.html?tracking-id=${encodeURIComponent(trackingNumber)}&submit=1`,
          { waitUntil: 'commit', timeout: 60_000 },
        )
        .catch((error) => {
          this.logger.warn(`DHL tardó en cargar la página; se mantiene la espera de datos: ${error.message}`);
        });

      const response = await responsePromise;
      const payload = await response.json().catch(() => null);
      const shipment = payload?.shipments?.[0];
      if (!shipment) {
        throw new Error(`DHL no devolvió un embarque visible para ${trackingNumber}.`);
      }

      return buildDhlResult(trackingNumber, shipment);
    } catch (error) {
      try {
        fs.mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({
          path: path.join(screenshotDir, `${trackingNumber}-${Date.now()}.png`),
          fullPage: true,
        });
      } catch {
        // El error original es más útil que un fallo al guardar evidencia.
      }

      return {
        ok: false,
        lookupMode: 'local_browser',
        carrier: 'dhl',
        trackingNumber,
        error: error instanceof Error ? error.message : 'No fue posible leer DHL desde el navegador local.',
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close() {
    await this.browser?.close().catch(() => undefined);
    this.chromeProcess?.kill();
    this.chromeProcess = null;
    this.browser = null;
    this.context = null;
  }

  metadata() {
    return {
      platform: `${os.platform()} ${os.release()}`,
      browserExecutablePath: this.executablePath,
      browserMode: 'interactive-cdp',
      browserDebugPort: this.debugPort,
    };
  }
}
