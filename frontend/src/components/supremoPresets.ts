export interface SupremoShowroomPreset {
  alias: string;
  model: string;
  serial: string;
  supremoId: string;
}

export const SUPREMO_SHOWROOM_PRESETS: SupremoShowroomPreset[] = [
  {
    alias: 'A15 Showroom',
    model: 'A15',
    serial: '831055847',
    supremoId: '958113330',
  },
  {
    alias: 'BA200 Showroom',
    model: 'BA200',
    serial: '832001973',
    supremoId: '909548874',
  },
  {
    alias: 'BA400 Showroom',
    model: 'BA400',
    serial: '834001902',
    supremoId: '792529172',
  },
];

export const normalizeSerialLookup = (value: string | null | undefined) =>
  String(value ?? '').replace(/\0/g, '').trim();

export const getSupremoShowroomPreset = (serial: string | null | undefined) => {
  const normalizedSerial = normalizeSerialLookup(serial);
  return SUPREMO_SHOWROOM_PRESETS.find((preset) => preset.serial === normalizedSerial) || null;
};
