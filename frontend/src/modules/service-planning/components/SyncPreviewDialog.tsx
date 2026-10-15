import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlanningSyncChange, ServicePlanningSyncSummary } from '../helpers/servicePlanningSync';

// Sincronizar reads the official sheet and shows what it would do before doing it. Activities edited in
// Orion are never overwritten unless the person ticks "usar la hoja" for that row.

function ChangeList({ title, items, empty }: { title: string; items: PlanningSyncChange[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <section className="planning-sync__group">
      <h4>
        {title} <span>{items.length}</span>
      </h4>
      {items.length ? (
        <ul>
          {items.slice(0, 40).map((item, index) => (
            <li key={`${item.id || item.subject}-${index}`}>
              <strong>{item.weekLabel.toLowerCase()}</strong> · {item.subject.replace(/^\[PLAN\]\s*/, '')}
              {item.serial ? ` · NS ${item.serial}` : ''}
              {item.detail ? <small>{item.detail}</small> : null}
            </li>
          ))}
          {items.length > 40 ? <li>… y {items.length - 40} más</li> : null}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

export default function SyncPreviewDialog({
  preview,
  busy,
  error,
  onApply,
  onClose,
}: {
  preview: ServicePlanningSyncSummary | null;
  busy: boolean;
  error: string | null;
  onApply: (useSheetFor: string[]) => void;
  onClose: () => void;
}) {
  const [useSheet, setUseSheet] = useState<Set<string>>(new Set());
  const absenceChanges = preview ? preview.absences.added.length + preview.absences.removed.length : 0;
  const total = preview ? preview.inserted.length + preview.updated.length + preview.removed.length + preview.flagged.length + absenceChanges : 0;
  return createPortal(
    <div className="pgrid-modal" role="presentation">
      <div className="pgrid-modal__box planning-sync" role="dialog" aria-modal="true" aria-label="Sincronizar con la hoja oficial">
        <header>
          <span className="planning-eyebrow">Hoja oficial</span>
          <h3>Sincronizar planeación</h3>
          {preview ? <p>{preview.sheetTitle} · {preview.readTabs.join(', ').toLowerCase()} · desde la semana actual</p> : null}
        </header>
        {error ? <p role="alert" className="planning-sync__error">{error}</p> : null}
        {!preview && !error ? <p>Leyendo la hoja oficial…</p> : null}
        {preview ? (
          <div className="planning-sync__body">
            <ChangeList title="Nuevas" items={preview.inserted} />
            <ChangeList title="Se actualizan" items={preview.updated} />
            <ChangeList title="Se retiran" items={preview.removed} />
            <ChangeList title="Se marcan para revisar (ya tenían viaje o reporte)" items={preview.flagged} />
            {preview.protectedRows.length ? (
              <section className="planning-sync__group planning-sync__group--protected">
                <h4>
                  Editadas en Orion: se conservan <span>{preview.protectedRows.length}</span>
                </h4>
                <p>La hoja dice otra cosa. Marca solo las que quieras reemplazar por la versión de la hoja.</p>
                <ul>
                  {preview.protectedRows.map((item, index) => (
                    <li key={`${item.id}-${index}`}>
                      <label className="pgrid-check">
                        <input
                          type="checkbox"
                          checked={Boolean(item.id && useSheet.has(item.id))}
                          onChange={(event) =>
                            setUseSheet((current) => {
                              const next = new Set(current);
                              if (!item.id) return next;
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            })
                          }
                        />
                        <span>
                          <strong>{item.weekLabel.toLowerCase()}</strong> · {item.subject.replace(/^\[PLAN\]\s*/, '')}
                          {item.detail ? <small>{item.detail}</small> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {preview.absences.added.length || preview.absences.removed.length || preview.absences.protectedRows.length || preview.absences.unrecognised.length || preview.absences.withoutProfile.length ? (
              <section className="planning-sync__group">
                <h4>
                  Ausencias (TXT, vacaciones…) <span>{preview.absences.added.length + preview.absences.removed.length}</span>
                </h4>
                <ul>
                  {preview.absences.added.map((text) => <li key={`a-${text}`}>Nueva: {text}</li>)}
                  {preview.absences.removed.map((text) => <li key={`r-${text}`}>Se retira: {text}</li>)}
                  {preview.absences.protectedRows.map((text) => <li key={`p-${text}`}>Se conserva: {text}</li>)}
                  {preview.absences.withoutProfile.map((text) => (
                    <li key={`w-${text}`}>
                      Revisar el nombre (no hay perfil en Orion con ese nombre): <small>{text}</small>
                    </li>
                  ))}
                  {preview.absences.unrecognised.map((text) => (
                    <li key={`u-${text}`}>
                      Nota sin persona, no se importa: <small>{text}</small>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {!preview.absences.available ? <p>Las ausencias de la hoja se guardarán cuando se aplique la actualización de base de datos.</p> : null}
            {!total && !absenceChanges && !preview.protectedRows.length ? <p>Orion ya coincide con la hoja oficial. No hay nada que aplicar.</p> : null}
          </div>
        ) : null}
        <div className="pgrid-modal__actions">
          <button type="button" className="pgrid-link" onClick={onClose} disabled={busy}>Cancelar</button>
          <button
            type="button"
            className="pgrid-button"
            disabled={busy || !preview || (!total && !useSheet.size)}
            onClick={() => onApply(Array.from(useSheet))}
          >
            {busy ? 'Aplicando…' : `Aplicar ${total + useSheet.size} cambio${total + useSheet.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
