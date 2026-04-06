import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Services() {
  const [servicios, setServicios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServicios = async () => {
    setLoading(true);
    // Para simplificar, vemos los servicios vinculados a nuestros tickets
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data, error } = await supabase
        .from('servicios')
        .select('*, tickets!inner(*)')
        .eq('tickets.user_id', user.id)
        .order('fecha_servicio', { ascending: false });
      
      if (!error && data) {
        setServicios(data);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchServicios();
  }, []);

  return (
    <div className="card" style={{ marginTop: '1rem', background: 'var(--bg-secondary)', border: 'none' }}>
      <h3 style={{ marginBottom: '1rem' }}>Historial de Servicios</h3>
      {loading ? (
        <p>Cargando servicios...</p>
      ) : servicios.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No hay servicios registrados en tus equipos aún.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {servicios.map(servicio => (
            <li key={servicio.id} style={{ 
              padding: '1rem', 
              background: 'var(--bg-card)', 
              marginBottom: '0.5rem', 
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Servicio en {servicio.tickets?.asunto}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  {new Date(servicio.fecha_servicio).toLocaleDateString()}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {servicio.detalles_servicio}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
