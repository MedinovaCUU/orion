import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { formatMonthLabel } from '../helpers/normalizeService';
import type {
  GuardArea,
  GuardRosterMember,
  WeekendGuardAssignment,
  WeekendGuardOverrideMap,
  WeekendGuardScheduleData,
} from '../types/servicePlanning.types';
import EmptyState from './EmptyState';
import { applyGuardSwap, assignedName, guardSwapCandidates, type SwapArea } from '../helpers/guardSwap';

interface WeekendGuardsPanelProps {
  schedule: WeekendGuardScheduleData;
  overrides: WeekendGuardOverrideMap;
  selectedMonth: string;
  currentUserName: string;
  canEdit: boolean;
  onSaveOverrides: (next: WeekendGuardOverrideMap) => void;
}

interface GuardEditorDraft {
  applicativo: string;
  ingenieria: string;
  note: string;
}

const EMPTY_DRAFT: GuardEditorDraft = {
  applicativo: '',
  ingenieria: '',
  note: '',
};

const AREA_LABELS: Record<GuardArea, string> = {
  aplicativo: 'Aplicativo',
  ingenieria: 'Ingenieria',
};

const buildDraft = (assignment: WeekendGuardAssignment): GuardEditorDraft => ({
  applicativo: assignment.applicativoAssigned,
  ingenieria: assignment.ingenieriaAssigned,
  note: assignment.note || '',
});

function GuardSlot({
  area,
  member,
  assigned,
  original,
}: {
  area: GuardArea;
  member?: GuardRosterMember;
  assigned: string;
  original: string;
}) {
  const changed = assigned !== original;

  return (
    <div
      className={`planning-guards__slot planning-guards__slot--${area}`}
      style={
        member
          ? ({
              ['--guard-accent-rgb' as string]: member.accentRgb,
            } as CSSProperties)
          : undefined
      }
    >
      <span className="planning-eyebrow">{AREA_LABELS[area]}</span>
      <strong className="planning-guards__person-chip">{assigned}</strong>
      <small>{changed ? `Rotacion base: ${original}` : 'Rotacion sin permuta'}</small>
    </div>
  );
}

export default function WeekendGuardsPanel({
  schedule,
  overrides,
  selectedMonth,
  currentUserName,
  canEdit,
  onSaveOverrides,
}: WeekendGuardsPanelProps) {
  const [editingWeekend, setEditingWeekend] = useState<string | null>(null);
  const [targets, setTargets] = useState<Partial<Record<SwapArea, string>>>({});
  const [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useState<GuardEditorDraft>(EMPTY_DRAFT);

  const filteredAssignments = useMemo(
    () => schedule.assignments.filter((assignment) => !selectedMonth || assignment.month === selectedMonth),
    [schedule.assignments, selectedMonth],
  );
  const memberByName = useMemo(
    () =>
      [...schedule.roster.aplicativo, ...schedule.roster.ingenieria].reduce<Record<string, GuardRosterMember>>((accumulator, member) => {
        accumulator[member.fullName] = member;
        return accumulator;
      }, {}),
    [schedule.roster],
  );

  useEffect(() => {
    setTargets({});
    setSaveError('');
    if (!editingWeekend) {
      setDraft(EMPTY_DRAFT);
      return;
    }

    const current = schedule.assignments.find((assignment) => assignment.weekendStart === editingWeekend);
    setDraft(current ? buildDraft(current) : EMPTY_DRAFT);
  }, [editingWeekend, schedule.assignments]);

  return (
    <div className="planning-guards">
      <section className="planning-panel planning-guards__schedule">
        <div className="planning-panel__header">
          <div>
            <span className="planning-eyebrow">Calendario</span>
            <h3>Asignaciones por fin de semana</h3>
          </div>
          <span className="planning-badge planning-badge--neutral">{filteredAssignments.length}</span>
        </div>

        {filteredAssignments.length === 0 ? (
          <EmptyState title="Sin guardias en este periodo" description="Cambia de mes para revisar otro bloque de fines de semana." />
        ) : (
          <div className="planning-guards__schedule-list">
            {filteredAssignments.map((assignment) => {
              const isEditing = editingWeekend === assignment.weekendStart;

              return (
                <article
                  key={assignment.weekendStart}
                  className={`planning-guards__weekend-card ${assignment.phase === 'proximo' ? 'is-upcoming' : ''} ${assignment.hasOverride ? 'has-override' : ''}`}
                >
                  <div className="planning-guards__weekend-header">
                    <div>
                      <strong>{assignment.label}</strong>
                      <p>
                        {assignment.phase === 'historico'
                          ? 'Historico'
                          : assignment.phase === 'proximo'
                            ? 'Proxima guardia'
                            : 'Programada'}{' '}
                        · {assignment.source === 'seed' ? 'Patron base' : 'Rotacion generada'}
                      </p>
                    </div>
                    <div className="planning-guards__weekend-chips">
                      <span className="planning-badge planning-badge--neutral">{formatMonthLabel(assignment.month)}</span>
                      {assignment.hasOverride ? <span className="planning-badge planning-badge--warning">Permuta</span> : null}
                    </div>
                  </div>

                  <div className="planning-guards__slots">
                    <GuardSlot
                      area="aplicativo"
                      member={memberByName[assignment.applicativoAssigned]}
                      assigned={assignment.applicativoAssigned}
                      original={assignment.applicativoOriginal}
                    />
                    <GuardSlot
                      area="ingenieria"
                      member={memberByName[assignment.ingenieriaAssigned]}
                      assigned={assignment.ingenieriaAssigned}
                      original={assignment.ingenieriaOriginal}
                    />
                  </div>

                  {assignment.note ? (
                    <div className="planning-guards__comment">
                      <strong>Nota</strong>
                      <p>{assignment.note}</p>
                      {(assignment.updatedBy || assignment.updatedAt) ? (
                        <small>
                          {assignment.updatedBy || 'Actualizado'} ·{' '}
                          {assignment.updatedAt ? new Date(assignment.updatedAt).toLocaleString('es-MX') : 'Sin fecha'}
                        </small>
                      ) : null}
                    </div>
                  ) : null}

                  {canEdit ? (
                    <div className="planning-guards__actions">
                      {!isEditing ? (
                        <button type="button" className="button-primary inactive" onClick={() => setEditingWeekend(assignment.weekendStart)}>
                          Editar guardia
                        </button>
                      ) : (
                        <div className="planning-guards__editor">
                          <div className="planning-guards__editor-grid">
                            <label>
                              <span>Aplicativo</span>
                              <select
                                className="input-field"
                                value={draft.applicativo}
                                onChange={(event) => { setDraft((current) => ({ ...current, applicativo: event.target.value })); setTargets(current => ({ ...current, applicativo: undefined })); }}
                              >
                                {schedule.roster.aplicativo
                                  .filter((member) => member.active)
                                  .map((member) => (
                                    <option key={member.key} value={member.fullName}>
                                      {member.fullName}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              <span>Ingenieria</span>
                              <select
                                className="input-field"
                                value={draft.ingenieria}
                                onChange={(event) => { setDraft((current) => ({ ...current, ingenieria: event.target.value })); setTargets(current => ({ ...current, ingenieria: undefined })); }}
                              >
                                {schedule.roster.ingenieria
                                  .filter((member) => member.active)
                                  .map((member) => (
                                    <option key={member.key} value={member.fullName}>
                                      {member.fullName}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {(['applicativo', 'ingenieria'] as const).map(area => {
                              if (draft[area] === assignedName(assignment, area)) return null;
                              const candidates = guardSwapCandidates(schedule.assignments, assignment, area, draft[area]);
                              const targetDate = targets[area] || candidates[0]?.weekendStart || '';
                              const target = candidates.find(a => a.weekendStart === targetDate);
                              return <label key={area} className="planning-guards__editor-span-2">
                                <span>Guardia a intercambiar · {area === 'applicativo' ? 'Aplicativo' : 'Ingeniería'}</span>
                                <select className="input-field" value={targetDate} onChange={event => setTargets(current => ({ ...current, [area]: event.target.value }))}>
                                  {!candidates.length && <option value="">Sin guardias vigentes para intercambiar</option>}
                                  {candidates.map(candidate => <option key={candidate.weekendStart} value={candidate.weekendStart}>{candidate.label} · {draft[area]}</option>)}
                                </select>
                                <small>{target ? `${draft[area]} cubre ${assignment.label}; ${assignedName(assignment, area)} cubre ${target.label}. Ambas guardias se guardarán juntas.` : 'Esta persona no tiene una guardia vigente en el calendario para permutar.'}</small>
                              </label>;
                            })}
                            <label className="planning-guards__editor-span-2">
                              <span>Nota / permuta</span>
                              <textarea
                                className="input-field planning-drawer__textarea"
                                value={draft.note}
                                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                                placeholder="Ej. Diego toma esta guardia por permuta con Guillermo."
                              />
                            </label>
                          </div>

                          {saveError && <p role="alert">{saveError}</p>}
                          <div className="planning-guards__editor-actions">
                            <button
                              type="button"
                              className="button-primary"
                              onClick={() => {
                                try {
                                  const resolvedTargets = { ...targets };
                                  for (const area of ['applicativo', 'ingenieria'] as const) {
                                    resolvedTargets[area] ||= guardSwapCandidates(schedule.assignments, assignment, area, draft[area])[0]?.weekendStart;
                                  }
                                  onSaveOverrides(applyGuardSwap(schedule.assignments, overrides, assignment.weekendStart, draft, resolvedTargets, currentUserName));
                                  setEditingWeekend(null);
                                  setSaveError('');
                                } catch (error) {
                                  setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la permuta.');
                                }
                              }}
                            >
                              Guardar permuta
                            </button>
                            <button
                              type="button"
                              className="button-primary inactive"
                              onClick={() => {
                                setEditingWeekend(null);
                                setDraft(EMPTY_DRAFT);
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="button-primary inactive"
                              disabled={!assignment.hasOverride}
                              onClick={() => {
                                setDraft({ applicativo: assignment.applicativoOriginal, ingenieria: assignment.ingenieriaOriginal, note: '' });
                                setTargets({});
                                setSaveError('');
                              }}
                            >
                              Preparar regreso a rotación
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
