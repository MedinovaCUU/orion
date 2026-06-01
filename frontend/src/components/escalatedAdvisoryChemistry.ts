export type ChemistryMaterialKey = 'control' | 'calibrador' | 'blanco' | 'muestra';
export type ChemistryOutcome = 'sin_solucion' | 'en_revision' | 'resuelto';

export interface ChemistryIssue {
  id: string;
  title: string;
  symptom: string;
  checks: string[];
  solutions: string[];
  escalationHint: string;
}

export interface ChemistryGuideMaterial {
  key: ChemistryMaterialKey;
  label: string;
  kicker: string;
  description: string;
  helper: string;
  issues: ChemistryIssue[];
}

export interface ChemistryGuideTicketContext {
  subject?: string | null;
  serial?: string | null;
  platform?: string | null;
}

export interface ChemistryDraftFields {
  averia: string;
  detalleAveria: string;
  pasosSeguidos: string;
  accionesTomadas: string;
  consultaEscalada: string;
}

export const CHEMISTRY_OUTCOME_LABELS: Record<ChemistryOutcome, string> = {
  sin_solucion: 'No se resolvió',
  en_revision: 'Sigue en revisión',
  resuelto: 'Se resolvió en campo',
};

export const CHEMISTRY_GUIDE_MATERIALS: ChemistryGuideMaterial[] = [
  {
    key: 'control',
    label: 'Control',
    kicker: 'Desempeño del sistema',
    description:
      'Es un material de concentración esperada conocida, usado para vigilar que el sistema siga dentro del desempeño aceptable.',
    helper: 'Ideal para sesgos, derivas o problemas de repetibilidad.',
    issues: [
      {
        id: 'control_fuera_rango',
        title: 'Control fuera de rango',
        symptom: 'El control sale alto, bajo o se aleja de la media esperada desde la misma corrida.',
        checks: [
          'Confirmar lote, nivel, caducidad y reconstitución del control.',
          'Correr el control en duplicado después de mezclarlo suavemente.',
          'Verificar fecha de calibración, lote de reactivo y temperatura del sistema.',
        ],
        solutions: [
          'Repetir con vial nuevo o con un segundo nivel del mismo control.',
          'Recalibrar si el sesgo persiste y validar nuevamente.',
          'Escalar con resultados antes y después de la recalibración.',
        ],
        escalationHint: 'validar sesgo analítico, estabilidad del reactivo o necesidad de recalibración',
      },
      {
        id: 'control_deriva',
        title: 'Deriva progresiva',
        symptom: 'El control inicia aceptable y se desplaza gradualmente con el paso de las corridas.',
        checks: [
          'Comparar tendencia contra corridas previas y otros niveles de control.',
          'Inspeccionar estabilidad térmica, fotometría y condición del reactivo.',
          'Revisar mantenimiento reciente, lavado y posibles arrastres.',
        ],
        solutions: [
          'Renovar reactivo o control si se sospecha inestabilidad.',
          'Ejecutar mantenimiento corto y repetir la secuencia.',
          'Escalar con evidencia de tendencia y tiempos de aparición.',
        ],
        escalationHint: 'descartar deriva instrumental, envejecimiento de reactivo o falla de temperatura',
      },
      {
        id: 'control_imprecision',
        title: 'Mala repetibilidad',
        symptom: 'Los duplicados del control no coinciden o la variación es mayor a la esperada.',
        checks: [
          'Revisar burbujas, espuma o volumen insuficiente en el contenedor.',
          'Verificar pipeteo, mezcla, limpieza de sonda y estado de cubetas.',
          'Correr varias repeticiones consecutivas para medir la dispersión.',
        ],
        solutions: [
          'Preparar nuevamente el control y asegurar homogeneidad.',
          'Limpiar sonda y revisar carryover o microburbujas.',
          'Escalar con serie de repeticiones y desviación observada.',
        ],
        escalationHint: 'evaluar precisión, arrastre o falla mecánica de dosificación',
      },
    ],
  },
  {
    key: 'calibrador',
    label: 'Calibrador',
    kicker: 'Conversión de señal',
    description:
      'Es un material de composición conocida que se usa para que el sistema convierta señal óptica en actividad; en multistandard serum sirve para la verificación funcional junto con reactivos específicos.',
    helper: 'Útil cuando la curva no ajusta o el factor queda desplazado.',
    issues: [
      {
        id: 'calibrador_curva',
        title: 'La curva no ajusta',
        symptom: 'La calibración falla, el sistema rechaza puntos o la curva queda inconsistente.',
        checks: [
          'Confirmar orden de puntos, volumen cargado y posición correcta del calibrador.',
          'Verificar lote, reconstitución y estabilidad del material.',
          'Revisar que el método y reactivo correspondan al calibrador utilizado.',
        ],
        solutions: [
          'Preparar nuevamente el calibrador y repetir la curva completa.',
          'Sustituir el lote si hay sospecha de deterioro.',
          'Escalar con imagen o datos de la curva y puntos rechazados.',
        ],
        escalationHint: 'revisar linealidad, asignación del método o compatibilidad de lotes',
      },
      {
        id: 'calibrador_factor',
        title: 'Factor desplazado',
        symptom: 'La calibración termina, pero deja un sesgo claro contra controles o historial.',
        checks: [
          'Comparar el nuevo factor contra calibraciones previas.',
          'Confirmar temperatura, blanco, reactivo y estado del fotómetro.',
          'Validar con control de calidad después de calibrar.',
        ],
        solutions: [
          'Recalibrar con calibrador fresco y verificar nuevamente el control.',
          'Cambiar reactivo si el sesgo aparece tras un lote nuevo.',
          'Escalar con factores previos, factor actual y respuesta del control.',
        ],
        escalationHint: 'determinar si el desplazamiento viene del calibrador, reactivo o lectura óptica',
      },
      {
        id: 'calibrador_inestable',
        title: 'Calibración inestable',
        symptom: 'La calibración es válida al inicio, pero pierde estabilidad poco después.',
        checks: [
          'Revisar almacenamiento del calibrador y tiempo fuera de refrigeración.',
          'Verificar consistencia entre corridas cortas consecutivas.',
          'Inspeccionar mantenimiento, lavado y posibles contaminaciones.',
        ],
        solutions: [
          'Repetir con material recién preparado y corrida corta de validación.',
          'Ejecutar limpieza y purga del sistema antes de recalibrar.',
          'Escalar con tiempos, corridas y evidencia de inestabilidad.',
        ],
        escalationHint: 'confirmar estabilidad post-calibración y causas de degradación rápida',
      },
    ],
  },
  {
    key: 'blanco',
    label: 'Blanco',
    kicker: 'Referencia de absorbancia',
    description:
      'Es la lectura base usada para corregir absorbancia ajena a la reacción analítica; el sistema usa este valor para corregir la absorbancia o transmitancia.',
    helper: 'Clave cuando el cero óptico o la absorbancia base se comportan raro.',
    issues: [
      {
        id: 'blanco_alto',
        title: 'Blanco con absorbancia alta',
        symptom: 'El blanco arranca elevado y afecta directamente el resultado del método.',
        checks: [
          'Verificar limpieza de cubetas, agua, reactivo y ausencia de contaminación.',
          'Revisar si el reactivo presenta turbidez, precipitado o coloración anormal.',
          'Confirmar que el blanco configurado corresponda al método correcto.',
        ],
        solutions: [
          'Cambiar reactivo o preparar un nuevo blanco si se sospecha contaminación.',
          'Lavar sistema óptico y cubetas antes de repetir.',
          'Escalar con absorbancia del blanco y fotos del reactivo si aplica.',
        ],
        escalationHint: 'determinar contaminación, deterioro de reactivo o problema óptico',
      },
      {
        id: 'blanco_variable',
        title: 'Blanco variable o ruidoso',
        symptom: 'El blanco no se mantiene estable entre repeticiones o muestra fluctuaciones.',
        checks: [
          'Buscar microburbujas, espuma o irregularidades en llenado.',
          'Revisar lámpara, fotómetro, cubetas y temperatura de reacción.',
          'Comparar el comportamiento en otros métodos del mismo equipo.',
        ],
        solutions: [
          'Purgar líneas, eliminar burbujas y repetir con reactivo nuevo.',
          'Ejecutar limpieza óptica o mantenimiento corto.',
          'Escalar con serie de blancos consecutivos y variación observada.',
        ],
        escalationHint: 'revisar ruido óptico, burbujas o inestabilidad del llenado',
      },
      {
        id: 'blanco_cero',
        title: 'Cero óptico errático',
        symptom: 'La línea base cambia sin patrón claro o el cero óptico no es consistente.',
        checks: [
          'Confirmar alineación, limpieza y estado de cubetas o rotor.',
          'Verificar voltajes, encendido y estabilidad de la lámpara.',
          'Comparar lecturas de blanco con y sin reactivo cargado.',
        ],
        solutions: [
          'Reiniciar la secuencia óptica y repetir la medición base.',
          'Realizar mantenimiento de fotometría si está programado.',
          'Escalar con evidencia de variación y hora de ocurrencia.',
        ],
        escalationHint: 'descartar deriva óptica, falla de lámpara o problema electrónico',
      },
    ],
  },
  {
    key: 'muestra',
    label: 'Muestra',
    kicker: 'Resultado clínico',
    description:
      'Es la muestra del paciente; sirve para obtener resultado clínico y pruebas de repetibilidad.',
    helper: 'Ayuda cuando el problema está en repetibilidad, correlación o arrastre.',
    issues: [
      {
        id: 'muestra_repetibilidad',
        title: 'La muestra no repite',
        symptom: 'Los resultados de la misma muestra cambian más de lo esperado entre repeticiones.',
        checks: [
          'Revisar homogeneidad, volumen, fibrina, coágulos o burbujas en la muestra.',
          'Comparar repetición en la misma copa y en una alícuota nueva.',
          'Verificar limpieza de sonda y ausencia de carryover.',
        ],
        solutions: [
          'Homogeneizar o centrifugar nuevamente según aplique.',
          'Repetir con nueva alícuota o nuevo contenedor.',
          'Escalar con repeticiones consecutivas y condición de la muestra.',
        ],
        escalationHint: 'definir si la variación depende de muestra, pipeteo o arrastre',
      },
      {
        id: 'muestra_correlacion',
        title: 'Resultado no correlaciona',
        symptom: 'El resultado del paciente no coincide con la clínica, el histórico o un método comparativo.',
        checks: [
          'Confirmar identificación de la muestra y delta check del paciente.',
          'Comparar contra control, calibración y repetición de la misma corrida.',
          'Revisar interferencias visibles como hemólisis, lipemia o ictericia.',
        ],
        solutions: [
          'Repetir la muestra y validar con otra alícuota si es posible.',
          'Corroborar la calibración del método involucrado.',
          'Escalar con contexto clínico, resultado previo y observaciones de interferencia.',
        ],
        escalationHint: 'evaluar interferencias, correlación clínica o sesgo del método',
      },
      {
        id: 'muestra_arrastre',
        title: 'Sospecha de arrastre o contaminación',
        symptom: 'Aparecen resultados inesperados después de una muestra alta o la secuencia se contamina.',
        checks: [
          'Revisar secuencia previa y orden de muestras con alta concentración.',
          'Ejecutar repetición con blanco o muestra baja posterior.',
          'Inspeccionar lavado de sonda, cubetas y estación de lavado.',
        ],
        solutions: [
          'Repetir después de limpieza o lavado adicional.',
          'Separar muestras críticas y validar carryover con secuencia corta.',
          'Escalar con orden de corrida, valores y evidencia de arrastre.',
        ],
        escalationHint: 'confirmar contaminación cruzada, lavado insuficiente o carryover',
      },
    ],
  },
];

const uniqueLines = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const asNumberedBlock = (items: string[]) => uniqueLines(items).map((item, index) => `${index + 1}. ${item}`).join('\n');

const joinSentences = (items: string[]) => uniqueLines(items).join(' ');

export const buildChemistryDraft = ({
  material,
  issues,
  notes,
  outcome,
  ticket,
}: {
  material: ChemistryGuideMaterial;
  issues: ChemistryIssue[];
  notes: string;
  outcome: ChemistryOutcome;
  ticket?: ChemistryGuideTicketContext | null;
}): ChemistryDraftFields => {
  const selectedIssues = issues.length > 0 ? issues : material.issues.slice(0, 1);
  const issueTitles = selectedIssues.map((issue) => issue.title);
  const checks = selectedIssues.flatMap((issue) => issue.checks);
  const solutions = selectedIssues.flatMap((issue) => issue.solutions);
  const escalationHints = selectedIssues.map((issue) => issue.escalationHint);
  const symptomSummary = joinSentences(selectedIssues.map((issue) => issue.symptom));
  const noteLine = notes.trim() ? `Hallazgos adicionales: ${notes.trim()}.` : '';
  const ticketLine = ticket?.subject?.trim()
    ? `Ticket relacionado: ${ticket.subject.trim()}${ticket.serial?.trim() ? ` | Serie ${ticket.serial.trim()}` : ''}${ticket.platform?.trim() ? ` | Plataforma ${ticket.platform.trim()}` : ''}.`
    : '';
  const outcomeLine =
    outcome === 'resuelto'
      ? 'Después de las verificaciones el comportamiento quedó resuelto en campo, pero se deja registro para seguimiento.'
      : outcome === 'en_revision'
        ? 'Las verificaciones redujeron el problema, pero aún se requiere validación del área química para confirmar estabilidad.'
        : 'Después de las verificaciones el problema persiste y se requiere asesoría del área química.';

  return {
    averia: `${material.label}: ${issueTitles.join(' / ')}`,
    detalleAveria: [ticketLine, `Se presentan problemas con ${material.label.toLowerCase()}.`, symptomSummary, noteLine]
      .filter(Boolean)
      .join(' '),
    pasosSeguidos: asNumberedBlock(checks),
    accionesTomadas: asNumberedBlock(solutions),
    consultaEscalada: [
      `Se solicita asesoría química por comportamiento anómalo en ${material.label.toLowerCase()}.`,
      ticketLine,
      `Problemas observados: ${issueTitles.join('; ')}.`,
      `Descripción resumida: ${symptomSummary}`,
      checks.length > 0 ? `Verificaciones ya realizadas:\n${asNumberedBlock(checks)}` : '',
      solutions.length > 0 ? `Acciones sugeridas o ya aplicadas:\n${asNumberedBlock(solutions)}` : '',
      noteLine,
      `Conclusión: ${outcomeLine}`,
      `Se requiere apoyo para ${joinSentences(escalationHints)}.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
};
