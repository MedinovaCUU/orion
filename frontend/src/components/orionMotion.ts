/** Preferencia del sistema "reducir movimiento": con ella el logo Orion se muestra fijo en lugar de animado. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const INTRO_SEEN_KEY = 'orion.intro.seen';

/**
 * La bienvenida completa se reproduce una vez cada vez que se abre la página (nueva pestaña o ventana): se recuerda en
 * sessionStorage, así que navegar dentro de la app no la repite y abrirla de nuevo sí. `?intro` la fuerza siempre.
 */
export function wantsIntro() {
  if (prefersReducedMotion()) return false;
  try {
    if (new URLSearchParams(window.location.search).has('intro')) return true;
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* sin almacenamiento: la bienvenida simplemente se repetirá */
  }
}
