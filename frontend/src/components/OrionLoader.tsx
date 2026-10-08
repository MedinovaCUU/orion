import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from './orionMotion';
import './OrionLoader.css';

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const ORION_LOADER_ASSETS = {
  motionWebm: `${BASE}orion-brand/orion-loader-motion.webm`,
  motionWebp: `${BASE}orion-brand/orion-loader-motion.webp`,
  still: `${BASE}orion-brand/orion-loader-still.webp`,
  motionWebpSmall: `${BASE}orion-brand/orion-loader-motion-s.webp`,
  motionMp4: `${BASE}orion-brand/orion-loader-motion.mp4`,
  stillWhite: `${BASE}orion-brand/orion-loader-still-white.webp`,
  introMp4: `${BASE}orion-brand/orion-intro.mp4`,
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
/** Si la bienvenida no está lista para reproducirse en este tiempo, se omite (y no se marca como vista). */
const INTRO_READY_TIMEOUT_MS = 9000;

type LoaderMode = 'still' | 'video' | 'webp';

/**
 * Logo Orion animado (loop renderizado en Blender: el ojo busca al usuario, los aros giran, los satélites orbitan).
 * `size` fija el ancho en px; si se omite, se dimensiona por CSS. Con "reducir movimiento" se muestra el cuadro fijo.
 *
 * `opaque`: usa MP4 H.264 sobre blanco (ligero y con decodificación por hardware en todos los navegadores, Safari
 * incluido); pensado para el splash, cuyo fondo es blanco detrás del logo. Sin `opaque` se usa WebM con alfa o WebP
 * animado (transparente), para loaders inline sobre cualquier fondo.
 *
 * `intro`: reproduce primero la animación completa de bienvenida (una vez) y al terminar continúa con el loop. Arranca
 * solo cuando el vídeo está listo para reproducirse de corrido; `onIntroEnd(completed)` avisa al terminar o al omitirla.
 */
export function OrionLoader({ size, className = '', opaque = false, intro = false, onIntroEnd }: {
  size?: number;
  className?: string;
  opaque?: boolean;
  intro?: boolean;
  onIntroEnd?: (completed: boolean) => void;
}) {
  const mode = useMemo<LoaderMode>(() => {
    if (prefersReducedMotion()) return 'still';
    if (opaque) return 'video';
    return supportsAlphaWebm() ? 'video' : 'webp';
  }, [opaque]);
  const [videoFailed, setVideoFailed] = useState(false);
  const [webpFailed, setWebpFailed] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(intro && opaque && mode === 'video');
  const [introStarted, setIntroStarted] = useState(false);
  let resolved: LoaderMode = mode;
  if (resolved === 'video' && videoFailed) resolved = opaque ? 'still' : 'webp';
  if (resolved === 'webp' && webpFailed) resolved = 'still';
  const finishIntro = (completed: boolean) => {
    setIntroPlaying(false);
    onIntroEnd?.(completed);
  };
  // Sin animación la bienvenida se omite; con WebP (sin evento de fin) se cronometra desde que la imagen cargó;
  // y si el recurso tarda demasiado en estar listo, se omite sin marcarla como vista.
  useEffect(() => {
    if (!intro || !introPlaying) return;
    if (resolved === 'still') {
      finishIntro(false);
      return;
    }
    if (!introStarted) {
      const t = window.setTimeout(() => finishIntro(false), INTRO_READY_TIMEOUT_MS);
      return () => window.clearTimeout(t);
    }
    if (resolved === 'webp') {
      const t = window.setTimeout(() => finishIntro(true), ORION_INTRO_MS);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, resolved, introPlaying, introStarted]);

  // Safari no dispara `canplaythrough` de forma fiable hasta que se intenta reproducir: pedimos play() en cuanto el vídeo
  // monta (silenciado e inline, permitido por las políticas de autoplay) y damos por iniciada la bienvenida con `playing`.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = () => video.play().catch(() => undefined);
    attempt();
    const retry = window.setInterval(() => {
      if (video.paused && !video.ended) attempt();
    }, 1000);
    return () => window.clearInterval(retry);
  }, [resolved, introPlaying]);

  const small = size !== undefined && size <= 120;
  // La bienvenida (intro) solo existe en MP4: se usa con `opaque` (splash). Sin `opaque`, intro cae al loop con alfa.
  const videoSrc = opaque
    ? (introPlaying ? ORION_LOADER_ASSETS.introMp4 : ORION_LOADER_ASSETS.motionMp4)
    : ORION_LOADER_ASSETS.motionWebm;
  const webpSrc = small ? ORION_LOADER_ASSETS.motionWebpSmall : ORION_LOADER_ASSETS.motionWebp;
  const stillSrc = opaque ? ORION_LOADER_ASSETS.stillWhite : ORION_LOADER_ASSETS.still;

  return (
    <span aria-hidden className={`orion-loader${opaque ? ' orion-loader--opaque' : ''} ${className}`.trim()} style={size ? { width: size } : undefined}>
      {/* El cuadro fijo cubre la espera de descarga y se retira al llegar el primer cuadro animado (si no, se vería detrás). */}
      {(resolved === 'still' || !motionReady) && <img src={stillSrc} alt="" draggable={false} />}
      {resolved === 'webp' && (
        <img
          key={webpSrc}
          src={webpSrc}
          alt=""
          draggable={false}
          onLoad={() => {
            setMotionReady(true);
            if (introPlaying) setIntroStarted(true);
          }}
          onError={() => (introPlaying ? finishIntro(false) : setWebpFailed(true))}
        />
      )}
      {resolved === 'video' && (
        <video
          key={videoSrc}
          ref={videoRef}
          src={videoSrc}
          preload="auto"
          autoPlay
          muted
          loop={!introPlaying}
          playsInline
          disablePictureInPicture
          onPlaying={() => {
            setMotionReady(true);
            if (introPlaying) setIntroStarted(true);
          }}
          onEnded={introPlaying ? () => finishIntro(true) : undefined}
          onError={() => (introPlaying ? finishIntro(false) : setVideoFailed(true))}
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
