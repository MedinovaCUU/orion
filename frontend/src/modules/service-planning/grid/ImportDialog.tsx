import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EquipmentSummary, ProfileSummary } from '../../../components/servicesPlanning';
import { formatPlanningPersonName } from '../helpers/normalizeService';
import { TYPE_LABELS } from './planningColumns';
import { parsePlanningWorkbook, type ExistingPlanningKey, type ImportPreview, type ImportRow } from './planningExcel';
import { emptyValues, type PlanningValues } from './planningRecord';
import { mondayOf, weekFromMonday, type PlanningWeek } from './planningWeeks';

// Excel import: read, show every row with what was understood, let the user fix or skip, then create.

const STATUS_TEXT: Record<ImportRow['status'], string> = { nuevo: 'Nueva', duplicado: 'Duplicada', invalido: 'Incompleta', cancelado: 'Cancelada' };

export interface ImportItem {
  week: PlanningWeek;
  values: PlanningValues;
  meta: Record<string, unknown>;
}

const toItem = (row: ImportRow, fileName: string, batch: string): ImportItem | null => {
  if (!row.weekStart || !row.locality.trim()) return null;
  const week = row.weekEnd
    ? { start: row.weekStart, end: row.weekEnd, label: row.weekLabel, monthKey: row.monthKey || row.weekEnd.slice(0, 7) }
    : weekFromMonday(mondayOf(row.weekStart));
  const serialNote = !row.serialNumber && row.serialText && !/^(NA|N\/A|PENDIENTE)$/i.test(row.serialText.trim()) ? `NS en el archivo: ${row.serialText}` : '';
  return {
    week,
    values: {
      ...emptyValues(),
      serviceType: row.serviceType,
      platform: row.platform,
      locality: row.locality,
      serialNumber: row.serialNumber || '',
      observations: [row.observations, serialNote].filter(Boolean).join(' · '),
      engineer: row.engineer || '',
      companions: row.companions,
      scheduledDate: row.scheduledDate || '',
      scheduledEndDate: row.scheduledEndDate || '',
      days: row.daysText,
      statuses: row.sheetStatus === 'pospuesto' ? ['bloqueado'] : [],
      priority: row.serviceType === 'correctivo' ? 'alta' : 'media',
    },
    // "manual-import" keeps these rows out of the official-workbook sync (it never deletes them).
    meta: { source: 'excel_import', created_from: 'service_planning_grid_import', import_batch_id: `manual-import-${batch}`, source_file_name: fileName, raw_type_label: row.rawType || null },
  };
};

export default function ImportDialog({
  file,
  profiles,
  equipments,
  existing,
  onImport,
  onClose,
}: {
  file: File;
  profiles: ProfileSummary[];
  equipments: EquipmentSummary[];
  existing: ExistingPlanningKey[];
  onImport: (items: ImportItem[]) => Promise<number>;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [filter, setFilter] = useState<ImportRow['status'] | 'all'>('all');

  useEffect(() => {
    let active = true;
    file
      .arrayBuffer()
      .then((data) =>
        parsePlanningWorkbook(data, {
          fileName: file.name,
          profiles,
          equipments: equipments.map((equipment) => ({ numero_serie: equipment.numero_serie, modelo: equipment.modelo })),
          existing,
        }),
      )
      .then((result) => {
        if (!active) return;
        setPreview(result);
        setRows(result.rows);
        setSelected(new Set(result.rows.filter((row) => row.status === 'nuevo').map((row) => row.id)));
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'No se pudo leer el archivo.'));
    return () => {
      active = false;
    };
  }, [equipments, existing, file, profiles]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { nuevo: 0, duplicado: 0, invalido: 0, cancelado: 0 };
    rows.forEach((row) => {
      result[row.status] += 1;
    });
    return result;
  }, [rows]);

  const editRow = (id: string, patch: Partial<ImportRow>) =>
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (next.status === 'invalido' && next.locality.trim() && next.weekStart) {
          next.status = 'nuevo';
          next.issues = next.issues.filter((issue) => !/localidad|semana/i.test(issue));
        }
        return next;
      }),
    );

  const shown = rows.filter((row) => filter === 'all' || row.status === filter);
  const ready = rows.filter((row) => selected.has(row.id) && row.weekStart && row.locality.trim());

  return createPortal(
    <div className="pgrid-modal" role="presentation">
      <div className="pgrid-modal__box pgrid-import" role="dialog" aria-modal="true" aria-label="Importar planeación desde Excel">
        <header>
          <div>
            <span className="planning-eyebrow">Importar desde Excel</span>
            <h3>{file.name}</h3>
            {preview ? <small>{preview.sheets.join(', ')} · {rows.length} filas leídas</small> : null}
          </div>
          <button type="button" className="pgrid-icon" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        {error ? <p role="alert" className="pgrid-import__error">{error}</p> : null}
        {!preview && !error ? <p>Leyendo el archivo…</p> : null}
        {preview ? (
          <>
            <div className="pgrid-import__summary">
              {(['all', 'nuevo', 'duplicado', 'invalido', 'cancelado'] as const).map((status) => (
                <button key={status} type="button" className={filter === status ? 'is-on' : ''} onClick={() => setFilter(status)}>
                  {status === 'all' ? `Todas ${rows.length}` : `${STATUS_TEXT[status]} ${counts[status]}`}
                </button>
              ))}
            </div>
            {preview.warnings.length ? <p className="pgrid-import__warn">{preview.warnings.slice(0, 3).join(' · ')}</p> : null}
            <div className="pgrid-import__table">
              <table>
                <thead>
                  <tr>
                    <th aria-label="Importar" />
                    <th>Estado</th>
                    <th>Semana</th>
                    <th>Servicio</th>
                    <th>Plataforma</th>
                    <th>Localidad</th>
                    <th>N/S</th>
                    <th>Ingeniero</th>
                    <th>Días</th>
                    <th>Revisar</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const importable = Boolean(row.weekStart && row.locality.trim());
                    return (
                      <tr key={row.id} className={`is-${row.status}`}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Importar fila ${row.sheetRow}`}
                            disabled={!importable}
                            checked={selected.has(row.id) && importable}
                            onChange={(event) =>
                              setSelected((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(row.id);
                                else next.delete(row.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td><span className={`pgrid-import__badge is-${row.status}`}>{STATUS_TEXT[row.status]}</span></td>
                        <td>
                          {row.weekStart ? (
                            row.weekLabel
                          ) : (
                            <input type="date" aria-label={`Semana de la fila ${row.sheetRow}`} onChange={(event) => {
                              if (!event.target.value) return;
                              const week = weekFromMonday(mondayOf(event.target.value));
                              editRow(row.id, { weekStart: week.start, weekEnd: week.end, weekLabel: week.label, monthKey: week.monthKey });
                            }} />
                          )}
                        </td>
                        <td>{TYPE_LABELS[row.serviceType]}</td>
                        <td>{row.platform}</td>
                        <td>
                          <input value={row.locality} aria-label={`Localidad de la fila ${row.sheetRow}`} onChange={(event) => editRow(row.id, { locality: event.target.value })} />
                        </td>
                        <td>
                          <input value={row.serialNumber || ''} aria-label={`Serie de la fila ${row.sheetRow}`} onChange={(event) => editRow(row.id, { serialNumber: event.target.value.trim().toUpperCase() || null })} />
                        </td>
                        <td>{[row.engineer, ...row.companions].filter(Boolean).map((name) => formatPlanningPersonName(name) || name).join(' / ')}</td>
                        <td>{row.daysText}</td>
                        <td className="pgrid-import__issues">{row.issues.join(' · ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer>
              {done !== null ? <span role="status">{done} actividades importadas.</span> : <span>{ready.length} actividades listas para importar.</span>}
              <button type="button" className="pgrid-link" onClick={onClose}>{done !== null ? 'Cerrar' : 'Cancelar'}</button>
              {done === null ? (
                <button
                  type="button"
                  className="pgrid-button"
                  disabled={busy || !ready.length}
                  onClick={() => {
                    setBusy(true);
                    const batch = String(Date.now());
                    const items = ready.map((row) => toItem(row, file.name, batch)).filter((item): item is ImportItem => Boolean(item));
                    void onImport(items)
                      .then((count) => setDone(count))
                      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo importar.'))
                      .finally(() => setBusy(false));
                  }}
                >
                  {busy ? 'Importando…' : `Importar ${ready.length}`}
                </button>
              ) : null}
            </footer>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
