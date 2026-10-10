import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import type { BplSerialSummary } from './bplEvents';
import { loadBplSerialEvents } from './bplEventsData';
import { CURRENT_REAGENT_BUCKET_MONTH, readNumericValue } from './monitorFormat';
import type { MonitoringEquipment, ReagentConsumptionDetailRow, ReagentConsumptionSummaryRow } from './monitoringDerivations';

const EMPTY_ROWS: ReagentConsumptionDetailRow[] = [];

/** Fila mensual en cero: solo presentación, no escribe ni confirma ausencia de actividad. */
const zeroSummary = (serial: string, bucketMonth: string, model: string | null, family: string | null): ReagentConsumptionSummaryRow => ({
  numero_serie: serial,
  bucket_month: bucketMonth,
  modelo: model,
  modelo_familia: family,
  pruebas_registradas: 0,
  muestras_paciente: 0,
  blancos: 0,
  calibraciones: 0,
  controles: 0,
  pruebas_distintas: 0,
  pruebas_distintas_con_precio: 0,
  pruebas_distintas_sin_precio: 0,
  pruebas_con_precio: 0,
  pruebas_sin_precio: 0,
  valor_estimado_total_sin_iva: 0,
  valor_estimado_total_con_iva: 0,
  valor_estimado_pacientes_sin_iva: 0,
  valor_estimado_pacientes_con_iva: 0,
  valor_estimado_total_sin_iva_min: 0,
  valor_estimado_total_sin_iva_max: 0,
  valor_estimado_total_con_iva_min: 0,
  valor_estimado_total_con_iva_max: 0,
  first_event_at: null,
  last_event_at: null,
});

interface RowsState {
  key: string | null;
  rows: ReagentConsumptionDetailRow[];
  error: string | null;
}

interface BplDetailState {
  serial: string | null;
  summary: BplSerialSummary | null;
  error: string | null;
}

/**
 * Detalle del equipo seleccionado: mes de consumo, filas por prueba (solo cuando la sección está abierta)
 * y evidencia BPL con payload. Todo el estado va ligado a la serie o al mes: si no coincide con la
 * selección vigente se trata como ausente, sin efectos de reinicio.
 */
export function useEquipmentDetail(equipment: MonitoringEquipment | null, options: { loadReagentRows: boolean }) {
  const equipmentId = equipment?.id ?? null;
  const serial = equipment?.serial ?? null;

  const [monthState, setMonthState] = useState<{ id: string | null; month: string }>({ id: null, month: CURRENT_REAGENT_BUCKET_MONTH });
  const bucketMonth = monthState.id === equipmentId ? monthState.month : CURRENT_REAGENT_BUCKET_MONTH;
  const selectBucketMonth = useCallback((month: string) => setMonthState({ id: equipmentId, month }), [equipmentId]);

  const summary = useMemo(
    () => equipment?.reagentSummaries.find((row) => row.bucket_month === bucketMonth) ?? null,
    [equipment, bucketMonth],
  );

  // Añade un mes actual visual en cero si falta.
  const monthRows = useMemo(() => {
    if (!equipment) return [];
    const rows = equipment.reagentSummaries;
    if (rows.some((row) => row.bucket_month === CURRENT_REAGENT_BUCKET_MONTH)) return rows;
    return [zeroSummary(equipment.serial, CURRENT_REAGENT_BUCKET_MONTH, equipment.model, rows[0]?.modelo_familia || null), ...rows];
  }, [equipment]);

  // Respaldo de presentación para el mes actual cuando solo existen meses anteriores.
  const summaryDisplay = useMemo(() => {
    if (summary) return summary;
    if (!equipment?.reagentSummaries.length || bucketMonth !== CURRENT_REAGENT_BUCKET_MONTH) return null;
    const latest = equipment.reagentSummaries[0];
    return zeroSummary(equipment.serial, bucketMonth, equipment.model || latest.modelo, latest.modelo_familia);
  }, [equipment, bucketMonth, summary]);

  const peakTests = useMemo(() => Math.max(1, ...monthRows.map((row) => readNumericValue(row.pruebas_registradas))), [monthRows]);

  // Filas por prueba: solo con la sección abierta; se revalidan en silencio si cambia el resumen mensual.
  const marker = summary ? `${summary.last_event_at || ''}|${summary.pruebas_registradas ?? ''}` : null;
  const rowsKey = serial && marker !== null && options.loadReagentRows ? `${serial}|${bucketMonth}` : null;
  const [rowsState, setRowsState] = useState<RowsState>({ key: null, rows: EMPTY_ROWS, error: null });

  useEffect(() => {
    if (!rowsKey || !serial) return undefined;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('v_equipment_reagent_consumption_detail')
        .select(
          'numero_serie,bucket_month,modelo,modelo_familia,test_name,test_name_normalizado,descripcion_catalogo_normalizada,reactivo_codigo_referencia,reactivo_descripcion_referencia,presentacion_referencia,rendimiento_referencia,rendimiento_total,rendimiento_util,rendimiento_util_seguro,presentaciones_catalogo,match_source,tiene_precio,pruebas_registradas,muestras_paciente,blancos,calibraciones,controles,first_event_at,last_event_at,costo_prueba_referencia_con_iva,valor_estimado_total_con_iva,valor_estimado_pacientes_con_iva,valor_estimado_total_con_iva_min,valor_estimado_total_con_iva_max',
        )
        .eq('numero_serie', serial)
        .eq('bucket_month', bucketMonth)
        .order('pruebas_registradas', { ascending: false })
        .order('test_name', { ascending: true })
        .range(0, 199);
      if (cancelled) return;
      setRowsState({
        key: rowsKey,
        rows: error ? EMPTY_ROWS : ((data || []) as ReagentConsumptionDetailRow[]),
        error: error ? `No fue posible leer las pruebas registradas: ${error.message}` : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [rowsKey, serial, bucketMonth, marker]);

  const rowsMatch = rowsState.key === rowsKey;
  const rawRows = rowsMatch ? rowsState.rows : EMPTY_ROWS;
  // Orden por valor estimado, luego cantidad y nombre; no calcula rentabilidad neta.
  const reagentRows = useMemo(
    () =>
      [...rawRows].sort((left, right) => {
        const valueDiff = readNumericValue(right.valor_estimado_total_con_iva) - readNumericValue(left.valor_estimado_total_con_iva);
        if (valueDiff !== 0) return valueDiff;
        const countDiff = readNumericValue(right.pruebas_registradas) - readNumericValue(left.pruebas_registradas);
        if (countDiff !== 0) return countDiff;
        return left.test_name.localeCompare(right.test_name, 'es-MX');
      }),
    [rawRows],
  );

  // Evidencia BPL con payload de la serie seleccionada; se repite solo si la serie o su evidencia cambian.
  const bplMarker = equipment?.bpl ? `${equipment.bpl.lastDetectedAt || ''}|${equipment.bpl.lastEventAt || ''}|${equipment.bpl.events.length}` : 'none';
  const [detailState, setDetailState] = useState<BplDetailState>({ serial: null, summary: null, error: null });

  useEffect(() => {
    if (!serial) return undefined;
    let cancelled = false;
    void loadBplSerialEvents(serial).then((result) => {
      if (cancelled) return;
      setDetailState({ serial, summary: result.summary, error: result.error ? `La evidencia BPL detallada no respondió: ${result.error}` : null });
    });
    return () => {
      cancelled = true;
    };
  }, [serial, bplMarker]);

  const detailMatch = detailState.serial === serial;

  return {
    bucketMonth,
    selectBucketMonth,
    summary,
    summaryDisplay,
    hasMonthData: Boolean(summary),
    monthRows,
    peakTests,
    reagentRows,
    loadingRows: Boolean(rowsKey) && !rowsMatch,
    rowsError: rowsMatch ? rowsState.error : null,
    bplDetail: detailMatch ? detailState.summary : null,
    loadingBpl: Boolean(serial) && !detailMatch,
    bplError: detailMatch ? detailState.error : null,
  };
}
