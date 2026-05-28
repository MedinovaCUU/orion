# Modulo de Solicitud de Viaje para Servicios Tecnicos

## A. Resumen Ejecutivo
Este modulo convierte la planeacion de un servicio tecnico en una solicitud de viaje trazable, validada y casi lista para reservar. El ingeniero captura el contexto del servicio, busca opciones, elige vuelo preferido y respaldo, y el sistema genera una solicitud administrativa estructurada con score operativo, semaforo de riesgo, snapshot completo de la oferta y mensaje listo para reserva.

### Resultado esperado
- Menos intercambio manual entre ingenieria y administracion.
- Menos reservas sobre vuelos ambiguos o inviables.
- Mejor trazabilidad desde el folio del servicio hasta el itinerario reservado.
- Base lista para conectar un proveedor real de vuelos sin rehacer el flujo.

## B. Flujo de Usuario Paso a Paso
1. El ingeniero abre `Planear Nuevo Servicio` desde `Servicios`.
2. Captura ingeniero, ticket, cliente, equipo, sitio, ruta, fechas y ventana del servicio.
3. El modulo valida coherencia de viaje y servicio antes de buscar.
4. Se genera una sesion de busqueda con resultados clasificados por costo, rapidez, escalas y conveniencia.
5. Cada opcion muestra score operativo, riesgo, alertas y si esta fuera de politica.
6. El ingeniero selecciona vuelo preferido y vuelo respaldo para ida y regreso.
7. El modulo genera una solicitud final con texto listo para enviar.
8. La solicitud se guarda en base de datos, con historial, sesion de busqueda y snapshots de ofertas.
9. El panel administrativo muestra pendientes, urgentes, reservados y solicitudes que requieren cambios.
10. Administracion cambia el estado sin perder trazabilidad.

## C. Arquitectura Funcional
### Frontend
- `TravelPlannerModal.tsx`: wizard operativo de captura, busqueda, seleccion y resumen.
- `travelPlanner.ts`: reglas, scoring, payloads, resumen y adaptador actual de busqueda simulada.
- `TravelAdminPanel.tsx`: tablero de solicitudes con filtros y cambio de estatus.
- `Services.tsx`: integra tablero semanal + modulo de viaje + panel admin.

### Backend / Supabase
- `travel_requests`: entidad principal del flujo.
- `flight_search_sessions`: sesion de consulta y resultados.
- `flight_offer_snapshots`: fotos completas de ofertas elegidas.
- `travel_request_status_history`: trazabilidad de cambios.
- `travel_admin_notes`: notas operativas.
- `travel_policies`: reglas parametrizables de negocio.

### Integracion futura
- Reemplazar el generador mock por un proveedor real manteniendo el mismo contrato de `FlightSearchSession` y `FlightOffer`.

## D. Pantallas del Modulo
### 1. Solicitud
- Responsable del viaje.
- Motivo y tipo de servicio.
- Cliente, equipo y sitio.
- Ruta y aeropuertos.
- Fechas deseadas y ventana real del servicio.
- Requerimientos logísticos: equipaje, herramientas, auto.

### 2. Busqueda
- Resultados por tramo.
- Orden por: mas barato, mas rapido, menos escalas, mas temprano, mas conveniente.
- Badges de:
  - directo,
  - fuera de presupuesto,
  - compatible con servicio,
  - regreso viable.

### 3. Seleccion
- Bloques para ida preferida, ida respaldo, regreso preferido, regreso respaldo.
- Caja de mensaje para administracion.

### 4. Solicitud Final
- Resumen ejecutivo.
- Semaforo de riesgo.
- Plantilla automatica de mensaje.
- Acciones: copiar, exportar, email, WhatsApp, enviar solicitud.

### 5. Panel Administrativo
- Filtros por estatus, prioridad y busqueda libre.
- Cards de solicitud con score, costo, riesgo y folio.
- Cambio de estado directo.
- Resumen listo para revisar sin abrir capturas externas.

## E. Logica de Negocio
### Score de conveniencia
Se calcula sobre 100 y penaliza:
- llegada despues de la hora del servicio,
- buffer insuficiente antes de la intervencion,
- salida de regreso antes de terminar el servicio,
- escalas largas,
- demasiadas escalas,
- red-eye,
- duraciones largas,
- costo fuera de presupuesto.

### Recomendacion
- `recommended`: compatible y operativamente sano.
- `acceptable`: viable, con algunas observaciones.
- `risky`: genera friccion operativa o riesgo alto.
- `out_of_policy`: rebasa reglas base o no cumple ventana.

### Semaforo de riesgo
- `green`: seguro para reservar.
- `amber`: requiere validacion.
- `red`: alto riesgo de falla operativa.

### Regla clave
No se optimiza solo precio. El modulo privilegia cumplimiento del servicio y reducción de reprocesos.

## F. Validaciones
### Obligatorias
- Ingeniero.
- ID interno.
- Cliente.
- Aeropuertos y ciudades.
- Folio de servicio.
- Justificacion.
- Contacto y telefono.
- Inicio del servicio.

### Coherencia
- Regreso no anterior a salida.
- Fin del servicio no anterior al inicio.
- No enviar solicitud sin opcion preferida y respaldo.

### Alertas inteligentes
- llegada despues del inicio del servicio,
- buffer operativo menor al recomendado,
- regreso antes de concluir la visita,
- costo mayor al umbral,
- escala larga o riesgosa,
- horario de madrugada.

## G. Modelo de Datos
### Implementado en la migracion
#### `travel_requests`
- Cabeza de la solicitud.
- Guarda datos del ingeniero, servicio, ruta, urgencia, costos, payload y snapshot final.

#### `flight_search_sessions`
- Guarda criterios, proveedor, conteo y resultados crudos.

#### `flight_offer_snapshots`
- Guarda proveedor, aerolinea, numero de vuelo, horarios, precio, score, deeplink y payload completo.

#### `travel_request_status_history`
- Registro de cada cambio de estado con autor y motivo.

#### `travel_admin_notes`
- Notas visibles para administracion.

#### `travel_policies`
- Presupuesto, buffers, direct fare delta, red-eye y limites de escala.

### Mapeo a entidades pedidas
- `engineers`: usar `profiles`.
- `clients`: usar `clientes`.
- `service_orders`: usar `tickets` como orden de servicio actual; puede volverse vista o tabla dedicada despues.

## H. Propuesta de API / Endpoints
### Internos
- `POST /travel-requests/draft`
- `POST /travel-requests/search`
- `POST /travel-requests/:id/selection`
- `POST /travel-requests/:id/submit`
- `PATCH /travel-requests/:id/status`
- `POST /travel-requests/:id/notes`
- `GET /travel-requests`
- `GET /travel-requests/:id`

### Contrato con proveedor de vuelos
- `POST /providers/flights/search`
- `GET /providers/flights/session/:id`
- `GET /providers/flights/offer/:offerId`

El frontend actual ya esta preparado para adaptar la respuesta del proveedor al shape `FlightSearchSession`.

## I. Ejemplos JSON
### Request de borrador
```json
{
  "engineer_name": "Ana Rivera",
  "employee_number": "ING-042",
  "service_type": "preventivo",
  "service_reference": "TKT-001245",
  "origin_airport": "TIJ",
  "destination_airport": "MEX",
  "desired_departure_date": "2026-04-22",
  "desired_return_date": "2026-04-24",
  "priority": "alta",
  "request_payload": {
    "site_contact": "Luis Torres",
    "site_phone": "5551234567",
    "checkedBag": true,
    "specialTools": true
  }
}
```

### Response de busqueda
```json
{
  "id": "session-91233",
  "provider": "mock_operational_search",
  "searchedAt": "2026-04-17T18:05:00Z",
  "outbound": [
    {
      "id": "outbound-1",
      "airline": "Aeromexico",
      "flightNumber": "AE341",
      "departureAirport": "TIJ",
      "arrivalAirport": "MEX",
      "departureAt": "2026-04-22T07:15:00",
      "arrivalAt": "2026-04-22T10:20:00",
      "stops": 0,
      "price": 6280,
      "currency": "MXN",
      "fareType": "Flex",
      "cabin": "Economy",
      "convenienceScore": 91,
      "policyScore": 93,
      "riskLevel": "green",
      "recommendation": "recommended"
    }
  ]
}
```

### Snapshot de oferta elegida
```json
{
  "travel_request_id": "req-123",
  "leg_type": "outbound",
  "selection_role": "preferred",
  "provider": "mock_operational_search",
  "airline": "Aeromexico",
  "flight_number": "AE341",
  "origin_airport": "TIJ",
  "destination_airport": "MEX",
  "departure_at": "2026-04-22T07:15:00",
  "arrival_at": "2026-04-22T10:20:00",
  "price_amount": 6280,
  "currency": "MXN",
  "policy_status": "recommended",
  "risk_level": "green"
}
```

## J. Casos de Uso Principales
1. Preventivo programado con viaje redondo y compra normal.
2. Correctivo urgente con llegada antes de apertura del hospital.
3. Instalacion con herramientas especiales y equipaje documentado.
4. Capacitacion con regreso mismo dia.
5. Emergencia con prioridad critica y politica relajada solo bajo excepcion.

## K. Casos Borde y Errores
- No hay vuelos compatibles.
- Todos los vuelos estan fuera de politica.
- El ingeniero intenta enviar sin respaldo.
- El vuelo llega despues del inicio del servicio.
- El regreso sale antes de terminar la visita.
- El proveedor de vuelos devuelve sesion expirada.
- Administracion necesita pedir cambios sin perder la seleccion previa.

## L. Recomendaciones UX/UI
- Mantener wizard de cuatro pasos y no una forma gigante.
- Mostrar score, riesgo y advertencias directamente en cada card.
- Usar badges de prioridad y semaforo sin obligar a leer texto largo.
- Resumen final con lenguaje administrativo, no turistico.
- El panel admin debe responder primero a: “que hay pendiente, que urge, que se puede reservar ya”.

## M. Recomendaciones para Escalar
- Integrar proveedor real de vuelos manteniendo el contrato del adaptador.
- Agregar politicas por territorio, ingeniero o tipo de servicio.
- Soportar hoteles y autos como modulos hermanos del mismo request.
- Crear aprobaciones por monto.
- Agregar SLA administrativo y alertas automaticas.
- Medir ahorro de tiempo: tiempo desde solicitud hasta reservado, cambios solicitados, errores evitados.

## N. Base de Implementacion / Pseudocodigo
```text
capturarSolicitud()
  validarCampos()
  guardarBorrador()

buscarVuelos()
  criterios = construirCriterios(formulario)
  resultados = proveedor.search(criterios)
  resultadosScorados = score(resultados, politicas, ventanaServicio)
  guardarSearchSession(resultadosScorados)

seleccionarVuelos()
  elegirPreferidoYRespaldo()
  validarQueNoSeanIguales()

generarSolicitud()
  snapshot = guardarFlightOfferSnapshots()
  resumen = construirMensajeAdministrativo(snapshot, datosServicio)
  guardarTravelRequest(resumen)
  registrarStatus("solicitud_enviada")
```

## Archivos Implementados
- [TravelPlannerModal.tsx](/Users/ricardomontanezmiranda/Desktop/Biosystems%20Project/frontend/src/components/TravelPlannerModal.tsx:1)
- [TravelAdminPanel.tsx](/Users/ricardomontanezmiranda/Desktop/Biosystems%20Project/frontend/src/components/TravelAdminPanel.tsx:1)
- [travelPlanner.ts](/Users/ricardomontanezmiranda/Desktop/Biosystems%20Project/frontend/src/components/travelPlanner.ts:1)
- [servicesPlanning.ts](/Users/ricardomontanezmiranda/Desktop/Biosystems%20Project/frontend/src/components/servicesPlanning.ts:1)
- [Services.tsx](/Users/ricardomontanezmiranda/Desktop/Biosystems%20Project/frontend/src/components/Services.tsx:1)
- [20260417093000_add_travel_requests_module.sql](/Users/ricardomontanezmiranda/Desktop/Biosystems%20Project/supabase/migrations/20260417093000_add_travel_requests_module.sql:1)
