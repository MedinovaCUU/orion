import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import BrandLockup from './BrandLockup';

export default function PublicTicketForm() {
  const [tipoSoporte, setTipoSoporte] = useState<'Ingeniero' | 'Químico' | null>(null);
  const [numeroSerie, setNumeroSerie] = useState('');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
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
    
    const { error } = await supabase.from('tickets').insert([{
        asunto: `Soporte ${tipoSoporte}: Reporte en equipo ${trimmedSerie}`,
        descripcion: trimmedDescripcion,
        numero_serie_equipo: trimmedSerie,
        nombre_cliente_guest: trimmedNombre,
        telefono_cliente_guest: trimmedCelular,
        estado: 'abierto'
    }]);

    if (error) {
        setErrorMsg('Error al enviar el ticket: ' + error.message);
    } else {
        setSuccess(true);
    }
    setLoading(false);
  };

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
