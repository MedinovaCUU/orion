const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const BRAND = `${BASE}orion-brand/`;
/** Súbelo cada vez que cambie el contenido de un archivo de `orion-brand/` que conserve su nombre: evita copias en caché. */
const ASSET_VERSION = 'v9';
const asset = (file: string) => `${BRAND}${file}?${ASSET_VERSION}`;

/** Recursos de marca del cargador y del splash. `index.html` repite las rutas del cuadro fijo y del wordmark. */
export const ORION_BRAND_ASSETS = {
  /** Loop del logo (render Blender, 800 px para verse nítido en grande, el logo ocupa ~61 % del encuadre). */
  loop: { hevc: asset('orion-logo-loop-hevc.mov'), webm: asset('orion-logo-loop.webm'), mp4: asset('orion-logo-loop.mp4') },
  /** Bienvenida completa (600 px, el logo ocupa ~49 % del encuadre). */
  intro: { hevc: asset('orion-intro-hevc.mov'), webm: asset('orion-intro.webm'), mp4: asset('orion-intro.mp4') },
  still: asset('orion-logo-still.webp'),
  stillWhite: asset('orion-logo-still-white.webp'),
  wordmark: asset('orion-wordmark.webp'),
  biosystems: `${BASE}bios-brand/BioS_Logo_300dpi.png`,
};
