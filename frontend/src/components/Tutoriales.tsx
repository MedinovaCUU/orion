import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Tutoriales() {
  const [tutoriales, setTutoriales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTutoriales = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tutoriales')
      .select('*')
      .eq('activo', true)
      .order('creado_en', { ascending: false });
    
    if (!error && data) {
      setTutoriales(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTutoriales();
  }, []);

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="card" style={{ background: 'var(--bg-secondary)', border: 'none' }}>
        <h3 style={{ marginBottom: '1rem' }}>Biblioteca de Tutoriales</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Aprende a diagnosticar y reparar equipos con nuestras guías paso a paso.</p>
        
        {loading ? (
          <p>Cargando tutoriales...</p>
        ) : tutoriales.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Aún no hay tutoriales disponibles.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {tutoriales.map(tut => (
              <div key={tut.id} style={{ 
                background: 'var(--bg-card)', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ 
                  height: '160px', 
                  background: 'var(--bg-color)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  borderBottom: '1px solid var(--border-color)'
                }}>
                  {tut.url_video ? (
                    <span style={{ color: 'var(--text-secondary)' }}>Video Placeholder<br/>{tut.url_video}</span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>Sin video</span>
                  )}
                </div>
                <div style={{ padding: '1rem', flex: 1 }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>{tut.titulo}</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {tut.descripcion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
