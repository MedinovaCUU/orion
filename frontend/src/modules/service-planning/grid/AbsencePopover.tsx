import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ProfileSummary } from '../../../components/servicesPlanning';
import { formatPlanningPersonName, normalizeText } from '../helpers/normalizeService';
import { ABSENCE_KINDS, ABSENCE_LABELS, type AbsenceInput, type AbsenceKind, type PlanningAbsence } from './planningAbsences';
import { resolvePerson } from './planningColumns';
import useAnchoredPopover from './useAnchoredPopover';

// Card to record or change an absence (TXT, vacations…), same behaviour as the activity card: Enter saves,
// Escape cancels, clicking outside keeps it when it has a person.

export interface AbsencePopoverProps {
  mode: 'new' | 'edit';
  anchor: DOMRect;
  initial: AbsenceInput;
  people: string[];
  profiles: ProfileSummary[];
  readOnly?: boolean;
  source?: PlanningAbsence['source'];
  footnote?: string;
  onSave: (input: AbsenceInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onSwitchToActivity?: () => void;
}

export default function AbsencePopover({ mode, anchor, initial, people, profiles, readOnly, source, footnote, onSave, onCancel, onDelete, onSwitchToActivity }: AbsencePopoverProps) {
  const [person, setPerson] = useState(formatPlanningPersonName(initial.personName) || initial.personName);
  const [kind, setKind] = useState<AbsenceKind>(initial.kind);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [note, setNote] = useState(initial.note);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useAnchoredPopover(ref, anchor);

  const save = () => {
    if (done.current) return;
    if (readOnly) {
      done.current = true;
      onCancel();
      return;
    }
    const personName = person.trim() ? resolvePerson(person, profiles) : '';
    if (!personName) {
      setError('Escribe quién se ausenta.');
      firstField.current?.focus();
      return;
    }
    if (!startDate) {
      setError('Indica desde qué día.');
      return;
    }
    const end = endDate && endDate >= startDate ? endDate : startDate;
    const profile = profiles.find((entry) => normalizeText(entry.nombre_completo || '') === normalizeText(personName));
    done.current = true;
    onSave({ personName, personId: profile?.id || null, kind, startDate, endDate: end, note: note.replace(/\s+/g, ' ').trim() });
  };

  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  // Re-subscribed every render so the handler always sees the latest values.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
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
    } else if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  };

  return createPortal(
    <div ref={ref} className="pgrid-evpop pgrid-evpop--away" role="dialog" aria-label={mode === 'new' ? 'Nueva ausencia' : 'Ausencia'} style={{ visibility: 'hidden' }} onKeyDown={onKeyDown}>
      {onSwitchToActivity ? (
        <div className="pgrid-evpop__switch" role="group" aria-label="Qué agregar">
          <button type="button" aria-pressed="false" onClick={() => { done.current = true; onSwitchToActivity(); }}>Actividad</button>
          <button type="button" className="is-on" aria-pressed="true">Ausencia</button>
        </div>
      ) : null}
      <div className="pgrid-evpop__head">
        <span className="pgrid-evpop__dot" aria-hidden="true" />
        <input
          ref={firstField}
          className="pgrid-evpop__title"
          value={person}
          placeholder="¿Quién?"
          aria-label="Persona"
          list="pgrid-absence-people"
          readOnly={readOnly}
          onChange={(event) => {
            setPerson(event.target.value);
            setError('');
          }}
        />
      </div>
      <p className="pgrid-evpop__when">{ABSENCE_LABELS[kind]}</p>
      {error ? <p className="pgrid-evpop__error" role="alert">{error}</p> : null}
      <div className="pgrid-evpop__grid">
        <label className="pgrid-evpop__wide">
          <span>Tipo</span>
          <select value={kind} disabled={readOnly} onChange={(event) => setKind(event.target.value as AbsenceKind)}>
            {ABSENCE_KINDS.map((entry) => (
              <option key={entry} value={entry}>{ABSENCE_LABELS[entry]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Desde</span>
          <input type="date" value={startDate} readOnly={readOnly} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={endDate} min={startDate || undefined} readOnly={readOnly} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label className="pgrid-evpop__wide">
          <span>Nota</span>
          <input value={note} readOnly={readOnly} placeholder="Opcional" onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>
      {source === 'sheet' ? <p className="pgrid-evpop__foot">Viene de la hoja oficial. Si la cambias aquí, «Sincronizar» la conserva como está en Orion.</p> : null}
      {footnote ? <p className="pgrid-evpop__foot">{footnote}</p> : null}
      <div className="pgrid-evpop__actions">
        {onDelete && !readOnly ? (
          <button type="button" className="pgrid-link is-danger" onClick={() => { done.current = true; onDelete(); }}>Eliminar</button>
        ) : null}
        <span />
        <button type="button" className="pgrid-link" onClick={cancel}>{mode === 'new' ? 'Cancelar' : 'Cerrar'}</button>
        {!readOnly ? <button type="button" className="pgrid-button" onClick={save}>{mode === 'new' ? 'Agregar' : 'Guardar'}</button> : null}
      </div>
      <datalist id="pgrid-absence-people">
        {people.map((name) => <option key={name} value={formatPlanningPersonName(name) || name} />)}
      </datalist>
    </div>,
    document.body,
  );
}
