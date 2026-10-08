import { useEffect, useState, type ReactNode } from 'react';
import { OrionLoader } from './OrionLoader';
import { prefersReducedMotion } from './orionMotion';
import './OrionSplash.css';

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const ASSETS = {
  wordmark: `${BASE}orion-brand/orion-wordmark.webp`,
  biosystems: `${BASE}bios-brand/BioS_Logo_300dpi.png`,
};

/** Pantalla completa de carga: logo animado, wordmark 3D, BioSystems y línea de progreso. */
export function OrionSplashScreen({ status, leaving = false }: { status?: string; leaving?: boolean }) {
  return (
    <div className={`orion-splash${leaving ? ' orion-splash--leaving' : ''}`} role="status" aria-live="polite">
      <OrionLoader className="orion-splash__logo" />
      <img className="orion-splash__wordmark" src={ASSETS.wordmark} alt="Orion by Medinova" draggable={false} />
      <div className="orion-splash__brand">
        <img className="orion-splash__biosystems" src={ASSETS.biosystems} alt="BioSystems" draggable={false} />
        <span className="orion-splash__eyebrow">Centro operativo</span>
      </div>
      <div className="orion-splash__progress" />
      <div className="orion-splash__status">{status}</div>
    </div>
  );
}

/**
 * Muestra el splash hasta que `ready` sea true y haya pasado al menos `minMs` (para que nunca parpadee),
 * y lo retira con un fundido. Los hijos se montan en cuanto `ready` es true, debajo del splash.
 */
export function OrionSplashGate({ ready, status, minMs = 1400, children }: { ready: boolean; status?: string; minMs?: number; children: ReactNode }) {
  const [elapsed, setElapsed] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setElapsed(true), prefersReducedMotion() ? 0 : minMs);
    return () => window.clearTimeout(t);
  }, [minMs]);
  const done = ready && elapsed;
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setGone(true), prefersReducedMotion() ? 0 : 450);
    return () => window.clearTimeout(t);
  }, [done]);
  return (
    <>
      {ready && children}
      {!gone && <OrionSplashScreen status={status} leaving={done} />}
    </>
  );
}

export default OrionSplashScreen;
