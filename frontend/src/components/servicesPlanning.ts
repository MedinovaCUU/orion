export const METADATA_DELIMITER = '[METADATA_PLANEACION]';

export interface PlanningMetadata {
  fecha_tentativa?: string;
  fecha_acordada?: string;
  requiere_vuelos?: boolean;
  requiere_auto?: boolean;
  dias_laborados?: number[];
  ingeniero_csv?: string;
  travel_request_id?: string;
  travel_status?: string;
  travel_priority?: string;
  service_report_id?: string;
  service_report_status?: string;
}

export interface ProfileSummary {
  id: string;
  nombre_completo: string | null;
  employee_number?: string | null;
  telefono?: string | null;
  territorio?: string | null;
  rol?: string | null;
  recibe_tickets?: boolean | null;
  trainer_ingenieria?: boolean | null;
  trainer_quimica?: boolean | null;
}

export interface ClientSummary {
  id?: number;
  razon_social?: string | null;
  persona_contacto?: string | null;
  telefono?: string | null;
}

export interface EquipmentSummary {
  id?: string;
  numero_serie: string;
  modelo?: string | null;
  software?: string | null;
  firmware?: string | null;
  pais?: string | null;
  estado?: string | null;
  ciudad?: string | null;
  municipio?: string | null;
  colonia?: string | null;
  direccion?: string | null;
  codigo_postal?: string | null;
  clientes?: ClientSummary | null;
}

export interface PendingServiceTicket {
  id: string;
  user_id: string | null;
  asunto: string;
  descripcion: string | null;
  estado: string;
  creado_en: string;
  numero_serie_equipo?: string | null;
  profiles?: {
    nombre_completo?: string | null;
  } | null;
}

export interface HistoricalRefaccion {
  cantidad: number;
  refacciones_catalogo?: {
    descripcion?: string | null;
    codigo_refaccion?: string | null;
  } | null;
}

export interface HistoricalServiceRecord {
  id: string;
  ticket_id?: string | null;
  id_legacy?: number | null;
  no_serie?: string | null;
  cda?: string | null;
  cds?: string | null;
  motivo?: string | null;
  fecha_servicio?: string | null;
  creado_en: string;
  profiles?: {
    nombre_completo?: string | null;
  } | null;
  servicios_refacciones?: HistoricalRefaccion[] | null;
  averias_catalogo?: {
    detalle_averia?: string | null;
  } | null;
  soluciones_catalogo?: {
    detalle_solucion?: string | null;
  } | null;
}

export interface InlinePlanningForm {
  tipo?: string;
  plataforma?: string;
  cliente?: string;
  serie?: string;
  observaciones?: string;
  ingeniero_id?: string;
}

const parsePlanningBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (['true', '1', 'si', 'sí', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
};

export const extractPlaneacionMeta = (desc: string | null | undefined): PlanningMetadata | null => {
  if (!desc || typeof desc !== 'string' || !desc.includes(METADATA_DELIMITER)) {
    return null;
  }

  try {
    const raw = JSON.parse(
      desc.substring(desc.indexOf(METADATA_DELIMITER) + METADATA_DELIMITER.length).trim(),
    ) as Record<string, unknown>;

    const requiereVuelos = parsePlanningBoolean(raw.requiere_vuelos);
    const requiereAuto = parsePlanningBoolean(raw.requiere_auto);

    return {
      ...raw,
      ...(requiereVuelos === undefined ? {} : { requiere_vuelos: requiereVuelos }),
      ...(requiereAuto === undefined ? {} : { requiere_auto: requiereAuto }),
    } as PlanningMetadata;
  } catch {
    return null;
  }
};

export const stripPlaneacionMeta = (desc: string | null | undefined) => {
  let clean =
    desc && typeof desc === 'string' && desc.includes(METADATA_DELIMITER)
      ? desc.substring(0, desc.indexOf(METADATA_DELIMITER)).trim()
      : desc || '';

  const obsMarker = 'Observaciones:';
  if (clean.includes(obsMarker)) {
    clean = clean.substring(clean.indexOf(obsMarker) + obsMarker.length).trim();
  }

  return clean;
};

export const buildWeeklyMonthBuckets = (monthIndex: number, months: string[]) => {
  const buckets: Record<string, PendingServiceTicket[]> = {};
  const year = new Date().getFullYear();
  const cursor = new Date(year, monthIndex, 1);

  while (cursor.getMonth() === monthIndex) {
    if (cursor.getDay() === 1) {
      const startDay = cursor.getDate().toString().padStart(2, '0');
      const endDate = new Date(cursor);
      endDate.setDate(endDate.getDate() + 4);
      const endDay = endDate.getDate().toString().padStart(2, '0');
      const label =
        endDate.getMonth() !== monthIndex
          ? `${startDay} AL ${endDay} ${months[monthIndex]}/${months[endDate.getMonth()]}`
          : `${startDay} AL ${endDay} ${months[monthIndex]}`;

      buckets[label.toUpperCase()] = [];
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
};
