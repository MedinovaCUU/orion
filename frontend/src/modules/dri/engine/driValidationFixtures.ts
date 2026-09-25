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
  reagentMeasurements: {},
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
  {
    id: 'case-11',
    title: 'Fuera de linealidad IFU',
    input: {
      ...createBaseForm(),
      eventType: 'incoherent_result',
      failedReagentIds: ['CHOL'],
      correctReagentIds: ['ALB'],
      selectedQcReferenceId: 'CHOL::18005::0004::I::mg/dL::Colesterol oxidasa/peroxidasa',
      obtainedValue: '1100',
      observations: 'Muestra por arriba del rango esperado.',
    },
    expectedTopHypothesis: 'linealidad',
    expectedRuleIds: ['ba400_metrology_range'],
  },
  {
    id: 'case-12',
    title: 'Interferencia por bilirrubina',
    input: {
      ...createBaseForm(),
      eventType: 'incoherent_result',
      failedReagentIds: ['CHOL'],
      correctReagentIds: ['ALB'],
      observations: 'Bilirrubina total 12 mg/dL en la muestra; el sesgo apareció después.',
    },
    expectedTopHypothesis: 'interferencia',
    expectedRuleIds: ['ba400_procedure_limitation_interference'],
  },
  {
    id: 'case-13',
    title: 'Convergencia completa de pruebas R2',
    input: {
      ...createBaseForm(),
      eventType: 'poor_repeatability',
      failedReagentIds: ['GLU_HK', 'CREA_ENZ'],
      correctReagentIds: ['ALB'],
      serviceTests: [
        { id: 'svc-r2-1', utilityId: 'motors_valves_pumps', label: 'Motors, valves and pumps', result: 'abnormal', observedValue: '', notes: '' },
        { id: 'svc-r2-2', utilityId: 'positioning', label: 'Positioning', result: 'failed', observedValue: '', notes: '' },
        { id: 'svc-r2-3', utilityId: 'stress_mode', label: 'Stress mode', result: 'abnormal', observedValue: '', notes: '' },
        { id: 'svc-r2-4', utilityId: 'conditioning', label: 'Conditioning', result: 'abnormal', observedValue: '', notes: '' },
      ],
    },
    expectedTopHypothesis: 'R2',
    expectedRuleIds: ['ba400_r2_dispensing'],
    minimumTopProbability: 90,
  },
  {
    id: 'case-14',
    title: 'Convergencia completa de pruebas ópticas',
    input: {
      ...createBaseForm(),
      eventType: 'absorbance_error',
      failedReagentIds: ['ADA', 'ALT_GPT'],
      correctReagentIds: ['ALB'],
      serviceTests: [
        { id: 'svc-opt-1', utilityId: 'photometry', label: 'Photometry', result: 'abnormal', observedValue: '', notes: '' },
        { id: 'svc-opt-2', utilityId: 'baseline_darkness_current', label: 'Baseline and darkness current', result: 'failed', observedValue: '', notes: '' },
        { id: 'svc-opt-3', utilityId: 'metrology', label: 'Metrology', result: 'abnormal', observedValue: '', notes: '' },
        { id: 'svc-opt-4', utilityId: 'historical_reports', label: 'Historical reports', result: 'abnormal', observedValue: '', notes: '' },
      ],
    },
    expectedTopHypothesis: 'óptica',
    expectedRuleIds: ['ba400_optical_photometry'],
    minimumTopProbability: 90,
  },
  {
    id: 'case-15',
    title: 'Demo BA400 con pruebas de servicio reales',
    input: {
      ...createBaseForm(),
      eventType: 'qc_out_of_range',
      failedReagentIds: ['GLU', 'CHOL', 'LACTATO_DE', 'MG', 'UREA_COLOR'],
      correctReagentIds: ['ALT_GPT', 'AST_GOT', 'ALB', 'ADA', 'URIC'],
      ambientTemperatureC: '27.4',
      observations:
        'Demo BA400: Photometry mostró deriva leve y Washing station dejó duda de arrastre. Curvas mayormente aceptables, sin rechazo óptico continuo.',
      serviceTests: [
        { id: 'svc-demo-1', utilityId: 'photometry', label: 'Photometry', result: 'abnormal', observedValue: 'Deriva 340/505 nm', notes: 'Baseline y repetibilidad con dispersión leve en fotometría.' },
        { id: 'svc-demo-2', utilityId: 'washing_station', label: 'Washing station', result: 'adjusted', observedValue: 'Lavado ajustado', notes: 'Se detectó sospecha de carryover bajo y se corrigió prime.' },
        { id: 'svc-demo-3', utilityId: 'thermostatting', label: 'Thermostatting', result: 'normal', observedValue: '37.0 °C', notes: 'Rotor estable durante corrida de verificación.' },
        { id: 'svc-demo-4', utilityId: 'motors_valves_pumps', label: 'Motors, valves and pumps', result: 'normal', observedValue: 'Sin fuga', notes: 'Pipeteo y válvulas sin anomalía evidente.' },
        { id: 'svc-demo-5', utilityId: 'level_detection', label: 'Level detection', result: 'normal', observedValue: 'OK', notes: 'Detección de nivel consistente en muestra y reactivo.' },
      ],
    },
    expectedTopHypothesis: 'óptica',
    expectedRuleIds: ['ba400_optical_photometry'],
    minimumTopProbability: 85,
    minimumProbabilityByRule: {
      ba400_wash_carryover: 25,
    },
    maximumProbabilityByRule: {
      ba400_r2_dispensing: 60,
      ba400_temperature: 55,
      ba400_fluidics_pipetting: 55,
    },
  },
];

export const runDriValidationFixtures = (catalog: DriCatalog) =>
  DRI_VALIDATION_FIXTURES.map((fixture) => {
    const result = runDifferentialDiagnosisEngine(fixture.input, catalog);
    const top = result.hypotheses[0];
    const probabilityForRule = (ruleId: string) =>
      result.hypotheses.find((hypothesis) => hypothesis.matchedRuleIds.includes(ruleId))?.probabilityScore ?? 0;
    const minimumRulesPassed = Object.entries(fixture.minimumProbabilityByRule || {}).every(
      ([ruleId, minimum]) => probabilityForRule(ruleId) >= minimum,
    );
    const maximumRulesPassed = Object.entries(fixture.maximumProbabilityByRule || {}).every(
      ([ruleId, maximum]) => probabilityForRule(ruleId) <= maximum,
    );
    return {
      id: fixture.id,
      title: fixture.title,
      passed:
        Boolean(top) &&
        top.title.toLowerCase().includes(fixture.expectedTopHypothesis.toLowerCase()) &&
        fixture.expectedRuleIds.every((ruleId) => top.matchedRuleIds.includes(ruleId)) &&
        (fixture.minimumTopProbability === undefined ||
          (top?.probabilityScore || 0) >= fixture.minimumTopProbability) &&
        minimumRulesPassed &&
        maximumRulesPassed,
      topHypothesis: top?.title || null,
      topProbability: top?.probabilityScore || null,
      topRuleIds: top?.matchedRuleIds || [],
    };
  });
