import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Tickets() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [asunto, setAsunto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('creado_en', { ascending: false });
    
    if (!error && data) {
      setTickets(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      await supabase.from('tickets').insert([{
        user_id: user.id,
        asunto: asunto,
        descripcion: descripcion
      }]);
      setAsunto('');
      setDescripcion('');
      fetchTickets();
    }
    setSubmitting(false);
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none', marginBottom: '1rem' }}>
        <h3>Abrir un Nuevo Ticket</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Asunto</label>
            <input type="text" className="input-field" value={asunto} onChange={(e) => setAsunto(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Descripción del Problema</label>
            <textarea className="input-field" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required rows={3}></textarea>
          </div>
          <button type="submit" className="button-primary" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
            {submitting ? 'Enviando...' : 'Crear Ticket'}
          </button>
        </form>
      </div>

      <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
        <h3 style={{ marginBottom: '1rem' }}>Mis Tickets de Soporte</h3>
      {loading ? (
        <p>Cargando tickets...</p>
      ) : tickets.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No tienes tickets aún.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {tickets.map(ticket => (
            <li key={ticket.id} style={{ 
              padding: '1rem', 
              background: 'var(--bg-card)', 
              marginBottom: '0.5rem', 
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{ticket.asunto}</strong>
                <span style={{ 
                  background: ticket.estado === 'abierto' ? 'var(--error-color)' : 'var(--success-color)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  color: '#fff',
                  textTransform: 'uppercase'
                }}>{ticket.estado}</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                {ticket.descripcion}
              </p>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
