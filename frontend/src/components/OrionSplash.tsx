import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ORION_INTRO_MS, OrionLoader } from './OrionLoader';
import { markIntroSeen, prefersReducedMotion, wantsIntro } from './orionMotion';
import { SplashVisibleContext } from './splashVisibleContext';
import './OrionSplash.css';

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const ASSETS = {
  wordmark: `${BASE}orion-brand/orion-wordmark.webp`,
  biosystems: `${BASE}bios-brand/BioS_Logo_300dpi.png`,
};

/**
 * Pantalla completa de carga: logo animado, wordmark 3D, BioSystems y línea de progreso.
 * Con `intro` el logo reproduce la animación completa de bienvenida y el wordmark espera a que el ojo encuentre al usuario.
 */
export function OrionSplashScreen({ status, leaving = false, intro = false, onIntroDone }: { status?: string; leaving?: boolean; intro?: boolean; onIntroDone?: (completed: boolean) => void }) {
  const late = intro ? ORION_INTRO_MS * 0.55 : 0; // el ojo fija la mirada hacia el segundo 4
  const delayed = (base: number) => (late ? { animationDelay: `${(late + base) / 1000}s` } : undefined);
  return (
    <div className={`orion-splash${leaving ? ' orion-splash--leaving' : ''}`} role="status" aria-live="polite">
      <OrionLoader className="orion-splash__logo" opaque intro={intro} onIntroEnd={onIntroDone} />
      <img className="orion-splash__wordmark" style={delayed(0)} src={ASSETS.wordmark} alt="Orion by Medinova" draggable={false} />
      <div className="orion-splash__brand" style={delayed(150)}>
        <img className="orion-splash__biosystems" src={ASSETS.biosystems} alt="BioSystems" draggable={false} />
        <span className="orion-splash__eyebrow">Centro operativo</span>
      </div>
      <div className="orion-splash__progress" style={delayed(300)} />
      <div className="orion-splash__status" style={delayed(300)}>{status}</div>
    </div>
  );
}

/**
 * Muestra el splash hasta que `ready` sea true, haya pasado al menos `minMs` (para que nunca parpadee) y, la primera vez,
 * hasta que termine la animación de bienvenida. Los hijos se montan en cuanto `ready` es true, debajo del splash.
 */
export function OrionSplashGate({ ready, status, minMs = 1400, children }: { ready: boolean; status?: string; minMs?: number; children: ReactNode }) {
  const [elapsed, setElapsed] = useState(false);
  const [intro] = useState(wantsIntro);
  const [introDone, setIntroDone] = useState(!intro);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setElapsed(true), prefersReducedMotion() ? 0 : minMs);
    return () => window.clearTimeout(t);
  }, [minMs]);
  // Solo cuenta como vista si la animación se reprodujo completa; si se omitió (recurso lento), se intentará la próxima vez.
  const onIntroDone = useCallback((completed: boolean) => {
    if (completed) markIntroSeen();
    window.setTimeout(() => setIntroDone(true), completed ? 700 : 0); // deja respirar el logo ya asentado
  }, []);
  const done = ready && elapsed && introDone;
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setGone(true), prefersReducedMotion() ? 0 : 450);
    return () => window.clearTimeout(t);
  }, [done]);
  return (
    <SplashVisibleContext.Provider value={!gone}>
      {ready && children}
      {!gone && <OrionSplashScreen status={status} leaving={done} intro={intro} onIntroDone={onIntroDone} />}
    </SplashVisibleContext.Provider>
  );
}

export default OrionSplashScreen;
