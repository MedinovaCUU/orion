import type { DriEngineLogEntry, DriLogLevel } from '../types/dri.types';

const toneMethod: Record<DriLogLevel, 'info' | 'warn' | 'error' | 'info'> = {
  info: 'info',
  success: 'info',
  warning: 'warn',
  error: 'error',
};

export const createDriLogger = (runId: string, platform: string, sink: DriEngineLogEntry[]) => {
  const push = (
    namespace: string,
    level: DriLogLevel,
    step: string,
    message: string,
    details: Record<string, unknown> = {},
  ) => {
    const entry: DriEngineLogEntry = {
      runId,
      namespace,
      level,
      step,
      message,
      details,
    };
    sink.push(entry);
    const method = toneMethod[level];
    console[method](`${namespace} ${step} · ${message}`, details);
    return entry;
  };

  return {
    info: (scope: string, step: string, message: string, details: Record<string, unknown> = {}) =>
      push(`[DRI][${platform}][${scope}]`, 'info', step, message, details),
    success: (scope: string, step: string, message: string, details: Record<string, unknown> = {}) =>
      push(`[DRI][${platform}][${scope}]`, 'success', step, message, details),
    warn: (scope: string, step: string, message: string, details: Record<string, unknown> = {}) =>
      push(`[DRI][${platform}][${scope}]`, 'warning', step, message, details),
    error: (scope: string, step: string, message: string, details: Record<string, unknown> = {}) =>
      push(`[DRI][${platform}][${scope}]`, 'error', step, message, details),
  };
};
