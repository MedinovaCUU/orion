import { useEffect, useState } from 'react';
import DriDashboard from './components/DriDashboard';
import SatReportImporter from '../sat-report/SatReportImporter';
import { loadLatestEquipmentQc, loadLatestSatReport } from '../sat-report/satReportData';
import type { SatReportSummary } from '../sat-report/satReportTypes';
import './dri.css';

export default function DriPage({ subPermissions }: { subPermissions?: string[] }) {
  const [satContext, setSatContext] = useState<SatReportSummary | null>(null);
  const [applySatContext, setApplySatContext] = useState(false);

  useEffect(() => {
    let active = true;
    void loadLatestSatReport().then(async (summary) => {
      if (!summary) {
        if (active) setSatContext(null);
        return;
      }
      const qcResults = await loadLatestEquipmentQc(summary.serialNumber);
      if (active) setSatContext({ ...summary, qcResults: qcResults.length ? qcResults : summary.qcResults || [] });
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="dri-sat-context card">
        <div>
          <span>Contexto SAT</span>
          <strong>
            {satContext
              ? `${satContext.equipmentModel} · ${satContext.serialNumber} · ${satContext.findings.distinctLots} lotes detectados`
              : 'Carga un reporte real para preparar el diagnóstico'}
          </strong>
          <p>
            Serie, fechas, lotes, calibraciones, controles y eventos se incorporan como evidencia; no se convierten automáticamente en una falla confirmada.
          </p>
        </div>
        <div className="dri-sat-context__actions">
          {satContext ? (
            <button type="button" className="sat-importer__compact-trigger" onClick={() => setApplySatContext(true)} disabled={applySatContext}>
              {applySatContext ? 'Contexto aplicado' : 'Aplicar al diagnóstico'}
            </button>
          ) : null}
          <SatReportImporter
            compact
            onImported={(summary) => {
              void loadLatestEquipmentQc(summary.serialNumber).then((qcResults) => {
                setSatContext({ ...summary, qcResults: qcResults.length ? qcResults : summary.qcResults || [] });
                setApplySatContext(true);
              });
            }}
          />
        </div>
      </section>
      <DriDashboard subPermissions={subPermissions} satContext={applySatContext ? satContext : null} />
    </>
  );
}
