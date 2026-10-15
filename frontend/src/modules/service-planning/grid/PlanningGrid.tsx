import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { EquipmentSummary, ProfileSummary } from '../../../components/servicesPlanning';
import { buildPlanningSubject, formatPlanningPersonName, normalizeText } from '../helpers/normalizeService';
import GridTable, { type GridMenuRequest } from './GridTable';
import { ColumnsPanel, ConfirmDialog, ConflictRulesPanel, FilterPanel, Floating, MenuList, ViewsPanel, WeekPicker, type MenuItem } from './GridMenus';
import { buildGridRows } from './gridRows';
import AbsencePopover from './AbsencePopover';
import ApprovalsPanel from './ApprovalsPanel';
import { notifiedApproverName, type ApprovalContext, type ChangeRequest, type InsertPayload } from './planningApprovals';
import HistoryPanel from './HistoryPanel';
import { ABSENCE_SHORT, overlaps, type AbsenceInput, type PlanningAbsence } from './planningAbsences';
import ImportDialog, { type ImportItem } from './ImportDialog';
import PlanningCalendar from './PlanningCalendar';
import type { CustomColumn, GridSettings, PlanningBackend, SavedView } from './planningBackend';
import { BASE_COLUMNS, buildOptionsSource, customColumnToGrid, DEFAULT_PINNED, TYPE_LABELS, type GridColumn } from './planningColumns';
import { activeFilterCount, BUILT_IN_VIEWS, EMPTY_FILTERS, filtersFromView, isDone, matchesFilters, viewFromFilters, type GridFilters } from './planningFilters';
import type { PlanningField, PlanningRecord, PlanningValues } from './planningRecord';
import { PlanningStore } from './planningStore';
import { addDays, daysBetween, monthKeyOf, monthTitle, shiftMonth, todayIso, weekOfDate, weeksOfMonth, type PlanningWeek } from './planningWeeks';
import { DEFAULT_CONFLICT_RULES, findScheduleConflicts, type ConflictRules } from './scheduleConflicts';
import './planningGrid.css';

export interface PlanningGridProps {
  backend: PlanningBackend | null;
  backendError?: string | null;
  profiles: ProfileSummary[];
  equipments: EquipmentSummary[];
  currentUserName: string;
  currentUserId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canManageColumns: boolean;
  canImport: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  onPersisted?: () => void;
}

type Panel = 'filters' | 'views' | 'columns' | 'excel' | 'rules' | null;

const FIELD_COLUMN_LABELS: Record<string, string> = Object.fromEntries(BASE_COLUMNS.map((column) => [column.id, column.label]));

const download = (data: ArrayBuffer, fileName: string) => {
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const relative = (iso: string | null, now: number) => {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return 'hace un momento';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `hace ${minutes} min` : `a las ${new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function PlanningGrid(props: PlanningGridProps) {
  const { backend, backendError, profiles, equipments, currentUserName, currentUserId, canEdit, canDelete, canManageColumns, canImport, month, onMonthChange, onPersisted } = props;
  const ctx = useMemo(() => ({ profiles, equipments, actorName: currentUserName || 'Operación ORION', actorId: currentUserId }), [currentUserId, currentUserName, equipments, profiles]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const store = useMemo(() => (backend ? new PlanningStore(backend, ctxRef.current) : null), [backend]);

  useEffect(() => {
    if (!store) return;
    void store.load();
    return () => store.dispose();
  }, [store]);
  useEffect(() => store?.setContext(ctx), [ctx, store]);
  useEffect(() => {
    if (!store || !onPersisted) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = store.onPersisted(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onPersisted, 900);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [onPersisted, store]);

  const emptySnapshot = useMemo(() => ({ loading: true, loadError: null, records: new Map(), rowStates: new Map(), drafts: [], lastSavedAt: null, notices: [], remoteChangedIds: new Set<string>(), canUndo: false, absences: [], approval: { enabled: false, isApprover: true, approvers: [] }, requests: [] }), []);
  const snapshot = useSyncExternalStore(store ? store.subscribe : () => () => undefined, store ? store.getSnapshot : () => emptySnapshot);

  // ----- preferences -----
  const [settings, setSettings] = useState<GridSettings>({});
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const settingsLoaded = useRef(false);
  useEffect(() => {
    if (!backend) return;
    let active = true;
    void Promise.all([backend.loadSettings(), backend.listCustomColumns(), backend.listViews()])
      .then(([loaded, columns, views]) => {
        if (!active) return;
        setSettings(loaded);
        setCustomColumns(columns);
        setSavedViews(views);
        settingsLoaded.current = true;
      })
      .catch(() => {
        settingsLoaded.current = true;
      });
    return () => {
      active = false;
    };
  }, [backend]);
  useEffect(() => {
    if (!backend || !settingsLoaded.current) return;
    const timer = setTimeout(() => void backend.saveSettings(settings).catch(() => undefined), 600);
    return () => clearTimeout(timer);
  }, [backend, settings]);

  const [filters, setFilters] = useState<GridFilters>(EMPTY_FILTERS);
  const [viewId, setViewId] = useState('general');
  const [layout, setLayout] = useState<'table' | 'calendar'>('table');
  const [panel, setPanel] = useState<{ kind: Panel; x: number; y: number }>({ kind: null, x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<GridMenuRequest | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ colId: string; x: number; y: number } | null>(null);
  const [movePicker, setMovePicker] = useState<{ ids: string[]; x: number; y: number; mode: 'move' | 'copy'; week: PlanningWeek | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ rowKey: string; nonce: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fileInput = useRef<HTMLInputElement>(null);
  const today = todayIso();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onDelete = (event: Event) => {
      const ids = (event as CustomEvent<string[]>).detail;
      if (ids?.length && canDelete) setConfirmDelete(ids);
    };
    window.addEventListener('pgrid:request-delete', onDelete);
    return () => window.removeEventListener('pgrid:request-delete', onDelete);
  }, [canDelete]);

  // Keep unsaved edits from being lost when leaving the page.
  useEffect(() => {
    if (!store) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const summary = store.syncSummary();
      if (summary.pending + summary.saving + summary.errors + summary.conflicts > 0 || store.getSnapshot().drafts.some((draft) => !store.isDraftEmpty(draft.id))) {
        void store.flushAll();
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [store]);

  // ----- columns -----
  const allColumns = useMemo<GridColumn[]>(() => [...BASE_COLUMNS, ...customColumns.map(customColumnToGrid)], [customColumns]);
  const hidden = useMemo(
    () => settings.hiddenColumns ?? allColumns.filter((column) => column.hiddenByDefault).map((column) => column.id),
    [allColumns, settings.hiddenColumns],
  );
  const pinned = settings.pinnedColumns ?? DEFAULT_PINNED;
  const orderedColumns = useMemo(() => {
    const order = settings.columnOrder || [];
    const rank = (id: string) => {
      const index = order.indexOf(id);
      return index < 0 ? 1000 + allColumns.findIndex((column) => column.id === id) : index;
    };
    return [...allColumns].sort((left, right) => rank(left.id) - rank(right.id));
  }, [allColumns, settings.columnOrder]);
  const visibleColumns = useMemo(() => {
    const shown = orderedColumns.filter((column) => !hidden.includes(column.id) || column.required);
    return [...shown.filter((column) => pinned.includes(column.id)), ...shown.filter((column) => !pinned.includes(column.id))];
  }, [hidden, orderedColumns, pinned]);
  const pinnedCount = visibleColumns.filter((column) => pinned.includes(column.id)).length;
  const widths = settings.columnWidths || {};

  // ----- data -----
  const records = useMemo(() => Array.from(snapshot.records.values()) as PlanningRecord[], [snapshot.records]);
  const absences = snapshot.absences as PlanningAbsence[];
  // ----- approval flow -----
  const approval = snapshot.approval as ApprovalContext;
  const requests = snapshot.requests as ChangeRequest[];
  const proposing = approval.enabled && !approval.isApprover;
  const approverName = notifiedApproverName(approval);
  const ownPending = useMemo(
    () => requests.filter((request) => request.status === 'pending' && (request.requestedBy === currentUserId || request.requestedByName === ctx.actorName)),
    [ctx.actorName, currentUserId, requests],
  );
  const proposals = useMemo(
    () =>
      proposing
        ? ownPending.filter((request) => request.kind === 'insert').map((request) => ({ request, week: (request.payload as unknown as InsertPayload).week, values: (request.payload as unknown as InsertPayload).values }))
        : [],
    [ownPending, proposing],
  );
  const proposedFields = useMemo(() => {
    const map = new Map<string, string>();
    if (!store || !proposing) return map;
    records.forEach((record) => {
      const fields = store.proposedFields(record.id);
      if (fields.length) map.set(record.id, fields.join(','));
    });
    return map;
  }, [proposing, records, requests, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingDeletes = useMemo(() => new Set(proposing ? ownPending.filter((request) => request.kind === 'delete' && request.ticketId).map((request) => request.ticketId as string) : []), [ownPending, proposing]);
  const pendingForApprover = approval.enabled && approval.isApprover ? requests.filter((request) => request.status === 'pending').length : 0;
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  // What the user sees: real absences, the ones they asked to change marked, and the ones they proposed.
  const shownAbsences = useMemo(() => {
    if (!proposing || !store) return absences;
    const marks = new Map(ownPending.filter((request) => request.absenceId).map((request) => [request.absenceId as string, request.kind === 'absence_delete' ? 'delete' as const : 'update' as const]));
    return [
      ...absences.map((absence) => (marks.has(absence.id) ? { ...absence, proposal: marks.get(absence.id) } : absence)),
      ...store.proposedAbsences().filter((absence) => absence.proposal === 'insert'),
    ];
  }, [absences, ownPending, proposing, store]);
  const allItems = useMemo(
    () => (store ? records.map((record) => ({ record: store.displayRecord(record), values: store.displayValues(record) })) : []),
    [records, snapshot.rowStates, store], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ranged = Boolean(filters.dateFrom || filters.dateTo);
  const scopeItems = useMemo(() => allItems.filter((item) => ranged || item.record.week.monthKey === month), [allItems, month, ranged]);
  const items = useMemo(() => scopeItems.filter((item) => matchesFilters(item.record, item.values, filters, currentUserName)), [currentUserName, filters, scopeItems]);
  const rows = useMemo(
    () => buildGridRows({ month, dateFrom: filters.dateFrom, dateTo: filters.dateTo, items, drafts: snapshot.drafts, collapsed, today, showCapture: canEdit, proposals }),
    [canEdit, collapsed, filters.dateFrom, filters.dateTo, items, month, proposals, snapshot.drafts, today],
  );
  const rules: ConflictRules = { ...DEFAULT_CONFLICT_RULES, ...(settings.conflictRules || {}) };
  const scheduleConflicts = useMemo(() => findScheduleConflicts(allItems, rules, absences), [absences, allItems, rules.enabled, rules.includeCompanions, rules.sameLocalityIsConflict]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekAbsences = useMemo(() => {
    const map = new Map<string, PlanningAbsence[]>();
    rows.forEach((row) => {
      if (row.kind !== 'week') return;
      const inWeek = shownAbsences
        .filter((absence) => overlaps(absence, row.week.start, row.week.end))
        .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.personName.localeCompare(right.personName, 'es'));
      if (inWeek.length) map.set(row.week.start, inWeek);
    });
    return map;
  }, [rows, shownAbsences]);
  const [absenceCard, setAbsenceCard] = useState<{ anchor: DOMRect; week: PlanningWeek; absence?: PlanningAbsence } | null>(null);
  const optionsSource = useMemo(() => buildOptionsSource(records, profiles, equipments), [equipments, profiles, records]);
  const parseContext = useMemo(() => ({ profiles, referenceDate: `${month}-15` }), [month, profiles]);

  const indicators = useMemo(() => {
    let pending = 0;
    let done = 0;
    let unassigned = 0;
    let conflicted = 0;
    let away = 0;
    for (const item of scopeItems) {
      if (isDone(item.record, item.values)) done += 1;
      else {
        pending += 1;
        if (!item.values.engineer) unassigned += 1;
      }
      const found = scheduleConflicts.get(item.record.id) || [];
      if (found.some((conflict) => conflict.kind === 'activity')) conflicted += 1;
      if (found.some((conflict) => conflict.kind === 'absence')) away += 1;
    }
    return { pending, done, unassigned, conflicted, away };
  }, [scheduleConflicts, scopeItems]);

  const filterOptions = useMemo(() => {
    const collect = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'es'));
    return {
      engineer: collect(scopeItems.flatMap((item) => [item.values.engineer, ...item.values.companions])),
      serviceType: Object.keys(TYPE_LABELS),
      platform: collect(scopeItems.map((item) => item.values.platform)),
      locality: collect(scopeItems.map((item) => item.values.locality)),
      status: [],
      week: weeksOfMonth(month),
    };
  }, [month, scopeItems]);

  const summary = store ? store.syncSummary() : { pending: 0, saving: 0, errors: 0, conflicts: 0 };
  const capabilities = backend?.capabilities;

  // ----- actions -----
  const updateSettings = useCallback((patch: Partial<GridSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const notify = useCallback((tone: 'info' | 'error', text: string) => store?.notify(tone, text), [store]);

  const applyView = (id: string) => {
    const builtIn = BUILT_IN_VIEWS.find((view) => view.id === id);
    const saved = savedViews.find((view) => view.id === id);
    const config = builtIn?.config || saved?.config;
    if (!config) return;
    setViewId(id);
    setFilters(filtersFromView(config));
    setLayout(config.layout || 'table');
    if (config.hiddenColumns) updateSettings({ hiddenColumns: config.hiddenColumns });
    setPanel({ kind: null, x: 0, y: 0 });
  };

  const openPanel = (kind: Panel, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setPanel((current) => (current.kind === kind ? { kind: null, x: 0, y: 0 } : { kind, x: rect.left, y: rect.bottom + 6 }));
  };

  const goToday = () => {
    const current = monthKeyOf(today);
    onMonthChange(current);
    setFilters((state) => ({ ...state, dateFrom: '', dateTo: '' }));
    const week = weeksOfMonth(current).find((entry) => today >= entry.start && today <= entry.end) || weeksOfMonth(current)[0];
    if (week) setTimeout(() => setFocusRequest({ rowKey: `capture:${week.start}`, nonce: Date.now() }), 50);
  };

  const exportRows = async (scope: 'month' | 'week' | 'filtered' | 'engineer', value?: string) => {
    let selected = scopeItems;
    let title = `Planeación ${monthTitle(month)}`;
    if (scope === 'filtered') {
      selected = items;
      title += ' (filtrada)';
    } else if (scope === 'week' && value) {
      selected = scopeItems.filter((item) => item.record.week.start === value);
      title = `Planeación semana ${selected[0]?.record.week.label || value}`;
    } else if (scope === 'engineer' && value) {
      const key = normalizeText(value);
      selected = scopeItems.filter((item) => [item.values.engineer, ...item.values.companions].some((person) => normalizeText(person) === key));
      title = `Planeación ${formatPlanningPersonName(value) || value} ${monthTitle(month)}`;
    }
    try {
      const { buildPlanningWorkbook } = await import('./planningExcel');
      const sorted = [...selected].sort((left, right) => `${left.record.week.start}${left.values.scheduledDate}`.localeCompare(`${right.record.week.start}${right.values.scheduledDate}`));
      const data = await buildPlanningWorkbook(
        sorted.map(({ record, values }) => ({
          weekLabel: record.week.label,
          weekStart: record.week.start,
          serviceType: values.serviceType,
          platform: values.platform,
          locality: values.locality,
          serialNumber: values.serialNumber || null,
          observations: values.observations,
          engineer: values.engineer,
          companions: values.companions,
          daysText: values.days,
          scheduledDate: values.scheduledDate || null,
          scheduledEndDate: values.scheduledEndDate || null,
          status: record.closed ? 'Cerrado' : BASE_COLUMNS.find((column) => column.id === 'statuses')!.format(values),
          custom: values.custom,
        })),
        { title, groupByWeek: true, customColumns: customColumns.map((column) => ({ key: column.key, label: column.label })) },
      );
      download(data, `${title.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`);
      notify('info', `Exportadas ${sorted.length} actividades.`);
    } catch (error) {
      notify('error', error instanceof Error ? `No se pudo exportar: ${error.message}` : 'No se pudo exportar.');
    }
  };

  // ----- calendar actions (same store as the table, so both views change together) -----
  const visibleRecord = (id: string) => {
    const record = store?.getSnapshot().records.get(id);
    return store && record ? { record: store.displayRecord(record), values: store.displayValues(record) } : null;
  };

  const moveToDay = (id: string, day: string) => {
    const current = visibleRecord(id);
    if (!store || !current) return;
    const { record, values } = current;
    const target = weekOfDate(day);
    if (record.week.start !== target.start) store.move([id], target);
    // A several-day activity keeps its length.
    const length = values.scheduledDate && values.scheduledEndDate ? daysBetween(values.scheduledDate, values.scheduledEndDate) : 0;
    store.edit(id, 'scheduledDate', day);
    if (length > 0) store.edit(id, 'scheduledEndDate', addDays(day, length));
  };

  const moveToWeek = (id: string, week: PlanningWeek) => {
    const current = visibleRecord(id);
    if (!store || !current) return;
    if (current.record.week.start !== week.start) store.move([id], week);
    store.edit(id, 'scheduledDate', '');
    store.edit(id, 'scheduledEndDate', '');
  };

  const updateFromCalendar = (id: string, changes: Partial<Record<PlanningField, string | string[]>>) => {
    if (!store) return;
    const { scheduledDate, scheduledEndDate, ...rest } = changes;
    if (typeof scheduledDate === 'string' && scheduledDate) moveToDay(id, scheduledDate);
    else if (scheduledDate === '') store.edit(id, 'scheduledDate', '');
    if (typeof scheduledEndDate === 'string') store.edit(id, 'scheduledEndDate', scheduledEndDate);
    (Object.entries(rest) as Array<[PlanningField, string | string[]]>).forEach(([field, value]) => store.edit(id, field, value));
  };

  const createFromCalendar = async (week: PlanningWeek, values: PlanningValues) => {
    if (!store) return null;
    const [id] = await store.insertValues([{ week, values }]);
    if (id) notify('info', `Agregada: ${values.locality}.`);
    return id || null;
  };

  const saveAbsence = (input: AbsenceInput & { id?: string }) => {
    if (!store) return;
    void store.saveAbsence(input).then((saved) => {
      if (saved) notify('info', `${input.id ? 'Ausencia actualizada' : 'Ausencia agregada'}: ${ABSENCE_SHORT[saved.kind]} de ${formatPlanningPersonName(saved.personName) || saved.personName}.`);
    });
  };
  const deleteAbsence = (id: string) => {
    if (!store) return;
    void store.deleteAbsence(id).then(() => notify('info', 'Ausencia eliminada. Usa ↶ para deshacer.'));
  };

  const importItems = async (importItemsList: ImportItem[]) => {
    if (!store) return 0;
    const ids = await store.insertValues(importItemsList.map((item) => ({ week: item.week, values: item.values, meta: item.meta })));
    if (ids.length < importItemsList.length) throw new Error(`Solo se crearon ${ids.length} de ${importItemsList.length}; las demás quedaron como filas por revisar.`);
    return ids.length;
  };

  const existingKeys = useMemo(
    () =>
      records.map((record) => ({
        id: record.id,
        weekLabel: record.week.label,
        subject: buildPlanningSubject(record.values.serviceType, record.values.platform, record.values.locality),
        serial: record.values.serialNumber || null,
        sourceRowKey: typeof record.meta.source_row_key === 'string' ? record.meta.source_row_key : null,
      })),
    [records],
  );

  // ----- menus -----
  const rowMenuItems = (request: GridMenuRequest): MenuItem[] => {
    const ids = request.recordIds;
    const record = store?.getSnapshot().records.get(request.rowKey);
    const many = ids.length > 1 ? ` (${ids.length})` : '';
    return [
      { label: 'Copiar', hint: '⌘C', onSelect: () => window.dispatchEvent(new Event('pgrid:copy')) },
      { label: 'Pegar', hint: '⌘V', disabled: !canEdit, onSelect: () => window.dispatchEvent(new Event('pgrid:paste')) },
      { separator: true, label: 's1' },
      { label: 'Insertar fila debajo', hint: '⌘↵', disabled: !canEdit, onSelect: () => window.dispatchEvent(new CustomEvent('pgrid:insert-below', { detail: request.rowKey })) },
      { label: `Duplicar actividad${many}`, hint: '⌘D', disabled: !canEdit || !ids.length, onSelect: () => void store?.duplicate(ids) },
      { label: `Mover a otra semana${many}…`, disabled: !canEdit || !ids.length, onSelect: () => setMovePicker({ ids, x: request.x, y: request.y, mode: 'move', week: record?.week || null }) },
      { label: `Copiar a otra semana${many}…`, disabled: !canEdit || !ids.length, onSelect: () => setMovePicker({ ids, x: request.x, y: request.y, mode: 'copy', week: record?.week || null }) },
      { separator: true, label: 's2' },
      {
        label: 'Consultar historial',
        disabled: !record,
        onSelect: () => {
          if (!record) return;
          setApprovalsOpen(false);
          setHistoryId(record.id);
        },
      },
      { label: `Eliminar actividad${many}`, danger: true, disabled: !canDelete || !ids.length, onSelect: () => setConfirmDelete(ids) },
    ];
  };

  const headerMenuItems = (colId: string): MenuItem[] => {
    const column = allColumns.find((entry) => entry.id === colId);
    return [
      { label: pinned.includes(colId) ? 'Desfijar columna' : 'Fijar a la izquierda', onSelect: () => updateSettings({ pinnedColumns: pinned.includes(colId) ? pinned.filter((id) => id !== colId) : [...pinned, colId] }) },
      { label: 'Ocultar columna', disabled: column?.required, onSelect: () => updateSettings({ hiddenColumns: [...hidden, colId] }) },
      { label: 'Ancho original', onSelect: () => updateSettings({ columnWidths: Object.fromEntries(Object.entries(widths).filter(([id]) => id !== colId)) }) },
    ];
  };

  // ----- render helpers -----
  const issues = useMemo(() => {
    if (!store) return [];
    const list: Array<{ id: string; label: string; kind: 'error' | 'conflict'; text: string }> = [];
    snapshot.rowStates.forEach((state, id) => {
      const record = snapshot.records.get(id);
      if (!record) return;
      const label = `${record.values.platform ? `${record.values.platform} · ` : ''}${record.values.locality || 'actividad'}`;
      if (state.status === 'error') list.push({ id, label, kind: 'error', text: state.error || 'No se pudo guardar' });
      if (state.status === 'conflict') {
        state.conflicts.forEach((conflict) => {
          const column = allColumns.find((entry) => entry.field === conflict.field);
          const show = (value: unknown) => (column ? column.format({ ...record.values, [conflict.field]: value } as PlanningValues) : String(value)) || 'vacío';
          list.push({ id, label, kind: 'conflict', text: `${column?.label || FIELD_COLUMN_LABELS[conflict.field] || conflict.field}: tú pusiste «${show(conflict.mine)}», ${formatPlanningPersonName(conflict.by) || conflict.by} guardó «${show(conflict.theirs)}»|${conflict.field}` });
        });
      }
    });
    snapshot.drafts.forEach((draft) => {
      if (draft.status === 'error') list.push({ id: draft.id, label: draft.values.locality || 'Nueva fila', kind: 'error', text: draft.error || 'Sin guardar' });
    });
    return list;
  }, [allColumns, snapshot.drafts, snapshot.records, snapshot.rowStates, store]);

  const historyRecord = historyId ? snapshot.records.get(historyId) || null : null;
  const filterCount = activeFilterCount(filters);
  const weeksForCalendar = useMemo(() => {
    const starts = new Set(rows.filter((row) => row.kind === 'week').map((row) => row.week.start));
    return weeksOfMonth(month).filter((week) => starts.has(week.start)).concat(rows.filter((row) => row.kind === 'week' && !weeksOfMonth(month).some((week) => week.start === row.week.start)).map((row) => row.week));
  }, [month, rows]);

  let syncText = 'Todo guardado';
  let syncTone = 'ok';
  if (summary.errors) {
    syncText = `${summary.errors} sin guardar`;
    syncTone = 'error';
  } else if (summary.conflicts) {
    syncText = `${summary.conflicts} en conflicto`;
    syncTone = 'warn';
  } else if (summary.saving) {
    syncText = 'Guardando…';
    syncTone = 'busy';
  } else if (summary.pending) {
    syncText = 'Cambios pendientes';
    syncTone = 'busy';
  } else if (snapshot.lastSavedAt) {
    syncText = `Guardado ${relative(snapshot.lastSavedAt, now)}`;
  }

  if (!backend) {
    return (
      <section className="pgrid pgrid--empty">
        <p>{backendError ? `No se pudo abrir la tabla maestra: ${backendError}` : 'Conectando con la planeación…'}</p>
      </section>
    );
  }

  return (
    <section className="pgrid" aria-label="Tabla maestra de planeación">
      <div className="pgrid-toolbar">
        <nav className="pgrid-months" aria-label="Mes">
          <button type="button" className="pgrid-icon" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Mes anterior">‹</button>
          <button type="button" className="pgrid-months__side" onClick={() => onMonthChange(shiftMonth(month, -1))}>{monthTitle(shiftMonth(month, -1)).split(' ')[0]}</button>
          <label className="pgrid-months__current">
            <span>{monthTitle(month)}</span>
            <input type="month" value={month} aria-label="Elegir mes" onChange={(event) => event.target.value && onMonthChange(event.target.value)} />
          </label>
          <button type="button" className="pgrid-months__side" onClick={() => onMonthChange(shiftMonth(month, 1))}>{monthTitle(shiftMonth(month, 1)).split(' ')[0]}</button>
          <button type="button" className="pgrid-icon" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Mes siguiente">›</button>
          <button type="button" className="pgrid-chipbtn" onClick={goToday}>Hoy</button>
        </nav>

        <label className="pgrid-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={filters.search}
            placeholder="Buscar: BA400 Chihuahua…"
            aria-label="Buscar en la planeación"
            onChange={(event) => setFilters((state) => ({ ...state, search: event.target.value }))}
          />
          {filters.search ? <button type="button" className="pgrid-icon" aria-label="Limpiar búsqueda" onClick={() => setFilters((state) => ({ ...state, search: '' }))}>×</button> : null}
        </label>

        <div className="pgrid-toolbar__group">
          <button type="button" className={`pgrid-chipbtn ${filterCount ? 'is-on' : ''}`} onClick={(event) => openPanel('filters', event)} aria-expanded={panel.kind === 'filters'}>
            Filtros{filterCount ? ` · ${filterCount}` : ''}
          </button>
          <button type="button" className="pgrid-chipbtn" onClick={(event) => openPanel('views', event)} aria-expanded={panel.kind === 'views'}>
            Vista: {BUILT_IN_VIEWS.find((view) => view.id === viewId)?.name || savedViews.find((view) => view.id === viewId)?.name || 'Personalizada'}
          </button>
          <div className="pgrid-segment" role="group" aria-label="Diseño">
            <button type="button" className={layout === 'table' ? 'is-on' : ''} onClick={() => setLayout('table')}>Tabla</button>
            <button type="button" className={layout === 'calendar' ? 'is-on' : ''} onClick={() => setLayout('calendar')}>Calendario</button>
          </div>
          <button type="button" className="pgrid-chipbtn" onClick={(event) => openPanel('columns', event)} aria-expanded={panel.kind === 'columns'}>Columnas</button>
          <button type="button" className="pgrid-chipbtn" onClick={(event) => openPanel('excel', event)} aria-expanded={panel.kind === 'excel'}>Excel</button>
          <button type="button" className="pgrid-icon" onClick={(event) => openPanel('rules', event)} aria-label="Avisos de empalme" title="Avisos de empalme de agenda">⚙</button>
        </div>

        <div className="pgrid-toolbar__status">
          <span className="pgrid-stats">
            <button type="button" onClick={() => setFilters((state) => ({ ...state, onlyOpen: !state.onlyOpen }))} title="Mostrar solo pendientes">{indicators.pending} pendientes</button>
            <span>{indicators.done} realizadas</span>
            {indicators.unassigned ? <button type="button" onClick={() => setFilters((state) => ({ ...state, filters: { ...state.filters, status: ['sin_asignar'] } }))}>{indicators.unassigned} sin ingeniero</button> : null}
            {indicators.conflicted ? <span className="is-warn" title="Misma persona, mismos días, distinto lugar">{indicators.conflicted} con empalme</span> : null}
            {indicators.away ? <span className="is-warn" title="Alguien asignado tiene TXT, vacaciones u otra ausencia ese día">{indicators.away} con ausencia</span> : null}
          </span>
          <span className={`pgrid-sync pgrid-sync--${syncTone}`} role="status" aria-live="polite">
            <i aria-hidden="true" />
            {syncText}
          </span>
          {approval.enabled && (pendingForApprover || (!approval.isApprover && requests.length)) ? (
            <button
              type="button"
              className={`pgrid-approvals-chip ${pendingForApprover ? 'is-alert' : ''}`}
              onClick={() => {
                setHistoryId(null);
                setApprovalsOpen((open) => !open);
              }}
              aria-expanded={approvalsOpen}
            >
              {approval.isApprover ? `${pendingForApprover} por aprobar` : `${ownPending.length} por aprobar · mis solicitudes`}
            </button>
          ) : null}
          {capabilities?.realtime ? <span className="pgrid-live" title="Los cambios de otros usuarios aparecen solos">En vivo</span> : null}
          {canEdit ? (
            <button type="button" className="pgrid-icon" onClick={() => void store?.undo()} disabled={!snapshot.canUndo} aria-label="Deshacer" title="Deshacer (⌘Z)">↶</button>
          ) : null}
        </div>
      </div>

      {proposing && canEdit ? (
        <p className="pgrid-banner pgrid-banner--info">
          Tus cambios en la planeación se envían a aprobación de {approverName}; se aplican cuando los aprueba. Lo pendiente se ve marcado en azul.
        </p>
      ) : null}
      {capabilities && !capabilities.versioning ? (
        <p className="pgrid-banner">La base de datos aún no tiene el control de versiones de la tabla maestra: los cambios se guardan, pero sin detectar ediciones simultáneas ni registrar historial.</p>
      ) : null}
      {snapshot.loadError ? (
        <p className="pgrid-banner is-error" role="alert">
          No se pudo leer la planeación: {snapshot.loadError}{' '}
          <button type="button" className="pgrid-link" onClick={() => void store?.load()}>Reintentar</button>
        </p>
      ) : null}
      {issues.length ? (
        <ul className="pgrid-issues" aria-label="Pendientes de guardado">
          {issues.slice(0, 5).map((issue, index) => {
            const [text, field] = issue.text.split('|');
            return (
              <li key={`${issue.id}-${index}`} className={`is-${issue.kind}`}>
                <strong>{issue.label}</strong>
                <span>{text}</span>
                {issue.kind === 'conflict' && field ? (
                  <>
                    <button type="button" className="pgrid-link" onClick={() => store?.resolveConflict(issue.id, field as never, 'mine')}>Conservar el mío</button>
                    <button type="button" className="pgrid-link" onClick={() => store?.resolveConflict(issue.id, field as never, 'theirs')}>Usar el guardado</button>
                  </>
                ) : issue.id.startsWith('draft-') ? (
                  <button type="button" className="pgrid-link" onClick={() => setFocusRequest({ rowKey: issue.id, nonce: Date.now() })}>Ir a la fila</button>
                ) : (
                  <>
                    <button type="button" className="pgrid-link" onClick={() => store?.retry(issue.id)}>Reintentar</button>
                    <button type="button" className="pgrid-link" onClick={() => store?.discard(issue.id)}>Descartar mis cambios</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className={`pgrid-stage ${historyRecord || approvalsOpen ? 'has-side' : ''}`}>
        {snapshot.loading && !records.length ? (
          <p className="pgrid-loading">Cargando planeación…</p>
        ) : layout === 'calendar' ? (
          <PlanningCalendar
            month={month}
            weeks={weeksForCalendar}
            items={items}
            today={today}
            canEdit={canEdit}
            options={optionsSource}
            profiles={profiles}
            onCreate={createFromCalendar}
            onUpdate={updateFromCalendar}
            onMoveToDay={moveToDay}
            onMoveToWeek={moveToWeek}
            onDelete={(id) => (canDelete ? setConfirmDelete([id]) : notify('info', 'Tu usuario no puede eliminar actividades.'))}
            onNotify={notify}
            absences={shownAbsences}
            proposals={proposals}
            proposedIds={new Set([...proposedFields.keys(), ...pendingDeletes])}
            onSaveAbsence={saveAbsence}
            onDeleteAbsence={deleteAbsence}
            onOpenInTable={(id) => {
              setLayout('table');
              setTimeout(() => setFocusRequest({ rowKey: id, nonce: Date.now() }), 30);
            }}
          />
        ) : store ? (
          <GridTable
            store={store}
            rows={rows}
            columns={visibleColumns}
            pinnedCount={pinnedCount}
            widths={widths}
            canEdit={canEdit}
            rowStates={snapshot.rowStates}
            remoteChanged={snapshot.remoteChangedIds}
            conflicts={scheduleConflicts}
            optionsSource={optionsSource}
            parseContext={parseContext}
            focusRequest={focusRequest}
            onToggleWeek={(start) =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(start)) next.delete(start);
                else next.add(start);
                return next;
              })
            }
            onColumnResize={(id, width) =>
              updateSettings({
                columnWidths: width === null ? Object.fromEntries(Object.entries(widths).filter(([key]) => key !== id)) : { ...widths, [id]: Math.round(width) },
              })
            }
            onColumnMove={(id, beforeId) => {
              const order = orderedColumns.map((column) => column.id).filter((entry) => entry !== id);
              const at = beforeId ? order.indexOf(beforeId) : order.length;
              order.splice(at < 0 ? order.length : at, 0, id);
              updateSettings({ columnOrder: order });
            }}
            onHeaderMenu={(colId, x, y) => setHeaderMenu({ colId, x, y })}
            onRowMenu={(request) => (request.x >= 0 ? setRowMenu(request) : undefined)}
            onSelectionChange={setSelectedIds}
            onNotify={notify}
            weekAbsences={weekAbsences}
            proposedFields={proposedFields}
            pendingDeletes={pendingDeletes}
            approverName={approverName}
            onAbsenceCard={(request) => {
              if (!request.absence && !capabilities?.absences) {
                notify('info', 'Las ausencias se activan con la actualización de base de datos pendiente.');
                return;
              }
              setAbsenceCard(request);
            }}
          />
        ) : null}
        {approvalsOpen && store ? (
          <ApprovalsPanel
            requests={approval.isApprover ? requests : requests.filter((request) => request.requestedBy === currentUserId || request.requestedByName === ctx.actorName)}
            isApprover={approval.isApprover}
            approverName={approverName}
            recordFor={(ticketId) => (ticketId ? snapshot.records.get(ticketId) || null : null)}
            onApprove={(request, note) => store.approveRequest(request, note)}
            onReject={(request, note) => store.rejectRequest(request, note)}
            onRetry={(request) => store.retryRequest(request)}
            onCancel={(request) => store.cancelRequest(request.id)}
            onShow={(request) => {
              const record = request.ticketId ? snapshot.records.get(request.ticketId) : null;
              if (!record) return;
              setLayout('table');
              if (record.week.monthKey !== month) onMonthChange(record.week.monthKey);
              setTimeout(() => setFocusRequest({ rowKey: record.id, nonce: Date.now() }), 60);
            }}
            onClose={() => setApprovalsOpen(false)}
          />
        ) : null}
        {!approvalsOpen && historyRecord && backend ? <HistoryPanel key={historyRecord.id} backend={backend} record={historyRecord} customColumns={customColumns} onClose={() => setHistoryId(null)} /> : null}
      </div>

      {selectedIds.length > 1 && canEdit ? (
        <div className="pgrid-bulk" role="toolbar" aria-label="Acciones para varias actividades">
          <strong>{selectedIds.length} seleccionadas</strong>
          <button type="button" className="pgrid-link" onClick={(event) => setMovePicker({ ids: selectedIds, x: event.clientX, y: event.clientY - 320, mode: 'move', week: null })}>Mover…</button>
          <button type="button" className="pgrid-link" onClick={() => void store?.duplicate(selectedIds)}>Duplicar</button>
          {canDelete ? <button type="button" className="pgrid-link is-danger" onClick={() => setConfirmDelete(selectedIds)}>Eliminar</button> : null}
          <small>Para asignar el mismo valor a varias filas, escríbelo en una celda, cópialo y pégalo sobre la selección.</small>
        </div>
      ) : null}

      {layout === 'calendar' && canEdit ? (
        <p className="pgrid-cal-hint">Doble clic en un día para agregar una actividad · doble clic en una actividad para verla o cambiarla · arrástrala a otro día para reprogramarla · los cambios aparecen al instante en la tabla</p>
      ) : null}
      <p className="pgrid-help" hidden={layout !== 'table'}>
        Clic para seleccionar · escribe para reemplazar · Enter o doble clic para editar · Tab y flechas para moverte · ⌘C / ⌘V con Excel · ⌘D duplica · ⌘↵ inserta fila · ⌘Z deshace · arrastra ⠿ para mover entre semanas
      </p>

      {snapshot.notices.length ? (
        <div className="pgrid-toasts" aria-live="polite">
          {snapshot.notices.map((notice) => (
            <div key={notice.id} className={`pgrid-toast is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
              <span>{notice.text}</span>
              <button type="button" className="pgrid-icon" aria-label="Cerrar aviso" onClick={() => store?.dismissNotice(notice.id)}>×</button>
            </div>
          ))}
        </div>
      ) : null}

      {panel.kind ? (
        <Floating x={panel.x} y={panel.y} onClose={() => setPanel({ kind: null, x: 0, y: 0 })} label="Opciones de la tabla" className={`pgrid-floating--${panel.kind}`}>
          {panel.kind === 'filters' ? (
            <FilterPanel state={filters} options={filterOptions} onChange={(next) => { setFilters(next); setViewId('custom'); }} onClear={() => setFilters(EMPTY_FILTERS)} />
          ) : panel.kind === 'views' ? (
            <ViewsPanel
              builtIn={BUILT_IN_VIEWS}
              saved={savedViews}
              activeId={viewId}
              onApply={applyView}
              onSave={async (name) => {
                const saved = await backend.saveView({ name, config: viewFromFilters(filters, layout, settings.hiddenColumns) });
                setSavedViews((current) => [...current.filter((view) => view.id !== saved.id && view.name !== saved.name), saved].sort((left, right) => left.name.localeCompare(right.name, 'es')));
                setViewId(saved.id);
              }}
              onDelete={(view) => {
                void backend.deleteView(view.id).then(() => setSavedViews((current) => current.filter((entry) => entry.id !== view.id)));
              }}
            />
          ) : panel.kind === 'columns' ? (
            <ColumnsPanel
              columns={orderedColumns}
              hidden={hidden}
              pinned={pinned}
              customColumns={customColumns}
              canManage={canManageColumns}
              onToggleHidden={(id) => updateSettings({ hiddenColumns: hidden.includes(id) ? hidden.filter((entry) => entry !== id) : [...hidden, id] })}
              onTogglePinned={(id) => updateSettings({ pinnedColumns: pinned.includes(id) ? pinned.filter((entry) => entry !== id) : [...pinned, id] })}
              onReset={() => updateSettings({ columnOrder: undefined, columnWidths: undefined, hiddenColumns: undefined, pinnedColumns: undefined })}
              onCreate={async ({ label, dataType, options }) => {
                const base = normalizeText(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'campo';
                let key = /^[a-z]/.test(base) ? base : `c_${base}`;
                if (customColumns.some((column) => column.key === key)) key = `${key}_${customColumns.length + 1}`;
                const created = await backend.saveCustomColumn({ key, label, dataType, options, required: false, width: null, position: customColumns.length });
                setCustomColumns((current) => [...current, created]);
              }}
              onArchive={(column) => {
                void backend.archiveCustomColumn(column.id).then(() => setCustomColumns((current) => current.filter((entry) => entry.id !== column.id)));
              }}
            />
          ) : panel.kind === 'excel' ? (
            <MenuList
              onClose={() => setPanel({ kind: null, x: 0, y: 0 })}
              items={[
                { label: `Exportar ${monthTitle(month).toLowerCase()}`, onSelect: () => void exportRows('month') },
                { label: `Exportar resultados filtrados (${items.length})`, disabled: !filterCount, onSelect: () => void exportRows('filtered') },
                ...weeksOfMonth(month).map((week) => ({ label: `Exportar semana ${week.label.toLowerCase()}`, onSelect: () => void exportRows('week', week.start) })),
                ...(filters.filters.engineer?.length === 1 ? [{ label: `Exportar de ${formatPlanningPersonName(filters.filters.engineer[0]) || filters.filters.engineer[0]}`, onSelect: () => void exportRows('engineer', filters.filters.engineer![0]) }] : []),
                { separator: true, label: 'sep' },
                { label: 'Importar archivo de Excel…', disabled: !canImport, onSelect: () => fileInput.current?.click() },
              ]}
            />
          ) : panel.kind === 'rules' ? (
            <ConflictRulesPanel rules={rules} onChange={(next) => updateSettings({ conflictRules: next })} />
          ) : null}
        </Floating>
      ) : null}

      {absenceCard ? (
        <AbsencePopover
          key={absenceCard.absence?.id || `new-${absenceCard.week.start}`}
          mode={absenceCard.absence ? 'edit' : 'new'}
          anchor={absenceCard.anchor}
          initial={
            absenceCard.absence
              ? { personName: absenceCard.absence.personName, personId: absenceCard.absence.personId, kind: absenceCard.absence.kind, startDate: absenceCard.absence.startDate, endDate: absenceCard.absence.endDate, note: absenceCard.absence.note }
              : { personName: '', kind: 'TXT', startDate: absenceCard.week.start, endDate: absenceCard.week.start, note: '' }
          }
          people={optionsSource.people}
          profiles={profiles}
          readOnly={!canEdit}
          source={absenceCard.absence?.source}
          onCancel={() => setAbsenceCard(null)}
          onSave={(input) => {
            const current = absenceCard.absence;
            setAbsenceCard(null);
            if (!current) return saveAbsence(input);
            const changed = input.personName !== current.personName || input.kind !== current.kind || input.startDate !== current.startDate || input.endDate !== current.endDate || input.note !== current.note;
            if (changed) saveAbsence({ ...input, id: current.id });
          }}
          onDelete={
            absenceCard.absence
              ? () => {
                  const id = absenceCard.absence!.id;
                  setAbsenceCard(null);
                  deleteAbsence(id);
                }
              : undefined
          }
        />
      ) : null}
      {rowMenu ? (
        <Floating x={rowMenu.x} y={rowMenu.y} onClose={() => setRowMenu(null)} label="Acciones de la actividad">
          <MenuList items={rowMenuItems(rowMenu)} onClose={() => setRowMenu(null)} />
        </Floating>
      ) : null}
      {headerMenu ? (
        <Floating x={headerMenu.x} y={headerMenu.y} onClose={() => setHeaderMenu(null)} label="Opciones de la columna">
          <MenuList items={headerMenuItems(headerMenu.colId)} onClose={() => setHeaderMenu(null)} />
        </Floating>
      ) : null}
      {movePicker ? (
        <Floating x={movePicker.x} y={movePicker.y} onClose={() => setMovePicker(null)} label="Elegir semana">
          <WeekPicker
            month={month}
            current={movePicker.week}
            label={movePicker.mode === 'move' ? `Mover ${movePicker.ids.length > 1 ? `${movePicker.ids.length} actividades` : 'actividad'} a…` : 'Copiar a…'}
            onPick={(week) => {
              if (!store) return;
              if (movePicker.mode === 'move') store.move(movePicker.ids, week);
              else void store.duplicate(movePicker.ids, week);
              notify('info', `${movePicker.mode === 'move' ? 'Movida(s)' : 'Copiada(s)'} a ${week.label.toLowerCase()}.`);
              if (week.monthKey !== month) onMonthChange(week.monthKey);
              setMovePicker(null);
            }}
          />
        </Floating>
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={confirmDelete.length > 1 ? `¿Eliminar ${confirmDelete.length} actividades?` : '¿Eliminar esta actividad?'}
          body={
            proposing
              ? `Se enviará a aprobación de ${approverName}; la actividad sigue en la planeación hasta que la apruebe.`
              : 'Se quitan de la planeación para todos. El historial conserva el registro y puedes deshacerlo con ⌘Z mientras sigas en esta página.'
          }
          confirmLabel={proposing ? 'Pedir eliminación' : 'Eliminar'}
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const ids = confirmDelete;
            setConfirmDelete(null);
            void store?.remove(ids).then(() =>
              notify('info', proposing ? `Eliminación pedida; espera la aprobación de ${approverName}.` : `${ids.length} actividad(es) eliminada(s). ⌘Z para deshacer.`),
            );
          }}
        />
      ) : null}
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xlsm,.xls"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setImportFile(file);
          event.target.value = '';
        }}
      />
      {importFile ? (
        <ImportDialog
          file={importFile}
          profiles={profiles}
          equipments={equipments}
          existing={existingKeys}
          onImport={importItems}
          onClose={() => setImportFile(null)}
        />
      ) : null}
    </section>
  );
}
