import { getBa400ServiceScripts } from '../knowledge/ba400.serviceScripts';
import type { DriChecklistStep } from '../types/dri.types';
import { runtimeFlags } from '../../../config/runtimeFlags';

const showDriFirmwareSteps = runtimeFlags.driFirmwareStepsVisible;

export default function DriChecklist({ steps }: { steps: DriChecklistStep[] }) {
  if (!steps.length) {
    return null;
  }

  return (
    <div className="dri-checklist">
      {steps.map((step) => (
        <article key={step.id} className="dri-checklist__step">
          <div className="dri-checklist__head">
            <strong>{step.title}</strong>
            {step.utilityLabel ? <span className="dri-mini-badge">{step.utilityLabel}</span> : null}
          </div>
          <p><b>Esperado:</b> {step.expectedResult}</p>
          <p><b>Interpretación:</b> {step.interpretation}</p>
          <p><b>Si pasa:</b> {step.onPass}</p>
          <p><b>Si falla:</b> {step.onFail}</p>
          {showDriFirmwareSteps && step.serviceScriptIds?.length ? (
            <details className="dri-script-disclosure" onClick={(event) => event.stopPropagation()}>
              <summary
                className="dri-script-disclosure__summary"
                onClick={(event) => event.stopPropagation()}
              >
                <span>Referencia BA400</span>
                <small>{step.serviceScriptIds.length} script{step.serviceScriptIds.length === 1 ? '' : 's'} internos</small>
              </summary>
              <div className="dri-script-disclosure__body">
                <p className="dri-script-disclosure__note">
                  Estos códigos son referencia documental del programa de servicio del BA400. No ejecutan ninguna acción desde ORION.
                </p>
                <div className="dri-script-stack">
                  {getBa400ServiceScripts(step.serviceScriptIds).map((script) => (
                    <div key={script.id} className="dri-script-chip">
                      <span className="dri-script-chip__id">FW {script.id}</span>
                      <strong>{script.actionId}</strong>
                      <small>{script.description}</small>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}
