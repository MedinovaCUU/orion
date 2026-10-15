import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ProfileSummary } from '../../../components/servicesPlanning';
import { formatPlanningPersonName } from '../helpers/normalizeService';
import { resolvePerson, TYPE_LABELS, type OptionsSource } from './planningColumns';
import type { PlanningValues } from './planningRecord';
import type { ServiceType } from '../types/servicePlanning.types';

// Apple Calendar–style event card: opens next to the day that was double-clicked (or the activity), the
// first field is focused, Enter saves, Escape cancels, clicking outside keeps what was written.

const TYPE_ORDER: ServiceType[] = ['preventivo', 'correctivo', 'instalacion', 'capacitacion', 'recapacitacion', 'ingenieria_soporte'];
const TYPE_CLASS: Record<string, string> = { preventivo: 'prev', correctivo: 'corr', instalacion: 'inst', capacitacion: 'capa', recapacitacion: 'capa', ingenieria_soporte: 'sopo' };

export interface EventPopoverProps {
  mode: 'new' | 'edit';
  anchor: DOMRect;
  initial: PlanningValues;
  subtitle: string;
  options: OptionsSource;
  profiles: ProfileSummary[];
  readOnly?: boolean;
  footnote?: string;
  onSave: (values: PlanningValues) => void;
  onCancel: () => void;
  onOpenInTable?: () => void;
  onDelete?: () => void;
}

const peopleText = (names: string[]) => names.map((name) => formatPlanningPersonName(name) || name).join(', ');

export default function CalendarEventPopover({ mode, anchor, initial, subtitle, options, profiles, readOnly, footnote, onSave, onCancel, onOpenInTable, onDelete }: EventPopoverProps) {
  const [values, setValues] = useState<PlanningValues>(initial);
  const [engineer, setEngineer] = useState(formatPlanningPersonName(initial.engineer) || initial.engineer);
  const [companions, setCompanions] = useState(peopleText(initial.companions));
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  const set = <K extends keyof PlanningValues>(key: K, value: PlanningValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const collect = (): PlanningValues => ({
    ...values,
    locality: values.locality.trim(),
    platform: values.platform.trim().toUpperCase(),
    serialNumber: values.serialNumber.trim().toUpperCase(),
    observations: values.observations.replace(/\s+/g, ' ').trim(),
    engineer: engineer.trim() ? resolvePerson(engineer, profiles) : '',
    companions: companions
      .split(/\s*(?:,|\/|;|\s+y\s+)\s*/i)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => resolvePerson(name, profiles)),
    scheduledEndDate: values.scheduledEndDate && values.scheduledDate && values.scheduledEndDate < values.scheduledDate ? '' : values.scheduledEndDate,
  });

  const save = () => {
    if (done.current) return;
    if (readOnly) {
      done.current = true;
      onCancel();
      return;
    }
    const result = collect();
    if (!result.locality) {
      setError('Escribe la localidad o el cliente.');
      firstField.current?.focus();
      return;
    }
    done.current = true;
    onSave(result);
  };

  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  // Next to the anchor like Apple's popover: to the right of the day, or to the left when there is no room.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const gap = 10;
    const right = anchor.right + gap + box.width <= window.innerWidth - 8;
    const left = right ? anchor.right + gap : Math.max(8, anchor.left - gap - box.width);
    const top = Math.max(8, Math.min(anchor.top + anchor.height / 2 - 60, window.innerHeight - box.height - 8));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.dataset.side = right ? 'right' : 'left';
    element.style.setProperty('--arrow-top', `${Math.max(18, Math.min(box.height - 18, anchor.top + anchor.height / 2 - top))}px`);
    element.style.visibility = 'visible';
  }, [anchor]);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  // Re-subscribed every render so the handler always sees the latest form values.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        // Clicking elsewhere keeps a new activity that already has a place; an empty one is dropped.
        if (mode === 'new' && !firstField.current?.value.trim()) cancel();
        else save();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  });

  const onKeyDown = (event: ReactKeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      save();
    }
  };

  const serials = options.equipments.filter((equipment) => {
    const platform = values.platform.trim().toUpperCase();
    return !platform || (equipment.modelo || '').toUpperCase().includes(platform);
  });

  return createPortal(
    <div
      ref={ref}
      className={`pgrid-evpop pgrid-evpop--${TYPE_CLASS[values.serviceType] || ''}`}
      role="dialog"
      aria-label={mode === 'new' ? 'Nueva actividad' : 'Actividad'}
      style={{ visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      <div className="pgrid-evpop__head">
        <span className="pgrid-evpop__dot" aria-hidden="true" />
        <input
          ref={firstField}
          className="pgrid-evpop__title"
          value={values.locality}
          placeholder="Localidad o cliente"
          aria-label="Localidad o cliente"
          list="pgrid-ev-localities"
          readOnly={readOnly}
          onChange={(event) => {
            set('locality', event.target.value);
            setError('');
          }}
        />
      </div>
      <p className="pgrid-evpop__when">{subtitle}</p>
      {error ? <p className="pgrid-evpop__error" role="alert">{error}</p> : null}
      <div className="pgrid-evpop__grid">
        <label>
          <span>Servicio</span>
          <select value={values.serviceType} disabled={readOnly} onChange={(event) => set('serviceType', event.target.value as ServiceType)}>
            {TYPE_ORDER.map((type) => (
              <option key={type} value={type}>{TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Plataforma</span>
          <input value={values.platform} list="pgrid-ev-platforms" readOnly={readOnly} onChange={(event) => set('platform', event.target.value)} />
        </label>
        <label>
          <span>N/S</span>
          <input value={values.serialNumber} list="pgrid-ev-serials" readOnly={readOnly} onChange={(event) => set('serialNumber', event.target.value)} />
        </label>
        <label>
          <span>Ingeniero</span>
          <input value={engineer} list="pgrid-ev-people" readOnly={readOnly} onChange={(event) => setEngineer(event.target.value)} />
        </label>
        <label className="pgrid-evpop__wide">
          <span>Acompañantes</span>
          <input value={companions} placeholder="Nombre, nombre" readOnly={readOnly} onChange={(event) => setCompanions(event.target.value)} />
        </label>
        <label>
          <span>Fecha</span>
          <input type="date" value={values.scheduledDate} readOnly={readOnly} onChange={(event) => set('scheduledDate', event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={values.scheduledEndDate} min={values.scheduledDate || undefined} readOnly={readOnly} onChange={(event) => set('scheduledEndDate', event.target.value)} />
        </label>
        <label className="pgrid-evpop__wide">
          <span>Observaciones</span>
          <textarea rows={2} value={values.observations} readOnly={readOnly} onChange={(event) => set('observations', event.target.value)} />
        </label>
      </div>
      {footnote ? <p className="pgrid-evpop__foot">{footnote}</p> : null}
      <div className="pgrid-evpop__actions">
        {onDelete && !readOnly ? (
          <button type="button" className="pgrid-link is-danger" onClick={() => { done.current = true; onDelete(); }}>Eliminar</button>
        ) : null}
        {onOpenInTable ? (
          <button type="button" className="pgrid-link" onClick={() => { done.current = true; onOpenInTable(); }}>Ver en la tabla</button>
        ) : null}
        <span />
        <button type="button" className="pgrid-link" onClick={cancel}>{mode === 'new' ? 'Cancelar' : 'Cerrar'}</button>
        {!readOnly ? (
          <button type="button" className="pgrid-button" onClick={save}>{mode === 'new' ? 'Agregar' : 'Guardar'}</button>
        ) : null}
      </div>
      <datalist id="pgrid-ev-localities">
        {options.localities.slice(0, 400).map((locality) => <option key={locality} value={locality} />)}
      </datalist>
      <datalist id="pgrid-ev-platforms">
        {options.platforms.map((platform) => <option key={platform} value={platform} />)}
      </datalist>
      <datalist id="pgrid-ev-serials">
        {serials.slice(0, 300).map((equipment) => (
          <option key={equipment.numero_serie} value={equipment.numero_serie}>{[equipment.modelo, equipment.clientes?.razon_social].filter(Boolean).join(' · ')}</option>
        ))}
      </datalist>
      <datalist id="pgrid-ev-people">
        {options.people.map((name) => <option key={name} value={formatPlanningPersonName(name) || name} />)}
      </datalist>
    </div>,
    document.body,
  );
}
