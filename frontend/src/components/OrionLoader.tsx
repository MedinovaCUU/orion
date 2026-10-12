import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { ORION_BRAND_ASSETS } from './orionBrandAssets';
import { prefersReducedMotion } from './orionMotion';
import { currentVeilRequest, registerVeilHost, subscribeVeil, useBlockingLoad } from './orionLoadingVeil';
import './OrionLoader.css';

/** Duración de la animación completa de bienvenida (240 cuadros a 30 fps). */
export const ORION_INTRO_MS = 8000;
/** Si la bienvenida no ha empezado a reproducirse en este tiempo, se omite (y no se marca como vista). */
const INTRO_READY_TIMEOUT_MS = 9000;

/**
 * Formato con transparencia que el navegador reproduce: HEVC con alfa en Safari (nativo, decodificación por hardware),
 * WebM VP9 con alfa en Chromium y Firefox. `null` si no hay ninguno (se usará el MP4 opaco sobre blanco).
 */
type AlphaFormat = 'hevc' | 'webm' | null;
let alphaFormatCache: AlphaFormat | undefined;
const detectAlphaFormat = (): AlphaFormat => {
  if (alphaFormatCache !== undefined) return alphaFormatCache;
  if (typeof document === 'undefined') return null;
  const video = document.createElement('video');
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrom(e|ium)|Edg\/|OPR\//i.test(ua);
  const hevcOk = ['video/mp4; codecs="hvc1"', 'video/mp4; codecs="hev1"', 'video/quicktime'].some((t) => video.canPlayType(t) !== '');
  alphaFormatCache = isSafari && hevcOk ? 'hevc' : video.canPlayType('video/webm; codecs="vp9"') !== '' ? 'webm' : null;
  return alphaFormatCache;
};

/*
 * Loop compartido: se descarga una sola vez al arrancar la app (este módulo va en el paquete inicial) y todos los
 * cargadores reproducen la misma copia en memoria, así que a partir del primero aparecen al instante.
 */
let loopUrl: string | null = null;
let loopRequested = false;
const loopListeners = new Set<() => void>();
const loopSource = (alpha: AlphaFormat) => (alpha === 'hevc' ? ORION_BRAND_ASSETS.loop.hevc : alpha === 'webm' ? ORION_BRAND_ASSETS.loop.webm : ORION_BRAND_ASSETS.loop.mp4);

function preloadOrionLogo() {
  if (loopRequested || typeof window === 'undefined' || prefersReducedMotion()) return;
  loopRequested = true;
  const source = loopSource(detectAlphaFormat());
  const publish = (url: string) => {
    loopUrl = url;
    loopListeners.forEach((listener) => listener());
  };
  fetch(source)
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
    .then((blob) => publish(URL.createObjectURL(blob)))
    .catch(() => publish(source)); // sin memoria compartida, el vídeo la pide por red
}
preloadOrionLogo();

const subscribeLoop = (listener: () => void) => {
  loopListeners.add(listener);
  return () => {
    loopListeners.delete(listener);
  };
};
const useSharedLoop = () => useSyncExternalStore(subscribeLoop, () => loopUrl, () => null);

/**
 * Ancla las animaciones CSS del logo (flotación, sombra, halo) al origen de la página: todos los cargadores se mueven
 * en la misma fase y el paso del arranque al splash o de un cargador a otro no da saltos. `index.html` hace lo mismo.
 */
function syncClock(root: Element | null) {
  if (!root || typeof root.getAnimations !== 'function') return;
  for (const animation of root.getAnimations({ subtree: true })) animation.startTime = 0;
}

type LoaderMode = 'still' | 'alpha' | 'opaque';

/**
 * Logo Orion animado (render Blender: el ojo busca al usuario, los aros giran, los satélites orbitan), flotando en 3D
 * hacia el usuario sobre su sombra. `size` fija el ancho en px; si se omite, lo dimensiona `--emblem-size` del
 * contenedor. Con "reducir movimiento" se muestra el cuadro fijo. Mientras llega el vídeo se ve el cuadro fijo del
 * mismo render, así que nunca aparece vacío.
 *
 * `intro`: reproduce primero la animación completa de bienvenida (una vez) y al terminar continúa con el loop.
 * `onIntroEnd(completed)` avisa al terminar o al omitirla (recurso no listo a tiempo).
 * El marcado del arranque en `index.html` es una copia de este: cámbialos juntos.
 */
export function OrionLoader({ size, className = '', intro = false, onIntroEnd }: {
  size?: number;
  className?: string;
  intro?: boolean;
  onIntroEnd?: (completed: boolean) => void;
}) {
  const alphaFormat = useMemo(detectAlphaFormat, []);
  const mode = useMemo<LoaderMode>(() => (prefersReducedMotion() ? 'still' : alphaFormat ? 'alpha' : 'opaque'), [alphaFormat]);
  const sharedLoop = useSharedLoop();
  const [failed, setFailed] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(intro && mode !== 'still');
  const [introStarted, setIntroStarted] = useState(false);
  const resolved: LoaderMode = failed ? 'still' : mode;
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useLayoutEffect(() => syncClock(rootRef.current), []);

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

  const introSrc = alphaFormat === 'hevc' ? ORION_BRAND_ASSETS.intro.hevc : alphaFormat === 'webm' ? ORION_BRAND_ASSETS.intro.webm : ORION_BRAND_ASSETS.intro.mp4;
  const videoSrc = resolved === 'still' ? null : introPlaying ? introSrc : sharedLoop;

  // Safari no dispara `canplaythrough` de forma fiable hasta que se intenta reproducir: pedimos play() en cuanto el vídeo
  // monta (silenciado e inline, permitido por las políticas de autoplay) y lo reintentamos si se queda en pausa.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = () => video.play().catch(() => undefined);
    attempt();
    const retry = window.setInterval(() => {
      if (video.paused && !video.ended) attempt();
    }, 1000);
    return () => window.clearInterval(retry);
  }, [videoSrc]);

  const style = size ? ({ '--emblem-size': `${size}px` } as CSSProperties) : undefined;
  const stillSrc = resolved === 'opaque' ? ORION_BRAND_ASSETS.stillWhite : ORION_BRAND_ASSETS.still;
  const classes = ['orion-loader', resolved === 'opaque' && 'orion-loader--opaque', introPlaying && 'orion-loader--intro', className].filter(Boolean).join(' ');
  return (
    <span ref={rootRef} aria-hidden className={classes} style={style}>
      <span className="orion-loader__halo" />
      <span className="orion-loader__shadow" />
      <span className="orion-loader__body">
        {/* El cuadro fijo cubre la espera de descarga y se retira al llegar el primer cuadro animado (si no, se vería detrás). */}
        {(!videoSrc || !motionReady) && <img src={stillSrc} alt="" draggable={false} />}
        {videoSrc && (
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
            onLoadedMetadata={(event) => {
              // El loop arranca en la fase del reloj de la página: todos los cargadores muestran el mismo cuadro.
              const video = event.currentTarget;
              if (!introPlaying && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = (performance.now() / 1000) % video.duration;
            }}
            onPlaying={() => {
              setMotionReady(true);
              if (introPlaying) setIntroStarted(true);
            }}
            onEnded={introPlaying ? () => finishIntro(true) : undefined}
            onError={() => {
              if (introPlaying) finishIntro(false);
              else setFailed(true);
              setMotionReady(false);
            }}
          />
        )}
      </span>
    </span>
  );
}

/**
 * Indicador dentro de un botón o una línea de estado (exportar, procesar un documento): texto con la línea de progreso
 * del cargador. El logo solo aparece grande, en `Loader` / `PanelLoader`, nunca en miniatura.
 */
export function InlineLoader({ label, className = '' }: { label?: ReactNode; className?: string }) {
  return (
    <span className={`orion-inline-loader ${className}`.trim()} role="status" aria-live="polite">
      {label && <span>{label}</span>}
      <span className="orion-stage__progress orion-inline-loader__progress" aria-hidden />
    </span>
  );
}

type StageSize = 'sm' | 'md' | 'lg';

/**
 * Escenario de carga: vidrio esmerilado sobre un fondo desenfocado que deriva despacio, con el logo flotando hacia el
 * usuario sobre un piso de luz. Es el único cargador de la app (módulos, listas y detalles) para que todos se vean iguales.
 */
function LoadingStage({ size, eyebrow, title, subtitle, brand = false, className = '' }: {
  size: StageSize;
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  brand?: boolean;
  className?: string;
}) {
  return (
    <div className={`orion-stage orion-stage--${size}${brand ? ' orion-stage--brand' : ''} ${className}`.trim()} role="status" aria-live="polite">
      <span className="orion-stage__pedestal">
        <OrionLoader />
      </span>
      {brand && <img className="orion-stage__wordmark" src={ORION_BRAND_ASSETS.wordmark} alt="Orion by Medinova" draggable={false} />}
      <span className="orion-stage__copy">
        {eyebrow && <span className="orion-stage__eyebrow">{eyebrow}</span>}
        {title && <strong className="orion-stage__title">{title}</strong>}
        {subtitle && <span className="orion-stage__subtitle">{subtitle}</span>}
        <span className="orion-stage__progress" aria-hidden />
      </span>
      {brand && <img className="orion-stage__biosystems" src={ORION_BRAND_ASSETS.biosystems} alt="BioSystems" draggable={false} />}
    </div>
  );
}

/** Carga de una lista o un detalle dentro de un módulo. `size="sm"` para huecos estrechos (fichas, paneles laterales). */
export function Loader({ label, detail, size = 'md', className = '' }: { label?: ReactNode; detail?: ReactNode; size?: 'sm' | 'md'; className?: string }) {
  return <LoadingStage size={size} title={label} subtitle={detail} className={className} />;
}

/** Entre una carga y la siguiente (abrir el módulo y luego traer sus datos) el velo no parpadea. */
const VEIL_SETTLE_MS = 160;
/** Si llegó a aparecer, se queda lo suficiente para no verse como un destello. */
const VEIL_MIN_MS = 450;
const VEIL_FADE_MS = 380;

type VeilPhase = 'hidden' | 'visible' | 'leaving';

/**
 * El velo único de la app: desenfoque a pantalla completa con el logo flotando mientras alguna vista lo pide
 * (`useBlockingLoad` / `PanelLoader`). Va montado una sola vez, en `App`.
 */
export function OrionLoadingVeil() {
  const request = useSyncExternalStore(subscribeVeil, currentVeilRequest, () => null);
  const busy = request !== null;
  const [phase, setPhase] = useState<VeilPhase>('hidden');
  const [label, setLabel] = useState<string | undefined>();
  const shownAt = useRef(0);
  // Se ajusta en el mismo render en que llega la petición: el velo aparece antes de que se pinte la página vacía.
  if (busy && phase !== 'visible') setPhase('visible');
  if (request?.label && request.label !== label) setLabel(request.label);

  useLayoutEffect(registerVeilHost, []);

  useLayoutEffect(() => {
    if (phase === 'visible' && !shownAt.current) shownAt.current = performance.now();
    if (phase === 'hidden') shownAt.current = 0;
  }, [phase]);

  useEffect(() => {
    if (busy || phase !== 'visible') return;
    const wait = Math.max(VEIL_SETTLE_MS, VEIL_MIN_MS - (performance.now() - shownAt.current));
    const timer = window.setTimeout(() => setPhase('leaving'), wait);
    return () => window.clearTimeout(timer);
  }, [busy, phase]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('hidden'), prefersReducedMotion() ? 0 : VEIL_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'hidden') return null;
  return (
    <div className={`orion-veil${phase === 'leaving' ? ' orion-veil--leaving' : ''}`} role="status" aria-live="polite" aria-busy={busy}>
      <span className="orion-veil__stage">
        <OrionLoader />
      </span>
      <span className="orion-veil__copy">
        {label && <span className="orion-veil__label">{label}</span>}
        <span className="orion-stage__progress orion-veil__progress" aria-hidden />
      </span>
    </div>
  );
}

/**
 * Carga de un módulo o vista completa: cubre la pantalla con el velo y deja en su sitio un hueco del tamaño del panel.
 * Si no hay velo o la carga se alarga, enseña el escenario dentro del panel; con `brand` añade el wordmark 3D y
 * BioSystems, como la pantalla de inicio.
 */
export function PanelLoader({ title, subtitle, eyebrow, brand = false, className = '' }: { title?: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; brand?: boolean; className?: string }) {
  const covered = useBlockingLoad(true, typeof title === 'string' ? title : undefined);
  if (covered) return <div className={`orion-veil-placeholder ${className}`.trim()} aria-hidden />;
  return <LoadingStage size="lg" eyebrow={eyebrow} title={title} subtitle={subtitle} brand={brand} className={className} />;
}

export default OrionLoader;
