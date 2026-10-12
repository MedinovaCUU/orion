// Registros reales de servicios_historial (Biosisa) con nombres de clientes y contactos anonimizados.
export const serviceHistoryRows = [
 {
  "cda": null,
  "cds": null,
  "datos_origen": {
   "categoria": "Otros",
   "cliente_biosisa": "Laboratorio de prueba",
   "contacto": "Contacto del laboratorio",
   "software": "5.5.5"
  },
  "detalle_averia": null,
  "detalle_solucion": "Atención telefónica",
  "diagnostico": "Otros",
  "duracion_min": null,
  "fecha_fin": null,
  "fecha_servicio": "2026-10-08",
  "hora_fin": null,
  "hora_inicio": null,
  "id": "fixture-1",
  "id_legacy": 635,
  "motivo": "Servicio telefónico: Controles Mau-Albumin",
  "origen": "biosisa_llamada",
  "profiles": {
   "nombre_completo": "Ricardo Vilchis"
  },
  "servicios_refacciones": [],
  "ticket_id": null,
  "tipo_servicio": "otro",
  "trabajo_realizado": "El usuario solicita dar de alta la técnica de MAU Alb mediante la carga del *test file*. Se corrobora que la programación sea\ncorrecta y se realizan pruebas utilizando los siguientes reactivos y materiales de referencia: Reactivo de microalbúmina:**\nreferencia 31321, lote 4A. Calibrador: referencia 31130, lote 1A. Control de orina nivel 1: referencia 18054, lote 2A.\nComo resultado, se obtienen factores de calibración dentro del rango óptimo (350-380), con valores similares a los\nobservados en otros equipos. Sin embargo, el control de calidad presenta un resultado de 24.1 mg/dL, con buena\nrepetibilidad, pero cercano al límite superior del intervalo establecido para ese lote (16.2-24.2 mg/dL). Se identifica un\ncomportamiento similar en otros usuarios que han trabajado con el mismo lote de controles. Por este motivo, se escala el\ncaso al servicio técnico de España para documentar y evaluar el rendimiento teórico; sin embargo, hasta el momento no se\nha recibido respuesta. Finalmente, el usuario no pudo realizar pruebas con muestras de pacientes, debido a que los\nreactivos, el calibrador y el control se agotaron durante las pruebas realizadas."
 },
 {
  "cda": null,
  "cds": null,
  "datos_origen": {
   "asistentes": "Q. Asistente uno, Q. Asistente dos",
   "cliente_biosisa": "Laboratorio de prueba",
   "comentarios_laboratorio": "Añadir una explicación teórica del fundamento de la técnica. Una explicación más a detalle sobre el software.",
   "concepto": "Comodato",
   "encargado_laboratorio": "Q. Responsable del laboratorio",
   "firma": "Solicitar firma",
   "modelo": "Y15",
   "temas": {
    "Alarmas y avisos": "si",
    "Cambio de lámpara": "no",
    "Configuración del analizador": "si",
    "Control de calidad": "si",
    "Descripción del equipo": "si",
    "Mantenimiento": "si",
    "Mantenimiento diario": "si",
    "Mantenimiento mensual": "si",
    "Mantenimiento semanal": "si",
    "Pantalla monitor": "si",
    "Posicionamiento de la sesión": "si",
    "Preparación de la sesión de trabajo": "si",
    "Procesamiento de las muestras": "si",
    "Programación de controles": "no",
    "Programación de perfiles": "no",
    "Programación de técnicas": "si",
    "Revisión de los resultados": "si"
   },
   "tipo_biosisa": "Capacitación"
  },
  "detalle_averia": null,
  "detalle_solucion": "Capacitación (Comodato)",
  "diagnostico": null,
  "duracion_min": null,
  "fecha_fin": "2026-10-07",
  "fecha_servicio": "2026-10-05",
  "hora_fin": "11:15:00",
  "hora_inicio": null,
  "id": "fixture-2",
  "id_legacy": 790,
  "motivo": "Capacitación (Comodato)",
  "origen": "biosisa_capacitacion",
  "profiles": {
   "nombre_completo": "Carlos Muniz"
  },
  "servicios_refacciones": [],
  "ticket_id": null,
  "tipo_servicio": "capacitacion",
  "trabajo_realizado": "Se realizo la instalación del equipo, capacitación, calibracion del método de histamina junto con control acuoso spikesolution.\nSugerencias: cambiar el equipo a una mesa estable."
 },
 {
  "cda": "AX03",
  "cds": "SX04",
  "datos_origen": {
   "cliente_biosisa": "Laboratorio de prueba",
   "modelo": "BA400",
   "observacion_horario": "Hora fin anterior a la hora de inicio en el reporte",
   "sector": "Particular"
  },
  "detalle_averia": "Mantenimiento preventivo agendado",
  "detalle_solucion": "RUTINA MTTO PREVENTIVO. Piezas cambiadas: bombas B8 y B9; se reparó sensor de estación de lavado; galga de balanza pendiente de cambio.",
  "diagnostico": "bombas B8 y B9 dañadas. sensor de estacion de lavado dañado. base de bascula de estacion de laado floja.",
  "duracion_min": null,
  "fecha_fin": "2025-12-18",
  "fecha_servicio": "2025-12-18",
  "hora_fin": "15:25:00",
  "hora_inicio": "20:30:00",
  "id": "fixture-3",
  "id_legacy": 2079,
  "motivo": "Mantto Preventivo",
  "origen": "biosisa_servicio",
  "profiles": {
   "nombre_completo": "Hector Cortés"
  },
  "servicios_refacciones": [
   {
    "cantidad": 2,
    "refacciones_catalogo": {
     "codigo_refaccion": "AC16581",
     "descripcion": "DIAPHRAGM KNF PUMP (GREEN ) - Bomba para mover o dosificar líquidos en el sistema. (Pág: SM-A15 p. 161) [A15]"
    }
   }
  ],
  "ticket_id": null,
  "tipo_servicio": "preventivo",
  "trabajo_realizado": "se xambian bombas dañadas. se repara sensor de estacion de lavado. se fija base de bote de estacion de lavado, el sensor o \"galga\" no funciona\ncorrectamente. se solicita refaccion para realizar el cambio."
 },
 {
  "cda": "AX03",
  "cds": "SX04",
  "datos_origen": {
   "cliente_biosisa": "Laboratorio de prueba",
   "modelo": "Y15"
  },
  "detalle_averia": "Mantenimiento preventivo agendado",
  "detalle_solucion": "RUTINA MTTO PREVENTIVO. Piezas cambiadas: lámpara halógena 6V/10W y sellos de bomba.",
  "diagnostico": "Mantenimiento preventivo",
  "duracion_min": 180,
  "fecha_fin": "2025-05-08",
  "fecha_servicio": "2025-05-08",
  "hora_fin": "12:00:00",
  "hora_inicio": "09:00:00",
  "id": "fixture-4",
  "id_legacy": 1636,
  "motivo": "Mantto Preventivo",
  "origen": "biosisa_servicio",
  "profiles": {
   "nombre_completo": "Francisco"
  },
  "servicios_refacciones": [
   {
    "cantidad": 1,
    "refacciones_catalogo": {
     "codigo_refaccion": "LA10429",
     "descripcion": "Lámpara halógena 6V/10W — A15 - 6V/10W HALOGEN"
    }
   },
   {
    "cantidad": 1,
    "refacciones_catalogo": {
     "codigo_refaccion": "AC11527",
     "descripcion": "8MM PISTON SEAL KIT - Sello que evita fugas y mantiene la presión correcta del pistón. (Pág: SM-SPICA p. 48) [SPICA]"
    }
   }
  ],
  "ticket_id": null,
  "tipo_servicio": "preventivo",
  "trabajo_realizado": "Mantenimiento preventivo de realiza limpieza general del equipo ajuste de brazo manipulador ajuste de rotor de reacciones cambio de lámpara\ntest de fotometría con éxito cambio de sello, equipo se válida con blanco y muestras"
 },
 {
  "cda": "AX03",
  "cds": "SX04",
  "datos_origen": {
   "cliente_biosisa": "Laboratorio de prueba",
   "modelo": "A25",
   "observacion_horario": "Hora fin anterior a la hora de inicio en el reporte"
  },
  "detalle_averia": "Mantenimiento preventivo agendado",
  "detalle_solucion": "RUTINA MTTO PREVENTIVO. Piezas cambiadas: lámpara halógena 12V/20W.",
  "diagnostico": "Mantenimiento preventivo",
  "duracion_min": null,
  "fecha_fin": "2025-02-25",
  "fecha_servicio": "2025-02-25",
  "hora_fin": "13:30:00",
  "hora_inicio": "23:30:00",
  "id": "fixture-5",
  "id_legacy": 1453,
  "motivo": "Mantto Preventivo",
  "origen": "biosisa_servicio",
  "profiles": {
   "nombre_completo": "Alfredo Acevedo"
  },
  "servicios_refacciones": [
   {
    "cantidad": 1,
    "refacciones_catalogo": {
     "codigo_refaccion": "LA10418",
     "descripcion": "Lámpara halógena 12V/20W — A25 - 12V/20W HALOGE"
    }
   }
  ],
  "ticket_id": null,
  "tipo_servicio": "preventivo",
  "trabajo_realizado": "Se atendió a realizar las actividades de mantenimiento, Ajustando el brazo de muestras,Cambiando la lámpara halogena, limpiando el armazón\ndel equipo, ajustando el rotor de reacción, revisando las cuentas del fotómetro"
 }
];
