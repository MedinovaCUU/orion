import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import BrandLockup from './BrandLockup';

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
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdCaseNumber, setCreatedCaseNumber] = useState('');
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
      title: 'Quimica 🧪',
      description: 'Programación, técnicas nuevas, reactivos, calibración, control de calidad, soporte funcional.',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoSoporte) {
        setErrorMsg('Por favor selecciona el tipo de soporte que requieres.');
        return;
    }
    
    const trimmedNombre = nombre.trim();
    const trimmedSerie = numeroSerie.trim();
    const trimmedCelular = celular.trim();
    const trimmedDescripcion = descripcion.trim();

    if (!trimmedNombre) {
        setErrorMsg('Por favor captura el nombre del contacto.');
        return;
    }
    
    setLoading(true);
    setErrorMsg('');
    
    const { data, error } = await supabase.rpc('create_public_support_case', {
      p_support_type: tipoSoporte,
      p_serial: trimmedSerie,
      p_contact_name: trimmedNombre,
      p_phone: trimmedCelular,
      p_description: trimmedDescripcion,
    });

    if (error) {
        setErrorMsg('Error al enviar el ticket: ' + error.message);
    } else {
        const resultRow = Array.isArray(data) ? data[0] : data;
        setCreatedCaseNumber(resultRow?.numero_caso || 'Caso registrado');
        setSuccess(true);
    }
    setLoading(false);
  };

  const handleTracking = async (event: React.FormEvent) => {
    event.preventDefault();
    setTrackingLoading(true);
    setTrackingError('');
    setTrackingResult(null);
    const { data, error } = await supabase.rpc('track_public_support_case', {
      p_case_number: trackingCase.trim(),
      p_phone: trackingPhone.trim(),
    });
    if (error) {
      setTrackingError('No fue posible consultar el caso en este momento.');
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

  if (success) {
      return (
          <div className="login-container login-container--public">
              <div className="card login-card login-card--public public-ticket-success-card">
                  <BrandLockup
                      variant="public"
                      eyebrow="BioSystems"
                      title="Ticket registrado"
                      subtitle="Tu solicitud ya quedó dentro del flujo operativo de Orion."
                  />
                  <div className="public-ticket-success-copy">
                    <span className="public-ticket-success-tag">Flujo activo</span>
                    <h2 className="login-title">Ticket enviado exitosamente</h2>
                    <p className="login-subtitle">
                      Recibimos la información del equipo y la descripción del problema.
                    </p>
                    <div className="public-ticket-case-number">
                      <span>Tu número de caso</span>
                      <strong>{createdCaseNumber}</strong>
                      <small>Guárdalo junto con el teléfono registrado para consultar cada avance.</small>
                    </div>
                    <p className="public-ticket-success-note">
                      Un ingeniero o químico se pondrá en contacto contigo muy pronto al número registrado.
                    </p>
                  </div>
                  <button 
                      className="button-primary" 
                      type="button"
                      onClick={() => {
                          setSuccess(false);
                          setNumeroSerie('');
                          setNombre('');
                          setCelular('');
                          setDescripcion('');
                          setTipoSoporte(null);
                          setCreatedCaseNumber('');
                      }}
                  >
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

        {errorMsg && <div className="error-alert">{errorMsg}</div>}

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
                <input className="input-field" type="tel" value={trackingPhone} onChange={(event) => setTrackingPhone(event.target.value)} pattern="[0-9]{10}" placeholder="10 dígitos" required />
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

        <form onSubmit={handleSubmit} className="login-form">
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
            <label>N° Serie del equipo *</label>
            <input 
              type="text" 
              className="input-field" 
              value={numeroSerie}
              onChange={(e) => setNumeroSerie(e.target.value)}
              placeholder="Ej. 831015648"
              required 
            />
          </div>

          <div className="form-group">
            <label>Nombre del Contacto *</label>
            <input 
              type="text" 
              className="input-field" 
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María López"
              required
            />
            <small className="form-group-note">
              Usa nombre real, no área o equipo; si falta, lo pediremos al contactarte.
            </small>
          </div>

          <div className="form-group">
            <label>Celular (10 dígitos) *</label>
            <input 
              type="tel" 
              className="input-field" 
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              placeholder="Ej. 5551234567"
              pattern="[0-9]{10}"
              required 
            />
          </div>

          <div className="form-group">
            <label>Descripción detallada del problema *</label>
            <textarea 
              className="input-field public-ticket-textarea" 
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describe todos los detalles sobre el fallo o mensaje de error que reporta el equipo..."
              required 
            />
          </div>
          
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
