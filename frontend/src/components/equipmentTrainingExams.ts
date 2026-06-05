export type EquipmentTrainingExamCode = 'A15' | 'BA200' | 'BA400';

export interface EquipmentTrainingExamQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  reference: string;
}

export interface EquipmentTrainingExamDefinition {
  code: EquipmentTrainingExamCode;
  title: string;
  sourceLabel: string;
  passingRatio: number;
  questions: EquipmentTrainingExamQuestion[];
}

const EXAMS: Record<EquipmentTrainingExamCode, EquipmentTrainingExamDefinition> = {
  A15: {
    code: 'A15',
    title: 'Evaluacion de capacitacion A15',
    sourceLabel: 'A15 manual de servicio, secciones de uso y operacion',
    passingRatio: 0.8,
    questions: [
      {
        id: 'a15-1',
        prompt: 'Cual es el uso previsto del A15 segun el manual?',
        options: [
          'Determinaciones in vitro de bioquimica, turbidimetria y electrolitos en muestras humanas',
          'Exclusivamente analisis ambientales de aguas residuales',
          'Analisis hematologicos de extendidos sanguineos',
          'Solo monitoreo remoto y control de inventario',
        ],
        correctOptionIndex: 0,
        reference: 'A15 p. 14, Uso previsto',
      },
      {
        id: 'a15-2',
        prompt: 'Que tipo de usuario debe operar el A15?',
        options: [
          'Cualquier persona que tenga acceso al laboratorio',
          'Solo usuarios con formacion y capacidad adecuada para su utilizacion',
          'Unicamente el personal de ventas',
          'Solo personal externo de paqueteria',
        ],
        correctOptionIndex: 1,
        reference: 'A15 p. 14, Uso previsto',
      },
      {
        id: 'a15-3',
        prompt: 'Cuales son los tres elementos basicos descritos para el analizador A15?',
        options: [
          'Brazo manipulador, sistema dosificador y rotor de reacciones y lectura',
          'Monitor, impresora y teclado',
          'Bomba de vacio, centrifuga y incubadora',
          'Modulo ISE, lector QR y UPS',
        ],
        correctOptionIndex: 0,
        reference: 'A15 p. 16, Descripcion general del analizador',
      },
      {
        id: 'a15-4',
        prompt: 'Que hace el brazo manipulador si se levanta la tapa general mientras esta trabajando?',
        options: [
          'Aumenta la velocidad para terminar antes',
          'Detiene la tarea en curso y se coloca en posicion de aparcamiento',
          'Abre automaticamente el rotor de reactivos',
          'Expulsa la punta dosificadora',
        ],
        correctOptionIndex: 1,
        reference: 'A15 p. 16, Brazo manipulador',
      },
      {
        id: 'a15-5',
        prompt: 'A que temperatura aproximada termostatiza las preparaciones la punta del A15?',
        options: [
          '25 °C',
          '30 °C',
          '37 °C',
          '45 °C',
        ],
        correctOptionIndex: 2,
        reference: 'A15 p. 16, Sistema dosificador',
      },
      {
        id: 'a15-6',
        prompt: 'Que rango de volumen puede dispensar la bomba del sistema dosificador del A15?',
        options: [
          '1 a 50 uL',
          '3 a 1250 uL',
          '100 a 5000 uL',
          '10 a 20 mL',
        ],
        correctOptionIndex: 1,
        reference: 'A15 p. 16, Sistema dosificador',
      },
      {
        id: 'a15-7',
        prompt: 'Cuando se inicia una sesion de trabajo, que propone realizar el analizador?',
        options: [
          'Solo apagar ventiladores y cerrar reportes',
          'Blancos, calibradores y controles necesarios',
          'Exclusivamente limpieza del lector de codigo de barras',
          'Cambio obligatorio de todas las botellas de reactivo',
        ],
        correctOptionIndex: 1,
        reference: 'A15 p. 19, Funcionamiento del analizador',
      },
    ],
  },
  BA200: {
    code: 'BA200',
    title: 'Evaluacion de capacitacion BA200',
    sourceLabel: 'BA200 manual de usuario, instalacion, seguridad y flujo de trabajo',
    passingRatio: 0.8,
    questions: [
      {
        id: 'ba200-1',
        prompt: 'Para que tipo de determinaciones esta previsto el BA200?',
        options: [
          'Determinaciones in vitro de bioquimica, turbidimetria y electrolitos en muestras humanas',
          'Solo pruebas moleculares de PCR',
          'Solo analisis de alimentos fermentados',
          'Exclusivamente pruebas veterinarias de campo',
        ],
        correctOptionIndex: 0,
        reference: 'BA200 UM p. 22, Uso previsto',
      },
      {
        id: 'ba200-2',
        prompt: 'Quien debe usar el BA200 segun el manual?',
        options: [
          'Usuarios con formacion y capacidad adecuada para su utilizacion',
          'Cualquier visitante del laboratorio',
          'Solo el area administrativa',
          'Solo personal de limpieza',
        ],
        correctOptionIndex: 0,
        reference: 'BA200 UM p. 22, Uso previsto',
      },
      {
        id: 'ba200-3',
        prompt: 'Que se debe hacer si muestras, controles o calibradores entran en contacto con la piel?',
        options: [
          'Secarlos con papel y continuar',
          'Ignorarlo si no hay olor fuerte',
          'Lavar inmediatamente con abundante agua y consultar con un medico',
          'Encender nuevamente el equipo',
        ],
        correctOptionIndex: 2,
        reference: 'BA200 UM p. 17, Prevencion de riesgo biologico',
      },
      {
        id: 'ba200-4',
        prompt: 'Como recomienda el manual posicionar muestras y botellas de reactivos en el rotor?',
        options: [
          'Muestras en la corona externa y reactivos en la corona interna',
          'Todo en la corona interna sin orden',
          'Reactivos en la corona externa y muestras en la interna',
          'Solo controles en la corona externa',
        ],
        correctOptionIndex: 0,
        reference: 'BA200 UM p. 33, Posicionamiento recomendado',
      },
      {
        id: 'ba200-5',
        prompt: 'Al instalar el rotor de reacciones, como debe manipularse?',
        options: [
          'Tomandolo por cualquier cara interna',
          'Sujetandolo por las pestañas y evitando tocar con el rotor las puntas de la estacion de lavado',
          'Empujandolo con una punta metalica',
          'Con el analizador apagado y sin usar el programa',
        ],
        correctOptionIndex: 1,
        reference: 'BA200 UM p. 35, Instalacion del rotor de reacciones',
      },
      {
        id: 'ba200-6',
        prompt: 'Que debe hacerse con consumibles o soluciones caducadas?',
        options: [
          'Seguir usandolos si el color luce normal',
          'Mezclarlos con agua destilada',
          'Retirarlos y usar un producto nuevo con fecha de caducidad vigente',
          'Guardarlos dentro del rotor hasta el fin de la sesion',
        ],
        correctOptionIndex: 2,
        reference: 'BA200 UM p. 18, Uso de consumibles',
      },
      {
        id: 'ba200-7',
        prompt: 'En el escenario de trabajo con LIS y muestras, que puede hacer el usuario despues de posicionar los especimenes y leer los codigos?',
        options: [
          'Iniciar la sesion de trabajo',
          'Cambiar automaticamente el rotor sin confirmacion',
          'Eliminar la calibracion activa',
          'Desactivar el modulo optico',
        ],
        correctOptionIndex: 0,
        reference: 'BA200 UM p. 223, Flujo de trabajo con LIS',
      },
    ],
  },
  BA400: {
    code: 'BA400',
    title: 'Evaluacion de capacitacion BA400',
    sourceLabel: 'BA400 manual de usuario, instalacion, operacion y flujo de trabajo',
    passingRatio: 0.8,
    questions: [
      {
        id: 'ba400-1',
        prompt: 'Para que tipo de muestras esta previsto el BA400?',
        options: [
          'Muestras humanas de suero, orina, plasma, liquido cefalorraquideo o sangre total',
          'Unicamente heces y agua residual',
          'Solo cultivos celulares vegetales',
          'Exclusivamente alimentos y bebidas',
        ],
        correctOptionIndex: 0,
        reference: 'BA400 UM p. 21, Uso previsto',
      },
      {
        id: 'ba400-2',
        prompt: 'Quien debe operar el BA400 segun el manual?',
        options: [
          'Usuarios con la formacion y experiencia adecuadas',
          'Cualquier persona con acceso a la PC',
          'Solo personal de almacen',
          'Solo personal de mantenimiento externo',
        ],
        correctOptionIndex: 0,
        reference: 'BA400 UM p. 21, Uso previsto',
      },
      {
        id: 'ba400-3',
        prompt: 'En el rotor de muestras entero del BA400, cuantas posiciones pueden leer codigo de barras?',
        options: [
          '45 posiciones',
          '90 posiciones',
          '120 posiciones',
          '135 posiciones',
        ],
        correctOptionIndex: 1,
        reference: 'BA400 UM p. 31, Instalacion del rotor de muestras',
      },
      {
        id: 'ba400-4',
        prompt: 'Que ocurre si se abre la tapa principal mientras el analizador esta trabajando?',
        options: [
          'El analizador acelera para terminar antes',
          'El sistema se apaga por completo',
          'El analizador detiene la ejecucion de la lista de trabajo',
          'Solo se desactiva el lector de codigo de barras',
        ],
        correctOptionIndex: 2,
        reference: 'BA400 UM p. 62, Tapa principal',
      },
      {
        id: 'ba400-5',
        prompt: 'Al instalar el rotor de reacciones, que precaucion indica el manual?',
        options: [
          'Lubricar el rotor con alcohol antes de colocarlo',
          'Evitar tocar con el rotor las puntas de la estacion de lavado',
          'Presionar manualmente el rotor contra el motor',
          'Mover el rotor con la tapa cerrada',
        ],
        correctOptionIndex: 1,
        reference: 'BA400 UM p. 34, Instalacion del rotor de reacciones',
      },
      {
        id: 'ba400-6',
        prompt: 'A que temperatura esta termostatizado el rotor de reacciones del BA400?',
        options: [
          '30 °C',
          '35 °C',
          '37 °C',
          '42 °C',
        ],
        correctOptionIndex: 2,
        reference: 'BA400 UM p. 62, Tapa rotor de reacciones',
      },
      {
        id: 'ba400-7',
        prompt: 'Que funcion adicional tiene el brazo de muestras del BA400?',
        options: [
          'Incluye un detector de coagulos en la punta',
          'Calienta el rotor de reacciones',
          'Sustituye el lector de codigo de barras',
          'Mide directamente el pH del reactivo',
        ],
        correctOptionIndex: 0,
        reference: 'BA400 UM p. 67, Detector de coagulo',
      },
    ],
  },
};

export const normalizeEquipmentTrainingExamCode = (model?: string | null) => {
  const normalized = String(model || '').toUpperCase();

  if (normalized.includes('A15')) {
    return 'A15';
  }

  if (normalized.includes('BA200')) {
    return 'BA200';
  }

  if (normalized.includes('BA400')) {
    return 'BA400';
  }

  return null;
};

export const getEquipmentTrainingExamDefinition = (model?: string | null) => {
  const code = normalizeEquipmentTrainingExamCode(model);
  return code ? EXAMS[code] : null;
};
