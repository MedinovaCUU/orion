import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

/*
 * Velo de carga: mientras una página trae su contenido principal, un desenfoque cubre toda la pantalla con el logo al
 * centro, en vez de enseñar la página vacía llenándose poco a poco. Hay un solo velo (`OrionLoadingVeil`, montado en
 * `App`); las vistas lo piden con `useBlockingLoad` o con `PanelLoader`. Aquí vive el registro de esas peticiones.
 */

/** Si una carga se alarga más que esto, el velo se retira y la vista muestra su propio cargador (la app no queda bloqueada). */
const VEIL_MAX_MS = 15000;

export type VeilRequest = { label?: string };

let veilRequests: VeilRequest[] = [];
let veilHosts = 0;
const veilListeners = new Set<() => void>();
const publishVeil = () => veilListeners.forEach((listener) => listener());

export const subscribeVeil = (listener: () => void) => {
  veilListeners.add(listener);
  return () => {
    veilListeners.delete(listener);
  };
};

/** La petición más reciente que sigue activa (su texto es el que muestra el velo), o null si nada está cargando. */
export const currentVeilRequest = () => veilRequests[veilRequests.length - 1] ?? null;

const veilHostReady = () => veilHosts > 0;

/** Lo llama el velo al montarse: sin velo montado, las vistas enseñan su cargador en el sitio. */
export const registerVeilHost = () => {
  veilHosts += 1;
  publishVeil();
  return () => {
    veilHosts -= 1;
    publishVeil();
  };
};

/**
 * Cubre la pantalla con el velo mientras `active` sea true. Devuelve si el velo la está cubriendo: es false cuando no hay
 * velo montado o la carga pasó de `VEIL_MAX_MS`, y entonces la vista debe enseñar su cargador en el sitio.
 */
export function useBlockingLoad(active: boolean, label?: string) {
  const hostReady = useSyncExternalStore(subscribeVeil, veilHostReady, () => false);
  const [expired, setExpired] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setExpired(false); // la próxima carga vuelve a tener su plazo completo
  }
  const covering = active && hostReady && !expired;

  // Antes de pintar: la página vacía no llega a verse ni un cuadro.
  useLayoutEffect(() => {
    if (!covering) return;
    const request: VeilRequest = { label };
    veilRequests = [...veilRequests, request];
    publishVeil();
    const timer = window.setTimeout(() => setExpired(true), VEIL_MAX_MS);
    return () => {
      window.clearTimeout(timer);
      veilRequests = veilRequests.filter((item) => item !== request);
      publishVeil();
    };
  }, [covering, label]);

  return covering;
}
