import { supabase } from '../../supabaseClient';
import { DRI_WORKBOOK_SEED } from './driWorkbookSeed.generated';
import type {
  DriCatalog,
  DriCaseFormState,
  DriDiagnosticCaseItemRecord,
  DriDiagnosticCaseRecord,
  DriEngineResult,
  DriFactor,
  DriFactorLink,
  DriPersistedCaseResult,
  DriReagent,
} from './driTypes';

interface DriCatalogLoadResult {
  catalog: DriCatalog;
  sourceLabel: string;
  warning: string | null;
}

const fallbackCatalog: DriCatalog = {
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

const mapCaseRows = (
  caseRows: any[],
  itemRows: any[],
  hypothesisRows: any[],
): DriDiagnosticCaseRecord[] => {
  const itemsByCaseId = new Map<string, DriDiagnosticCaseItemRecord[]>();

  itemRows.forEach((row) => {
    const existing = itemsByCaseId.get(row.case_id) ?? [];
    existing.push({
      id: row.id,
      caseId: row.case_id,
      reagentId: row.reagent_id,
      outcomeType: row.outcome_type,
      controlLevel: row.control_level,
      failureDirection: row.failure_direction,
      notes: row.notes,
      curveObservation: row.curve_observation,
      isIntermittent: row.is_intermittent,
      metadata: row.metadata || {},
    });
    itemsByCaseId.set(row.case_id, existing);
  });

  const hypothesesByCaseId = new Map<string, any[]>();
  hypothesisRows.forEach((row) => {
    const existing = hypothesesByCaseId.get(row.case_id) ?? [];
    existing.push({
      key: row.hypothesis_key,
      title: row.title,
      score: row.score,
      probabilityLabel: row.probability_label,
      status: row.status,
      evidenceFor: row.evidence_for || [],
      evidenceAgainst: row.evidence_against || [],
      confirmatoryActions: row.confirmatory_actions || [],
      supportingFactorIds: row.supporting_factor_ids || [],
      matchedRuleIds: row.matched_rule_ids || [],
      payload: row.payload || {},
    });
    hypothesesByCaseId.set(row.case_id, existing);
  });

  return caseRows.map((row) => ({
    id: row.id,
    caseCode: row.case_code,
    equipmentModel: row.equipment_model,
    serialNumber: row.serial_number,
    eventDate: row.event_date,
    eventType: row.event_type,
    failureDirection: row.failure_direction,
    reagentLot: row.reagent_lot,
    controlLot: row.control_lot,
    calibratorLot: row.calibrator_lot,
    observations: row.observations,
    caseSummary: row.case_summary,
    metadata: row.metadata || {},
    status: row.status,
    createdAt: row.created_at,
    items: (itemsByCaseId.get(row.id) || []).sort((left, right) => left.id.localeCompare(right.id)),
    hypotheses: (hypothesesByCaseId.get(row.id) || []).sort((left, right) => right.score - left.score),
  }));
};

const buildCaseSummary = (form: DriCaseFormState, engineResult: DriEngineResult) => {
  const topHypothesis = engineResult.hypotheses[0];
  if (!topHypothesis) {
    return `${form.failedReagentIds.length} prueba(s) fallida(s) registradas para diagnóstico DRI sin hipótesis dominante.`;
  }

  return `${form.failedReagentIds.length} prueba(s) fallida(s), ${form.correctReagentIds.length} correcta(s). Hipótesis líder: ${topHypothesis.title} (${topHypothesis.probabilityLabel}).`;
};

const buildLocalCaseRecord = (form: DriCaseFormState, engineResult: DriEngineResult): DriDiagnosticCaseRecord => ({
  id: `local-${engineResult.runId}`,
  caseCode: `LOCAL-${engineResult.runId.slice(0, 8).toUpperCase()}`,
  equipmentModel: form.equipmentModel,
  serialNumber: form.serialNumber,
  eventDate: form.eventDate,
  eventType: form.eventType,
  failureDirection: form.failureDirection,
  reagentLot: form.reagentLot || null,
  controlLot: form.controlLot || null,
  calibratorLot: form.calibratorLot || null,
  observations: form.observations || null,
  caseSummary: buildCaseSummary(form, engineResult),
  metadata: {
    signals: form.signals,
    localOnly: true,
  },
  status: 'open',
  createdAt: new Date().toISOString(),
  items: [
    ...form.failedReagentIds.map((reagentId, index) => ({
      id: `local-failed-${reagentId}-${index}`,
      caseId: `local-${engineResult.runId}`,
      reagentId,
      outcomeType: 'failed' as const,
      controlLevel: null,
      failureDirection: form.failureDirection,
      notes: null,
      curveObservation: null,
      isIntermittent: form.signals.intermittentPattern,
      metadata: {},
    })),
    ...form.correctReagentIds.map((reagentId, index) => ({
      id: `local-correct-${reagentId}-${index}`,
      caseId: `local-${engineResult.runId}`,
      reagentId,
      outcomeType: 'correct' as const,
      controlLevel: null,
      failureDirection: null,
      notes: null,
      curveObservation: null,
      isIntermittent: false,
      metadata: {},
    })),
  ],
  hypotheses: engineResult.hypotheses,
});

export async function loadDriCatalog(): Promise<DriCatalogLoadResult> {
  try {
    const [reagentsResponse, factorsResponse, linksResponse] = await Promise.all([
      supabase.from('reagents').select('*').order('name'),
      supabase.from('reagent_factors').select('*').order('factor_type').order('label'),
      supabase.from('reagent_factor_links').select('*').order('reagent_id').order('factor_id'),
    ]);

    if (reagentsResponse.error || factorsResponse.error || linksResponse.error) {
      throw reagentsResponse.error || factorsResponse.error || linksResponse.error;
    }

    if (
      !reagentsResponse.data?.length ||
      !factorsResponse.data?.length ||
      !linksResponse.data?.length
    ) {
      return {
        catalog: fallbackCatalog,
        sourceLabel: 'Seed local del workbook',
        warning: 'DRI está usando seed local porque la base no tiene catálogo cargado todavía.',
      };
    }

    return {
      catalog: {
        reagents: reagentsResponse.data.map((row) => ({
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
        })),
        factors: factorsResponse.data.map((row) => ({
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
        })),
        links: linksResponse.data.map((row) => ({
          reagentId: row.reagent_id,
          factorId: row.factor_id,
          relationType: row.relation_type,
          weight: row.weight,
          confidence: row.confidence,
          sourceType: row.source_type,
          sourceReference: row.source_reference,
          sourceLabel: row.source_label,
          note: row.note,
        })),
      },
      sourceLabel: 'Supabase',
      warning: null,
    };
  } catch (error) {
    console.warn('DRI no pudo cargar catálogo desde Supabase. Usando seed local.', error);
    return {
      catalog: fallbackCatalog,
      sourceLabel: 'Seed local del workbook',
      warning: 'No se pudo leer Supabase; DRI quedó operando con el seed local del workbook.',
    };
  }
}

export async function loadDriHistory(limit = 24): Promise<DriDiagnosticCaseRecord[]> {
  try {
    const casesResponse = await supabase
      .from('diagnostic_cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (casesResponse.error || !casesResponse.data?.length) {
      return [];
    }

    const caseIds = casesResponse.data.map((row) => row.id);

    const [itemsResponse, hypothesesResponse] = await Promise.all([
      supabase.from('diagnostic_case_items').select('*').in('case_id', caseIds),
      supabase.from('diagnostic_hypotheses').select('*').in('case_id', caseIds),
    ]);

    if (itemsResponse.error || hypothesesResponse.error) {
      throw itemsResponse.error || hypothesesResponse.error;
    }

    return mapCaseRows(casesResponse.data, itemsResponse.data || [], hypothesesResponse.data || []);
  } catch (error) {
    console.warn('DRI no pudo cargar historial desde Supabase.', error);
    return [];
  }
}

export async function persistDriCase(
  form: DriCaseFormState,
  engineResult: DriEngineResult,
): Promise<DriPersistedCaseResult> {
  const localFallback = buildLocalCaseRecord(form, engineResult);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const caseInsert = await supabase
      .from('diagnostic_cases')
      .insert({
        equipment_model: form.equipmentModel,
        serial_number: form.serialNumber,
        event_date: form.eventDate,
        event_type: form.eventType,
        failure_direction: form.failureDirection,
        reagent_lot: form.reagentLot || null,
        control_lot: form.controlLot || null,
        calibrator_lot: form.calibratorLot || null,
        observations: form.observations || null,
        case_summary: buildCaseSummary(form, engineResult),
        metadata: {
          signals: form.signals,
        },
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (caseInsert.error || !caseInsert.data) {
      throw caseInsert.error || new Error('No se pudo crear el caso DRI.');
    }

    const caseId = caseInsert.data.id as string;

    const itemsPayload = [
      ...form.failedReagentIds.map((reagentId, index) => ({
        case_id: caseId,
        reagent_id: reagentId,
        outcome_type: 'failed',
        failure_direction: form.failureDirection,
        is_intermittent: form.signals.intermittentPattern,
        position_index: index,
        metadata: {
          source: 'dri_ui',
        },
      })),
      ...form.correctReagentIds.map((reagentId, index) => ({
        case_id: caseId,
        reagent_id: reagentId,
        outcome_type: 'correct',
        failure_direction: null,
        is_intermittent: false,
        position_index: 100 + index,
        metadata: {
          source: 'dri_ui',
        },
      })),
    ];

    const itemsInsert = await supabase.from('diagnostic_case_items').insert(itemsPayload).select('*');

    if (itemsInsert.error || !itemsInsert.data) {
      throw itemsInsert.error || new Error('No se pudieron crear los items del caso DRI.');
    }
    const qcPayload = itemsInsert.data.map((row) => ({
      case_id: caseId,
      case_item_id: row.id,
      reagent_id: row.reagent_id,
      equipment_model: form.equipmentModel,
      serial_number: form.serialNumber,
      event_type: form.eventType,
      event_status: 'observed',
      failure_direction: row.outcome_type === 'failed' ? form.failureDirection : null,
      reagent_lot: form.reagentLot || null,
      control_lot: form.controlLot || null,
      calibrator_lot: form.calibratorLot || null,
      observations: form.observations || null,
      confidence: 'pending',
      source_type: 'user_input',
      source_reference: 'DRI UI',
      raw_payload: {
        outcomeType: row.outcome_type,
      },
      created_by: user?.id ?? null,
    }));

    const qcInsert = await supabase.from('qc_events').insert(qcPayload);
    if (qcInsert.error) {
      throw qcInsert.error;
    }

    const hypothesisInsert = await supabase.from('diagnostic_hypotheses').insert(
      engineResult.hypotheses.map((hypothesis) => ({
        case_id: caseId,
        hypothesis_key: hypothesis.key,
        title: hypothesis.title,
        score: hypothesis.score,
        probability_label: hypothesis.probabilityLabel,
        status: hypothesis.status,
        evidence_for: hypothesis.evidenceFor,
        evidence_against: hypothesis.evidenceAgainst,
        confirmatory_actions: hypothesis.confirmatoryActions,
        supporting_factor_ids: hypothesis.supportingFactorIds,
        matched_rule_ids: hypothesis.matchedRuleIds,
        payload: hypothesis.payload,
      })),
    );

    if (hypothesisInsert.error) {
      throw hypothesisInsert.error;
    }

    const logsInsert = await supabase.from('diagnostic_logs').insert(
      engineResult.logs.map((log) => ({
        case_id: caseId,
        run_id: engineResult.runId,
        log_level: log.level,
        step: log.step,
        message: log.message,
        details: log.details,
        created_by: user?.id ?? null,
      })),
    );

    if (logsInsert.error) {
      throw logsInsert.error;
    }

    return {
      caseRecord: {
        id: caseId,
        caseCode: caseInsert.data.case_code,
        equipmentModel: caseInsert.data.equipment_model,
        serialNumber: caseInsert.data.serial_number,
        eventDate: caseInsert.data.event_date,
        eventType: caseInsert.data.event_type,
        failureDirection: caseInsert.data.failure_direction,
        reagentLot: caseInsert.data.reagent_lot,
        controlLot: caseInsert.data.control_lot,
        calibratorLot: caseInsert.data.calibrator_lot,
        observations: caseInsert.data.observations,
        caseSummary: caseInsert.data.case_summary,
        metadata: caseInsert.data.metadata || {},
        status: caseInsert.data.status,
        createdAt: caseInsert.data.created_at,
        items: itemsInsert.data.map((row) => ({
          id: row.id,
          caseId: row.case_id,
          reagentId: row.reagent_id,
          outcomeType: row.outcome_type,
          controlLevel: row.control_level,
          failureDirection: row.failure_direction,
          notes: row.notes,
          curveObservation: row.curve_observation,
          isIntermittent: row.is_intermittent,
          metadata: row.metadata || {},
        })),
        hypotheses: engineResult.hypotheses,
      },
      persistWarning: null,
    };
  } catch (error) {
    console.warn('DRI no pudo persistir el caso. Se conservará en memoria local.', error);
    return {
      caseRecord: localFallback,
      persistWarning: 'El cálculo se generó correctamente, pero la persistencia en Supabase no se pudo completar.',
    };
  }
}
