import { useEffect, useState } from 'react';
import { fetchEquipmentSupremoStatus, formatSupremoId, isValidSupremoId, registerEquipmentSupremo, type EquipmentSupremoStatus } from './supremoMetricApi';

// In-person service report: tells the engineer whether the equipment already has Supremo and lets them
// register the ID installed during the visit. Renders nothing while the metric is switched off.
export default function SupremoVisitCheck({ serial }: { serial: string }) {
  const [status, setStatus] = useState<EquipmentSupremoStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const trimmed = serial.trim();

  useEffect(() => {
    setStatus(null); setError(''); setSaved(false); setDraft('');
    if (!trimmed) return;
    let active = true;
    const timer = window.setTimeout(() => {
      fetchEquipmentSupremoStatus(trimmed)
        .then(result => { if (active) setStatus(result); })
        .catch(() => { if (active) setStatus(null); });
    }, 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [trimmed]);

  if (!trimmed || !status?.active) return null;

  const register = async () => {
    setBusy(true); setError('');
    try { setStatus(await registerEquipmentSupremo(trimmed, draft)); setSaved(true); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  if (status.registered) {
    return <div className="service-report-supremo is-ok" role="status">
      <strong>Supremo registrado · ID {formatSupremoId(status.supremo_id)}</strong>
      <p>{saved ? 'Quedó registrado en el equipo. Esta visita cuenta como positiva.' : 'El equipo ya tiene Supremo: esta visita cuenta como positiva.'}</p>
    </div>;
  }
  if (status.exempt) {
    return <div className="service-report-supremo" role="status">
      <strong>Supremo no requerido</strong>
      <p>Administración justificó que este equipo no lleva Supremo; la visita no cuenta para la métrica.</p>
    </div>;
  }
  if (!status.in_catalog) {
    return <div className="service-report-supremo is-warn" role="status">
      <strong>Equipo fuera del catálogo</strong>
      <p>Este número de serie no está en Equipos, así que no se puede registrar Supremo y la visita contará como negativa. Da de alta el equipo en Equipos y registra ahí su ID de Supremo.</p>
    </div>;
  }
  const cleaned = draft.replace(/\D/g, '');
  const days = status.grace_days ?? 0;
  return <div className="service-report-supremo is-warn">
    <strong>Este equipo no tiene Supremo registrado</strong>
    <p>
      {status.supremo_id ? `Tiene capturado el ID ${formatSupremoId(status.supremo_id)}, pero ${isValidSupremoId(status.supremo_id) ? 'está deshabilitado' : 'no es un ID válido de 9 dígitos'}. ` : ''}
      Instala Supremo en la computadora del equipo y captura su ID. Tienes hasta {days === 0 ? 'el final del día de la visita' : `${days} ${days === 1 ? 'día' : 'días'} después de la visita`}; si no, la visita cuenta como negativa.
    </p>
    <div className="service-report-supremo__form">
      <input className="input-field" inputMode="numeric" autoComplete="off" placeholder="ID de Supremo (9 dígitos)" aria-label="ID de Supremo" value={draft}
        onChange={event => setDraft(event.target.value)} />
      <button type="button" className="button-primary" disabled={busy || cleaned.length !== 9} onClick={() => void register()}>
        {busy ? 'Registrando…' : 'Registrar Supremo'}
      </button>
    </div>
    {draft && cleaned.length !== 9 && <p className="service-report-supremo__hint">El ID de Supremo tiene 9 dígitos ({cleaned.length} capturados).</p>}
    {error && <p role="alert" className="service-report-supremo__error">{error}</p>}
  </div>;
}
