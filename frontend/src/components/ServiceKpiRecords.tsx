import { useEffect, useMemo, useState } from 'react';
import { applyBrandFontToWorkbook } from '../config/brandFonts';
import { fetchAllKpiRecords, fetchKpiRecords, type RecordsQuery } from './serviceKpiApi';
import { defaultSort, definitions, formatCount, isoDay, recordColumns, toCsv, type Drill, type KpiRecord } from './serviceKpiModel';

const PAGE_SIZE = 25;
const rowId = { tickets: 'ticket_id', activities: 'activity_id', failures: 'failure_id', parts: 'part_id', surveys: 'survey_id' } as const;
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// Records that explain an indicator. Paging, search and sort run on the server with the same
// filters as the cards; both exports page through the same RPC. The parent remounts it per
// indicator, so paging and sorting always start fresh.
export default function ServiceKpiRecords({ drill, filters, criteria, onClose, onOpenTicket }: {
  drill: Drill; filters: Record<string, string | number>; criteria: Array<[string, string]>;
  onClose: () => void; onOpenTicket: (ticket: { id: string; folio: string }) => void;
}) {
  const columns = recordColumns[drill.dataset];
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(defaultSort[drill.dataset]);
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: KpiRecord[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const query = useMemo<RecordsQuery>(() => ({ dataset: drill.dataset, filters, match: drill.match, search, sort, desc }), [drill, filters, search, sort, desc]);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    fetchKpiRecords(query, (page - 1) * PAGE_SIZE, PAGE_SIZE)
      .then(result => { if (active) setData(result); })
      .catch(cause => { if (active) { setError((cause as Error).message); setData(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, page]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  const definition = drill.definition ? definitions[drill.definition] : null;
  const fileBase = `ORION_${drill.dataset}_${isoDay(new Date())}`;
  const exportCsv = async () => {
    setExporting('csv'); setError('');
    try { const all = await fetchAllKpiRecords(query); download(new Blob([toCsv(columns, all.rows)], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`); }
    catch (cause) { setError(`No se pudo exportar: ${(cause as Error).message}`); }
    finally { setExporting(''); }
  };
  const exportExcel = async () => {
    setExporting('xlsx'); setError('');
    try {
      const all = await fetchAllKpiRecords(query);
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook(); book.creator = 'ORION · BioSystems'; book.created = new Date();
      const sheet = book.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = columns.map(column => ({ header: column.label, key: column.key, width: /Descripción|Motivo|evidencia|Solución|Avería|Comentario|Participantes|Regla/.test(column.label) ? 42 : 20 }));
      for (const row of all.rows) sheet.addRow(Object.fromEntries(columns.map(column => [column.key, column.raw ? column.raw(row) ?? column.text(row) : column.text(row)])));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153C48' } };
      if (all.rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: all.rows.length + 1, column: columns.length } };
      const info = book.addWorksheet('Criterios');
      info.addRows([['Generado', new Date().toLocaleString('es-MX')], ['Indicador', drill.title], ['Registros exportados', all.rows.length], ['Búsqueda', search || 'Sin búsqueda'], ...criteria,
        ...(definition ? [['Fórmula', definition.formula], ['Fuente', definition.source], ['Campo de fecha', definition.dateField], ['Denominador', definition.denominator], ...(definition.note ? [['Nota', definition.note]] : [])] : [])]);
      info.getColumn(1).width = 26; info.getColumn(2).width = 110;
      applyBrandFontToWorkbook(book);
      const buffer = await book.xlsx.writeBuffer();
      download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase}.xlsx`);
    } catch (cause) { setError(`No se pudo exportar: ${(cause as Error).message}`); }
    finally { setExporting(''); }
  };
  const toggleSort = (key?: string) => { if (!key) return; if (sort === key) setDesc(!desc); else { setSort(key); setDesc(true); } setPage(1); };
  return <section className="kpi-records" aria-label={`Registros: ${drill.title}`}>
    <header>
      <div><span className="tc-eyebrow">REGISTROS QUE EXPLICAN EL INDICADOR</span><h3>{drill.title}</h3>
        <p>{loading && !data ? 'Consultando registros…' : `${formatCount(data?.total || 0)} registros con los filtros actuales`}</p></div>
      <button type="button" className="tc-text-button" onClick={onClose}>Cerrar detalle</button>
    </header>
    {definition && <p className="kpi-records-definition"><strong>{definition.label}:</strong> {definition.formula} <em>Denominador: {definition.denominator}</em></p>}
    <div className="kpi-records-tools">
      <label className="tc-search">Buscar en estos registros<input type="search" value={searchInput} placeholder="Folio, serie, cliente, persona, código…" onChange={event => setSearchInput(event.target.value)} /></label>
      <div className="tc-export">
        <button type="button" disabled={!data?.total || Boolean(exporting)} onClick={() => void exportExcel()}>{exporting === 'xlsx' ? 'Exportando…' : 'Exportar Excel'}</button>
        <button type="button" disabled={!data?.total || Boolean(exporting)} onClick={() => void exportCsv()}>{exporting === 'csv' ? 'Exportando…' : 'Exportar CSV'}</button>
      </div>
    </div>
    {error && <p role="alert" className="tc-error">{error}</p>}
    {loading && !data ? <div className="tc-empty">Consultando registros…</div> : !data?.total ? <div className="tc-empty"><strong>Sin registros para este indicador</strong><p>Con los filtros actuales no hay registros que lo expliquen.</p></div> : <>
      <div className="tc-table-scroll" aria-busy={loading}><table className="tc-table kpi-records-table"><thead><tr>
        {columns.map(column => <th key={column.key} aria-sort={column.sort && sort === column.sort ? (desc ? 'descending' : 'ascending') : undefined}>
          {column.sort ? <button type="button" className="kpi-sort" onClick={() => toggleSort(column.sort)}>{column.label}{sort === column.sort ? (desc ? ' ↓' : ' ↑') : ''}</button> : column.label}
        </th>)}
        <th><span className="tc-sr-only">Ticket</span></th>
      </tr></thead><tbody>
        {data.rows.map(row => <tr key={String(row[rowId[drill.dataset]])}>
          {columns.map(column => <td key={column.key}>{column.text(row)}</td>)}
          <td>{row.ticket_id && row.folio ? <button type="button" className="tc-open" onClick={() => onOpenTicket({ id: String(row.ticket_id), folio: String(row.folio) })}>Abrir ticket</button> : <small>Sin ticket</small>}</td>
        </tr>)}
      </tbody></table></div>
      <div className="tc-pagination"><span>Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} de {formatCount(data.total)} · Las exportaciones incluyen todos los registros filtrados</span>
        <div><button type="button" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>Anterior</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Siguiente</button></div></div>
    </>}
  </section>;
}
