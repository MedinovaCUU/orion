#!/usr/bin/env node
// ORION · Alexa interaction model (es-MX) generator.
//   node alexa/build-model.mjs   → alexa/skill-package/interactionModels/custom/es-MX.json
// Test names come from the function's own synonym table (supabase/functions/alexa/speech.ts), so what Alexa
// recognises and what the backend resolves never drift apart.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_SYNONYMS } from '../supabase/functions/alexa/speech.ts';
import { CASE_FILTERS, CASE_STATES, CLOSURE_REASONS, PEOPLE_SAMPLES } from '../supabase/functions/alexa/caseVocab.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'skill-package/interactionModels/custom/es-MX.json');

const slot = (name, type, samples) => ({ name, type, ...(samples ? { samples } : {}) });
const SERIE = slot('serie', 'AMAZON.NUMBER', ['{serie}', 'el {serie}', 'la {serie}', 'terminación {serie}', 'el que termina en {serie}', 'serie {serie}']);
const EQUIPO = slot('equipo', 'EQUIPO_REF', ['el de {equipo}', 'el equipo de {equipo}', '{equipo}', 'el de la {equipo}']);
const PRUEBA = (name = 'prueba') => slot(name, 'PRUEBA', [`{${name}}`, `de {${name}}`, `la de {${name}}`]);
const ORDINAL = slot('ordinal', 'ORDINAL');
const TEXTO = slot('texto', 'AMAZON.SearchQuery');
const FILTRO_ESTADO = slot('condicion', 'CASO_FILTRO');
const FILTRO = slot('filtro', 'EQUIPO_REF');

const intents = [
  { name: 'AMAZON.CancelIntent', samples: ['cancela', 'olvídalo'] },
  { name: 'AMAZON.HelpIntent', samples: ['qué puedes hacer', 'qué sabes hacer', 'cómo funciona', 'qué te puedo preguntar'] },
  { name: 'AMAZON.StopIntent', samples: ['adiós', 'ya es todo orion', 'gracias orion', 'sal'] },
  { name: 'AMAZON.NavigateHomeIntent', samples: [] },
  { name: 'AMAZON.FallbackIntent', samples: [] },
  { name: 'AMAZON.YesIntent', samples: ['sí', 'sí por favor', 'dale', 'claro', 'adelante', 'va', 'órale', 'sí salió', 'salió bien', 'sí salió bien', 'correcto'] },
  { name: 'AMAZON.NoIntent', samples: ['no', 'no gracias', 'no salió', 'salió mal', 'no salió bien', 'falló', 'ninguna'] },
  { name: 'AMAZON.NextIntent', samples: ['siguiente', 'siguiente paso', 'continúa', 'sigue', 'listo siguiente', 'ya'] },
  { name: 'AMAZON.PreviousIntent', samples: ['anterior', 'paso anterior', 'regresa'] },
  { name: 'AMAZON.RepeatIntent', samples: ['repite', 'repítelo', 'otra vez', 'no escuché'] },
  { name: 'AMAZON.StartOverIntent', samples: ['empieza de nuevo', 'desde el principio'] },

  { name: 'ResumenIntent', samples: ['cómo vamos', 'cómo va todo', 'dame el resumen', 'resumen', 'resumen del día', 'cómo está la flota', 'cómo están los equipos', 'estado de la flota', 'qué está pasando', 'qué es lo urgente', 'cómo está todo', 'dame el panorama', 'resumen ejecutivo'] },
  { name: 'MiDiaIntent', slots: [slot('cuando', 'AMAZON.DATE')], samples: ['qué tengo hoy', 'qué tengo {cuando}', 'mi agenda', 'mi agenda de {cuando}', 'qué servicios tengo', 'qué servicios tengo {cuando}', 'mi día', 'cómo está mi día', 'qué hay en mi agenda', 'a dónde voy hoy', 'a dónde voy {cuando}', 'qué tengo planeado', 'qué tengo planeado {cuando}', 'mi semana'] },
  { name: 'MisTicketsIntent', samples: ['mis tickets', 'mis casos', 'mis reportes', 'qué tickets tengo', 'qué casos tengo', 'qué reportes tengo', 'cuáles son mis casos', 'cuáles son los reportes', 'mis casos abiertos', 'mis reportes abiertos', 'lee mis casos', 'léeme mis casos', 'léeme los reportes', 'qué casos tengo abiertos', 'tickets abiertos', 'casos abiertos', 'reportes abiertos', 'mis tickets abiertos', 'repíteme los casos', 'repíteme los reportes', 'repite los casos', 'repite los reportes', 'léeme otra vez los casos', 'dime los demás', 'dime los otros casos', 'cuáles son los demás', 'lista de reportes', 'qué otros casos hay'] },
  { name: 'SlaIntent', samples: ['qué casos están en riesgo', 'qué tickets están en riesgo', 'qué reportes están en riesgo', 'qué reportes están vencidos', 'reportes en riesgo', 'reportes vencidos', 'cuáles reportes se vencen', 'qué se vence', 'qué se vence hoy', 'qué casos se vencen', 'cómo va el SLA', 'cómo van los SLA', 'qué casos están por vencer', 'qué tickets están vencidos', 'casos vencidos', 'cuáles están en riesgo', 'casos en riesgo'] },
  {
    name: 'TicketDetalleIntent',
    slots: [ORDINAL, SERIE, EQUIPO],
    samples: [
      'el {ordinal}', 'la {ordinal}', 'detalle del {ordinal}', 'abre el {ordinal}', 'dime el {ordinal}', 'el caso {ordinal}', 'el {ordinal} caso', 'el reporte {ordinal}', 'el {ordinal} reporte',
      'el ticket del {serie}', 'cómo va el ticket del {serie}', 'cómo va el caso del {serie}', 'el caso del {serie}', 'el reporte del {serie}', 'cómo va el reporte del {serie}', 'cómo vamos con el reporte del {serie}', 'estatus del reporte del {serie}',
      'cómo va el reporte de {equipo}', 'cómo va el caso de {equipo}', 'el reporte de {equipo}', 'el caso de {equipo}',
      'detalle del caso', 'detalle del ticket', 'detalle del reporte', 'cómo va el reporte', 'cómo vamos con el reporte', 'cómo vamos con ese reporte', 'cómo va ese reporte', 'cómo va el caso', 'cómo vamos con el caso', 'cómo va ese caso', 'cómo va el ticket', 'cómo vamos con el ticket',
      'y el reporte', 'y ese reporte', 'y ese caso', 'qué pasa con el reporte', 'qué pasó con el reporte', 'qué pasa con ese caso', 'qué pasa con ese reporte', 'estatus del reporte', 'estado del reporte', 'estatus del caso', 'estatus del ticket', 'dime del reporte', 'dime más del reporte', 'dime más de ese caso',
      'el reporte que está en riesgo', 'el caso que está en riesgo', 'el reporte vencido', 'el caso vencido', 'cómo va el reporte vencido', 'quién tiene el reporte', 'quién tiene ese caso', 'a quién está asignado el reporte',
    ],
  },
  // ── Cases (tickets / reportes): lists, detail, history, closures, drafts ──
  { name: 'CasosFiltroIntent', slots: [FILTRO_ESTADO, FILTRO], samples: ['casos {condicion}', 'reportes {condicion}', 'tickets {condicion}', 'qué casos están {condicion}', 'qué reportes están {condicion}', 'qué tickets están {condicion}', 'cuáles casos están {condicion}', 'casos que están {condicion}', 'qué casos hay {condicion}', 'mis casos {condicion}', 'mis reportes {condicion}', 'léeme los casos {condicion}', 'casos de {filtro}', 'reportes de {filtro}', 'tickets de {filtro}', 'qué casos tiene {filtro}', 'qué casos hay de {filtro}', 'qué reportes hay de {filtro}', 'casos en {filtro}', 'reportes en {filtro}', 'casos {condicion} de {filtro}', 'reportes {condicion} de {filtro}', 'qué casos {condicion} hay de {filtro}', 'casos que tiene {filtro}'] },
  { name: 'ContarCasosIntent', slots: [FILTRO_ESTADO, FILTRO], samples: ['cuántos casos tengo', 'cuántos reportes tengo', 'cuántos tickets tengo', 'cuántos casos hay', 'cuántos reportes hay', 'cuántos casos abiertos hay', 'cuántos casos abiertos tengo', 'cuántos casos tengo {condicion}', 'cuántos casos {condicion} tengo', 'cuántos casos {condicion} hay', 'cuántos casos hay {condicion}', 'cuántos casos están {condicion}', 'cuántos reportes {condicion} hay', 'cuántos reportes tengo {condicion}', 'cuántos casos de {filtro} hay', 'cuántos casos tiene {filtro}', 'cuántos casos hay de {filtro}'] },
  { name: 'CasoDescripcionIntent', slots: [ORDINAL, SERIE, EQUIPO], samples: ['de qué se trata el caso', 'de qué se trata el reporte', 'de qué se trata', 'qué reportó el cliente', 'qué dice el reporte', 'qué reportaron', 'cuál es la falla del caso', 'cuál es el problema del caso', 'qué falla reportaron', 'de qué se trata el caso del {serie}', 'qué reportó el cliente del {serie}', 'qué dice el reporte del {serie}', 'descripción del caso', 'léeme el reporte', 'léeme la descripción', 'de qué se trata el {ordinal}'] },
  { name: 'CasoContactoIntent', slots: [ORDINAL, SERIE, EQUIPO], samples: ['quién reportó el caso', 'quién lo reportó', 'quién reportó', 'quién es el contacto', 'dame el contacto', 'contacto del cliente', 'teléfono del cliente', 'cuál es el teléfono del cliente', 'dame el teléfono', 'a quién le llamo', 'con quién hablo', 'correo del cliente', 'quién reportó el caso del {serie}', 'contacto del caso del {serie}', 'teléfono del cliente del {serie}'] },
  { name: 'CasoBitacoraIntent', slots: [ORDINAL, SERIE, EQUIPO], samples: ['léeme la bitácora', 'qué dice la bitácora', 'bitácora del caso', 'qué se ha hecho en el caso', 'qué se ha hecho', 'historial del caso', 'qué movimientos tiene el caso', 'últimos movimientos', 'qué avances tiene', 'qué avances tiene el caso', 'bitácora del {serie}', 'qué se ha hecho en el caso del {serie}', 'qué avances tiene el caso del {serie}', 'léeme la bitácora del {ordinal}'] },
  { name: 'HistorialEquipoIntent', slots: [SERIE, EQUIPO], samples: ['historial del {serie}', 'historial de casos del {serie}', 'qué casos ha tenido el {serie}', 'casos anteriores del {serie}', 'historial del equipo {serie}', 'qué reportes ha tenido el {serie}', 'qué casos ha tenido el equipo de {equipo}', 'historial de {equipo}', 'historial de casos de {equipo}', 'qué fallas ha tenido el {serie}', 'historial del equipo', 'qué casos ha tenido este equipo', 'historial de casos'] },
  { name: 'MisCierresIntent', slots: [slot('cuando', 'AMAZON.DATE')], samples: ['cuántos casos cerré', 'cuántos casos cerré {cuando}', 'cuántos casos he cerrado', 'cuántos reportes cerré', 'cuántos reportes cerré {cuando}', 'qué casos cerré', 'qué casos cerré {cuando}', 'mis cierres', 'mis cierres de {cuando}', 'cuántos casos se cerraron', 'cuántos casos se cerraron {cuando}', 'cuántos cierres llevo', 'cómo voy con los cierres'] },
  { name: 'MisBorradoresIntent', samples: ['qué borradores tengo', 'mis borradores', 'tengo borradores', 'qué tengo por aprobar', 'qué falta por aprobar', 'borradores pendientes', 'qué dejé en borrador'] },
  // ── Cases: writes (asked «sí / no / borrador»; first response and closure also «confirmo») ──
  { name: 'AvanceIntent', slots: [TEXTO], samples: ['agrega un avance {texto}', 'registra un avance {texto}', 'avance {texto}', 'agrega al caso {texto}', 'registra en el caso {texto}', 'agrega a la bitácora {texto}', 'registra en la bitácora {texto}', 'pon en la bitácora {texto}', 'agrega un avance', 'registra un avance', 'quiero agregar un avance', 'agrega un avance al caso'] },
  { name: 'LlamadaIntent', slots: [TEXTO], samples: ['registra una llamada {texto}', 'agrega una llamada {texto}', 'llamé al cliente {texto}', 'hablé con el cliente {texto}', 'registra que llamé al cliente {texto}', 'registra que hablé con el cliente {texto}', 'registra una llamada', 'agrega una llamada'] },
  { name: 'VisitaIntent', slots: [TEXTO], samples: ['registra una visita {texto}', 'agrega una visita {texto}', 'visité al cliente {texto}', 'fui con el cliente {texto}', 'registra que fui con el cliente {texto}', 'registra una visita', 'agrega una visita'] },
  { name: 'DiagnosticoCasoIntent', slots: [TEXTO], samples: ['registra el diagnóstico {texto}', 'agrega un diagnóstico {texto}', 'el diagnóstico del caso es {texto}', 'registra un diagnóstico {texto}', 'registra el diagnóstico', 'agrega un diagnóstico al caso'] },
  { name: 'PiezaCasoIntent', slots: [TEXTO], samples: ['registra una pieza {texto}', 'registra un cambio de pieza {texto}', 'cambié la pieza {texto}', 'agrega una pieza {texto}', 'registra la refacción {texto}', 'se instaló la refacción {texto}', 'registra una pieza', 'registra un cambio de pieza'] },
  { name: 'EscalamientoIntent', slots: [TEXTO], samples: ['escala el caso {texto}', 'escala el reporte {texto}', 'registra un escalamiento {texto}', 'escalamiento {texto}', 'escálalo {texto}', 'escala el caso', 'registra un escalamiento'] },
  { name: 'NotaInternaIntent', slots: [TEXTO], samples: ['agrega una nota interna {texto}', 'nota interna {texto}', 'registra una nota interna {texto}', 'deja una nota interna {texto}', 'agrega una nota interna', 'nota interna'] },
  { name: 'EstadoCasoIntent', slots: [slot('estado', 'ESTADO_CASO', ['{estado}', 'a {estado}', 'en {estado}', 'como {estado}']), SERIE], samples: ['pasa el caso a {estado}', 'pásalo a {estado}', 'ponlo en {estado}', 'ponlo como {estado}', 'pon el caso en {estado}', 'pon el caso como {estado}', 'cambia el estado a {estado}', 'cambia el caso a {estado}', 'márcalo como {estado}', 'marca el caso como {estado}', 'déjalo en {estado}', 'pasa el reporte a {estado}', 'el caso está {estado}', 'el caso queda {estado}', 'pasa el caso del {serie} a {estado}'] },
  { name: 'RespuestaClienteIntent', slots: [TEXTO], samples: ['registra la respuesta al cliente {texto}', 'respuesta al cliente {texto}', 'le respondí al cliente {texto}', 'ya le respondí al cliente {texto}', 'le contesté al cliente {texto}', 'registra que le respondí al cliente {texto}', 'primera respuesta {texto}', 'registra la primera respuesta {texto}', 'registra la respuesta al cliente', 'registra la primera respuesta', 'ya le respondí al cliente'] },
  { name: 'CerrarCasoIntent', slots: [slot('razon', 'MOTIVO_CIERRE', ['{razon}', 'como {razon}', 'quedó {razon}', 'por {razon}', 'ciérralo como {razon}']), SERIE], samples: ['cierra el caso', 'cierra el reporte', 'cierra el ticket', 'cierra este caso', 'cierra ese caso', 'cierra el caso como {razon}', 'cierra el caso por {razon}', 'cierra el reporte como {razon}', 'ciérralo como {razon}', 'da por cerrado el caso', 'quiero cerrar el caso', 'cerrar el caso', 'cierra el caso del {serie}', 'cierra el caso del {serie} como {razon}', 'ciérralo'] },
  { name: 'AsignarCasoIntent', slots: [slot('persona', 'PERSONA', ['{persona}', 'a {persona}', 'asígnaselo a {persona}']), SERIE, ORDINAL], samples: ['{persona}', 'a {persona}', '{persona} por favor', 'a {persona} por favor', 'que sea {persona}', 'con {persona}', 'se lo asignas a {persona}', 'asigna el {ordinal} a {persona}', 'asígnale el {ordinal} a {persona}', 'el {ordinal} asígnaselo a {persona}', 'dáselo a {persona}', 'mejor a {persona}', 'mejor asígnaselo a {persona}', 'asigna el caso a {persona}', 'asígnale el caso a {persona}', 'asígnaselo a {persona}', 'asígnalo a {persona}', 'pásale el caso a {persona}', 'reasigna el caso a {persona}', 'asigna el reporte a {persona}', 'que lo atienda {persona}', 'asigna el caso del {serie} a {persona}', 'asigna el caso', 'asigna el ticket a {persona}', 'asígnale el ticket a {persona}', 'pásale el ticket a {persona}', 'asígnale el reporte a {persona}', 'asigna el ticket del {serie} a {persona}', 'asigna el reporte del {serie} a {persona}', 'que lo vea {persona}', 'que se lo lleve {persona}', 'asígnale este caso a {persona}', 'que le asigne el caso a {persona}', 'le asigne el caso a {persona}'] },
  { name: 'TomarCasoIntent', slots: [ORDINAL, SERIE, EQUIPO], samples: ['asígnamelo', 'asígnamelo a mí', 'me lo asigno', 'yo lo tomo', 'tomo el caso', 'asígname el caso', 'yo lo atiendo', 'asígname el reporte', 'asígname el ticket', 'asígname este caso', 'asígname ese caso', 'asígname este ticket', 'asígname ese ticket', 'asígname un ticket', 'asígname un caso', 'ponlo a mi nombre', 'pónmelo a mí', 'yo me encargo', 'yo me hago cargo', 'me lo quedo', 'quiero ese caso', 'tomo ese reporte', 'asígname el caso del {serie}', 'asígname el reporte del {serie}', 'asígname el ticket del {serie}', 'asígname el caso de {equipo}', 'asígname el {ordinal}', 'asígname el {ordinal} caso', 'que me asigne el caso', 'que me asigne el ticket', 'que me asigne el reporte', 'me asigne el caso', 'me asigne el ticket', 'me asigne el caso del {serie}'] },
  { name: 'JustificarDemoraIntent', slots: [TEXTO], samples: ['aprueba la demora {texto}', 'justifica la demora {texto}', 'aprueba el retraso {texto}', 'la demora fue por {texto}', 'justificación de la demora {texto}', 'aprueba la demora', 'justifica la demora'] },
  { name: 'DetalleIntent', slots: [TEXTO], samples: ['detalle {texto}', 'el detalle es {texto}', 'solución {texto}', 'lo que se hizo fue {texto}', 'se hizo {texto}', 'se cerró porque {texto}', 'le dije {texto}', 'le expliqué {texto}', 'la justificación es {texto}'] },
  { name: 'BorradorIntent', samples: ['borrador', 'guárdalo como borrador', 'déjalo como borrador', 'como borrador', 'en borrador', 'mejor como borrador', 'déjalo en borrador', 'guárdalo en borradores', 'mándalo a borrador'] },
  { name: 'ConfirmoIntent', samples: ['confirmo', 'sí confirmo', 'lo confirmo', 'confirmo el cierre', 'confirmo el envío', 'confírmalo', 'envíalo', 'confirmado'] },
  { name: 'EquipoIntent', slots: [SERIE, EQUIPO], samples: ['cómo está el {serie}', 'cómo está el equipo {serie}', 'cómo está el equipo de {equipo}', 'cómo está el de {equipo}', 'estado del {serie}', 'estado del equipo {serie}', 'revisa el {serie}', 'revisa el equipo de {equipo}', 'qué tiene el {serie}', 'qué le pasa al {serie}', 'cómo va el {serie}', 'cómo está el analizador de {equipo}', 'cómo está el que termina en {serie}', 'revisa el equipo', 'cómo está el equipo', 'estado del equipo de {equipo}'] },
  { name: 'SerieIntent', slots: [SERIE, EQUIPO], samples: ['{serie}', 'el {serie}', 'terminación {serie}', 'la terminación {serie}', 'serie {serie}', 'el que termina en {serie}', 'termina en {serie}', 'el de {equipo}', 'el equipo de {equipo}'] },
  { name: 'AlarmasIntent', slots: [SERIE, EQUIPO], samples: ['qué alarmas tiene el {serie}', 'qué alarmas tiene', 'qué alarmas hay', 'alarmas del {serie}', 'alarmas de {equipo}', 'qué equipos tienen alarma', 'qué equipos están en fatal', 'qué equipos están en alarma fatal', 'historial de alarmas del {serie}', 'qué alarmas tuvo el {serie}', 'qué alarmas ha tenido', 'historial de alarmas', 'qué alarmas tiene el equipo de {equipo}'] },
  { name: 'AlarmaInfoIntent', slots: [slot('codigo', 'AMAZON.NUMBER', ['{codigo}', 'la {codigo}', 'el {codigo}', 'alarma {codigo}'])], samples: ['qué significa la alarma {codigo}', 'qué es la alarma {codigo}', 'qué es el error {codigo}', 'qué significa el error {codigo}', 'alarma {codigo}', 'error {codigo}', 'explícame la alarma {codigo}', 'dónde está la alarma {codigo}', 'qué significa el código {codigo}'] },
  { name: 'ControlesIntent', slots: [SERIE, EQUIPO, PRUEBA()], samples: ['pasaron los controles', 'pasaron los controles del {serie}', 'cómo salieron los controles', 'cómo salieron los controles del {serie}', 'cómo están los controles', 'cómo están los controles del {serie}', 'cómo salió el control de {prueba}', 'cómo está el control de {prueba}', 'controles del {serie}', 'controles de {prueba}', 'cómo salió el control de {prueba} en el {serie}', 'pasó el control', 'hay controles rechazados', 'cómo salieron los controles de {equipo}'] },
  { name: 'CalibracionIntent', slots: [SERIE, PRUEBA()], samples: ['cómo quedó la calibración de {prueba}', 'cuándo se calibró {prueba}', 'cuándo fue la última calibración de {prueba}', 'última calibración de {prueba}', 'calibración de {prueba} en el {serie}', 'cómo están las calibraciones', 'cómo quedó la calibración', 'cuándo calibraron {prueba}', 'cómo están las calibraciones del {serie}'] },
  { name: 'CurvaIntent', slots: [SERIE, PRUEBA()], samples: ['muéstrame la curva de {prueba}', 'muéstrame la curva de reacción de {prueba}', 'curva de reacción de {prueba}', 'cómo se ve la curva de {prueba}', 'enséñame la curva de {prueba}', 'curva de {prueba} del {serie}', 'muéstrame la curva', 'la curva de reacción', 'muéstrame la curva de reacción'] },
  { name: 'IfuIntent', slots: [PRUEBA(), slot('dato', 'IFU_DATO')], samples: ['cuál es la {dato} de {prueba}', 'cuál es el {dato} de {prueba}', 'qué {dato} tiene {prueba}', '{dato} de {prueba}', 'dime la {dato} de {prueba}', 'dime el {dato} de {prueba}', 'qué dice la IFU de {prueba} sobre {dato}', 'según la IFU cuál es la {dato} de {prueba}'] },
  { name: 'EstabilidadIntent', slots: [PRUEBA()], samples: ['cuánto dura {prueba} a bordo', 'cuánto dura abierto {prueba}', 'estabilidad a bordo de {prueba}', 'cuánto aguanta {prueba} en el equipo', 'cuántos días dura {prueba} abierto'] },
  { name: 'InterferenciasIntent', slots: [PRUEBA()], samples: ['qué interfiere con {prueba}', 'qué interferencias tiene {prueba}', 'interferencias de {prueba}', 'la hemólisis afecta {prueba}', 'la bilirrubina afecta {prueba}', 'la lipemia afecta {prueba}'] },
  { name: 'LoteIntent', slots: [slot('lote', 'AMAZON.NUMBER'), PRUEBA()], samples: ['está vigente el lote {lote} de {prueba}', 'cuándo caduca el lote {lote} de {prueba}', 'qué lotes de {prueba} hay', 'lotes de {prueba}', 'caducidad de {prueba}', 'cuándo caduca {prueba}', 'el lote {lote} de {prueba}', 'qué lotes de {prueba} están documentados', 'lote {lote} de {prueba}'] },
  {
    name: 'DiagnosticoIntent',
    slots: [SERIE, EQUIPO, slot('pa', 'PRUEBA', ['{pa}', '{pa} y {pb}', '{pa} {pb} y {pc}', 'falla {pa}', 'fallan {pa} y {pb}', 'sale fuera {pa}', '{pa} sale fuera', '{pa} y {pb} salen fuera']), slot('pb', 'PRUEBA'), slot('pc', 'PRUEBA')],
    samples: ['diagnostica el {serie}', 'diagnostica el equipo {serie}', 'diagnostica el equipo de {equipo}', 'haz un diagnóstico del {serie}', 'ayúdame con un diagnóstico', 'quiero diagnosticar', 'diagnóstico', 'diagnostica', 'diagnostica el equipo', 'el {serie} tiene {pa} fuera de control', 'en el {serie} sale fuera {pa}', 'en el {serie} falla {pa}', 'en el {serie} fallan {pa} y {pb}', '{pa} sale fuera', '{pa} y {pb} salen fuera', '{pa} {pb} y {pc} salen fuera', 'falla {pa}', 'fallan {pa} y {pb}', '{pa} está fuera de control', '{pa} y {pb} están fuera de control', 'diagnostica el {serie} {pa} fuera', 'diagnostica el {serie} con {pa} fuera', 'por qué falla {pa}', 'por qué falla {pa} en el {serie}', 'por qué sale fuera {pa}', 'tengo {pa} fuera de control', 'tengo {pa} y {pb} fuera de control'],
  },
  { name: 'PruebasFueraIntent', slots: [slot('pa', 'PRUEBA'), slot('pb', 'PRUEBA'), slot('pc', 'PRUEBA')], samples: ['también falla {pa}', 'también sale fuera {pa}', 'también {pa} sale fuera', 'también fallan {pa} y {pb}', 'agrega {pa} como fallida', 'también {pa} está fuera'] },
  { name: 'PruebasBienIntent', slots: [slot('pa', 'PRUEBA'), slot('pb', 'PRUEBA'), slot('pc', 'PRUEBA')], samples: ['{pa} sale bien', '{pa} y {pb} salen bien', '{pa} {pb} y {pc} salen bien', 'salen bien {pa} y {pb}', 'salen bien {pa} {pb} y {pc}', 'sale bien {pa}', '{pa} está bien', '{pa} y {pb} están bien', '{pa} {pb} y {pc} están bien', 'bien {pa} {pb} y {pc}', 'las que salen bien son {pa} {pb} y {pc}', 'las demás salen bien', 'ninguna sale bien', 'todas las demás están bien'] },
  { name: 'PorQueIntent', samples: ['por qué', 'por qué crees eso', 'explícame', 'por qué esa hipótesis', 'en qué te basas', 'por qué dices eso', 'cuál es la evidencia', 'explícame el diagnóstico', 'por qué lo descartas'] },
  { name: 'OtrasHipotesisIntent', samples: ['qué más podría ser', 'qué otra cosa puede ser', 'cuál es la segunda opción', 'otras hipótesis', 'qué otras causas hay', 'y si no es eso', 'qué otras opciones hay'] },
  { name: 'GuiaIntent', slots: [ORDINAL], samples: ['guíame', 'guíame en la verificación', 'guíame en la {ordinal}', 'guíame con la {ordinal}', 'guíame con la {ordinal} hipótesis', 'cómo lo verifico', 'qué reviso', 'qué hago', 'qué pasos sigo', 'dame los pasos', 'cómo lo compruebo', 'empieza la verificación', 'verifica la {ordinal}', 'paso a paso'] },
  { name: 'ResueltoIntent', samples: ['ya quedó', 'se resolvió', 'quedó resuelto', 'ya funciona', 'ya se arregló', 'ya está bien', 'listo quedó', 'ya salen bien los controles', 'sí se resolvió', 'ya pasó el control'] },
  { name: 'NoResueltoIntent', samples: ['no se resolvió', 'sigue fallando', 'sigue igual', 'no quedó', 'no funcionó', 'todavía falla', 'sigue fuera de control', 'no se arregló'] },
  { name: 'ParcialIntent', samples: ['se resolvió a medias', 'quedó a medias', 'mejoró pero no del todo', 'se resolvió en parte', 'mejoró un poco'] },
  { name: 'ComoSeResolvioIntent', slots: [slot('accion', 'AMAZON.SearchQuery')], samples: ['lo resolví {accion}', 'lo arreglé {accion}', 'se arregló {accion}', 'la solución fue {accion}', 'se solucionó {accion}', 'quedó resuelto {accion}'] },
  { name: 'AvisosIntent', samples: ['qué avisos tengo', 'tengo avisos', 'qué alertas tengo', 'mis avisos', 'mis alertas', 'lee mis avisos', 'léeme los avisos', 'qué hay de nuevo', 'avisos', 'alertas'] },
  { name: 'AcuseIntent', samples: ['enterado', 'de acuerdo lo atiendo', 'acuso recibo', 'recibido', 'lo atiendo', 'entendido', 'ya lo vi', 'enterada'] },
  { name: 'ActivarAvisosIntent', samples: ['activa los avisos', 'activa las alertas', 'avísame', 'activa las notificaciones', 'quiero recibir avisos'] },
  { name: 'DesactivarAvisosIntent', samples: ['desactiva los avisos', 'desactiva las alertas', 'ya no me avises', 'apaga los avisos', 'desactiva las notificaciones'] },
  { name: 'AbrirTicketIntent', slots: [slot('motivo', 'AMAZON.SearchQuery')], samples: ['abre un ticket {motivo}', 'abre un ticket por {motivo}', 'abre un ticket para {motivo}', 'levanta un ticket {motivo}', 'levanta un caso {motivo}', 'abre un caso {motivo}', 'crea un ticket {motivo}', 'reporta {motivo}', 'abre un ticket de {motivo}'] },
  { name: 'RefaccionIntent', slots: [slot('pieza', 'AMAZON.SearchQuery')], samples: ['pide {pieza}', 'solicita {pieza}', 'pide una refacción {pieza}', 'solicita la refacción {pieza}', 'necesito la refacción {pieza}', 'pide la pieza {pieza}', 'ordena {pieza}'] },
  { name: 'DictarIntent', samples: ['dicta una nota', 'quiero dictar', 'dictar nota', 'agrega una nota al caso', 'agrega una nota al ticket', 'dicta el reporte', 'quiero dictar el reporte', 'nota de servicio', 'dictado', 'quiero dictar una nota'] },
  { name: 'AnotaIntent', slots: [slot('texto', 'AMAZON.SearchQuery')], samples: ['anota {texto}', 'agrega {texto}', 'escribe {texto}', 'nota {texto}', 'apunta {texto}'] },
  { name: 'FinDictadoIntent', samples: ['es todo', 'terminé', 'listo es todo', 'fin del dictado', 'ya terminé', 'eso es todo', 'guarda la nota'] },
  { name: 'PreguntaIntent', slots: [slot('consulta', 'AMAZON.SearchQuery')], samples: ['pregunta {consulta}', 'pregúntale {consulta}', 'orion {consulta}'] },
  { name: 'QueEncontrasteIntent', samples: ['qué encontraste', 'ya tienes la respuesta', 'y entonces', 'dime qué encontraste', 'ya terminaste', 'cuál fue el resultado', 'qué resultó', 'ya está'] },
  { name: 'VincularIntent', samples: ['vincula este dispositivo', 'con qué cuenta estoy', 'quién está vinculado', 'vincular cuenta', 'a quién pertenece este dispositivo'] },
];

const unacc = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pruebaValues = Object.entries(TEST_SYNONYMS).map(([code, words]) => ({
  id: code.replace(/[^A-Za-z0-9_]+/g, '_'),
  name: { value: words[0].toLowerCase(), synonyms: [...new Set(words.slice(1).map((w) => w.toLowerCase()).concat(words.map((w) => unacc(w).toLowerCase())))].filter((w) => w !== words[0].toLowerCase()).slice(0, 12) },
}));
const ORDS = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
const ORD_SYN = [['primer', 'primera', 'número uno'], ['segunda', 'número dos'], ['tercer', 'tercera', 'número tres'], ['cuarta'], ['quinta'], ['sexta'], ['séptima'], ['octava'], ['novena'], ['décima']];
const types = [
  { name: 'PRUEBA', values: pruebaValues },
  { name: 'ORDINAL', values: ORDS.map((o, i) => ({ id: String(i + 1), name: { value: o, synonyms: ORD_SYN[i] } })) },
  {
    name: 'IFU_DATO',
    values: [
      { id: 'estabilidad', name: { value: 'estabilidad', synonyms: ['estabilidad a bordo', 'duración a bordo', 'vida a bordo', 'estabilidad abierto'] } },
      { id: 'interferencias', name: { value: 'interferencias', synonyms: ['interferencia', 'interferentes', 'qué interfiere'] } },
      { id: 'linealidad', name: { value: 'linealidad', synonyms: ['rango lineal', 'límite de linealidad', 'rango de medición'] } },
      { id: 'deteccion', name: { value: 'límite de detección', synonyms: ['detección', 'sensibilidad', 'límite de cuantificación', 'LOD'] } },
      { id: 'precision', name: { value: 'precisión', synonyms: ['coeficiente de variación', 'CV', 'repetibilidad', 'reproducibilidad'] } },
      { id: 'blanco', name: { value: 'blanco', synonyms: ['blanco de reactivo', 'absorbancia del blanco', 'límite del blanco'] } },
      { id: 'caducidad', name: { value: 'caducidad', synonyms: ['vencimiento', 'fecha de caducidad', 'lotes'] } },
    ],
  },
  ...[['CASO_FILTRO', CASE_FILTERS], ['ESTADO_CASO', CASE_STATES], ['MOTIVO_CIERRE', CLOSURE_REASONS]].map(([name, table]) => ({
    name,
    values: Object.entries(table).map(([id, words]) => ({ id, name: { value: words[0], synonyms: [...new Set([...words.slice(1), ...words.map(unacc)])].filter((w) => w !== words[0]).slice(0, 12) } })),
  })),
  { name: 'PERSONA', values: PEOPLE_SAMPLES.map((v, i) => ({ id: `p${i}`, name: { value: v } })) },
  // Filled per session with the fleet's clients and cities (Dialog.UpdateDynamicEntities); a few static values keep it valid.
  { name: 'EQUIPO_REF', values: ['falcon', 'monterrey', 'guadalajara', 'ciudad de méxico', 'puebla', 'querétaro', 'hospital', 'laboratorio'].map((v, i) => ({ id: `s${i}`, name: { value: v } })) },
];

// Dialog model: lets the skill elicit missing slots ("¿De qué equipo?", "¿Qué pruebas salen fuera?").
const ELICIT = {
  serie: ['¿De qué equipo? Dime la terminación de la serie.', '¿Qué equipo? Por ejemplo: cero cuatro siete tres.'],
  pa: ['¿Qué pruebas salen fuera de control?', '¿Qué prueba falla?'],
  prueba: ['¿De qué prueba?', '¿Qué prueba?'],
  codigo: ['¿Qué código de alarma?'],
  razon: ['¿Cómo lo cierro: solucionado, visita programada, sin respuesta del cliente, o cierre administrativo?'],
  persona: ['¿A quién se lo asigno?'],
};
const dialogIntents = intents
  .filter((i) => (i.slots ?? []).some((s) => ELICIT[s.name]))
  .map((i) => ({
    name: i.name,
    delegationStrategy: 'SKILL_RESPONSE',
    confirmationRequired: false,
    prompts: {},
    slots: i.slots.map((s) => ({ name: s.name, type: s.type, elicitationRequired: false, confirmationRequired: false, prompts: ELICIT[s.name] ? { elicitation: `Elicit.Slot.${i.name}.${s.name}` } : {} })),
  }));
const prompts = dialogIntents.flatMap((i) => i.slots.filter((s) => ELICIT[s.name]).map((s) => ({ id: `Elicit.Slot.${i.name}.${s.name}`, variations: ELICIT[s.name].map((value) => ({ type: 'PlainText', value })) })));

const model = {
  interactionModel: {
    languageModel: {
      invocationName: 'servicio orión',
      intents: intents.map((i) => ({ name: i.name, ...(i.slots ? { slots: i.slots } : {}), samples: [...new Set(i.samples)] })),
      types,
    },
    dialog: { intents: dialogIntents, delegationStrategy: 'SKILL_RESPONSE' },
    prompts,
  },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(model, null, 2)}\n`);
// The skill echoes every slot of an intent in Dialog.ElicitSlot (Alexa+ rejects an updatedIntent without them).
const slotsOut = join(here, '../supabase/functions/alexa/intentSlots.generated.ts');
const intentSlots = Object.fromEntries(intents.filter((i) => i.slots?.length).map((i) => [i.name, i.slots.map((s) => s.name)]));
writeFileSync(slotsOut, `// Generated by alexa/build-model.mjs — do not edit.\nexport const INTENT_SLOTS: Record<string, string[]> = ${JSON.stringify(intentSlots)};\n`);
const utterances = model.interactionModel.languageModel.intents.reduce((n, i) => n + i.samples.length, 0);
console.log(`es-MX.json: ${intents.length} intents, ${utterances} sample utterances, ${types.length} slot types`);
