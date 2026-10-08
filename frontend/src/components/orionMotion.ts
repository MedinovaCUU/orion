/** Preferencia del sistema "reducir movimiento": con ella el logo Orion se muestra fijo en lugar de animado. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
