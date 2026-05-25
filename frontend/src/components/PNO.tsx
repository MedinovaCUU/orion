import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import './PNO.css';
import {
  buildPnoSearchText,
  createEmptyPnoProcedure,
  normalizePnoTextList,
  PNO_KIND_LABELS,
  PNO_KIND_OPTIONS,
  PNO_STARTER_PROCEDURES,
  PNO_STATUS_LABELS,
  PNO_STATUS_OPTIONS,
  type PnoProcedure,
  type PnoProcedureKind,
  type PnoProcedureStatus,
} from './pnoCatalog';

type UserRole = 'admin' | 'tecnico' | 'cliente' | string | null;
type CatalogMode = 'database' | 'starter' | 'missing_table';
type EditorMode = 'create' | 'edit' | null;
type FeedbackTone = 'info' | 'success' | 'error';

interface PnoRow {
  id: string;
  code: string;
  title: string;
  procedure_kind: string;
  equipment_family: string | null;
  failure_focus: string | null;
  summary: string | null;
  objective: string | null;
  scope: string | null;
  estimated_duration: string | null;
  tools: unknown;
  materials: unknown;
  safety_notes: unknown;
  steps: unknown;
  validation_points: unknown;
  reference_notes: unknown;
  tags: unknown;
  version: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description: string;
}

const PNO_COLUMNS = `
  id,
  code,
  title,
  procedure_kind,
  equipment_family,
  failure_focus,
  summary,
  objective,
  scope,
  estimated_duration,
  tools,
  materials,
  safety_notes,
  steps,
  validation_points,
  reference_notes,
  tags,
  version,
  status,
  created_at,
  updated_at
`;

const STATUS_ORDER: Record<PnoProcedureStatus, number> = {
  activo: 0,
  borrador: 1,
  obsoleto: 2,
};

const isStaffRole = (role: UserRole) => role === 'admin' || role === 'tecnico';

const normalizeSearchValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const sortProcedures = (items: PnoProcedure[]) =>
  [...items].sort((left, right) => {
    const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (byStatus !== 0) return byStatus;
    return left.code.localeCompare(right.code, 'es');
  });

const mapRowToProcedure = (row: PnoRow): PnoProcedure => ({
  id: row.id,
  code: String(row.code || '').trim(),
  title: String(row.title || '').trim(),
  procedureKind: (String(row.procedure_kind || 'diagnostico').trim() as PnoProcedureKind) || 'diagnostico',
  equipmentFamily: String(row.equipment_family || '').trim(),
  failureFocus: String(row.failure_focus || '').trim(),
  summary: String(row.summary || '').trim(),
  objective: String(row.objective || '').trim(),
  scope: String(row.scope || '').trim(),
  estimatedDuration: String(row.estimated_duration || '').trim(),
  tools: normalizePnoTextList(row.tools),
  materials: normalizePnoTextList(row.materials),
  safetyNotes: normalizePnoTextList(row.safety_notes),
  steps: normalizePnoTextList(row.steps),
  validationPoints: normalizePnoTextList(row.validation_points),
  referenceNotes: normalizePnoTextList(row.reference_notes),
  tags: normalizePnoTextList(row.tags),
  version: String(row.version || '1.0').trim() || '1.0',
  status: (String(row.status || 'activo').trim() as PnoProcedureStatus) || 'activo',
  createdAt: row.created_at || undefined,
  updatedAt: row.updated_at || undefined,
});

const toMultilineValue = (values: string[]) => values.join('\n');

const fromMultilineValue = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const toProcedurePayload = (draft: PnoProcedure) => ({
  code: draft.code.trim().toUpperCase(),
  title: draft.title.trim(),
  procedure_kind: draft.procedureKind,
  equipment_family: draft.equipmentFamily.trim(),
  failure_focus: draft.failureFocus.trim(),
  summary: draft.summary.trim(),
  objective: draft.objective.trim(),
  scope: draft.scope.trim(),
  estimated_duration: draft.estimatedDuration.trim(),
  tools: draft.tools,
  materials: draft.materials,
  safety_notes: draft.safetyNotes,
  steps: draft.steps,
  validation_points: draft.validationPoints,
  reference_notes: draft.referenceNotes,
  tags: draft.tags,
  version: draft.version.trim() || '1.0',
  status: draft.status,
  updated_at: new Date().toISOString(),
});

const formatDateLabel = (value?: string) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const relationMissing = (message: string) =>
  /relation .*pno_documents.* does not exist/i.test(message) ||
  /table .*pno_documents.* does not exist/i.test(message) ||
  /could not find the table/i.test(message);

const seedProceduresPayload = PNO_STARTER_PROCEDURES.map((procedure) => ({
  ...toProcedurePayload(procedure),
  created_at: procedure.createdAt || new Date().toISOString(),
}));

const emptyFeedback = (): FeedbackState | null => null;

export default function PNO() {
  const [documents, setDocuments] = useState<PnoProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('database');
  const [selectedId, setSelectedId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'todos' | PnoProcedureKind>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | PnoProcedureStatus>('todos');
  const [role, setRole] = useState<UserRole>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editorDraft, setEditorDraft] = useState<PnoProcedure>(createEmptyPnoProcedure);

  const deferredSearch = useDeferredValue(search);
  const staff = isStaffRole(role);

  const loadDocuments = async () => {
    const { data, error } = await supabase.from('pno_documents').select(PNO_COLUMNS).order('code', { ascending: true });

    if (error) {
      if (relationMissing(error.message)) {
        setCatalogMode('missing_table');
        setDocuments(sortProcedures(PNO_STARTER_PROCEDURES));
        setFeedback({
          tone: 'info',
          title: 'Modo local de arranque',
          description: 'La tabla de PNO aún no existe en la base de datos. Se muestran plantillas base para que definas el módulo antes de aplicar la migración.',
        });
        return;
      }

      setCatalogMode('starter');
      setDocuments(sortProcedures(PNO_STARTER_PROCEDURES));
      setFeedback({
        tone: 'error',
        title: 'No fue posible leer la biblioteca PNO',
        description: error.message,
      });
      return;
    }

    const mapped = sortProcedures((data || []).map((row) => mapRowToProcedure(row as PnoRow)));
    if (mapped.length === 0) {
      setCatalogMode('starter');
      setDocuments(sortProcedures(PNO_STARTER_PROCEDURES));
      setFeedback({
        tone: 'info',
        title: 'Biblioteca PNO lista para sembrarse',
        description: 'Todavía no hay procedimientos guardados. Se muestran plantillas base para ajustes, limpiezas y diagnóstico técnico.',
      });
      return;
    }

    setCatalogMode('database');
    setDocuments(mapped);
    setFeedback(emptyFeedback());
  };

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      setCurrentUserId(user?.id || null);

      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('rol, nombre_completo')
          .eq('id', user.id)
          .single();

        if (!mounted) return;

        setRole(profile?.rol || null);
        setCurrentUserName(String(profile?.nombre_completo || '').trim());
      } else {
        setRole(null);
        setCurrentUserName('');
      }

      await loadDocuments();

      if (mounted) {
        setLoading(false);
      }
    };

    void hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(deferredSearch);

    return documents.filter((procedure) => {
      if (kindFilter !== 'todos' && procedure.procedureKind !== kindFilter) {
        return false;
      }

      if (statusFilter !== 'todos' && procedure.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return buildPnoSearchText(procedure).includes(normalizedSearch);
    });
  }, [deferredSearch, documents, kindFilter, statusFilter]);

  useEffect(() => {
    if (filteredDocuments.length === 0) {
      setSelectedId('');
      return;
    }

    if (!filteredDocuments.some((procedure) => procedure.id === selectedId)) {
      startTransition(() => {
        setSelectedId(filteredDocuments[0].id);
      });
    }
  }, [filteredDocuments, selectedId]);

  const selectedProcedure = useMemo(
    () => filteredDocuments.find((procedure) => procedure.id === selectedId) || filteredDocuments[0] || null,
    [filteredDocuments, selectedId],
  );

  const stats = useMemo(() => {
    const activeCount = documents.filter((item) => item.status === 'activo').length;
    const draftCount = documents.filter((item) => item.status === 'borrador').length;
    const diagnosticCount = documents.filter((item) => item.procedureKind === 'diagnostico').length;

    return {
      total: documents.length,
      activeCount,
      draftCount,
      diagnosticCount,
    };
  }, [documents]);

  const openCreateEditor = () => {
    setEditorDraft(createEmptyPnoProcedure());
    setEditorMode('create');
  };

  const openEditEditor = () => {
    if (!selectedProcedure) return;
    setEditorDraft({
      ...selectedProcedure,
      isStarter: false,
    });
    setEditorMode('edit');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditorDraft(createEmptyPnoProcedure());
  };

  const updateDraftField = <K extends keyof PnoProcedure>(field: K, value: PnoProcedure[K]) => {
    setEditorDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validateDraft = (draft: PnoProcedure) => {
    if (!draft.code.trim()) return 'Captura el código del PNO.';
    if (!draft.title.trim()) return 'Captura el nombre del procedimiento.';
    if (!draft.summary.trim()) return 'Captura el resumen técnico.';
    if (draft.steps.length === 0) return 'Agrega al menos un paso operativo.';
    return '';
  };

  const upsertLocalDocument = (procedure: PnoProcedure) => {
    setDocuments((current) => {
      const next = current.filter((item) => item.id !== procedure.id && item.code !== procedure.code);
      return sortProcedures([...next, procedure]);
    });
    setCatalogMode('database');
    setSelectedId(procedure.id);
  };

  const handleSave = async () => {
    if (!staff) {
      setFeedback({
        tone: 'error',
        title: 'Edición restringida',
        description: 'Solo admin y técnico pueden modificar PNO.',
      });
      return;
    }

    if (catalogMode === 'missing_table') {
      setFeedback({
        tone: 'error',
        title: 'Base de datos pendiente',
        description: 'Aplica la migración del módulo PNO antes de guardar procedimientos en Supabase.',
      });
      return;
    }

    const trimmedDraft: PnoProcedure = {
      ...editorDraft,
      code: editorDraft.code.trim().toUpperCase(),
      title: editorDraft.title.trim(),
      summary: editorDraft.summary.trim(),
      objective: editorDraft.objective.trim(),
      scope: editorDraft.scope.trim(),
      equipmentFamily: editorDraft.equipmentFamily.trim(),
      failureFocus: editorDraft.failureFocus.trim(),
      estimatedDuration: editorDraft.estimatedDuration.trim(),
      version: editorDraft.version.trim() || '1.0',
      tags: editorDraft.tags.map((item) => item.trim()).filter(Boolean),
      tools: editorDraft.tools.map((item) => item.trim()).filter(Boolean),
      materials: editorDraft.materials.map((item) => item.trim()).filter(Boolean),
      safetyNotes: editorDraft.safetyNotes.map((item) => item.trim()).filter(Boolean),
      steps: editorDraft.steps.map((item) => item.trim()).filter(Boolean),
      validationPoints: editorDraft.validationPoints.map((item) => item.trim()).filter(Boolean),
      referenceNotes: editorDraft.referenceNotes.map((item) => item.trim()).filter(Boolean),
    };

    const validationMessage = validateDraft(trimmedDraft);
    if (validationMessage) {
      setFeedback({
        tone: 'error',
        title: 'Faltan datos obligatorios',
        description: validationMessage,
      });
      return;
    }

    setSaving(true);
    const persistedRecord = documents.find((item) => item.code === trimmedDraft.code && !item.isStarter);
    const payload = {
      ...toProcedurePayload(trimmedDraft),
      updated_by: currentUserId,
    };

    const response = persistedRecord
      ? await supabase.from('pno_documents').update(payload).eq('id', persistedRecord.id).select(PNO_COLUMNS).single()
      : await supabase
          .from('pno_documents')
          .insert({
            ...payload,
            created_by: currentUserId,
            created_at: new Date().toISOString(),
          })
          .select(PNO_COLUMNS)
          .single();

    setSaving(false);

    if (response.error || !response.data) {
      setFeedback({
        tone: 'error',
        title: 'No se pudo guardar el PNO',
        description: response.error?.message || 'Intenta nuevamente.',
      });
      return;
    }

    const savedProcedure = mapRowToProcedure(response.data as PnoRow);
    if (catalogMode === 'database') {
      upsertLocalDocument(savedProcedure);
    } else {
      await loadDocuments();
    }
    closeEditor();
    setFeedback({
      tone: 'success',
      title: persistedRecord ? 'PNO actualizado' : 'PNO creado',
      description: `${savedProcedure.code} quedó disponible en la biblioteca técnica.`,
    });
  };

  const handleDelete = async () => {
    if (!staff || !selectedProcedure || selectedProcedure.isStarter) {
      return;
    }

    if (!window.confirm(`¿Eliminar ${selectedProcedure.code} de la biblioteca PNO?`)) {
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('pno_documents').delete().eq('id', selectedProcedure.id);
    setSaving(false);

    if (error) {
      setFeedback({
        tone: 'error',
        title: 'No se pudo eliminar el PNO',
        description: error.message,
      });
      return;
    }

    const remainingCount = documents.filter((item) => item.id !== selectedProcedure.id && !item.isStarter).length;
    if (remainingCount === 0) {
      await loadDocuments();
    } else {
      setDocuments((current) => current.filter((item) => item.id !== selectedProcedure.id));
    }
    setFeedback({
      tone: 'success',
      title: 'PNO eliminado',
      description: `${selectedProcedure.code} se retiró de la biblioteca.`,
    });
  };

  const handleSeedTemplates = async () => {
    if (!staff || catalogMode === 'missing_table') {
      return;
    }

    setSaving(true);
    const { error, data } = await supabase
      .from('pno_documents')
      .upsert(
        seedProceduresPayload.map((item) => ({
          ...item,
          created_by: currentUserId,
          updated_by: currentUserId,
        })),
        { onConflict: 'code' },
      )
      .select(PNO_COLUMNS);

    setSaving(false);

    if (error) {
      setFeedback({
        tone: 'error',
        title: 'No se pudieron sembrar las plantillas',
        description: error.message,
      });
      return;
    }

    const seeded = sortProcedures((data || []).map((row) => mapRowToProcedure(row as PnoRow)));
    setDocuments(seeded);
    setCatalogMode('database');
    setSelectedId(seeded[0]?.id || '');
    setFeedback({
      tone: 'success',
      title: 'Biblioteca base cargada',
      description: 'Las plantillas iniciales de ajuste, limpieza, diagnóstico y verificación ya quedaron persistidas.',
    });
  };

  const noResults = !loading && filteredDocuments.length === 0;

  return (
    <div className="pno-shell">
      <section className="pno-hero">
        <div className="pno-hero__copy">
          <span className="pno-eyebrow">PNO</span>
          <h2>Procedimientos normalizados de operación</h2>
          <p>
            Biblioteca técnica para ajustes, limpiezas y rutas de revisión ante falla. Diseñada para que el
            conocimiento de campo deje de depender de memoria individual.
          </p>
        </div>
        <div className="pno-hero__actions">
          <button type="button" className={`button-primary ${staff ? '' : 'inactive'}`} disabled={!staff} onClick={openCreateEditor}>
            Nuevo PNO
          </button>
          {staff && catalogMode !== 'missing_table' ? (
            <button type="button" className="button-primary inactive" onClick={handleSeedTemplates} disabled={saving}>
              Sembrar base técnica
            </button>
          ) : null}
        </div>
      </section>

      <section className="pno-kpi-grid">
        <article className="pno-kpi-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
          <small>Procedimientos visibles en la biblioteca actual.</small>
        </article>
        <article className="pno-kpi-card">
          <span>Activos</span>
          <strong>{stats.activeCount}</strong>
          <small>Listos para usar como estándar de campo.</small>
        </article>
        <article className="pno-kpi-card">
          <span>Borrador</span>
          <strong>{stats.draftCount}</strong>
          <small>En afinación técnica o pendiente de aprobación.</small>
        </article>
        <article className="pno-kpi-card">
          <span>Diagnóstico</span>
          <strong>{stats.diagnosticCount}</strong>
          <small>Rutas de descarte y revisión por síntoma.</small>
        </article>
      </section>

      {feedback ? (
        <div className={`pno-banner ${feedback.tone}`}>
          <div>
            <strong>{feedback.title}</strong>
            <p>{feedback.description}</p>
          </div>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Cerrar aviso">
            Cerrar
          </button>
        </div>
      ) : null}

      <section className="pno-toolbar">
        <div className="pno-field pno-field--search">
          <span>Búsqueda</span>
          <input
            className="input-field"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Código, procedimiento, falla o etiqueta"
          />
        </div>

        <div className="pno-field">
          <span>Tipo</span>
          <select className="input-field" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'todos' | PnoProcedureKind)}>
            <option value="todos">Todos</option>
            {PNO_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pno-field">
          <span>Estado</span>
          <select
            className="input-field"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'todos' | PnoProcedureStatus)}
          >
            <option value="todos">Todos</option>
            {PNO_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pno-toolbar__meta">
          <span className={`pno-source-badge pno-source-badge--${catalogMode}`}>
            {catalogMode === 'database' ? 'Biblioteca persistida' : catalogMode === 'starter' ? 'Plantillas base' : 'Modo local'}
          </span>
          <small>{currentUserName ? `Operando como ${currentUserName}` : 'Sesión autenticada'}</small>
        </div>
      </section>

      <section className="pno-layout">
        <aside className="pno-panel pno-panel--list">
          <div className="pno-panel__header">
            <div>
              <span className="pno-eyebrow">Catálogo técnico</span>
              <h3>Biblioteca PNO</h3>
            </div>
            <small>{filteredDocuments.length} visibles</small>
          </div>

          {loading ? (
            <div className="pno-empty-state">
              <strong>Cargando procedimientos...</strong>
              <p>Consultando biblioteca técnica y contexto de usuario.</p>
            </div>
          ) : noResults ? (
            <div className="pno-empty-state">
              <strong>Sin coincidencias</strong>
              <p>Ajusta búsqueda o filtros para encontrar el procedimiento deseado.</p>
            </div>
          ) : (
            <div className="pno-list">
              {filteredDocuments.map((procedure) => (
                <button
                  key={procedure.id}
                  type="button"
                  className={`pno-procedure-card ${selectedProcedure?.id === procedure.id ? 'active' : ''}`}
                  onClick={() => {
                    startTransition(() => {
                      setSelectedId(procedure.id);
                    });
                  }}
                >
                  <div className="pno-procedure-card__topline">
                    <span className="pno-code">{procedure.code}</span>
                    <span className={`pno-status-pill pno-status-pill--${procedure.status}`}>{PNO_STATUS_LABELS[procedure.status]}</span>
                  </div>
                  <strong>{procedure.title}</strong>
                  <p>{procedure.summary}</p>
                  <div className="pno-procedure-card__meta">
                    <span>{PNO_KIND_LABELS[procedure.procedureKind]}</span>
                    <span>{procedure.equipmentFamily || 'Sin familia'}</span>
                    {procedure.isStarter ? <span>Base local</span> : <span>v{procedure.version}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="pno-panel pno-panel--detail">
          {selectedProcedure ? (
            <>
              <div className="pno-panel__header pno-panel__header--detail">
                <div>
                  <div className="pno-detail__badges">
                    <span className="pno-code">{selectedProcedure.code}</span>
                    <span className={`pno-status-pill pno-status-pill--${selectedProcedure.status}`}>{PNO_STATUS_LABELS[selectedProcedure.status]}</span>
                    <span className="pno-kind-pill">{PNO_KIND_LABELS[selectedProcedure.procedureKind]}</span>
                    {selectedProcedure.isStarter ? <span className="pno-kind-pill pno-kind-pill--starter">Base local</span> : null}
                  </div>
                  <h3>{selectedProcedure.title}</h3>
                  <p className="pno-detail__summary">{selectedProcedure.summary}</p>
                </div>

                <div className="pno-detail__actions">
                  <button type="button" className={`button-primary ${staff ? '' : 'inactive'}`} disabled={!staff} onClick={openEditEditor}>
                    Editar
                  </button>
                  {staff && !selectedProcedure.isStarter ? (
                    <button type="button" className="button-primary inactive" onClick={handleDelete} disabled={saving}>
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pno-summary-grid">
                <div className="pno-summary-card">
                  <span>Familia / equipo</span>
                  <strong>{selectedProcedure.equipmentFamily || 'Sin familia definida'}</strong>
                </div>
                <div className="pno-summary-card">
                  <span>Duración objetivo</span>
                  <strong>{selectedProcedure.estimatedDuration || 'Sin tiempo estándar'}</strong>
                </div>
                <div className="pno-summary-card">
                  <span>Última revisión</span>
                  <strong>{formatDateLabel(selectedProcedure.updatedAt)}</strong>
                </div>
              </div>

              <div className="pno-detail-grid">
                <article className="pno-detail-card">
                  <span className="pno-section-label">Objetivo</span>
                  <p>{selectedProcedure.objective || 'Sin objetivo capturado.'}</p>
                </article>
                <article className="pno-detail-card">
                  <span className="pno-section-label">Alcance</span>
                  <p>{selectedProcedure.scope || 'Sin alcance capturado.'}</p>
                </article>
                <article className="pno-detail-card pno-detail-card--wide">
                  <span className="pno-section-label">Falla o disparador</span>
                  <p>{selectedProcedure.failureFocus || 'Sin síntoma principal definido.'}</p>
                </article>
              </div>

              <div className="pno-dual-grid">
                <article className="pno-detail-card">
                  <span className="pno-section-label">Herramientas</span>
                  <ul className="pno-bullet-list">
                    {selectedProcedure.tools.length > 0 ? selectedProcedure.tools.map((item) => <li key={item}>{item}</li>) : <li>Sin herramientas registradas.</li>}
                  </ul>
                </article>

                <article className="pno-detail-card">
                  <span className="pno-section-label">Materiales</span>
                  <ul className="pno-bullet-list">
                    {selectedProcedure.materials.length > 0 ? selectedProcedure.materials.map((item) => <li key={item}>{item}</li>) : <li>Sin materiales registrados.</li>}
                  </ul>
                </article>
              </div>

              <article className="pno-detail-card pno-detail-card--attention">
                <span className="pno-section-label">Precauciones</span>
                <ul className="pno-bullet-list">
                  {selectedProcedure.safetyNotes.length > 0 ? selectedProcedure.safetyNotes.map((item) => <li key={item}>{item}</li>) : <li>Sin notas de seguridad capturadas.</li>}
                </ul>
              </article>

              <article className="pno-detail-card pno-detail-card--steps">
                <span className="pno-section-label">Secuencia operativa</span>
                <ol className="pno-step-list">
                  {selectedProcedure.steps.length > 0 ? selectedProcedure.steps.map((item) => <li key={item}>{item}</li>) : <li>Sin pasos documentados.</li>}
                </ol>
              </article>

              <div className="pno-dual-grid">
                <article className="pno-detail-card">
                  <span className="pno-section-label">Criterios de validación</span>
                  <ul className="pno-bullet-list">
                    {selectedProcedure.validationPoints.length > 0 ? selectedProcedure.validationPoints.map((item) => <li key={item}>{item}</li>) : <li>Sin validaciones definidas.</li>}
                  </ul>
                </article>

                <article className="pno-detail-card">
                  <span className="pno-section-label">Referencias y anexos</span>
                  <ul className="pno-bullet-list">
                    {selectedProcedure.referenceNotes.length > 0 ? selectedProcedure.referenceNotes.map((item) => <li key={item}>{item}</li>) : <li>Sin referencias capturadas.</li>}
                  </ul>
                </article>
              </div>

              <article className="pno-detail-card">
                <span className="pno-section-label">Etiquetas</span>
                <div className="pno-tag-row">
                  {selectedProcedure.tags.length > 0 ? (
                    selectedProcedure.tags.map((item) => (
                      <span key={item} className="pno-tag">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="pno-tag pno-tag--empty">Sin etiquetas</span>
                  )}
                </div>
              </article>
            </>
          ) : (
            <div className="pno-empty-state pno-empty-state--detail">
              <strong>Selecciona un procedimiento</strong>
              <p>El detalle técnico aparecerá aquí junto con sus pasos, validaciones y medidas de seguridad.</p>
            </div>
          )}
        </section>
      </section>

      {staff && editorMode ? (
        <section className="pno-panel pno-panel--editor">
          <div className="pno-panel__header pno-panel__header--detail">
            <div>
              <span className="pno-eyebrow">{editorMode === 'create' ? 'Alta controlada' : 'Edición técnica'}</span>
              <h3>{editorMode === 'create' ? 'Nuevo procedimiento PNO' : `Editar ${editorDraft.code || 'procedimiento'}`}</h3>
            </div>
            <div className="pno-detail__actions">
              <button type="button" className="button-primary inactive" onClick={closeEditor} disabled={saving}>
                Cancelar
              </button>
              <button type="button" className="button-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : editorMode === 'create' ? 'Guardar PNO' : 'Actualizar PNO'}
              </button>
            </div>
          </div>

          <div className="pno-editor-grid">
            <label className="pno-field">
              <span>Código</span>
              <input className="input-field" value={editorDraft.code} onChange={(event) => updateDraftField('code', event.target.value)} placeholder="PNO-AJU-001" />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Título</span>
              <input className="input-field" value={editorDraft.title} onChange={(event) => updateDraftField('title', event.target.value)} placeholder="Nombre del procedimiento" />
            </label>

            <label className="pno-field">
              <span>Tipo</span>
              <select
                className="input-field"
                value={editorDraft.procedureKind}
                onChange={(event) => updateDraftField('procedureKind', event.target.value as PnoProcedureKind)}
              >
                {PNO_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="pno-field">
              <span>Estado</span>
              <select
                className="input-field"
                value={editorDraft.status}
                onChange={(event) => updateDraftField('status', event.target.value as PnoProcedureStatus)}
              >
                {PNO_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="pno-field">
              <span>Versión</span>
              <input className="input-field" value={editorDraft.version} onChange={(event) => updateDraftField('version', event.target.value)} placeholder="1.0" />
            </label>

            <label className="pno-field">
              <span>Familia / equipo</span>
              <input
                className="input-field"
                value={editorDraft.equipmentFamily}
                onChange={(event) => updateDraftField('equipmentFamily', event.target.value)}
                placeholder="BA-400 / ISE / Multiplataforma"
              />
            </label>

            <label className="pno-field">
              <span>Duración objetivo</span>
              <input
                className="input-field"
                value={editorDraft.estimatedDuration}
                onChange={(event) => updateDraftField('estimatedDuration', event.target.value)}
                placeholder="30 a 45 min"
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Resumen técnico</span>
              <textarea
                className="input-field pno-textarea pno-textarea--short"
                value={editorDraft.summary}
                onChange={(event) => updateDraftField('summary', event.target.value)}
                placeholder="Qué resuelve este PNO y cuándo debe aplicarse."
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Objetivo</span>
              <textarea
                className="input-field pno-textarea pno-textarea--short"
                value={editorDraft.objective}
                onChange={(event) => updateDraftField('objective', event.target.value)}
                placeholder="Resultado técnico esperado."
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Alcance</span>
              <textarea
                className="input-field pno-textarea pno-textarea--short"
                value={editorDraft.scope}
                onChange={(event) => updateDraftField('scope', event.target.value)}
                placeholder="Dónde sí aplica y dónde no."
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Falla o síntoma disparador</span>
              <textarea
                className="input-field pno-textarea pno-textarea--short"
                value={editorDraft.failureFocus}
                onChange={(event) => updateDraftField('failureFocus', event.target.value)}
                placeholder="Falla, comportamiento o condición que detona este procedimiento."
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Herramientas</span>
              <textarea
                className="input-field pno-textarea"
                value={toMultilineValue(editorDraft.tools)}
                onChange={(event) => updateDraftField('tools', fromMultilineValue(event.target.value))}
                placeholder="Una línea por herramienta"
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Materiales</span>
              <textarea
                className="input-field pno-textarea"
                value={toMultilineValue(editorDraft.materials)}
                onChange={(event) => updateDraftField('materials', fromMultilineValue(event.target.value))}
                placeholder="Una línea por material"
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Precauciones</span>
              <textarea
                className="input-field pno-textarea"
                value={toMultilineValue(editorDraft.safetyNotes)}
                onChange={(event) => updateDraftField('safetyNotes', fromMultilineValue(event.target.value))}
                placeholder="Una línea por advertencia o medida de seguridad"
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Pasos operativos</span>
              <textarea
                className="input-field pno-textarea pno-textarea--tall"
                value={toMultilineValue(editorDraft.steps)}
                onChange={(event) => updateDraftField('steps', fromMultilineValue(event.target.value))}
                placeholder="Un paso por línea"
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Validación</span>
              <textarea
                className="input-field pno-textarea"
                value={toMultilineValue(editorDraft.validationPoints)}
                onChange={(event) => updateDraftField('validationPoints', fromMultilineValue(event.target.value))}
                placeholder="Una línea por criterio de aceptación"
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Referencias</span>
              <textarea
                className="input-field pno-textarea"
                value={toMultilineValue(editorDraft.referenceNotes)}
                onChange={(event) => updateDraftField('referenceNotes', fromMultilineValue(event.target.value))}
                placeholder="Manual, sección, anexo o evidencia requerida"
              />
            </label>

            <label className="pno-field pno-field--wide">
              <span>Etiquetas</span>
              <input
                className="input-field"
                value={editorDraft.tags.join(', ')}
                onChange={(event) =>
                  updateDraftField(
                    'tags',
                    event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="fotometría, ISE, falla intermitente"
              />
            </label>
          </div>
        </section>
      ) : null}
    </div>
  );
}
