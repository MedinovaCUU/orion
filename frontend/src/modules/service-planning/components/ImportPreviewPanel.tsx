import type { ImportPreviewState, ServicePlanningPermissions } from '../types/servicePlanning.types';

interface ImportPreviewPanelProps {
  preview: ImportPreviewState;
  permissions: ServicePlanningPermissions;
  visible: boolean;
  onClose: () => void;
  onImport: () => void;
}

export default function ImportPreviewPanel({ preview, permissions, visible, onClose, onImport }: ImportPreviewPanelProps) {
  if (!visible) {
    return null;
  }

  return (
    <section className="planning-panel planning-panel--import">
      <div className="planning-panel__header">
        <div>
          <span className="planning-eyebrow">Importacion futura</span>
          <h3>Vista previa de Excel / CSV</h3>
        </div>
        <button type="button" className="button-primary inactive" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <div className="planning-import-kpis">
        <article><strong>{preview.detectedRows}</strong><span>Detectados</span></article>
        <article><strong>{preview.validRows}</strong><span>Validos</span></article>
        <article><strong>{preview.warningRows}</strong><span>Advertencias</span></article>
        <article><strong>{preview.errorRows}</strong><span>Errores</span></article>
        <article><strong>{preview.duplicates}</strong><span>Duplicados</span></article>
      </div>

      <div className="planning-import-list">
        {preview.items.map((item) => (
          <div key={item.id} className={`planning-import-item planning-import-item--${item.status}`}>
            <div>
              <strong>{item.locality}</strong>
              <p>
                {item.platform} · {item.serialNumber || 'NS pendiente'}
              </p>
            </div>
            <span>{item.message}</span>
          </div>
        ))}
      </div>

      <div className="planning-panel__footer">
        <span>{preview.sourceFileName}</span>
        <button type="button" className="button-primary" disabled={!permissions.canImport} onClick={onImport}>
          Confirmar importacion
        </button>
      </div>
    </section>
  );
}
