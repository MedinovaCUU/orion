import { createPortal } from 'react-dom';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { ProfileSummary } from './servicesPlanning';
import './Inventario.css';

type BannerTone = 'error' | 'success' | 'info';
type UnknownCodeDecision = 'pending' | 'catalog' | 'count-only';

interface InventoryCatalogEntry {
  codigo_refaccion: string;
  equipo?: string | null;
  nombre?: string | null;
  desc_breve?: string | null;
  descripcion?: string | null;
}

interface SearchableCatalogEntry extends InventoryCatalogEntry {
  codeKey: string;
  searchText: string;
}

interface InventoryCountLineRow {
  id: string;
  folio: number;
  sheet_number?: number | null;
  article_code: string;
  catalog_code?: string | null;
  lote: string;
  quantity: number;
  known_code: boolean;
  add_to_catalog: boolean;
  counted_by_id?: string | null;
  counted_by_name?: string | null;
  notes?: string | null;
}

interface InventoryCountRow {
  id: string;
  count_number: number;
  count_reference: string;
  warehouse_name: string;
  capture_year: number;
  counted_at: string;
  counted_by_name?: string | null;
  captured_by_name?: string | null;
  line_count?: number | null;
  total_quantity?: number | null;
  created_at: string;
  inventory_count_lines?: InventoryCountLineRow[] | null;
}

interface InventoryDraftLine {
  id: string;
  folio: number;
  articleCode: string;
  articleCodeKey: string;
  lote: string;
  quantity: number;
  knownCode: boolean;
  catalogCode: string | null;
  description: string;
  family: string;
  similarMatches: InventoryCatalogEntry[];
  unknownDecision: UnknownCodeDecision;
  notes: string;
}

interface CaptureDraft {
  articleCode: string;
  lote: string;
  quantity: string;
}

interface InventoryBanner {
  tone: BannerTone;
  title: string;
  messages: string[];
}

interface InventorySessionForm {
  countedAt: string;
  notes: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const normalizeCodeKey = (value: string | null | undefined) =>
  normalizeText(value).replace(/[^A-Z0-9]+/g, '');

const sanitizeCodeDisplay = (value: string) =>
  value
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const buildCatalogLabel = (entry: InventoryCatalogEntry) =>
  entry.descripcion?.trim() ||
  [entry.nombre, entry.desc_breve]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' · ') ||
  entry.codigo_refaccion;

const buildCatalogFamily = (entry: InventoryCatalogEntry) =>
  entry.equipo?.trim() ||
  entry.desc_breve?.trim() ||
  'Sin familia registrada';

const buildCatalogSuggestionHint = (entry: InventoryCatalogEntry) => {
  const label = buildCatalogLabel(entry);
  const family = buildCatalogFamily(entry);

  if (label !== entry.codigo_refaccion && !/^ALTA CREADA DESDE/i.test(normalizeText(label))) {
    return label;
  }

  if (family !== 'Sin familia registrada') {
    return family;
  }

  return 'Sin descripción breve';
};

const boundedLevenshtein = (left: string, right: string, maxDistance = 4) => {
  if (!left || !right) {
    return maxDistance + 1;
  }

  const leftLength = left.length;
  const rightLength = right.length;

  if (Math.abs(leftLength - rightLength) > maxDistance) {
    return maxDistance + 1;
  }

  const previous = Array.from({ length: rightLength + 1 }, (_, index) => index);

  for (let row = 1; row <= leftLength; row += 1) {
    let current = [row];
    let rowMin = current[0];

    for (let column = 1; column <= rightLength; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost,
      );

      current[column] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let column = 0; column <= rightLength; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[rightLength];
};

const buildCatalogSearchScore = (entry: SearchableCatalogEntry, queryText: string, queryKey: string) => {
  if (!queryText && !queryKey) {
    return 0;
  }

  let score = 0;
  const tokens = queryText.split(/\s+/).filter(Boolean);

  if (queryKey) {
    if (entry.codeKey === queryKey) score += 220;
    if (entry.codeKey.startsWith(queryKey)) score += 150;
    if (entry.codeKey.includes(queryKey)) score += 90;

    const distance = boundedLevenshtein(entry.codeKey, queryKey, 3);
    if (distance <= 3) {
      score += 60 - distance * 12;
    }
  }

  if (queryText) {
    if (entry.searchText.includes(queryText)) score += 85;

    score += tokens.reduce((acc, token) => {
      let tokenScore = 0;
      if (entry.codeKey.includes(token.replace(/[^A-Z0-9]+/g, ''))) tokenScore += 14;
      if (entry.searchText.includes(token)) tokenScore += 10;
      return acc + tokenScore;
    }, 0);
  }

  return score;
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Sin fecha';
  }

  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
};

const isStaffRole = (role: string | null | undefined) => role === 'admin' || role === 'tecnico';

const normalizeRecentCounts = (counts: InventoryCountRow[]) =>
  counts.map((count) => ({
    ...count,
    inventory_count_lines: [...(count.inventory_count_lines || [])].sort((left, right) => left.folio - right.folio),
  }));

const reindexLines = (lines: InventoryDraftLine[]) =>
  lines.map((line, index) => ({
    ...line,
    folio: index + 1,
  }));

export default function Inventario() {
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [catalog, setCatalog] = useState<InventoryCatalogEntry[]>([]);
  const [recentCounts, setRecentCounts] = useState<InventoryCountRow[]>([]);
  const [lines, setLines] = useState<InventoryDraftLine[]>([]);
  const [captureDraft, setCaptureDraft] = useState<CaptureDraft>({
    articleCode: '',
    lote: 'N/A',
    quantity: '1',
  });
  const [sessionForm, setSessionForm] = useState<InventorySessionForm>({
    countedAt: todayIso(),
    notes: '',
  });
  const [historySearch, setHistorySearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [banner, setBanner] = useState<InventoryBanner | null>(null);
  const [expandedCountId, setExpandedCountId] = useState<string | null>(null);

  const deferredCodeSearch = useDeferredValue(captureDraft.articleCode);
  const normalizedHistorySearch = normalizeText(historySearch);

  const searchableCatalog = useMemo<SearchableCatalogEntry[]>(
    () =>
      catalog.map((entry) => ({
        ...entry,
        codeKey: normalizeCodeKey(entry.codigo_refaccion),
        searchText: normalizeText(
          [entry.codigo_refaccion, entry.equipo, entry.nombre, entry.desc_breve, entry.descripcion].join(' '),
        ),
      })),
    [catalog],
  );

  const catalogLookup = useMemo(
    () => new Map(searchableCatalog.map((entry) => [entry.codeKey, entry])),
    [searchableCatalog],
  );

  const resolveSimilarCatalogEntries = (value: string, limit = 6) => {
    const queryText = normalizeText(value);
    const queryKey = normalizeCodeKey(value);

    if (!queryText && !queryKey) {
      return [];
    }

    return searchableCatalog
      .map((entry) => ({
        entry,
        score: buildCatalogSearchScore(entry, queryText, queryKey),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.entry);
  };

  const resolveLine = (input: {
    id: string;
    folio: number;
    articleCode: string;
    lote: string;
    quantity: number;
    notes: string;
    previousDecision?: UnknownCodeDecision;
  }): InventoryDraftLine => {
    const articleCode = sanitizeCodeDisplay(input.articleCode);
    const articleCodeKey = normalizeCodeKey(articleCode);
    const exactMatch = articleCodeKey ? catalogLookup.get(articleCodeKey) : undefined;
    const similarMatches = exactMatch || !articleCode ? [] : resolveSimilarCatalogEntries(articleCode, 5);

    return {
      id: input.id,
      folio: input.folio,
      articleCode,
      articleCodeKey,
      lote: input.lote.trim() || 'N/A',
      quantity: Math.max(1, Number(input.quantity) || 1),
      knownCode: Boolean(exactMatch),
      catalogCode: exactMatch?.codigo_refaccion || null,
      description: exactMatch
        ? buildCatalogLabel(exactMatch)
        : 'Código fuera de catálogo. Revisa sugerencias o confírmalo como alta nueva.',
      family: exactMatch ? buildCatalogFamily(exactMatch) : 'Pendiente de catalogación',
      similarMatches,
      unknownDecision: exactMatch ? 'catalog' : input.previousDecision || 'pending',
      notes: input.notes.trim(),
    };
  };

  const fetchCatalog = async () => {
    const { data, error } = await supabase
      .from('refacciones_catalogo')
      .select('codigo_refaccion, equipo, nombre, desc_breve, descripcion')
      .order('codigo_refaccion', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    setCatalog((data as InventoryCatalogEntry[]) || []);
  };

  const fetchRecentCounts = async () => {
    const { data, error } = await supabase
      .from('inventory_counts')
      .select(
        'id, count_number, count_reference, warehouse_name, capture_year, counted_at, counted_by_name, captured_by_name, line_count, total_quantity, created_at, inventory_count_lines(id, folio, sheet_number, article_code, catalog_code, lote, quantity, known_code, add_to_catalog, counted_by_id, counted_by_name, notes)',
      )
      .order('created_at', { ascending: false })
      .limit(8);

    if (error) {
      throw new Error(error.message);
    }

    setRecentCounts(normalizeRecentCounts((data as InventoryCountRow[]) || []));
  };

  useEffect(() => {
    let cancelled = false;

    const loadModule = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setBanner({
            tone: 'error',
            title: 'Sesión no disponible',
            messages: ['Vuelve a iniciar sesión para capturar inventario.'],
          });
          setLoading(false);
        }
        return;
      }

      const profileResponse = await supabase
        .from('profiles')
        .select('id, nombre_completo, employee_number, telefono, territorio, rol')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (profileResponse.error) {
        setBanner({
          tone: 'error',
          title: 'No fue posible cargar el perfil',
          messages: [profileResponse.error.message],
        });
        setLoading(false);
        return;
      }

      const userProfile = (profileResponse.data as ProfileSummary | null) || {
        id: user.id,
        nombre_completo: user.email || 'Usuario Orion',
        rol: 'tecnico',
      };

      setProfile(userProfile);

      if (!isStaffRole(userProfile.rol)) {
        setLoading(false);
        return;
      }

      const errors: string[] = [];

      await Promise.all([
        fetchCatalog().catch((error) => {
          errors.push(error instanceof Error ? error.message : 'No fue posible cargar el catálogo.');
        }),
        fetchRecentCounts().catch((error) => {
          errors.push(error instanceof Error ? error.message : 'No fue posible cargar los conteos recientes.');
        }),
      ]);

      if (cancelled) {
        return;
      }

      if (errors.length > 0) {
        setBanner({
          tone: 'error',
          title: 'Carga parcial del módulo',
          messages: errors,
        });
      }

      setLoading(false);
    };

    void loadModule();

    return () => {
      cancelled = true;
    };
  }, []);

  const exactComposerMatch = useMemo(() => {
    const codeKey = normalizeCodeKey(captureDraft.articleCode);
    return codeKey ? catalogLookup.get(codeKey) : undefined;
  }, [captureDraft.articleCode, catalogLookup]);

  const closestComposerMatches = useMemo(() => {
    if (!deferredCodeSearch.trim() || exactComposerMatch) {
      return [];
    }

    return resolveSimilarCatalogEntries(deferredCodeSearch, 4).filter(
      (entry) => normalizeCodeKey(entry.codigo_refaccion) !== normalizeCodeKey(deferredCodeSearch),
    );
  }, [deferredCodeSearch, exactComposerMatch]);

  const visibleCounts = useMemo(() => {
    if (!normalizedHistorySearch) {
      return recentCounts;
    }

    return recentCounts.filter((count) => {
      const haystack = normalizeText(
        [
          count.count_reference,
          count.counted_by_name,
          count.captured_by_name,
          count.warehouse_name,
          count.inventory_count_lines
            ?.map((line) => `${line.article_code} ${line.lote} ${line.notes || ''}`)
            .join(' '),
        ].join(' '),
      );

      return haystack.includes(normalizedHistorySearch);
    });
  }, [normalizedHistorySearch, recentCounts]);

  const nextCountPreview = (recentCounts[0]?.count_number || 0) + 1;
  const nextFolio = lines.length + 1;
  const totalDraftQuantity = lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
  const unknownLines = lines.filter((line) => !line.knownCode);
  const unresolvedUnknownLines = unknownLines.filter((line) => line.unknownDecision === 'pending');
  const catalogReadyUnknownLines = unknownLines.filter((line) => line.unknownDecision === 'catalog');
  const hasUnknownComposerCode = !exactComposerMatch && captureDraft.articleCode.trim().length > 0;

  const resetCaptureDraft = () => {
    setCaptureDraft({
      articleCode: '',
      lote: 'N/A',
      quantity: '1',
    });

    window.requestAnimationFrame(() => {
      codeInputRef.current?.focus();
    });
  };

  const handleAddLine = () => {
    const articleCode = sanitizeCodeDisplay(captureDraft.articleCode);
    const quantity = Number(captureDraft.quantity);

    if (!articleCode) {
      setBanner({
        tone: 'error',
        title: 'Código requerido',
        messages: ['Captura un código de artículo antes de agregar la partida al conteo.'],
      });
      codeInputRef.current?.focus();
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      setBanner({
        tone: 'error',
        title: 'Cantidad inválida',
        messages: ['La cantidad debe ser un entero mayor a cero.'],
      });
      return;
    }

    const draftLine = resolveLine({
      id: crypto.randomUUID(),
      folio: nextFolio,
      articleCode,
      lote: captureDraft.lote || 'N/A',
      quantity,
      notes: '',
    });

    setLines((current) => {
      const duplicateIndex = current.findIndex(
        (line) =>
          line.articleCodeKey === draftLine.articleCodeKey &&
          normalizeText(line.lote) === normalizeText(draftLine.lote),
      );

      if (duplicateIndex >= 0) {
        return reindexLines(
          current.map((line, index) =>
            index === duplicateIndex
              ? resolveLine({
                  id: line.id,
                  folio: line.folio,
                  articleCode: line.articleCode,
                  lote: line.lote,
                  quantity: line.quantity + draftLine.quantity,
                  notes: line.notes,
                  previousDecision: line.unknownDecision,
                })
              : line,
          ),
        );
      }

      return reindexLines([...current, draftLine]);
    });

    setBanner(
      draftLine.knownCode
        ? null
        : {
            tone: 'info',
            title: 'Código fuera de catálogo',
            messages: [
              'La partida quedó capturada sin bloquear el flujo.',
              'Antes de guardar podrás decidir si el código también se agrega al catálogo maestro.',
            ],
          },
    );

    resetCaptureDraft();
  };

  const updateLine = (
    lineId: string,
    patch: Partial<Pick<InventoryDraftLine, 'articleCode' | 'lote' | 'quantity' | 'notes' | 'unknownDecision'>>,
  ) => {
    setLines((current) =>
      reindexLines(
        current.map((line) => {
          if (line.id !== lineId) {
            return line;
          }

          const nextArticleCode = patch.articleCode ?? line.articleCode;
          const nextCodeKey = normalizeCodeKey(nextArticleCode);
          const articleCodeChanged = patch.articleCode !== undefined && nextCodeKey !== line.articleCodeKey;
          const previousDecision =
            patch.unknownDecision ??
            (articleCodeChanged ? 'pending' : line.unknownDecision);

          return resolveLine({
            id: line.id,
            folio: line.folio,
            articleCode: nextArticleCode,
            lote: patch.lote ?? line.lote,
            quantity: patch.quantity ?? line.quantity,
            notes: patch.notes ?? line.notes,
            previousDecision,
          });
        }),
      ),
    );
  };

  const removeLine = (lineId: string) => {
    setLines((current) => reindexLines(current.filter((line) => line.id !== lineId)));
  };

  const validateDraft = () => {
    const issues: string[] = [];

    if (!profile || !isStaffRole(profile.rol)) {
      issues.push('Tu perfil actual no tiene permisos de staff para registrar inventario.');
    }

    if (!sessionForm.countedAt) {
      issues.push('Define la fecha del conteo.');
    }

    if (lines.length === 0) {
      issues.push('Agrega al menos una partida antes de registrar el conteo.');
    }

    lines.forEach((line) => {
      if (!line.articleCode.trim()) {
        issues.push(`El folio ${line.folio} no tiene código de artículo.`);
      }

      if (!Number.isFinite(line.quantity) || line.quantity < 1) {
        issues.push(`El folio ${line.folio} tiene una cantidad inválida.`);
      }

      if (!line.lote.trim()) {
        issues.push(`El folio ${line.folio} necesita un lote o la marca N/A.`);
      }
    });

    return issues;
  };

  const persistCount = async () => {
    const issues = validateDraft();
    if (issues.length > 0) {
      setBanner({
        tone: 'error',
        title: 'Conteo incompleto',
        messages: issues,
      });
      return;
    }

    if (unresolvedUnknownLines.length > 0) {
      setReviewModalOpen(true);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setBanner({
        tone: 'error',
        title: 'Sesión no disponible',
        messages: ['Vuelve a iniciar sesión antes de registrar el conteo.'],
      });
      return;
    }

    const normalizedLines = reindexLines(
      lines.map((line) =>
        resolveLine({
          id: line.id,
          folio: line.folio,
          articleCode: line.articleCode,
          lote: line.lote,
          quantity: line.quantity,
          notes: line.notes,
          previousDecision: line.unknownDecision,
        }),
      ),
    );

    const uniqueCatalogUpserts = Array.from(
      new Map(
        normalizedLines
          .filter((line) => !line.knownCode && line.unknownDecision === 'catalog')
          .map((line) => [
            line.articleCodeKey,
            {
              codigo_refaccion: line.articleCode,
              nombre: null,
              equipo: null,
              desc_breve: null,
              descripcion: 'Alta creada desde el módulo de inventario. Pendiente de catalogación descriptiva.',
            },
          ]),
      ).values(),
    );

    const sessionUserName = profile?.nombre_completo?.trim() || user.email || 'Usuario Orion';
    const captureYear = Number(sessionForm.countedAt.slice(0, 4)) || new Date().getFullYear();
    const totalQuantity = normalizedLines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);

    setSaving(true);

    try {
      if (uniqueCatalogUpserts.length > 0) {
        const { error: catalogError } = await supabase
          .from('refacciones_catalogo')
          .upsert(uniqueCatalogUpserts, { onConflict: 'codigo_refaccion' });

        if (catalogError) {
          throw new Error(`No fue posible agregar los códigos nuevos al catálogo: ${catalogError.message}`);
        }
      }

      const { data: createdCount, error: countError } = await supabase
        .from('inventory_counts')
        .insert({
          warehouse_code: 'GDL',
          warehouse_name: 'Guadalajara',
          capture_year: captureYear,
          counted_at: sessionForm.countedAt,
          counted_by_id: user.id,
          counted_by_name: sessionUserName,
          captured_by_id: user.id,
          captured_by_name: sessionUserName,
          notes: sessionForm.notes.trim(),
          line_count: normalizedLines.length,
          total_quantity: totalQuantity,
          status: 'registrado',
        })
        .select('id, count_number, count_reference')
        .single();

      if (countError || !createdCount) {
        throw new Error(countError?.message || 'No fue posible crear el encabezado del conteo.');
      }

      const { error: linesError } = await supabase.from('inventory_count_lines').insert(
        normalizedLines.map((line) => ({
          inventory_count_id: createdCount.id,
          folio: line.folio,
          article_code: line.articleCode,
          catalog_code: line.knownCode ? line.catalogCode : line.unknownDecision === 'catalog' ? line.articleCode : null,
          lote: line.lote.trim() || 'N/A',
          quantity: Math.max(1, line.quantity),
          known_code: line.knownCode,
          add_to_catalog: !line.knownCode && line.unknownDecision === 'catalog',
          counted_by_id: user.id,
          counted_by_name: sessionUserName,
          notes: line.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })),
      );

      if (linesError) {
        await supabase.from('inventory_counts').delete().eq('id', createdCount.id);
        throw new Error(linesError.message);
      }

      await Promise.all([fetchCatalog(), fetchRecentCounts()]);

      setLines([]);
      resetCaptureDraft();
      setReviewModalOpen(false);
      setSessionForm((current) => ({
        ...current,
        countedAt: todayIso(),
        notes: '',
      }));
      setBanner({
        tone: 'success',
        title: 'Conteo registrado',
        messages: [
          `${createdCount.count_reference} quedó guardado con ${normalizedLines.length} partida(s) y ${totalQuantity} unidad(es).`,
          uniqueCatalogUpserts.length > 0
            ? `${uniqueCatalogUpserts.length} código(s) nuevo(s) también se agregaron al catálogo maestro.`
            : 'Todos los códigos quedaron vinculados al catálogo existente.',
        ],
      });
    } catch (error) {
      setBanner({
        tone: 'error',
        title: 'No fue posible registrar el conteo',
        messages: [error instanceof Error ? error.message : 'Error inesperado en la captura de inventario.'],
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="inventory-loading">
        <div className="inventory-loading__orb" />
        <div>
          <strong>Cargando mesa de inventario</strong>
          <p>Perfil, catálogo maestro y conteos recientes.</p>
        </div>
      </div>
    );
  }

  if (!isStaffRole(profile?.rol)) {
    return (
      <div className="inventory-shell">
        <section className="inventory-panel inventory-panel--restricted">
          <span className="inventory-panel__eyebrow">Inventario interno</span>
          <h3>Acceso restringido a staff</h3>
          <p>
            Este módulo registra conteos oficiales de almacén. Si necesitas acceso, tu perfil debe estar marcado como
            <strong> admin</strong> o <strong>tecnico</strong>.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="inventory-shell">
      {banner && (
        <section className={`inventory-banner ${banner.tone}`}>
          <div>
            <strong>{banner.title}</strong>
            {banner.messages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
          <button type="button" className="inventory-banner__close" onClick={() => setBanner(null)}>
            Cerrar
          </button>
        </section>
      )}

      <div className="inventory-layout">
        <section className="inventory-panel inventory-panel--session">
          <div className="inventory-panel__header">
            <div>
              <h3>Encabezado operativo</h3>
            </div>
          </div>

          <div className="inventory-session-grid">
            <label className="inventory-field">
              <span>Conteo No.</span>
              <input className="input-field" value={String(nextCountPreview).padStart(4, '0')} readOnly />
            </label>
            <label className="inventory-field">
              <span>Almacén</span>
              <input className="input-field" value="Guadalajara" readOnly />
            </label>
            <label className="inventory-field">
              <span>Fecha de conteo</span>
              <input
                className="input-field"
                type="date"
                value={sessionForm.countedAt}
                onChange={(event) => setSessionForm((current) => ({ ...current, countedAt: event.target.value }))}
              />
            </label>
          </div>
        </section>

        <section className="inventory-panel inventory-panel--capture">
          <div className="inventory-panel__header">
            <div>
              <span className="inventory-panel__eyebrow">Captura rápida</span>
              <h3>Agrega partidas sin perder ritmo</h3>
            </div>
            <div className="inventory-panel__helper">
              Escribe el código, usa autocompletado libre y presiona Enter en cantidad para mandarlo directo a la hoja.
            </div>
          </div>

          <div className="inventory-capture-grid">
            <label className="inventory-field inventory-field--code">
              <span>Código de artículo</span>
              <input
                ref={codeInputRef}
                className="input-field inventory-input--code"
                value={captureDraft.articleCode}
                list="inventory-catalog-list"
                onChange={(event) => setCaptureDraft((current) => ({ ...current, articleCode: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddLine();
                  }
                }}
                placeholder="Ej. AC11534, PC13386, FI15130"
              />
            </label>

            <label className="inventory-field">
              <span>Lote</span>
              <input
                className="input-field"
                value={captureDraft.lote}
                onChange={(event) => setCaptureDraft((current) => ({ ...current, lote: event.target.value }))}
                placeholder="N/A"
              />
            </label>

            <label className="inventory-field">
              <span>Cantidad</span>
              <input
                className="input-field"
                type="number"
                min="1"
                step="1"
                value={captureDraft.quantity}
                onChange={(event) => setCaptureDraft((current) => ({ ...current, quantity: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddLine();
                  }
                }}
              />
            </label>

            <button type="button" className="button-primary inventory-add-button" onClick={handleAddLine}>
              Agregar partida
            </button>
          </div>

          {exactComposerMatch ? (
            <div className="inventory-preview inventory-preview--known">
              <div>
                <span className="inventory-badge success">Código catalogado</span>
                <strong>{exactComposerMatch.codigo_refaccion}</strong>
              </div>
              <p>{buildCatalogLabel(exactComposerMatch)}</p>
              <small>{buildCatalogFamily(exactComposerMatch)}</small>
            </div>
          ) : null}
        </section>

        {hasUnknownComposerCode && (
          <section className="inventory-panel inventory-panel--code-review">
            <div className="inventory-preview inventory-preview--warning">
              <div>
                <span className="inventory-badge warning">Código no encontrado</span>
                <strong>{sanitizeCodeDisplay(captureDraft.articleCode)}</strong>
              </div>
              <p>
                El flujo no se bloquea. Puedes capturarlo y después decidir si se guarda también en catálogo o si solo
                pertenece a este conteo.
              </p>
            </div>

            {closestComposerMatches.length > 0 && (
              <div className="inventory-compact-suggestions">
                <span className="inventory-compact-suggestions__label">Quizá quisiste decir</span>
                <div className="inventory-compact-suggestions__list">
                  {closestComposerMatches.map((entry) => (
                    <button
                      key={entry.codigo_refaccion}
                      type="button"
                      className="inventory-compact-suggestion"
                      onClick={() =>
                        setCaptureDraft((current) => ({
                          ...current,
                          articleCode: entry.codigo_refaccion,
                        }))
                      }
                    >
                      <strong>{entry.codigo_refaccion}</strong>
                      <span>{buildCatalogLabel(entry)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="inventory-panel inventory-panel--lines">
          <div className="inventory-panel__header">
            <div>
              <span className="inventory-panel__eyebrow">Hoja digital</span>
              <h3>Tabla editable del conteo</h3>
            </div>
            <div className="inventory-lines-summary">
              <span>{lines.length} folio(s)</span>
              <span>{totalDraftQuantity} unidad(es)</span>
              <span>{unknownLines.length} código(s) nuevos</span>
              <span>{unresolvedUnknownLines.length} por decidir</span>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="inventory-empty-state">
              <strong>La captura está vacía.</strong>
              <p>Empieza agregando el primer código, deja lote en N/A si aplica y Orion numerará los folios solo.</p>
            </div>
          ) : (
            <div className="inventory-sheet">
              <div className="inventory-sheet__scroller">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th scope="col">Folio</th>
                      <th scope="col">Código</th>
                      <th scope="col">Lote</th>
                      <th scope="col">Cantidad</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Notas</th>
                      <th scope="col" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className={`inventory-table__row ${line.knownCode ? 'is-known' : 'is-review'}`}>
                        <td className="inventory-table__folio">{String(line.folio).padStart(2, '0')}</td>
                        <td className="inventory-table__code">
                          <input
                            className="input-field inventory-table__input inventory-table__input--code"
                            list="inventory-catalog-list"
                            value={line.articleCode}
                            onChange={(event) => updateLine(line.id, { articleCode: event.target.value })}
                          />
                          {!line.knownCode && (
                            <div className="inventory-table__meta">
                              <span className="inventory-badge warning">Código nuevo</span>
                              <small>{line.family}</small>
                            </div>
                          )}

                          {!line.knownCode && line.similarMatches.length > 0 && (
                            <div className="inventory-table__matches">
                              {line.similarMatches.slice(0, 3).map((entry) => (
                                <button
                                  key={`${line.id}-${entry.codigo_refaccion}`}
                                  type="button"
                                  className="inventory-table__match"
                                  onClick={() => updateLine(line.id, { articleCode: entry.codigo_refaccion })}
                                >
                                  <strong>{entry.codigo_refaccion}</strong>
                                  <span>{buildCatalogSuggestionHint(entry)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <input
                            className="input-field inventory-table__input"
                            value={line.lote}
                            onChange={(event) => updateLine(line.id, { lote: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="input-field inventory-table__input inventory-table__input--quantity"
                            type="number"
                            min="1"
                            step="1"
                            value={String(line.quantity)}
                            onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) || 1 })}
                          />
                        </td>
                        <td className="inventory-table__decision">
                          {line.knownCode ? (
                            <span className="inventory-table__decision-label">Listo para guardar</span>
                          ) : (
                            <select
                              className="input-field inventory-table__select"
                              value={line.unknownDecision}
                              onChange={(event) =>
                                updateLine(line.id, {
                                  unknownDecision: event.target.value as UnknownCodeDecision,
                                })
                              }
                            >
                              <option value="pending">Revisar antes de guardar</option>
                              <option value="catalog">Agregar al catálogo</option>
                              <option value="count-only">Solo en este conteo</option>
                            </select>
                          )}
                        </td>
                        <td>
                          <input
                            className="input-field inventory-table__input"
                            value={line.notes}
                            onChange={(event) => updateLine(line.id, { notes: event.target.value })}
                            placeholder="Aclaración opcional"
                          />
                        </td>
                        <td className="inventory-table__actions">
                          <button type="button" className="inventory-line-card__remove" onClick={() => removeLine(line.id)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <label className="inventory-field inventory-field--notes-end">
            <span>Notas generales</span>
            <textarea
              className="input-field inventory-textarea"
              value={sessionForm.notes}
              onChange={(event) => setSessionForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Observaciones del conteo, aclaraciones de lote, incidencias o hallazgos."
            />
          </label>

          <div className="inventory-footer-actions">
            <button
              type="button"
              className="button-primary inactive"
              onClick={() => {
                setLines([]);
                setBanner(null);
                resetCaptureDraft();
              }}
              disabled={saving || lines.length === 0}
            >
              Vaciar borrador
            </button>

            <button type="button" className="button-primary" onClick={() => void persistCount()} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar conteo'}
            </button>
          </div>
        </section>

        <section className="inventory-panel inventory-panel--history">
          <div className="inventory-panel__header">
            <div>
              <span className="inventory-panel__eyebrow">Historial reciente</span>
              <h3>Conteos guardados</h3>
            </div>
            <label className="inventory-field inventory-field--history-search">
              <span>Buscar</span>
              <input
                className="input-field"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Conteo, código, capturó, lote..."
              />
            </label>
          </div>

          {visibleCounts.length === 0 ? (
            <div className="inventory-empty-state">
              <strong>No hubo coincidencias en el historial.</strong>
              <p>Ajusta la búsqueda o registra el primer conteo para empezar a poblar esta bitácora.</p>
            </div>
          ) : (
            <div className="inventory-history-list">
              {visibleCounts.map((count) => {
                const linesPreview =
                  expandedCountId === count.id
                    ? count.inventory_count_lines || []
                    : (count.inventory_count_lines || []).slice(0, 4);

                return (
                  <article key={count.id} className="inventory-history-card">
                    <div className="inventory-history-card__top">
                      <div>
                        <span className="inventory-panel__eyebrow">Conteo registrado</span>
                        <h4>{count.count_reference}</h4>
                        <p>
                          {formatDateLabel(count.counted_at)} · {count.counted_by_name || 'Sin responsable'}
                        </p>
                      </div>
                      <div className="inventory-history-card__chips">
                        <span className="inventory-badge neutral">{count.warehouse_name}</span>
                        <span className="inventory-badge neutral">{count.line_count || 0} folios</span>
                        <span className="inventory-badge neutral">{count.total_quantity || 0} unidades</span>
                      </div>
                    </div>

                    <div className="inventory-history-card__lines">
                      {linesPreview.map((line) => (
                        <div key={line.id} className="inventory-history-card__line">
                          <strong>{String(line.folio).padStart(2, '0')}</strong>
                          <span>{line.article_code}</span>
                          <small>{line.lote}</small>
                          <em>x{line.quantity}</em>
                        </div>
                      ))}
                    </div>

                    {(count.inventory_count_lines || []).length > 4 && (
                      <button
                        type="button"
                        className="inventory-link-button"
                        onClick={() => setExpandedCountId((current) => (current === count.id ? null : count.id))}
                      >
                        {expandedCountId === count.id ? 'Ver menos' : 'Ver detalle completo'}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <datalist id="inventory-catalog-list">
        {catalog.map((entry) => (
          <option
            key={`catalog-option-${entry.codigo_refaccion}`}
            value={entry.codigo_refaccion}
            label={buildCatalogLabel(entry)}
          />
        ))}
      </datalist>

      {reviewModalOpen &&
        createPortal(
          <div className="inventory-modal-backdrop" onClick={() => setReviewModalOpen(false)}>
            <div className="inventory-modal" onClick={(event) => event.stopPropagation()}>
              <div className="inventory-modal__header">
                <div>
                  <span className="inventory-panel__eyebrow">Revisión final</span>
                  <h3>Decide qué hacer con los códigos nuevos</h3>
                </div>
                <button type="button" className="inventory-banner__close" onClick={() => setReviewModalOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div className="inventory-modal__body">
                {unknownLines.map((line) => (
                  <article key={`review-${line.id}`} className="inventory-modal-line">
                    <div className="inventory-modal-line__head">
                      <div>
                        <strong>Folio {line.folio}</strong>
                        <span>{line.articleCode}</span>
                      </div>
                      <span className={`inventory-badge ${line.unknownDecision === 'pending' ? 'warning' : 'neutral'}`}>
                        {line.unknownDecision === 'catalog'
                          ? 'Agregar al catálogo'
                          : line.unknownDecision === 'count-only'
                            ? 'Solo conteo'
                            : 'Pendiente de decisión'}
                      </span>
                    </div>

                    <p>
                      Cantidad {line.quantity} · Lote {line.lote}
                    </p>

                    <div className="inventory-line-card__actions">
                      <button
                        type="button"
                        className={`inventory-decision-chip ${line.unknownDecision === 'catalog' ? 'active' : ''}`}
                        onClick={() => updateLine(line.id, { unknownDecision: 'catalog' })}
                      >
                        Agregar al catálogo
                      </button>
                      <button
                        type="button"
                        className={`inventory-decision-chip ${line.unknownDecision === 'count-only' ? 'active' : ''}`}
                        onClick={() => updateLine(line.id, { unknownDecision: 'count-only' })}
                      >
                        Solo en conteo
                      </button>
                    </div>

                    {line.similarMatches.length > 0 && (
                      <div className="inventory-similar-list">
                        {line.similarMatches.map((entry) => (
                          <button
                            key={`review-${line.id}-${entry.codigo_refaccion}`}
                            type="button"
                            className="inventory-similar-chip"
                            onClick={() => updateLine(line.id, { articleCode: entry.codigo_refaccion })}
                          >
                            <strong>{entry.codigo_refaccion}</strong>
                            <span>{buildCatalogLabel(entry)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>

              <div className="inventory-modal__footer">
                <div className="inventory-modal__summary">
                  <span>{unknownLines.length} código(s) nuevos</span>
                  <span>{catalogReadyUnknownLines.length} se darán de alta en catálogo</span>
                  <span>{unresolvedUnknownLines.length} siguen pendientes</span>
                </div>
                <button
                  type="button"
                  className="button-primary"
                  disabled={saving || unresolvedUnknownLines.length > 0}
                  onClick={() => void persistCount()}
                >
                  {saving ? 'Guardando...' : 'Confirmar y registrar'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
