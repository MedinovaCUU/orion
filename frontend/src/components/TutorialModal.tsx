import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import {
  isStructuredTutorial,
  type LegacyTutorial,
  type StructuredTutorial,
  type TutorialDefinition,
} from '../data/tutorialCatalog';
import orionIcono from '../assets/orion-icono.png';
import './TutorialModal.css';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  tutorial: TutorialDefinition | null;
}

type WizardView = 'alert' | 'instructions' | 'troubleshoot_form' | 'success';

export default function TutorialModal({ isOpen, onClose, tutorial }: TutorialModalProps) {
  const [view, setView] = useState<WizardView>('instructions');
  const [componentBroken, setComponentBroken] = useState<string>('');
  const [hasOldLamp, setHasOldLamp] = useState<boolean | null>(null);
  const [serial, setSerial] = useState<string>('83105');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (tutorial?.error_comun) {
        setView('alert');
      } else {
        setView('instructions');
      }
      setComponentBroken('');
      setHasOldLamp(null);
      setSerial('83105');
      setIsSubmitting(false);
    }
  }, [isOpen, tutorial]);

  if (!isOpen || !tutorial) return null;

  const structuredTutorial: StructuredTutorial | null = isStructuredTutorial(tutorial) ? tutorial : null;
  const legacyTutorial: LegacyTutorial | null = structuredTutorial ? null : (tutorial as LegacyTutorial);
  const structured = Boolean(structuredTutorial);
  const logicaTecnica =
    legacyTutorial?.logica_tecnica
      ? Array.isArray(legacyTutorial.logica_tecnica)
        ? legacyTutorial.logica_tecnica
        : [legacyTutorial.logica_tecnica]
      : [];

  const resumenRapido: Array<{ etiqueta: string; valor: string }> = structuredTutorial
      ? [
        { etiqueta: 'Equipo', valor: structuredTutorial.equipo },
        { etiqueta: 'Criticidad', valor: structuredTutorial.criticidad.nivel },
        { etiqueta: 'Dificultad', valor: structuredTutorial.dificultad.nivel },
        { etiqueta: 'Tiempo', valor: structuredTutorial.tiempo },
      ]
    : legacyTutorial?.resumen_rapido ?? [];

  const getCriticidadClass = (nivel: string) => {
    switch (nivel) {
      case 'Crítico':
        return 'tutorial-badge--critico';
      case 'Alto':
        return 'tutorial-badge--alto';
      case 'Medio':
        return 'tutorial-badge--medio';
      case 'Bajo':
        return 'tutorial-badge--bajo';
      default:
        return 'tutorial-badge--neutral';
    }
  };

  const handleSubmitIssue = async () => {
    setIsSubmitting(true);
    let issueDescription = `Componente dañado: ${componentBroken}. `;
    if (componentBroken === 'Lámpara Nueva') {
      issueDescription += `Se le recomendó usar la lámpara anterior temporalmente. (Cuenta con ella: ${hasOldLamp ? 'Sí' : 'No'}).`;
    }

    const { error } = await supabase.from('tickets').insert([
      {
        asunto: `Reporte de Falla: ${componentBroken} en Tutorial Analizador`,
        descripcion: issueDescription,
        numero_serie_equipo: serial,
        estado: 'abierto',
      },
    ]);

    if (!error) {
      setView('success');
    } else {
      alert(`Error enviando el reporte: ${error.message}`);
    }
    setIsSubmitting(false);
  };

  const renderSectionList = (title: string, items: string[], tone: 'default' | 'warning' | 'success' = 'default') => (
    <div className={`tutorial-detail-card tutorial-detail-card--${tone}`}>
      <h4 className="tutorial-structured-title">{title}</h4>
      <ul className="tutorial-detail-list">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`}>{item}</li>
        ))}
      </ul>
    </div>
  );

  const renderStructuredContent = () => (
    (() => {
      const data = structuredTutorial!;
      return (
        <div className="tutorial-structured-layout">
          {renderSectionList('1. Objetivo', data.objetivo)}
          {renderSectionList('2. Cuándo se debe realizar', data.cuando)}

          <div className="tutorial-detail-card tutorial-detail-card--warning">
            <h4 className="tutorial-structured-title">3. Nivel de criticidad</h4>
            <div className="tutorial-meta-row">
              <span className={`tutorial-badge ${getCriticidadClass(data.criticidad.nivel)}`}>
                {data.criticidad.nivel}
              </span>
              <p className="tutorial-detail-paragraph">{data.criticidad.motivo}</p>
            </div>
          </div>

          {renderSectionList('4. Riesgos si se hace mal', data.riesgos, 'warning')}
          {renderSectionList('5. Herramientas, materiales y prerrequisitos', data.herramientas)}
          {renderSectionList('6. Concepto técnico clave', data.concepto)}
          {renderSectionList('7. Procedimiento paso a paso', data.procedimiento)}
          {renderSectionList('8. Puntos de validación', data.validacion, 'success')}
          {renderSectionList('9. Errores comunes y cómo evitarlos', data.errores, 'warning')}
          {renderSectionList('10. Relación con otras fallas o ajustes', data.relacion)}
          {renderSectionList('11. Checklist rápido de campo', data.checklist, 'success')}

          <div className="tutorial-detail-card tutorial-detail-card--info">
            <h4 className="tutorial-structured-title">12. Nivel de dificultad</h4>
            <div className="tutorial-meta-row">
              <span className="tutorial-badge tutorial-badge--neutral">{data.dificultad.nivel}</span>
              <p className="tutorial-detail-paragraph">{data.dificultad.motivo}</p>
            </div>
          </div>

          <div className="tutorial-detail-card tutorial-detail-card--default">
            <h4 className="tutorial-structured-title">13. Tiempo estimado</h4>
            <p className="tutorial-detail-paragraph">{data.tiempo}</p>
          </div>

          <div className="tutorial-detail-card tutorial-detail-card--default">
            <h4 className="tutorial-structured-title">14. Etiquetas</h4>
            <div className="tutorial-tags">
              {data.etiquetas.map((tag) => (
                <span key={`${data.id}-${tag}`} className="tutorial-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    })()
  );

  const renderLegacyContent = () => (
    (() => {
      const data = legacyTutorial!;
      return (
    <>
      <div className="tutorial-modal-instructions">
        <h3>Secuencia Operativa</h3>
        <ul>
          {data.instrucciones.map((step: string, idx: number) => (
            <li key={idx}>
              <span className="step-number">{idx + 1}</span>
              <span className="step-text">{step}</span>
            </li>
          ))}
        </ul>

        {logicaTecnica.length > 0 && (
          <div className="tutorial-detail-card tutorial-detail-card--info">
            <h4 className="tutorial-detail-title">Lógica técnica del ajuste</h4>
            <div className="tutorial-detail-list">
              {logicaTecnica.map((paragraph: string, idx: number) => (
                <p key={idx} className="tutorial-detail-paragraph">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        )}

        {data.secciones?.map((section) => (
          <div
            key={section.titulo}
            className={`tutorial-detail-card tutorial-detail-card--${section.variante ?? 'default'}`}
          >
            <h4 className="tutorial-detail-title">{section.titulo}</h4>
            <ul className="tutorial-detail-list">
              {section.items.map((item: string, idx: number) => (
                <li key={`${section.titulo}-${idx}`}>{item}</li>
              ))}
            </ul>
          </div>
        ))}

        {data.advertencias_criticas && data.advertencias_criticas.length > 0 && (
          <div className="tutorial-detail-card tutorial-detail-card--warning">
            <h4 className="tutorial-detail-title">Advertencias críticas</h4>
            <ul className="tutorial-detail-list">
              {data.advertencias_criticas.map((warning: string, idx: number) => (
                <li key={`warning-${idx}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {data.criterios_aceptacion && data.criterios_aceptacion.length > 0 && (
          <div className="tutorial-detail-card tutorial-detail-card--success">
            <h4 className="tutorial-detail-title">Criterios de aceptación verificables</h4>
            <ul className="tutorial-detail-list">
              {data.criterios_aceptacion.map((criterion: string, idx: number) => (
                <li key={`criterion-${idx}`}>{criterion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {(data.has_troubleshooting === undefined || data.has_troubleshooting) && (
        <button className="trouble-trigger-btn" onClick={() => setView('troubleshoot_form')}>
          ⚠️ Tuve un problema al cambiar la lámpara
        </button>
      )}

      <button className="confirm-btn-red" onClick={onClose} style={{ marginTop: '15px' }}>
        Finalizar Tutorial
      </button>
    </>
      );
    })()
  );

  const renderWizardContent = () => {
    if (view === 'alert') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div
            className="wizard-warning-box"
            style={{ padding: '20px', fontSize: '1.1rem', marginBottom: '20px', border: '2px solid rgba(255, 60, 60, 0.5)' }}
          >
            <h3 style={{ color: 'var(--brand-red-ink)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              ⚠️ ATENCIÓN: ERROR COMÚN
            </h3>
            <p style={{ lineHeight: '1.6', color: 'var(--text-secondary)' }}>{tutorial.error_comun}</p>
            {tutorial.alerta_detalles && tutorial.alerta_detalles.length > 0 && (
              <ul style={{ margin: '14px 0 0', paddingLeft: '18px', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
                {tutorial.alerta_detalles.map((detail, idx) => (
                  <li key={`alert-detail-${idx}`} style={{ marginBottom: '8px' }}>
                    {detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            className="confirm-btn-red"
            onClick={() => setView('instructions')}
            style={{ marginTop: 'auto', padding: '15px', fontSize: '1.1rem' }}
          >
            Enterado (Continuar al Tutorial)
          </button>
        </div>
      );
    }

    if (view === 'instructions') {
      return structured ? (
        <>
          {renderStructuredContent()}
          <button className="confirm-btn-red" onClick={onClose} style={{ marginTop: '18px' }}>
            Finalizar Tutorial
          </button>
        </>
      ) : (
        renderLegacyContent()
      );
    }

    if (view === 'troubleshoot_form') {
      const isReadyToSubmit = componentBroken && serial && (componentBroken !== 'Lámpara Nueva' || hasOldLamp !== null);

      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '15px' }}>Reporte Rápido de Problema</h3>

          <p style={{ color: 'var(--text-secondary)', marginBottom: '10px' }}>1. ¿Qué componente se dañó?</p>
          <div className="wizard-chip-container" style={{ marginBottom: '15px' }}>
            {['Lámpara Nueva', 'Socket / Portalámparas', 'Conector o Cableado'].map((opt) => (
              <button
                key={opt}
                className={`wizard-chip ${componentBroken === opt ? 'active' : ''}`}
                onClick={() => setComponentBroken(opt)}
                style={{ padding: '10px 15px' }}
              >
                {opt}
              </button>
            ))}
          </div>

          {componentBroken === 'Lámpara Nueva' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <p style={{ color: 'var(--text-secondary)', margin: '5px 0 10px' }}>2. ¿Conservas la lámpara anterior y funciona?</p>
              <div className="wizard-chip-container" style={{ flexDirection: 'row', gap: '15px', marginBottom: '15px' }}>
                <button
                  className={`wizard-chip ${hasOldLamp === true ? 'active' : ''}`}
                  style={{ flex: 1, textAlign: 'center', padding: '10px' }}
                  onClick={() => setHasOldLamp(true)}
                >
                  Sí
                </button>
                <button
                  className={`wizard-chip ${hasOldLamp === false ? 'active' : ''}`}
                  style={{ flex: 1, textAlign: 'center', padding: '10px' }}
                  onClick={() => setHasOldLamp(false)}
                >
                  No
                </button>
              </div>

              {hasOldLamp === true && (
                <div className="wizard-warning-box" style={{ marginBottom: '15px', padding: '12px' }}>
                  ⚠️ Te enviaremos un repuesto, pero por hoy <strong>reinstala tu lámpara térmica vieja</strong> para
                  que el analizador no pare su producción.
                </div>
              )}
            </div>
          )}

          {componentBroken !== '' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <label style={{ color: 'var(--text-primary)', fontWeight: 'bold', display: 'block' }}>N° de Serie de tu Analizador *</label>
              <input
                type="text"
                className="wizard-input"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                style={{ marginBottom: '20px', marginTop: '6px' }}
              />
            </div>
          )}

          <button
            className="confirm-btn-red"
            onClick={handleSubmitIssue}
            disabled={isSubmitting || !isReadyToSubmit}
            style={{ marginTop: 'auto', opacity: !isReadyToSubmit ? 0.3 : 1, transition: 'opacity 0.3s' }}
          >
            {isSubmitting ? 'Enviando Reporte...' : 'Enviar Reporte Urgente'}
          </button>

          <button className="trouble-trigger-btn" style={{ marginTop: '15px' }} onClick={() => setView('instructions')}>
            ← Cancelar y volver a instrucciones
          </button>
        </div>
      );
    }

    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <img
          src={orionIcono}
          alt="Orion"
          style={{
            width: '72px',
            height: '72px',
            marginBottom: '15px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 14px 24px rgba(0, 0, 0, 0.28))',
          }}
        />
        <h3 style={{ color: 'var(--text-primary)' }}>Reporte Enviado Exitosamente</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '15px 0 35px 0', fontSize: '15px', lineHeight: '1.5' }}>
          El equipo técnico y de logística ha sido notificado sobre la avería en: <strong>{componentBroken}</strong>.
          <br />
          <br />
          Te enviaremos información sobre el envío del repuesto muy pronto a través de la plataforma.
        </p>
        <button className="confirm-btn-red" onClick={onClose} style={{ width: '100%', marginTop: 'auto' }}>
          Cerrar Tutorial
        </button>
      </div>
    );
  };

  return createPortal(
    <div className="tutorial-modal-overlay" onClick={onClose}>
      <div className="tutorial-modal-glass" onClick={(e) => e.stopPropagation()}>
        <button className="tutorial-modal-close" onClick={onClose}>
          ✕
        </button>

        <div className="tutorial-modal-content">
          <div className="tutorial-modal-left">
            {tutorial.url_video ? (
              <video controls autoPlay className="tutorial-modal-video" src={tutorial.url_video}>
                Tu navegador no soporta reproductor de video.
              </video>
            ) : (
              <div className="tutorial-modal-summary-panel">
                <div className="tutorial-summary-kicker">{structured ? structuredTutorial!.equipo : 'Guía de campo'}</div>
                <h3>{tutorial.titulo}</h3>
                <p>{tutorial.descripcion}</p>

                {resumenRapido.length > 0 ? (
                  <div className="tutorial-summary-grid">
                    {resumenRapido.map((item) => (
                      <div key={item.etiqueta} className="tutorial-summary-card">
                        <span className="tutorial-summary-label">{item.etiqueta}</span>
                        <strong className="tutorial-summary-value">{item.valor}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tutorial-summary-empty">
                    Este tutorial no incluye video. Usa el panel derecho como procedimiento operativo detallado.
                  </div>
                )}

                {structured && (
                  <div className="tutorial-summary-sidepanel">
                    <h4>Enfoque del tutorial</h4>
                    <p>{structuredTutorial!.criticidad.motivo}</p>
                    <div className="tutorial-tags">
                      {structuredTutorial!.etiquetas.slice(0, 6).map((tag) => (
                        <span key={`${structuredTutorial!.id}-summary-${tag}`} className="tutorial-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="tutorial-modal-right">
            <h2>{tutorial.titulo}</h2>
            <p className="tutorial-modal-desc" style={{ marginBottom: view === 'instructions' ? '24px' : '15px' }}>
              {tutorial.descripcion}
            </p>

            {renderWizardContent()}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
