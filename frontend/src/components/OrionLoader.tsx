import { useMemo, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from './orionMotion';
import './OrionLoader.css';

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const ORION_LOADER_ASSETS = {
  motionWebm: `${BASE}orion-brand/orion-loader-motion.webm`,
  motionWebp: `${BASE}orion-brand/orion-loader-motion.webp`,
  still: `${BASE}orion-brand/orion-loader-still.webp`,
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

/**
 * Logo Orion animado (loop renderizado en Blender: el ojo busca al usuario, los aros giran, los satélites orbitan).
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
      {(resolved === 'still' || !motionReady) && <img src={ORION_LOADER_ASSETS.still} alt="" draggable={false} />}
      {resolved === 'webp' && (
        <img src={ORION_LOADER_ASSETS.motionWebp} alt="" draggable={false} onLoad={() => setMotionReady(true)} onError={() => setWebpFailed(true)} />
      )}
      {resolved === 'video' && (
        <video
          src={ORION_LOADER_ASSETS.motionWebm}
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

/** Loader inline (logo pequeño + texto). Es un `span`, así que cabe en párrafos y botones. `block` lo deja en su propia línea. */
export function Loader({ label, size = 40, block = false, className = '' }: { label?: ReactNode; size?: number; block?: boolean; className?: string }) {
  return (
    <span className={`orion-inline-loader${block ? ' orion-inline-loader--block' : ''} ${className}`.trim()} role="status" aria-live="polite">
      <OrionLoader size={size} />
      {label && <span>{label}</span>}
    </span>
  );
}

/** Bloque centrado para la carga de un módulo o vista completa. */
export function PanelLoader({ title, subtitle, eyebrow, className = '' }: { title?: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={`orion-panel-loader ${className}`.trim()} role="status" aria-live="polite">
      <OrionLoader />
      {eyebrow && <span className="orion-panel-loader__eyebrow">{eyebrow}</span>}
      {title && <strong className="orion-panel-loader__title">{title}</strong>}
      {subtitle && <span className="orion-panel-loader__subtitle">{subtitle}</span>}
    </div>
  );
}

export default OrionLoader;
