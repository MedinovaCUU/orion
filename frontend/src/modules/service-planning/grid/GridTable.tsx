import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import CellEditor, { type EditorMove } from './CellEditor';
import { parseClipboardTable, toClipboardTable } from './clipboard';
import type { DataRow, GridRow } from './gridRows';
import type { ColumnOption, GridColumn, OptionsSource, ParseContext } from './planningColumns';
import { applyPatchToValues, emptyValues, getFieldValue, type FieldValue, type PlanningField, type PlanningValues } from './planningRecord';
import type { PlanningStore, RowState } from './planningStore';
import type { PlanningWeek } from './planningWeeks';
import { describeConflict, type ScheduleConflict } from './scheduleConflicts';
import { absenceTitle, ABSENCE_SHORT, describeAbsenceDates, type PlanningAbsence } from './planningAbsences';
import { formatPlanningPersonName } from '../helpers/normalizeService';

const ROW_HEIGHT = 32;
const WEEK_HEIGHT = 38;
const HEADER_HEIGHT = 34;
const ROW_HEAD_WIDTH = 48;
const OVERSCAN = 10;
// How the spare width is shared when the table is wider than its columns.
const GROW: Record<string, number> = { locality: 3, observations: 4, companions: 1, engineer: 0.7, platform: 0.4, statuses: 0.6 };

interface CellRef {
  rowKey: string;
  colId: string;
}

export interface GridMenuRequest {
  x: number;
  y: number;
  rowKeys: string[];
  recordIds: string[];
  week: PlanningWeek | null;
  rowKey: string;
}

export interface GridTableHandle {
  focusRow: (rowKey: string) => void;
}

interface GridTableProps {
  store: PlanningStore;
  rows: GridRow[];
  columns: GridColumn[];
  pinnedCount: number;
  widths: Record<string, number>;
  canEdit: boolean;
  rowStates: Map<string, RowState>;
  remoteChanged: Set<string>;
  conflicts: Map<string, ScheduleConflict[]>;
  optionsSource: OptionsSource;
  parseContext: ParseContext;
  focusRequest: { rowKey: string; nonce: number } | null;
  onToggleWeek: (weekStart: string) => void;
  /** null returns the column to its automatic width. */
  onColumnResize: (colId: string, width: number | null) => void;
  onColumnMove: (colId: string, beforeColId: string | null) => void;
  onHeaderMenu: (colId: string, x: number, y: number) => void;
  onRowMenu: (request: GridMenuRequest) => void;
  onSelectionChange?: (recordIds: string[]) => void;
  onNotify: (tone: 'info' | 'error', text: string) => void;
  /** Absences (TXT, vacations…) overlapping each week, keyed by the week's Monday. */
  weekAbsences: Map<string, PlanningAbsence[]>;
  onAbsenceCard: (request: { anchor: DOMRect; week: PlanningWeek; absence?: PlanningAbsence }) => void;
}

const isEmptyValue = (value: FieldValue) => (Array.isArray(value) ? value.length === 0 : value === '');

const cellText = (row: DataRow, column: GridColumn) => {
  if (row.kind === 'capture') return '';
  return column.format(row.values, row.kind === 'record' ? row.record : null);
};

const TYPE_CLASS: Record<string, string> = {
  preventivo: 'prev',
  correctivo: 'corr',
  instalacion: 'inst',
  capacitacion: 'capa',
  recapacitacion: 'capa',
  ingenieria_soporte: 'sopo',
};

interface RowViewProps {
  row: DataRow;
  index: number;
  top: number;
  columns: GridColumn[];
  pinnedCount: number;
  pinOffsets: number[];
  activeCol: number;
  rangeCols: [number, number] | null;
  editingCol: number;
  rowSelected: boolean;
  rowState: RowState | undefined;
  remote: boolean;
  scheduleConflicts: ScheduleConflict[] | undefined;
  dropMark: 'before' | 'after' | null;
  editor: React.ReactNode;
  onCellMouseDown: (event: ReactMouseEvent, rowKey: string, colIndex: number) => void;
  onCellMouseEnter: (rowKey: string, colIndex: number) => void;
  onCellDoubleClick: (rowKey: string, colIndex: number) => void;
  onCellContextMenu: (event: ReactMouseEvent, rowKey: string, colIndex: number) => void;
  onRowHeadMouseDown: (event: ReactMouseEvent, rowKey: string) => void;
  onHandlePointerDown: (event: React.PointerEvent, rowKey: string) => void;
  cellRef: (rowKey: string, colIndex: number, element: HTMLDivElement | null) => void;
}

const RowView = memo(function RowView({
  row,
  index,
  top,
  columns,
  pinnedCount,
  pinOffsets,
  activeCol,
  rangeCols,
  editingCol,
  rowSelected,
  rowState,
  remote,
  scheduleConflicts,
  dropMark,
  editor,
  onCellMouseDown,
  onCellMouseEnter,
  onCellDoubleClick,
  onCellContextMenu,
  onRowHeadMouseDown,
  onHandlePointerDown,
  cellRef,
}: RowViewProps) {
  const isCapture = row.kind === 'capture';
  const closed = row.kind === 'record' && row.record.closed;
  const type = row.kind === 'capture' ? '' : TYPE_CLASS[row.values.serviceType] || '';
  const critical = row.kind !== 'capture' && (row.values.statuses.includes('critico') || row.values.priority === 'critica');
  const done = row.kind !== 'capture' && (closed || row.values.statuses.includes('realizado'));
  const status = row.kind === 'draft' ? (row.draft.status === 'error' ? 'error' : row.draft.status === 'saving' ? 'saving' : 'draft') : rowState?.status || 'idle';
  const conflictFields = new Set((rowState?.conflicts || []).map((conflict) => conflict.field));
  const pendingFields = new Set([...Object.keys(rowState?.pending || {}), ...Object.keys(rowState?.inflight || {})]);
  const className = [
    'pgrid-row',
    isCapture ? 'pgrid-row--capture' : '',
    row.kind === 'draft' ? 'pgrid-row--draft' : '',
    type ? `pgrid-row--${type}` : '',
    critical ? 'is-critical' : '',
    done ? 'is-done' : '',
    rowSelected ? 'is-selected' : '',
    remote ? 'is-remote' : '',
    dropMark ? `drop-${dropMark}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const statusTitle =
    status === 'error'
      ? (row.kind === 'draft' ? row.draft.error : rowState?.error) || 'Error al guardar'
      : status === 'conflict'
        ? 'Otro usuario cambió esta actividad'
        : status === 'saving'
          ? 'Guardando…'
          : status === 'pending'
            ? 'Cambios pendientes'
            : status === 'draft'
              ? 'Nueva fila sin guardar'
              : '';

  return (
    <div className={className} role="row" aria-rowindex={index + 2} data-row-key={row.key} style={{ top, height: ROW_HEIGHT }}>
      <div
        className="pgrid-rowhead"
        role="rowheader"
        style={{ left: 0 }}
        onMouseDown={(event) => onRowHeadMouseDown(event, row.key)}
        title={statusTitle || undefined}
      >
        {isCapture ? (
          <span className="pgrid-rowhead__plus" aria-hidden="true">+</span>
        ) : (
          <>
            <span
              className="pgrid-rowhead__handle"
              aria-label="Arrastrar para mover"
              onPointerDown={(event) => onHandlePointerDown(event, row.key)}
              onMouseDown={(event) => event.stopPropagation()}
            >
              ⠿
            </span>
            <span className={`pgrid-dot pgrid-dot--${status}`} aria-label={statusTitle || undefined} />
          </>
        )}
      </div>
      {columns.map((column, colIndex) => {
        const pinned = colIndex < pinnedCount;
        const active = colIndex === activeCol;
        const inRange = rangeCols !== null && colIndex >= rangeCols[0] && colIndex <= rangeCols[1];
        const field = column.field as PlanningField | null;
        const conflict = field ? conflictFields.has(field) : false;
        const pending = field ? pendingFields.has(field) : false;
        const missing = row.kind === 'draft' && column.required && field && isEmptyValue(getFieldValue({ values: row.values }, field));
        const scheduleWarning = column.id === 'engineer' && scheduleConflicts?.length;
        const style: CSSProperties | undefined = pinned ? { left: pinOffsets[colIndex] } : undefined;
        const text = cellText(row, column);
        return (
          <div
            key={column.id}
            ref={(element) => cellRef(row.key, colIndex, element)}
            role="gridcell"
            aria-selected={active || inRange}
            aria-readonly={!column.field || closed || undefined}
            className={[
              'pgrid-cell',
              `pgrid-cell--${column.kind}`,
              pinned ? 'is-pinned' : '',
              pinned && colIndex === pinnedCount - 1 ? 'is-pin-edge' : '',
              active ? 'is-active' : '',
              inRange && !active ? 'in-range' : '',
              conflict ? 'has-conflict' : '',
              pending ? 'is-pending' : '',
              missing ? 'is-missing' : '',
              scheduleWarning ? 'has-warning' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={style}
            onMouseDown={(event) => onCellMouseDown(event, row.key, colIndex)}
            onMouseEnter={() => onCellMouseEnter(row.key, colIndex)}
            onDoubleClick={() => onCellDoubleClick(row.key, colIndex)}
            onContextMenu={(event) => onCellContextMenu(event, row.key, colIndex)}
            title={
              scheduleWarning
                ? scheduleConflicts!.map(describeConflict).join('\n')
                : text.length > 24
                  ? text
                  : undefined
            }
          >
            {editingCol === colIndex ? (
              editor
            ) : isCapture ? (
              colIndex === 0 ? <span className="pgrid-placeholder">Nueva actividad…</span> : null
            ) : column.id === 'serviceType' ? (
              <span className={`pgrid-type pgrid-type--${type}`}>{text}</span>
            ) : column.kind === 'multi' && row.values.statuses.length ? (
              <span className="pgrid-tags">
                {text.split(', ').map((label) => (
                  <span key={label} className="pgrid-tag">{label}</span>
                ))}
              </span>
            ) : (
              <span className="pgrid-text">{text}</span>
            )}
            {scheduleWarning && editingCol !== colIndex ? (
              <span className={`pgrid-warn ${scheduleConflicts!.some((entry) => entry.kind === 'absence') ? 'pgrid-warn--away' : ''}`} aria-label={scheduleConflicts!.map(describeConflict).join('. ')}>
                !
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

export default function GridTable({
  store,
  rows,
  columns,
  pinnedCount,
  widths,
  canEdit,
  rowStates,
  remoteChanged,
  conflicts,
  optionsSource,
  parseContext,
  focusRequest,
  onToggleWeek,
  onColumnResize,
  onColumnMove,
  onHeaderMenu,
  onRowMenu,
  onSelectionChange,
  onNotify,
  weekAbsences,
  onAbsenceCard,
}: GridTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  const [active, setActiveState] = useState<CellRef | null>(null);
  const [anchor, setAnchor] = useState<CellRef | null>(null);
  const [rowMode, setRowMode] = useState(false);
  const [editing, setEditing] = useState<{ rowKey: string; colId: string; initialText: string | null } | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600, width: 0 });
  const [drag, setDrag] = useState<{ keys: string[]; overKey: string | null; position: 'before' | 'after' } | null>(null);
  const selecting = useRef(false);

  // ----- geometry -----
  const dataRows = useMemo(() => rows.filter((row): row is DataRow => row.kind !== 'week'), [rows]);
  const navIndex = useMemo(() => new Map(dataRows.map((row, index) => [row.key, index])), [dataRows]);
  const colIndex = useMemo(() => new Map(columns.map((column, index) => [column.id, index])), [columns]);
  const offsets = useMemo(() => {
    const list: number[] = [];
    let y = 0;
    for (const row of rows) {
      list.push(y);
      y += row.kind === 'week' ? WEEK_HEIGHT : ROW_HEIGHT;
    }
    list.push(y);
    return list;
  }, [rows]);
  const totalHeight = offsets[offsets.length - 1] || 0;
  // Columns fill the available width: the extra space goes mostly to the text columns that get cut
  // (place, notes), never to a column the user sized by hand.
  const columnWidths = useMemo(() => {
    const base = columns.map((column) => widths[column.id] || column.width);
    const extra = viewport.width - ROW_HEAD_WIDTH - base.reduce((sum, width) => sum + width, 0);
    if (extra <= 0) return base;
    const weights = columns.map((column) => (widths[column.id] ? 0 : GROW[column.id] ?? (column.id.startsWith('custom:') ? 1 : 0)));
    let total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!total) {
      weights[weights.length - 1] = 1;
      total = 1;
    }
    const shares = weights.map((weight) => Math.floor((extra * weight) / total));
    // Rounding leftovers go to the column that grows the most, so the right edge meets the border.
    const widest = weights.indexOf(Math.max(...weights));
    shares[widest] += extra - shares.reduce((sum, share) => sum + share, 0);
    return base.map((width, index) => width + shares[index]);
  }, [columns, viewport.width, widths]);
  const widthAt = (index: number) => columnWidths[index] ?? columns[index]?.width ?? 0;

  const pinOffsets = useMemo(() => {
    const list: number[] = [];
    let x = ROW_HEAD_WIDTH;
    columnWidths.forEach((width, index) => {
      list.push(index < pinnedCount ? x : 0);
      if (index < pinnedCount) x += width;
    });
    return list;
  }, [columnWidths, pinnedCount]);
  const template = useMemo(() => `${ROW_HEAD_WIDTH}px ${columnWidths.map((width) => `${width}px`).join(' ')}`, [columnWidths]);
  const totalWidth = useMemo(() => ROW_HEAD_WIDTH + columnWidths.reduce((sum, width) => sum + width, 0), [columnWidths]);

  const visible = useMemo(() => {
    const top = Math.max(0, viewport.top - HEADER_HEIGHT);
    const bottom = top + viewport.height;
    let low = 0;
    let high = rows.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (offsets[mid] <= top) low = mid;
      else high = mid - 1;
    }
    let end = low;
    while (end < rows.length && offsets[end] < bottom) end += 1;
    return { start: Math.max(0, low - OVERSCAN), end: Math.min(rows.length, end + OVERSCAN) };
  }, [offsets, rows.length, viewport]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight, width: element.clientWidth });
    update();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', onScroll);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // ----- selection helpers -----
  const position = useCallback(
    (cell: CellRef | null) => {
      if (!cell) return null;
      const row = navIndex.get(cell.rowKey);
      const col = colIndex.get(cell.colId);
      return row === undefined || col === undefined ? null : { row, col };
    },
    [colIndex, navIndex],
  );
  const activePos = position(active);
  const anchorPos = position(anchor) || activePos;
  const range = activePos && anchorPos
    ? {
        r1: Math.min(activePos.row, anchorPos.row),
        r2: Math.max(activePos.row, anchorPos.row),
        c1: rowMode ? 0 : Math.min(activePos.col, anchorPos.col),
        c2: rowMode ? columns.length - 1 : Math.max(activePos.col, anchorPos.col),
      }
    : null;

  const rangeTop = range?.r1 ?? -1;
  const rangeBottom = range?.r2 ?? -1;
  const selectedRecordIds = useMemo(() => {
    const ids: string[] = [];
    for (let index = rangeTop; index >= 0 && index <= rangeBottom; index += 1) {
      const row = dataRows[index];
      if (row?.kind === 'record') ids.push(row.key);
    }
    return ids;
  }, [dataRows, rangeTop, rangeBottom]);

  useEffect(() => {
    onSelectionChange?.(selectedRecordIds);
  }, [onSelectionChange, selectedRecordIds]);

  const ensureVisible = useCallback(
    (rowKey: string, colId?: string) => {
      const element = scrollRef.current;
      if (!element) return;
      const itemIndex = rows.findIndex((row) => row.key === rowKey);
      if (itemIndex >= 0) {
        const top = offsets[itemIndex] + HEADER_HEIGHT;
        const bottom = offsets[itemIndex + 1] + HEADER_HEIGHT;
        if (top - HEADER_HEIGHT < element.scrollTop) element.scrollTop = top - HEADER_HEIGHT - WEEK_HEIGHT;
        else if (bottom > element.scrollTop + element.clientHeight) element.scrollTop = bottom - element.clientHeight + 8;
      }
      if (colId) {
        const index = colIndex.get(colId);
        if (index !== undefined && index >= pinnedCount) {
          const pinnedWidth = pinOffsets[pinnedCount - 1] !== undefined && pinnedCount > 0 ? pinOffsets[pinnedCount - 1] + columnWidths[pinnedCount - 1] : ROW_HEAD_WIDTH;
          const left = ROW_HEAD_WIDTH + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
          const right = left + columnWidths[index];
          if (left < element.scrollLeft + pinnedWidth) element.scrollLeft = left - pinnedWidth;
          else if (right > element.scrollLeft + element.clientWidth) element.scrollLeft = right - element.clientWidth + 4;
        }
      }
    },
    [colIndex, columnWidths, offsets, pinOffsets, pinnedCount, rows],
  );

  const commitDraftIfLeaving = useCallback(
    (from: CellRef | null, to: CellRef | null) => {
      if (!from || from.rowKey === to?.rowKey || !from.rowKey.startsWith('draft-')) return;
      void store.commitDraft(from.rowKey);
    },
    [store],
  );

  const setActive = useCallback(
    (cell: CellRef | null, options: { extend?: boolean; keepRowMode?: boolean } = {}) => {
      setActiveState((previous) => {
        commitDraftIfLeaving(previous, cell);
        return cell;
      });
      if (!options.extend) setAnchor(cell);
      if (!options.keepRowMode) setRowMode(false);
      if (cell) requestAnimationFrame(() => ensureVisible(cell.rowKey, cell.colId));
    },
    [commitDraftIfLeaving, ensureVisible],
  );

  // A request from outside (calendar click, "Ir a la fila", "Hoy") selects that row once.
  const [handledFocus, setHandledFocus] = useState(focusRequest);
  if (focusRequest !== handledFocus) {
    setHandledFocus(focusRequest);
    if (focusRequest && columns[0]) {
      setActiveState({ rowKey: focusRequest.rowKey, colId: columns[0].id });
      setAnchor({ rowKey: focusRequest.rowKey, colId: columns[0].id });
      setRowMode(false);
    }
  }
  useEffect(() => {
    if (!focusRequest || !columns[0]) return;
    ensureVisible(focusRequest.rowKey, columns[0].id);
    scrollRef.current?.focus({ preventScroll: true });
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active cell valid when rows change (a draft saved, a filter applied).
  if (active && !navIndex.has(active.rowKey)) {
    const fallback = dataRows[0];
    setActiveState(fallback ? { rowKey: fallback.key, colId: active.colId } : null);
    setAnchor(fallback ? { rowKey: fallback.key, colId: active.colId } : null);
  }

  const rowAt = (index: number) => dataRows[Math.max(0, Math.min(dataRows.length - 1, index))];
  const firstEditableCol = () => columns.find((column) => column.field)?.id || columns[0]?.id;

  const canEditCell = (row: DataRow | undefined, column: GridColumn | undefined) =>
    Boolean(row && column && column.field && column.kind !== 'readonly' && canEdit && !(row.kind === 'record' && row.record.closed));

  const focusGrid = () => scrollRef.current?.focus({ preventScroll: true });

  const moveBy = (deltaRow: number, deltaCol: number, extend = false) => {
    if (!activePos) {
      if (dataRows[0] && columns[0]) setActive({ rowKey: dataRows[0].key, colId: columns[0].id });
      return;
    }
    const base = extend && range ? { row: activePos.row, col: activePos.col } : activePos;
    const row = rowAt(base.row + deltaRow);
    const col = columns[Math.max(0, Math.min(columns.length - 1, base.col + deltaCol))];
    if (!row || !col) return;
    setActive({ rowKey: row.key, colId: col.id }, { extend, keepRowMode: extend });
  };

  // ----- editing -----
  const startEdit = (rowKey: string, colId: string, initialText: string | null) => {
    const row = dataRows[navIndex.get(rowKey) ?? -1];
    const column = columns[colIndex.get(colId) ?? -1];
    if (!canEditCell(row, column)) {
      if (row && column && column.field && !canEdit) onNotify('info', 'Tu usuario solo puede consultar la planeación.');
      else if (row?.kind === 'record' && row.record.closed) onNotify('info', 'Esta actividad ya está cerrada; no se modifica desde la planeación.');
      return;
    }
    setEditing({ rowKey, colId, initialText });
  };

  const commitDraftAndContinue = async (draftId: string, week: PlanningWeek) => {
    const created = await store.commitDraft(draftId);
    const capture = `capture:${week.start}`;
    if (created !== null || !store.getSnapshot().drafts.some((draft) => draft.id === draftId)) {
      setActive({ rowKey: capture, colId: firstEditableCol() });
    } else {
      setActive({ rowKey: draftId, colId: 'locality' });
      onNotify('error', 'Falta la localidad o cliente para guardar la actividad.');
    }
    focusGrid();
  };

  const writeValue = (row: DataRow, column: GridColumn, value: FieldValue): string => {
    const field = column.field as PlanningField;
    if (row.kind === 'capture') {
      if (isEmptyValue(value)) return row.key;
      const values = applyPatchToValues(emptyValues(), { [field]: value });
      return store.addDraft(row.week, values, row.order);
    }
    store.edit(row.key, field, value);
    return row.key;
  };

  const handleCommit = (value: FieldValue, move: EditorMove) => {
    if (!editing) return;
    const row = dataRows[navIndex.get(editing.rowKey) ?? -1];
    const column = columns[colIndex.get(editing.colId) ?? -1];
    setEditing(null);
    focusGrid();
    if (!row || !column) return;
    const rowKey = writeValue(row, column, value);
    const isNewRow = row.kind === 'draft' || (row.kind === 'capture' && rowKey !== row.key);
    if (move === 'down' && isNewRow) {
      // Enter on a new row saves it and opens the next empty one, ready to keep typing.
      void commitDraftAndContinue(rowKey, row.week);
      return;
    }
    const col = colIndex.get(column.id) ?? 0;
    const rowPos = navIndex.get(row.key) ?? 0;
    if (move === 'right' || move === 'left') {
      const nextCol = columns[col + (move === 'right' ? 1 : -1)];
      if (nextCol) setActiveState({ rowKey, colId: nextCol.id });
      else setActiveState({ rowKey, colId: column.id });
      setAnchor(null);
      if (nextCol) requestAnimationFrame(() => ensureVisible(rowKey, nextCol.id));
      return;
    }
    if (move === 'down' || move === 'up') {
      const target = rowAt(rowPos + (move === 'down' ? 1 : -1));
      if (target) setActive({ rowKey: target.key, colId: column.id });
      return;
    }
    setActiveState({ rowKey, colId: column.id });
    setAnchor(null);
  };

  // ----- clipboard -----
  const rangeMatrix = () => {
    if (!range) return [] as string[][];
    const matrix: string[][] = [];
    for (let r = range.r1; r <= range.r2; r += 1) {
      const row = dataRows[r];
      const line: string[] = [];
      for (let c = range.c1; c <= range.c2; c += 1) line.push(row ? cellText(row, columns[c]) : '');
      matrix.push(line);
    }
    return matrix;
  };

  const clearRange = () => {
    if (!range || !canEdit) return;
    let skippedRequired = 0;
    for (let r = range.r1; r <= range.r2; r += 1) {
      const row = dataRows[r];
      if (!row || row.kind === 'capture') continue;
      for (let c = range.c1; c <= range.c2; c += 1) {
        const column = columns[c];
        if (!canEditCell(row, column)) continue;
        if (column.required) {
          skippedRequired += 1;
          continue;
        }
        store.edit(row.key, column.field as PlanningField, column.kind === 'people' || column.kind === 'multi' ? [] : '');
      }
    }
    if (skippedRequired) onNotify('info', 'Servicio y localidad no se pueden dejar vacíos.');
  };

  const applyPaste = async (text: string) => {
    if (!activePos || !canEdit) return;
    let matrix = parseClipboardTable(text);
    if (!matrix.length) return;
    const startRow = range ? range.r1 : activePos.row;
    const startCol = range ? range.c1 : activePos.col;
    const targetColumns = columns.slice(startCol);
    // Copying from the workbook often brings its header row: skip it when it matches these columns.
    const headerHits = matrix[0].filter((value, index) => {
      const column = targetColumns[index];
      return column && value && value.trim().toLowerCase().replace(/[^a-záéíóúñ]/g, '').startsWith(column.label.toLowerCase().replace(/[^a-záéíóúñ]/g, '').slice(0, 4));
    }).length;
    if (matrix.length > 1 && headerHits >= Math.max(2, Math.ceil(matrix[0].length / 2))) matrix = matrix.slice(1);

    const errors: string[] = [];
    const parseCell = (column: GridColumn, value: string): { ok: true; value: FieldValue } | { ok: false } => {
      const parsed = column.parse(value, parseContext);
      if ('error' in parsed) {
        errors.push(parsed.error);
        return { ok: false };
      }
      return { ok: true, value: parsed.value };
    };

    // One value over a selected range fills the whole range.
    if (matrix.length === 1 && matrix[0].length === 1 && range && (range.r2 > range.r1 || range.c2 > range.c1)) {
      for (let r = range.r1; r <= range.r2; r += 1) {
        const row = dataRows[r];
        if (!row || row.kind === 'capture') continue;
        for (let c = range.c1; c <= range.c2; c += 1) {
          const column = columns[c];
          if (!canEditCell(row, column)) continue;
          const parsed = parseCell(column, matrix[0][0]);
          if (parsed.ok) store.edit(row.key, column.field as PlanningField, parsed.value);
        }
      }
      if (errors.length) onNotify('error', `No se pegaron ${errors.length} celdas: ${errors[0]}`);
      return;
    }

    const startData = dataRows[startRow];
    if (!startData) return;
    const week = startData.week;
    const newItems: PlanningValues[] = [];
    let updated = 0;
    matrix.forEach((line, offset) => {
      const row = dataRows[startRow + offset];
      const existing = row && row.week.start === week.start && (row.kind === 'record' || row.kind === 'draft') ? row : null;
      if (existing) {
        line.forEach((value, index) => {
          const column = targetColumns[index];
          if (!canEditCell(existing, column)) return;
          const parsed = parseCell(column, value);
          if (parsed.ok) store.edit(existing.key, column.field as PlanningField, parsed.value);
        });
        updated += 1;
        return;
      }
      // Past the week's rows: every pasted line becomes a new activity of that week.
      let values = emptyValues();
      line.forEach((value, index) => {
        const column = targetColumns[index];
        if (!column?.field || column.kind === 'readonly') return;
        const parsed = parseCell(column, value);
        if (parsed.ok) values = applyPatchToValues(values, { [column.field]: parsed.value });
      });
      if (line.some((value) => value.trim())) newItems.push(values);
    });

    let created = 0;
    if (newItems.length) {
      const capture = dataRows.find((row) => row.kind === 'capture' && row.week.start === week.start);
      let order = capture?.order ?? 1000;
      const ready = newItems.filter((values) => values.locality.trim());
      const incomplete = newItems.filter((values) => !values.locality.trim());
      const ids = await store.insertValues(ready.map((values) => ({ week, values, order: (order += 10) })));
      created = ids.length;
      incomplete.forEach((values) => store.addDraft(week, values, (order += 10)));
      if (incomplete.length) errors.push(`${incomplete.length} filas sin localidad quedaron como borrador`);
    }
    const parts = [created ? `${created} nuevas` : '', updated ? `${updated} actualizadas` : ''].filter(Boolean).join(', ');
    onNotify(errors.length ? 'error' : 'info', `${parts ? `Pegado: ${parts}.` : 'Nada que pegar.'}${errors.length ? ` Revisar: ${errors.slice(0, 2).join('; ')}${errors.length > 2 ? '…' : ''}` : ''}`);
  };

  const onCopy = (event: ReactClipboardEvent) => {
    if (editing || !range) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', toClipboardTable(rangeMatrix()));
  };
  const onCut = (event: ReactClipboardEvent) => {
    onCopy(event);
    clearRange();
  };
  const onPaste = (event: ReactClipboardEvent) => {
    if (editing) return;
    event.preventDefault();
    void applyPaste(event.clipboardData.getData('text/plain'));
  };

  // ----- row actions -----
  const insertBelow = (rowKey: string) => {
    const index = navIndex.get(rowKey);
    if (index === undefined || !canEdit) return;
    const row = dataRows[index];
    const next = dataRows[index + 1];
    const order = next && next.week.start === row.week.start && next.kind !== 'capture' ? (row.order + next.order) / 2 : row.order + 500;
    const id = store.addDraft(row.week, {}, order);
    setActive({ rowKey: id, colId: firstEditableCol() });
    focusGrid();
  };

  const menuFor = (x: number, y: number, rowKey: string) => {
    const row = dataRows[navIndex.get(rowKey) ?? -1];
    const recordIds = selectedRecordIds.includes(rowKey) ? selectedRecordIds : row?.kind === 'record' ? [rowKey] : [];
    onRowMenu({ x, y, rowKeys: [rowKey], recordIds, week: row?.week || null, rowKey });
  };

  // Exposed to the context menu through window events (keeps the menu outside this component).
  useEffect(() => {
    const onInsert = (event: Event) => insertBelow((event as CustomEvent<string>).detail);
    const onCopyRequest = () => {
      const text = toClipboardTable(rangeMatrix());
      void navigator.clipboard?.writeText(text).catch(() => onNotify('info', 'Usa Cmd/Ctrl + C para copiar.'));
    };
    const onPasteRequest = () => {
      if (!navigator.clipboard?.readText) {
        onNotify('info', 'Usa Cmd/Ctrl + V para pegar.');
        return;
      }
      navigator.clipboard
        .readText()
        .then((text) => applyPaste(text))
        .catch(() => onNotify('info', 'El navegador no permitió leer el portapapeles; usa Cmd/Ctrl + V.'));
    };
    window.addEventListener('pgrid:insert-below', onInsert);
    window.addEventListener('pgrid:copy', onCopyRequest);
    window.addEventListener('pgrid:paste', onPasteRequest);
    return () => {
      window.removeEventListener('pgrid:insert-below', onInsert);
      window.removeEventListener('pgrid:copy', onCopyRequest);
      window.removeEventListener('pgrid:paste', onPasteRequest);
    };
  });

  // ----- keyboard -----
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const meta = event.metaKey || event.ctrlKey;
    const key = event.key;
    if (!activePos) {
      if (key.startsWith('Arrow') || key === 'Tab' || key === 'Enter') {
        event.preventDefault();
        moveBy(0, 0);
      }
      return;
    }
    const row = dataRows[activePos.row];
    const column = columns[activePos.col];
    if (meta && key.toLowerCase() === 'z') {
      event.preventDefault();
      void store.undo();
      return;
    }
    if (meta && key.toLowerCase() === 'a') {
      event.preventDefault();
      if (dataRows.length && columns.length) {
        setAnchor({ rowKey: dataRows[0].key, colId: columns[0].id });
        setActiveState({ rowKey: dataRows[dataRows.length - 1].key, colId: columns[columns.length - 1].id });
      }
      return;
    }
    if (meta && key.toLowerCase() === 'd') {
      event.preventDefault();
      if (selectedRecordIds.length && canEdit) void store.duplicate(selectedRecordIds).then((ids) => ids.length && onNotify('info', `${ids.length} actividad(es) duplicada(s).`));
      return;
    }
    if ((meta && key === 'Enter') || (meta && event.shiftKey && (key === '+' || key === '='))) {
      event.preventDefault();
      insertBelow(row.key);
      return;
    }
    if (meta && (key === '-' || key === 'Backspace')) {
      event.preventDefault();
      if (selectedRecordIds.length) menuFor(-1, -1, row.key);
      window.dispatchEvent(new CustomEvent('pgrid:request-delete', { detail: selectedRecordIds }));
      return;
    }
    if (event.shiftKey && key === ' ') {
      event.preventDefault();
      setRowMode(true);
      return;
    }
    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault();
        const vertical = key === 'ArrowDown' || key === 'ArrowUp';
        const sign = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
        if (meta) {
          const target = vertical ? rowAt(sign > 0 ? dataRows.length - 1 : 0) : null;
          const col = vertical ? column : columns[sign > 0 ? columns.length - 1 : 0];
          if (target || col) setActive({ rowKey: (target || row).key, colId: col.id }, { extend: event.shiftKey });
          return;
        }
        moveBy(vertical ? sign : 0, vertical ? 0 : sign, event.shiftKey);
        return;
      }
      case 'Tab':
        event.preventDefault();
        moveBy(0, event.shiftKey ? -1 : 1);
        return;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        startEdit(row.key, column.id, null);
        return;
      case 'Escape':
        setAnchor(active);
        setRowMode(false);
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        clearRange();
        return;
      case 'Home':
        event.preventDefault();
        setActive({ rowKey: row.key, colId: columns[0].id });
        return;
      case 'End':
        event.preventDefault();
        setActive({ rowKey: row.key, colId: columns[columns.length - 1].id });
        return;
      default:
        if (key.length === 1 && !meta && !event.altKey) {
          event.preventDefault();
          startEdit(row.key, column.id, key);
        }
    }
  };

  // ----- mouse -----
  const onCellMouseDown = useCallback((event: ReactMouseEvent, rowKey: string, index: number) => {
    if (event.button !== 0) return;
    const colId = columns[index]?.id;
    if (!colId) return;
    if (editing && (editing.rowKey !== rowKey || editing.colId !== colId)) setEditing(null);
    if (event.shiftKey) setActive({ rowKey, colId }, { extend: true });
    else {
      setActive({ rowKey, colId });
      selecting.current = true;
    }
    focusGrid();
    event.preventDefault();
  }, [columns, editing, setActive]);

  const onCellMouseEnter = useCallback((rowKey: string, index: number) => {
    if (!selecting.current) return;
    const colId = columns[index]?.id;
    if (colId) setActiveState({ rowKey, colId });
  }, [columns]);

  useEffect(() => {
    const stop = () => {
      selecting.current = false;
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // Rows are memoized; their handlers read the latest state through this ref instead of changing identity.
  const latest = useRef({ startEdit, menuFor, range, navIndex });
  useLayoutEffect(() => {
    latest.current = { startEdit, menuFor, range, navIndex };
  });

  const onCellDoubleClick = useCallback((rowKey: string, index: number) => {
    const colId = columns[index]?.id;
    if (colId) latest.current.startEdit(rowKey, colId, null);
  }, [columns]);

  const onCellContextMenu = useCallback((event: ReactMouseEvent, rowKey: string, index: number) => {
    event.preventDefault();
    const colId = columns[index]?.id;
    const { range: current, navIndex: positions, menuFor: openMenu } = latest.current;
    const pos = positions.get(rowKey);
    const inside = current && pos !== undefined && pos >= current.r1 && pos <= current.r2 && index >= current.c1 && index <= current.c2;
    if (!inside && colId) setActive({ rowKey, colId });
    openMenu(event.clientX, event.clientY, rowKey);
  }, [columns, setActive]);

  const onRowHeadMouseDown = useCallback((event: ReactMouseEvent, rowKey: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const first = columns[0]?.id;
    if (!first) return;
    if (event.shiftKey && anchor) {
      setActiveState({ rowKey, colId: columns[columns.length - 1].id });
    } else {
      setActive({ rowKey, colId: first }, { keepRowMode: true });
      setAnchor({ rowKey, colId: first });
    }
    setRowMode(true);
    focusGrid();
  }, [anchor, columns, setActive]);

  // Drag a row by its handle: onto another row to reorder or move to that week, onto a week band to move there.
  const onHandlePointerDown = useCallback((event: React.PointerEvent, rowKey: string) => {
    if (!canEdit || event.button !== 0) return;
    event.preventDefault();
    const row = dataRows[navIndex.get(rowKey) ?? -1];
    if (!row || row.kind !== 'record' || row.record.closed) return;
    const keys = selectedRecordIds.includes(rowKey) ? selectedRecordIds : [rowKey];
    setDrag({ keys, overKey: null, position: 'before' });
    const element = scrollRef.current!;
    const locate = (clientY: number) => {
      const rect = element.getBoundingClientRect();
      const y = clientY - rect.top + element.scrollTop - HEADER_HEIGHT;
      let index = offsets.findIndex((offset, i) => y >= offset && y < offsets[i + 1]);
      if (index < 0) index = rows.length - 1;
      const target = rows[index];
      const position: 'before' | 'after' = y - offsets[index] > (offsets[index + 1] - offsets[index]) / 2 ? 'after' : 'before';
      return { target, position };
    };
    const onMove = (moveEvent: PointerEvent) => {
      const { target, position } = locate(moveEvent.clientY);
      setDrag((current) => (current ? { ...current, overKey: target?.key || null, position } : current));
      const rect = element.getBoundingClientRect();
      if (moveEvent.clientY < rect.top + 40) element.scrollTop -= 12;
      else if (moveEvent.clientY > rect.bottom - 40) element.scrollTop += 12;
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      const { target, position } = locate(upEvent.clientY);
      if (!target || keys.includes(target.key)) return;
      const targetWeek = target.week;
      const weekRows = dataRows.filter((entry) => entry.week.start === targetWeek.start && entry.kind !== 'capture' && !keys.includes(entry.key));
      let before: number;
      let after: number;
      if (target.kind === 'week' || target.kind === 'capture') {
        before = weekRows.length ? weekRows[weekRows.length - 1].order : 0;
        after = before + 1000 * (keys.length + 1);
      } else {
        const at = weekRows.findIndex((entry) => entry.key === target.key);
        const prev = position === 'before' ? weekRows[at - 1] : weekRows[at];
        const next = position === 'before' ? weekRows[at] : weekRows[at + 1];
        before = prev ? prev.order : (next ? next.order - 1000 : 0);
        after = next ? next.order : before + 1000 * (keys.length + 1);
      }
      const moving = keys.filter((key) => store.getSnapshot().records.has(key));
      const sameWeek = moving.filter((key) => store.getSnapshot().records.get(key)!.week.start === targetWeek.start);
      const otherWeek = moving.filter((key) => !sameWeek.includes(key));
      if (otherWeek.length) store.move(otherWeek, targetWeek);
      moving.forEach((key, index) => store.reorder(key, before + ((after - before) * (index + 1)) / (moving.length + 1)));
      if (otherWeek.length) onNotify('info', `${otherWeek.length} actividad(es) movida(s) a la semana ${targetWeek.label.toLowerCase()}.`);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [canEdit, dataRows, navIndex, offsets, onNotify, rows, selectedRecordIds, store]);

  const cellRef = useCallback((rowKey: string, index: number, element: HTMLDivElement | null) => {
    const key = `${rowKey}|${index}`;
    if (element) cells.current.set(key, element);
    else cells.current.delete(key);
  }, []);

  // ----- column header -----
  const startResize = (event: ReactMouseEvent, column: GridColumn) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthAt(colIndex.get(column.id) ?? 0);
    const onMove = (moveEvent: MouseEvent) => onColumnResize(column.id, Math.max(56, Math.min(640, startWidth + moveEvent.clientX - startX)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const [colDrag, setColDrag] = useState<{ id: string; over: string | null } | null>(null);
  const startColumnDrag = (event: React.PointerEvent, column: GridColumn) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    let started = false;
    const headerCells = () => Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-col-id]') || []);
    const overAt = (clientX: number) => headerCells().find((cell) => {
      const rect = cell.getBoundingClientRect();
      return clientX >= rect.left && clientX < rect.right;
    })?.dataset.colId || null;
    const onMove = (moveEvent: PointerEvent) => {
      if (!started && Math.abs(moveEvent.clientX - startX) < 6) return;
      started = true;
      setColDrag({ id: column.id, over: overAt(moveEvent.clientX) });
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setColDrag(null);
      if (!started) {
        // A plain click selects the whole column.
        if (dataRows.length) {
          setAnchor({ rowKey: dataRows[0].key, colId: column.id });
          setActiveState({ rowKey: dataRows[dataRows.length - 1].key, colId: column.id });
          setRowMode(false);
          focusGrid();
        }
        return;
      }
      const over = overAt(upEvent.clientX);
      if (over && over !== column.id) onColumnMove(column.id, over);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ----- render -----
  const editorFor = (row: DataRow, column: GridColumn) => {
    if (!editing || editing.rowKey !== row.key || editing.colId !== column.id) return null;
    const value = row.kind === 'capture' ? getFieldValue({ values: emptyValues() }, column.field as PlanningField) : getFieldValue({ values: row.values }, column.field as PlanningField);
    const options: ColumnOption[] = column.options ? column.options(optionsSource, row.kind === 'capture' ? emptyValues() : row.values) : [];
    return (
      <CellEditor
        column={column}
        value={value}
        initialText={editing.initialText}
        options={options}
        parseContext={parseContext}
        getAnchor={() => cells.current.get(`${row.key}|${colIndex.get(column.id)}`) || null}
        onCommit={handleCommit}
        onCancel={() => {
          setEditing(null);
          focusGrid();
        }}
      />
    );
  };

  const rendered: React.ReactNode[] = [];
  for (let index = visible.start; index < visible.end; index += 1) {
    const row = rows[index];
    const top = offsets[index];
    if (row.kind === 'week') {
      rendered.push(
        <div
          key={row.key}
          className={`pgrid-week ${row.current ? 'is-current' : ''} ${drag?.overKey === row.key ? 'is-drop' : ''}`}
          role="row"
          style={{ top, height: WEEK_HEIGHT }}
        >
          <div className="pgrid-week__inner">
            <button type="button" className="pgrid-week__toggle" onClick={() => onToggleWeek(row.week.start)} aria-expanded={!row.collapsed} aria-label={`${row.collapsed ? 'Mostrar' : 'Ocultar'} semana ${row.week.label}`}>
              {row.collapsed ? '▸' : '▾'}
            </button>
            <strong>{row.week.label}</strong>
            <span className="pgrid-week__count">{row.count === 1 ? '1 actividad' : `${row.count} actividades`}</span>
            {row.current ? <span className="pgrid-week__now">Semana actual</span> : null}
            {(weekAbsences.get(row.week.start) || []).map((absence) => (
              <button
                key={absence.id}
                type="button"
                className={`pgrid-week__away pgrid-week__away--${absence.kind.toLowerCase()}`}
                title={`${absenceTitle(absence)}\nDoble clic para ver o cambiar`}
                onDoubleClick={(event) => onAbsenceCard({ anchor: event.currentTarget.getBoundingClientRect(), week: row.week, absence })}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  onAbsenceCard({ anchor: event.currentTarget.getBoundingClientRect(), week: row.week, absence });
                }}
              >
                <b>{ABSENCE_SHORT[absence.kind]}</b> {formatPlanningPersonName(absence.personName) || absence.personName} · {describeAbsenceDates(absence)}
              </button>
            ))}
            {canEdit ? (
              <button type="button" className="pgrid-week__add-away" onClick={(event) => onAbsenceCard({ anchor: event.currentTarget.getBoundingClientRect(), week: row.week })}>
                + Ausencia
              </button>
            ) : null}
          </div>
        </div>,
      );
      continue;
    }
    const navPos = navIndex.get(row.key) ?? -1;
    const inRows = range ? navPos >= range.r1 && navPos <= range.r2 : false;
    const isActiveRow = activePos?.row === navPos;
    const editingCol = editing && editing.rowKey === row.key ? colIndex.get(editing.colId) ?? -1 : -1;
    const editingColumn = editingCol >= 0 ? columns[editingCol] : null;
    rendered.push(
      <RowView
        key={row.key}
        row={row}
        index={index}
        top={top}
        columns={columns}
        pinnedCount={pinnedCount}
        pinOffsets={pinOffsets}
        activeCol={isActiveRow ? activePos!.col : -1}
        rangeCols={inRows && range ? [range.c1, range.c2] : null}
        editingCol={editingCol}
        rowSelected={inRows && rowMode}
        rowState={rowStates.get(row.key)}
        remote={remoteChanged.has(row.key)}
        scheduleConflicts={conflicts.get(row.key)}
        dropMark={drag && drag.overKey === row.key ? drag.position : null}
        editor={editingColumn ? editorFor(row, editingColumn) : null}
        onCellMouseDown={onCellMouseDown}
        onCellMouseEnter={onCellMouseEnter}
        onCellDoubleClick={onCellDoubleClick}
        onCellContextMenu={onCellContextMenu}
        onRowHeadMouseDown={onRowHeadMouseDown}
        onHandlePointerDown={onHandlePointerDown}
        cellRef={cellRef}
      />,
    );
  }

  return (
    <div
      ref={scrollRef}
      className="pgrid-scroll"
      tabIndex={0}
      role="grid"
      aria-label="Tabla maestra de planeación"
      aria-rowcount={dataRows.length + 1}
      aria-colcount={columns.length + 1}
      style={{ '--pgrid-template': template, '--pgrid-width': `${totalWidth}px` } as CSSProperties}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
    >
      <div className="pgrid-header" role="row" style={{ height: HEADER_HEIGHT }}>
        <div className="pgrid-header__corner" style={{ left: 0 }} />
        {columns.map((column, index) => (
          <div
            key={column.id}
            data-col-id={column.id}
            role="columnheader"
            className={[
              'pgrid-header__cell',
              index < pinnedCount ? 'is-pinned' : '',
              index === pinnedCount - 1 ? 'is-pin-edge' : '',
              colDrag?.over === column.id && colDrag.id !== column.id ? 'is-drop' : '',
              colDrag?.id === column.id ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={index < pinnedCount ? { left: pinOffsets[index] } : undefined}
            onPointerDown={(event) => startColumnDrag(event, column)}
            onContextMenu={(event) => {
              event.preventDefault();
              onHeaderMenu(column.id, event.clientX, event.clientY);
            }}
            title="Arrastra para reordenar · clic derecho para opciones"
          >
            <span>{column.label}</span>
            {column.required ? <i aria-hidden="true">•</i> : null}
            <span
              className="pgrid-header__resize"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Ajustar ancho de ${column.label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => startResize(event, column)}
              onDoubleClick={() => onColumnResize(column.id, null)}
            />
          </div>
        ))}
      </div>
      <div className="pgrid-body" style={{ height: totalHeight }}>
        {rendered}
      </div>
      {!dataRows.length ? <p className="pgrid-empty">No hay semanas en este periodo.</p> : null}
    </div>
  );
}
