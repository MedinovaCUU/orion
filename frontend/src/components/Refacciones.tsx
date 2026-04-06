import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Refacciones() {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipo, setEquipo] = useState('');
  const [pieza, setPieza] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const fetchSolicitudes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('refacciones_solicitudes')
      .select('*')
      .order('fecha_solicitud', { ascending: false });
    
    if (!error && data) {
      setSolicitudes(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      await supabase.from('refacciones_solicitudes').insert([{
        user_id: user.id,
        equipo_modelo: equipo,
        nombre_pieza: pieza,
        cantidad: cantidad
      }]);
      setEquipo('');
      setPieza('');
      setCantidad(1);
      fetchSolicitudes();
    }
    setSubmitting(false);
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none', marginBottom: '1rem' }}>
        <h3>Solicitar Nueva Refacción</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Equipo/Modelo</label>
            <input type="text" className="input-field" value={equipo} onChange={(e) => setEquipo(e.target.value)} required />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Nombre de la Pieza</label>
            <input type="text" className="input-field" value={pieza} onChange={(e) => setPieza(e.target.value)} required />
          </div>
          <div style={{ width: '80px' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Cant.</label>
            <input type="number" className="input-field" value={cantidad} onChange={(e) => setCantidad(parseInt(e.target.value))} min={1} required />
          </div>
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Solicitar'}
          </button>
        </form>
      </div>

      <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
        <h3 style={{ marginBottom: '1rem' }}>Mis Solicitudes Activas</h3>
        {loading ? (
          <p>Cargando solicitudes...</p>
        ) : solicitudes.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No tienes solicitudes de refacciones.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {solicitudes.map(sol => (
              <li key={sol.id} style={{ 
                padding: '1rem', background: 'var(--bg-card)', marginBottom: '0.5rem', 
                borderRadius: '8px', border: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>{sol.nombre_pieza} (x{sol.cantidad})</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Modelo: {sol.equipo_modelo}</p>
                </div>
                <span style={{ 
                  background: sol.estado_solicitud === 'pendiente' ? '#d97706' : 
                              sol.estado_solicitud === 'aprobada' ? 'var(--success-color)' : 
                              sol.estado_solicitud === 'rechazada' ? 'var(--error-color)' : '#3b82f6',
                  padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', color: '#fff', textTransform: 'uppercase'
                }}>{sol.estado_solicitud}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
