import { useMemo, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { ProfileSummary } from '../../../components/servicesPlanning';
import { formatPlanningPersonName } from '../helpers/normalizeService';
import AbsencePopover from './AbsencePopover';
import CalendarEventPopover from './CalendarEventPopover';
import { absenceTitle, ABSENCE_SHORT, overlaps, type AbsenceInput, type PlanningAbsence } from './planningAbsences';
import type { ChangeRequest } from './planningApprovals';
import { TYPE_LABELS, type OptionsSource } from './planningColumns';
import { emptyValues, type PlanningField, type PlanningRecord, type PlanningValues } from './planningRecord';
import { addDays, fromIsoDate, mondayOf, type PlanningWeek } from './planningWeeks';
import { activityDays } from './scheduleConflicts';

// The same activities as the table, laid out on the month. Like Apple Calendar: double-click a day to add
// an activity, double-click an activity to see or change it, drag it to another day to reschedule it.
// Everything goes through the table's store, so the table shows each change at once (and saves it).

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const LONG_DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TYPE_CLASS: Record<string, string> = { preventivo: 'prev', correctivo: 'corr', instalacion: 'inst', capacitacion: 'capa', recapacitacion: 'capa', ingenieria_soporte: 'sopo' };
const DRAG_TYPE = 'application/x-orion-activity';

type Item = { record: PlanningRecord; values: PlanningValues };

type Popover =
  | { mode: 'new'; kind: 'activity' | 'absence'; anchor: DOMRect; week: PlanningWeek; day: string | null; slot: string }
  | { mode: 'edit'; anchor: DOMRect; id: string }
  | { mode: 'edit-absence'; anchor: DOMRect; id: string };

interface CalendarProps {
  month: string;
  weeks: PlanningWeek[];
  items: Item[];
  today: string;
  canEdit: boolean;
  options: OptionsSource;
  profiles: ProfileSummary[];
  onCreate: (week: PlanningWeek, values: PlanningValues) => Promise<string | null>;
  onUpdate: (id: string, changes: Partial<Record<PlanningField, string | string[]>>) => void;
  onMoveToDay: (id: string, day: string) => void;
  onMoveToWeek: (id: string, week: PlanningWeek) => void;
  onDelete: (id: string) => void;
  onOpenInTable: (id: string) => void;
  onNotify: (tone: 'info' | 'error', text: string) => void;
  absences: PlanningAbsence[];
  /** New activities the user proposed (waiting for approval) and activities with a proposed change. */
  proposals: Array<{ request: ChangeRequest; week: PlanningWeek; values: PlanningValues }>;
  proposedIds: Set<string>;
  onSaveAbsence: (input: AbsenceInput & { id?: string }) => void;
  onDeleteAbsence: (id: string) => void;
}

const longDate = (iso: string) => {
  const date = fromIsoDate(iso);
  return `${LONG_DAYS[(date.getDay() + 6) % 7]} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
};

const changedFields = (before: PlanningValues, after: PlanningValues) => {
  const changes: Partial<Record<PlanningField, string | string[]>> = {};
  (Object.keys(after) as Array<keyof PlanningValues>).forEach((key) => {
    if (key === 'custom') return;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key as PlanningField] = after[key] as string | string[];
  });
  return changes;
};

export default function PlanningCalendar({ month, weeks, items, today, canEdit, options, profiles, onCreate, onUpdate, onMoveToDay, onMoveToWeek, onDelete, onOpenInTable, onNotify, absences, proposals, proposedIds, onSaveAbsence, onDeleteAbsence }: CalendarProps) {
  const [popover, setPopover] = useState<Popover | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<string | null>(null);

  const lanes = useMemo(
    () =>
      weeks.map((week) => {
        const days = Array.from({ length: 7 }, (_, offset) => addDays(mondayOf(week.start), offset));
        const byDay = new Map<string, Item[]>();
        const undated: Item[] = [];
        const proposedByDay = new Map<string, typeof proposals>();
        const proposedUndated: typeof proposals = [];
        for (const proposal of proposals) {
          if (proposal.week.start !== week.start) continue;
          const day = proposal.values.scheduledDate;
          if (day && days.includes(day)) proposedByDay.set(day, [...(proposedByDay.get(day) || []), proposal]);
          else proposedUndated.push(proposal);
        }
        for (const item of items) {
          if (item.record.week.start !== week.start) continue;
          const dates = activityDays(item.record, item.values).filter((date) => days.includes(date));
          if (!dates.length) undated.push(item);
          dates.forEach((date) => byDay.set(date, [...(byDay.get(date) || []), item]));
        }
        return { week, days, byDay, undated, proposedByDay, proposedUndated };
      }),
    [items, proposals, weeks],
  );
  const byId = useMemo(() => new Map(items.map((item) => [item.record.id, item])), [items]);
  const editing = popover?.mode === 'edit' ? byId.get(popover.id) || null : null;
  const editingAbsence = popover?.mode === 'edit-absence' ? absences.find((absence) => absence.id === popover.id) || null : null;
  const awayOn = (day: string) => absences.filter((absence) => overlaps(absence, day, day));

  const isLocked = (item: Item) => item.record.closed;

  const openNew = (anchor: DOMRect, week: PlanningWeek, day: string | null) => {
    if (!canEdit) {
      onNotify('info', 'Tu usuario solo puede consultar la planeación.');
      return;
    }
    setSelected(null);
    setPopover({ mode: 'new', kind: 'activity', anchor, week, day, slot: day || `undated:${week.start}` });
  };

  const onSlotDoubleClick = (event: ReactMouseEvent<HTMLElement>, week: PlanningWeek, day: string | null) => {
    if ((event.target as HTMLElement).closest('.pgrid-cal__chip, .pgrid-cal__away')) return;
    event.preventDefault();
    openNew(event.currentTarget.getBoundingClientRect(), week, day);
  };

  const onSlotKeyDown = (event: ReactKeyboardEvent<HTMLElement>, week: PlanningWeek, day: string | null) => {
    if (event.target !== event.currentTarget || event.key !== 'Enter') return;
    event.preventDefault();
    openNew(event.currentTarget.getBoundingClientRect(), week, day);
  };

  const openEdit = (element: HTMLElement, id: string) => {
    setSelected(id);
    setPopover({ mode: 'edit', anchor: element.getBoundingClientRect(), id });
  };

  // ----- drag to reschedule -----
  const dragHandlers = (slot: string, drop: (id: string) => void) => ({
    onDragOver: (event: ReactDragEvent) => {
      if (!dragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropSlot !== slot) setDropSlot(slot);
    },
    onDragLeave: (event: ReactDragEvent) => {
      if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) setDropSlot((current) => (current === slot ? null : current));
    },
    onDrop: (event: ReactDragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData(DRAG_TYPE) || dragging;
      setDropSlot(null);
      setDragging(null);
      if (id) drop(id);
    },
  });

  const chip = (item: Item, key: string) => {
    const { record, values } = item;
    const done = record.closed || values.statuses.includes('realizado');
    const draggable = canEdit && !isLocked(item);
    return (
      <button
        key={key}
        type="button"
        draggable={draggable}
        className={[
          'pgrid-cal__chip',
          `pgrid-cal__chip--${TYPE_CLASS[values.serviceType] || ''}`,
          done ? 'is-done' : '',
          selected === record.id ? 'is-selected' : '',
          proposedIds.has(record.id) ? 'is-proposed' : '',
          dragging === record.id ? 'is-dragging' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setSelected(record.id)}
        onDoubleClick={(event) => openEdit(event.currentTarget, record.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            openEdit(event.currentTarget, record.id);
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, record.id);
          event.dataTransfer.effectAllowed = 'move';
          setDragging(record.id);
          setPopover(null);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropSlot(null);
        }}
        title={`${TYPE_LABELS[values.serviceType]} · ${values.platform} · ${values.locality}${draggable ? '\nDoble clic para ver o cambiar · arrastra para cambiar de día' : ''}`}
      >
        <strong>{values.platform || TYPE_LABELS[values.serviceType]}</strong>
        <span>{values.locality}</span>
        {values.engineer ? <small>{formatPlanningPersonName(values.engineer) || values.engineer}</small> : null}
      </button>
    );
  };

  const proposedChip = (proposal: { request: ChangeRequest; values: PlanningValues }, key: string) => (
    <span
      key={key}
      className={`pgrid-cal__chip pgrid-cal__chip--${TYPE_CLASS[proposal.values.serviceType] || ''} is-proposal`}
      title="Actividad nueva pendiente de aprobación"
    >
      <strong>{proposal.values.platform || TYPE_LABELS[proposal.values.serviceType]} · por aprobar</strong>
      <span>{proposal.values.locality}</span>
    </span>
  );

  const ghost = (slot: string) =>
    popover?.mode === 'new' && popover.slot === slot ? (
      <span className="pgrid-cal__chip pgrid-cal__chip--ghost" aria-hidden="true">
        <strong>Nueva actividad</strong>
      </span>
    ) : null;

  return (
    <div className={`pgrid-cal ${dragging ? 'is-dragging' : ''}`} role="table" aria-label={`Calendario ${month}`}>
      <div className="pgrid-cal__head" role="row">
        <span role="columnheader">Semana</span>
        {DAY_NAMES.map((name) => (
          <span key={name} role="columnheader">{name}</span>
        ))}
      </div>
      {lanes.map(({ week, days, byDay, undated, proposedByDay, proposedUndated }) => {
        const undatedSlot = `undated:${week.start}`;
        return (
          <div key={week.start} className="pgrid-cal__week" role="row">
            <div
              className={`pgrid-cal__label ${dropSlot === undatedSlot ? 'is-drop' : ''}`}
              role="rowheader"
              tabIndex={canEdit ? 0 : -1}
              aria-label={`Semana ${week.label}: doble clic para agregar una actividad sin día`}
              onDoubleClick={(event) => onSlotDoubleClick(event, week, null)}
              onKeyDown={(event) => onSlotKeyDown(event, week, null)}
              {...dragHandlers(undatedSlot, (id) => onMoveToWeek(id, week))}
            >
              <strong>{week.label}</strong>
              <div className="pgrid-cal__undated">
                <small>{undated.length ? `Sin día (${undated.length})` : canEdit ? 'Sin día' : ''}</small>
                {undated.map((item) => chip(item, `u-${item.record.id}`))}
                {proposedUndated.map((proposal) => proposedChip(proposal, `pu-${proposal.request.id}`))}
                {ghost(undatedSlot)}
              </div>
            </div>
            {days.map((day) => (
              <div
                key={day}
                role="cell"
                tabIndex={canEdit ? 0 : -1}
                aria-label={`${longDate(day)}: doble clic para agregar una actividad`}
                data-day={day}
                className={[
                  'pgrid-cal__day',
                  day === today ? 'is-today' : '',
                  day.slice(0, 7) !== month ? 'is-out' : '',
                  dropSlot === day ? 'is-drop' : '',
                  canEdit ? 'is-editable' : '',
                ].filter(Boolean).join(' ')}
                onDoubleClick={(event) => onSlotDoubleClick(event, week, day)}
                onKeyDown={(event) => onSlotKeyDown(event, week, day)}
                {...dragHandlers(day, (id) => onMoveToDay(id, day))}
              >
                <span className="pgrid-cal__date">{Number(day.slice(8, 10))}</span>
                {awayOn(day).map((absence) => (
                  <button
                    key={`${day}-${absence.id}`}
                    type="button"
                    className={`pgrid-cal__away pgrid-cal__away--${absence.kind.toLowerCase()} ${absence.proposal ? `is-proposed is-proposed-${absence.proposal}` : ''}`}
                    title={`${absenceTitle(absence)}${canEdit ? '\nDoble clic para ver o cambiar' : ''}`}
                    onDoubleClick={(event) => {
                      setSelected(null);
                      setPopover({ mode: 'edit-absence', anchor: event.currentTarget.getBoundingClientRect(), id: absence.id });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      setPopover({ mode: 'edit-absence', anchor: event.currentTarget.getBoundingClientRect(), id: absence.id });
                    }}
                  >
                    <b>{ABSENCE_SHORT[absence.kind]}</b> {formatPlanningPersonName(absence.personName) || absence.personName}
                  </button>
                ))}
                {(byDay.get(day) || []).map((item) => chip(item, `${day}-${item.record.id}`))}
                {(proposedByDay.get(day) || []).map((proposal) => proposedChip(proposal, `p-${proposal.request.id}`))}
                {ghost(day)}
              </div>
            ))}
          </div>
        );
      })}

      {popover?.mode === 'new' && popover.kind === 'absence' ? (
        <AbsencePopover
          key={`absence-${popover.slot}`}
          mode="new"
          anchor={popover.anchor}
          initial={{ personName: '', kind: 'TXT', startDate: popover.day || popover.week.start, endDate: popover.day || popover.week.end, note: '' }}
          people={options.people}
          profiles={profiles}
          onSwitchToActivity={() => setPopover({ ...popover, kind: 'activity' })}
          onCancel={() => setPopover(null)}
          onSave={(input) => {
            setPopover(null);
            onSaveAbsence(input);
          }}
        />
      ) : null}
      {editingAbsence && popover?.mode === 'edit-absence' ? (
        <AbsencePopover
          key={`absence-${editingAbsence.id}`}
          mode="edit"
          anchor={popover.anchor}
          initial={{ personName: editingAbsence.personName, personId: editingAbsence.personId, kind: editingAbsence.kind, startDate: editingAbsence.startDate, endDate: editingAbsence.endDate, note: editingAbsence.note }}
          people={options.people}
          profiles={profiles}
          readOnly={!canEdit}
          source={editingAbsence.source}
          footnote={editingAbsence.updatedByName ? `Última modificación: ${formatPlanningPersonName(editingAbsence.updatedByName) || editingAbsence.updatedByName}` : undefined}
          onCancel={() => setPopover(null)}
          onSave={(input) => {
            setPopover(null);
            const changed = input.personName !== editingAbsence.personName || input.kind !== editingAbsence.kind || input.startDate !== editingAbsence.startDate || input.endDate !== editingAbsence.endDate || input.note !== editingAbsence.note;
            if (changed) onSaveAbsence({ ...input, id: editingAbsence.id });
          }}
          onDelete={() => {
            setPopover(null);
            onDeleteAbsence(editingAbsence.id);
          }}
        />
      ) : null}
      {popover?.mode === 'new' && popover.kind === 'activity' ? (
        <CalendarEventPopover
          key={`new-${popover.slot}`}
          mode="new"
          anchor={popover.anchor}
          initial={{ ...emptyValues(), scheduledDate: popover.day || '' }}
          subtitle={popover.day ? longDate(popover.day) : `Semana ${popover.week.label.toLowerCase()} · sin día fijo`}
          options={options}
          profiles={profiles}
          onSwitchToAbsence={() => setPopover({ ...popover, kind: 'absence' })}
          onCancel={() => setPopover(null)}
          onSave={(values) => {
            const { week } = popover;
            setPopover(null);
            void onCreate(week, values).then((id) => {
              if (id) setSelected(id);
            });
          }}
        />
      ) : null}
      {popover?.mode === 'edit' && editing ? (
        <CalendarEventPopover
          key={`edit-${editing.record.id}`}
          mode="edit"
          anchor={popover.anchor}
          initial={editing.values}
          subtitle={
            editing.values.scheduledDate
              ? `${longDate(editing.values.scheduledDate)}${editing.values.scheduledEndDate && editing.values.scheduledEndDate !== editing.values.scheduledDate ? ` al ${longDate(editing.values.scheduledEndDate)}` : ''}`
              : `Semana ${editing.record.week.label.toLowerCase()}${editing.values.days ? ` · ${editing.values.days}` : ' · sin día fijo'}`
          }
          options={options}
          profiles={profiles}
          readOnly={!canEdit || isLocked(editing)}
          footnote={isLocked(editing) ? 'Actividad cerrada: solo consulta.' : editing.record.updatedBy ? `Última modificación: ${formatPlanningPersonName(editing.record.updatedBy) || editing.record.updatedBy}` : undefined}
          onCancel={() => setPopover(null)}
          onSave={(values) => {
            const changes = changedFields(editing.values, values);
            setPopover(null);
            if (Object.keys(changes).length) onUpdate(editing.record.id, changes);
          }}
          onOpenInTable={() => {
            setPopover(null);
            onOpenInTable(editing.record.id);
          }}
          onDelete={() => {
            setPopover(null);
            onDelete(editing.record.id);
          }}
        />
      ) : null}
    </div>
  );
}
