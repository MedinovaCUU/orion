import useAssignedTicketAlerts from './useAssignedTicketAlerts';
import { assignedAlertEntries } from './ticketAlertAccess';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFalconSlaTone, type FalconTicketSla } from './ticketIntake';
import { getPublicAssetUrl } from './publicAssetUrl';
import './FalconSlaAlerts.css';

export interface FalconSlaAlertEntry {
  id: string;
  asunto: string;
  estado?: string | null;
  numeroSerie?: string | null;
  locationLabel: string;
  sla: FalconTicketSla;
}

interface FalconSlaAlertsProps {
  contextLabel: string;
  entries: FalconSlaAlertEntry[];
}

type FalconAlertThresholdKey = '8h' | '4h' | '1h' | '30m' | '10m' | 'breached';

interface FalconAlertNotification {
  ticketId: string;
  thresholdKey: FalconAlertThresholdKey;
  contextLabel: string;
}

const STORAGE_KEY = 'orion-falcon-sla-thresholds-v1';
const ALERT_SOUND = getPublicAssetUrl('sla-alerts/alarm.mp3');
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

const AUDIO_BY_THRESHOLD: Partial<Record<FalconAlertThresholdKey, string>> = {
  '8h': getPublicAssetUrl('sla-alerts/8horas.mp3'),
  '4h': getPublicAssetUrl('sla-alerts/4horas.mp3'),
  '1h': getPublicAssetUrl('sla-alerts/1hora.mp3'),
  '30m': getPublicAssetUrl('sla-alerts/30min.mp3'),
  '10m': getPublicAssetUrl('sla-alerts/10min.mp3'),
};

// Every clip the component can play. Safari unlocks audio per element, so each
// one has to be started inside a user gesture before it can play on its own.
const AUDIO_SOURCES = Array.from(new Set([ALERT_SOUND, ...Object.values(AUDIO_BY_THRESHOLD)]));

const THRESHOLD_LABELS: Record<FalconAlertThresholdKey, string> = {
  '8h': 'Quedan 8 horas',
  '4h': 'Quedan 4 horas',
  '1h': 'Queda 1 hora',
  '30m': 'Quedan 30 minutos',
  '10m': 'Quedan 10 minutos',
  breached: 'SLA vencido',
};

const THRESHOLD_ACTIONS: Record<FalconAlertThresholdKey, string> = {
  '8h': 'Prepara seguimiento y confirma la ruta de atención.',
  '4h': 'Escala el seguimiento y valida que el cierre no se desvíe.',
  '1h': 'Prioriza este ticket y confirma disponibilidad inmediata.',
  '30m': 'Última ventana operativa antes del incumplimiento.',
  '10m': 'Cierre inminente. Atiende y escala en este momento.',
  breached: 'Incumplimiento activo. Escala de inmediato.',
};

const ALERT_PRIORITY: Record<FalconAlertThresholdKey, number> = {
  breached: 0,
  '10m': 1,
  '30m': 2,
  '1h': 3,
  '4h': 4,
  '8h': 5,
};

const loadStoredThresholds = (userId: string): Record<string, FalconAlertThresholdKey> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_KEY}:${userId}`);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, FalconAlertThresholdKey>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getAlertThreshold = (remainingMs: number): FalconAlertThresholdKey | null => {
  if (remainingMs <= 0) {
    return 'breached';
  }

  if (remainingMs <= TEN_MINUTES_MS) {
    return '10m';
  }

  if (remainingMs <= THIRTY_MINUTES_MS) {
    return '30m';
  }

  if (remainingMs <= ONE_HOUR_MS) {
    return '1h';
  }

  if (remainingMs <= FOUR_HOURS_MS) {
    return '4h';
  }

  if (remainingMs <= EIGHT_HOURS_MS) {
    return '8h';
  }

  return null;
};

const isClosedStatus = (status: string | null | undefined) => (status || '').trim().toLowerCase() === 'cerrado';

const isFullscreenThreshold = (thresholdKey: FalconAlertThresholdKey) =>
  thresholdKey === '30m' || thresholdKey === '10m' || thresholdKey === 'breached';

const formatDueLabel = (dueAtMs: number) =>
  new Date(dueAtMs).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

export default function FalconSlaAlerts(props: FalconSlaAlertsProps) {
  const { userId, ticketIds } = useAssignedTicketAlerts();
  const entries = useMemo(() => assignedAlertEntries(props.entries, ticketIds, userId), [props.entries, ticketIds, userId]);
  return userId && entries.length > 0 ? <AssignedFalconSlaAlerts key={userId} {...props} entries={entries} userId={userId} /> : null;
}

function AssignedFalconSlaAlerts({ contextLabel, entries, userId }: FalconSlaAlertsProps & { userId: string }) {
  const [queue, setQueue] = useState<FalconAlertNotification[]>([]);
  const storedThresholdsRef = useRef<Record<string, FalconAlertThresholdKey>>(loadStoredThresholds(userId));
  // Audio state lives in refs: the parent re-renders every second for the countdown and
  // none of this may restart playback. Every callback below has stable identity.
  const audioUnlockedRef = useRef(false);
  const pendingSoundsRef = useRef<string[]>([]);
  const audioElementsRef = useRef<Partial<Record<string, HTMLAudioElement>>>({});
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSequenceRef = useRef(0);

  const openEntries = useMemo(
    () =>
      entries
        .filter((entry) => !isClosedStatus(entry.estado))
        .sort((left, right) => left.sla.remainingMs - right.sla.remainingMs),
    [entries],
  );

  const entryById = useMemo(() => {
    const map = new Map<string, FalconSlaAlertEntry>();
    openEntries.forEach((entry) => {
      map.set(entry.id, entry);
    });
    return map;
  }, [openEntries]);

  const orderedQueue = useMemo(
    () =>
      [...queue].sort((left, right) => {
        const priorityDelta = ALERT_PRIORITY[left.thresholdKey] - ALERT_PRIORITY[right.thresholdKey];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        const leftRemaining = entryById.get(left.ticketId)?.sla.remainingMs ?? Number.POSITIVE_INFINITY;
        const rightRemaining = entryById.get(right.ticketId)?.sla.remainingMs ?? Number.POSITIVE_INFINITY;
        return leftRemaining - rightRemaining;
      }),
    [entryById, queue],
  );

  // `find` returns the queued object itself, so the active notification keeps its
  // identity across countdown ticks and the playback effect below only runs on real changes.
  const activeNotification = orderedQueue.find(item => entryById.has(item.ticketId)) || null;
  const activeEntry = activeNotification ? entryById.get(activeNotification.ticketId) || null : null;
  const activeTone = activeEntry ? getFalconSlaTone(activeEntry.sla.severity) : null;
  const activeThreshold = activeNotification?.thresholdKey || null;
  const isFullscreen = activeThreshold ? isFullscreenThreshold(activeThreshold) : false;

  const persistThresholds = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(storedThresholdsRef.current));
  }, [userId]);

  const removeNotification = useCallback((notification: FalconAlertNotification) => {
    setQueue((current) =>
      current.filter(
        (item) => item.ticketId !== notification.ticketId || item.thresholdKey !== notification.thresholdKey,
      ),
    );
  }, []);

  const getAudioElement = useCallback((src: string) => {
    const cached = audioElementsRef.current[src];
    if (cached) {
      return cached;
    }

    const audio = new Audio(src);
    audio.preload = 'auto';
    audioElementsRef.current[src] = audio;
    return audio;
  }, []);

  const stopAudioPlayback = useCallback(() => {
    playbackSequenceRef.current += 1;
    currentAudioRef.current = null;
    Object.values(audioElementsRef.current).forEach((audio) => {
      if (!audio) {
        return;
      }

      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    });
  }, []);

  const playSoundSequence = useCallback(
    (sources: string[]) => {
      if (sources.length === 0) {
        return;
      }

      stopAudioPlayback();
      pendingSoundsRef.current = [];
      const sequenceId = playbackSequenceRef.current;

      const playIndex = (index: number) => {
        if (playbackSequenceRef.current !== sequenceId) {
          return;
        }

        if (index >= sources.length) {
          currentAudioRef.current = null;
          return;
        }

        const audio = getAudioElement(sources[index]);
        let settled = false;
        const advance = () => {
          if (settled || playbackSequenceRef.current !== sequenceId) {
            return;
          }

          settled = true;
          audio.onended = null;
          audio.onerror = null;
          playIndex(index + 1);
        };

        currentAudioRef.current = audio;
        audio.muted = false;
        audio.volume = 1;
        audio.currentTime = 0;
        audio.onended = advance;
        audio.onerror = () => {
          console.warn('[FalconSlaAlerts] No se pudo cargar el audio', sources[index]);
          advance();
        };

        audio
          .play()
          .then(() => {
            if (playbackSequenceRef.current === sequenceId) {
              audioUnlockedRef.current = true;
            }
          })
          .catch((error: unknown) => {
            if (playbackSequenceRef.current !== sequenceId) {
              return; // Interrupted by our own stop; nothing to recover.
            }

            if (error instanceof DOMException && error.name === 'NotAllowedError') {
              // No user gesture yet: keep the clips and replay them on the next gesture.
              audioUnlockedRef.current = false;
              pendingSoundsRef.current = sources.slice(index);
              currentAudioRef.current = null;
              return;
            }

            console.warn('[FalconSlaAlerts] No se pudo reproducir el audio', sources[index], error);
            advance();
          });
      };

      playIndex(0);
    },
    [getAudioElement, stopAudioPlayback],
  );

  // Runs synchronously inside a pointer/key event. The pending clip is started here,
  // inside the gesture, and every other clip is started muted so Safari lifts its
  // per-element restriction and later alerts can play without another gesture.
  const unlockAudioOnGesture = useCallback(() => {
    if (audioUnlockedRef.current) {
      return;
    }

    if (pendingSoundsRef.current.length > 0) {
      playSoundSequence(pendingSoundsRef.current);
    }

    AUDIO_SOURCES.forEach((src) => {
      const audio = getAudioElement(src);
      if (audio === currentAudioRef.current || !audio.paused) {
        return;
      }

      audio.muted = true;
      const settle = () => {
        if (audio !== currentAudioRef.current) {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }
      };

      audio
        .play()
        .then(() => {
          audioUnlockedRef.current = true;
          settle();
        })
        .catch(settle);
    });
  }, [getAudioElement, playSoundSequence]);

  useEffect(() => {
    const openIds = new Set(openEntries.map((entry) => entry.id));
    let changed = false;

    Object.keys(storedThresholdsRef.current).forEach((ticketId) => {
      if (!openIds.has(ticketId)) {
        delete storedThresholdsRef.current[ticketId];
        changed = true;
      }
    });

    if (changed) {
      persistThresholds();
    }

    setQueue((current) => {
      const remaining = current.filter((item) => openIds.has(item.ticketId));
      return remaining.length === current.length ? current : remaining;
    });
  }, [openEntries, persistThresholds]);

  useEffect(() => {
    AUDIO_SOURCES.forEach(getAudioElement); // start buffering before the first alert
    const options: AddEventListenerOptions = { passive: true };
    window.addEventListener('pointerdown', unlockAudioOnGesture, options);
    window.addEventListener('touchend', unlockAudioOnGesture, options);
    window.addEventListener('click', unlockAudioOnGesture, options);
    window.addEventListener('keydown', unlockAudioOnGesture);

    return () => {
      window.removeEventListener('pointerdown', unlockAudioOnGesture);
      window.removeEventListener('touchend', unlockAudioOnGesture);
      window.removeEventListener('click', unlockAudioOnGesture);
      window.removeEventListener('keydown', unlockAudioOnGesture);
    };
  }, [getAudioElement, unlockAudioOnGesture]);

  useEffect(() => {
    const nextAlerts: FalconAlertNotification[] = [];

    openEntries.forEach((entry) => {
      const thresholdKey = getAlertThreshold(entry.sla.remainingMs);
      if (!thresholdKey) {
        return;
      }

      if (storedThresholdsRef.current[entry.id] === thresholdKey) {
        return;
      }

      storedThresholdsRef.current[entry.id] = thresholdKey;
      nextAlerts.push({
        ticketId: entry.id,
        thresholdKey,
        contextLabel,
      });
    });

    if (nextAlerts.length === 0) {
      return;
    }

    persistThresholds();
    setQueue((current) => {
      const knownKeys = new Set(current.map((item) => `${item.ticketId}:${item.thresholdKey}`));
      const freshAlerts = nextAlerts.filter((item) => !knownKeys.has(`${item.ticketId}:${item.thresholdKey}`));
      return freshAlerts.length > 0 ? [...current, ...freshAlerts] : current;
    });
  }, [contextLabel, openEntries, persistThresholds]);

  useEffect(() => {
    if (!activeNotification) {
      pendingSoundsRef.current = [];
      stopAudioPlayback();
      return;
    }

    playSoundSequence([AUDIO_BY_THRESHOLD[activeNotification.thresholdKey] || ALERT_SOUND]);

    return () => {
      pendingSoundsRef.current = [];
      stopAudioPlayback();
    };
  }, [activeNotification, playSoundSequence, stopAudioPlayback]);

  useEffect(() => {
    if (!activeNotification || isFullscreen) {
      return;
    }

    const timer = window.setTimeout(() => removeNotification(activeNotification), 9500);
    return () => window.clearTimeout(timer);
  }, [activeNotification, isFullscreen, removeNotification]);

  if (!activeNotification || !activeEntry || !activeTone || !activeThreshold) {
    return null;
  }

  const thresholdLabel = THRESHOLD_LABELS[activeThreshold];
  const actionLabel = THRESHOLD_ACTIONS[activeThreshold];
  const dueLabel = formatDueLabel(activeEntry.sla.dueAtMs);
  const serialLabel = activeEntry.numeroSerie || 'Sin serie';
  const locationLabel = activeEntry.locationLabel || 'Ubicación no identificada';

  return createPortal(
    isFullscreen ? (
      <div className="falcon-sla-overlay" role="alertdialog" aria-modal="true">
        <div
          className="falcon-sla-overlay__card"
          style={{
            borderColor: activeTone.border,
            background: activeTone.overlayBackground,
            color: activeTone.color,
          }}
        >
          <div className="falcon-sla-overlay__eyebrow">
            <span>{activeNotification.contextLabel}</span>
            <span>{thresholdLabel}</span>
          </div>
          <h2>Alerta crítica de ticket Falcon</h2>
          <div className="falcon-sla-overlay__timer">{activeEntry.sla.countdownLabel}</div>
          <div className="falcon-sla-overlay__meta">
            <span>{activeEntry.asunto}</span>
            <span>Serie {serialLabel}</span>
            <span>{locationLabel}</span>
            <span>Vence {dueLabel}</span>
          </div>
          <p className="falcon-sla-overlay__action">{actionLabel}</p>
          <div className="falcon-sla-overlay__footer">
            <span>{activeEntry.sla.scopeLabel}</span>
            <button
              type="button"
              className="falcon-sla-overlay__button"
              onClick={() => removeNotification(activeNotification)}
              style={{
                background: activeTone.buttonBackground,
                borderColor: activeTone.buttonBorder,
                color: activeTone.buttonColor,
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div
        className="falcon-sla-toast"
        role="status"
        style={{
          borderColor: activeTone.border,
          background: activeTone.overlayBackground,
          color: activeTone.color,
        }}
      >
        <div className="falcon-sla-toast__eyebrow">
          <span>{activeNotification.contextLabel}</span>
          <span>{thresholdLabel}</span>
        </div>
        <strong>{activeEntry.asunto}</strong>
        <p>{activeEntry.sla.statusLabel}</p>
        <small>
          Serie {serialLabel} · {locationLabel} · vence {dueLabel}
        </small>
        <div className="falcon-sla-toast__footer">
          <span>{actionLabel}</span>
          <button
            type="button"
            className="falcon-sla-toast__button"
            onClick={() => removeNotification(activeNotification)}
            style={{
              background: activeTone.buttonBackground,
              borderColor: activeTone.buttonBorder,
              color: activeTone.buttonColor,
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    ),
    document.body,
  );
}
