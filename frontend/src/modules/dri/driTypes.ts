export type DriConfidence = 'confirmed' | 'pending' | 'inferred';
export type DriSourceType = 'ifu' | 'ba400_export' | 'manual' | 'internal_validation' | 'user_input';
export type DriEquipmentModel = 'BA400' | 'BA200' | 'A15';
export type DriEventType =
  | 'qc_out_of_range'
  | 'failed_blank'
  | 'failed_calibration'
  | 'anomalous_curve'
  | 'alarm'
  | 'incoherent_result';
export type DriFailureDirection =
  | 'high'
  | 'low'
  | 'unstable'
  | 'high_absorbance'
  | 'low_absorbance'
  | 'no_reaction';
export type DriOutcomeType = 'failed' | 'correct';
export type DriHypothesisStatus = 'generated' | 'reviewed' | 'discarded' | 'confirmed';
export type DriLogLevel = 'info' | 'warning' | 'success';
export type DriNodeType = 'failed_reagent' | 'correct_reagent' | 'factor';

export interface DriReagent {
  id: string;
  name: string;
  calibrationMode: string | null;
  readMode: string | null;
  primaryWavelengthNm: number | null;
  referenceWavelengthNm: number | null;
  reportedMethod: string | null;
  reagentType: string | null;
  operationalNote: string | null;
  preliminaryRisk: string | null;
  sourceStatus: string | null;
  confidence: DriConfidence;
  sourceType: DriSourceType;
  sourceReference: string;
}

export interface DriFactor {
  id: string;
  factorType: string;
  label: string;
  valueText: string | null;
  valueNumeric: number | null;
  unit: string | null;
  description: string | null;
  priority: string | null;
  sourceStatus: string | null;
  confidence: DriConfidence;
  sourceType: DriSourceType;
  sourceReference: string;
}

export interface DriFactorLink {
  reagentId: string;
  factorId: string;
  relationType: string;
  weight: number;
  confidence: DriConfidence;
  sourceType: DriSourceType;
  sourceReference: string;
  sourceLabel: string | null;
  note: string | null;
}

export interface DriCatalog {
  reagents: DriReagent[];
  factors: DriFactor[];
  links: DriFactorLink[];
}

export interface DriCaseSignals {
  intermittentPattern: boolean;
  normalCurvesObserved: boolean;
  opticalRejectObserved: boolean;
  waterSensitivePattern: boolean;
}

export interface DriCaseFormState {
  equipmentModel: DriEquipmentModel;
  serialNumber: string;
  eventDate: string;
  eventType: DriEventType;
  failureDirection: DriFailureDirection;
  reagentLot: string;
  controlLot: string;
  calibratorLot: string;
  observations: string;
  failedReagentIds: string[];
  correctReagentIds: string[];
  signals: DriCaseSignals;
}

export interface DriFactorAggregate {
  factorId: string;
  label: string;
  factorType: string;
  priority: string | null;
  failedCount: number;
  correctCount: number;
  failedCoverage: number;
  correctCoverage: number;
  meanLinkWeight: number;
  suspicionScore: number;
  positiveReagents: string[];
  negativeReagents: string[];
  sourceType: DriSourceType;
  sourceReference: string;
}

export interface DriEvidenceRow {
  id: string;
  factorId: string;
  label: string;
  factorType: string;
  failedCoverage: number;
  correctCoverage: number;
  meanLinkWeight: number;
  suspicionScore: number;
  evidenceFor: string;
  evidenceAgainst: string;
}

export interface DriHypothesisResult {
  key: string;
  title: string;
  score: number;
  probabilityLabel: string;
  status: DriHypothesisStatus;
  evidenceFor: string[];
  evidenceAgainst: string[];
  confirmatoryActions: string[];
  supportingFactorIds: string[];
  matchedRuleIds: string[];
  payload: Record<string, unknown>;
}

export interface DriLogEntry {
  runId: string;
  level: DriLogLevel;
  step: string;
  message: string;
  details: Record<string, unknown>;
}

export interface DriEngineResult {
  runId: string;
  factorAggregates: DriFactorAggregate[];
  evidenceRows: DriEvidenceRow[];
  hypotheses: DriHypothesisResult[];
  logs: DriLogEntry[];
}

export interface DriDiagnosticCaseRecord {
  id: string;
  caseCode: string;
  equipmentModel: DriEquipmentModel;
  serialNumber: string;
  eventDate: string;
  eventType: DriEventType;
  failureDirection: DriFailureDirection;
  reagentLot: string | null;
  controlLot: string | null;
  calibratorLot: string | null;
  observations: string | null;
  caseSummary: string | null;
  metadata: Record<string, unknown>;
  status: string;
  createdAt: string;
  items: DriDiagnosticCaseItemRecord[];
  hypotheses: DriHypothesisResult[];
}

export interface DriDiagnosticCaseItemRecord {
  id: string;
  caseId: string;
  reagentId: string;
  outcomeType: DriOutcomeType;
  controlLevel: string | null;
  failureDirection: string | null;
  notes: string | null;
  curveObservation: string | null;
  isIntermittent: boolean;
  metadata: Record<string, unknown>;
}

export interface DriGraphNode {
  id: string;
  label: string;
  subtitle: string;
  type: DriNodeType;
  color: string;
  emphasis: number;
  associationCount: number;
  associationStrength: number;
}

export interface DriGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  color: string;
  weight: number;
  relationType: string;
}

export interface DriPersistedCaseResult {
  caseRecord: DriDiagnosticCaseRecord;
  persistWarning: string | null;
}

export const DRI_EVENT_OPTIONS: Array<{ value: DriEventType; label: string }> = [
  { value: 'qc_out_of_range', label: 'QC fuera de rango' },
  { value: 'failed_blank', label: 'Blanco fallido' },
  { value: 'failed_calibration', label: 'Calibración fallida' },
  { value: 'anomalous_curve', label: 'Curva anómala' },
  { value: 'alarm', label: 'Alarma' },
  { value: 'incoherent_result', label: 'Resultado incoherente' },
];

export const DRI_FAILURE_OPTIONS: Array<{ value: DriFailureDirection; label: string }> = [
  { value: 'high', label: 'Alto' },
  { value: 'low', label: 'Bajo' },
  { value: 'unstable', label: 'Inestable' },
  { value: 'high_absorbance', label: 'Absorbancia alta' },
  { value: 'low_absorbance', label: 'Absorbancia baja' },
  { value: 'no_reaction', label: 'Sin reacción' },
];

export const DRI_EQUIPMENT_OPTIONS: DriEquipmentModel[] = ['BA400', 'BA200', 'A15'];
