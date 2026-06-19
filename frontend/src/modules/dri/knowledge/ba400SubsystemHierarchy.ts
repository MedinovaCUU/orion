import type {
  DriGraphEdge,
  DriGraphNode,
  DriMechanicalSubsystemId,
  DriRelationSignal,
  DriReagentProfile,
} from '../types/dri.types';

type DriHierarchyDepth = 1 | 2 | 3 | 4;

interface DriBa400HierarchyNodeDefinition {
  id: string;
  parentId: string | null;
  rootId: string;
  label: string;
  subtitle: string;
  depth: DriHierarchyDepth;
  alwaysVisible?: boolean;
  mechanicalSubsystems?: DriMechanicalSubsystemId[];
  signalCategories?: DriRelationSignal['category'][];
  signalIds?: string[];
}

const ROOT_COLORS: Record<string, string> = {
  chemistry: '#7bd6df',
  optics: '#e8bc65',
  reaction: '#b9cad9',
  sample: '#a9dcd2',
  reagent: '#9fd7cf',
  fluidics: '#aac9d0',
  pipetting: '#9eb9d9',
  wash: '#b4d5cb',
};

const ambientNodeId = (definitionId: string) => `ambient:${definitionId}`;
const signalNodeId = (signalId: string) => `signal:${signalId}`;

const BA400_HIERARCHY: DriBa400HierarchyNodeDefinition[] = [
  { id: 'sys:chemistry', parentId: null, rootId: 'chemistry', label: 'Programa analítico', subtitle: 'técnica · metrología · interferencias', depth: 1, alwaysVisible: true },
  { id: 'sys:optics', parentId: null, rootId: 'optics', label: 'Sistema óptico', subtitle: 'lectura · filtros · fotometría', depth: 1, alwaysVisible: true, mechanicalSubsystems: ['optical_system'] },
  { id: 'sys:reaction', parentId: null, rootId: 'reaction', label: 'Rotor de reacción', subtitle: 'cuvetas · giro · termostatización', depth: 1, alwaysVisible: true, mechanicalSubsystems: ['reaction_rotor'] },
  { id: 'sys:sample', parentId: null, rootId: 'sample', label: 'Rotor de muestras', subtitle: 'muestras · controles · lector', depth: 1, alwaysVisible: true, mechanicalSubsystems: ['sample_arm', 'barcode'] },
  { id: 'sys:reagent', parentId: null, rootId: 'reagent', label: 'Rotor de reactivos', subtitle: 'botellas · lector · refrigeración', depth: 1, alwaysVisible: true, mechanicalSubsystems: ['reagent_arm_r1', 'reagent_arm_r2', 'fridge', 'barcode'] },
  { id: 'sys:fluidics', parentId: null, rootId: 'fluidics', label: 'Sistema fluídico', subtitle: 'agua · bombas · manifold · vacío', depth: 1, alwaysVisible: true, mechanicalSubsystems: ['fluidics'] },
  { id: 'sys:pipetting', parentId: null, rootId: 'pipetting', label: 'Brazos de pipeteo', subtitle: 'muestra · R1 · R2 · nivel', depth: 1, alwaysVisible: true, mechanicalSubsystems: ['sample_arm', 'reagent_arm_r1', 'reagent_arm_r2', 'level_detection', 'clot_sensor', 'stirrer'] },
  { id: 'sys:wash', parentId: null, rootId: 'wash', label: 'Estación de lavado', subtitle: 'lavado · secado · chequeo óptico', depth: 1, alwaysVisible: true, mechanicalSubsystems: ['wash_station'] },

  { id: 'chem:reaction_profile', parentId: 'sys:chemistry', rootId: 'chemistry', label: 'Perfil de reacción', subtitle: 'punto final · cinética · tendencia', depth: 2, signalCategories: ['reaction', 'technique', 'trend'] },
  { id: 'chem:architecture', parentId: 'sys:chemistry', rootId: 'chemistry', label: 'Arquitectura del reactivo', subtitle: 'mono/bi/R2', depth: 2, signalCategories: ['scheme', 'r2'] },
  { id: 'chem:metrology', parentId: 'sys:chemistry', rootId: 'chemistry', label: 'Metrología IFU', subtitle: 'linealidad · QC · dilución', depth: 2, signalCategories: ['control', 'dilution', 'volume'] },
  { id: 'chem:limitations', parentId: 'sys:chemistry', rootId: 'chemistry', label: 'Interferencias y límites', subtitle: 'temperatura · agua · carryover', depth: 2, signalCategories: ['temperature', 'storage', 'water', 'contamination', 'blank'] },

  { id: 'optics:wavelength_train', parentId: 'sys:optics', rootId: 'optics', label: 'Tren de longitud de onda', subtitle: 'leds · filtros · divisores', depth: 2, mechanicalSubsystems: ['optical_system'], signalCategories: ['wavelength'] },
  { id: 'optics:detectors', parentId: 'sys:optics', rootId: 'optics', label: 'Detección fotométrica', subtitle: 'principal · referencia', depth: 2, mechanicalSubsystems: ['optical_system'], signalCategories: ['blank', 'service'] },

  { id: 'reaction:thermostat', parentId: 'sys:reaction', rootId: 'reaction', label: 'Termostatización', subtitle: 'peltiers · canal calefactor', depth: 2, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['temperature', 'storage'] },
  { id: 'reaction:drive', parentId: 'sys:reaction', rootId: 'reaction', label: 'Giro y referencia', subtitle: 'motor · encoder · home', depth: 2, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['service'] },
  { id: 'reaction:cuvette_path', parentId: 'sys:reaction', rootId: 'reaction', label: 'Ruta de cubetas', subtitle: 'metacrilato · blanco · descarte', depth: 2, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['blank', 'reaction', 'technique'] },

  { id: 'sample:mechanics', parentId: 'sys:sample', rootId: 'sample', label: 'Tambor y transmisión', subtitle: 'motor · correa · centrado', depth: 2, mechanicalSubsystems: ['sample_arm'] },
  { id: 'sample:barcode', parentId: 'sys:sample', rootId: 'sample', label: 'Lectura de muestras', subtitle: 'lector · ventana · ajustes', depth: 2, mechanicalSubsystems: ['barcode'] },

  { id: 'reagent:mechanics', parentId: 'sys:reagent', rootId: 'reagent', label: 'Tambor y transmisión', subtitle: 'coronas · motor · home', depth: 2, mechanicalSubsystems: ['reagent_arm_r1', 'reagent_arm_r2'] },
  { id: 'reagent:barcode', parentId: 'sys:reagent', rootId: 'reagent', label: 'Lectura de botellas', subtitle: 'lector · ventana · ajustes', depth: 2, mechanicalSubsystems: ['barcode'] },
  { id: 'reagent:cooling', parentId: 'sys:reagent', rootId: 'reagent', label: 'Refrigeración', subtitle: 'peltiers · cobre · ventiladores', depth: 2, mechanicalSubsystems: ['fridge'], signalCategories: ['storage', 'temperature'] },

  { id: 'fluidics:dispensing', parentId: 'sys:fluidics', rootId: 'fluidics', label: 'Bloque de dosificación', subtitle: 'jeringas · manifold · presión', depth: 2, mechanicalSubsystems: ['fluidics', 'reagent_arm_r1', 'reagent_arm_r2', 'sample_arm'], signalCategories: ['scheme', 'r2', 'dilution', 'volume', 'service'] },
  { id: 'fluidics:wash_pump', parentId: 'sys:fluidics', rootId: 'fluidics', label: 'Bomba de 5 pistones', subtitle: 'lavado · enjuague · secado', depth: 2, mechanicalSubsystems: ['fluidics', 'wash_station'], signalCategories: ['water', 'contamination', 'service', 'blank'] },
  { id: 'fluidics:water_supply', parentId: 'sys:fluidics', rootId: 'fluidics', label: 'Suministro y residuos', subtitle: 'depósito · boyas · entrada/descarga', depth: 2, mechanicalSubsystems: ['fluidics'], signalCategories: ['water', 'contamination'] },
  { id: 'fluidics:degassing', parentId: 'sys:fluidics', rootId: 'fluidics', label: 'Desgasificación', subtitle: 'vacío · membrana · antirretorno', depth: 2, mechanicalSubsystems: ['fluidics'], signalCategories: ['water', 'service'] },

  { id: 'pipetting:sample_arm', parentId: 'sys:pipetting', rootId: 'pipetting', label: 'Brazo de muestra', subtitle: 'coágulo · nivel · colisión', depth: 2, mechanicalSubsystems: ['sample_arm', 'clot_sensor', 'level_detection'], signalCategories: ['service', 'water', 'contamination', 'dilution', 'volume'] },
  { id: 'pipetting:r1_arm', parentId: 'sys:pipetting', rootId: 'pipetting', label: 'Brazo R1', subtitle: 'temperatura · nivel · colisión', depth: 2, mechanicalSubsystems: ['reagent_arm_r1', 'level_detection'], signalCategories: ['scheme', 'service', 'volume'] },
  { id: 'pipetting:r2_arm', parentId: 'sys:pipetting', rootId: 'pipetting', label: 'Brazo R2', subtitle: 'temperatura · nivel · colisión', depth: 2, mechanicalSubsystems: ['reagent_arm_r2', 'level_detection'], signalCategories: ['r2', 'scheme', 'service', 'volume'] },
  { id: 'pipetting:mixing', parentId: 'sys:pipetting', rootId: 'pipetting', label: 'Agitación', subtitle: 'muestra y post-R2', depth: 2, mechanicalSubsystems: ['stirrer'], signalCategories: ['reaction', 'technique', 'r2', 'service'] },

  { id: 'wash:tip_head', parentId: 'sys:wash', rootId: 'wash', label: 'Cabezal de 7 puntas', subtitle: '10 etapas de lavado', depth: 2, mechanicalSubsystems: ['wash_station'], signalCategories: ['blank', 'water', 'contamination'] },
  { id: 'wash:elevation', parentId: 'sys:wash', rootId: 'wash', label: 'Elevación y secado', subtitle: 'motor · correa · home', depth: 2, mechanicalSubsystems: ['wash_station'], signalCategories: ['service', 'blank'] },
  { id: 'wash:heater', parentId: 'sys:wash', rootId: 'wash', label: 'Calefactor y sensores', subtitle: 'tubos · protección térmica', depth: 2, mechanicalSubsystems: ['wash_station'], signalCategories: ['temperature', 'water', 'service'] },

  { id: 'chem:reaction_modes', parentId: 'chem:reaction_profile', rootId: 'chemistry', label: 'Punto final / cinética', subtitle: 'creciente · decreciente · tiempo fijo', depth: 3, signalCategories: ['reaction', 'technique', 'trend'] },
  { id: 'chem:r1_r2_program', parentId: 'chem:architecture', rootId: 'chemistry', label: 'Programa R1/R2', subtitle: 'monoreactiva · bireactiva', depth: 3, signalCategories: ['scheme', 'r2'] },
  { id: 'chem:linearity_dilution', parentId: 'chem:metrology', rootId: 'chemistry', label: 'Linealidad y dilución', subtitle: 'LOD · LOQ · corrección', depth: 3, signalCategories: ['dilution', 'volume', 'control'] },
  { id: 'chem:qc_limitations', parentId: 'chem:metrology', rootId: 'chemistry', label: 'QC y rechazo', subtitle: 'bandas · límites · target', depth: 3, signalCategories: ['control'] },
  { id: 'chem:temperature_storage', parentId: 'chem:limitations', rootId: 'chemistry', label: 'Estabilidad térmica', subtitle: 'reacción · conservación', depth: 3, signalCategories: ['temperature', 'storage'] },
  { id: 'chem:water_carryover', parentId: 'chem:limitations', rootId: 'chemistry', label: 'Agua / carryover', subtitle: 'interferencias del procedimiento', depth: 3, signalCategories: ['water', 'contamination', 'blank'] },

  { id: 'optics:filters', parentId: 'optics:wavelength_train', rootId: 'optics', label: 'Filtros', subtitle: '340 · 405 · 505 · 535 · 560 · 600 · 635 · 670', depth: 3, mechanicalSubsystems: ['optical_system'], signalCategories: ['wavelength', 'blank'] },
  { id: 'optics:leds', parentId: 'optics:wavelength_train', rootId: 'optics', label: 'LEDs', subtitle: 'fuente de cada λ', depth: 3, mechanicalSubsystems: ['optical_system'], signalCategories: ['wavelength', 'service'] },
  { id: 'optics:beam_splitters', parentId: 'optics:wavelength_train', rootId: 'optics', label: 'Divisores de haz', subtitle: 'ruta óptica', depth: 3, mechanicalSubsystems: ['optical_system'], signalCategories: ['wavelength'] },
  { id: 'optics:photodiodes', parentId: 'optics:detectors', rootId: 'optics', label: 'Fotodiodos', subtitle: 'principal y referencia', depth: 3, mechanicalSubsystems: ['optical_system'], signalCategories: ['blank', 'service'] },
  { id: 'optics:optical_bench', parentId: 'optics:detectors', rootId: 'optics', label: 'Banco óptico', subtitle: 'placas · junta · tapa', depth: 3, mechanicalSubsystems: ['optical_system'], signalCategories: ['service'] },

  { id: 'reaction:peltiers_fans', parentId: 'reaction:thermostat', rootId: 'reaction', label: 'Peltiers y ventiladores', subtitle: '37 °C estable', depth: 3, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['temperature', 'service'] },
  { id: 'reaction:heated_channel', parentId: 'reaction:thermostat', rootId: 'reaction', label: 'Canal calefactor', subtitle: 'aislante · tapa · estabilidad', depth: 3, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['temperature'] },
  { id: 'reaction:encoder_home', parentId: 'reaction:drive', rootId: 'reaction', label: 'Encoder y home', subtitle: 'disco · detector inicio', depth: 3, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['service'] },
  { id: 'reaction:motor_belt', parentId: 'reaction:drive', rootId: 'reaction', label: 'Motor y transmisión', subtitle: 'piñón · correa · polea', depth: 3, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['service'] },
  { id: 'reaction:acrylic_cuvettes', parentId: 'reaction:cuvette_path', rootId: 'reaction', label: 'Cuvetas de metacrilato', subtitle: '120 pocillos', depth: 3, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['blank', 'reaction'] },
  { id: 'reaction:blank_rejection', parentId: 'reaction:cuvette_path', rootId: 'reaction', label: 'Rechazo por blanco', subtitle: 'cubeta inicial / absorbancia base', depth: 3, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['blank'] },
  { id: 'reaction:overflow_detection', parentId: 'reaction:cuvette_path', rootId: 'reaction', label: 'Desbordamiento', subtitle: 'placa y detector', depth: 3, mechanicalSubsystems: ['reaction_rotor'], signalCategories: ['service'] },

  { id: 'sample:adapters_positioner', parentId: 'sample:mechanics', rootId: 'sample', label: 'Adaptadores y posicionador', subtitle: 'coronas · centrado', depth: 3, mechanicalSubsystems: ['sample_arm'] },
  { id: 'sample:locking_balls', parentId: 'sample:mechanics', rootId: 'sample', label: 'Anclaje del rotor', subtitle: 'pulsador · bolas', depth: 3, mechanicalSubsystems: ['sample_arm'] },
  { id: 'sample:rotary_motor', parentId: 'sample:mechanics', rootId: 'sample', label: 'Motor circular', subtitle: 'correa · polea', depth: 3, mechanicalSubsystems: ['sample_arm'], signalCategories: ['service'] },
  { id: 'sample:home_cover', parentId: 'sample:mechanics', rootId: 'sample', label: 'Home y tapa', subtitle: 'detector inicio · efecto Hall', depth: 3, mechanicalSubsystems: ['sample_arm'], signalCategories: ['service'] },
  { id: 'sample:barcode_reader', parentId: 'sample:barcode', rootId: 'sample', label: 'Lector de códigos', subtitle: 'ventana · ajustes 18/19/20', depth: 3, mechanicalSubsystems: ['barcode'], signalCategories: ['service'] },

  { id: 'reagent:bottle_rings', parentId: 'reagent:mechanics', rootId: 'reagent', label: 'Coronas y botellas', subtitle: '20 mL / 60 mL', depth: 3, mechanicalSubsystems: ['reagent_arm_r1', 'reagent_arm_r2'] },
  { id: 'reagent:rotary_motor', parentId: 'reagent:mechanics', rootId: 'reagent', label: 'Motor circular', subtitle: 'correa · polea · eje', depth: 3, mechanicalSubsystems: ['reagent_arm_r1', 'reagent_arm_r2'], signalCategories: ['service'] },
  { id: 'reagent:home_positioner', parentId: 'reagent:mechanics', rootId: 'reagent', label: 'Home y posicionador', subtitle: 'detector inicio · centrador', depth: 3, mechanicalSubsystems: ['reagent_arm_r1', 'reagent_arm_r2'], signalCategories: ['service'] },
  { id: 'reagent:barcode_reader', parentId: 'reagent:barcode', rootId: 'reagent', label: 'Lector de botellas', subtitle: 'ventana · soporte', depth: 3, mechanicalSubsystems: ['barcode'], signalCategories: ['service'] },
  { id: 'reagent:peltiers', parentId: 'reagent:cooling', rootId: 'reagent', label: 'Peltiers', subtitle: 'refrigeración independiente', depth: 3, mechanicalSubsystems: ['fridge'], signalCategories: ['temperature', 'storage'] },
  { id: 'reagent:copper_radiator_fan', parentId: 'reagent:cooling', rootId: 'reagent', label: 'Cobre, radiador y ventilador', subtitle: 'evacuación de calor', depth: 3, mechanicalSubsystems: ['fridge'], signalCategories: ['temperature'] },
  { id: 'reagent:insulation', parentId: 'reagent:cooling', rootId: 'reagent', label: 'Aislante', subtitle: 'mantiene < 8 °C', depth: 3, mechanicalSubsystems: ['fridge'], signalCategories: ['storage'] },

  { id: 'fluidics:syringe_motor', parentId: 'fluidics:dispensing', rootId: 'fluidics', label: 'Motor y husillo', subtitle: 'soporte del pistón', depth: 3, mechanicalSubsystems: ['fluidics'], signalCategories: ['service', 'dilution', 'volume'] },
  { id: 'fluidics:ceramic_pumps', parentId: 'fluidics:dispensing', rootId: 'fluidics', label: 'Bombas cerámicas', subtitle: 'R1/R2 8 mm · muestra 3 mm', depth: 3, mechanicalSubsystems: ['fluidics'], signalCategories: ['scheme', 'r2', 'dilution', 'volume'] },
  { id: 'fluidics:manifold_pressure', parentId: 'fluidics:dispensing', rootId: 'fluidics', label: 'Manifold y presión', subtitle: 'sensor obstrucción muestra', depth: 3, mechanicalSubsystems: ['fluidics'], signalCategories: ['service', 'contamination'] },
  { id: 'fluidics:piston_pump', parentId: 'fluidics:wash_pump', rootId: 'fluidics', label: 'Conjunto de pistones', subtitle: '5 pistones · cámara · soporte', depth: 3, mechanicalSubsystems: ['fluidics', 'wash_station'], signalCategories: ['water', 'blank', 'service'] },
  { id: 'fluidics:check_valves', parentId: 'fluidics:wash_pump', rootId: 'fluidics', label: 'Check valves', subtitle: 'bomba de pistones BA400v2', depth: 3, mechanicalSubsystems: ['fluidics', 'wash_station'], signalCategories: ['water', 'contamination', 'service'] },
  { id: 'fluidics:membrane_pumps', parentId: 'fluidics:wash_pump', rootId: 'fluidics', label: 'Bombas de membrana', subtitle: 'aspiración y secado', depth: 3, mechanicalSubsystems: ['fluidics', 'wash_station'], signalCategories: ['water', 'contamination', 'service'] },
  { id: 'fluidics:distilled_tank_floats', parentId: 'fluidics:water_supply', rootId: 'fluidics', label: 'Depósito y boyas', subtitle: 'agua destilada / residuos', depth: 3, mechanicalSubsystems: ['fluidics'], signalCategories: ['water', 'service'] },
  { id: 'fluidics:external_water_waste', parentId: 'fluidics:water_supply', rootId: 'fluidics', label: 'Entrada/salida externa', subtitle: 'red o contenedor', depth: 3, mechanicalSubsystems: ['fluidics'], signalCategories: ['water'] },
  { id: 'fluidics:degasser_membrane', parentId: 'fluidics:degassing', rootId: 'fluidics', label: 'Membrana de desgasificación', subtitle: 'entrada y salida de agua', depth: 3, mechanicalSubsystems: ['fluidics'], signalCategories: ['water', 'service'] },
  { id: 'fluidics:vacuum_pump_control', parentId: 'fluidics:degassing', rootId: 'fluidics', label: 'Bomba y control de vacío', subtitle: 'electroválvula · sensor · placa', depth: 3, mechanicalSubsystems: ['fluidics'], signalCategories: ['service'] },

  { id: 'pipetting:sample_tip_clot_level', parentId: 'pipetting:sample_arm', rootId: 'pipetting', label: 'Punta de muestra', subtitle: 'líquido · coágulo · diámetro 0.4 mm', depth: 3, mechanicalSubsystems: ['sample_arm', 'clot_sensor', 'level_detection'], signalCategories: ['dilution', 'volume', 'service', 'contamination'] },
  { id: 'pipetting:sample_collision_axes', parentId: 'pipetting:sample_arm', rootId: 'pipetting', label: 'Ejes y colisión', subtitle: 'motor angular/elevación', depth: 3, mechanicalSubsystems: ['sample_arm'], signalCategories: ['service'] },
  { id: 'pipetting:r1_tip_temp_level', parentId: 'pipetting:r1_arm', rootId: 'pipetting', label: 'Punta R1', subtitle: 'temperatura · nivel · 0.8 mm', depth: 3, mechanicalSubsystems: ['reagent_arm_r1', 'level_detection'], signalCategories: ['scheme', 'volume', 'temperature', 'service'] },
  { id: 'pipetting:r2_tip_temp_level', parentId: 'pipetting:r2_arm', rootId: 'pipetting', label: 'Punta R2', subtitle: 'temperatura · nivel · 0.8 mm', depth: 3, mechanicalSubsystems: ['reagent_arm_r2', 'level_detection'], signalCategories: ['r2', 'scheme', 'volume', 'temperature', 'service'] },
  { id: 'pipetting:agitator_after_sample', parentId: 'pipetting:mixing', rootId: 'pipetting', label: 'Agitador post-muestra', subtitle: 'motor DC · pala', depth: 3, mechanicalSubsystems: ['stirrer'], signalCategories: ['reaction', 'technique', 'service'] },
  { id: 'pipetting:agitator_after_r2', parentId: 'pipetting:mixing', rootId: 'pipetting', label: 'Agitador post-R2', subtitle: 'mezcla tras segundo reactivo', depth: 3, mechanicalSubsystems: ['stirrer'], signalCategories: ['r2', 'reaction', 'service'] },

  { id: 'wash:seven_tips_cycles', parentId: 'wash:tip_head', rootId: 'wash', label: '7 puntas / 10 etapas', subtitle: 'aspira · dispensa · seca', depth: 3, mechanicalSubsystems: ['wash_station'], signalCategories: ['blank', 'water', 'contamination'] },
  { id: 'wash:optical_cuvette_check', parentId: 'wash:tip_head', rootId: 'wash', label: 'Chequeo óptico de cubeta', subtitle: 'descarta pocillos rayados', depth: 3, mechanicalSubsystems: ['wash_station'], signalCategories: ['blank', 'service'] },
  { id: 'wash:elevation_motor_home', parentId: 'wash:elevation', rootId: 'wash', label: 'Elevación y home', subtitle: 'motor 38 · correa · fotodetector', depth: 3, mechanicalSubsystems: ['wash_station'], signalCategories: ['service'] },
  { id: 'wash:collision_overflow', parentId: 'wash:elevation', rootId: 'wash', label: 'Colisión y desbordamiento', subtitle: 'placa CIIM00068/69', depth: 3, mechanicalSubsystems: ['wash_station'], signalCategories: ['service', 'blank'] },
  { id: 'wash:heater_temp_protection', parentId: 'wash:heater', rootId: 'wash', label: 'Calefactor y sensores', subtitle: 'protección térmica · aislante', depth: 3, mechanicalSubsystems: ['wash_station'], signalCategories: ['temperature', 'water', 'service'] },

  { id: 'fluidics:pistons_8mm', parentId: 'fluidics:ceramic_pumps', rootId: 'fluidics', label: 'Pistones cerámicos 8 mm', subtitle: 'reactivos R1/R2', depth: 4, mechanicalSubsystems: ['fluidics'], signalCategories: ['r2', 'scheme', 'volume', 'dilution'] },
  { id: 'fluidics:piston_3mm', parentId: 'fluidics:ceramic_pumps', rootId: 'fluidics', label: 'Pistón 3 mm', subtitle: 'muestra', depth: 4, mechanicalSubsystems: ['fluidics'], signalCategories: ['dilution', 'volume', 'service'] },
  { id: 'fluidics:check_membranes', parentId: 'fluidics:check_valves', rootId: 'fluidics', label: 'Membranas de silicón', subtitle: 'retención y estanqueidad', depth: 4, mechanicalSubsystems: ['fluidics'], signalCategories: ['water', 'contamination', 'service'] },
  { id: 'fluidics:particle_filters', parentId: 'fluidics:check_valves', rootId: 'fluidics', label: 'Filtros de agua', subtitle: 'partículas y obstrucción', depth: 4, mechanicalSubsystems: ['fluidics'], signalCategories: ['water', 'contamination'] },
];

const HIERARCHY_BY_ID = new Map(BA400_HIERARCHY.map((definition) => [definition.id, definition]));
const CHILDREN_BY_PARENT = new Map<string, DriBa400HierarchyNodeDefinition[]>();

BA400_HIERARCHY.forEach((definition) => {
  if (!definition.parentId) return;
  CHILDREN_BY_PARENT.set(definition.parentId, [...(CHILDREN_BY_PARENT.get(definition.parentId) || []), definition]);
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const nodeMatchesSignal = (node: DriBa400HierarchyNodeDefinition, signal: DriRelationSignal) => {
  if (node.signalIds?.includes(signal.id)) return true;
  if (node.signalCategories?.includes(signal.category)) return true;
  if (!node.mechanicalSubsystems?.length) return false;
  return signal.suspectedSubsystems.some((subsystem) => node.mechanicalSubsystems?.includes(subsystem));
};

const subsystemCoverage = (profiles: DriReagentProfile[], subsystem: DriMechanicalSubsystemId) =>
  profiles.length > 0
    ? profiles.filter((profile) => profile.mechanicalSubsystems.value.includes(subsystem)).length / profiles.length
    : 0;

const hierarchySignalColor = (category: DriRelationSignal['category']) => {
  if (category === 'wavelength') return '#efbf69';
  if (category === 'reaction') return '#4fd0d7';
  if (category === 'technique') return '#38c5d3';
  if (category === 'trend') return '#5fd4ea';
  if (category === 'scheme' || category === 'r2') return '#76bee8';
  if (category === 'temperature') return '#ff9b68';
  if (category === 'storage') return '#f6a67c';
  if (category === 'water') return '#79d9c1';
  if (category === 'contamination') return '#6fd2b3';
  if (category === 'blank') return '#d9aa78';
  if (category === 'service') return '#ff676f';
  return '#9cb1c9';
};

const maxSignalScore = (signals: DriRelationSignal[]) => Math.max(...signals.map((signal) => signal.suspicionScore), 1);

export const buildBa400HierarchyGraph = ({
  profiles,
  signals,
}: {
  profiles: DriReagentProfile[];
  signals: DriRelationSignal[];
}): { nodes: DriGraphNode[]; edges: DriGraphEdge[] } => {
  const globalSignalPeak = maxSignalScore(signals);
  const directScores = new Map<string, number>();
  const nodeSignals = new Map<string, DriRelationSignal[]>();

  BA400_HIERARCHY.forEach((definition) => {
    const coverage = definition.mechanicalSubsystems?.length
      ? Math.max(...definition.mechanicalSubsystems.map((subsystem) => subsystemCoverage(profiles, subsystem)), 0)
      : 0;
    const matchedSignals = signals.filter((signal) => nodeMatchesSignal(definition, signal));
    nodeSignals.set(definition.id, matchedSignals);

    const signalScore = matchedSignals.reduce((max, signal) => {
      const score = clamp(signal.failedCoverage * 0.58 + signal.suspicionScore / globalSignalPeak, 0, 1.1);
      return Math.max(max, score);
    }, 0);

    const rootPresenceBoost = definition.alwaysVisible ? 0.22 : 0;
    const coverageScore = coverage * (definition.depth === 1 ? 0.9 : 0.72);
    const direct = clamp(Math.max(signalScore, coverageScore + rootPresenceBoost), 0, 1.24);
    directScores.set(definition.id, direct);
  });

  const aggregateScores = new Map<string, number>(directScores);
  [...BA400_HIERARCHY]
    .sort((left, right) => right.depth - left.depth)
    .forEach((definition) => {
      const ownScore = aggregateScores.get(definition.id) || 0;
      if (!definition.parentId) return;
      const parentScore = aggregateScores.get(definition.parentId) || 0;
      aggregateScores.set(definition.parentId, Math.max(parentScore, ownScore * 0.9));
    });

  const nodes: DriGraphNode[] = BA400_HIERARCHY.map((definition) => {
    const score = clamp(aggregateScores.get(definition.id) || 0, 0, 1);
    const direct = directScores.get(definition.id) || 0;
    const signalCount = (nodeSignals.get(definition.id) || []).length;
    return {
      id: ambientNodeId(definition.id),
      label: definition.label,
      subtitle: definition.subtitle,
      type: 'ambient_factor',
      clusterKey: `ambient:${definition.rootId}`,
      color: ROOT_COLORS[definition.rootId],
      emphasis: 0.38 + score * 0.98 + direct * 0.12,
      associationCount: Math.max(1, signalCount + (CHILDREN_BY_PARENT.get(definition.id)?.length || 0)),
      associationStrength: Math.max(definition.alwaysVisible ? 0.24 : 0.1, score),
      orbit: 'ambient',
      tier: definition.depth,
    };
  });

  const edges: DriGraphEdge[] = [];

  BA400_HIERARCHY.forEach((definition) => {
    if (!definition.parentId) return;
    const ownScore = aggregateScores.get(definition.id) || 0;
    const parentScore = aggregateScores.get(definition.parentId) || 0;
    edges.push({
      id: `${ambientNodeId(definition.parentId)}:${ambientNodeId(definition.id)}`,
      sourceId: ambientNodeId(definition.parentId),
      targetId: ambientNodeId(definition.id),
      color: ROOT_COLORS[definition.rootId],
      weight: 0.62 + ownScore * 0.8,
      relationType: 'ambient_hierarchy',
      opacity: 0.08 + Math.max(ownScore, parentScore) * 0.24,
      arcBias: (definition.depth - 2.5) * 0.18,
    });
  });

  signals.forEach((signal) => {
    const matchingDefinitions = BA400_HIERARCHY
      .filter((definition) => nodeMatchesSignal(definition, signal))
      .sort((left, right) => {
        if (right.depth !== left.depth) return right.depth - left.depth;
        return (aggregateScores.get(right.id) || 0) - (aggregateScores.get(left.id) || 0);
      });

    const deepest = matchingDefinitions[0]?.depth || null;
    const directTargets =
      deepest === null
        ? []
        : matchingDefinitions.filter((definition) => definition.depth === deepest).slice(0, 4);

    directTargets.forEach((definition, index) => {
      const relevance = aggregateScores.get(definition.id) || 0;
      edges.push({
        id: `${signalNodeId(signal.id)}:${ambientNodeId(definition.id)}`,
        sourceId: signalNodeId(signal.id),
        targetId: ambientNodeId(definition.id),
        color: hierarchySignalColor(signal.category),
        weight: 0.88 + signal.suspicionScore / 62,
        relationType: `signal_hierarchy:${signal.category}`,
        opacity: 0.16 + relevance * 0.42,
        arcBias: -0.38 + index * 0.24,
      });
    });
  });

  return { nodes, edges };
};

export const BA400_HIERARCHY_LABELS = Object.fromEntries(
  BA400_HIERARCHY.map((definition) => [definition.id, definition.label]),
);

export const BA400_HIERARCHY_DEFINITION = (nodeId: string) => HIERARCHY_BY_ID.get(nodeId) || null;
