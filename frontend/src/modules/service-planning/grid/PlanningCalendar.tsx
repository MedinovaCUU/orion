import { useMemo } from 'react';
import { formatPlanningPersonName } from '../helpers/normalizeService';
import { TYPE_LABELS } from './planningColumns';
import type { PlanningRecord, PlanningValues } from './planningRecord';
import { addDays, mondayOf, type PlanningWeek } from './planningWeeks';
import { activityDays } from './scheduleConflicts';

// The same activities laid out on the month: dated ones on their days, the rest in their week's lane.

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const TYPE_CLASS: Record<string, string> = { preventivo: 'prev', correctivo: 'corr', instalacion: 'inst', capacitacion: 'capa', recapacitacion: 'capa', ingenieria_soporte: 'sopo' };

interface CalendarProps {
  month: string;
  weeks: PlanningWeek[];
  items: Array<{ record: PlanningRecord; values: PlanningValues }>;
  today: string;
  onOpen: (recordId: string) => void;
}

export default function PlanningCalendar({ month, weeks, items, today, onOpen }: CalendarProps) {
  const lanes = useMemo(
    () =>
      weeks.map((week) => {
        const days = Array.from({ length: 7 }, (_, offset) => addDays(mondayOf(week.start), offset));
        const byDay = new Map<string, Array<{ record: PlanningRecord; values: PlanningValues }>>();
        const undated: Array<{ record: PlanningRecord; values: PlanningValues }> = [];
        for (const item of items) {
          if (item.record.week.start !== week.start) continue;
          const dates = activityDays(item.record, item.values).filter((date) => days.includes(date));
          if (!dates.length) undated.push(item);
          dates.forEach((date) => byDay.set(date, [...(byDay.get(date) || []), item]));
        }
        return { week, days, byDay, undated };
      }),
    [items, weeks],
  );

  const chip = ({ record, values }: { record: PlanningRecord; values: PlanningValues }, key: string) => (
    <button
      key={key}
      type="button"
      className={`pgrid-cal__chip pgrid-cal__chip--${TYPE_CLASS[values.serviceType] || ''} ${record.closed || values.statuses.includes('realizado') ? 'is-done' : ''}`}
      onClick={() => onOpen(record.id)}
      title={`${TYPE_LABELS[values.serviceType]} · ${values.platform} · ${values.locality}`}
    >
      <strong>{values.platform || TYPE_LABELS[values.serviceType]}</strong>
      <span>{values.locality}</span>
      {values.engineer ? <small>{formatPlanningPersonName(values.engineer) || values.engineer}</small> : null}
    </button>
  );

  return (
    <div className="pgrid-cal" role="table" aria-label={`Calendario ${month}`}>
      <div className="pgrid-cal__head" role="row">
        <span role="columnheader">Semana</span>
        {DAY_NAMES.map((name) => (
          <span key={name} role="columnheader">{name}</span>
        ))}
      </div>
      {lanes.map(({ week, days, byDay, undated }) => (
        <div key={week.start} className="pgrid-cal__week" role="row">
          <div className="pgrid-cal__label" role="rowheader">
            <strong>{week.label}</strong>
            {undated.length ? (
              <div className="pgrid-cal__undated">
                <small>Sin día ({undated.length})</small>
                {undated.map((item) => chip(item, `u-${item.record.id}`))}
              </div>
            ) : null}
          </div>
          {days.map((day) => (
            <div key={day} role="cell" className={`pgrid-cal__day ${day === today ? 'is-today' : ''} ${day.slice(0, 7) !== month ? 'is-out' : ''}`}>
              <span className="pgrid-cal__date">{Number(day.slice(8, 10))}</span>
              {(byDay.get(day) || []).map((item) => chip(item, `${day}-${item.record.id}`))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
