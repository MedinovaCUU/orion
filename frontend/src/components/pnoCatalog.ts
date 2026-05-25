export type PnoProcedureKind = 'ajuste' | 'limpieza' | 'diagnostico' | 'verificacion' | 'mantenimiento';
export type PnoProcedureStatus = 'borrador' | 'activo' | 'obsoleto';

export interface PnoProcedure {
  id: string;
  code: string;
  title: string;
  procedureKind: PnoProcedureKind;
  equipmentFamily: string;
  failureFocus: string;
  summary: string;
  objective: string;
  scope: string;
  estimatedDuration: string;
  tools: string[];
  materials: string[];
  safetyNotes: string[];
  steps: string[];
  validationPoints: string[];
  referenceNotes: string[];
  tags: string[];
  version: string;
  status: PnoProcedureStatus;
  createdAt?: string;
  updatedAt?: string;
  isStarter?: boolean;
}

export const PNO_KIND_LABELS: Record<PnoProcedureKind, string> = {
  ajuste: 'Ajuste',
  limpieza: 'Limpieza',
  diagnostico: 'Diagnóstico',
  verificacion: 'Verificación',
  mantenimiento: 'Mantenimiento',
};

export const PNO_STATUS_LABELS: Record<PnoProcedureStatus, string> = {
  borrador: 'Borrador',
  activo: 'Activo',
  obsoleto: 'Obsoleto',
};

export const PNO_KIND_OPTIONS: Array<{ value: PnoProcedureKind; label: string; helper: string }> = [
  { value: 'ajuste', label: 'Ajuste', helper: 'Secuencias para calibrar, alinear o estabilizar el equipo.' },
  { value: 'limpieza', label: 'Limpieza', helper: 'Rutinas de saneamiento técnico, arrastre y aseo funcional.' },
  { value: 'diagnostico', label: 'Diagnóstico', helper: 'Rutas de revisión para fallas, síntomas e inspección escalonada.' },
  { value: 'verificacion', label: 'Verificación', helper: 'Pruebas de confirmación después de un cambio o intervención.' },
  { value: 'mantenimiento', label: 'Mantenimiento', helper: 'Secuencias recurrentes o programadas de conservación.' },
];

export const PNO_STATUS_OPTIONS: Array<{ value: PnoProcedureStatus; label: string }> = [
  { value: 'activo', label: 'Activo' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'obsoleto', label: 'Obsoleto' },
];

const nowIso = new Date().toISOString();

export const PNO_STARTER_PROCEDURES: PnoProcedure[] = [
  {
    id: 'starter-pno-aju-001',
    code: 'PNO-AJU-001',
    title: 'Ajuste de fotometría y estabilidad de línea base',
    procedureKind: 'ajuste',
    equipmentFamily: 'BA-400 / Química clínica',
    failureFocus: 'Deriva de línea base, absorbancia fuera de rango o repetibilidad baja.',
    summary:
      'Procedimiento para recuperar estabilidad fotométrica y dejar el analizador liberado con evidencia objetiva de control.',
    objective:
      'Restablecer la respuesta fotométrica del equipo y confirmar que la línea base quede estable antes de liberar la operación.',
    scope:
      'Aplicable cuando el analizador presenta absorbancias fuera de límite, ruido elevado, deriva o comportamiento errático en pruebas de control.',
    estimatedDuration: '45 a 60 min',
    tools: [
      'Laptop de servicio con software vigente',
      'Control o calibrador para validación',
      'Juego de herramienta fina y linterna',
      'Paños sin pelusa',
    ],
    materials: [
      'Alcohol isopropílico para limpieza controlada',
      'Bitácora de parámetros antes y después del ajuste',
    ],
    safetyNotes: [
      'Confirmar modo seguro antes de intervenir partes ópticas o cubeta.',
      'No forzar conectores ni tornillería de ajuste.',
      'Registrar valores originales antes de modificar parámetros.',
    ],
    steps: [
      'Confirmar el síntoma con corridas de control y documentar absorbancias, ruido y mensajes del sistema.',
      'Inspeccionar cubeta, tren óptico y asiento mecánico para descartar suciedad, juego o daño visible.',
      'Limpiar superficies críticas de lectura siguiendo el procedimiento de limpieza autorizado.',
      'Ajustar la fotometría conforme a manual y registrar cada modificación aplicada.',
      'Ejecutar verificación funcional con control interno y comparar contra criterio de aceptación.',
    ],
    validationPoints: [
      'La línea base se mantiene estable durante la corrida de prueba.',
      'Los resultados de control quedan dentro de criterio operativo.',
      'No se presentan alarmas o mensajes asociados durante la validación.',
    ],
    referenceNotes: [
      'Manual de servicio del BA-400: sección óptica y validación posterior a ajuste.',
      'Formato de reporte técnico Orion para trazabilidad de intervención.',
    ],
    tags: ['fotometría', 'línea base', 'estabilidad', 'control'],
    version: '1.0',
    status: 'activo',
    createdAt: nowIso,
    updatedAt: nowIso,
    isStarter: true,
  },
  {
    id: 'starter-pno-lim-001',
    code: 'PNO-LIM-001',
    title: 'Limpieza técnica de cubeta, agujas y tren óptico',
    procedureKind: 'limpieza',
    equipmentFamily: 'BA-400 / Química clínica',
    failureFocus: 'Arrastre, suciedad visible, lectura degradada o mantenimiento correctivo.',
    summary:
      'Rutina normalizada para limpiar componentes de proceso y lectura sin comprometer alineaciones ni materiales sensibles.',
    objective:
      'Eliminar residuos, biocarga y suciedad técnica que afecten precisión, arrastre o estabilidad analítica.',
    scope:
      'Aplicable en limpiezas correctivas, preventivas y antes de repetir diagnósticos cuando hay sospecha de contaminación o depósito interno.',
    estimatedDuration: '30 a 45 min',
    tools: [
      'EPP básico y contenedor de descarte',
      'Paños sin pelusa y aplicadores finos',
      'Linterna de inspección',
      'Kit de limpieza autorizado por fabricante',
    ],
    materials: [
      'Agua desionizada',
      'Solución de limpieza aprobada',
      'Alcohol isopropílico cuando aplique por manual',
    ],
    safetyNotes: [
      'Bloquear movimiento automático antes de intervenir agujas o módulos.',
      'No usar abrasivos ni fibras que rayen superficies de lectura.',
      'Secar completamente antes de reiniciar el equipo.',
    ],
    steps: [
      'Detener el equipo de manera segura y abrir acceso al área a intervenir.',
      'Retirar residuos gruesos y documentar hallazgos de suciedad o cristalización.',
      'Limpiar cubeta, agujas y puntos de lectura con la secuencia aprobada para cada material.',
      'Inspeccionar visualmente que no queden pelusas, humedad o depósitos remanentes.',
      'Ejecutar purga, cebado o rutina de arranque y validar ausencia de arrastre.',
    ],
    validationPoints: [
      'No se observa residuo visible en componentes críticos.',
      'La corrida posterior no presenta arrastre ni alarmas relacionadas.',
      'La operación mecánica se mantiene libre y sin rozamientos.',
    ],
    referenceNotes: [
      'Manual de limpieza preventiva y correctiva del equipo.',
      'Indicaciones del fabricante para compatibilidad química de materiales.',
    ],
    tags: ['limpieza', 'cubeta', 'agujas', 'tren óptico'],
    version: '1.0',
    status: 'activo',
    createdAt: nowIso,
    updatedAt: nowIso,
    isStarter: true,
  },
  {
    id: 'starter-pno-dia-001',
    code: 'PNO-DIA-001',
    title: 'Ruta de revisión inicial ante falla intermitente',
    procedureKind: 'diagnostico',
    equipmentFamily: 'Multiplataforma Orion',
    failureFocus: 'Falla intermitente, reinicios esporádicos, errores no reproducibles o comportamiento inestable.',
    summary:
      'Ruta corta de descarte para levantar evidencia antes de cambiar partes o escalar el caso a ingeniería avanzada.',
    objective:
      'Estandarizar la inspección inicial para reducir sustituciones innecesarias y capturar evidencia de calidad para el cierre o escalamiento.',
    scope:
      'Usar cuando la falla no es permanente y el equipo vuelve a operar parcialmente entre eventos.',
    estimatedDuration: '25 a 40 min',
    tools: [
      'Laptop con acceso a logs y software de servicio',
      'Multímetro o herramienta de verificación eléctrica cuando aplique',
      'Formato de captura de evidencia fotográfica y operativa',
    ],
    materials: ['Bitácora de eventos', 'Checklist de periféricos y conexiones'],
    safetyNotes: [
      'No sustituir tarjetas o módulos sin evidencia técnica mínima.',
      'Tomar fotografía de cableado y posición original antes de mover conexiones.',
    ],
    steps: [
      'Levantar síntoma exacto, frecuencia, contexto de aparición y mensajes asociados.',
      'Revisar alimentación, tierra física, conectividad y condiciones visibles del entorno.',
      'Inspeccionar conectores, tarjetas, ventilación y puntos de suciedad o temperatura anormal.',
      'Consultar logs, historial reciente y última intervención técnica documentada.',
      'Reproducir la falla con la menor invasión posible y definir si procede ajuste, limpieza o escalamiento.',
    ],
    validationPoints: [
      'La evidencia del síntoma queda documentada con fecha, hora y contexto.',
      'Se descartan causas básicas de energía, suciedad y conectividad.',
      'La decisión siguiente queda clara: corregir, observar o escalar.',
    ],
    referenceNotes: [
      'Checklist interno de diagnóstico rápido Orion.',
      'Historial de servicio y últimos cambios aplicados al equipo.',
    ],
    tags: ['falla intermitente', 'diagnóstico', 'evidencia', 'escalamiento'],
    version: '1.0',
    status: 'activo',
    createdAt: nowIso,
    updatedAt: nowIso,
    isStarter: true,
  },
  {
    id: 'starter-pno-ver-001',
    code: 'PNO-VER-001',
    title: 'Verificación posterior a cambio de tarjeta o intervención mayor',
    procedureKind: 'verificacion',
    equipmentFamily: 'BA-400 / ISE / módulos asociados',
    failureFocus: 'Cierre técnico posterior a reemplazo de tarjeta, módulo o ensamblaje crítico.',
    summary:
      'Secuencia breve para liberar el equipo después de un cambio físico o lógico que afecte operación, lectura o comunicación.',
    objective:
      'Confirmar que el equipo quedó funcional, estable y documentado después de una intervención mayor.',
    scope:
      'Aplicable después de cambios de tarjeta, reinstalación de conjuntos, actualización crítica o reconexión de módulos sensibles.',
    estimatedDuration: '35 a 50 min',
    tools: [
      'Laptop de servicio',
      'Control o calibrador de validación',
      'Acceso a parámetros base o respaldo previo',
    ],
    materials: ['Formato de bitácora post intervención', 'Lista de pruebas de aceptación'],
    safetyNotes: [
      'Verificar orientación y torque correcto de conectores antes de energizar.',
      'No liberar el equipo solo con auto chequeo; siempre validar funcionalidad real.',
    ],
    steps: [
      'Confirmar ensamblaje, conectividad y parámetros restaurados o configurados.',
      'Ejecutar arranque controlado y auto chequeo completo.',
      'Correr pruebas funcionales relevantes para el módulo intervenido.',
      'Documentar valores finales, software, firmware y observaciones de estabilidad.',
      'Cerrar el caso solo cuando el criterio de aceptación quede cumplido y trazable.',
    ],
    validationPoints: [
      'Auto chequeo sin alarmas críticas.',
      'Pruebas funcionales y de control dentro de criterio.',
      'Reporte técnico completo con evidencia de cierre.',
    ],
    referenceNotes: [
      'Procedimiento de sustitución del fabricante para el componente intervenido.',
      'Matriz interna de aceptación posterior a reparación.',
    ],
    tags: ['verificación', 'post reparación', 'tarjeta', 'validación'],
    version: '1.0',
    status: 'activo',
    createdAt: nowIso,
    updatedAt: nowIso,
    isStarter: true,
  },
];

export const createEmptyPnoProcedure = (): PnoProcedure => ({
  id: '',
  code: '',
  title: '',
  procedureKind: 'diagnostico',
  equipmentFamily: '',
  failureFocus: '',
  summary: '',
  objective: '',
  scope: '',
  estimatedDuration: '',
  tools: [],
  materials: [],
  safetyNotes: [],
  steps: [],
  validationPoints: [],
  referenceNotes: [],
  tags: [],
  version: '1.0',
  status: 'borrador',
  createdAt: nowIso,
  updatedAt: nowIso,
});

export const normalizePnoTextList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : [];

export const buildPnoSearchText = (procedure: PnoProcedure) =>
  [
    procedure.code,
    procedure.title,
    procedure.summary,
    procedure.equipmentFamily,
    procedure.failureFocus,
    procedure.tags.join(' '),
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
