export type DriConfidence = 'confirmed' | 'pending' | 'inferred';
export type DriSourceType = 'ifu' | 'ba400_export' | 'manual' | 'internal_validation' | 'user_input';
export type DriKnowledgeStatus = 'validated' | 'estimated' | 'pending' | 'user_captured' | 'rule_inferred';
export type DriEquipmentModel = 'BA400' | 'BA200' | 'A15';
export type DriPlatformSupportStatus = 'ready' | 'specializing';
export type DriOutcomeType = 'failed' | 'correct';
export type DriHypothesisStatus = 'generated' | 'reviewed' | 'discarded' | 'confirmed';
export type DriSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DriLogLevel = 'info' | 'warning' | 'success' | 'error';
export type DriNodeType = 'failed_reagent' | 'correct_reagent' | 'factor' | 'ambient_factor';
export type DriControlLevel = 'level_1' | 'level_2' | 'both' | 'not_applicable';
export type DriFailureDirection =
  | 'high'
  | 'low'
  | 'unstable'
  | 'high_absorbance'
  | 'low_absorbance'
  | 'no_reaction';
export type DriFailurePatternType =
  | 'qc_out_of_range'
  | 'control_low'
  | 'control_high'
  | 'failed_blank'
  | 'failed_calibration'
  | 'anomalous_curve'
  | 'alarm'
  | 'incoherent_result'
  | 'non_linear'
  | 'poor_repeatability'
  | 'drift'
  | 'absorbance_error'
  | 'dilution_error'
  | 'intermittent_error';
export type DriReactionKind = 'endpoint' | 'kinetic' | 'turbidimetric' | 'ise' | 'other';
export type DriReagentScheme = 'monoreactive' | 'bireactive' | 'multireactive' | 'variable' | 'unknown';
export type DriInvasivenessLevel =
  | 'no_invasive'
  | 'operational_review'
  | 'service_test'
  | 'maintenance'
  | 'disassembly'
  | 'possible_part';
export type DriEvidenceArtifactType = 'photo' | 'manual' | 'report' | 'service_note';
export type DriServiceTestResult = 'not_run' | 'normal' | 'abnormal' | 'passed' | 'failed' | 'adjusted';
export type DriReagentMeasurementSource = 'manual' | 'auto_import';
export type NumericLike = number | string | null;
export type DriQcReferenceControlLevel = 'level_1' | 'level_2';
export type DriQcBand = 'within_1s' | 'within_2s' | 'near_reject' | 'out_of_reject' | 'non_numeric' | 'missing_reference';

export type DriMechanicalSubsystemId =
  | 'sample_arm'
  | 'reagent_arm_r1'
  | 'reagent_arm_r2'
  | 'reaction_rotor'
  | 'wash_station'
  | 'optical_system'
  | 'fridge'
  | 'level_detection'
  | 'barcode'
  | 'ise'
  | 'clot_sensor'
  | 'fluidics'
  | 'stirrer';

export type DriServiceUtilityId =
  | 'positioning'
  | 'photometry'
  | 'baseline_darkness_current'
  | 'metrology'
  | 'bottle_level'
  | 'motors_valves_pumps'
  | 'thermostatting'
  | 'level_detection'
  | 'barcode'
  | 'ise_module'
  | 'clot_sensor'
  | 'stress_mode'
  | 'conditioning'
  | 'analyzer_information'
  | 'hardware_versions'
  | 'firmware_update'
  | 'historical_reports'
  | 'tas_report'
  | 'preventive_maintenance'
  | 'washing_station'
  | 'dilution_review'
  | 'software_configuration';

export interface DriServiceScriptDefinition {
  id: string;
  actionId: string;
  description: string;
  utilityIds: DriServiceUtilityId[];
  subsystems: DriMechanicalSubsystemId[];
  instructionCodes: string[];
  sourceReference: string;
}

export interface DriKnowledgeField<T> {
  value: T;
  status: DriKnowledgeStatus;
  confidence: DriConfidence;
  sourceType: DriSourceType;
  sourceReference: string;
}

export interface DriReagent {
  id: string;
  name: string;
  displayCode?: string | null;
  displayName?: string | null;
  canonicalNames?: string[] | null;
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
  metadata?: Record<string, unknown>;
  referenceCode?: string | null;
  platforms?: DriEquipmentModel[] | null;
  analyticalFamily?: string | null;
  reactionKind?: DriReactionKind | null;
  reagentScheme?: DriReagentScheme | null;
  usesR1?: boolean | null;
  usesR2?: boolean | null;
  sharedR2Group?: string | null;
  mechanicalSubsystems?: DriMechanicalSubsystemId[] | null;
  relatedReagentIds?: string[] | null;
  technicalProfile?: Record<string, unknown> | null;
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
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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

export interface DriReagentMeasurementInput {
  reagentId: string;
  obtainedValue: string;
  blankAbsorbance: string;
  selectedQcReferenceId?: string | null;
  expectedValue?: string | null;
  unit?: string | null;
  blankUnit?: string | null;
  source: DriReagentMeasurementSource;
  updatedAt: string | null;
}

export interface DriServiceTestInput {
  id: string;
  utilityId: DriServiceUtilityId;
  label: string;
  result: DriServiceTestResult;
  observedValue: string;
  notes: string;
}

export interface DriEvidenceDerivedServiceTest {
  utilityId: DriServiceUtilityId;
  label: string;
  result: DriServiceTestResult;
  notes: string;
}

export interface DriEvidenceObservedInterferent {
  interferent: 'bilirubin' | 'hemolysis' | 'lipemia' | 'ascorbic_acid' | 'other';
  label: string;
  value: number;
  unit: string;
  sourceExcerpt?: string | null;
}

export interface DriEvidenceDerivedData {
  signalPatch: Partial<DriCaseSignals>;
  serviceTests: DriEvidenceDerivedServiceTest[];
  observationLines: string[];
  observedInterferents: DriEvidenceObservedInterferent[];
}

export interface DriEvidenceArtifact {
  id: string;
  type: DriEvidenceArtifactType;
  title: string;
  value: string;
  note: string;
  fileName?: string | null;
  fileBucket?: string | null;
  filePath?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
  capturedAt?: string | null;
  ocrText?: string | null;
  ocrSummary?: string[] | null;
  derivedData?: DriEvidenceDerivedData | null;
  sourceStatus?: DriKnowledgeStatus | null;
  sourceReference?: string | null;
}

export interface DriQcReference {
  id: string;
  reagentId: string;
  reagentDisplayCode?: string | null;
  reagentDisplayName?: string | null;
  productCode: string;
  lot: string | null;
  controlLevel: DriQcReferenceControlLevel;
  analyteName: string;
  methodName: string | null;
  unit: string | null;
  targetValue: number;
  sd1: number;
  sd1Low: number;
  sd1High: number;
  sd2Low: number | null;
  sd2High: number | null;
  rejectLow: number;
  rejectHigh: number;
  traceability: string | null;
  matchConfidence: string | null;
  sourceStatus: DriKnowledgeStatus;
  sourceType: DriSourceType;
  sourceReference: string;
}

export interface DriQcAssessment {
  referenceId: string;
  obtainedValue: number | null;
  delta: number | null;
  zScore: number | null;
  band: DriQcBand;
  explanation: string;
  assumedNeutral?: boolean;
}

export interface DriMeasurementLimit {
  value: number;
  unit: string;
  alternateValue?: number | null;
  alternateUnit?: string | null;
}

export interface DriInterferenceThreshold {
  interferent: string;
  label: string;
  thresholdValue: number;
  unit: string;
  effect: 'may_interfere_above' | 'no_interference_below';
  sourceExcerpt?: string | null;
}

export interface DriCaseFormState {
  equipmentModel: DriEquipmentModel;
  serialNumber: string;
  eventDate: string;
  eventType: DriFailurePatternType;
  failureDirection: DriFailureDirection;
  reagentLot: string;
  controlLot: string;
  calibratorLot: string;
  calibratorName: string;
  controlLevel: DriControlLevel;
  selectedQcReferenceId: string;
  expectedValue: string;
  obtainedValue: string;
  reagentExpiryDate: string;
  reagentOpenedAt: string;
  ambientTemperatureC: string;
  observations: string;
  failedReagentIds: string[];
  correctReagentIds: string[];
  reagentMeasurements: Record<string, DriReagentMeasurementInput>;
  serviceTests: DriServiceTestInput[];
  evidenceItems: DriEvidenceArtifact[];
  signals: DriCaseSignals;
}

export interface DriReagentProfile {
  id: string;
  displayName: string;
  referenceCode: DriKnowledgeField<string | null>;
  platforms: DriKnowledgeField<DriEquipmentModel[]>;
  analyticalFamily: DriKnowledgeField<string | null>;
  reactionKind: DriKnowledgeField<DriReactionKind>;
  reagentScheme: DriKnowledgeField<DriReagentScheme>;
  usesR1: DriKnowledgeField<boolean | null>;
  usesR2: DriKnowledgeField<boolean | null>;
  sharedR2Group: DriKnowledgeField<string | null>;
  primaryWavelengthNm: DriKnowledgeField<number | null>;
  secondaryWavelengthNm: DriKnowledgeField<number | null>;
  temperatureSensitive: DriKnowledgeField<boolean | null>;
  lightSensitive: DriKnowledgeField<boolean | null>;
  contaminationSensitive: DriKnowledgeField<boolean | null>;
  hemolysisSensitive: DriKnowledgeField<boolean | null>;
  lipemiaSensitive: DriKnowledgeField<boolean | null>;
  ictericiaSensitive: DriKnowledgeField<boolean | null>;
  detectionLimit: DriKnowledgeField<DriMeasurementLimit | null>;
  quantificationLimit: DriKnowledgeField<DriMeasurementLimit | null>;
  linearityLimit: DriKnowledgeField<DriMeasurementLimit | null>;
  sampleVolumeUl: DriKnowledgeField<number | null>;
  reagentR1VolumeUl: DriKnowledgeField<number | null>;
  reagentR2VolumeUl: DriKnowledgeField<number | null>;
  totalReactionVolumeUl: DriKnowledgeField<number | null>;
  requiresBlank: DriKnowledgeField<boolean | null>;
  requiresFrequentCalibration: DriKnowledgeField<boolean | null>;
  onboardStabilityHours: DriKnowledgeField<number | null>;
  reconstitutedStabilityHours: DriKnowledgeField<number | null>;
  recommendedPlacement: DriKnowledgeField<string | null>;
  analyticalRange: DriKnowledgeField<string | null>;
  linearity: DriKnowledgeField<string | null>;
  allowsAutoDilution: DriKnowledgeField<boolean | null>;
  dilutionFactors: DriKnowledgeField<string[]>;
  procedureLimitations: DriKnowledgeField<string[]>;
  interferenceThresholds: DriKnowledgeField<DriInterferenceThreshold[]>;
  technicalNotes: DriKnowledgeField<string[]>;
  mechanicalSubsystems: DriKnowledgeField<DriMechanicalSubsystemId[]>;
  relatedReagents: DriKnowledgeField<string[]>;
  legacy: DriReagent;
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

export interface DriRelationSignal {
  id: string;
  category:
    | 'wavelength'
    | 'reaction'
    | 'technique'
    | 'trend'
    | 'scheme'
    | 'r2'
    | 'temperature'
    | 'storage'
    | 'water'
    | 'contamination'
    | 'blank'
    | 'dilution'
    | 'volume'
    | 'subsystem'
    | 'control'
    | 'service';
  label: string;
  failedCoverage: number;
  correctCoverage: number;
  suspicionScore: number;
  relatedReagentIds: string[];
  contrastReagentIds: string[];
  suspectedSubsystems: DriMechanicalSubsystemId[];
  evidenceFor: string[];
  evidenceAgainst: string[];
}

export interface DriEvidenceRow {
  id: string;
  title: string;
  category: string;
  failedCoverage: number;
  correctCoverage: number;
  score: number;
  evidenceFor: string;
  evidenceAgainst: string;
  source: string;
}

export interface DriChecklistStep {
  id: string;
  title: string;
  utilityId: DriServiceUtilityId | null;
  utilityLabel: string | null;
  serviceScriptIds?: string[];
  expectedResult: string;
  interpretation: string;
  onPass: string;
  onFail: string;
}

export interface DriHypothesisResult {
  key: string;
  title: string;
  score: number;
  probabilityScore: number;
  confidenceScore: number;
  severity: DriSeverity;
  probabilityLabel: string;
  status: DriHypothesisStatus;
  suspectedSubsystem: DriMechanicalSubsystemId | 'operational' | 'preanalytical' | 'software' | 'unknown';
  explanation: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  confirmatoryActions: string[];
  correctiveActions: string[];
  recommendedNextTest: string | null;
  serviceUtilities: DriServiceUtilityId[];
  checklist: DriChecklistStep[];
  invasivenessLevel: DriInvasivenessLevel;
  candidateParts: string[];
  warningText: string | null;
  supportingFactorIds: string[];
  matchedRuleIds: string[];
  missingEvidence: string[];
  payload: Record<string, unknown>;
}

export interface DriEngineLogEntry {
  runId: string;
  namespace: string;
  level: DriLogLevel;
  step: string;
  message: string;
  details: Record<string, unknown>;
}

export interface DriEngineResult {
  runId: string;
  platform: DriEquipmentModel;
  factorAggregates: DriFactorAggregate[];
  relationSignals: DriRelationSignal[];
  evidenceRows: DriEvidenceRow[];
  hypotheses: DriHypothesisResult[];
  topSubsystems: Array<{ subsystem: string; score: number }>;
  missingEvidence: string[];
  logs: DriEngineLogEntry[];
  matchedQcReference: DriQcReference | null;
  qcAssessment: DriQcAssessment | null;
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

export interface DriDiagnosticCaseRecord {
  id: string;
  caseCode: string;
  equipmentModel: DriEquipmentModel;
  serialNumber: string;
  eventDate: string;
  eventType: DriFailurePatternType;
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

export interface DriGraphNode {
  id: string;
  label: string;
  subtitle: string;
  type: DriNodeType;
  clusterKey?: string;
  color: string;
  emphasis: number;
  associationCount: number;
  associationStrength: number;
  orbit?: 'failed' | 'correct' | 'core' | 'diagnostic' | 'ambient';
  tier?: number;
}

export interface DriGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  color: string;
  weight: number;
  relationType: string;
  opacity?: number;
  arcBias?: number;
}

export interface DriPersistedCaseResult {
  caseRecord: DriDiagnosticCaseRecord;
  persistWarning: string | null;
}

export interface DriDiagnosticRuleDefinition {
  id: string;
  platform: DriEquipmentModel;
  title: string;
  targetSubsystem: DriMechanicalSubsystemId | 'operational' | 'preanalytical' | 'software' | 'unknown';
  summary: string;
  baseSeverity: DriSeverity;
  checklist: DriChecklistStep[];
  confirmatoryActions: string[];
  correctiveActions: string[];
  serviceUtilities: DriServiceUtilityId[];
  candidateParts: string[];
}

export interface DriPlatformKnowledge {
  model: DriEquipmentModel;
  label: string;
  supportStatus: DriPlatformSupportStatus;
  supportNote: string;
  rules: DriDiagnosticRuleDefinition[];
}

export interface DriValidationFixture {
  id: string;
  title: string;
  input: DriCaseFormState;
  expectedTopHypothesis: string;
  expectedRuleIds: string[];
}

export const DRI_EVENT_OPTIONS: Array<{ value: DriFailurePatternType; label: string }> = [
  { value: 'qc_out_of_range', label: 'QC fuera de rango' },
  { value: 'control_low', label: 'Control bajo' },
  { value: 'control_high', label: 'Control alto' },
  { value: 'failed_blank', label: 'Blanco fallido' },
  { value: 'failed_calibration', label: 'Calibración fallida' },
  { value: 'anomalous_curve', label: 'Curva anómala' },
  { value: 'alarm', label: 'Alarma' },
  { value: 'incoherent_result', label: 'Resultado incoherente' },
  { value: 'non_linear', label: 'No lineal' },
  { value: 'poor_repeatability', label: 'Mala repetibilidad' },
  { value: 'drift', label: 'Drift' },
  { value: 'absorbance_error', label: 'Error de absorbancia' },
  { value: 'dilution_error', label: 'Error de dilución' },
  { value: 'intermittent_error', label: 'Error intermitente' },
];

export const DRI_FAILURE_OPTIONS: Array<{ value: DriFailureDirection; label: string }> = [
  { value: 'high', label: 'Alto' },
  { value: 'low', label: 'Bajo' },
  { value: 'unstable', label: 'Inestable' },
  { value: 'high_absorbance', label: 'Absorbancia alta' },
  { value: 'low_absorbance', label: 'Absorbancia baja' },
  { value: 'no_reaction', label: 'Sin reacción' },
];

export const DRI_EQUIPMENT_OPTIONS: Array<{ value: DriEquipmentModel; label: string; supportStatus: DriPlatformSupportStatus }> = [
  { value: 'BA400', label: 'BA400', supportStatus: 'ready' },
  { value: 'BA200', label: 'BA200', supportStatus: 'specializing' },
  { value: 'A15', label: 'A15', supportStatus: 'specializing' },
];

export const DRI_CONTROL_LEVEL_OPTIONS: Array<{ value: DriControlLevel; label: string }> = [
  { value: 'level_1', label: 'Control nivel I' },
  { value: 'level_2', label: 'Control nivel II' },
  { value: 'both', label: 'Nivel I + II' },
  { value: 'not_applicable', label: 'No aplica' },
];
