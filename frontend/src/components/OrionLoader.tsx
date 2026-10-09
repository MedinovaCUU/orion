import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from './orionMotion';
import './OrionLoader.css';

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const BRAND = `${BASE}orion-brand/`;
/** Súbelo cada vez que cambie el contenido de un archivo de `orion-brand/` que conserve su nombre: evita copias en caché. */
const ASSET_VERSION = 'v6';
const asset = (file: string) => `${BRAND}${file}?${ASSET_VERSION}`;
const ORION_LOADER_ASSETS = {
  loop: { hevc: asset('orion-loader-motion-hevc.mov'), webm: asset('orion-loader-motion.webm'), mp4: asset('orion-loader-motion.mp4') },
  intro: { hevc: asset('orion-intro-hevc.mov'), webm: asset('orion-intro.webm'), mp4: asset('orion-intro.mp4') },
  still: asset('orion-loader-still.webp'),
  stillWhite: asset('orion-loader-still-white.webp'),
  wordmark: asset('orion-wordmark.webp'),
  biosystems: `${BASE}bios-brand/BioS_Logo_300dpi.png`,
};

/** Duración de la animación completa de bienvenida (240 cuadros a 30 fps). */
export const ORION_INTRO_MS = 8000;
/** Si la bienvenida no ha empezado a reproducirse en este tiempo, se omite (y no se marca como vista). */
const INTRO_READY_TIMEOUT_MS = 9000;

/**
 * Formato con transparencia que el navegador reproduce: HEVC con alfa en Safari (nativo, decodificación por hardware),
 * WebM VP9 con alfa en Chromium y Firefox. `null` si no hay ninguno (se usará el MP4 opaco sobre blanco).
 */
type AlphaFormat = 'hevc' | 'webm' | null;
const detectAlphaFormat = (): AlphaFormat => {
  if (typeof document === 'undefined') return null;
  const video = document.createElement('video');
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrom(e|ium)|Edg\/|OPR\//i.test(ua);
  const hevcOk = ['video/mp4; codecs="hvc1"', 'video/mp4; codecs="hev1"', 'video/quicktime'].some((t) => video.canPlayType(t) !== '');
  if (isSafari && hevcOk) return 'hevc';
  if (video.canPlayType('video/webm; codecs="vp9"') !== '') return 'webm';
  return null;
};

type LoaderMode = 'still' | 'alpha' | 'opaque';

/**
 * Logo Orion animado (loop renderizado en Blender: el ojo busca al usuario, los aros giran, los satélites orbitan).
 * `size` fija el ancho en px; si se omite, se dimensiona por CSS. Con "reducir movimiento" se muestra el cuadro fijo.
 *
 * Los vídeos llevan aire alrededor del logo (ocupa el 72 % del encuadre) para que el halo nunca se recorte; el CSS
 * escala el medio para que el logo llene la caja y el halo desborde. Con transparencia (HEVC alfa en Safari, WebM VP9
 * en el resto) se integra sobre cualquier fondo; si no hay formato con alfa se usa MP4 opaco sobre blanco con un
 * desvanecido radial en los bordes.
 *
 * `intro`: reproduce primero la animación completa de bienvenida (una vez) y al terminar continúa con el loop.
 * `onIntroEnd(completed)` avisa al terminar o al omitirla (recurso no listo a tiempo).
 */
export function OrionLoader({ size, className = '', intro = false, onIntroEnd }: {
  size?: number;
  className?: string;
  intro?: boolean;
  onIntroEnd?: (completed: boolean) => void;
}) {
  const alphaFormat = useMemo(detectAlphaFormat, []);
  const mode = useMemo<LoaderMode>(() => (prefersReducedMotion() ? 'still' : alphaFormat ? 'alpha' : 'opaque'), [alphaFormat]);
  const [alphaFailed, setAlphaFailed] = useState(false);
  const [opaqueFailed, setOpaqueFailed] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(intro && mode !== 'still');
  const [introStarted, setIntroStarted] = useState(false);
  let resolved: LoaderMode = mode;
  if (resolved === 'alpha' && alphaFailed) resolved = 'opaque';
  if (resolved === 'opaque' && opaqueFailed) resolved = 'still';
  const finishIntro = (completed: boolean) => {
    setIntroPlaying(false);
    setMotionReady(false); // el cuadro fijo cubre el cambio de clip hasta que el loop pinta su primer cuadro
    onIntroEnd?.(completed);
  };
  // Sin animación la bienvenida se omite; si no ha empezado a reproducirse a tiempo, se omite sin marcarla como vista.
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

  const clip = introPlaying ? ORION_LOADER_ASSETS.intro : ORION_LOADER_ASSETS.loop;
  const videoSrc = resolved === 'alpha' ? (alphaFormat === 'hevc' ? clip.hevc : clip.webm) : clip.mp4;
  const stillSrc = resolved === 'opaque' ? ORION_LOADER_ASSETS.stillWhite : ORION_LOADER_ASSETS.still;

  return (
    <span aria-hidden className={`orion-loader${resolved === 'opaque' ? ' orion-loader--opaque' : ''} ${className}`.trim()} style={size ? { width: size } : undefined}>
      {/* El cuadro fijo cubre la espera de descarga y se retira al llegar el primer cuadro animado (si no, se vería detrás). */}
      {(resolved === 'still' || !motionReady) && <img src={stillSrc} alt="" draggable={false} />}
      {resolved !== 'still' && (
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
          onError={() => {
            if (resolved === 'alpha') setAlphaFailed(true);
            else if (introPlaying) finishIntro(false);
            else setOpaqueFailed(true);
            setMotionReady(false);
          }}
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
