import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { publicSurveyClient as supabase } from './publicSurveyClient';
import { attireOptions, improvements } from './model';
import { ORION_BRAND_ASSETS } from '../orionBrandAssets';
import './surveyPage.css';

type SurveyInfo = { case_number: string; specialist_name: string | null; answered: boolean; is_test?: boolean };

const BASE = `${import.meta.env.BASE_URL || '/'}`.replace(/\/?$/, '/');
const BIOSYSTEMS_WORDMARK = `${BASE}bios-brand/BioS_wordmark_red.png`;
const INVALID_LINK = 'Este enlace no es válido o ya venció.';
const LOAD_FAILED = 'No pudimos cargar la encuesta. Intenta de nuevo.';
/** Campos que cuentan para el avance (el comentario es opcional). */
const QUESTIONS = ['satisfaction', 'speed', 'resolution', 'clarity', 'attire', 'improvement'] as const;
const COMMENT_MAX = 1000;

function Question({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="svp__question">
      <legend>
        <span className="svp__qnum">Pregunta {n} de {QUESTIONS.length}</span>
        <span className="svp__qtext">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function Rating({ name, low, high }: { name: string; low: string; high: string }) {
  return (
    <>
      <div className="svp__rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n}>
            <input type="radio" required name={name} value={n} aria-label={`${n}${n === 1 ? ` · ${low}` : n === 5 ? ` · ${high}` : ''}`} />
            <span>{n}</span>
          </label>
        ))}
      </div>
      <div className="svp__scale" aria-hidden>
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </>
  );
}

function Option({ name, value, label, required = true }: { name: string; value: string; label: string; required?: boolean }) {
  return (
    <label className="svp__option">
      <input type="radio" required={required} name={name} value={value} />
      <span>{label}</span>
    </label>
  );
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="m6.5 12.4 3.6 3.6 7.4-7.6" /></svg>
);
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M12 7.5v6M12 16.8h.01" /></svg>
);

/**
 * Encuesta pública de satisfacción (la abre un cliente desde su enlace). Mientras consulta el enlace no pinta nada:
 * el splash de `App` la cubre y espera a `onReady`, así que aparece ya con sus preguntas, el agradecimiento o el aviso.
 */
export default function SurveyPage({ onReady }: { onReady?: () => void } = {}) {
  const [info, setInfo] = useState<SurveyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [commentLength, setCommentLength] = useState(0);
  const token = window.location.hash.slice(1);
  const validToken = /^[a-f0-9]{64}$/.test(token);

  useEffect(() => {
    if (!loading) onReady?.();
  }, [loading, onReady]);

  useEffect(() => {
    if (!validToken) {
      setError(INVALID_LINK);
      setLoading(false);
      return;
    }
    let active = true;
    void supabase.rpc('get_ticket_satisfaction', { p_token: token }).then(({ data, error }) => {
      if (!active) return;
      setInfo(data);
      setError(error ? LOAD_FAILED : !data ? INVALID_LINK : '');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token, validToken]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const f = new FormData(event.currentTarget);
    try {
      const { error } = await supabase.rpc('submit_ticket_satisfaction', {
        p_token: token,
        p_satisfaction: Number(f.get('satisfaction')),
        p_speed: Number(f.get('speed')),
        p_resolution: f.get('resolution'),
        p_clarity: f.get('clarity') === 'na' ? null : Number(f.get('clarity')),
        p_improvement: f.get('improvement'),
        p_attire: f.get('attire'),
        p_comment: f.get('comment'),
      });
      if (error) throw error;
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message || 'No se pudo confirmar. Recarga para comprobar si se guardó.');
    } finally {
      setBusy(false);
    }
  }

  const track = (event: FormEvent<HTMLFormElement>) => {
    const f = new FormData(event.currentTarget);
    setAnswered(QUESTIONS.filter((name) => f.get(name) !== null).length);
    setCommentLength(String(f.get('comment') || '').length);
  };

  let body: ReactNode = null;
  if (loading) {
    body = null;
  } else if (done || info?.answered) {
    body = (
      <div className="svp__state svp__state--ok" role="status">
        <span className="svp__state-icon"><CheckIcon /></span>
        <h2>Gracias por tu evaluación</h2>
        <p>Tu respuesta quedó registrada. Nos ayudará a mejorar la atención.</p>
      </div>
    );
  } else if (!info) {
    const invalid = error !== LOAD_FAILED;
    body = (
      <div className="svp__state svp__state--error" role="alert">
        <span className="svp__state-icon"><AlertIcon /></span>
        <h2>{invalid ? INVALID_LINK : 'No pudimos cargar la encuesta.'}</h2>
        {invalid ? <p>Pide a tu contacto de BioSystems un enlace nuevo.</p> : (
          <button type="button" className="svp__secondary" onClick={() => window.location.reload()}>Intentar de nuevo</button>
        )}
      </div>
    );
  } else {
    const remaining = QUESTIONS.length - answered;
    body = (
      <>
        <ul className="svp__meta">
          <li>{QUESTIONS.length} preguntas</li>
          <li>1 minuto</li>
          <li>Sin registrarte</li>
        </ul>
        <dl className="svp__service">
          <div>
            <dt>Servicio</dt>
            <dd>{info.case_number}</dd>
          </div>
          {info.specialist_name && (
            <div>
              <dt>Especialista</dt>
              <dd>{info.specialist_name}</dd>
            </div>
          )}
        </dl>
        {info.is_test && <p className="svp__test">Encuesta de prueba · no afecta las métricas del personal.</p>}
        <form onSubmit={(event) => void submit(event)} onChange={track}>
          <div
            className={`svp__progress${remaining === 0 ? ' svp__progress--done' : ''}`}
            role="progressbar"
            aria-label="Preguntas respondidas"
            aria-valuemin={0}
            aria-valuemax={QUESTIONS.length}
            aria-valuenow={answered}
          >
            <span>{remaining === 0 ? 'Todo listo para enviar' : `${answered} de ${QUESTIONS.length} respondidas`}</span>
            <i style={{ transform: `scaleX(${answered / QUESTIONS.length})` }} />
          </div>
          <fieldset disabled={busy} className="svp__questions">
            <Question n={1} title="¿Qué tan satisfecho quedó con el servicio recibido?">
              <Rating name="satisfaction" low="Muy insatisfecho" high="Muy satisfecho" />
            </Question>
            <Question n={2} title="¿Qué tan adecuada fue la rapidez de nuestra atención para la urgencia de su solicitud?">
              <Rating name="speed" low="Muy inadecuada" high="Muy adecuada" />
            </Question>
            <Question n={3} title="¿En qué medida quedó resuelta su solicitud?">
              <div className="svp__options">
                <Option name="resolution" value="total" label="Totalmente" />
                <Option name="resolution" value="partial" label="Parcialmente" />
                <Option name="resolution" value="unresolved" label="No resuelta" />
              </div>
            </Question>
            <Question n={4} title="¿Qué tan claras fueron las explicaciones e indicaciones del especialista?">
              <Rating name="clarity" low="Nada claras" high="Muy claras" />
              <div className="svp__options">
                <Option name="clarity" value="na" label="No aplica" required={false} />
              </div>
            </Question>
            <Question n={5} title="Si lo visitamos en sitio, ¿nuestro personal se presentó con bata de laboratorio y gafete de identificación?">
              <div className="svp__options">
                {Object.entries(attireOptions).map(([value, label]) => <Option key={value} name="attire" value={value} label={label} />)}
              </div>
            </Question>
            <Question n={6} title="¿Qué es lo principal que deberíamos mejorar en nuestro servicio?">
              <div className="svp__options">
                {Object.entries(improvements).map(([value, label]) => <Option key={value} name="improvement" value={value} label={label} />)}
              </div>
            </Question>
            <label className="svp__comment">
              <span className="svp__comment-head">
                <span>Comentario <em>(opcional)</em></span>
                <span className="svp__count">{commentLength}/{COMMENT_MAX}</span>
              </span>
              <textarea name="comment" maxLength={COMMENT_MAX} rows={4} placeholder="Cuéntanos qué podemos mejorar. No incluyas datos de pacientes." />
            </label>
            {error && <p role="alert" className="svp__alert">{error}</p>}
            <button className="svp__submit" disabled={busy}>{busy ? 'Guardando…' : 'Enviar evaluación'}</button>
            <p className="svp__fineprint">Tu evaluación se vincula a este servicio y será revisada por administración. No es un canal de atención urgente.</p>
          </fieldset>
        </form>
      </>
    );
  }

  return (
    <main className="svp">
      <div className="svp__shell">
        <header className="svp__brand">
          <img className="svp__orion" src={ORION_BRAND_ASSETS.wordmark} alt="Orion by Medinova" draggable={false} />
          <img className="svp__biosystems" src={BIOSYSTEMS_WORDMARK} alt="BioSystems" draggable={false} />
        </header>
        {!loading && (
          <section className="svp__card">
            <span className="svp__eyebrow">Experiencia de servicio</span>
            <h1 className="svp__title">Tu experiencia nos ayuda a mejorar.</h1>
            {body}
          </section>
        )}
        <footer className="svp__footer">BioSystems · Orion by Medinova</footer>
      </div>
    </main>
  );
}
