const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const parseBooleanFlag = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
};

// Regla operativa:
// ninguna integracion externa opcional debe alterar el flujo principal
// hasta estar conectada, probada y habilitada de forma explicita.
export const runtimeFlags = {
  flightSearchEnabled: parseBooleanFlag(import.meta.env.VITE_ENABLE_FLIGHT_SEARCH, true),
  travelRequestEmailEnabled: parseBooleanFlag(import.meta.env.VITE_ENABLE_TRAVEL_REQUEST_EMAIL, true),
  sparePartsRequestEmailEnabled: parseBooleanFlag(import.meta.env.VITE_ENABLE_SPARE_PARTS_REQUEST_EMAIL, true),
  serviceReportEmailEnabled: parseBooleanFlag(import.meta.env.VITE_ENABLE_SERVICE_REPORT_EMAIL, true),
  addressAutocompleteEnabled: parseBooleanFlag(import.meta.env.VITE_ENABLE_ADDRESS_AUTOCOMPLETE, false),
  supremoLaunchEnabled: parseBooleanFlag(import.meta.env.VITE_ENABLE_SUPREMO_LAUNCH, true),
};

export const getDisabledIntegrationMessage = (
  integration:
    | 'flightSearch'
    | 'travelRequestEmail'
    | 'sparePartsRequestEmail'
    | 'serviceReportEmail'
    | 'addressAutocomplete'
    | 'supremoLaunch',
) => {
  if (integration === 'flightSearch') {
    return 'La busqueda integrada de vuelos esta desactivada en esta configuracion. La captura actual no se pierde y puedes seguir operando con borrador hasta habilitar la conexion completa.';
  }

  if (integration === 'travelRequestEmail') {
    return 'El envio automatico de correo esta desactivado en esta configuracion. La solicitud debe seguir guardandose sin romper el flujo principal.';
  }

  if (integration === 'sparePartsRequestEmail') {
    return 'El envio automatico del correo de refacciones esta desactivado en esta configuracion. La solicitud debe seguir guardandose sin romper el flujo principal.';
  }

  if (integration === 'serviceReportEmail') {
    return 'El envio automatico del correo del reporte de servicio esta desactivado en esta configuracion. El registro del reporte debe seguir guardandose sin romper el flujo principal.';
  }

  if (integration === 'supremoLaunch') {
    return 'La apertura remota con Supremo esta desactivada en esta configuracion. El registro del equipo puede seguir editandose sin romper el flujo principal.';
  }

  return 'El autocompletado de direcciones esta desactivado hasta que la integracion quede conectada y validada por completo.';
};
