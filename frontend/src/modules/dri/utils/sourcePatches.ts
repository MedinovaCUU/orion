import type { SatReportSummary } from '../../sat-report/satReportTypes';
import type { BplSerialSummary } from '../../equipment-monitoring/bplEvents';
import type { CurrentEquipmentErrorStateRow, EquipmentErrorRow } from '../../equipment-monitoring/monitoringDerivations';
import type { AdvisoryAttachmentRecord, AdvisoryMetadata } from '../../../components/escalatedAdvisoryThread';
import { getReagentDisplayCode, getReagentDisplayName } from '../knowledge/reagentIdentity';
import type {
  DriCatalog,
  DriEquipmentModel,
  DriEvidenceArtifact,
  DriEvidenceArtifactType,
  DriFailurePatternType,
} from '../types/dri.types';
import { buildDriBplProjection } from './bplEvidence';
import { toLocalIsoDate } from './lotDates';
import { assessReagentLots, buildCaseReagentBottles } from './lotIntelligence';
import { classifySatQcResults } from './satQcClassifier';
import type { DriFormPatch, DriPatchFields } from './contextSources';

/**
 * Constructores de parches por fuente. Son puros: reciben datos ya cargados y devuelven el parche
 * (`DriFormPatch`) más notas legibles para la interfaz. La aplicación/reversión vive en contextSources.ts.
 */
export interface DriSourceBuild {
  patch: DriFormPatch;
  notes: string[];
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'sin fecha';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

/** Día local (no el día UTC): una exportación de las 19:00 en México no debe fecharse al día siguiente. */
const toIsoDate = (value: string | null | undefined) => toLocalIsoDate(value) ?? undefined;

const clip = (value: string | null | undefined, max = 700) => {
  const text = (value || '').replace(/\s+\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Deduce el modelo DRI a partir de un texto libre (modelo del equipo, plataforma de la asesoría). */
export const inferEquipmentModel = (value: string | null | undefined): DriEquipmentModel | null => {
  const text = value || '';
  if (/BA[\s-]*400/i.test(text)) return 'BA400';
  if (/BA[\s-]*200/i.test(text)) return 'BA200';
  if (/\bA[\s-]*15\b/i.test(text)) return 'A15';
  return null;
};

export const inferEquipmentModelFromSerial = (serial: string | null | undefined): DriEquipmentModel | null =>
  /^\s*83400/.test(serial || '') ? 'BA400' : null;

/* ------------------------------------------------------------------ SAT */

export const satSourceId = (summary: Pick<SatReportSummary, 'sha256'>) => summary.sha256.slice(0, 12);

export const buildSatFormPatch = (summary: SatReportSummary, catalog: DriCatalog): DriSourceBuild => {
  const id = satSourceId(summary);
  // Los lotes que vienen del código de barras («GLUCOSE R1») describen todas las pruebas del equipo, no la que
  // falla: no se usan para llenar «Lote reactivo»; esa información vive en las botellas del caso.
  const latestLot = (kind: 'reagent' | 'control' | 'calibrator') =>
    [...summary.lots]
      .filter((lot) => lot.kind === kind && !(kind === 'reagent' && / R[12]$/.test(lot.name || '')))
      .sort((left, right) => (right.lastSeenAt || '').localeCompare(left.lastSeenAt || ''))[0];
  const latestReagentLot = latestLot('reagent');
  const latestControlLot = latestLot('control');
  const latestCalibrator = latestLot('calibrator');

  // Los avisos se repiten cientos de veces («Invalid values: SampleID…»): se agrupan por mensaje con su conteo,
  // primero los errores y después los más frecuentes.
  const grouped = new Map<string, { line: string; count: number; error: boolean }>();
  summary.events
    .filter((event) => event.category === 'error' || event.category === 'warning')
    .forEach((event) => {
      const line = `[${event.category.toUpperCase()}${event.code ? ` ${event.code}` : ''}] ${event.message.slice(0, 220)}`;
      const current = grouped.get(line) || { line, count: 0, error: event.category === 'error' };
      current.count += 1;
      grouped.set(line, current);
    });
  const eventLines = [...grouped.values()]
    .sort((left, right) => Number(right.error) - Number(left.error) || right.count - left.count)
    .slice(0, 6)
    .map((entry) => (entry.count > 1 ? `${entry.line} (×${entry.count})` : entry.line));

  const lines = [
    `Cobertura: ${summary.coverage.processedFiles}/${summary.coverage.totalFiles} archivos; ${summary.findings.distinctTests} pruebas; ${summary.findings.distinctLots} lotes.`,
    summary.findings.dateFrom || summary.findings.dateTo
      ? `Ventana: ${toIsoDate(summary.findings.dateFrom) || '?'} a ${toIsoDate(summary.findings.dateTo) || '?'}.`
      : null,
    `Bitácora exportada: ${summary.findings.errorCount} errores · ${summary.findings.warningCount} avisos. Histórico de consumos: ${summary.findings.qcEventCount} controles · ${summary.findings.calibrationEventCount} calibraciones pipeteados.`,
    ...eventLines,
  ].filter((line): line is string => Boolean(line));

  const qc = summary.qcResults?.length ? classifySatQcResults(catalog, summary.qcResults) : null;
  // Lotes en uso: botellas decodificadas del código de barras y ligadas a los hechos del lote (einfo.bio).
  const reagentBottles = buildCaseReagentBottles(summary, catalog, { sinceMonths: 24 });
  const documentedLots = reagentBottles.filter((bottle) => bottle.lotFactsKey).length;
  // La fecha que el parche fija como fecha del caso es la misma con la que se evalúan las alertas de lote.
  const reportDate = toIsoDate(summary.reportGeneratedAt) || toIsoDate(summary.findings.dateTo);
  const lotForm = { reagentBottles, eventDate: reportDate || '', reagentMeasurements: {} };
  const reagentsInUse = new Map<string, { id: string; key: string | null; code: string }>();
  reagentBottles.forEach((bottle) => {
    if (!bottle.reagentId) return;
    const groupKey = bottle.reagentKey || bottle.reagentId;
    if (reagentsInUse.has(groupKey)) return;
    const reagent = catalog.reagents.find((item) => item.id === bottle.reagentId);
    reagentsInUse.set(groupKey, { id: bottle.reagentId, key: bottle.reagentKey || null, code: reagent ? getReagentDisplayCode(reagent) : bottle.reagentId });
  });
  const lotAlerts = reportDate
    ? [...reagentsInUse.values()]
        .flatMap((reagent) => assessReagentLots(lotForm, reagent, 'failed'))
        .flatMap((lot) => lot.findings)
        .filter((finding) => (finding.type === 'expired' && finding.score >= 80) || finding.type === 'lot_change')
        .sort((left, right) => right.score - left.score)
    : [];
  const MAX_LOT_LINES = 6;
  const lotLines = [
    reagentBottles.length
      ? `Lotes vistos en el SAT (24 meses, por prueba y rol): ${reagentBottles.length} · ${documentedLots} con IFU/CoA del lote en einfo.bio.`
      : null,
    ...lotAlerts.slice(0, MAX_LOT_LINES).map((finding) => `[LOTE ${reportDate}] ${finding.explanation}`),
    lotAlerts.length > MAX_LOT_LINES ? `[LOTE ${reportDate}] … y ${lotAlerts.length - MAX_LOT_LINES} alertas de lote más en la ficha de cada reactivo.` : null,
  ].filter((line): line is string => Boolean(line));
  const notes: string[] = [];
  if (reagentBottles.length) {
    notes.push(
      `${documentedLots} de ${reagentBottles.length} lotes vistos en 24 meses tienen ficha de lote (IFU y certificado) de einfo.bio` +
        (lotAlerts.length ? `; ${lotAlerts.length} alertas de lote a la fecha del reporte (${reportDate}).` : '.'),
    );
  }
  if (qc) {
    const lastQc = [...(summary.qcResults || [])].map((result) => result.resultAt).sort().pop() || null;
    notes.push(
      `Controles del equipo: ${qc.matchedCount} evaluados (último ${toIsoDate(lastQc) || 'sin fecha'}) contra el target ± SD de su lote de control en uso (falla más allá de 3 SD); ` +
        `${qc.failedReagentIds.length} fallidos, ${qc.correctReagentIds.length} correctos` +
        (qc.pendingCount ? ` y ${qc.pendingCount} sin reactivo o referencia en DRI.` : '.'),
    );
  } else if (summary.coverage.hasDatabaseBackup) {
    notes.push('Los controles están dentro del respaldo .bak: el servicio de controles los extrae y DRI los aplica en cuanto estén.');
  } else {
    notes.push('Este reporte no trae resultados de control; se incorporan serie, lotes y eventos.');
  }

  const fields: DriPatchFields = {
    equipmentModel: summary.equipmentModel,
    serialNumber: summary.serialNumber,
    eventDate: reportDate,
    reagentLot: latestReagentLot?.lot,
    controlLot: latestControlLot?.lot,
    calibratorLot: latestCalibrator?.lot,
    calibratorName: latestCalibrator?.name,
  };

  const evidenceItem: DriEvidenceArtifact = {
    id: `sat-${id}`,
    type: 'report',
    title: `Reporte SAT · ${summary.serialNumber}`,
    value: `${summary.fileName} · ${summary.findings.distinctTests} pruebas · ${summary.findings.distinctLots} lotes`,
    note: '',
    fileName: summary.fileName,
    capturedAt: summary.reportGeneratedAt,
    // El resumen de la tarjeta reserva espacio para las líneas de lote aunque la bitácora traiga muchos eventos.
    ocrSummary: [...lines.slice(0, Math.max(2, 10 - lotLines.length)), ...lotLines].slice(0, 10),
    sourceStatus: 'validated',
    sourceReference: `SAT ${summary.sha256}`,
    derivedData: { signalPatch: {}, serviceTests: [], observationLines: [...lines, ...lotLines], observedInterferents: [] },
  };

  return {
    patch: {
      sourceKind: 'sat',
      sourceId: id,
      label: `SAT ${summary.serialNumber} · ${formatDateTime(summary.reportGeneratedAt)}`,
      fields,
      fieldMode: 'fill',
      // La fecha del caso siempre viene del reporte: el formulario nunca la tiene vacía (se siembra con hoy).
      forceFields: ['equipmentModel', 'serialNumber', 'eventDate'],
      failedReagentIds: qc?.failedReagentIds || [],
      correctReagentIds: qc?.correctReagentIds || [],
      reagentMeasurements: qc?.reagentMeasurements || {},
      // El SAT es dueño de las botellas del caso: un reporte sin códigos de barras vacía las de una demo o fixture.
      reagentBottles,
      observationBlock: { tag: 'SAT', text: [summary.fileName, ...lines, ...lotLines].join('\n') },
      evidenceItems: [evidenceItem],
    },
    notes,
  };
};

/* ------------------------------------------------------------------ BPL */

export const bplSourceId = (summary: Pick<BplSerialSummary, 'serial'>) => summary.serial;

export const buildBplFormPatch = (summary: BplSerialSummary, catalog: DriCatalog): DriSourceBuild => {
  const projection = buildDriBplProjection(summary, catalog);
  const observationText = projection.observationBlock.replace(/^\[BPL:[^\]]*\]\s*/, '');
  const fields: DriPatchFields = {
    equipmentModel: inferEquipmentModelFromSerial(projection.evidence.serial) || undefined,
    serialNumber: projection.evidence.serial,
    eventDate: projection.eventDate || undefined,
    eventType: projection.suggestedEventType || undefined,
    failureDirection: projection.suggestedFailureDirection || undefined,
    controlLevel: projection.controlLevel || undefined,
    controlLot: projection.controlLot || undefined,
    calibratorName: projection.calibratorName || undefined,
    calibratorLot: projection.calibratorLot || undefined,
    reagentLot: projection.reagentLot || undefined,
  };
  const notes = [
    `Evidencia BPL: ${projection.evidence.eventCount} eventos, ${projection.failedReagentIds.length} reactivos con rechazo, ${projection.correctReagentIds.length} correctos` +
      (projection.unmatchedTests.length
        ? ` y ${projection.unmatchedTests.length} pruebas sin reactivo equivalente (${projection.unmatchedTests.slice(0, 4).join(', ')}).`
        : '.'),
  ];
  return {
    patch: {
      sourceKind: 'bpl',
      sourceId: bplSourceId(summary),
      label: `BPL ${summary.serial} · ${summary.events.length} eventos`,
      fields,
      fieldMode: 'fill',
      forceFields: ['equipmentModel', 'serialNumber', 'eventDate', 'eventType', 'failureDirection', 'controlLevel'],
      failedReagentIds: projection.failedReagentIds,
      correctReagentIds: projection.correctReagentIds,
      reagentMeasurements: projection.reagentMeasurements,
      signals: projection.signalPatch,
      observationBlock: { tag: 'BPL', text: observationText },
      evidenceItems: [projection.evidenceItem],
      bplEvidence: projection.evidence,
    },
    notes,
  };
};

/* ---------------------------------------------------------- Monitoreo */

export interface DriMonitoringEquipment {
  id: string;
  serial: string;
  model: string | null;
  clientName: string | null;
  location: string | null;
  supremoEnabled: boolean;
}

export interface DriMonitoringContext {
  serial: string;
  loadedAt: string;
  equipment: DriMonitoringEquipment | null;
  currentState: CurrentEquipmentErrorStateRow | null;
  recentErrors: EquipmentErrorRow[];
  warnings: string[];
}

const describeError = (error: { codigo_error: string | null; descripcion_error: string | null; seccion_error: string | null }) =>
  [error.codigo_error ? `${error.codigo_error}` : null, error.descripcion_error || 'sin descripción', error.seccion_error ? `(${error.seccion_error})` : null]
    .filter(Boolean)
    .join(' ');

export const buildMonitoringFormPatch = (context: DriMonitoringContext): DriSourceBuild => {
  const state = context.currentState;
  const activeErrors = Array.isArray(state?.errores_activos) ? state!.errores_activos : [];
  const model = inferEquipmentModel(context.equipment?.model) || inferEquipmentModelFromSerial(context.serial);
  const recent = context.recentErrors.slice(0, 12);

  const lines = [
    context.equipment
      ? `Equipo ${context.equipment.model || 'modelo no registrado'} · ${context.equipment.clientName || 'cliente no registrado'}${context.equipment.location ? ` · ${context.equipment.location}` : ''}`
      : 'Equipo sin registro maestro en Monitoreo.',
    state
      ? `Estado actual: ${state.estado_actual || 'desconocido'}${state.descripcion_estado ? ` · ${state.descripcion_estado}` : ''}${state.last_event_at ? ` · ${formatDateTime(state.last_event_at)}` : ''}`
      : 'Sin estado vigente publicado por el monitor.',
    activeErrors.length ? `Alarmas activas (${activeErrors.length}): ${activeErrors.slice(0, 6).map(describeError).join('; ')}` : null,
    recent.length
      ? `Últimos eventos: ${recent.map((error) => `${describeError(error)} · ${formatDateTime(error.detected_at || error.created_at)}`).join('; ')}`
      : null,
  ].filter((line): line is string => Boolean(line));

  const opticalReject = [...activeErrors, ...recent].some((error) =>
    /rechazo.*(opt|ópt|absorb)|optical reject|reject.*optic/i.test(`${error.descripcion_error || ''} ${error.seccion_error || ''}`),
  );

  const evidenceItem: DriEvidenceArtifact = {
    id: `monitoring-${context.serial}`,
    type: 'report',
    title: `Monitoreo · ${context.serial}`,
    value: state?.estado_actual ? `Estado ${state.estado_actual} · ${activeErrors.length} alarmas activas` : `${recent.length} eventos recientes`,
    note: '',
    capturedAt: context.loadedAt,
    ocrSummary: lines.slice(0, 6),
    sourceStatus: 'validated',
    sourceReference: `monitoreo · ${context.serial}`,
    derivedData: { signalPatch: opticalReject ? { opticalRejectObserved: true } : {}, serviceTests: [], observationLines: lines, observedInterferents: [] },
  };

  const notes = [
    context.equipment ? `Identidad: ${context.equipment.model || 'modelo no registrado'} de ${context.equipment.clientName || 'cliente no registrado'}.` : 'La serie no está en el maestro de equipos.',
    state ? `${activeErrors.length} alarmas activas · estado ${state.estado_actual || 'desconocido'}.` : 'Sin estado vigente del monitor.',
    ...context.warnings,
  ];

  return {
    patch: {
      sourceKind: 'monitoring',
      sourceId: context.serial,
      label: `Monitoreo ${context.serial}`,
      fields: { equipmentModel: model || undefined, serialNumber: context.serial },
      fieldMode: 'fill',
      forceFields: ['serialNumber', ...(model ? (['equipmentModel'] as const) : [])],
      signals: opticalReject ? { opticalRejectObserved: true } : undefined,
      observationBlock: { tag: 'MON', text: lines.join('\n') },
      evidenceItems: [evidenceItem],
    },
    notes,
  };
};

/* ----------------------------------------------------------- Asesoría */

export interface DriAdvisoryTicket {
  id: string;
  asunto: string;
  descripcion: string | null;
  estado: string;
  creado_en: string;
  numero_serie_equipo: string | null;
  nombre_cliente_guest: string | null;
}

export interface DriAdvisoryCase {
  id: string;
  ticketId: string | null;
  requesterName: string;
  platform: string | null;
  area: string;
  status: string;
  activity: string | null;
  failure: string | null;
  failureDetail: string | null;
  stepsTaken: string | null;
  adjustments: string | null;
  actionsTaken: string | null;
  escalatedQuery: string;
  trainerAnswer: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: AdvisoryMetadata | null;
  ticket: DriAdvisoryTicket | null;
  /** Modelo y cliente del maestro de equipos, cuando la serie del ticket existe ahí. */
  equipmentModel: string | null;
  clientName: string | null;
}

const ATTACHMENT_TYPE: Record<AdvisoryAttachmentRecord['kind'], DriEvidenceArtifactType> = {
  photo: 'photo',
  report: 'report',
  service_test: 'service_note',
  video: 'report',
};

const CHEMISTRY_EVENT_TYPE: Record<string, DriFailurePatternType> = {
  control: 'qc_out_of_range',
  calibrador: 'failed_calibration',
  blanco: 'failed_blank',
  muestra: 'incoherent_result',
};

export const collectAdvisoryAttachments = (metadata: AdvisoryMetadata | null | undefined): AdvisoryAttachmentRecord[] =>
  (metadata?.thread || []).flatMap((message) => (Array.isArray(message.attachments) ? message.attachments : []));

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Detecta reactivos del catálogo mencionados en texto libre: códigos de ≥3 letras como palabra completa
 * o nombres de ≥5 caracteres. Devuelve ids del catálogo, sin duplicados, en orden de aparición.
 */
export const detectReagentsInText = (catalog: DriCatalog, text: string, max = 24) => {
  const haystack = ` ${text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()} `;
  if (!haystack.trim()) return [];
  const hits: Array<{ id: string; index: number }> = [];
  const seen = new Set<string>();
  catalog.reagents.forEach((reagent) => {
    const metadata = (reagent.metadata || {}) as Record<string, unknown>;
    if (metadata.syntheticFromContext) return;
    const code = getReagentDisplayCode(reagent).trim().toUpperCase();
    const name = getReagentDisplayName(reagent).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    const candidates = [code.length >= 3 ? code : null, name.length >= 5 ? name : null].filter((item): item is string => Boolean(item));
    for (const candidate of candidates) {
      const pattern = new RegExp(`(?<![A-Z0-9])${escapeRegex(candidate)}(?![A-Z0-9])`);
      const match = pattern.exec(haystack);
      if (match && !seen.has(reagent.id)) {
        seen.add(reagent.id);
        hits.push({ id: reagent.id, index: match.index });
        break;
      }
    }
  });
  return hits.sort((left, right) => left.index - right.index).slice(0, max).map((hit) => hit.id);
};

export const buildAdvisoryFormPatch = (advisory: DriAdvisoryCase, catalog: DriCatalog): DriSourceBuild => {
  const serial = advisory.ticket?.numero_serie_equipo?.trim() || '';
  const model = inferEquipmentModel(advisory.platform) || inferEquipmentModel(advisory.equipmentModel) || inferEquipmentModelFromSerial(serial);
  const chemistryGuide = (advisory.metadata?.chemistryGuide || {}) as Record<string, unknown>;
  const material = typeof chemistryGuide.material === 'string' ? chemistryGuide.material : typeof chemistryGuide.materialKey === 'string' ? chemistryGuide.materialKey : null;
  const eventType = material ? CHEMISTRY_EVENT_TYPE[material] : undefined;

  const narrative = [
    advisory.ticket ? `Ticket: ${clip(advisory.ticket.asunto, 160)}${advisory.ticket.numero_serie_equipo ? ` · serie ${advisory.ticket.numero_serie_equipo}` : ''}` : null,
    advisory.failure ? `Avería: ${clip(advisory.failure, 240)}` : null,
    advisory.failureDetail ? `Detalle: ${clip(advisory.failureDetail)}` : null,
    advisory.stepsTaken ? `Pasos seguidos: ${clip(advisory.stepsTaken)}` : null,
    advisory.adjustments ? `Ajustes: ${clip(advisory.adjustments, 400)}` : null,
    advisory.actionsTaken ? `Acciones: ${clip(advisory.actionsTaken, 400)}` : null,
    advisory.escalatedQuery ? `Consulta escalada: ${clip(advisory.escalatedQuery)}` : null,
    advisory.trainerAnswer ? `Respuesta del trainer: ${clip(advisory.trainerAnswer, 500)}` : null,
  ].filter((line): line is string => Boolean(line));

  const searchable = [
    advisory.ticket?.asunto,
    advisory.ticket?.descripcion,
    advisory.failure,
    advisory.failureDetail,
    advisory.stepsTaken,
    advisory.adjustments,
    advisory.actionsTaken,
    advisory.escalatedQuery,
    advisory.trainerAnswer,
    ...collectAdvisoryAttachments(advisory.metadata).flatMap((item) => item.analysis?.summary || []),
  ]
    .filter(Boolean)
    .join('\n');
  const detectedReagents = detectReagentsInText(catalog, searchable);

  const attachments = collectAdvisoryAttachments(advisory.metadata);
  const evidenceItems: DriEvidenceArtifact[] = attachments.map((attachment) => ({
    id: `advisory-${advisory.id}-${attachment.id}`,
    type: ATTACHMENT_TYPE[attachment.kind] || 'report',
    title: attachment.fileName,
    value: attachment.analysis?.summary?.[0] || attachment.fileName,
    note: '',
    fileName: attachment.fileName,
    fileUrl: attachment.publicUrl,
    filePath: attachment.storagePath,
    mimeType: attachment.mimeType,
    capturedAt: attachment.uploadedAt,
    ocrSummary: attachment.analysis?.summary || null,
    ocrText: attachment.analysis?.textExcerpt || null,
    sourceStatus: 'user_captured',
    sourceReference: `Asesoría ${advisory.id}`,
  }));

  const headline = `Asesoría ${advisory.area} · ${advisory.status} · ${advisory.requesterName || 'solicitante no registrado'} · ${formatDateTime(advisory.createdAt)}`;
  evidenceItems.unshift({
    id: `advisory-${advisory.id}`,
    type: 'manual',
    title: `Asesoría · ${advisory.ticket?.asunto ? clip(advisory.ticket.asunto, 80) : advisory.area}`,
    value: clip(advisory.failure || advisory.escalatedQuery, 160),
    note: clip(advisory.trainerAnswer, 240),
    capturedAt: advisory.createdAt,
    sourceStatus: 'user_captured',
    sourceReference: `Asesoría ${advisory.id}`,
  });

  const notes = [
    serial ? `Serie ${serial}${model ? ` · ${model}` : ''}.` : 'La asesoría no trae serie de equipo; captúrala manualmente.',
    detectedReagents.length ? `${detectedReagents.length} reactivos mencionados se marcan como fallidos: revisa la selección.` : 'No se reconocieron reactivos en el texto; selecciona las pruebas fallidas manualmente.',
    attachments.length ? `${attachments.length} adjunto(s) incorporados como evidencia.` : 'Sin adjuntos en el hilo.',
  ];

  return {
    patch: {
      sourceKind: 'advisory',
      sourceId: advisory.id,
      label: `Asesoría ${advisory.ticket?.asunto ? clip(advisory.ticket.asunto, 48) : advisory.area}`,
      fields: {
        serialNumber: serial || undefined,
        equipmentModel: model || undefined,
        eventDate: toIsoDate(advisory.createdAt),
        eventType,
      },
      fieldMode: 'fill',
      forceFields: [...(serial ? (['serialNumber'] as const) : []), ...(model ? (['equipmentModel'] as const) : [])],
      failedReagentIds: detectedReagents,
      observationBlock: { tag: 'ASE', text: [headline, ...narrative].join('\n') },
      evidenceItems,
    },
    notes,
  };
};
