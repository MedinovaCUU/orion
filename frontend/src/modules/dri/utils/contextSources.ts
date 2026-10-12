import type {
  DriBplEvidenceSummary,
  DriCaseReagentBottle,
  DriCaseFormState,
  DriCaseSignals,
  DriEvidenceArtifact,
  DriReagentMeasurementInput,
  DriServiceTestInput,
} from '../types/dri.types';

/**
 * Fuentes de contexto del caso DRI. Cada fuente produce un parche (`DriFormPatch`) que se aplica
 * sobre el formulario y devuelve un recibo (`DriPatchReceipt`) con lo que tocó y los valores previos.
 * Quitar la fuente revierte únicamente lo que sigue igual a lo aplicado: una captura manual posterior
 * nunca se pisa al retirar una fuente.
 */
export type DriSourceKind = 'sat' | 'bpl' | 'monitoring' | 'advisory';

export const DRI_SOURCE_LABELS: Record<DriSourceKind, string> = {
  sat: 'Reporte SAT',
  bpl: 'Monitor BPL',
  monitoring: 'Monitoreo',
  advisory: 'Asesoría',
};

/** Campos escalares del formulario que una fuente puede proponer. */
export type DriPatchableField =
  | 'equipmentModel'
  | 'serialNumber'
  | 'eventDate'
  | 'eventType'
  | 'failureDirection'
  | 'reagentLot'
  | 'controlLot'
  | 'calibratorLot'
  | 'calibratorName'
  | 'controlLevel'
  | 'expectedValue'
  | 'obtainedValue'
  | 'reagentExpiryDate'
  | 'reagentOpenedAt'
  | 'ambientTemperatureC';

export type DriPatchFields = Partial<Pick<DriCaseFormState, DriPatchableField>>;

export type DriReagentState = 'failed' | 'correct' | 'none';

export interface DriFormPatch {
  sourceKind: DriSourceKind;
  sourceId: string;
  label: string;
  /** Campos que la fuente propone. Con `fieldMode: 'fill'` solo se escriben los vacíos. */
  fields?: DriPatchFields;
  fieldMode?: 'fill' | 'override';
  /** Campos que siempre se sobrescriben aunque `fieldMode` sea `fill` (identidad del equipo, fechas). */
  forceFields?: DriPatchableField[];
  failedReagentIds?: string[];
  correctReagentIds?: string[];
  /** Si es true, los reactivos no mencionados por la fuente vuelven a "sin estado". */
  replaceReagentSelection?: boolean;
  reagentMeasurements?: Record<string, DriReagentMeasurementInput>;
  signals?: Partial<DriCaseSignals>;
  /** Bloque etiquetado en observaciones: se escribe como `[TAG] texto`. */
  observationBlock?: { tag: string; text: string } | null;
  evidenceItems?: DriEvidenceArtifact[];
  serviceTests?: Array<Omit<DriServiceTestInput, 'id'> & { id?: string }>;
  bplEvidence?: DriBplEvidenceSummary | null;
  reagentBottles?: DriCaseReagentBottle[] | null;
}

export interface DriPatchReceipt {
  sourceKind: DriSourceKind;
  sourceId: string;
  label: string;
  appliedAt: string;
  fields: Array<{ key: DriPatchableField; previous: string; applied: string }>;
  reagentStates: Array<{ reagentId: string; previous: DriReagentState; applied: DriReagentState }>;
  measurements: Array<{ reagentId: string; previous: DriReagentMeasurementInput | null; applied: DriReagentMeasurementInput }>;
  signals: Array<{ key: keyof DriCaseSignals; previous: boolean; applied: boolean }>;
  observationTag: string | null;
  /** Líneas exactas que la fuente escribió en observaciones: al quitar, solo esas se retiran. */
  observationLines: string[];
  evidenceItemIds: string[];
  /** Copia de la evidencia insertada: un ítem editado a mano después no se borra al quitar la fuente. */
  evidenceItems: DriEvidenceArtifact[];
  serviceTestIds: string[];
  bplEvidenceApplied: boolean;
  reagentBottlesApplied: boolean;
  /** Botellas que había antes de aplicar la fuente (p. ej. de un fixture) y firma de las escritas, para restaurarlas al quitarla. */
  previousReagentBottles?: DriCaseReagentBottle[] | null;
  reagentBottlesSignature?: string | null;
  summary: {
    failed: number;
    correct: number;
    measurements: number;
    fields: number;
    evidence: number;
    serviceTests: number;
  };
}

const TAG_LINE = /^\[[A-Z_]+:[^\]]*\]/;

/**
 * Divide las observaciones en bloques. Un bloque etiquetado empieza en una línea `[TAG:...]` y termina
 * en la primera línea en blanco: así una nota manual escrita después (separada por línea en blanco)
 * nunca se borra al retirar la fuente.
 */
const splitObservationBlocks = (observations: string) => {
  const lines = observations.replace(/\r\n/g, '\n').split('\n');
  const blocks: Array<{ tag: string | null; lines: string[] }> = [];
  let current: { tag: string | null; lines: string[] } = { tag: null, lines: [] };
  lines.forEach((line) => {
    const match = line.match(TAG_LINE);
    if (match) {
      blocks.push(current);
      current = { tag: match[0], lines: [line] };
      return;
    }
    if (current.tag && !line.trim()) {
      blocks.push(current);
      current = { tag: null, lines: [] };
      return;
    }
    current.lines.push(line);
  });
  blocks.push(current);
  return blocks;
};

const joinObservationBlocks = (blocks: Array<{ tag: string | null; lines: string[] }>) =>
  blocks
    .map((block) => block.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

/** Busca el bloque cuya etiqueta empieza con `[PREFIX:` (p. ej. `SAT`), sin importar el id. */
const tagMatches = (tag: string | null, tagPrefix: string) => Boolean(tag && tag.startsWith(`[${tagPrefix}:`));

export const readTaggedObservationBlock = (observations: string, tagPrefix: string) =>
  splitObservationBlocks(observations).find((block) => tagMatches(block.tag, tagPrefix))?.lines.join('\n') || null;

/**
 * Reemplaza (o elimina con `null`) el bloque etiquetado `[PREFIX:...]` dentro de las observaciones,
 * conservando el texto manual y los bloques de otras fuentes.
 */
export const replaceTaggedObservationBlock = (observations: string, tagPrefix: string, nextBlock: string | null) => {
  const blocks = splitObservationBlocks(observations || '').filter((block) => !tagMatches(block.tag, tagPrefix));
  if (nextBlock && nextBlock.trim()) {
    const tagLine = nextBlock.trim().split('\n')[0];
    const tag = tagLine.match(TAG_LINE)?.[0] || `[${tagPrefix}:]`;
    blocks.push({ tag, lines: nextBlock.trim().split('\n') });
  }
  return joinObservationBlocks(blocks);
};

export const buildObservationTag = (tagPrefix: string, id: string) => `[${tagPrefix}:${id.replace(/[\]\n]/g, '')}]`;

/**
 * Retira del bloque `[PREFIX:…]` únicamente las líneas que escribió la fuente. Las líneas que el
 * ingeniero añadió dentro del bloque (p. ej. con Enter al final, sin línea en blanco) se conservan
 * como texto manual. Sin `appliedLines` (recibos antiguos) se retira el bloque completo.
 */
export const removeTaggedObservationLines = (observations: string, tagPrefix: string, appliedLines: string[]) => {
  if (!appliedLines.length) return replaceTaggedObservationBlock(observations, tagPrefix, null);
  const blocks = splitObservationBlocks(observations || '');
  const applied = new Set(appliedLines.map((line) => line.trim()));
  const kept = blocks.flatMap((block) => {
    if (!tagMatches(block.tag, tagPrefix)) return [block];
    const manual = block.lines.filter((line) => line.trim() && !applied.has(line.trim()));
    return manual.length ? [{ tag: null, lines: manual }] : [];
  });
  return joinObservationBlocks(kept);
};

/**
 * Al quitar una fuente, los recibos de las demás que guardaban como "valor previo" lo que esa fuente
 * había escrito pasan a apuntar al valor anterior a ella; así ninguna fuente ya retirada resucita.
 */
export const chainReceiptsAfterRemoval = (receipt: DriPatchReceipt, removed: DriPatchReceipt): DriPatchReceipt => {
  const removedFields = new Map(removed.fields.map((field) => [field.key, field]));
  const removedReagents = new Map(removed.reagentStates.map((state) => [state.reagentId, state]));
  return {
    ...receipt,
    fields: receipt.fields.map((field) => {
      const prior = removedFields.get(field.key);
      return prior && prior.applied === field.previous ? { ...field, previous: prior.previous } : field;
    }),
    reagentStates: receipt.reagentStates.map((state) => {
      const prior = removedReagents.get(state.reagentId);
      return prior && prior.applied === state.previous ? { ...state, previous: prior.previous } : state;
    }),
  };
};

const reagentState = (form: DriCaseFormState, reagentId: string): DriReagentState =>
  form.failedReagentIds.includes(reagentId) ? 'failed' : form.correctReagentIds.includes(reagentId) ? 'correct' : 'none';

const setReagentState = (failed: Set<string>, correct: Set<string>, reagentId: string, state: DriReagentState) => {
  failed.delete(reagentId);
  correct.delete(reagentId);
  if (state === 'failed') failed.add(reagentId);
  if (state === 'correct') correct.add(reagentId);
};

const isEmptyField = (value: unknown) => value === '' || value === null || value === undefined;

const measurementFingerprint = (measurement: DriReagentMeasurementInput | null | undefined) =>
  measurement
    ? JSON.stringify({
        o: measurement.obtainedValue,
        b: measurement.blankAbsorbance,
        e: measurement.expectedValue ?? null,
        s: measurement.source,
        r: measurement.sourceResultId ?? null,
        q: measurement.selectedQcReferenceId ?? null,
      })
    : '';

const createId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `dri-${Math.random().toString(36).slice(2)}`);

/** Aplica el parche y devuelve el formulario nuevo más el recibo para revertirlo. */
/** Firma estable de un conjunto de botellas (prueba, rol, lote, caducidad, código de barras). */
const reagentBottlesSignature = (bottles: DriCaseReagentBottle[]) =>
  bottles
    .map((bottle) => `${bottle.testName}|${bottle.reagentRole}|${bottle.lot}|${bottle.expiresAt}|${bottle.barcode}`)
    .sort()
    .join('\n');

export const applyFormPatch = (form: DriCaseFormState, patch: DriFormPatch, now = new Date().toISOString()) => {
  const receipt: DriPatchReceipt = {
    sourceKind: patch.sourceKind,
    sourceId: patch.sourceId,
    label: patch.label,
    appliedAt: now,
    fields: [],
    reagentStates: [],
    measurements: [],
    signals: [],
    observationTag: null,
    observationLines: [],
    evidenceItemIds: [],
    evidenceItems: [],
    serviceTestIds: [],
    bplEvidenceApplied: false,
    reagentBottlesApplied: false,
    summary: { failed: 0, correct: 0, measurements: 0, fields: 0, evidence: 0, serviceTests: 0 },
  };

  let next: DriCaseFormState = { ...form };

  const force = new Set(patch.forceFields || []);
  Object.entries(patch.fields || {}).forEach(([rawKey, rawValue]) => {
    const key = rawKey as DriPatchableField;
    if (rawValue === undefined || rawValue === null) return;
    const applied = String(rawValue);
    if (!applied) return;
    const previous = String(next[key] ?? '');
    const shouldWrite = patch.fieldMode === 'override' || force.has(key) || isEmptyField(previous);
    if (!shouldWrite || previous === applied) return;
    next = { ...next, [key]: rawValue } as DriCaseFormState;
    receipt.fields.push({ key, previous, applied });
  });

  const failed = new Set(next.failedReagentIds);
  const correct = new Set(next.correctReagentIds);
  if (patch.replaceReagentSelection) {
    const mentioned = new Set([...(patch.failedReagentIds || []), ...(patch.correctReagentIds || [])]);
    [...failed, ...correct].forEach((reagentId) => {
      if (mentioned.has(reagentId)) return;
      receipt.reagentStates.push({ reagentId, previous: reagentState(next, reagentId), applied: 'none' });
      setReagentState(failed, correct, reagentId, 'none');
    });
  }
  (patch.failedReagentIds || []).forEach((reagentId) => {
    const previous = reagentState(next, reagentId);
    if (previous === 'failed') return;
    receipt.reagentStates.push({ reagentId, previous, applied: 'failed' });
    setReagentState(failed, correct, reagentId, 'failed');
  });
  (patch.correctReagentIds || []).forEach((reagentId) => {
    if (failed.has(reagentId)) return;
    const previous = reagentState(next, reagentId);
    if (previous === 'correct') return;
    receipt.reagentStates.push({ reagentId, previous, applied: 'correct' });
    setReagentState(failed, correct, reagentId, 'correct');
  });
  next = { ...next, failedReagentIds: Array.from(failed), correctReagentIds: Array.from(correct) };

  if (patch.reagentMeasurements && Object.keys(patch.reagentMeasurements).length) {
    const measurements = { ...next.reagentMeasurements };
    Object.entries(patch.reagentMeasurements).forEach(([reagentId, measurement]) => {
      const previous = measurements[reagentId] || null;
      // Una captura manual con valor no se pisa con un dato importado.
      if (previous && previous.source === 'manual' && previous.obtainedValue) return;
      const applied: DriReagentMeasurementInput = { ...measurement, reagentId, updatedAt: measurement.updatedAt || now };
      measurements[reagentId] = applied;
      receipt.measurements.push({ reagentId, previous, applied });
    });
    next = { ...next, reagentMeasurements: measurements };
  }

  if (patch.signals) {
    const signals = { ...next.signals };
    (Object.keys(patch.signals) as Array<keyof DriCaseSignals>).forEach((key) => {
      const applied = patch.signals?.[key];
      if (typeof applied !== 'boolean' || signals[key] === applied) return;
      receipt.signals.push({ key, previous: signals[key], applied });
      signals[key] = applied;
    });
    next = { ...next, signals };
  }

  if (patch.observationBlock) {
    const tagPrefix = patch.observationBlock.tag;
    const tag = buildObservationTag(tagPrefix, patch.sourceId);
    const block = `${tag} ${patch.observationBlock.text.replace(/\r\n/g, '\n')}`.trim();
    next = { ...next, observations: replaceTaggedObservationBlock(next.observations, tagPrefix, block) };
    receipt.observationTag = tagPrefix;
    receipt.observationLines = block.split('\n');
  }

  if (patch.evidenceItems?.length) {
    const incomingIds = new Set(patch.evidenceItems.map((item) => item.id));
    next = {
      ...next,
      evidenceItems: [...next.evidenceItems.filter((item) => !incomingIds.has(item.id)), ...patch.evidenceItems],
    };
    receipt.evidenceItemIds = Array.from(incomingIds);
    receipt.evidenceItems = patch.evidenceItems.map((item) => ({ ...item }));
  }

  if (patch.serviceTests?.length) {
    const tests = [...next.serviceTests];
    patch.serviceTests.forEach((incoming) => {
      const existing = tests.find((test) => test.utilityId === incoming.utilityId);
      if (existing) return; // una prueba ya capturada manda sobre la importada
      const id = incoming.id || createId();
      tests.push({ ...incoming, id });
      receipt.serviceTestIds.push(id);
    });
    next = { ...next, serviceTests: tests };
  }

  if (patch.bplEvidence !== undefined && patch.bplEvidence !== null) {
    next = { ...next, bplEvidence: patch.bplEvidence };
    receipt.bplEvidenceApplied = true;
  }

  // Cualquier arreglo (aun vacío) es autoritativo: la fuente sustituye las botellas del caso y las devuelve al quitarse.
  if (Array.isArray(patch.reagentBottles)) {
    const bottles = patch.reagentBottles.map((bottle) => ({ ...bottle }));
    receipt.previousReagentBottles = form.reagentBottles?.length ? form.reagentBottles.map((bottle) => ({ ...bottle })) : null;
    receipt.reagentBottlesSignature = reagentBottlesSignature(bottles);
    next = { ...next, reagentBottles: bottles.length ? bottles : null };
    receipt.reagentBottlesApplied = Boolean(bottles.length || receipt.previousReagentBottles);
  }

  receipt.summary = {
    failed: receipt.reagentStates.filter((item) => item.applied === 'failed').length,
    correct: receipt.reagentStates.filter((item) => item.applied === 'correct').length,
    measurements: receipt.measurements.length,
    fields: receipt.fields.length,
    evidence: receipt.evidenceItemIds.length,
    serviceTests: receipt.serviceTestIds.length,
  };

  return { form: next, receipt };
};

/** Revierte un recibo: solo restaura lo que sigue exactamente como lo dejó la fuente. */
export const revertFormPatch = (form: DriCaseFormState, receipt: DriPatchReceipt): DriCaseFormState => {
  let next: DriCaseFormState = { ...form };

  receipt.fields.forEach(({ key, previous, applied }) => {
    if (String(next[key] ?? '') !== applied) return;
    next = { ...next, [key]: previous } as DriCaseFormState;
  });

  const failed = new Set(next.failedReagentIds);
  const correct = new Set(next.correctReagentIds);
  receipt.reagentStates.forEach(({ reagentId, previous, applied }) => {
    if (reagentState(next, reagentId) !== applied) return;
    setReagentState(failed, correct, reagentId, previous);
  });
  next = { ...next, failedReagentIds: Array.from(failed), correctReagentIds: Array.from(correct) };

  if (receipt.measurements.length) {
    const measurements = { ...next.reagentMeasurements };
    receipt.measurements.forEach(({ reagentId, previous, applied }) => {
      if (measurementFingerprint(measurements[reagentId]) !== measurementFingerprint(applied)) return;
      if (previous) measurements[reagentId] = previous;
      else delete measurements[reagentId];
    });
    next = { ...next, reagentMeasurements: measurements };
  }

  if (receipt.signals.length) {
    const signals = { ...next.signals };
    receipt.signals.forEach(({ key, previous, applied }) => {
      if (signals[key] !== applied) return;
      signals[key] = previous;
    });
    next = { ...next, signals };
  }

  if (receipt.observationTag) {
    next = { ...next, observations: removeTaggedObservationLines(next.observations, receipt.observationTag, receipt.observationLines) };
  }

  if (receipt.evidenceItemIds.length) {
    const inserted = new Map(receipt.evidenceItems.map((item) => [item.id, item]));
    const ids = new Set(receipt.evidenceItemIds);
    next = {
      ...next,
      evidenceItems: next.evidenceItems.filter((item) => {
        if (!ids.has(item.id)) return true;
        const original = inserted.get(item.id);
        // Un ítem que el ingeniero editó (título, valor o nota) deja de pertenecer a la fuente y se conserva.
        if (original && (original.title !== item.title || original.value !== item.value || original.note !== item.note)) return true;
        return false;
      }),
    };
  }

  if (receipt.serviceTestIds.length) {
    const ids = new Set(receipt.serviceTestIds);
    next = { ...next, serviceTests: next.serviceTests.filter((test) => !ids.has(test.id)) };
  }

  if (receipt.bplEvidenceApplied) {
    next = { ...next, bplEvidence: null };
  }

  if (receipt.reagentBottlesApplied) {
    // Solo se retiran las botellas que escribió esta fuente; si otra fuente ya las sustituyó se dejan intactas.
    const current = next.reagentBottles || null;
    const untouched = current ? reagentBottlesSignature(current) === receipt.reagentBottlesSignature : !receipt.reagentBottlesSignature;
    if (untouched) {
      next = { ...next, reagentBottles: receipt.previousReagentBottles?.length ? receipt.previousReagentBottles.map((bottle) => ({ ...bottle })) : null };
    }
  }

  return next;
};

export const describePatchReceipt = (receipt: DriPatchReceipt) => {
  const parts: string[] = [];
  const { summary } = receipt;
  if (summary.failed || summary.correct) parts.push(`${summary.failed} fallidas · ${summary.correct} correctas`);
  if (summary.measurements) parts.push(`${summary.measurements} mediciones`);
  if (summary.fields) parts.push(`${summary.fields} campos`);
  if (summary.evidence) parts.push(`${summary.evidence} evidencia(s)`);
  if (summary.serviceTests) parts.push(`${summary.serviceTests} pruebas de servicio`);
  return `${DRI_SOURCE_LABELS[receipt.sourceKind]} aplicado: ${parts.length ? parts.join(' · ') : 'sin cambios nuevos'}.`;
};
