import { useCallback, useState } from 'react';
import { createSupremoLaunchSession, getSupremoLaunchDisabledMessage, isSupremoLaunchEnabled } from '../../components/supremoApi';
import type { RemoteLaunchFeedback } from './monitoringDerivations';

const SUPREMO_LAUNCH_TIMEOUT_MS = 1800;

/** Intenta abrir el cliente nativo; el cambio de foco es una heurística, no prueba de sesión remota exitosa. */
const attemptSupremoClientLaunch = async (launchUrl: string) =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finalize = (didOpen: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      resolve(didOpen);
    };
    const handleBlur = () => finalize(true);
    const handleVisibilityChange = () => {
      if (document.hidden) finalize(true);
    };
    window.addEventListener('blur', handleBlur, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    try {
      window.location.assign(launchUrl);
    } catch {
      finalize(false);
      return;
    }
    timeoutId = window.setTimeout(() => {
      finalize(document.hidden || !document.hasFocus());
    }, SUPREMO_LAUNCH_TIMEOUT_MS);
  });

interface LaunchState {
  equipmentId: string | null;
  launching: boolean;
  feedback: RemoteLaunchFeedback | null;
}

const IDLE: LaunchState = { equipmentId: null, launching: false, feedback: null };

/**
 * Lanzamiento remoto con Supremo para el equipo seleccionado. El estado va ligado al id del equipo:
 * al cambiar de selección se descarta sin efectos ni renders extra.
 */
export function useSupremoLaunch(equipment: { id: string; serial: string; hasSupremoLink: boolean } | null) {
  const [state, setState] = useState<LaunchState>(IDLE);
  const equipmentId = equipment?.id ?? null;
  const current = state.equipmentId === equipmentId ? state : IDLE;

  const launch = useCallback(async () => {
    if (!equipment) return;
    const id = equipment.id;
    if (!equipment.hasSupremoLink) {
      setState({ equipmentId: id, launching: false, feedback: { tone: 'warning', message: 'Este equipo no tiene una conexión de Supremo configurada todavía.' } });
      return;
    }
    if (!isSupremoLaunchEnabled()) {
      setState({ equipmentId: id, launching: false, feedback: { tone: 'error', message: getSupremoLaunchDisabledMessage() } });
      return;
    }
    setState({ equipmentId: id, launching: true, feedback: null });
    try {
      const launchSession = await createSupremoLaunchSession(id);
      const didOpenClient = await attemptSupremoClientLaunch(launchSession.launchUrl || '');
      setState({
        equipmentId: id,
        launching: false,
        feedback: didOpenClient
          ? { tone: 'success', message: `Se envió la conexión remota para ${launchSession.equipmentLabel || equipment.serial}.` }
          : { tone: 'warning', message: 'Orion intentó abrir Supremo, pero esta computadora no confirmó el cambio de foco. Revisa que Supremo esté instalado y que el sistema permita enlaces supremo://.' },
      });
    } catch (error) {
      setState({ equipmentId: id, launching: false, feedback: { tone: 'error', message: error instanceof Error ? error.message : 'No fue posible iniciar la conexión remota.' } });
    }
  }, [equipment]);

  return { launching: current.launching, feedback: current.feedback, launch, enabled: isSupremoLaunchEnabled() };
}
