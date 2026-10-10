import { useSyncExternalStore } from 'react';

/**
 * Estado "en vivo" del monitoreo (refresco en curso, último corte, último aviso Realtime).
 * Vive fuera del árbol de React: solo la lectura en vivo de la franja de mando se suscribe,
 * así un tick de sondeo no vuelve a renderizar el globo ni el visor 3D.
 */
export interface MonitorLiveState {
  refreshing: boolean;
  refreshedAt: string | null;
  lastRealtimeEventAt: string | null;
  /** Avisos Realtime recibidos de ba400_bpl_events: las curvas no entran en el corte y solo así se detectan. */
  bplVersion: number;
}

let state: MonitorLiveState = { refreshing: false, refreshedAt: null, lastRealtimeEventAt: null, bplVersion: 0 };
const listeners = new Set<() => void>();

export const monitorLiveStore = {
  get: () => state,
  publish(patch: Partial<MonitorLiveState>) {
    const next = { ...state, ...patch };
    if (
      next.refreshing === state.refreshing &&
      next.refreshedAt === state.refreshedAt &&
      next.lastRealtimeEventAt === state.lastRealtimeEventAt &&
      next.bplVersion === state.bplVersion
    ) return;
    state = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useMonitorLive = () => useSyncExternalStore(monitorLiveStore.subscribe, monitorLiveStore.get, monitorLiveStore.get);

const getBplVersion = () => state.bplVersion;
/** Solo la versión BPL: quien la lee no se rerenderiza con los ticks de refresco. */
export const useMonitorBplVersion = () => useSyncExternalStore(monitorLiveStore.subscribe, getBplVersion, getBplVersion);
