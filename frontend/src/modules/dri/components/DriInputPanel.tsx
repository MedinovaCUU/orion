import type { ChangeEvent } from 'react';
import {
  DRI_CONTROL_LEVEL_OPTIONS,
  DRI_EQUIPMENT_OPTIONS,
  DRI_EVENT_OPTIONS,
  DRI_FAILURE_OPTIONS,
} from '../types/dri.types';
import type {
  DriCaseFormState,
  DriEvidenceArtifact,
  DriEvidenceArtifactType,
  DriInterferenceThreshold,
  DriMeasurementLimit,
  DriQcAssessment,
  DriQcReference,
  DriReagent,
  DriReagentMeasurementInput,
  DriReagentProfile,
  DriServiceTestInput,
  DriServiceUtilityId,
} from '../types/dri.types';

const SERVICE_UTILITY_OPTIONS: Array<{ value: DriServiceUtilityId; label: string }> = [
  { value: 'photometry', label: 'Photometry' },
  { value: 'motors_valves_pumps', label: 'Motors, valves and pumps' },
  { value: 'thermostatting', label: 'Thermostatting' },
  { value: 'level_detection', label: 'Level detection' },
  { value: 'washing_station', label: 'Washing station' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'positioning', label: 'Positioning' },
  { value: 'stress_mode', label: 'Stress mode' },
  { value: 'historical_reports', label: 'Historical reports' },
  { value: 'software_configuration', label: 'Configuración técnica' },
];

const EVIDENCE_TYPE_OPTIONS: Array<{ value: DriEvidenceArtifactType; label: string }> = [
  { value: 'manual', label: 'Nota' },
  { value: 'photo', label: 'Foto' },
  { value: 'report', label: 'Reporte' },
  { value: 'service_note', label: 'Prueba de servicio' },
];

const serviceLabel = (utilityId: DriServiceUtilityId) =>
  SERVICE_UTILITY_OPTIONS.find((option) => option.value === utilityId)?.label || utilityId;

const evidenceTypeLabel = (type: DriEvidenceArtifactType) =>
  EVIDENCE_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;

const formatQcValue = (value: number | null, unit: string | null) => {
  if (value === null || Number.isNaN(value)) return 'N/D';
  const decimals = Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 2 : 3;
  return `${value.toFixed(decimals).replace(/\.?0+$/, '')}${unit ? ` ${unit}` : ''}`;
};

const qcBandLabel = (band: DriQcAssessment['band']) => {
  if (band === 'within_1s') return 'Dentro de 1SD';
  if (band === 'within_2s') return 'Fuera de 1SD';
  if (band === 'near_reject') return 'Cerca de rechazo';
  if (band === 'out_of_reject') return 'Fuera de rechazo';
  if (band === 'non_numeric') return 'Falta valor';
  return 'Sin referencia';
};

const formatMeasurement = (limit: DriMeasurementLimit | null) => {
  if (!limit) return 'N/D';
  const alternate =
    limit.alternateValue !== null && limit.alternateValue !== undefined && limit.alternateUnit
      ? ` · ${limit.alternateValue} ${limit.alternateUnit}`
      : '';
  return `${limit.value} ${limit.unit}${alternate}`;
};

const formatInterferenceThreshold = (threshold: DriInterferenceThreshold) =>
  `${threshold.label} > ${threshold.thresholdValue} ${threshold.unit}`;

const shouldShowAnchorMeasurements = (eventType: DriCaseFormState['eventType']) =>
  ['dilution_error', 'non_linear', 'poor_repeatability', 'incoherent_result'].includes(eventType);

const shouldShowBlankCapture = (form: DriCaseFormState) =>
  form.eventType === 'failed_blank' ||
  form.eventType === 'absorbance_error' ||
  form.failureDirection === 'high_absorbance' ||
  form.failureDirection === 'low_absorbance';

const inferBlankGuidance = (profile: DriReagentProfile | null) => {
  if (!profile) return null;
  const notes = profile.technicalNotes.value.join(' ').toLowerCase();
  if (notes.includes('inferior al límite') || notes.includes('inferior al limite')) {
    return 'Esta técnica sospecha blanco demasiado bajo.';
  }
  if (notes.includes('superior al límite') || notes.includes('superior al limite') || notes.includes('por encima del límite')) {
    return 'Esta técnica sospecha blanco demasiado alto.';
  }
  if (profile.requiresBlank.value) {
    return 'Captura blanco si observas sesgo raro.';
  }
  return null;
};

export default function DriInputPanel({
  form,
  filteredReagents,
  qcReferenceOptions,
  selectedQcReference,
  qcAssessment,
  reagentMeasurements,
  reagentQcReferenceById,
  reagentQcAssessmentById,
  search,
  onSearchChange,
  onFormChange,
  onToggleSignal,
  onCycleReagent,
  onUpdateReagentMeasurement,
  onApplyQcReference,
  onReset,
  onAnalyze,
  onLoadDemo,
  onLoadFullDemo,
  showDemoButton,
  canAnalyze,
  saving,
  onAddServiceTest,
  onUpdateServiceTest,
  onRemoveServiceTest,
  onAddEvidenceItem,
  onUpdateEvidenceItem,
  onRemoveEvidenceItem,
  onSelectEvidenceFile,
  evidenceTasks,
  selectedReagent,
  selectedReagentProfile,
}: {
  form: DriCaseFormState;
  filteredReagents: DriReagent[];
  qcReferenceOptions: DriQcReference[];
  selectedQcReference: DriQcReference | null;
  qcAssessment: DriQcAssessment | null;
  reagentMeasurements: Record<string, DriReagentMeasurementInput>;
  reagentQcReferenceById: Map<string, DriQcReference>;
  reagentQcAssessmentById: Map<string, DriQcAssessment>;
  search: string;
  onSearchChange: (value: string) => void;
  onFormChange: <K extends keyof DriCaseFormState>(field: K, value: DriCaseFormState[K]) => void;
  onToggleSignal: (field: keyof DriCaseFormState['signals']) => void;
  onCycleReagent: (reagentId: string) => void;
  onUpdateReagentMeasurement: (reagentId: string, patch: Partial<DriReagentMeasurementInput>) => void;
  onApplyQcReference: (reference: DriQcReference) => void;
  onReset: () => void;
  onAnalyze: () => void;
  onLoadDemo: () => void;
  onLoadFullDemo: () => void;
  showDemoButton: boolean;
  canAnalyze: boolean;
  saving: boolean;
  onAddServiceTest: () => void;
  onUpdateServiceTest: (id: string, patch: Partial<DriServiceTestInput>) => void;
  onRemoveServiceTest: (id: string) => void;
  onAddEvidenceItem: () => void;
  onUpdateEvidenceItem: (id: string, patch: Partial<DriEvidenceArtifact>) => void;
  onRemoveEvidenceItem: (id: string) => void;
  onSelectEvidenceFile: (id: string, file: File) => void;
  evidenceTasks: Record<string, { busy: boolean; message: string; error: string | null }>;
  selectedReagent: DriReagent | null;
  selectedReagentProfile: DriReagentProfile | null;
}) {
  const handleInput = (field: keyof DriCaseFormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onFormChange(field as never, event.target.value as never);
  const showAnchorMeasurements = shouldShowAnchorMeasurements(form.eventType);
  const showBlankCapture = shouldShowBlankCapture(form);
  const selectedMeasurement = selectedReagent ? reagentMeasurements[selectedReagent.id] || null : null;
  const selectedBlankGuidance = inferBlankGuidance(selectedReagentProfile);

  return (
    <section className="dri-panel dri-panel--form">
      <div className="dri-panel__head">
        <div>
          <span className="dri-panel__eyebrow">Registrar escenario</span>
          <h3>Captura del caso</h3>
        </div>
        <div className="dri-inline-badges">
          {showDemoButton ? (
            <>
              <button type="button" className="dri-pill-button" onClick={onLoadDemo}>Demo BA400</button>
              <button type="button" className="dri-pill-button" onClick={onLoadFullDemo}>Demo total</button>
            </>
          ) : null}
          <button type="button" className="dri-ghost-button" onClick={onReset}>Reiniciar</button>
        </div>
      </div>

      <div className="dri-platform-row">
        {DRI_EQUIPMENT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`dri-platform-pill ${form.equipmentModel === option.value ? 'is-active' : ''}`}
            onClick={() => onFormChange('equipmentModel', option.value)}
          >
            <strong>{option.label}</strong>
            {option.supportStatus === 'specializing' ? <span>en especialización</span> : <span>listo</span>}
          </button>
        ))}
      </div>

      <div className="dri-form-grid">
        <label className="dri-field dri-field--span-2">
          <span>Serie</span>
          <input className="input-field" value={form.serialNumber} onChange={handleInput('serialNumber')} placeholder="8340..." />
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Fecha</span>
          <input type="date" className="input-field" value={form.eventDate} onChange={handleInput('eventDate')} />
        </label>
        <label className="dri-field dri-field--span-3">
          <span>Tipo de falla</span>
          <select className="input-field" value={form.eventType} onChange={handleInput('eventType')}>
            {DRI_EVENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Dirección</span>
          <select className="input-field" value={form.failureDirection} onChange={handleInput('failureDirection')}>
            {DRI_FAILURE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Control</span>
          <select className="input-field" value={form.controlLevel} onChange={handleInput('controlLevel')}>
            {DRI_CONTROL_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {showAnchorMeasurements ? (
          <>
            <label className="dri-field dri-field--span-2">
              <span>Esperado ancla</span>
              <input className="input-field" value={form.expectedValue} onChange={handleInput('expectedValue')} placeholder="400" />
            </label>
            <label className="dri-field dri-field--span-2">
              <span>Obtenido ancla</span>
              <input className="input-field" value={form.obtainedValue} onChange={handleInput('obtainedValue')} placeholder="200" />
            </label>
          </>
        ) : null}
        <label className="dri-field dri-field--span-2">
          <span>Lote reactivo</span>
          <input className="input-field" value={form.reagentLot} onChange={handleInput('reagentLot')} placeholder="RGT-..." />
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Lote control</span>
          <input className="input-field" value={form.controlLot} onChange={handleInput('controlLot')} placeholder="CTRL-..." />
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Calibrador</span>
          <input className="input-field" value={form.calibratorName} onChange={handleInput('calibratorName')} placeholder="Nombre/ID" />
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Lote calibrador</span>
          <input className="input-field" value={form.calibratorLot} onChange={handleInput('calibratorLot')} placeholder="CAL-..." />
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Apertura · opcional</span>
          <input type="date" className="input-field" value={form.reagentOpenedAt} onChange={handleInput('reagentOpenedAt')} />
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Caducidad · opcional</span>
          <input type="date" className="input-field" value={form.reagentExpiryDate} onChange={handleInput('reagentExpiryDate')} />
        </label>
        <label className="dri-field dri-field--span-2">
          <span>Temp. ambiente °C · opcional</span>
          <input className="input-field" value={form.ambientTemperatureC} onChange={handleInput('ambientTemperatureC')} placeholder="24.5" />
        </label>
      </div>

      <div className="dri-signals">
        <button type="button" className={`dri-signal ${form.signals.intermittentPattern ? 'is-active' : ''}`} onClick={() => onToggleSignal('intermittentPattern')}><span className="dri-signal__dot" />Intermitente</button>
        <button type="button" className={`dri-signal ${form.signals.normalCurvesObserved ? 'is-active' : ''}`} onClick={() => onToggleSignal('normalCurvesObserved')}><span className="dri-signal__dot" />Curvas normales</button>
        <button type="button" className={`dri-signal ${form.signals.opticalRejectObserved ? 'is-active' : ''}`} onClick={() => onToggleSignal('opticalRejectObserved')}><span className="dri-signal__dot" />Rechazo óptico</button>
        <button type="button" className={`dri-signal ${form.signals.waterSensitivePattern ? 'is-active' : ''}`} onClick={() => onToggleSignal('waterSensitivePattern')}><span className="dri-signal__dot" />Sensibles a agua</button>
      </div>

      <label className="dri-field dri-field--full">
        <span>Observaciones</span>
        <textarea className="input-field dri-textarea" value={form.observations} onChange={handleInput('observations')} placeholder="Curvas, dilución, LIS, blancos, carryover, temperatura, agua, comentarios del ingeniero..." />
      </label>

      {qcReferenceOptions.length ? (
        <div className="dri-qc-strip">
          <div className="dri-qc-strip__head">
            <div>
              <span className="dri-panel__eyebrow">Referencias QC detectadas</span>
              <h4>{form.failedReagentIds.length ? 'Valuesheet disponible para las fallidas' : 'Valuesheet disponible para el reactivo seleccionado'}</h4>
            </div>
            <div className="dri-selection-summary">
              <span className="dri-badge dri-badge--neutral">{qcReferenceOptions.length} referencia(s)</span>
              {selectedQcReference ? (
                <span className={`dri-badge ${
                  qcAssessment?.band === 'out_of_reject'
                    ? 'dri-badge--red'
                    : qcAssessment?.band === 'near_reject'
                      ? 'dri-badge--amber'
                      : qcAssessment?.assumedNeutral
                        ? 'dri-badge--neutral'
                        : 'dri-badge--teal'
                }`}
                >
                  {qcAssessment ? qcBandLabel(qcAssessment.band) : 'Referencia aplicada'}
                </span>
              ) : null}
            </div>
          </div>
          <div className="dri-qc-reference-list">
            {qcReferenceOptions.map((reference) => {
              const selected = selectedQcReference?.id === reference.id;
              return (
                <button
                  key={reference.id}
                  type="button"
                  className={`dri-qc-reference-card ${selected ? 'is-active' : ''}`}
                  onClick={() => onApplyQcReference(reference)}
                >
                  <strong>{reference.reagentDisplayCode || reference.reagentId} · {reference.controlLevel === 'level_1' ? 'Nivel I' : 'Nivel II'}</strong>
                  <span>{reference.lot ? `Lote ${reference.lot}` : 'Lote no capturado'} · {reference.unit || 'sin unidad'}</span>
                  <small>Target {formatQcValue(reference.targetValue, reference.unit)} · 1SD {formatQcValue(reference.sd1Low, reference.unit)} a {formatQcValue(reference.sd1High, reference.unit)}</small>
                </button>
              );
            })}
          </div>
          {selectedQcReference ? (
            <div className="dri-qc-band">
              <div className="dri-qc-band__summary">
                <strong>{selectedQcReference.analyteName}</strong>
                <p>{selectedQcReference.methodName || 'Método de control'} · rechazo {formatQcValue(selectedQcReference.rejectLow, selectedQcReference.unit)} a {formatQcValue(selectedQcReference.rejectHigh, selectedQcReference.unit)}</p>
              </div>
              <div className="dri-qc-band__metrics">
                <span className="dri-mini-badge">Target {formatQcValue(selectedQcReference.targetValue, selectedQcReference.unit)}</span>
                <span className="dri-mini-badge">1SD {formatQcValue(selectedQcReference.sd1, selectedQcReference.unit)}</span>
                {qcAssessment?.zScore !== null && qcAssessment?.zScore !== undefined ? (
                  <span className="dri-mini-badge">Z {qcAssessment.zScore.toFixed(2)}</span>
                ) : null}
              </div>
              {qcAssessment ? <p className="dri-qc-band__note">{qcAssessment.explanation}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="dri-picker">
        <div className="dri-picker__head">
          <div>
            <span className="dri-panel__eyebrow">Reactivos del caso</span>
            <h4>Un clic verde, dos clics rojo, tres clics blanco</h4>
          </div>
          <input className="input-field dri-picker__search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar reactivo..." />
        </div>
        <div className="dri-selection-summary">
          <span className="dri-badge dri-badge--red">Fallidas · {form.failedReagentIds.length}</span>
          <span className="dri-badge dri-badge--teal">Correctas · {form.correctReagentIds.length}</span>
        </div>
        <div className="dri-reagent-list">
          {filteredReagents.map((reagent) => {
            const failed = form.failedReagentIds.includes(reagent.id);
            const correct = form.correctReagentIds.includes(reagent.id);
            const measurement = reagentMeasurements[reagent.id];
            const reference = reagentQcReferenceById.get(reagent.id) || null;
            const assessment = reagentQcAssessmentById.get(reagent.id) || null;
            return (
              <div
                key={reagent.id}
                className={`dri-reagent-pill-card ${failed ? 'is-failed' : correct ? 'is-correct' : ''}`}
                title={`${reagent.displayCode || reagent.id} · ${reagent.displayName || reagent.name}`}
              >
                <button
                  type="button"
                  className={`dri-reagent-pill ${failed ? 'is-failed' : correct ? 'is-correct' : ''}`}
                  onClick={() => onCycleReagent(reagent.id)}
                >
                  <span className="dri-reagent-pill__code">{reagent.displayCode || reagent.id}</span>
                </button>
                <div className={`dri-reagent-pill__capture ${showBlankCapture ? 'has-blank' : ''}`}>
                  <input
                    className={`input-field dri-reagent-pill__input ${
                      (assessment?.band || measurement?.qcBand) === 'out_of_reject'
                        ? 'is-critical'
                        : (assessment?.band || measurement?.qcBand) === 'near_reject'
                          ? 'is-warning'
                          : assessment?.assumedNeutral
                            ? 'is-neutral'
                            : ''
                    }`}
                    value={measurement?.obtainedValue || ''}
                    onChange={(event) =>
                      onUpdateReagentMeasurement(reagent.id, {
                        obtainedValue: event.target.value,
                        unit: reference?.unit || measurement?.unit || null,
                        expectedValue: reference ? String(reference.targetValue) : measurement?.expectedValue || null,
                        selectedQcReferenceId: reference?.id || measurement?.selectedQcReferenceId || null,
                        source: 'manual',
                      })
                    }
                    onClick={(event) => event.stopPropagation()}
                    placeholder={reference?.unit || 'valor'}
                    aria-label={`Valor obtenido de ${reagent.displayCode || reagent.id}`}
                  />
                  {measurement?.source === 'auto_import' ? (
                    <span
                      className={`dri-reagent-pill__qc-origin ${measurement.qcBand === 'out_of_reject' ? 'is-failed' : measurement.qcBand === 'near_reject' ? 'is-warning' : ''}`}
                      title={`${measurement.controlLot ? `Lote ${measurement.controlLot} · ` : ''}${measurement.observedAt ? new Date(measurement.observedAt).toLocaleString('es-MX') : 'fecha no disponible'}`}
                    >
                      {measurement.controlLevel === 'level_1' ? 'N1' : measurement.controlLevel === 'level_2' ? 'N2' : 'QC'}
                    </span>
                  ) : null}
                  {showBlankCapture ? (
                    <input
                      className="input-field dri-reagent-pill__input dri-reagent-pill__input--blank"
                      value={measurement?.blankAbsorbance || ''}
                      onChange={(event) =>
                        onUpdateReagentMeasurement(reagent.id, {
                          blankAbsorbance: event.target.value,
                          blankUnit: 'A',
                          source: 'manual',
                        })
                      }
                      onClick={(event) => event.stopPropagation()}
                      placeholder="A bl."
                      aria-label={`Absorbancia de blanco de ${reagent.displayCode || reagent.id}`}
                    />
                  ) : null}
                </div>
                {reference ? (
                  <div className="dri-reagent-pill__meta">
                    <span>Tgt {formatQcValue(reference.targetValue, reference.unit)}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {selectedReagent && selectedReagentProfile ? (
          <div className="dri-reagent-detail">
            <div className="dri-reagent-detail__head">
              <div>
                <span className="dri-panel__eyebrow">Reactivo seleccionado</span>
                <h5>{selectedReagent.displayCode || selectedReagent.id} · {selectedReagent.displayName || selectedReagent.name}</h5>
              </div>
              <div className="dri-inline-badges">
                {selectedReagentProfile.reactionKind.value !== 'other' ? (
                  <span className="dri-mini-badge">{selectedReagentProfile.reactionKind.value}</span>
                ) : null}
                {selectedReagentProfile.reagentScheme.value !== 'unknown' ? (
                  <span className="dri-mini-badge">{selectedReagentProfile.reagentScheme.value}</span>
                ) : null}
                {selectedReagentProfile.platforms.value.length ? (
                  <span className="dri-mini-badge">{selectedReagentProfile.platforms.value.join(' · ')}</span>
                ) : null}
              </div>
            </div>

            <div className="dri-reagent-detail__metrics">
              <div className="dri-reagent-metric">
                <span>Límite detección</span>
                <strong>{formatMeasurement(selectedReagentProfile.detectionLimit.value)}</strong>
              </div>
              <div className="dri-reagent-metric">
                <span>Límite cuantificación</span>
                <strong>{formatMeasurement(selectedReagentProfile.quantificationLimit.value)}</strong>
              </div>
              <div className="dri-reagent-metric">
                <span>Límite linealidad</span>
                <strong>{formatMeasurement(selectedReagentProfile.linearityLimit.value)}</strong>
              </div>
              <div className="dri-reagent-metric">
                <span>Valor capturado</span>
                <strong>{selectedMeasurement?.obtainedValue || 'Neutral / sin captura'}</strong>
              </div>
            </div>

            {showBlankCapture || selectedMeasurement?.blankAbsorbance ? (
              <div className="dri-reagent-detail__group">
                <span className="dri-panel__eyebrow">Blanco / absorbancia base</span>
                <div className="dri-evidence-summary">
                  <span className="dri-badge dri-badge--neutral">
                    Blanco capturado: {selectedMeasurement?.blankAbsorbance || 'sin dato'}
                  </span>
                  {selectedBlankGuidance ? (
                    <span className="dri-badge dri-badge--neutral">{selectedBlankGuidance}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selectedReagentProfile.interferenceThresholds.value.length ? (
              <div className="dri-reagent-detail__group">
                <span className="dri-panel__eyebrow">Interferencias críticas IFU</span>
                <div className="dri-evidence-summary">
                  {selectedReagentProfile.interferenceThresholds.value.slice(0, 4).map((threshold) => (
                    <span key={`${selectedReagent.id}-${threshold.interferent}-${threshold.thresholdValue}`} className="dri-badge dri-badge--neutral">
                      {formatInterferenceThreshold(threshold)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedReagentProfile.procedureLimitations.value.length ? (
              <div className="dri-reagent-detail__group">
                <span className="dri-panel__eyebrow">Limitaciones del procedimiento</span>
                <ul className="dri-reagent-detail__list">
                  {selectedReagentProfile.procedureLimitations.value.slice(0, 2).map((item) => (
                    <li key={`${selectedReagent.id}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="dri-advanced-grid">
        <div className="dri-subpanel">
          <div className="dri-subpanel__head">
            <strong>Pruebas de servicio BA400</strong>
            <button type="button" className="dri-pill-button" onClick={onAddServiceTest}>Agregar</button>
          </div>
          <div className="dri-compact-list">
            {form.serviceTests.map((test) => (
              <div key={test.id} className="dri-inline-form">
                <select className="input-field" value={test.utilityId} onChange={(event) => onUpdateServiceTest(test.id, { utilityId: event.target.value as DriServiceUtilityId, label: serviceLabel(event.target.value as DriServiceUtilityId) })}>
                  {SERVICE_UTILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select className="input-field" value={test.result} onChange={(event) => onUpdateServiceTest(test.id, { result: event.target.value as DriServiceTestInput['result'] })}>
                  <option value="not_run">No corrida</option>
                  <option value="normal">Normal</option>
                  <option value="abnormal">Anormal</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="adjusted">Adjusted</option>
                </select>
                <input className="input-field" value={test.notes} onChange={(event) => onUpdateServiceTest(test.id, { notes: event.target.value })} placeholder="Resultado / nota" />
                <button type="button" className="dri-ghost-button" onClick={() => onRemoveServiceTest(test.id)}>Quitar</button>
              </div>
            ))}
          </div>
        </div>

        <div className="dri-subpanel">
          <div className="dri-subpanel__head">
            <strong>Evidencia técnica</strong>
            <button type="button" className="dri-pill-button" onClick={onAddEvidenceItem}>Agregar</button>
          </div>
          <div className="dri-compact-list">
            {form.evidenceItems.map((item) => (
              <div key={item.id} className="dri-evidence-card">
                <div className="dri-evidence-card__head">
                  <select className="input-field" value={item.type} onChange={(event) => onUpdateEvidenceItem(item.id, { type: event.target.value as DriEvidenceArtifactType })}>
                    {EVIDENCE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input
                    className="input-field"
                    value={item.title}
                    onChange={(event) => onUpdateEvidenceItem(item.id, { title: event.target.value })}
                    placeholder={`${evidenceTypeLabel(item.type)} técnica`}
                  />
                  <button type="button" className="dri-ghost-button" onClick={() => onRemoveEvidenceItem(item.id)}>Quitar</button>
                </div>

                {item.type === 'manual' ? (
                  <div className="dri-inline-form dri-inline-form--manual">
                    <input
                      className="input-field"
                      value={item.value}
                      onChange={(event) => onUpdateEvidenceItem(item.id, { value: event.target.value })}
                      placeholder="Hallazgo o referencia"
                    />
                    <input
                      className="input-field"
                      value={item.note}
                      onChange={(event) => onUpdateEvidenceItem(item.id, { note: event.target.value })}
                      placeholder="Nota opcional"
                    />
                  </div>
                ) : (
                  <div className="dri-evidence-card__body">
                    <div className="dri-evidence-card__actions">
                      <label className="dri-pill-button dri-upload-button">
                        {item.type === 'photo' ? 'Subir foto' : 'Subir archivo'}
                        <input
                          type="file"
                          hidden
                          accept={item.type === 'photo' ? 'image/*' : '.pdf,image/*,text/plain'}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              onSelectEvidenceFile(item.id, file);
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>
                      {item.type === 'photo' ? (
                        <label className="dri-pill-button dri-upload-button">
                          Tomar foto
                          <input
                            type="file"
                            hidden
                            accept="image/*"
                            capture="environment"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                onSelectEvidenceFile(item.id, file);
                              }
                              event.target.value = '';
                            }}
                          />
                        </label>
                      ) : null}
                      {item.fileUrl ? (
                        <a className="dri-ghost-button" href={item.fileUrl} target="_blank" rel="noreferrer">
                          Ver archivo
                        </a>
                      ) : null}
                    </div>

                    <div className="dri-evidence-card__meta">
                      <span className="dri-mini-badge">{item.fileName ? item.fileName : 'Sin archivo cargado'}</span>
                      {item.derivedData?.serviceTests.length ? (
                        <span className="dri-mini-badge">{item.derivedData.serviceTests.length} utilidad(es) detectada(s)</span>
                      ) : null}
                    </div>

                    {evidenceTasks[item.id]?.message ? (
                      <p className="dri-evidence-card__message">{evidenceTasks[item.id].message}</p>
                    ) : null}
                    {evidenceTasks[item.id]?.error ? (
                      <p className="dri-evidence-card__error">{evidenceTasks[item.id].error}</p>
                    ) : null}

                    {item.fileUrl && item.mimeType?.startsWith('image/') ? (
                      <img className="dri-evidence-card__preview" src={item.fileUrl} alt={item.title || item.fileName || 'Evidencia técnica'} />
                    ) : null}

                    {item.ocrSummary?.length ? (
                      <div className="dri-evidence-summary">
                        {item.ocrSummary.map((summaryItem) => (
                          <span key={`${item.id}-${summaryItem}`} className="dri-badge dri-badge--neutral">{summaryItem}</span>
                        ))}
                      </div>
                    ) : null}

                    <input
                      className="input-field"
                      value={item.note}
                      onChange={(event) => onUpdateEvidenceItem(item.id, { note: event.target.value })}
                      placeholder={item.type === 'photo' ? 'Qué se observa en la foto' : 'Nota opcional sobre el archivo'}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button type="button" className="button-primary dri-submit" disabled={!canAnalyze || saving} onClick={onAnalyze}>
        {saving ? 'Generando diagnóstico...' : 'Generar diagnóstico diferencial'}
      </button>
    </section>
  );
}
