import { useEffect, useState } from 'react';
import { fetchPlanningSheet, type PlanningSheetSnapshot } from './planningSheetSource';

// Live read of the official workbook. If Google cannot be reached the page keeps working without it.
export default function usePlanningSheet() {
  const [snapshot, setSnapshot] = useState<PlanningSheetSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    fetchPlanningSheet()
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((error) => console.warn('No se pudo leer la hoja oficial de planeación', error));
    return () => {
      active = false;
    };
  }, []);

  return snapshot;
}
