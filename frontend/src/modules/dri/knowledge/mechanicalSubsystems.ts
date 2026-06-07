import type { DriMechanicalSubsystemId } from '../types/dri.types';

export const DRI_SUBSYSTEM_LABELS: Record<DriMechanicalSubsystemId, string> = {
  sample_arm: 'Brazo de muestra',
  reagent_arm_r1: 'Brazo de reactivo R1',
  reagent_arm_r2: 'Brazo de reactivo R2',
  reaction_rotor: 'Rotor de reacción',
  wash_station: 'Estación de lavado',
  optical_system: 'Sistema óptico',
  fridge: 'Refrigeración de reactivos',
  level_detection: 'Detección de nivel',
  barcode: 'Lector de código de barras',
  ise: 'Módulo ISE',
  clot_sensor: 'Sensor de coágulo',
  fluidics: 'Sistema fluídico',
  stirrer: 'Brazo agitador',
};
