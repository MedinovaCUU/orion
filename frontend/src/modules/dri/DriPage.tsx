import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DriDashboard from './components/DriDashboard';
import './dri.css';

/**
 * Entrada del módulo DRI. Monitoreo llega con `?serial=…&bpl=apply` (proyecta la evidencia BPL sin clic
 * adicional) o `&preload=all` (proyecta también Monitoreo y el último SAT de la serie). La intención de la URL
 * se consume UNA sola vez: `bpl`/`preload` se borran de la dirección y `serial` se conserva, de modo que al
 * recargar la página la serie sigue precargada pero ninguna fuente queda aplicada hasta pulsar "Aplicar".
 */
export default function DriPage({
  subPermissions,
  previewMode = false,
}: {
  subPermissions?: string[];
  previewMode?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  // La petición se captura en el primer render; borrar los parámetros después no la pierde.
  const [request] = useState(() => ({
    serial: searchParams.get('serial')?.trim() || '',
    apply: (searchParams.get('preload') === 'all' ? 'all' : searchParams.get('bpl') === 'apply' ? 'bpl' : 'none') as 'none' | 'bpl' | 'all',
  }));

  useEffect(() => {
    if (previewMode) return;
    if (!searchParams.has('bpl') && !searchParams.has('preload')) return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('bpl');
        next.delete('preload');
        return next;
      },
      { replace: true },
    );
  }, [previewMode, searchParams, setSearchParams]);

  return (
    <DriDashboard
      subPermissions={subPermissions}
      previewMode={previewMode}
      requestedSerial={request.serial}
      requestedApply={request.apply}
    />
  );
}
