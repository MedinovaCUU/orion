import { Fragment, useEffect, useMemo, useState } from 'react';
import TicketCaseDetail, { type CaseTicketRecord } from './TicketCaseDetail';
import type { EquipmentSummary } from './servicesPlanning';
import { formatCaseNumber } from './ticketCaseUtils';
import { closureReasons, eventAuthor, formatDuration, slaLabels, summarizeControl, ticketControlFacts, type TicketServiceEvent } from './ticketControlModel';
import useTicketServiceEvents from './useTicketServiceEvents';
import './TicketControlCenter.css';

export interface ControlEntry {
  ticket: CaseTicketRecord; resolvedEquipment: EquipmentSummary | null;
  ticketClientLabel: string; ticketPhoneLabel: string; locationLabel: string; isPlanningTicket: boolean;
}
const dateLabel = (date?: string) => date ? new Date(date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin registro';
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const localDay = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const PAGE_SIZE = 15;

export default function TicketControlCenter({ entries, canWrite, loading, onChanged, onDiagnose }: {
  entries: ControlEntry[]; canWrite: boolean; loading: boolean; onChanged: () => void; onDiagnose: (ticket: CaseTicketRecord) => void;
}) {
  const { events, error, loaded } = useTicketServiceEvents(entries);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const [view, setView] = useState('cerrados');
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('todos');
  const [sla, setSla] = useState('todos');
  const [review, setReview] = useState('todos');
  const [outcome, setOutcome] = useState('todos');
  const [scope, setScope] = useState('soporte');
  const [dateField, setDateField] = useState('apertura');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('reciente');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const dataReady = loaded && !loading && !error;
  const rows = useMemo(() => {
    const byTicket = new Map<string, TicketServiceEvent[]>();
    for (const event of events) { const list = byTicket.get(event.ticket_id) || []; list.push(event); byTicket.set(event.ticket_id, list); }
    return entries.map(entry => ({ ...entry, ...ticketControlFacts(entry.ticket, byTicket.get(entry.ticket.id) || [], now) }));
  }, [entries, events, now]);
  const owners = useMemo(() => [...new Map(rows.map(row => [row.ownerId, row.owner])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const invalidDates = Boolean(from && to && from > to);
  const filtered = useMemo(() => rows.filter(row => {
    const day = localDay(dateField === 'cierre' ? row.closure?.occurred_at : row.ticket.creado_en);
    return !invalidDates
      && (view === 'todos' || (view === 'cerrados' ? row.closed : !row.closed))
      && (scope === 'todos' || (scope === 'planeacion' ? row.isPlanningTicket : !row.isPlanningTicket))
      && (owner === 'todos' || row.ownerId === owner)
      && (sla === 'todos' || row.sla === sla)
      && (review === 'todos' || (review === 'pendiente' ? row.closed && !row.review : Boolean(row.review)))
      && (outcome === 'todos' || (outcome === 'sin_clasificar' ? row.closed && !row.closure?.closure_reason : row.closure?.closure_reason === outcome))
      && (!from || Boolean(day) && day >= from) && (!to || Boolean(day) && day <= to)
      && (!search.trim() || normalized([formatCaseNumber(row.ticket), row.ticket.asunto, row.ticket.numero_serie_equipo, row.ticketClientLabel, row.ticketPhoneLabel, row.locationLabel, row.owner].join(' ')).includes(normalized(search.trim())));
  }).sort((a, b) => {
    if (sort === 'duracion') return (b.hours ?? -1) - (a.hours ?? -1);
    if (sort === 'cliente') return a.ticketClientLabel.localeCompare(b.ticketClientLabel);
    if (sort === 'riesgo') {
      const priority = { vencido: 0, por_vencer: 1, sin_dato: 2, justificado: 3, dentro: 4 };
      return priority[a.sla] - priority[b.sla] || (b.hours ?? -1) - (a.hours ?? -1);
    }
    return Date.parse(b.closure?.occurred_at || b.ticket.creado_en) - Date.parse(a.closure?.occurred_at || a.ticket.creado_en);
  }), [rows, view, scope, owner, sla, review, outcome, dateField, from, to, search, sort, invalidDates]);
  const summary = summarizeControl(filtered);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const filterChange = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  const reset = () => { setSearch(''); setOwner('todos'); setSla('todos'); setReview('todos'); setOutcome('todos'); setScope('soporte'); setFrom(''); setTo(''); setDateField('apertura'); setSort('reciente'); setPage(1); };
  const staff = [...new Map(filtered.map(row => [row.ownerId, row.owner])).entries()].map(([id, name]) => {
    const cases = filtered.filter(row => row.ownerId === id);
    return { id, name, summary: summarizeControl(cases) };
  });
  const exportRows = () => filtered.map(row => ({
    Folio: formatCaseNumber(row.ticket), Serie: row.ticket.numero_serie_equipo || '', Cliente: row.ticketClientLabel,
    Teléfono: row.ticketPhoneLabel, Ubicación: row.locationLabel, Asunto: row.ticket.asunto,
    'Estado del caso': row.closed ? 'Cerrado' : 'En atención', Resultado: row.outcome,
    'Autor de primera respuesta': eventAuthor(row.response), 'Primera respuesta': dateLabel(row.response?.occurred_at),
    'Horas a primera respuesta': row.responseHours, 'Autor del cierre': eventAuthor(row.closure),
    Apertura: dateLabel(row.ticket.creado_en), Cierre: dateLabel(row.closure?.occurred_at), 'Horas al cierre': row.closed ? row.hours : null,
    'Plazo de 48 h': slaLabels[row.sla], 'Detalle de cierre': row.closure?.detail || '',
    'Justificación de demora': row.approval?.detail || '', 'Aprobada por': row.approval ? eventAuthor(row.approval) : '',
    'Fecha de aprobación': row.approval ? dateLabel(row.approval.occurred_at) : '',
    Revisión: row.closed ? row.review ? 'Revisado' : 'Pendiente' : 'No aplica',
    'Revisado por': row.review ? eventAuthor(row.review) : '', 'Fecha de revisión': row.review ? dateLabel(row.review.occurred_at) : '', 'Observación de revisión': row.review?.detail || '',
  }));
  const exportExcel = async () => {
    if (!dataReady || !filtered.length || exporting) return;
    setExporting(true); setExportError('');
    try {
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook(); book.creator = 'ORION · BioSystems'; book.created = new Date();
      const sheet = book.addWorksheet('Control de tickets', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
      const data = exportRows();
      sheet.columns = Object.keys(data[0]).map(key => ({ header: key, key, width: /Detalle|Justificación|Observación|Asunto/.test(key) ? 50 : 25 }));
      sheet.addRows(data);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153C48' } };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.length + 1, column: sheet.columnCount } };
      const info = book.addWorksheet('Criterios');
      info.addRows([['Generado', new Date().toLocaleString('es-MX')], ['Casos exportados', filtered.length], ['Vista', view], ['Ámbito', scope], ['Búsqueda', search], ['Autor', owners.find(([id]) => id === owner)?.[1] || 'Todos'], ['Plazo', sla === 'todos' ? 'Todos' : slaLabels[sla as keyof typeof slaLabels]], ['Revisión', review], ['Resultado', outcome], ['Periodo', `${dateField}: ${from || 'sin inicio'} a ${to || 'sin fin'}`], ['SLA', '48 horas corridas desde apertura; por vencer desde las 40 h.'], ['Cumplimiento técnico', 'Solo solucionados con fecha verificable. Justificados excluidos del denominador.'], ['Autor', 'Autor del cierre en cerrados; autor de primera respuesta en abiertos. No equivale a asignación.'], ['Históricos', 'Sin inferir fechas ni clasificaciones.']]);
      info.getColumn(1).width = 27; info.getColumn(2).width = 110;
      const buffer = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ORION_control_tickets_${localDay(new Date().toISOString())}.xlsx`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) { setExportError(`No se pudo exportar: ${(cause as Error).message}`); }
    finally { setExporting(false); }
  };
  const printReport = () => {
    if (!dataReady || !filtered.length) return;
    // Build nodes with textContent: case notes must never become executable HTML.
    const popup = window.open('', '_blank');
    if (!popup) { setExportError('Permite la ventana de impresión para generar el reporte.'); return; }
    popup.document.title = 'ORION · Reporte de control de tickets';
    const style = popup.document.createElement('style');
    style.textContent = '@page{size:A4 landscape;margin:12mm}body{font:10px Arial;color:#163641}h1{font-size:22px}table{border-collapse:collapse;width:100%}th,td{padding:7px;border:1px solid #cbd5dc;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e9f0f3}tr{break-inside:avoid}thead{display:table-header-group}small{color:#486570}';
    popup.document.head.append(style);
    const add = (tag: string, text: string, parent: HTMLElement = popup.document.body) => { const element = popup.document.createElement(tag); element.textContent = text; parent.append(element); return element; };
    add('h1', 'ORION · Control de tickets');
    add('p', `${filtered.length} casos · ${view} · ${scope} · Generado ${new Date().toLocaleString('es-MX')}`);
    add('p', `Periodo por ${dateField}: ${from || 'sin inicio'} a ${to || 'sin fin'} · Autor: ${owners.find(([id]) => id === owner)?.[1] || 'Todos'} · Plazo: ${sla} · Revisión: ${review} · Resultado: ${outcome} · Búsqueda: ${search || 'todas'}`);
    add('p', `Resueltos: ${summary.solved} · Pendientes de revisión: ${summary.reviewPending} · Fuera de plazo sin justificar: ${summary.late} · Demoras justificadas: ${summary.justified}`);
    const table = add('table', ''); const header = add('tr', '', add('thead', '', table));
    ['Caso / cliente', 'Resultado / autor', 'Apertura / primera respuesta', 'Cierre / duración', 'Plazo / revisión', 'Evidencia y justificación'].forEach(label => add('th', label, header));
    const body = add('tbody', '', table);
    for (const row of filtered) {
      const tr = add('tr', '', body);
      [ `${formatCaseNumber(row.ticket)} · ${row.ticketClientLabel} · Serie ${row.ticket.numero_serie_equipo || 'sin dato'} · ${row.ticketPhoneLabel} · ${row.locationLabel}`,
        `${row.outcome} · ${row.owner}`, `${dateLabel(row.ticket.creado_en)} / ${dateLabel(row.response?.occurred_at)}`,
        `${dateLabel(row.closure?.occurred_at)} / ${formatDuration(row.hours)}`, `${slaLabels[row.sla]} · ${row.closed ? row.review ? 'Revisado' : 'Pendiente' : 'En atención'}`,
        [row.closure?.detail, row.approval && `Justificación: ${row.approval.detail} (${eventAuthor(row.approval)}, ${dateLabel(row.approval.occurred_at)})`, row.review && `Revisión: ${row.review.detail} (${eventAuthor(row.review)}, ${dateLabel(row.review.occurred_at)})`].filter(Boolean).join(' · '),
      ].forEach(value => add('td', value, tr));
    }
    add('p', '48 horas corridas desde apertura. Los cierres administrativos no son resoluciones técnicas. No se infieren fechas históricas.');
    popup.focus(); popup.print();
  };

  return <section className="tc-center" aria-label="Centro de control de tickets">
    <header className="tc-header"><div><span className="tc-eyebrow">ORION / SERVICIO</span><h2>Control de tickets</h2><p>Cada cierre, su evidencia. Cada demora, su contexto.</p></div><div className="tc-header-actions"><span className="tc-live">{dataReady ? 'Trazabilidad disponible' : 'Consultando registros'}</span><button type="button" onClick={onChanged} disabled={loading}>Actualizar</button></div></header>
    <div className="tc-tabs" role="group" aria-label="Estado de los casos">{[['abiertos', 'En atención'], ['cerrados', 'Cerrados'], ['todos', 'Todos los casos']].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => filterChange(setView, value)}>{label}<span>{rows.filter(row => (scope === 'todos' || (scope === 'soporte' ? !row.isPlanningTicket : row.isPlanningTicket)) && (value === 'todos' || (value === 'cerrados' ? row.closed : !row.closed))).length}</span></button>)}</div>
    <div className="tc-kpis" aria-label="Indicadores del filtro actual">
      <article><small>Casos en esta vista</small><strong>{dataReady ? summary.total : '—'}</strong><span>{summary.closed} cerrados · {summary.solved} solucionados</span></article>
      <article className="tc-kpi-good"><small>Cumplimiento técnico</small><strong>{dataReady && summary.compliance !== null ? `${summary.compliance.toFixed(0)}%` : '—'}</strong><span>{summary.eligible} soluciones evaluables, sin justificados</span></article>
      <button type="button" className="tc-kpi-warn" onClick={() => filterChange(setReview, review === 'pendiente' ? 'todos' : 'pendiente')} aria-pressed={review === 'pendiente'}><small>Por revisar</small><strong>{dataReady ? summary.reviewPending : '—'}</strong><span>Cierres pendientes de gerencia →</span></button>
      <button type="button" className="tc-kpi-danger" onClick={() => filterChange(setSla, sla === 'vencido' ? 'todos' : 'vencido')} aria-pressed={sla === 'vencido'}><small>Fuera de plazo</small><strong>{dataReady ? summary.late : '—'}</strong><span>Sin justificación aprobada →</span></button>
      <article><small>Demoras justificadas</small><strong>{dataReady ? summary.justified : '—'}</strong><span>Con motivo y aprobación registrados</span></article>
    </div>
    <div className="tc-toolbar"><label className="tc-search">Buscar en el expediente<input type="search" placeholder="Folio, cliente, serie, teléfono o persona…" value={search} onChange={event => filterChange(setSearch, event.target.value)} /></label><div className="tc-export"><button type="button" disabled={!dataReady || !filtered.length || exporting} onClick={() => void exportExcel()}>{exporting ? 'Exportando…' : 'Exportar Excel'}</button><button type="button" disabled={!dataReady || !filtered.length} onClick={printReport}>Imprimir / PDF</button></div></div>
    <div className="tc-filters">
      <label>Ámbito<select aria-label="Ámbito" value={scope} onChange={event => filterChange(setScope, event.target.value)}><option value="soporte">Casos de soporte</option><option value="planeacion">Planeación</option><option value="todos">Todos</option></select></label>
      <label>Autor de atención / cierre<select aria-label="Autor de atención / cierre" value={owner} onChange={event => filterChange(setOwner, event.target.value)}><option value="todos">Todo el personal</option>{owners.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
      <label>Plazo<select aria-label="Plazo" value={sla} onChange={event => filterChange(setSla, event.target.value)}><option value="todos">Todos los plazos</option>{Object.entries(slaLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Revisión<select aria-label="Revisión" value={review} onChange={event => filterChange(setReview, event.target.value)}><option value="todos">Todas</option><option value="pendiente">Pendiente de revisión</option><option value="revisado">Revisado por gerencia</option></select></label>
      <label>Resultado<select aria-label="Resultado" value={outcome} onChange={event => filterChange(setOutcome, event.target.value)}><option value="todos">Todos los resultados</option>{Object.entries(closureReasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="sin_clasificar">Cierre sin clasificar</option></select></label>
      <label>Fecha de<select aria-label="Fecha de" value={dateField} onChange={event => filterChange(setDateField, event.target.value)}><option value="apertura">Apertura</option><option value="cierre">Cierre verificado</option></select></label>
      <label>Desde<input type="date" value={from} onChange={event => filterChange(setFrom, event.target.value)} /></label>
      <label>Hasta<input type="date" value={to} min={from || undefined} onChange={event => filterChange(setTo, event.target.value)} /></label>
    </div>
    <div className="tc-results"><span>{dataReady ? `${filtered.length} casos encontrados` : 'Cargando control…'} · {summary.missing} cierres sin fecha verificable</span><div><label>Ordenar<select aria-label="Ordenar" value={sort} onChange={event => filterChange(setSort, event.target.value)}><option value="reciente">Más recientes</option><option value="duracion">Mayor duración</option><option value="riesgo">Atención prioritaria</option><option value="cliente">Cliente A–Z</option></select></label><button type="button" className="tc-text-button" onClick={reset}>Limpiar filtros</button></div></div>
    {(error || exportError || invalidDates) && <p role="alert" className="tc-error">{invalidDates ? 'La fecha inicial debe ser anterior o igual a la final.' : error || exportError}</p>}
    {!dataReady ? <div className="tc-empty">{error ? 'No se muestran indicadores parciales. Actualiza para volver a consultar.' : 'Reuniendo casos, tiempos y aprobaciones…'}</div> : filtered.length === 0 ? <div className="tc-empty"><strong>No hay casos con estos filtros</strong><p>Amplía el periodo o limpia los filtros para consultar más expedientes.</p><button type="button" onClick={reset}>Limpiar filtros</button></div> : <>
      <div className="tc-table-scroll"><table className="tc-table"><thead><tr><th>Caso / equipo</th><th>Cliente / ubicación</th><th>Resultado / autor</th><th>Apertura / cierre</th><th>Respuesta / duración</th><th>Plazo de servicio</th><th>Revisión</th><th><span className="tc-sr-only">Acciones</span></th></tr></thead><tbody>
        {visible.map(row => <Fragment key={row.ticket.id}><tr className={expanded === row.ticket.id ? 'is-selected' : ''}>
          <td><strong className="tc-folio">{formatCaseNumber(row.ticket)}</strong><span>{row.resolvedEquipment?.modelo || 'Equipo sin modelo'}</span><small>Serie {row.ticket.numero_serie_equipo || 'sin registro'}</small></td>
          <td><strong>{row.ticketClientLabel}</strong><span>{row.locationLabel || 'Ubicación sin registro'}</span><small>{row.ticketPhoneLabel}</small></td>
          <td><strong>{row.outcome}</strong><span>{row.owner}</span><small>{row.closed ? 'Autor del cierre' : 'Autor de primera respuesta'}</small></td>
          <td><span>{dateLabel(row.ticket.creado_en)}</span><small>↓ {dateLabel(row.closure?.occurred_at)}</small></td>
          <td><span>Respuesta: {formatDuration(row.responseHours)}</span><strong>{formatDuration(row.hours)}</strong><small>{row.closed ? 'Hasta el cierre' : 'Transcurrido'}</small></td>
          <td><span className={`tc-badge tc-badge--${row.sla}`}>{slaLabels[row.sla]}</span>{row.hours !== null && <small>{row.hours > 48 ? `${formatDuration(row.hours - 48)} sobre el plazo` : `${formatDuration(48 - row.hours)} de margen`}</small>}</td>
          <td><span className={`tc-review ${row.review ? 'is-reviewed' : ''}`}>{row.closed ? row.review ? '✓ Revisado' : '○ Por revisar' : 'En atención'}</span>{row.review && <small>{eventAuthor(row.review)}</small>}</td>
          <td><button type="button" className="tc-open" aria-expanded={expanded === row.ticket.id} onClick={() => setExpanded(expanded === row.ticket.id ? null : row.ticket.id)}>{expanded === row.ticket.id ? 'Cerrar vista' : 'Ver expediente'}</button></td>
        </tr>{expanded === row.ticket.id && <tr className="tc-expanded"><td colSpan={8}><div className="tc-expanded-heading"><div><span className="tc-eyebrow">EXPEDIENTE DEL CASO</span><h3>{row.ticket.asunto}</h3></div>{canWrite && !row.closed && <button type="button" onClick={() => onDiagnose(row.ticket)}>Diagnóstico y refacciones</button>}</div><TicketCaseDetail ticket={row.ticket} equipment={row.resolvedEquipment} canWrite={canWrite && !row.closed} onChanged={onChanged} /></td></tr>}</Fragment>)}
      </tbody></table></div>
      <div className="tc-pagination"><span>Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} · Las exportaciones incluyen todos los resultados</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></div>
    </>}
    <details className="tc-team"><summary>Desempeño del personal <span>Sobre los filtros actuales</span></summary><p>En cerrados se agrupa por quien registró el cierre; en abiertos, por quien respondió primero. No representa una asignación de responsabilidad.</p><div className="tc-table-scroll"><table className="tc-table"><thead><tr><th>Personal</th><th>Casos</th><th>Solucionados</th><th>Cumplimiento técnico</th><th>Fuera de plazo</th><th>Justificados</th><th>Por revisar</th></tr></thead><tbody>{dataReady && staff.map(person => <tr key={person.id}><td><strong>{person.name}</strong></td><td>{person.summary.total}</td><td>{person.summary.solved}</td><td>{person.summary.compliance === null ? 'Sin base evaluable' : `${person.summary.compliance.toFixed(0)}% (${person.summary.eligible} casos)`}</td><td>{person.summary.late}</td><td>{person.summary.justified}</td><td>{person.summary.reviewPending}</td></tr>)}</tbody></table></div></details>
    <footer className="tc-method"><strong>Criterio de control</strong><p>48 horas corridas desde apertura; alerta desde las 40 h. Cumplimiento técnico = soluciones dentro de plazo / soluciones evaluables, excluyendo demoras justificadas. Los cierres administrativos e históricos sin clasificación no cuentan como soluciones. Primera respuesta promedio: {dataReady ? formatDuration(summary.averageResponse) : '—'}.</p></footer>
  </section>;
}
