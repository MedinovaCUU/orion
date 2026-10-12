/**
 * ORION · DRI engine for the Alexa Edge Function.
 *
 * Bundled with rolldown (tools/alexa-engine/build.mjs) into supabase/functions/alexa/engine.bundle.js so the voice
 * assistant runs EXACTLY the same differential engine, lot intelligence, BPL/SAT/Monitoreo source patches and BA400
 * alarm catalog as the web DRI module. Nothing here talks to Supabase: the function loads rows itself (as the
 * linked user) and hands them to these pure builders.
 */
import { runDifferentialDiagnosisEngine } from '../../frontend/src/modules/dri/engine/differentialDiagnosisEngine';
import { withQuietDriLogging } from '../../frontend/src/modules/dri/utils/driLogging';
import { DRI_WORKBOOK_SEED } from '../../frontend/src/modules/dri/driWorkbookSeed.generated';
import {
  enrichCatalogWithReagentIdentity,
  getReagentDisplayName,
  pickRepresentativeReagent,
  reagentSelectionKey,
  type DriAliasContextRow,
  type DriCatalogContextRow,
} from '../../frontend/src/modules/dri/knowledge/reagentIdentity';
import { resolveReagentForTest } from '../../frontend/src/modules/dri/utils/satQcClassifier';
import { findLotFacts, getLotFactsByKey, listLotFacts, lotFactsGeneratedAt } from '../../frontend/src/modules/dri/knowledge/lotFacts';
import {
  buildBplFormPatch,
  buildMonitoringFormPatch,
  buildSatFormPatch,
  inferEquipmentModel,
  inferEquipmentModelFromSerial,
  type DriMonitoringContext,
} from '../../frontend/src/modules/dri/utils/sourcePatches';
import { applyFormPatch } from '../../frontend/src/modules/dri/utils/contextSources';
import { DRI_SUBSYSTEM_LABELS } from '../../frontend/src/modules/dri/knowledge/mechanicalSubsystems';
import { buildBplSerialSummary, normalizeBplEvent, normalizeBplSerial, type BplEvent, type BplEventRow } from '../../frontend/src/modules/equipment-monitoring/bplEvents';
import {
  BA400_ALARM_CATALOG,
  ba400AlarmLocationLabel,
  classifyBa400Alarm,
  normalizeBa400AlarmCode,
} from '../../frontend/src/modules/equipment-monitoring/ba400AlarmMapping';
import type { SatQcResult, SatReportSummary } from '../../frontend/src/modules/sat-report/satReportTypes';
import type { DriCatalog, DriCaseFormState, DriEquipmentModel, DriFactor, DriFactorLink, DriReagent } from '../../frontend/src/modules/dri/types/dri.types';

export {
  runDifferentialDiagnosisEngine,
  withQuietDriLogging,
  getReagentDisplayName,
  pickRepresentativeReagent,
  reagentSelectionKey,
  resolveReagentForTest,
  findLotFacts,
  getLotFactsByKey,
  listLotFacts,
  lotFactsGeneratedAt,
  inferEquipmentModel,
  inferEquipmentModelFromSerial,
  DRI_SUBSYSTEM_LABELS,
  BA400_ALARM_CATALOG,
  ba400AlarmLocationLabel,
  classifyBa400Alarm,
  normalizeBa400AlarmCode,
  normalizeBplSerial,
};

/** Seed catalog (same mapping as driData.ts fallbackCatalog), enriched with reagent identity + IFU context. */
export function seedCatalog(): DriCatalog {
  const base: DriCatalog = {
    reagents: DRI_WORKBOOK_SEED.reagents.map<DriReagent>((row) => ({
      id: row.id,
      name: row.name,
      calibrationMode: row.calibrationMode,
      readMode: row.readMode,
      primaryWavelengthNm: row.primaryWavelengthNm,
      referenceWavelengthNm: row.referenceWavelengthNm,
      reportedMethod: row.reportedMethod,
      reagentType: row.reagentType,
      operationalNote: row.operationalNote,
      preliminaryRisk: row.preliminaryRisk,
      sourceStatus: row.sourceStatus,
      confidence: row.confidence,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
    })),
    factors: DRI_WORKBOOK_SEED.factors.map<DriFactor>((row) => ({
      id: row.id,
      factorType: row.factorType,
      label: row.label,
      valueText: row.valueText,
      valueNumeric: row.valueNumeric,
      unit: row.unit,
      description: row.description,
      priority: row.priority,
      sourceStatus: row.sourceStatus,
      confidence: row.confidence,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
    })),
    links: DRI_WORKBOOK_SEED.factorLinks.map<DriFactorLink>((row) => ({
      reagentId: row.reagentId,
      factorId: row.factorId,
      relationType: row.relationType,
      weight: row.weight ?? 1,
      confidence: row.confidence,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      sourceLabel: row.sourceLabel,
      note: row.note,
    })),
  };
  return enrichCatalogWithReagentIdentity(base, { catalogRows: [], aliasRows: [] });
}

type Row = Record<string, any>;
/** Catalog from the database rows (same mapping as driData.ts loadDriCatalog); falls back to the seed when empty. */
export function catalogFromRows(rows: { reagents: Row[]; factors: Row[]; links: Row[]; catalogRows: Row[]; aliasRows: Row[] }): DriCatalog {
  const context = { catalogRows: rows.catalogRows as DriCatalogContextRow[], aliasRows: rows.aliasRows as DriAliasContextRow[] };
  if (!rows.reagents.length || !rows.factors.length || !rows.links.length) {
    const seed = seedCatalog();
    return context.catalogRows.length || context.aliasRows.length ? enrichCatalogWithReagentIdentity(seed, context) : seed;
  }
  const remote: DriCatalog = {
    reagents: rows.reagents.map((row) => ({
      id: row.id,
      name: row.name,
      calibrationMode: row.calibration_mode,
      readMode: row.read_mode,
      primaryWavelengthNm: row.primary_wavelength_nm,
      referenceWavelengthNm: row.reference_wavelength_nm,
      reportedMethod: row.reported_method,
      reagentType: row.reagent_type,
      operationalNote: row.operational_note,
      preliminaryRisk: row.preliminary_risk,
      sourceStatus: row.source_status,
      confidence: row.confidence,
      sourceType: row.source_type,
      sourceReference: row.source_reference,
      metadata: row.metadata || {},
      referenceCode: row.reference_code ?? null,
      platforms: row.platforms ?? null,
      analyticalFamily: row.analytical_family ?? null,
      reactionKind: row.reaction_kind ?? null,
      reagentScheme: row.reagent_scheme ?? null,
      usesR1: row.uses_r1 ?? null,
      usesR2: row.uses_r2 ?? null,
      sharedR2Group: row.shared_r2_group ?? null,
      mechanicalSubsystems: row.mechanical_subsystems ?? null,
      relatedReagentIds: row.related_reagent_ids ?? null,
      technicalProfile: row.technical_profile ?? row.metadata ?? {},
    })),
    factors: rows.factors.map((row) => ({
      id: row.id,
      factorType: row.factor_type,
      label: row.label,
      valueText: row.value_text,
      valueNumeric: row.value_numeric,
      unit: row.unit,
      description: row.description,
      priority: row.priority,
      sourceStatus: row.source_status,
      confidence: row.confidence,
      sourceType: row.source_type,
      sourceReference: row.source_reference,
      metadata: row.metadata || {},
    })),
    links: rows.links.map((row) => ({
      reagentId: row.reagent_id,
      factorId: row.factor_id,
      relationType: row.relation_type,
      weight: row.weight,
      confidence: row.confidence,
      sourceType: row.source_type,
      sourceReference: row.source_reference,
      sourceLabel: row.source_label,
      note: row.note,
      metadata: row.metadata || {},
    })),
  };
  return enrichCatalogWithReagentIdentity(remote, context);
}

/** Blank case form (what the DRI page starts from). */
export function emptyForm(serial: string, model: DriEquipmentModel | null, eventDate: string): DriCaseFormState {
  return {
    equipmentModel: model ?? 'BA400',
    serialNumber: serial,
    eventDate,
    eventType: 'qc_out_of_range',
    failureDirection: 'high',
    reagentLot: '',
    controlLot: '',
    calibratorLot: '',
    calibratorName: '',
    controlLevel: 'level_1',
    selectedQcReferenceId: '',
    expectedValue: '',
    obtainedValue: '',
    reagentExpiryDate: '',
    reagentOpenedAt: '',
    ambientTemperatureC: '',
    observations: '',
    failedReagentIds: [],
    correctReagentIds: [],
    reagentMeasurements: {},
    serviceTests: [],
    evidenceItems: [],
    signals: { intermittentPattern: false, normalCurvesObserved: false, opticalRejectObserved: false, waterSensitivePattern: false },
  } as DriCaseFormState;
}

/** Same row mapping as satReportData.ts mapQcSnapshotRow (equipment_qc_latest → SatQcResult). */
export function qcResultFromRow(row: Row): SatQcResult {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row.id ? String(row.id) : null,
    serialNumber: String(row.serial_number || ''),
    equipmentModel: String(row.equipment_model || 'BA400') as SatQcResult['equipmentModel'],
    testKey: String(row.test_key || ''),
    testId: num(row.test_id),
    testName: String(row.test_name || ''),
    testShortName: row.test_short_name ? String(row.test_short_name) : null,
    reagentId: row.reagent_id ? String(row.reagent_id) : null,
    controlId: num(row.control_id),
    controlName: row.control_name ? String(row.control_name) : null,
    controlLot: row.control_lot ? String(row.control_lot) : null,
    controlLevel: String(row.control_level || 'unknown') as SatQcResult['controlLevel'],
    resultValue: Number(row.result_value),
    resultAt: String(row.result_at),
    unit: row.unit ? String(row.unit) : null,
    analyzerMin: num(row.analyzer_min),
    analyzerMax: num(row.analyzer_max),
    analyzerTarget: num(row.analyzer_target),
    analyzerSd: num(row.analyzer_sd),
    analyzerValidationStatus: row.analyzer_validation_status ? String(row.analyzer_validation_status) : null,
    sourceType: String(row.source_type || 'sat_report') as SatQcResult['sourceType'],
    sourceImportId: row.source_import_id ? String(row.source_import_id) : null,
  } as SatQcResult;
}

/** BPL rows → per-serial summary (what Monitoreo and DRI build from ba400_bpl_events). */
export function bplSummaryFromRows(serial: string, rows: Row[]) {
  const events = rows.map((row) => normalizeBplEvent(row as BplEventRow)).filter((e): e is BplEvent => Boolean(e));
  return events.length ? buildBplSerialSummary(normalizeBplSerial(serial), events) : null;
}

export interface VoiceCaseSources {
  monitoring?: DriMonitoringContext | null;
  bplRows?: Row[];
  sat?: SatReportSummary | null;
  qcRows?: Row[];
}

/**
 * The "Aplicar todo lo detectado" of the DRI page, server-side: start from a blank form, apply Monitoreo, SAT and
 * BPL patches (each tolerant of missing data), then the reagents the user named by voice. Returns the form plus
 * which sources contributed, so the assistant can say what it used.
 */
export function buildVoiceCase(opts: {
  catalog: DriCatalog;
  serial: string;
  model?: string | null;
  eventDate: string;
  sources: VoiceCaseSources;
  failedTests?: string[];
  correctTests?: string[];
  observations?: string;
}) {
  const model = inferEquipmentModel(opts.model) ?? inferEquipmentModelFromSerial(opts.serial);
  let form = emptyForm(opts.serial, model, opts.eventDate);
  const applied: Array<{ kind: string; label: string; failed: number; correct: number; notes: string[] }> = [];
  const apply = (build: { patch: Parameters<typeof applyFormPatch>[1]; notes: string[] }) => {
    const { form: next, receipt } = applyFormPatch(form, build.patch) as unknown as { form: DriCaseFormState; receipt: { summary: { failed: number; correct: number } } };
    form = next;
    applied.push({ kind: build.patch.sourceKind, label: build.patch.label, failed: receipt.summary.failed, correct: receipt.summary.correct, notes: build.notes });
  };
  if (opts.sources.monitoring) apply(buildMonitoringFormPatch(opts.sources.monitoring));
  if (opts.sources.sat) {
    const qc = (opts.sources.qcRows ?? []).map(qcResultFromRow);
    apply(buildSatFormPatch({ ...opts.sources.sat, qcResults: qc.length ? qc : opts.sources.sat.qcResults || [] }, opts.catalog));
  }
  const bpl = opts.sources.bplRows?.length ? bplSummaryFromRows(opts.serial, opts.sources.bplRows) : null;
  if (bpl) apply(buildBplFormPatch(bpl, opts.catalog));
  // What the user said wins over the sources: a named reagent moves to its side.
  const resolve = (name: string) => resolveReagentForTest(opts.catalog, { testName: name, testKey: name, testShortName: name });
  const unresolved: string[] = [];
  const said = (names: string[] | undefined, side: 'failed' | 'correct') => {
    for (const n of names ?? []) {
      const r = resolve(n);
      if (!r) {
        unresolved.push(n);
        continue;
      }
      form = {
        ...form,
        failedReagentIds: side === 'failed' ? [...new Set([...form.failedReagentIds, r.id])] : form.failedReagentIds.filter((id) => id !== r.id),
        correctReagentIds: side === 'correct' ? [...new Set([...form.correctReagentIds, r.id])] : form.correctReagentIds.filter((id) => id !== r.id),
      };
    }
  };
  said(opts.failedTests, 'failed');
  said(opts.correctTests, 'correct');
  if (opts.observations) form = { ...form, observations: [form.observations, `[VOZ] ${opts.observations}`].filter(Boolean).join('\n\n') };
  return { form, applied, unresolved, bpl };
}

export function runVoiceDiagnosis(form: DriCaseFormState, catalog: DriCatalog) {
  return withQuietDriLogging(() => runDifferentialDiagnosisEngine(form, catalog));
}

/** Facts per test (no lot needed): every documented lot of that technique, newest expiry first. */
export function lotFactsForTest(catalog: DriCatalog, test: string) {
  const reagent = resolveReagentForTest(catalog, { testName: test, testKey: test, testShortName: test });
  const key = (reagent ? getReagentDisplayName(reagent) : test).toUpperCase();
  const all = listLotFacts();
  const matches = all.filter((f) => (f.testNames ?? []).some((t) => t.toUpperCase() === test.toUpperCase() || t.toUpperCase() === key) || (f.title ?? '').toUpperCase() === test.toUpperCase());
  return {
    reagent: reagent ? { id: reagent.id, name: getReagentDisplayName(reagent), ifuFacts: (reagent.technicalProfile as Record<string, unknown> | undefined)?.ifuFacts ?? null } : null,
    lots: matches.sort((a, b) => String(b.expiresAt ?? '').localeCompare(String(a.expiresAt ?? ''))),
  };
}
