import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from './orionMotion';
import './OrionLoader.css';

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const ORION_LOADER_ASSETS = {
  motionWebm: `${BASE}orion-brand/orion-loader-motion.webm`,
  motionWebp: `${BASE}orion-brand/orion-loader-motion.webp`,
  still: `${BASE}orion-brand/orion-loader-still.webp`,
  introWebm: `${BASE}orion-brand/orion-intro.webm`,
  introWebp: `${BASE}orion-brand/orion-intro.webp`,
  wordmark: `${BASE}orion-brand/orion-wordmark.webp`,
  biosystems: `${BASE}bios-brand/BioS_Logo_300dpi.png`,
};


/** WebM con alfa (VP9) es más ligero; Safari no lo reproduce con transparencia, ahí usamos el WebP animado. */
const supportsAlphaWebm = () => {
  if (typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrom(e|ium)|Edg\//i.test(ua);
  if (isSafari) return false;
  const video = document.createElement('video');
  return video.canPlayType('video/webm; codecs="vp9"') !== '';
};

/** Duración de la animación completa de bienvenida (240 cuadros a 30 fps). */
export const ORION_INTRO_MS = 8000;

/**
 * Logo Orion animado (loop renderizado en Blender: el ojo busca al usuario, los aros giran, los satélites orbitan).
 * `size` fija el ancho en px; si se omite, se dimensiona por CSS. Con "reducir movimiento" se muestra el cuadro fijo.
 * Con `intro` reproduce primero la animación completa de bienvenida (una vez) y al terminar continúa con el loop;
 * `onIntroEnd` avisa cuando acaba. Los aros terminan la bienvenida en la misma pose con la que arranca el loop.
 */
export function OrionLoader({ size, className = '', intro = false, onIntroEnd }: { size?: number; className?: string; intro?: boolean; onIntroEnd?: () => void }) {
  const mode = useMemo<'still' | 'video' | 'webp'>(() => {
    if (prefersReducedMotion()) return 'still';
    return supportsAlphaWebm() ? 'video' : 'webp';
  }, []);
  const [videoFailed, setVideoFailed] = useState(false);
  const [webpFailed, setWebpFailed] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(intro && mode !== 'still');
  let resolved: 'still' | 'video' | 'webp' = mode;
  if (resolved === 'video' && videoFailed) resolved = 'webp';
  if (resolved === 'webp' && webpFailed) resolved = 'still';
  const finishIntro = () => {
    setIntroPlaying(false);
    onIntroEnd?.();
  };
  // Sin animación (movimiento reducido) la bienvenida termina de inmediato; el WebP animado no avisa cuando acaba, así que se cronometra.
  useEffect(() => {
    if (!intro) return;
    if (resolved === 'still') {
      onIntroEnd?.();
      return;
    }
    if (resolved === 'webp' && introPlaying) {
      const t = window.setTimeout(finishIntro, ORION_INTRO_MS);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, resolved, introPlaying]);
  const videoSrc = introPlaying ? ORION_LOADER_ASSETS.introWebm : ORION_LOADER_ASSETS.motionWebm;
  const webpSrc = introPlaying ? ORION_LOADER_ASSETS.introWebp : ORION_LOADER_ASSETS.motionWebp;

  return (
    <span aria-hidden className={`orion-loader ${className}`.trim()} style={size ? { width: size } : undefined}>
      {/* El cuadro fijo cubre la espera de descarga y se retira al llegar el primer cuadro animado (si no, se vería detrás). */}
      {(resolved === 'still' || !motionReady) && <img src={ORION_LOADER_ASSETS.still} alt="" draggable={false} />}
      {resolved === 'webp' && (
        <img key={webpSrc} src={webpSrc} alt="" draggable={false} onLoad={() => setMotionReady(true)} onError={() => setWebpFailed(true)} />
      )}
      {resolved === 'video' && (
        <video
          key={videoSrc}
          src={videoSrc}
          autoPlay
          muted
          loop={!introPlaying}
          playsInline
          disablePictureInPicture
          onPlaying={() => setMotionReady(true)}
          onEnded={introPlaying ? finishIntro : undefined}
          onError={() => (introPlaying ? finishIntro() : setVideoFailed(true))}
        />
      )}
    </span>
  );
}

/** Loader inline (logo pequeño + texto). Es un `span`, así que cabe en párrafos y botones. `block` lo deja en su propia línea. */
export function Loader({ label, size = 40, block = false, className = '' }: { label?: ReactNode; size?: number; block?: boolean; className?: string }) {
  return (
    <span className={`orion-inline-loader${block ? ' orion-inline-loader--block' : ''} ${className}`.trim()} role="status" aria-live="polite">
      <OrionLoader size={size} />
      {label && <span>{label}</span>}
    </span>
  );
}

/**
 * Bloque centrado para la carga de un módulo o vista completa. Con `brand` añade el wordmark 3D y BioSystems,
 * de modo que la carga de un módulo se vea como la pantalla de inicio, solo que dentro del panel.
 */
export function PanelLoader({ title, subtitle, eyebrow, brand = false, className = '' }: { title?: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; brand?: boolean; className?: string }) {
  return (
    <div className={`orion-panel-loader${brand ? ' orion-panel-loader--brand' : ''} ${className}`.trim()} role="status" aria-live="polite">
      <OrionLoader />
      {brand && <img className="orion-panel-loader__wordmark" src={ORION_LOADER_ASSETS.wordmark} alt="Orion by Medinova" draggable={false} />}
      {brand && <img className="orion-panel-loader__biosystems" src={ORION_LOADER_ASSETS.biosystems} alt="BioSystems" draggable={false} />}
      {eyebrow && <span className="orion-panel-loader__eyebrow">{eyebrow}</span>}
      {title && <strong className="orion-panel-loader__title">{title}</strong>}
      {subtitle && <span className="orion-panel-loader__subtitle">{subtitle}</span>}
    </div>
  );
}

export default OrionLoader;
