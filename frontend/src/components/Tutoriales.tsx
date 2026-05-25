import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import TutorialModal from './TutorialModal';
import { localTutorials, type TutorialDefinition, isStructuredTutorial } from '../data/tutorialCatalog';
import './Tutoriales.css';

export default function Tutoriales() {
  const [dbTutorials, setDbTutorials] = useState<TutorialDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTutorialId, setSelectedTutorialId] = useState<string | null>(null);

  const fetchTutoriales = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tutoriales')
      .select('*')
      .eq('activo', true)
      .order('creado_en', { ascending: false });

    if (!error && data) {
      const dbTuts: TutorialDefinition[] = data.map((t) => ({
        kind: 'legacy',
        ...t,
        instrucciones: ['Video tutorial básico.', 'Sigue las instrucciones en pantalla.'],
      }));
      setDbTutorials(dbTuts);
    }
    setLoading(false);
  };

  const tutoriales = [...localTutorials, ...dbTutorials];
  const selectedTutorial = tutoriales.find((t) => t.id === selectedTutorialId) || null;

  useEffect(() => {
    fetchTutoriales();
  }, []);

  const getSeverityClass = (level: string) => {
    switch (level) {
      case 'Crítico':
        return 'tutoriales-item__severity tutoriales-item__severity--critico';
      case 'Alto':
        return 'tutoriales-item__severity tutoriales-item__severity--alto';
      case 'Medio':
        return 'tutoriales-item__severity tutoriales-item__severity--medio';
      case 'Bajo':
        return 'tutoriales-item__severity tutoriales-item__severity--bajo';
      default:
        return 'tutoriales-item__severity';
    }
  };

  return (
    <div className="tutoriales-shell">
      <div className="card tutoriales-card-shell">
        <div className="tutoriales-intro">
          <h3>Biblioteca de Tutoriales</h3>
          <p>Guías técnicas orientadas a campo para diagnóstico, ajuste, mantenimiento y desmontaje.</p>
        </div>

        {loading ? (
          <p>Cargando tutoriales...</p>
        ) : tutoriales.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Aún no hay tutoriales disponibles.</p>
        ) : (
          <div className="tutoriales-grid">
            {tutoriales.map((tut) => {
              const structured = isStructuredTutorial(tut);
              return (
                <div key={tut.id} onClick={() => setSelectedTutorialId(tut.id)} className="tutoriales-item">
                  <div className="tutoriales-item__hero">
                    <div className="tutoriales-item__top">
                      <span className="tutoriales-item__eyebrow">{structured ? tut.equipo : 'Tutorial'}</span>
                      {structured && (
                        <span className={getSeverityClass(tut.criticidad.nivel)}>
                          {tut.criticidad.nivel}
                        </span>
                      )}
                    </div>

                    <div className="tutoriales-item__copy">
                      <strong className="tutoriales-item__title">{tut.titulo}</strong>
                      <p className="tutoriales-item__description">{tut.descripcion}</p>
                    </div>

                    {structured ? (
                      <div className="tutoriales-item__stats">
                        <div className="tutoriales-item__stat">
                          <div className="tutoriales-item__stat-label">Dificultad</div>
                          <div className="tutoriales-item__stat-value">{tut.dificultad.nivel}</div>
                        </div>
                        <div className="tutoriales-item__stat">
                          <div className="tutoriales-item__stat-label">Tiempo</div>
                          <div className="tutoriales-item__stat-value">{tut.tiempo}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="tutoriales-item__assist">{tut.url_video ? 'Incluye video' : 'Guía textual'}</div>
                    )}
                  </div>

                  {structured && (
                    <div className="tutoriales-item__footer">
                      <div className="tutoriales-item__tags">
                        {tut.etiquetas.slice(0, 4).map((tag) => (
                          <span key={`${tut.id}-${tag}`} className="tutoriales-item__tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TutorialModal
        isOpen={selectedTutorial !== null}
        tutorial={selectedTutorial}
        onClose={() => setSelectedTutorialId(null)}
      />
    </div>
  );
}
