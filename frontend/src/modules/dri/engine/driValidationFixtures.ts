import { runDifferentialDiagnosisEngine } from './differentialDiagnosisEngine';
import type { DriCatalog, DriCaseFormState, DriValidationFixture } from '../types/dri.types';

const createBaseForm = (): DriCaseFormState => ({
  equipmentModel: 'BA400',
  serialNumber: 'BA400-VALIDATION',
  eventDate: '2026-06-06',
  eventType: 'qc_out_of_range',
  failureDirection: 'high',
  reagentLot: 'PENDIENTE_VALIDACION',
  controlLot: 'PENDIENTE_VALIDACION',
  calibratorLot: 'PENDIENTE_VALIDACION',
  calibratorName: 'PENDIENTE_VALIDACION',
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
  serviceTests: [],
  evidenceItems: [],
  signals: {
    intermittentPattern: false,
    normalCurvesObserved: false,
    opticalRejectObserved: false,
    waterSensitivePattern: false,
  },
});

export const DRI_VALIDATION_FIXTURES: DriValidationFixture[] = [
  {
    id: 'case-1',
    title: '340 nm dominante',
    input: { ...createBaseForm(), failedReagentIds: ['ADA', 'ALT_GPT', 'UREA_UV'], correctReagentIds: ['ALB', 'CHOL'] },
    expectedTopHypothesis: 'óptica',
    expectedRuleIds: ['ba400_optical_photometry'],
  },
  {
    id: 'case-2',
    title: 'Bireactivas fallan y monoreactivas correctas',
    input: { ...createBaseForm(), failedReagentIds: ['AST_GOT', 'CK', 'CREA_ENZ'], correctReagentIds: ['ADA', 'ALB', 'AMY'] },
    expectedTopHypothesis: 'R2',
    expectedRuleIds: ['ba400_r2_dispensing'],
  },
  {
    id: 'case-3',
    title: 'Dilución 1:2 exacta',
    input: { ...createBaseForm(), eventType: 'dilution_error', expectedValue: '400', obtainedValue: '200', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'] },
    expectedTopHypothesis: 'software',
    expectedRuleIds: ['ba400_software_operational'],
  },
  {
    id: 'case-4',
    title: 'Dilución no proporcional',
    input: { ...createBaseForm(), eventType: 'dilution_error', expectedValue: '400', obtainedValue: '118', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'], serviceTests: [{ id: 'svc1', utilityId: 'motors_valves_pumps', label: 'Motors, valves and pumps', result: 'abnormal', observedValue: '', notes: '' }] },
    expectedTopHypothesis: 'pipeteo',
    expectedRuleIds: ['ba400_fluidics_pipetting'],
  },
  {
    id: 'case-5',
    title: 'Enzimáticas sensibles a temperatura',
    input: { ...createBaseForm(), failedReagentIds: ['ADA', 'ALT_GPT', 'AST_GOT'], correctReagentIds: ['ALB', 'CHOL'], ambientTemperatureC: '30', serviceTests: [{ id: 'svc2', utilityId: 'thermostatting', label: 'Thermostatting', result: 'abnormal', observedValue: '', notes: '' }] },
    expectedTopHypothesis: 'termostat',
    expectedRuleIds: ['ba400_temperature'],
  },
  {
    id: 'case-6',
    title: 'Fallas sin patrón técnico fuerte',
    input: { ...createBaseForm(), failedReagentIds: ['ALB', 'TG', 'CHOL', 'BIL_D'], correctReagentIds: ['ADA'], signals: { ...createBaseForm().signals, normalCurvesObserved: true } },
    expectedTopHypothesis: 'control',
    expectedRuleIds: ['ba400_control_preanalytical'],
  },
  {
    id: 'case-7',
    title: 'Correctas e incorrectas comparten subsistema',
    input: { ...createBaseForm(), failedReagentIds: ['ADA', 'UREA_UV'], correctReagentIds: ['ALT_GPT', 'AST_GOT'] },
    expectedTopHypothesis: 'óptica',
    expectedRuleIds: ['ba400_optical_photometry'],
  },
  {
    id: 'case-8',
    title: 'Photometry anormal',
    input: { ...createBaseForm(), failedReagentIds: ['ADA'], correctReagentIds: ['ALB'], serviceTests: [{ id: 'svc3', utilityId: 'photometry', label: 'Photometry', result: 'abnormal', observedValue: '', notes: '' }] },
    expectedTopHypothesis: 'óptica',
    expectedRuleIds: ['ba400_optical_photometry'],
  },
  {
    id: 'case-9',
    title: 'Bombas/válvulas anormal',
    input: { ...createBaseForm(), eventType: 'poor_repeatability', failedReagentIds: ['GLU_HK', 'CREA_ENZ'], correctReagentIds: ['ALB'], serviceTests: [{ id: 'svc4', utilityId: 'motors_valves_pumps', label: 'Motors, valves and pumps', result: 'abnormal', observedValue: '', notes: '' }] },
    expectedTopHypothesis: 'pipeteo',
    expectedRuleIds: ['ba400_fluidics_pipetting'],
  },
  {
    id: 'case-10',
    title: 'Rotor fuera de temperatura',
    input: { ...createBaseForm(), failedReagentIds: ['ADA', 'UREA_UV', 'ALT_GPT'], correctReagentIds: ['ALB'], serviceTests: [{ id: 'svc5', utilityId: 'thermostatting', label: 'Thermostatting', result: 'abnormal', observedValue: 'Rotor fuera de rango', notes: '' }] },
    expectedTopHypothesis: 'termostat',
    expectedRuleIds: ['ba400_temperature'],
  },
];

export const runDriValidationFixtures = (catalog: DriCatalog) =>
  DRI_VALIDATION_FIXTURES.map((fixture) => {
    const result = runDifferentialDiagnosisEngine(fixture.input, catalog);
    const top = result.hypotheses[0];
    return {
      id: fixture.id,
      title: fixture.title,
      passed:
        Boolean(top) &&
        top.title.toLowerCase().includes(fixture.expectedTopHypothesis) &&
        fixture.expectedRuleIds.every((ruleId) => top.matchedRuleIds.includes(ruleId)),
      topHypothesis: top?.title || null,
      topRuleIds: top?.matchedRuleIds || [],
    };
  });
