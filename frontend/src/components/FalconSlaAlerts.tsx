import { createPortal } from 'react-dom';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
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

interface SafeBeepStep {
  delayMs: number;
  durationMs: number;
  frequency: number;
  gain: number;
}

interface ActiveOscillator {
  oscillator: OscillatorNode;
  gainNode: GainNode;
}

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

const SAFE_BEEP_PATTERNS: Record<FalconAlertThresholdKey, SafeBeepStep[]> = {
  '8h': [{ delayMs: 0, durationMs: 180, frequency: 698, gain: 0.05 }],
  '4h': [
    { delayMs: 0, durationMs: 180, frequency: 740, gain: 0.055 },
    { delayMs: 260, durationMs: 180, frequency: 740, gain: 0.055 },
  ],
  '1h': [
    { delayMs: 0, durationMs: 170, frequency: 784, gain: 0.06 },
    { delayMs: 220, durationMs: 170, frequency: 784, gain: 0.06 },
    { delayMs: 440, durationMs: 220, frequency: 831, gain: 0.065 },
  ],
  '30m': [
    { delayMs: 0, durationMs: 150, frequency: 880, gain: 0.07 },
    { delayMs: 190, durationMs: 150, frequency: 880, gain: 0.07 },
    { delayMs: 380, durationMs: 150, frequency: 932, gain: 0.075 },
    { delayMs: 570, durationMs: 240, frequency: 932, gain: 0.075 },
  ],
  '10m': [
    { delayMs: 0, durationMs: 140, frequency: 988, gain: 0.08 },
    { delayMs: 170, durationMs: 140, frequency: 988, gain: 0.08 },
    { delayMs: 340, durationMs: 140, frequency: 1047, gain: 0.082 },
    { delayMs: 510, durationMs: 140, frequency: 1047, gain: 0.082 },
    { delayMs: 680, durationMs: 300, frequency: 1175, gain: 0.085 },
  ],
  breached: [
    { delayMs: 0, durationMs: 180, frequency: 1175, gain: 0.09 },
    { delayMs: 220, durationMs: 180, frequency: 1319, gain: 0.09 },
    { delayMs: 440, durationMs: 180, frequency: 1175, gain: 0.09 },
    { delayMs: 660, durationMs: 180, frequency: 1319, gain: 0.09 },
    { delayMs: 880, durationMs: 340, frequency: 1397, gain: 0.095 },
  ],
};

const ALERT_PRIORITY: Record<FalconAlertThresholdKey, number> = {
  breached: 0,
  '10m': 1,
  '30m': 2,
  '1h': 3,
  '4h': 4,
  '8h': 5,
};

const loadStoredThresholds = (): Record<string, FalconAlertThresholdKey> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
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

const isLikelySafariWebKit = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const vendor = navigator.vendor || '';
  const isAppleVendor = /Apple/i.test(vendor);
  const isSafariShell = /Safari/i.test(userAgent);
  const hasOtherBrowserToken = /Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|EdgiOS|OPR/i.test(userAgent);
  return isAppleVendor && isSafariShell && !hasOtherBrowserToken;
};

export default function FalconSlaAlerts({ contextLabel, entries }: FalconSlaAlertsProps) {
  const [queue, setQueue] = useState<FalconAlertNotification[]>([]);
  const storedThresholdsRef = useRef<Record<string, FalconAlertThresholdKey>>(loadStoredThresholds());
  const audioUnlockedRef = useRef(false);
  const pendingSoundsRef = useRef<string[]>([]);
  const pendingThresholdRef = useRef<FalconAlertThresholdKey | null>(null);
  const audioElementsRef = useRef<Partial<Record<string, HTMLAudioElement>>>({});
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorTimersRef = useRef<number[]>([]);
  const activeOscillatorsRef = useRef<ActiveOscillator[]>([]);
  const playbackSequenceRef = useRef(0);
  const safeSafariAudioMode = useMemo(() => isLikelySafariWebKit(), []);

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

  const activeNotification = orderedQueue[0] || null;
  const activeEntry = activeNotification ? entryById.get(activeNotification.ticketId) || null : null;
  const activeTone = activeEntry ? getFalconSlaTone(activeEntry.sla.severity) : null;
  const activeThreshold = activeNotification?.thresholdKey || null;
  const isFullscreen = activeThreshold ? isFullscreenThreshold(activeThreshold) : false;
  const persistThresholds = useEffectEvent(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedThresholdsRef.current));
  });

  const dismissActive = useEffectEvent(() => {
    setQueue((current) =>
      activeNotification
        ? current.filter(
          (item) =>
            item.ticketId !== activeNotification.ticketId || item.thresholdKey !== activeNotification.thresholdKey,
        )
        : current,
    );
  });

  const getAudioElement = useEffectEvent((src: string) => {
    const cached = audioElementsRef.current[src];
    if (cached) {
      return cached;
    }

    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = 1;
    audioElementsRef.current[src] = audio;
    return audio;
  });

  const getAudioContext = useEffectEvent(() => {
    if (!safeSafariAudioMode || typeof window === 'undefined') {
      return null;
    }

    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    audioContextRef.current = new AudioContextClass();
    return audioContextRef.current;
  });

  const primeAudioPlayback = useEffectEvent(async () => {
    if (audioUnlockedRef.current) {
      return true;
    }

    if (safeSafariAudioMode) {
      try {
        const audioContext = getAudioContext();
        if (!audioContext) {
          audioUnlockedRef.current = false;
          return false;
        }

        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        audioUnlockedRef.current = audioContext.state === 'running';
        return audioUnlockedRef.current;
      } catch {
        audioUnlockedRef.current = false;
        return false;
      }
    }

    try {
      const audio = getAudioElement(ALERT_SOUND);
      const previousMuted = audio.muted;
      const previousVolume = audio.volume;
      audio.currentTime = 0;
      audio.muted = true;
      audio.volume = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = previousMuted;
      audio.volume = previousVolume;
      audioUnlockedRef.current = true;
      return true;
    } catch {
      audioUnlockedRef.current = false;
      return false;
    }
  });

  const stopAudioPlayback = useEffectEvent(() => {
    playbackSequenceRef.current += 1;
    oscillatorTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    oscillatorTimersRef.current = [];
    activeOscillatorsRef.current.forEach(({ oscillator, gainNode }) => {
      try {
        oscillator.onended = null;
        oscillator.stop();
      } catch {
        // Ignore oscillators that already finished.
      }

      try {
        oscillator.disconnect();
      } catch {
        // Ignore disconnected oscillators.
      }

      try {
        gainNode.disconnect();
      } catch {
        // Ignore disconnected gain nodes.
      }
    });
    activeOscillatorsRef.current = [];

    Object.values(audioElementsRef.current).forEach((audio) => {
      if (!audio) {
        return;
      }

      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
    });
    currentAudioRef.current = null;
  });

  const playSafeBeepPattern = useEffectEvent(async (thresholdKey: FalconAlertThresholdKey) => {
    const audioContext = getAudioContext();
    if (!audioContext) {
      audioUnlockedRef.current = false;
      pendingThresholdRef.current = thresholdKey;
      return;
    }

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        audioUnlockedRef.current = false;
        pendingThresholdRef.current = thresholdKey;
        return;
      }
    }

    if (audioContext.state !== 'running') {
      audioUnlockedRef.current = false;
      pendingThresholdRef.current = thresholdKey;
      return;
    }

    audioUnlockedRef.current = true;
    pendingThresholdRef.current = thresholdKey;
    stopAudioPlayback();

    const sequenceId = playbackSequenceRef.current + 1;
    playbackSequenceRef.current = sequenceId;
    const pattern = SAFE_BEEP_PATTERNS[thresholdKey];
    const finalStep = pattern[pattern.length - 1];
    const clearPendingTimer = window.setTimeout(() => {
      if (playbackSequenceRef.current === sequenceId) {
        pendingThresholdRef.current = null;
      }
    }, finalStep.delayMs + finalStep.durationMs + 120);
    oscillatorTimersRef.current.push(clearPendingTimer);

    pattern.forEach((step) => {
      const timerId = window.setTimeout(() => {
        if (playbackSequenceRef.current !== sequenceId) {
          return;
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const startedAt = audioContext.currentTime;
        const attack = Math.min(step.durationMs / 1000 / 3, 0.02);
        const releaseStart = startedAt + step.durationMs / 1000 - attack;
        oscillator.type = thresholdKey === 'breached' || thresholdKey === '10m' ? 'square' : 'triangle';
        oscillator.frequency.setValueAtTime(step.frequency, startedAt);
        gainNode.gain.setValueAtTime(0.0001, startedAt);
        gainNode.gain.linearRampToValueAtTime(step.gain, startedAt + attack);
        gainNode.gain.setValueAtTime(step.gain, Math.max(startedAt + attack, releaseStart));
        gainNode.gain.linearRampToValueAtTime(0.0001, startedAt + step.durationMs / 1000);
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        activeOscillatorsRef.current.push({ oscillator, gainNode });
        oscillator.onended = () => {
          activeOscillatorsRef.current = activeOscillatorsRef.current.filter((node) => node.oscillator !== oscillator);
          try {
            oscillator.disconnect();
          } catch {
            // Ignore disconnected oscillators.
          }
          try {
            gainNode.disconnect();
          } catch {
            // Ignore disconnected gain nodes.
          }
        };
        oscillator.start(startedAt);
        oscillator.stop(startedAt + step.durationMs / 1000);
      }, step.delayMs);

      oscillatorTimersRef.current.push(timerId);
    });
  });

  const playSoundSequence = useEffectEvent((sources: string[]) => {
    if (sources.length === 0) {
      return;
    }

    pendingSoundsRef.current = [...sources];
    stopAudioPlayback();
    const sequenceId = playbackSequenceRef.current + 1;
    playbackSequenceRef.current = sequenceId;

    const playIndex = (index: number) => {
      if (playbackSequenceRef.current !== sequenceId) {
        return;
      }

      if (index >= sources.length) {
        pendingSoundsRef.current = [];
        audioUnlockedRef.current = true;
        currentAudioRef.current = null;
        return;
      }

      const audio = getAudioElement(sources[index]);
      currentAudioRef.current = audio;
      audio.currentTime = 0;
      audio.onended = () => {
        audio.onended = null;
        audio.onerror = null;
        playIndex(index + 1);
      };
      audio.onerror = () => {
        if (playbackSequenceRef.current !== sequenceId) {
          return;
        }

        audioUnlockedRef.current = false;
        pendingSoundsRef.current = sources.slice(index);
        currentAudioRef.current = null;
      };

      void audio.play().then(() => {
        audioUnlockedRef.current = true;
      }).catch(() => {
        if (playbackSequenceRef.current !== sequenceId) {
          return;
        }

        audioUnlockedRef.current = false;
        pendingSoundsRef.current = sources.slice(index);
        currentAudioRef.current = null;
      });
    };

    playIndex(0);
  });

  const enableAudioAndPlayPending = useEffectEvent(() => {
    if (safeSafariAudioMode) {
      const pendingThreshold = pendingThresholdRef.current;
      if (!pendingThreshold) {
        return;
      }

      void playSafeBeepPattern(pendingThreshold);
      return;
    }

    const currentSounds = pendingSoundsRef.current.length > 0 ? [...pendingSoundsRef.current] : [];
    if (currentSounds.length === 0) {
      return;
    }

    playSoundSequence(currentSounds);
  });

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

    setQueue((current) => current.filter((item) => openIds.has(item.ticketId)));
  }, [openEntries, persistThresholds]);

  useEffect(() => {
    const handleInteraction = () => {
      void primeAudioPlayback().then((primed) => {
        if (primed && pendingSoundsRef.current.length > 0) {
          enableAudioAndPlayPending();
        }
      });
    };

    window.addEventListener('pointerdown', handleInteraction, { passive: true });
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [enableAudioAndPlayPending, primeAudioPlayback]);

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
      pendingThresholdRef.current = null;
      stopAudioPlayback();
      return;
    }

    if (safeSafariAudioMode) {
      pendingThresholdRef.current = activeNotification.thresholdKey;
      void playSafeBeepPattern(activeNotification.thresholdKey);

      return () => {
        pendingThresholdRef.current = null;
        stopAudioPlayback();
      };
    }

    const audioToPlay = AUDIO_BY_THRESHOLD[activeNotification.thresholdKey] || ALERT_SOUND;
    pendingSoundsRef.current = [audioToPlay];
    playSoundSequence([audioToPlay]);

    return () => {
      pendingSoundsRef.current = [];
      stopAudioPlayback();
    };
  }, [activeNotification, playSafeBeepPattern, playSoundSequence, safeSafariAudioMode, stopAudioPlayback]);

  useEffect(() => {
    if (!activeNotification || isFullscreen) {
      return;
    }

    const timer = window.setTimeout(() => dismissActive(), 9500);
    return () => window.clearTimeout(timer);
  }, [activeNotification, dismissActive, isFullscreen]);

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
            background: `linear-gradient(180deg, ${activeTone.background}, var(--bg-card-strong))`,
            boxShadow: 'var(--surface-shadow-strong)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          <div className="falcon-sla-overlay__eyebrow" style={{ color: 'var(--text-tertiary)' }}>
            <span>{activeNotification.contextLabel}</span>
            <span style={{ color: activeTone.color, fontWeight: 600 }}>{thresholdLabel}</span>
          </div>
          <h2 style={{ color: 'var(--text-primary)' }}>Alerta crítica de ticket Falcon</h2>
          <div className="falcon-sla-overlay__timer" style={{ color: activeTone.color }}>{activeEntry.sla.countdownLabel}</div>
          <div className="falcon-sla-overlay__meta" style={{ color: 'var(--text-secondary)' }}>
            <span>{activeEntry.asunto}</span>
            <span>Serie {serialLabel}</span>
            <span>{locationLabel}</span>
            <span>Vence {dueLabel}</span>
          </div>
          <p className="falcon-sla-overlay__action" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{actionLabel}</p>
          <div className="falcon-sla-overlay__footer">
            <span style={{ color: activeTone.color, fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{activeEntry.sla.scopeLabel}</span>
            <button type="button" className="falcon-sla-overlay__button" onClick={dismissActive}>
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
          background: `linear-gradient(180deg, ${activeTone.background}, var(--bg-card-strong))`,
          boxShadow: 'var(--surface-shadow)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
      >
        <div className="falcon-sla-toast__eyebrow" style={{ color: 'var(--text-tertiary)' }}>
          <span>{activeNotification.contextLabel}</span>
          <span style={{ color: activeTone.color, fontWeight: 600 }}>{thresholdLabel}</span>
        </div>
        <strong style={{ color: 'var(--text-primary)' }}>{activeEntry.asunto}</strong>
        <p style={{ color: activeTone.color, fontWeight: 500, fontSize: '0.9rem' }}>{activeEntry.sla.statusLabel}</p>
        <small style={{ color: 'var(--text-secondary)' }}>
          Serie {serialLabel} · {locationLabel} · vence {dueLabel}
        </small>
        <div className="falcon-sla-toast__footer">
          <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{actionLabel}</span>
          <button type="button" className="falcon-sla-toast__button" onClick={dismissActive}>
            Cerrar
          </button>
        </div>
      </div>
    ),
    document.body,
  );
}
