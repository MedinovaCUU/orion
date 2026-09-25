import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import TutorialModal from './TutorialModal';
import {
  getTutorialImportance,
  localTutorials,
  type TutorialDefinition,
  type TutorialImportance,
  isStructuredTutorial,
} from '../data/tutorialCatalog';
import './Tutoriales.css';

const IMPORTANCE_LABELS: Record<TutorialImportance, string> = {
  basico: 'Básico',
  medio: 'Medio',
  alto: 'Alto',
  critico: 'Crítico',
};

export default function Tutoriales({ allowedImportance = ['basico'] }: { allowedImportance?: string[] }) {
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

  const allowedLevels = new Set(['basico', ...allowedImportance]);
  const tutoriales = [...localTutorials, ...dbTutorials].filter((tutorial) =>
    allowedLevels.has(getTutorialImportance(tutorial)),
  );
  const selectedTutorial = tutoriales.find((t) => t.id === selectedTutorialId) || null;

  useEffect(() => {
    fetchTutoriales();
  }, []);

  const getSeverityClass = (level: TutorialImportance) => {
    switch (level) {
      case 'critico':
        return 'tutoriales-item__severity tutoriales-item__severity--critico';
      case 'alto':
        return 'tutoriales-item__severity tutoriales-item__severity--alto';
      case 'medio':
        return 'tutoriales-item__severity tutoriales-item__severity--medio';
      case 'basico':
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
              const importance = getTutorialImportance(tut);
              return (
                <div key={tut.id} onClick={() => setSelectedTutorialId(tut.id)} className="tutoriales-item">
                  <div className="tutoriales-item__hero">
                    <div className="tutoriales-item__top">
                      <span className="tutoriales-item__eyebrow">{structured ? tut.equipo : 'Tutorial'}</span>
                      <span className={getSeverityClass(importance)}>{IMPORTANCE_LABELS[importance]}</span>
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
