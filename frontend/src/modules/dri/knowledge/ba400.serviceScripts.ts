import type {
  DriMechanicalSubsystemId,
  DriServiceScriptDefinition,
  DriServiceUtilityId,
} from '../types/dri.types';

const SOURCE_REFERENCE =
  'BA400-program data/FwScripts/Factory/BA400/FactoryFwScriptsDataDecrypted.xml';

const createScript = (
  id: string,
  actionId: string,
  description: string,
  utilityIds: DriServiceUtilityId[],
  subsystems: DriMechanicalSubsystemId[],
  instructionCodes: string[],
): DriServiceScriptDefinition => ({
  id,
  actionId,
  description,
  utilityIds,
  subsystems,
  instructionCodes,
  sourceReference: SOURCE_REFERENCE,
});

export const BA400_SERVICE_SCRIPTS: DriServiceScriptDefinition[] = [
  createScript('14', 'REACTIONS_HOME_ROTOR', 'takes Reader Panel and Photometry to Home', ['photometry', 'metrology'], ['optical_system', 'reaction_rotor'], ['GLF.MR.MHO']),
  createScript('88', 'REACTIONS_ROTOR_HOME_WELL1', 'takes Reactions Rotor to Home and move Photometry to configured well', ['photometry', 'baseline_darkness_current', 'metrology'], ['optical_system', 'reaction_rotor'], ['GLF.MR.MPV', 'GLF.FO.FAC']),
  createScript('105', 'REACTIONS_ROTOR_HOME_WELL_FOR_THERMO', 'takes Reactions Rotor to Home and move to desired well for thermo measuring', ['thermostatting'], ['reaction_rotor'], ['GLF.MR.MPV', 'GLF.FO.FAC']),
  createScript('2019', 'WS_HEATER_TEST', 'Performs WS Heater Thermos Test', ['thermostatting', 'washing_station'], ['wash_station'], ['GLF.MP.MPV', 'SF1.M1.MPV', 'GLF.MP.MMA', 'SF1.B6.DCS', 'SF1.B7.DCS', 'SF1.B8.DCS', 'SF1.B9.DCS', 'SF1.B10.DCS', 'SF1.B6.DCE', 'SF1.B7.DCE', 'SF1.B10.DCE', 'SF1.GE1.DCS', 'GLF.MP.MMR', 'SF1.M1.MMR', 'SF1.GE1.DCE', 'SF1.B8.DCE', 'SF1.B9.DCE', 'GLF.MR.MMR']),
  createScript('3001', 'SAMPLE_LEVEL_DET', "Moves the sample arm to the indicated samples rotor's position", ['level_detection'], ['sample_arm', 'level_detection'], ['RM1.MR.MPV', 'RM1.MR.MMA', 'BM1.MH.MMA', 'DM1.DE.LDE']),
  createScript('3002', 'REAGENT1_LEVEL_DET', "Moves the reagent1 arm to the indicated reagents rotor's position", ['level_detection'], ['reagent_arm_r1', 'level_detection'], ['RR1.MR.MPV', 'RR1.MR.MMA', 'BR1.MH.MMA', 'DR1.DE.LDE']),
  createScript('3003', 'REAGENT2_LEVEL_DET', "Moves the reagent2 arm to the indicated reagents rotor's position", ['level_detection'], ['reagent_arm_r2', 'level_detection'], ['RR1.MR.MPV', 'RR1.MR.MMA', 'BR2.MH.MMA', 'DR2.DE.LDE']),
  createScript('3004', 'REACTIONS_ROTOR_LEVEL_DETECTION_MOVEMENT', "Moves the wash station to read (internally) the level of reactions rotor's well", ['level_detection', 'washing_station'], ['wash_station', 'reaction_rotor', 'level_detection'], ['GLF.MP.MPV', 'GLF.MP.MMA', 'GLF.MP.MMR']),
  createScript('1031', 'JE1_MR2_HOME', 'Reagent 2 Dosing Motor Home', ['motors_valves_pumps', 'positioning'], ['reagent_arm_r2', 'fluidics'], ['JE1.M3.MHO']),
  createScript('1032', 'JE1_MR2_REL', 'Reagent 2 Dosing Motor Relative', ['motors_valves_pumps', 'positioning'], ['reagent_arm_r2', 'fluidics'], ['JE1.M3.MMR']),
  createScript('1033', 'JE1_MR2_ABS', 'Reagent 2 Dosing Motor Absolute', ['motors_valves_pumps', 'positioning'], ['reagent_arm_r2', 'fluidics'], ['JE1.M3.MMA']),
  createScript('1055', 'JE1_B3_ON', 'Internal Dosing Reagent2 Pump ON', ['motors_valves_pumps', 'conditioning'], ['reagent_arm_r2', 'fluidics'], ['JE1.E3.EON', 'JE1.B3.DCS']),
  createScript('1056', 'JE1_B3_OFF', 'Internal Dosing Reagent2 Pump OFF', ['motors_valves_pumps', 'conditioning'], ['reagent_arm_r2', 'fluidics'], ['JE1.E3.EOF', 'JE1.B3.DCE']),
  createScript('1065', 'JE1_EV3_ON', 'Internal Dosing Reagent2 Valve ON', ['motors_valves_pumps', 'conditioning'], ['reagent_arm_r2', 'fluidics'], ['JE1.E3.EON']),
  createScript('1066', 'JE1_EV3_OFF', 'Internal Dosing Reagent2 Valve OFF', ['motors_valves_pumps', 'conditioning'], ['reagent_arm_r2', 'fluidics'], ['JE1.E3.EOF']),
  createScript('96', 'MIXER1_ON', 'Mixer1 ON', ['positioning', 'stress_mode'], ['stirrer'], ['SF1.AG1.DCS']),
  createScript('98', 'MIXER2_ON', 'Mixer2 ON', ['positioning', 'stress_mode'], ['stirrer'], ['SF1.AG2.DCS']),
  createScript('103', 'MIXER1_HOME_POLAR_CORRECTION', 'Performs a special mixer 1 home for its correction', ['positioning', 'stress_mode'], ['stirrer'], ['BA1.MH.MHO']),
  createScript('104', 'MIXER2_HOME_POLAR_CORRECTION', 'Performs a special mixer 2 home for its correction', ['positioning', 'stress_mode'], ['stirrer'], ['BA2.MH.MHO']),
  createScript('57', 'WASHING_STATION_HOME_Z', 'takes Washing Station to Vertical Home', ['washing_station', 'positioning'], ['wash_station'], ['GLF.MP.MHO']),
  createScript('58', 'WASHING_STATION_ABS_Z', 'Washing Station Absolute Vertical Movement respect to Home', ['washing_station', 'positioning'], ['wash_station'], ['GLF.MP.MPV', 'GLF.MP.MMA']),
  createScript('59', 'WASHING_STATION_REL_Z', 'Washing Station Relative Vertical Movement in steps', ['washing_station', 'positioning'], ['wash_station'], ['GLF.MP.MMR']),
  createScript('1101', 'SF1_B1_ON', 'External Washing Samples Pump ON', ['washing_station', 'motors_valves_pumps'], ['wash_station', 'fluidics'], ['SF1.B1.DCS']),
  createScript('1103', 'SF1_B2_ON', 'External Washing Reagent1/Mixer2 Pump ON', ['washing_station', 'motors_valves_pumps'], ['wash_station', 'fluidics', 'stirrer'], ['SF1.B2.DCS']),
  createScript('1105', 'SF1_B3_ON', 'External Washing Reagent2/Mixer1 Pump ON', ['washing_station', 'motors_valves_pumps'], ['wash_station', 'fluidics', 'stirrer'], ['SF1.B3.DCS']),
  createScript('1201', 'SF1_B6_ON', 'Aspiration Needles 2,3 Pump ON', ['washing_station', 'motors_valves_pumps'], ['wash_station', 'fluidics'], ['SF1.B6.DCS']),
  createScript('1209', 'SF1_B10_ON', 'Aspiration Needles 1 Pump ON', ['washing_station', 'motors_valves_pumps'], ['wash_station', 'fluidics'], ['SF1.B10.DCS']),
  createScript('1304', 'SF1_GE1_ON', 'Dispensing Valves ON', ['motors_valves_pumps', 'conditioning'], ['fluidics'], ['SF1.GE1.DCS']),
  createScript('1305', 'SF1_GE1_OFF', 'Dispensing Valves OFF', ['motors_valves_pumps', 'conditioning'], ['fluidics'], ['SF1.GE1.DCE']),
  createScript('1410', 'ACTIVE_ALL_ASPIRATION_PUMPS', 'Activate all aspiration pumps', ['motors_valves_pumps', 'conditioning'], ['fluidics', 'wash_station'], ['SF1.B6.DCS', 'SF1.B7.DCS', 'SF1.B8.DCS', 'SF1.B9.DCS', 'SF1.B10.DCS']),
  createScript('1412', 'WASH_STATION_ITEMS_TO_DEFAULT', 'Set Wash Station to its default state', ['washing_station', 'conditioning'], ['wash_station', 'fluidics'], ['SF1.M1.MHO', 'SF1.B6.DCS', 'SF1.B7.DCS', 'SF1.B8.DCS', 'SF1.B9.DCS', 'SF1.B10.DCS']),
  createScript('1415', 'HOME_EXTERNAL_TIP_WASHING', 'Set homes for external tip washing', ['washing_station', 'positioning'], ['wash_station'], ['SF1.B1.DCE', 'SF1.B2.DCE', 'SF1.B3.DCE']),
  createScript('1416', 'HOME_WASH_STATION_ASPIRATION', 'Set home for wash station aspiration', ['washing_station', 'positioning'], ['wash_station'], ['SF1.B6.DCE', 'SF1.B7.DCE', 'SF1.B8.DCE', 'SF1.B9.DCE', 'SF1.B10.DCE']),
  createScript('1418', 'WASH_STATION_ITEMS_TO_DEFAULT_FOR_V1', 'Set Wash Station to its default state using hardware of BA400v1', ['washing_station', 'conditioning'], ['wash_station', 'fluidics'], ['SF1.M1.MHO']),
  createScript('4001', 'SWITCH_ON_BARCODE', 'Switch on BarCode Laser and Motor', ['barcode'], ['barcode'], ['RM1.CB.BLN', 'RR1.CB.BLN']),
  createScript('4002', 'SWITCH_OFF_BARCODE', 'Switch off BarCode Laser and Motor', ['barcode'], ['barcode'], ['RM1.CB.BLF', 'RR1.CB.BLF']),
];

const BA400_SERVICE_SCRIPT_MAP = new Map(
  BA400_SERVICE_SCRIPTS.map((script) => [script.id, script]),
);

export const getBa400ServiceScripts = (scriptIds: string[]) =>
  scriptIds
    .map((scriptId) => BA400_SERVICE_SCRIPT_MAP.get(scriptId))
    .filter((script): script is DriServiceScriptDefinition => Boolean(script));

export const getBa400ScriptsForUtility = (utilityId: DriServiceUtilityId) =>
  BA400_SERVICE_SCRIPTS.filter((script) => script.utilityIds.includes(utilityId));
