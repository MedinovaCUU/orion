import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import BrandLockup from './BrandLockup';
import PublicSerialHelp from './PublicSerialHelp';
import {
  DESCRIPTION_MAX,
  descriptionIssue,
  nameIssue,
  phoneDigits,
  phoneIssue,
  serialFamily,
  serialIssue,
  serialKey,
  serialStatusMessage,
  type SerialCheckResult,
  type SerialStatus,
  type SubmitResult,
} from './publicPortal';

interface PublicCaseTimelineEntry {
  tipo: string;
  detalle: string;
  estado_resultante?: string | null;
  creado_en: string;
}

interface PublicCaseTrackingResult {
  numero_caso: string;
  asunto: string;
  estado: string;
  numero_serie_equipo: string;
  actualizado_en: string;
  bitacora: PublicCaseTimelineEntry[];
}

export default function PublicTicketForm() {
  const [tipoSoporte, setTipoSoporte] = useState<'Ingeniero' | 'Químico' | null>(null);
  const [numeroSerie, setNumeroSerie] = useState('');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [trap, setTrap] = useState('');
  const [serialTouched, setSerialTouched] = useState(false);
  const [serialCheck, setSerialCheck] = useState<{ key: string; result: SerialCheckResult } | null>(null);
  const [serialHelpChoice, setSerialHelpChoice] = useState<boolean | null>(null);
  const serialInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingCase, setTrackingCase] = useState('');
  const [trackingPhone, setTrackingPhone] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingResult, setTrackingResult] = useState<PublicCaseTrackingResult | null>(null);
  const [trackingError, setTrackingError] = useState('');
  
  const navigate = useNavigate();
  const supportOptions: Array<{
    value: 'Ingeniero' | 'Químico';
    className: string;
    title: string;
    description: string;
  }> = [
    {
      value: 'Ingeniero',
      className: 'support-choice--engineering',
      title: 'Ingeniería 🧰',
      description: 'Fallas físicas, instalación, arranque, partes, periféricos y continuidad operativa.',
    },
    {
      value: 'Químico',
      className: 'support-choice--applications',
      title: 'Química 🧪',
      description: 'Programación, técnicas nuevas, reactivos, calibración, control de calidad, soporte funcional.',
    },
  ];

  const serialKeyValue = serialKey(numeroSerie);
  const serialFormatIssue = serialIssue(serialKeyValue);
  const serialChecked = serialCheck?.key === serialKeyValue ? serialCheck.result : null;
  // Format problems show once the customer leaves the field; a plausible serial is looked up while typing.
  const serialState: { status: SerialStatus | 'idle' | 'checking'; modelo?: string | null; serie?: string | null } =
    !serialKeyValue ? { status: 'idle' }
      : serialFormatIssue ? (serialTouched ? { status: serialFormatIssue, modelo: serialFamily(serialKeyValue) } : { status: 'idle' })
        : serialChecked ?? { status: 'checking' };
  const serialError = serialState.status !== 'idle' && serialState.status !== 'checking' && serialState.status !== 'ok'
    ? serialStatusMessage(serialState.status, serialState.modelo)
    : '';
  const serialHelpOpen = serialHelpChoice ?? (serialTouched && Boolean(serialError));
  const serialHelpTab = serialFamily(serialKeyValue) === 'A15' ? 'a15' : 'ba';

  useEffect(() => {
    if (!serialKeyValue || serialFormatIssue || serialCheck?.key === serialKeyValue) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('check_public_equipment_serial', { p_serial: numeroSerie });
      // A failed lookup never blocks the form: the database checks the serial again on submit.
      if (current) setSerialCheck({ key: serialKeyValue, result: error || !data ? { status: 'idle' as SerialStatus } : (data as SerialCheckResult) });
    }, 600);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [numeroSerie, serialKeyValue, serialFormatIssue, serialCheck]);

  const rejectSerial = (status: SerialStatus, modelo?: string | null) => {
    setSerialTouched(true);
    if (!serialIssue(serialKeyValue)) setSerialCheck({ key: serialKeyValue, result: { status, modelo } });
    setSerialHelpChoice(true);
    setErrorMsg(serialStatusMessage(status, modelo));
    serialInput.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (trap) {
      // Only automated submissions fill the hidden field: acknowledge without creating anything.
      setResult({ status: 'creado', numero_caso: null });
      return;
    }
    if (!tipoSoporte) {
      setErrorMsg('Por favor selecciona el tipo de soporte que requieres.');
      return;
    }
    if (serialFormatIssue) {
      rejectSerial(serialFormatIssue, serialFamily(serialKeyValue));
      return;
    }
    if (serialState.status === 'no_encontrado') {
      rejectSerial('no_encontrado', serialState.modelo);
      return;
    }
    const fieldIssue = nameIssue(nombre) || phoneIssue(celular) || descriptionIssue(descripcion);
    if (fieldIssue) {
      setErrorMsg(fieldIssue);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('submit_public_support_case', {
      p_support_type: tipoSoporte,
      p_serial: numeroSerie.trim(),
      p_contact_name: nombre.trim(),
      p_phone: celular,
      p_description: descripcion.trim(),
    });
    setLoading(false);

    const outcome = data as SubmitResult | null;
    if (error || !outcome) {
      setErrorMsg('No fue posible enviar el reporte en este momento. Inténtalo de nuevo en unos minutos.');
    } else if (outcome.status === 'creado' || outcome.status === 'agrupado') {
      setResult(outcome);
    } else if (outcome.status === 'serie') {
      rejectSerial(outcome.motivo || 'no_encontrado', outcome.modelo);
    } else {
      setErrorMsg(outcome.mensaje || 'Revisa los datos del reporte.');
    }
  };

  const resetForm = () => {
    setResult(null);
    setNumeroSerie('');
    setSerialTouched(false);
    setSerialHelpChoice(null);
    setNombre('');
    setCelular('');
    setDescripcion('');
    setTipoSoporte(null);
    setErrorMsg('');
  };

  const handleTracking = async (event: React.FormEvent) => {
    event.preventDefault();
    setTrackingLoading(true);
    setTrackingError('');
    setTrackingResult(null);
    const { data, error } = await supabase.rpc('track_public_support_case', {
      p_case_number: trackingCase.trim(),
      p_phone: trackingPhone,
    });
    if (error) {
      setTrackingError(/Demasiadas consultas/.test(error.message) ? error.message : 'No fue posible consultar el caso en este momento.');
    } else if (!data) {
      setTrackingError('No encontramos un caso con ese folio y teléfono. Revisa ambos datos.');
    } else {
      setTrackingResult(data as PublicCaseTrackingResult);
    }
    setTrackingLoading(false);
  };

  const statusLabel = (status: string) => ({
    abierto: 'Abierto',
    en_progreso: 'En progreso',
    pendiente_piezas: 'Pendiente por piezas',
    en_observacion: 'En observación',
    cerrado: 'Cerrado',
  })[status] || status;

  if (result) {
      const grouped = result.status === 'agrupado';
      return (
          <div className="login-container login-container--public">
              <div className="card login-card login-card--public public-ticket-success-card">
                  <BrandLockup
                      variant="public"
                      eyebrow="BioSystems"
                      title={grouped ? 'Reporte agregado' : 'Ticket registrado'}
                      subtitle="Tu solicitud ya quedó dentro del flujo operativo de Orion."
                  />
                  <div className="public-ticket-success-copy">
                    <span className="public-ticket-success-tag">{grouped ? 'Caso en curso' : 'Flujo activo'}</span>
                    <h2 className="login-title">{grouped ? 'Lo sumamos al caso abierto' : 'Ticket enviado exitosamente'}</h2>
                    <p className="login-subtitle">
                      {grouped
                        ? result.repetido
                          ? 'Ya habíamos recibido este mismo reporte, así que no lo duplicamos.'
                          : 'Este equipo ya tenía un caso abierto del mismo tipo de soporte. Para no duplicarlo, agregamos tu descripción como nota y el responsable ya la tiene.'
                        : 'Recibimos la información del equipo y la descripción del problema.'}
                    </p>
                    <div className="public-ticket-case-number">
                      <span>{grouped ? 'Número del caso abierto' : 'Tu número de caso'}</span>
                      <strong>{result.numero_caso || 'Caso registrado'}</strong>
                      <small>
                        {grouped
                          ? 'Los avances se consultan con este número y el celular con el que se abrió el caso.'
                          : 'Guárdalo junto con el teléfono registrado para consultar cada avance.'}
                      </small>
                    </div>
                    <p className="public-ticket-success-note">
                      Un ingeniero o químico se pondrá en contacto contigo muy pronto al número registrado.
                    </p>
                  </div>
                  <button className="button-primary" type="button" onClick={resetForm}>
                      Enviar otro ticket
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="login-container login-container--public">
      <button 
          className="button-primary inactive public-access-button"
          type="button"
          onClick={() => navigate('/login')}
      >
          Acceso del personal
      </button>

      <div className="card login-card login-card--public public-ticket-card">
        <BrandLockup
          variant="public"
          eyebrow="BioSystems"
          title="Portal de soporte Orion"
        />


        <button
          type="button"
          className="public-ticket-tracking-toggle"
          aria-expanded={trackingOpen}
          onClick={() => setTrackingOpen((current) => !current)}
        >
          <span><strong>¿Ya tienes un caso?</strong><small>Consulta rápidamente en qué nos quedamos</small></span>
          <span aria-hidden="true">{trackingOpen ? '−' : '+'}</span>
        </button>

        {trackingOpen ? (
          <form className="public-ticket-tracking" onSubmit={handleTracking}>
            <div className="public-ticket-tracking-grid">
              <div className="form-group">
                <label>Número de caso</label>
                <input className="input-field" value={trackingCase} maxLength={8} onChange={(event) => setTrackingCase(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Ej. 1J209L61" required />
              </div>
              <div className="form-group">
                <label>Teléfono registrado</label>
                <input className="input-field" type="tel" inputMode="numeric" autoComplete="tel-national" value={trackingPhone} onChange={(event) => setTrackingPhone(phoneDigits(event.target.value))} pattern="[0-9]{10}" placeholder="10 dígitos" required />
              </div>
            </div>
            <button className="button-primary" type="submit" disabled={trackingLoading}>{trackingLoading ? 'Consultando…' : 'Consultar caso'}</button>
            {trackingError ? <div className="error-alert">{trackingError}</div> : null}
            {trackingResult ? (
              <div className="public-ticket-tracking-result">
                <div><span>{trackingResult.numero_caso}</span><strong>{statusLabel(trackingResult.estado)}</strong></div>
                <h3>{trackingResult.asunto}</h3>
                <p>Equipo {trackingResult.numero_serie_equipo} · Actualizado {new Date(trackingResult.actualizado_en).toLocaleString('es-MX')}</p>
                {trackingResult.bitacora?.length ? (
                  <ol>
                    {trackingResult.bitacora.map((entry, index) => (
                      <li key={`${entry.creado_en}-${index}`}>
                        <time>{new Date(entry.creado_en).toLocaleString('es-MX')}</time>
                        <strong>{entry.detalle}</strong>
                        {entry.estado_resultante ? <small>{statusLabel(entry.estado_resultante)}</small> : null}
                      </li>
                    ))}
                  </ol>
                ) : <p>Aún no hay avances públicos; el equipo de soporte ya recibió tu solicitud.</p>}
              </div>
            ) : null}
          </form>
        ) : null}

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="public-ticket-trap" aria-hidden="true">
            <label>
              Sitio web
              <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} />
            </label>
          </div>
          <div className="form-group">
            <label>Tipo de soporte requerido *</label>
            <div className="support-choice-grid">
              {supportOptions.map((option) => {
                const isActive = tipoSoporte === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    className={`support-choice ${option.className} ${isActive ? 'is-active' : ''}`.trim()}
                    onClick={() => setTipoSoporte(option.value)}
                  >
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="public-ticket-serial">N° Serie del equipo *</label>
            <input
              id="public-ticket-serial"
              ref={serialInput}
              type="text"
              className={`input-field${serialError ? ' is-invalid' : ''}${serialState.status === 'ok' ? ' is-valid' : ''}`}
              value={numeroSerie}
              onChange={(e) => setNumeroSerie(e.target.value)}
              onBlur={() => setSerialTouched(true)}
              placeholder="Ej. 83400 y 4 números"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(serialError)}
              aria-describedby="public-ticket-serial-status"
              required
            />
            <div id="public-ticket-serial-status" className="serial-status" aria-live="polite">
              {serialState.status === 'checking' ? <span className="serial-status__checking">Buscando el equipo…</span> : null}
              {serialState.status === 'ok' ? (
                <span className="serial-status__ok">
                  ✓ Equipo registrado{serialState.modelo ? `: ${serialState.modelo}` : ''}{serialState.serie ? ` · ${serialState.serie}` : ''}
                </span>
              ) : null}
              {serialError ? <span className="serial-status__error">{serialError}</span> : null}
            </div>
            <button
              type="button"
              className="serial-help-toggle"
              aria-expanded={serialHelpOpen}
              onClick={() => setSerialHelpChoice(!serialHelpOpen)}
            >
              {serialHelpOpen ? 'Ocultar ayuda' : '¿Dónde encuentro el número de serie?'}
            </button>
            {serialHelpOpen ? <PublicSerialHelp key={serialHelpTab} initialTab={serialHelpTab} /> : null}
          </div>

          <div className="form-group">
            <label htmlFor="public-ticket-name">Nombre del Contacto *</label>
            <input
              id="public-ticket-name"
              type="text" 
              className="input-field" 
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María López"
              maxLength={120}
              autoComplete="name"
              required
            />
            <small className="form-group-note">
              Usa nombre real, no área o equipo; si falta, lo pediremos al contactarte.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="public-ticket-phone">Celular (10 dígitos) *</label>
            <input
              id="public-ticket-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="input-field"
              value={celular}
              onChange={(e) => setCelular(phoneDigits(e.target.value))}
              placeholder="Ej. 5551234567"
              pattern="[2-9][0-9]{9}"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="public-ticket-description">Descripción detallada del problema *</label>
            <textarea
              id="public-ticket-description"
              className="input-field public-ticket-textarea" 
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              placeholder="Describe todos los detalles sobre el fallo o mensaje de error que reporta el equipo..."
              required 
            />
          </div>
          
          {errorMsg ? <div className="error-alert public-ticket-form-error" role="alert">{errorMsg}</div> : null}

          <div className="public-ticket-footer">
            <button type="submit" className="button-primary login-btn" disabled={loading}>
            {loading ? 'Procesando...' : 'Crear Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
