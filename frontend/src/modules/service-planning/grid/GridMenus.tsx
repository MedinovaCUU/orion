import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatPlanningPersonName, normalizeText, STATUS_LABELS } from '../helpers/normalizeService';
import type { CustomColumn, SavedView } from './planningBackend';
import { TYPE_LABELS, type GridColumn } from './planningColumns';
import type { FilterKey, GridFilters } from './planningFilters';
import { SERVICE_STATUSES } from './planningRecord';
import { addDays, mondayOf, weekFromMonday, weeksOfMonth, shiftMonth, type PlanningWeek } from './planningWeeks';
import type { ConflictRules } from './scheduleConflicts';

// Small floating panels of the grid: they open next to what was clicked and close on Escape or outside clicks.

export function Floating({ x, y, onClose, children, className = '', label }: { x: number; y: number; onClose: () => void; children: ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className={`pgrid-floating ${className}`} role="dialog" aria-label={label} style={{ left: position.left, top: position.top }}>
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  separator?: boolean;
}

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [index, setIndex] = useState(() => items.findIndex((item) => !item.separator && !item.disabled));
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => listRef.current?.focus(), []);
  const move = (delta: number) => {
    let next = index;
    for (let guard = 0; guard < items.length; guard += 1) {
      next = (next + delta + items.length) % items.length;
      if (!items[next].separator && !items[next].disabled) break;
    }
    setIndex(next);
  };
  return (
    <ul
      ref={listRef}
      className="pgrid-menu"
      role="menu"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'Enter' && items[index]?.onSelect) {
          event.preventDefault();
          items[index].onSelect!();
          onClose();
        }
      }}
    >
      {items.map((item, itemIndex) =>
        item.separator ? (
          <li key={`sep-${itemIndex}`} className="pgrid-menu__sep" role="separator" />
        ) : (
          <li
            key={item.label}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            className={`${item.danger ? 'is-danger' : ''} ${itemIndex === index ? 'is-focus' : ''}`}
            onMouseEnter={() => setIndex(itemIndex)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (item.disabled || !item.onSelect) return;
              item.onSelect();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.hint ? <kbd>{item.hint}</kbd> : null}
          </li>
        ),
      )}
    </ul>
  );
}

// ----- filters -----
const FILTER_LABELS: Record<FilterKey, string> = {
  engineer: 'Ingeniero',
  serviceType: 'Tipo de servicio',
  platform: 'Plataforma',
  locality: 'Cliente / localidad',
  status: 'Estado',
  week: 'Semana',
};

export interface FilterOptions {
  engineer: string[];
  serviceType: string[];
  platform: string[];
  locality: string[];
  status: string[];
  week: PlanningWeek[];
}

const optionLabel = (key: FilterKey, value: string, weeks: PlanningWeek[]) => {
  if (key === 'serviceType') return TYPE_LABELS[value as keyof typeof TYPE_LABELS] || value;
  if (key === 'status') return value === 'sin_asignar' ? 'Sin ingeniero' : STATUS_LABELS[value as keyof typeof STATUS_LABELS] || value;
  if (key === 'engineer') return formatPlanningPersonName(value) || value;
  if (key === 'week') return weeks.find((week) => week.start === value)?.label || value;
  return value;
};

export function FilterPanel({ state, options, onChange, onClear }: { state: GridFilters; options: FilterOptions; onChange: (next: GridFilters) => void; onClear: () => void }) {
  const [open, setOpen] = useState<FilterKey | null>('engineer');
  const [query, setQuery] = useState('');
  const toggle = (key: FilterKey, value: string) => {
    const current = state.filters[key] || [];
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
    onChange({ ...state, filters: { ...state.filters, [key]: next } });
  };
  const values = (key: FilterKey) => (key === 'week' ? options.week.map((week) => week.start) : key === 'status' ? [...SERVICE_STATUSES, 'sin_asignar'] : options[key]);
  return (
    <div className="pgrid-filters">
      <div className="pgrid-filters__row">
        <label className="pgrid-check">
          <input type="checkbox" checked={state.onlyMine} onChange={(event) => onChange({ ...state, onlyMine: event.target.checked })} />
          Solo mis servicios
        </label>
        <label className="pgrid-check">
          <input type="checkbox" checked={state.onlyOpen} onChange={(event) => onChange({ ...state, onlyOpen: event.target.checked })} />
          Solo pendientes
        </label>
      </div>
      <div className="pgrid-filters__row pgrid-filters__dates">
        <label>
          Desde
          <input type="date" value={state.dateFrom} onChange={(event) => onChange({ ...state, dateFrom: event.target.value })} />
        </label>
        <label>
          Hasta
          <input type="date" value={state.dateTo} onChange={(event) => onChange({ ...state, dateTo: event.target.value })} />
        </label>
      </div>
      {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
        const selected = state.filters[key] || [];
        const all = values(key);
        const shown = open === key ? all.filter((value) => !query || normalizeText(optionLabel(key, value, options.week)).includes(normalizeText(query))) : [];
        return (
          <section key={key} className="pgrid-filters__group">
            <button type="button" className="pgrid-filters__head" aria-expanded={open === key} onClick={() => { setOpen(open === key ? null : key); setQuery(''); }}>
              <span>{FILTER_LABELS[key]}</span>
              {selected.length ? <b>{selected.length}</b> : null}
            </button>
            {open === key ? (
              <div className="pgrid-filters__body">
                {all.length > 8 ? <input className="pgrid-filters__search" placeholder="Buscar…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Buscar ${FILTER_LABELS[key]}`} /> : null}
                <div className="pgrid-filters__list">
                  {shown.map((value) => (
                    <label key={value} className="pgrid-check">
                      <input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(key, value)} />
                      {optionLabel(key, value, options.week)}
                    </label>
                  ))}
                  {!shown.length ? <small>Sin opciones.</small> : null}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
      <div className="pgrid-filters__foot">
        <button type="button" className="pgrid-link" onClick={onClear}>Limpiar filtros</button>
      </div>
    </div>
  );
}

// ----- columns -----
export function ColumnsPanel({
  columns,
  hidden,
  pinned,
  customColumns,
  canManage,
  onToggleHidden,
  onTogglePinned,
  onReset,
  onCreate,
  onArchive,
}: {
  columns: GridColumn[];
  hidden: string[];
  pinned: string[];
  customColumns: CustomColumn[];
  canManage: boolean;
  onToggleHidden: (id: string) => void;
  onTogglePinned: (id: string) => void;
  onReset: () => void;
  onCreate: (column: { label: string; dataType: CustomColumn['dataType']; options: string[] }) => Promise<void>;
  onArchive: (column: CustomColumn) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [dataType, setDataType] = useState<CustomColumn['dataType']>('text');
  const [options, setOptions] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="pgrid-columns">
      <p className="pgrid-columns__hint">Arrastra los encabezados para reordenar y sus bordes para ajustar el ancho. Ocultar una columna no borra datos.</p>
      <ul>
        {columns.map((column) => {
          const custom = customColumns.find((entry) => `custom:${entry.key}` === column.id);
          return (
            <li key={column.id}>
              <label className="pgrid-check">
                <input type="checkbox" checked={!hidden.includes(column.id)} disabled={column.required} onChange={() => onToggleHidden(column.id)} />
                {column.label}
              </label>
              <button type="button" className={`pgrid-pin ${pinned.includes(column.id) ? 'is-on' : ''}`} onClick={() => onTogglePinned(column.id)} aria-pressed={pinned.includes(column.id)} title="Fijar a la izquierda">
                📌
              </button>
              {custom && canManage ? (
                <button type="button" className="pgrid-link" onClick={() => onArchive(custom)} title="Se oculta para todos; los valores capturados se conservan">
                  Archivar
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="pgrid-columns__foot">
        <button type="button" className="pgrid-link" onClick={onReset}>Restablecer columnas</button>
        {canManage && !creating ? (
          <button type="button" className="pgrid-link" onClick={() => setCreating(true)}>+ Columna personalizada</button>
        ) : null}
      </div>
      {creating ? (
        <form
          className="pgrid-columns__new"
          onSubmit={(event) => {
            event.preventDefault();
            const list = options.split(',').map((entry) => entry.trim()).filter(Boolean);
            if (!label.trim()) return setError('Escribe un nombre.');
            if (dataType === 'select' && list.length < 2) return setError('Una lista necesita al menos dos opciones.');
            setError('');
            void onCreate({ label: label.trim(), dataType, options: list })
              .then(() => {
                setCreating(false);
                setLabel('');
                setOptions('');
              })
              .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo crear.'));
          }}
        >
          <label>
            Nombre
            <input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} autoFocus />
          </label>
          <label>
            Tipo de dato
            <select value={dataType} onChange={(event) => setDataType(event.target.value as CustomColumn['dataType'])}>
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="date">Fecha</option>
              <option value="boolean">Sí / No</option>
              <option value="select">Lista de opciones</option>
            </select>
          </label>
          {dataType === 'select' ? (
            <label>
              Opciones (separadas por coma)
              <input value={options} onChange={(event) => setOptions(event.target.value)} />
            </label>
          ) : null}
          {error ? <span role="alert">{error}</span> : null}
          <div>
            <button type="submit" className="pgrid-button">Crear columna</button>
            <button type="button" className="pgrid-link" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ----- views -----
export function ViewsPanel({
  builtIn,
  saved,
  activeId,
  onApply,
  onSave,
  onDelete,
}: {
  builtIn: Array<{ id: string; name: string }>;
  saved: SavedView[];
  activeId: string;
  onApply: (id: string) => void;
  onSave: (name: string) => Promise<void>;
  onDelete: (view: SavedView) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="pgrid-views">
      <ul>
        {builtIn.map((view) => (
          <li key={view.id}>
            <button type="button" className={activeId === view.id ? 'is-on' : ''} onClick={() => onApply(view.id)}>{view.name}</button>
          </li>
        ))}
        {saved.length ? <li className="pgrid-menu__sep" role="separator" /> : null}
        {saved.map((view) => (
          <li key={view.id}>
            <button type="button" className={activeId === view.id ? 'is-on' : ''} onClick={() => onApply(view.id)}>{view.name}</button>
            <button type="button" className="pgrid-link" onClick={() => onDelete(view)} aria-label={`Eliminar vista ${view.name}`}>×</button>
          </li>
        ))}
      </ul>
      <form
        className="pgrid-views__save"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void onSave(name.trim())
            .then(() => setName(''))
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo guardar.'));
        }}
      >
        <input value={name} maxLength={60} placeholder="Guardar vista actual como…" onChange={(event) => setName(event.target.value)} aria-label="Nombre de la vista" />
        <button type="submit" className="pgrid-button" disabled={!name.trim()}>Guardar</button>
        {error ? <span role="alert">{error}</span> : null}
      </form>
    </div>
  );
}

// ----- move to another week -----
export function WeekPicker({ month, current, onPick, label }: { month: string; current?: PlanningWeek | null; onPick: (week: PlanningWeek) => void; label: string }) {
  const [cursor, setCursor] = useState(month);
  const [date, setDate] = useState('');
  const weeks = useMemo(() => weeksOfMonth(cursor), [cursor]);
  return (
    <div className="pgrid-weekpick">
      <strong>{label}</strong>
      {current ? (
        <div className="pgrid-weekpick__quick">
          <button type="button" className="pgrid-link" onClick={() => onPick(weekFromMonday(addDays(current.start, -7)))}>← Semana anterior</button>
          <button type="button" className="pgrid-link" onClick={() => onPick(weekFromMonday(addDays(current.start, 7)))}>Semana siguiente →</button>
        </div>
      ) : null}
      <div className="pgrid-weekpick__month">
        <button type="button" aria-label="Mes anterior" onClick={() => setCursor(shiftMonth(cursor, -1))}>‹</button>
        <span>{cursor}</span>
        <button type="button" aria-label="Mes siguiente" onClick={() => setCursor(shiftMonth(cursor, 1))}>›</button>
      </div>
      <ul>
        {weeks.map((week) => (
          <li key={week.start}>
            <button type="button" disabled={current?.start === week.start} onClick={() => onPick(week)}>{week.label}</button>
          </li>
        ))}
      </ul>
      <label className="pgrid-weekpick__date">
        O la semana de
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button type="button" className="pgrid-button" disabled={!date} onClick={() => onPick(weekFromMonday(mondayOf(date)))}>Elegir</button>
      </label>
    </div>
  );
}

// ----- confirmation -----
export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  return createPortal(
    <div className="pgrid-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="pgrid-modal__box" role="alertdialog" aria-modal="true" aria-label={title} onKeyDown={(event) => event.key === 'Escape' && onCancel()}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="pgrid-modal__actions">
          <button type="button" className="pgrid-link" onClick={onCancel}>Cancelar</button>
          <button ref={confirmRef} type="button" className={`pgrid-button ${danger ? 'is-danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ConflictRulesPanel({ rules, onChange }: { rules: ConflictRules; onChange: (rules: ConflictRules) => void }) {
  return (
    <div className="pgrid-rules">
      <strong>Avisos de empalme de agenda</strong>
      <label className="pgrid-check">
        <input type="checkbox" checked={rules.enabled} onChange={(event) => onChange({ ...rules, enabled: event.target.checked })} />
        Avisar cuando una persona tiene dos actividades el mismo día
      </label>
      <label className="pgrid-check">
        <input type="checkbox" checked={rules.includeCompanions} disabled={!rules.enabled} onChange={(event) => onChange({ ...rules, includeCompanions: event.target.checked })} />
        Considerar también a los acompañantes
      </label>
      <label className="pgrid-check">
        <input type="checkbox" checked={rules.sameLocalityIsConflict} disabled={!rules.enabled} onChange={(event) => onChange({ ...rules, sameLocalityIsConflict: event.target.checked })} />
        Avisar aunque sea en la misma localidad
      </label>
      <small>Solo se comparan actividades con fecha o días definidos. Es un aviso: no impide programar.</small>
    </div>
  );
}
