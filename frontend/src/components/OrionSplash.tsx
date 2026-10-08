import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './OrionSplash.css';

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const ASSETS = {
  motionWebm: `${BASE}orion-brand/orion-loader-motion.webm`,
  motionWebp: `${BASE}orion-brand/orion-loader-motion.webp`,
  still: `${BASE}orion-brand/orion-loader-still.webp`,
  wordmark: `${BASE}orion-brand/orion-wordmark.webp`,
  biosystems: `${BASE}bios-brand/BioS_Logo_300dpi.png`,
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** WebM con alfa (VP9) es más ligero; Safari no lo reproduce con transparencia, ahí usamos el WebP animado. */
const supportsAlphaWebm = () => {
  if (typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrom(e|ium)|Edg\//i.test(ua);
  if (isSafari) return false;
  const video = document.createElement('video');
  return video.canPlayType('video/webm; codecs="vp9"') !== '';
};

/**
 * Logo Orion animado (loop renderizado en Blender: aros girando, satélites en órbita, ojo fijo en el usuario).
 * `size` fija el ancho en px; si se omite, se dimensiona por CSS. Con "reducir movimiento" se muestra el cuadro fijo.
 */
export function OrionLoader({ size, className = '' }: { size?: number; className?: string }) {
  const mode = useMemo<'still' | 'video' | 'webp'>(() => {
    if (prefersReducedMotion()) return 'still';
    return supportsAlphaWebm() ? 'video' : 'webp';
  }, []);
  const [videoFailed, setVideoFailed] = useState(false);
  const [webpFailed, setWebpFailed] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  let resolved: 'still' | 'video' | 'webp' = mode;
  if (resolved === 'video' && videoFailed) resolved = 'webp';
  if (resolved === 'webp' && webpFailed) resolved = 'still';

  return (
    <span aria-hidden className={`orion-loader ${className}`.trim()} style={size ? { width: size } : undefined}>
      {/* El cuadro fijo cubre la espera de descarga y se retira al llegar el primer cuadro animado (si no, se vería detrás). */}
      {(resolved === 'still' || !motionReady) && <img src={ASSETS.still} alt="" draggable={false} />}
      {resolved === 'webp' && (
        <img src={ASSETS.motionWebp} alt="" draggable={false} onLoad={() => setMotionReady(true)} onError={() => setWebpFailed(true)} />
      )}
      {resolved === 'video' && (
        <video
          src={ASSETS.motionWebm}
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          onPlaying={() => setMotionReady(true)}
          onError={() => setVideoFailed(true)}
        />
      )}
    </span>
  );
}

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
