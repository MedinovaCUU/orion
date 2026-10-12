import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ORION_INTRO_MS, OrionLoader } from './OrionLoader';
import { ORION_BRAND_ASSETS } from './orionBrandAssets';
import { markIntroSeen, prefersReducedMotion, wantsIntro } from './orionMotion';
import { SplashVisibleContext } from './splashVisibleContext';
import './OrionSplash.css';

/** Hay un arranque estático de `index.html` en pantalla: React lo reemplaza sin repetir la entrada (se ve continuo). */
const bootOnScreen = () => typeof document !== 'undefined' && document.querySelector('.orion-splash--boot') !== null;

/**
 * Pantalla completa de carga: el logo animado flotando sobre su piso de luz, wordmark 3D, BioSystems y línea de progreso.
 * Con `intro` el logo reproduce la animación completa de bienvenida y el wordmark espera a que el ojo encuentre al usuario.
 * `index.html` trae una copia estática de este marcado (sin bienvenida) para que el cargador se vea desde el primer cuadro.
 */
export function OrionSplashScreen({ status, leaving = false, intro = false, onIntroDone }: { status?: string; leaving?: boolean; intro?: boolean; onIntroDone?: (completed: boolean) => void }) {
  const [continued] = useState(bootOnScreen);
  const late = intro && !continued ? ORION_INTRO_MS * 0.55 : 0; // el ojo fija la mirada hacia el segundo 4
  const delayed = (base: number) => (late ? { animationDelay: `${(late + base) / 1000}s` } : undefined);
  return (
    <div className={`orion-splash${continued ? ' orion-splash--continued' : ''}${leaving ? ' orion-splash--leaving' : ''}`} role="status" aria-live="polite">
      <span className="orion-splash__pedestal orion-stage__pedestal">
        <OrionLoader className="orion-splash__logo" intro={intro} onIntroEnd={onIntroDone} />
      </span>
      <img className="orion-splash__wordmark" style={delayed(0)} src={ORION_BRAND_ASSETS.wordmark} alt="Orion by Medinova" draggable={false} />
      <div className="orion-splash__brand" style={delayed(150)}>
        <img className="orion-splash__biosystems" src={ORION_BRAND_ASSETS.biosystems} alt="BioSystems" draggable={false} />
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
