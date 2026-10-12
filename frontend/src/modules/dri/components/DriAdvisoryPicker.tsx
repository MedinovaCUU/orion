import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { loadAdvisoryCases } from '../driContextData';
import { collectAdvisoryAttachments, type DriAdvisoryCase } from '../utils/sourcePatches';
import type { DriAdvisoryPickerProps } from './driWorkbench.types';
import '../dri.sources.css';

/**
 * Selector de casos de Asesorías: búsqueda, filtros por área y estado, prioridad a la serie del caso y
 * vista previa del caso resaltado antes de traerlo al diagnóstico. El diálogo se monta en cada apertura,
 * por lo que la lectura ocurre una vez por apertura y el estado se reinicia solo.
 */

const AREA_LABELS: Record<string, string> = {
  ingenieria: 'Ingeniería',
  quimica: 'Química',
};

const STATUS_LABELS: Record<string, string> = {
  solicitada: 'Solicitada',
  en_revision: 'En revisión',
  asesorada: 'Asesorada',
  cerrada: 'Cerrada',
};

const MAX_VISIBLE = 80;
const TRAINER_ANSWER_CLIP = 420;

const humanize = (value: string) => {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : value;
};

const areaLabel = (value: string) => AREA_LABELS[value] || humanize(value);
const statusLabel = (value: string) => STATUS_LABELS[value] || humanize(value);

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const normalizeSerial = (value: string | null | undefined) => (value || '').replace(/\s+/g, '').toUpperCase();

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Sin fecha' : dateFormatter.format(parsed);
};

const caseTitle = (item: DriAdvisoryCase) => item.ticket?.asunto?.trim() || item.activity?.trim() || `Asesoría de ${areaLabel(item.area).toLowerCase()}`;
const caseModel = (item: DriAdvisoryCase) => item.equipmentModel || item.platform || null;
const caseSerial = (item: DriAdvisoryCase) => item.ticket?.numero_serie_equipo?.trim() || null;

const searchHaystack = (item: DriAdvisoryCase) =>
  normalize(
    [
      item.ticket?.asunto,
      item.ticket?.numero_serie_equipo,
      item.failure,
      item.failureDetail,
      item.escalatedQuery,
      item.clientName,
      item.ticket?.nombre_cliente_guest,
      item.requesterName,
      item.equipmentModel,
      item.platform,
    ]
      .filter(Boolean)
      .join(' '),
  );

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max).trimEnd()}…` : value);

export default function DriAdvisoryPicker({ open, onClose, onSelect, serialHint }: DriAdvisoryPickerProps) {
  if (!open) return null;
  return <DriAdvisoryPickerDialog onClose={onClose} onSelect={onSelect} serialHint={serialHint} />;
}

type DialogProps = Omit<DriAdvisoryPickerProps, 'open'>;

function DriAdvisoryPickerDialog({ onClose, onSelect, serialHint }: DialogProps) {
  const titleId = useId();
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  // `null` = todavía no se ha leído en esta apertura.
  const [result, setResult] = useState<{ cases: DriAdvisoryCase[]; error: string | null } | null>(null);
  const [query, setQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [onlySerial, setOnlySerial] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const hint = normalizeSerial(serialHint);
  const loading = result === null;
  const error = result?.error || null;
  const cases = useMemo(() => result?.cases || [], [result]);

  useEffect(() => {
    let active = true;
    void loadAdvisoryCases().then((loaded) => {
      if (active) setResult(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [],
      ).filter((element) => element.offsetParent !== null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // Trampa de foco: Tab circula dentro del diálogo (aria-modal).
      if (event.key === 'Tab') {
        const elements = focusable();
        if (!elements.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    searchRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      // Al cerrar, el foco vuelve al botón que abrió el selector.
      opener?.focus();
    };
  }, [onClose]);

  const areas = useMemo(() => Array.from(new Set(cases.map((item) => item.area).filter(Boolean))).sort((a, b) => areaLabel(a).localeCompare(areaLabel(b), 'es')), [cases]);
  const statuses = useMemo(() => Array.from(new Set(cases.map((item) => item.status).filter(Boolean))), [cases]);
  const serialMatches = useMemo(() => (hint ? cases.filter((item) => normalizeSerial(caseSerial(item)) === hint).length : 0), [cases, hint]);

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = cases.filter((item) => {
      if (areaFilter && item.area !== areaFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (onlySerial && hint && normalizeSerial(caseSerial(item)) !== hint) return false;
      if (needle && !searchHaystack(item).includes(needle)) return false;
      return true;
    });
    if (!hint) return filtered.slice(0, MAX_VISIBLE);
    // Las coincidencias de serie van primero; el orden por fecha se conserva dentro de cada grupo.
    const matching = filtered.filter((item) => normalizeSerial(caseSerial(item)) === hint);
    const rest = filtered.filter((item) => normalizeSerial(caseSerial(item)) !== hint);
    return [...matching, ...rest].slice(0, MAX_VISIBLE);
  }, [areaFilter, cases, hint, onlySerial, query, statusFilter]);

  const highlighted = useMemo(() => visible.find((item) => item.id === highlightedId) || visible[0] || null, [highlightedId, visible]);
  const highlightedIndex = highlighted ? visible.indexOf(highlighted) : -1;

  useEffect(() => {
    if (!highlighted) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-case-id="${highlighted.id}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const moveHighlight = (delta: number) => {
    if (!visible.length) return;
    const nextIndex = Math.min(visible.length - 1, Math.max(0, (highlightedIndex < 0 ? 0 : highlightedIndex) + delta));
    const next = visible[nextIndex];
    setHighlightedId(next.id);
    const list = listRef.current;
    if (list && document.activeElement && list.contains(document.activeElement)) {
      list.querySelector<HTMLElement>(`[data-case-id="${next.id}"]`)?.focus();
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === 'Enter' && highlighted && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      onSelect(highlighted);
    }
  };

  // Un clic solo resalta y muestra la vista previa; traer el caso exige doble clic, Intro o el botón.
  const handleItemClick = (item: DriAdvisoryCase) => {
    setHighlightedId(item.id);
  };

  const attachments = useMemo(() => (highlighted ? collectAdvisoryAttachments(highlighted.metadata) : []), [highlighted]);

  const previewFields = highlighted
    ? [
        { label: 'Serie', value: caseSerial(highlighted) || 'Sin serie' },
        { label: 'Modelo', value: caseModel(highlighted) || 'Sin modelo' },
        { label: 'Cliente', value: highlighted.clientName || highlighted.ticket?.nombre_cliente_guest || 'Sin cliente' },
        { label: 'Solicitante', value: highlighted.requesterName || 'No registrado' },
        { label: 'Fecha', value: formatDate(highlighted.createdAt) },
        { label: 'Estado', value: statusLabel(highlighted.status) },
      ]
    : [];

  const previewSections = highlighted
    ? [
        { label: 'Avería', value: [highlighted.failure, highlighted.failureDetail].filter(Boolean).join('\n') },
        { label: 'Pasos seguidos', value: highlighted.stepsTaken || '' },
        { label: 'Ajustes', value: highlighted.adjustments || '' },
        { label: 'Acciones tomadas', value: highlighted.actionsTaken || '' },
        { label: 'Consulta escalada', value: highlighted.escalatedQuery || '' },
        { label: 'Respuesta del trainer', value: highlighted.trainerAnswer ? clip(highlighted.trainerAnswer, TRAINER_ANSWER_CLIP) : '' },
      ].filter((section) => section.value.trim())
    : [];

  return createPortal(
    <div className="sat-importer__backdrop dri-advisory__backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="sat-importer__dialog dri-advisory" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleDialogKeyDown}>
        <header className="dri-advisory__header">
          <div className="dri-advisory__heading">
            <span className="dri-panel__eyebrow dri-advisory__eyebrow">Asesorías</span>
            <h2 id={titleId}>Traer caso al diagnóstico</h2>
            <p>La asesoría precarga serie, equipo, narrativa y adjuntos; nada se confirma como falla.</p>
          </div>
          <button type="button" className="dri-advisory__close" onClick={onClose} aria-label="Cerrar selector">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="dri-advisory__body">
          <div className="dri-advisory__list-pane">
            <div className="dri-advisory__search">
              <input
                ref={searchRef}
                className="input-field dri-advisory__search-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por serie, asunto, avería, consulta, cliente o solicitante"
                aria-label="Buscar asesorías"
                aria-controls={listId}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="dri-advisory__count" aria-live="polite">
                {loading ? 'Leyendo…' : `${visible.length} de ${cases.length}`}
              </span>
            </div>

            {areas.length || statuses.length || hint ? (
              <div className="dri-advisory__filters">
                {areas.length > 1 ? (
                  <div className="dri-advisory__chip-group" role="group" aria-label="Filtrar por área">
                    {areas.map((area) => (
                      <button
                        key={area}
                        type="button"
                        className={`dri-advisory__chip${areaFilter === area ? ' is-active' : ''}`}
                        aria-pressed={areaFilter === area}
                        onClick={() => setAreaFilter((current) => (current === area ? null : area))}
                      >
                        {areaLabel(area)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {statuses.length > 1 ? (
                  <div className="dri-advisory__chip-group" role="group" aria-label="Filtrar por estado">
                    {statuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`dri-advisory__chip${statusFilter === status ? ' is-active' : ''}`}
                        aria-pressed={statusFilter === status}
                        onClick={() => setStatusFilter((current) => (current === status ? null : status))}
                      >
                        {statusLabel(status)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {hint ? (
                  <button
                    type="button"
                    className={`dri-advisory__chip dri-advisory__chip--serial${onlySerial ? ' is-active' : ''}`}
                    aria-pressed={onlySerial}
                    onClick={() => setOnlySerial((current) => !current)}
                    title={`Solo asesorías de la serie ${serialHint.trim()}`}
                  >
                    Solo esta serie
                    {!loading ? <span className="dri-advisory__chip-count">{serialMatches}</span> : null}
                  </button>
                ) : null}
              </div>
            ) : null}

            {loading ? (
              <div className="dri-advisory__state" role="status">
                <span className="dri-advisory__ring" aria-hidden="true" />
                Leyendo asesorías recientes…
              </div>
            ) : null}

            {error ? (
              <div className="dri-advisory__state dri-advisory__state--error" role="alert">
                No fue posible leer asesorías: {error}
              </div>
            ) : null}

            {!loading && !error && !cases.length ? <div className="dri-advisory__state">No hay asesorías recientes.</div> : null}

            {!loading && cases.length && !visible.length ? <div className="dri-advisory__state">No hay asesorías que coincidan con la búsqueda.</div> : null}

            {visible.length ? (
              <ul id={listId} ref={listRef} className="dri-advisory__list" role="listbox" aria-label="Asesorías disponibles">
                {visible.map((item) => {
                  const serialValue = caseSerial(item);
                  const matchesHint = Boolean(hint) && normalizeSerial(serialValue) === hint;
                  const isHighlighted = highlighted?.id === item.id;
                  return (
                    <li key={item.id} role="option" aria-selected={isHighlighted}>
                      <button
                        type="button"
                        className={`dri-advisory__item${isHighlighted ? ' is-highlighted' : ''}`}
                        data-case-id={item.id}
                        data-status={item.status}
                        aria-current={isHighlighted ? 'true' : undefined}
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => onSelect(item)}
                      >
                        <span className="dri-advisory__item-top">
                          <strong>{caseTitle(item)}</strong>
                          <span className="dri-mini-badge dri-advisory__item-status" data-status={item.status}>
                            {statusLabel(item.status)}
                          </span>
                        </span>
                        <span className="dri-advisory__item-meta">
                          <span className={`dri-advisory__item-serial${matchesHint ? ' is-match' : ''}`}>{serialValue || 'Sin serie'}</span>
                          <span>{caseModel(item) || 'Sin modelo'}</span>
                          <span>{areaLabel(item.area)}</span>
                          <span>{formatDate(item.createdAt)}</span>
                        </span>
                        <span className="dri-advisory__item-excerpt">{item.failure || clip(item.escalatedQuery, 140)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <aside className="dri-advisory__preview" aria-label="Vista previa del caso resaltado">
            {highlighted ? (
              <>
                <div className="dri-advisory__preview-head">
                  <span className="dri-panel__eyebrow">Vista previa</span>
                  <div className="dri-advisory__preview-badges">
                    <span className="dri-mini-badge">{areaLabel(highlighted.area)}</span>
                    <span className="dri-mini-badge dri-advisory__item-status" data-status={highlighted.status}>
                      {statusLabel(highlighted.status)}
                    </span>
                  </div>
                </div>
                <h3 className="dri-advisory__preview-title">{caseTitle(highlighted)}</h3>

                <dl className="dri-advisory__fields">
                  {previewFields.map((field) => (
                    <div key={field.label} className="dri-advisory__field">
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="dri-advisory__sections">
                  {previewSections.map((section) => (
                    <section key={section.label} className="dri-advisory__section">
                      <span className="dri-advisory__section-label">{section.label}</span>
                      <p>{section.value}</p>
                    </section>
                  ))}
                  <section className="dri-advisory__section">
                    <span className="dri-advisory__section-label">Adjuntos · {attachments.length}</span>
                    {attachments.length ? (
                      <ul className="dri-advisory__attachments">
                        {attachments.slice(0, 6).map((attachment) => (
                          <li key={attachment.id}>{attachment.fileName}</li>
                        ))}
                        {attachments.length > 6 ? <li className="dri-advisory__attachments-more">y {attachments.length - 6} más</li> : null}
                      </ul>
                    ) : (
                      <p>Sin adjuntos en el hilo.</p>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <div className="dri-advisory__preview-empty">
                <span className="dri-panel__eyebrow">Vista previa</span>
                <p>{loading ? 'La vista previa aparece al terminar la lectura.' : 'Resalta un caso para revisarlo antes de traerlo.'}</p>
              </div>
            )}

            <div className="dri-advisory__footer">
              <span className="dri-advisory__keys" aria-hidden="true">
                <kbd>↑</kbd>
                <kbd>↓</kbd> resaltar · <kbd>Intro</kbd> traer
              </span>
              <div className="dri-advisory__footer-actions">
                <button type="button" className="dri-ghost-button" onClick={onClose}>
                  Cancelar
                </button>
                <button type="button" className="dri-pill-button dri-src-btn--apply" onClick={() => highlighted && onSelect(highlighted)} disabled={!highlighted}>
                  Traer al diagnóstico
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}
