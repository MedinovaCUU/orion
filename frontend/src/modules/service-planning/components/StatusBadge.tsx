import type { CSSProperties } from 'react';

import { PRIORITY_LABELS, SERVICE_TYPE_LABELS, SERVICE_TYPE_TONES, STATUS_LABELS, STATUS_TONES } from '../helpers/normalizeService';
import type { ServicePriority, ServiceStatus, ServiceType } from '../types/servicePlanning.types';

interface StatusBadgeProps {
  kind: 'type' | 'status' | 'priority' | 'neutral';
  value: ServiceType | ServiceStatus | ServicePriority | string;
}

export default function StatusBadge({ kind, value }: StatusBadgeProps) {
  if (kind === 'type') {
    const typedValue = value as ServiceType;
    return (
      <span
        className="planning-badge planning-badge--accent"
        style={{
          '--planning-badge-accent': SERVICE_TYPE_TONES[typedValue],
          color: SERVICE_TYPE_TONES[typedValue],
          borderColor: `${SERVICE_TYPE_TONES[typedValue]}42`,
          background: `${SERVICE_TYPE_TONES[typedValue]}10`,
        } as CSSProperties}
      >
        {SERVICE_TYPE_LABELS[typedValue]}
      </span>
    );
  }

  if (kind === 'status') {
    const statusValue = value as ServiceStatus;
    const tone = STATUS_TONES[statusValue];
    return (
      <span
        className="planning-badge"
        style={{
          color: tone.text,
          borderColor: tone.border,
          background: tone.background,
        }}
      >
        {STATUS_LABELS[statusValue]}
      </span>
    );
  }

  if (kind === 'priority') {
    const priorityValue = value as ServicePriority;
    const color =
      priorityValue === 'critica'
        ? '#b4233b'
        : priorityValue === 'alta'
          ? '#9a5d16'
          : priorityValue === 'media'
            ? '#506476'
            : '#6a7887';
    return (
      <span
        className="planning-badge planning-badge--accent"
        style={{
          '--planning-badge-accent': color,
          color,
          borderColor: `${color}40`,
          background: `${color}10`,
        } as CSSProperties}
      >
        {PRIORITY_LABELS[priorityValue]}
      </span>
    );
  }

  return <span className="planning-badge planning-badge--neutral">{value}</span>;
}
