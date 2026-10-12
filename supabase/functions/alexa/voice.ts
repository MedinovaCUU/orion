// ORION · how things are SAID. The DRI engine, the BA400 alarm catalog and the BPL monitor speak in firmware English,
// abbreviations and internal bookkeeping ("BR1 Vertical Home Error", "1_3s", "Mover peso a patrón técnico", "QC",
// "valuesheet"). Engineers in the field need plain Spanish: what failed, where, what it means, what to do next.
// Codes stay on the Echo Show screen and in Orion web; speech never reads them.

import { canonicalTest, sayTest, TEST_SYNONYMS } from "./speech.ts";

// ── Parts and alarms ─────────────────────────────────────────────────────────
/** Firmware device prefixes → part as named in the lab. */
const DEVICE: Record<string, string> = {
  BR1: "brazo de reactivo 1", BR2: "brazo de reactivo 2", BM1: "brazo de muestra", AG1: "agitador 1", AG2: "agitador 2",
  DR1: "brazo de reactivo 1", DR2: "brazo de reactivo 2", DM1: "brazo de muestra", RR1: "rotor de reactivos", RM1: "rotor de muestras",
};

/** Spoken noun phrase for every BA400 alarm code that is not covered by the patterns below. */
const ALARM_ES: Record<string, string> = {
  "0": "sin errores",
  "1": "versión de firmware del procesador incompatible; hay que actualizar desde el repositorio",
  "2": "versiones de firmware distintas entre tarjetas; hay que actualizar desde el repositorio",
  "3": "error en el repositorio de firmware",
  "4": "error de verificación del firmware",
  "5": "error de ejecución del firmware",
  "6": "maniobras o ajustes que no coinciden; hay que actualizar desde el repositorio",
  "10": "error de comunicación interna entre tarjetas",
  "20": "instrucción rechazada por un error anterior",
  "21": "instrucción abortada por un error",
  "22": "falló la recuperación del analizador",
  "28": "no se pudo iniciar la prueba; esperará al siguiente ciclo",
  "34": "la prueba ya se había recibido en este ciclo",
  "35": "error en la tabla de programación de ciclos",
  "40": "instrucción desconocida o con parámetros incorrectos",
  "41": "instrucción no permitida en este estado",
  "42": "instrucción no permitida mientras corre otra",
  "43": "guion de comandos incorrecto",
  "45": "archivo de ajustes incorrecto",
  "61": "el módulo de electrolitos no respondió a tiempo",
  "70": "se abrió la tapa superior con el equipo trabajando",
  "99": "varios errores a la vez",
  "500": "error de posición inicial del rotor de reacciones",
  "501": "error del codificador del rotor de reacciones",
  "502": "paro de seguridad del rotor: el cabezal de lavado está abajo",
  "503": "tapa del rotor de reacciones abierta",
  "504": "colisión del cabezal de lavado",
  "510": "temperatura fuera de rango en el baño de reacciones de 37 grados",
  "511": "falla de las celdas Peltier del baño de reacciones",
  "512": "falla de los ventiladores del baño de reacciones",
  "520": "error de posición inicial del cabezal de lavado",
  "530": "no se detecta la tarjeta de fotometría",
  "540": "no se detecta la tarjeta de desbordamiento del rotor",
  "541": "desbordamiento en el rotor de reacciones",
  "550": "falta el rotor de reacciones",
  "551": "el rotor de reacciones se llenó durante el arranque",
  "552": "el rotor de reacciones se llenó durante la corrida",
  "553": "error de autocentrado del rotor de reacciones",
  "560": "tiempo agotado durante el arranque del banco óptico",
  "598": "la tarjeta de control del rotor no responde",
  "599": "reinicio de la tarjeta de control del rotor",
  "600": "error de posición inicial de la bomba de lavado",
  "610": "temperatura fuera de rango en el calentador de lavado",
  "611": "falla del calentador de lavado",
  "612": "falla del controlador de motor",
  "613": "falla del ventilador",
  "620": "lectura imposible del sensor de nivel de residuos",
  "621": "tarda demasiado en vaciar el depósito de residuos",
  "622": "no se detecta el sensor de nivel de residuos",
  "630": "lectura imposible del sensor de nivel de agua",
  "631": "tarda demasiado en llenar el depósito de agua destilada",
  "632": "no se detecta el sensor de nivel de agua",
  "640": "falla en la báscula de residuos de alta contaminación",
  "650": "falla en la báscula de solución de lavado",
  "670": "falla en el circuito de fluidos",
  "698": "la tarjeta de fluidos no responde",
  "699": "reinicio de la tarjeta de fluidos",
  "700": "error de posición inicial de la bomba de muestra",
  "701": "error de posición inicial de la bomba de reactivo 1",
  "702": "error de posición inicial de la bomba de reactivo 2",
  "710": "falla del detector de coágulos",
  "711": "obstrucción en el circuito de muestra",
  "798": "la tarjeta de jeringas no responde",
  "799": "reinicio de la tarjeta de jeringas",
};

/** "203", "DR1 Collision Detected" → "colisión en el brazo de reactivo 1". Never reads the code. */
export function alarmSpeech(code: string | null | undefined, description: string | null | undefined): string {
  const c = String(code ?? "").replace(/\D/g, "");
  if (c && ALARM_ES[c]) return ALARM_ES[c]!;
  const n = Number(c);
  if (n >= 660 && n <= 669) return `falla en la bomba ${n - 659} del circuito de fluidos`;
  if (n >= 671 && n <= 673) return `falla en la electroválvula ${n - 670} del circuito de fluidos`;
  if (n >= 720 && n <= 723) return `falla en la bomba ${n - 719} de la tarjeta de jeringas`;
  if (n >= 724 && n <= 731) return `falla en la electroválvula ${n - 723} de la tarjeta de jeringas`;
  const d = String(description ?? "").replace(/\[DEMO\]\s*/gi, "").trim();
  const m = d.match(/^(BR1|BR2|BM1|AG1|AG2|DR1|DR2|DM1|RR1|RM1)\s+(.*)$/i);
  if (m) {
    const dev = DEVICE[m[1]!.toUpperCase()]!;
    const what = m[2]!.toLowerCase();
    if (/vertical home error/.test(what)) return `error de posición inicial vertical del ${dev}`;
    if (/horizontal home error/.test(what)) return `error de posición inicial horizontal del ${dev}`;
    if (/vertical step loss/.test(what)) return `pérdida de pasos en el movimiento vertical del ${dev}`;
    if (/home.*recuperarse/.test(what)) return `el ${dev} no pudo volver a su posición inicial`;
    if (/board doesn't answer/.test(what)) return `la tarjeta del ${dev} no responde`;
    if (/^reset/.test(what)) return `reinicio de la tarjeta del ${dev}`;
    if (/freq detection/.test(what)) return `falla del detector de nivel del ${dev}`;
    if (/thermistor/.test(what)) return `falla del termistor de la aguja del ${dev}`;
    if (/heater/.test(what)) return `falla del calentador de la aguja del ${dev}`;
    if (/collision/.test(what)) return `colisión en el ${dev}`;
    if (/fridge temperature/.test(what)) return "temperatura fuera de rango en el refrigerador de reactivos";
    if (/fridge peltier/.test(what)) return "falla de las celdas Peltier del refrigerador de reactivos";
    if (/fridge fans/.test(what)) return "falla de los ventiladores del refrigerador de reactivos";
    if (/cover opened/.test(what)) return `tapa del ${dev} abierta`;
    if (/code bar reader time out/.test(what)) return `el lector de código de barras del ${dev} no respondió a tiempo`;
    if (/code bar reader/.test(what)) return `falla del lector de código de barras del ${dev}`;
    if (/home error/.test(what)) return `error de posición inicial del ${dev}`;
  }
  return d ? d.toLowerCase() : "una alarma sin descripción";
}

/** Catalog part names ("Brazo R1", "Refrigeración rotor rea") as said aloud. */
export function partSpeech(target: string | null | undefined): string {
  const t = String(target ?? "").split(" · ")[0]!.trim();
  const map: Array<[RegExp, string]> = [
    [/^Brazo R1$/i, "brazo de reactivo 1"], [/^Brazo R2$/i, "brazo de reactivo 2"], [/^Brazo S$/i, "brazo de muestra"],
    [/^Brazo A(\d)$/i, "agitador $1"], [/^Tarjeta brazo R(\d)$/i, "tarjeta del brazo de reactivo $1"], [/^Tarjeta brazo S$/i, "tarjeta del brazo de muestra"],
    [/^Refrigeración rotor rea$/i, "refrigerador de reactivos"], [/^Lector códigos rea$/i, "lector de códigos de reactivos"], [/^Lector códigos mue$/i, "lector de códigos de muestras"],
    [/^Tarjeta rea$/i, "tarjeta del rotor de reactivos"], [/^Tarjeta mue$/i, "tarjeta del rotor de muestras"], [/^Sensor de nivel res$/i, "sensor de nivel de residuos"],
    [/^Módulo ISE$/i, "módulo de electrolitos"],
  ];
  for (const [re, out] of map) if (re.test(t)) return t.replace(re, out);
  return t.toLowerCase();
}

// ── Quality control language ─────────────────────────────────────────────────
/** Westgard rule ids from the monitor ("1_3s", "R_4s", "10_x", "2of3_2s") explained in words. */
export function explainRule(rule: string): string {
  const r = rule.toLowerCase().replace(/\s+/g, "").replace(/-/g, "_");
  let m = r.match(/^1_?(\d)s$/);
  if (m) return `quedó a más de ${m[1]} desviaciones estándar de la media`;
  m = r.match(/^(\d+)_?(\d)s$/);
  if (m) return `${m[1]} resultados seguidos quedaron a más de ${m[2]} ${m[2] === "1" ? "desviación estándar" : "desviaciones estándar"} del mismo lado`;
  m = r.match(/^r_?(\d)s$/);
  if (m) return `entre dos controles de la misma corrida hay más de ${m[1]} desviaciones estándar de diferencia`;
  m = r.match(/^(\d+)_?x$/);
  if (m) return `${m[1]} resultados seguidos quedaron del mismo lado de la media`;
  m = r.match(/^(\d)of(\d)_?(\d)s$/);
  if (m) return `${m[1]} de ${m[2]} resultados quedaron a más de ${m[3]} desviaciones estándar`;
  m = r.match(/^(\d+)_?t$/);
  if (m) return `${m[1]} resultados seguidos van en la misma tendencia`;
  return `no cumplió la regla ${rule.replace(/_/g, " ")}`;
}

// ── DRI hypotheses ───────────────────────────────────────────────────────────
/** What each hypothesis means, said as the cause ("es {spoken}"). */
export const HYPOTHESIS_SPOKEN: Record<string, { cause: string; check: string }> = {
  "hyp:control": { cause: "un problema del control, del calibrador o de la preparación de la muestra", check: "si es el control, el calibrador o la preparación" },
  "hyp:optical": { cause: "un problema óptico o de fotometría", check: "si es la parte óptica" },
  "hyp:r2": { cause: "un problema al dispensar o mezclar el reactivo 2", check: "si es la dispensación del reactivo 2" },
  "hyp:temperature": { cause: "un problema de temperatura o de estabilidad del reactivo", check: "si es la temperatura o el reactivo" },
  "hyp:fluidics": { cause: "un problema de pipeteo o de fluídica", check: "si es el pipeteo o la fluídica" },
  "hyp:wash": { cause: "un problema de lavado o de arrastre entre muestras", check: "si es el lavado" },
  "hyp:software": { cause: "un error de configuración de la técnica", check: "si es la configuración" },
  "hyp:procedure-limitation": { cause: "una interferencia de la muestra que el inserto ya advierte", check: "si es una interferencia" },
  "hyp:metrology-range": { cause: "un resultado fuera del rango de medición del reactivo", check: "si el resultado está fuera de rango" },
};
export const hypothesisCause = (key: string, title: string) => HYPOTHESIS_SPOKEN[key]?.cause ?? humanize(title.replace(/^sospecha (de |óptica)?/i, (m) => (/óptica/i.test(m) ? "un problema óptico" : "un problema de ")).toLowerCase());
export const hypothesisCheck = (key: string, title: string) => HYPOTHESIS_SPOKEN[key]?.check ?? `si es ${hypothesisCause(key, title)}`;

/** Shared technical factor (contrast label) as said aloud: "Filtro/longitud 505 nm" → "el filtro de 505 nanómetros". */
export function factorSpeech(label: string): string {
  const l = String(label ?? "").trim();
  let m = l.match(/filtro\s*\/\s*longitud\s*(\d+)\s*nm/i);
  if (m) return `el filtro de ${m[1]} nanómetros`;
  m = l.match(/filtro de referencia\s*(\d+)\s*nm/i);
  if (m) return `el filtro de referencia de ${m[1]} nanómetros`;
  if (/^t[ée]cnica de punto final|^punto final/i.test(l)) return "la lectura de punto final";
  if (/cin[ée]tic/i.test(l)) return "la lectura cinética";
  if (/^monoreactiva/i.test(l)) return "el esquema de un solo reactivo";
  if (/^birreactiva|bireactiva/i.test(l)) return "el esquema de dos reactivos";
  m = l.match(/conservaci[oó]n\s*(-?\d+)\s*-\s*(\d+)/i);
  if (m) return `la conservación entre ${m[1]} y ${m[2]} grados`;
  if (/blanco inicial/i.test(l)) return "un blanco inicial crítico";
  if (/carryover|contaminaci/i.test(l)) return "la sensibilidad al arrastre entre muestras";
  if (/\bR2\b/.test(l)) return "el reactivo 2";
  return humanize(l.charAt(0).toLowerCase() + l.slice(1));
}

// ── Guided verification: one voice script per DRI checklist step ────────────
export interface VoiceCheck {
  /** What to do. */
  instruction: string;
  /** A yes/no question about what they saw. */
  question: string;
  /** Said after "sí" / "no". */
  yes: string;
  no: string;
  /** true when "sí" points TO the hypothesis (e.g. "¿hubo cambio de lote?"). */
  yesSupports: boolean;
}
export const VOICE_STEPS: Record<string, VoiceCheck> = {
  "opt-1": {
    instruction: "En el software de servicio, corre la utilidad Photometry.",
    question: "¿Las lecturas quedaron dentro de tolerancia y sin deriva?",
    yes: "Bien, la óptica en general está sana. Si solo falla una longitud de onda, sospecha más del filtro de esa longitud.",
    no: "Eso apunta a la parte óptica: revisa las cubetas, la línea base y la fotometría antes de cambiar piezas.",
    yesSupports: false,
  },
  "opt-2": {
    instruction: "Revisa la línea base y la corriente de oscuridad, con la utilidad Baseline and darkness current.",
    question: "¿La línea base está estable, sin ruido ni desplazamiento?",
    yes: "Entonces la óptica no explica la falla; conviene revisar el método o el reactivo.",
    no: "El ruido o el desplazamiento sugieren suciedad u óptica: prioriza la limpieza, las cubetas y la ruta óptica.",
    yesSupports: false,
  },
  "r2-1": {
    instruction: "Corre la utilidad Motors, valves and pumps.",
    question: "¿Las secuencias y los consumos salieron normales?",
    yes: "Bien, la dispensación del reactivo 2 se ve sana; el foco pasa al método o al reactivo.",
    no: "Eso apunta a la dispensación del reactivo 2: revisa la línea, la válvula, la bomba y el cebado.",
    yesSupports: false,
  },
  "r2-2": {
    instruction: "Revisa con la utilidad Positioning que el brazo de reactivo 2 y el agitador lleguen a su lugar.",
    question: "¿Llegan siempre a la misma posición?",
    yes: "Bien, eso le resta peso a una falla mecánica.",
    no: "Revisa el posicionamiento, los agitadores y el brazo de reactivo 2.",
    yesSupports: false,
  },
  "temp-1": {
    instruction: "Corre la utilidad Thermostatting.",
    question: "¿Las temperaturas están estables y dentro de rango?",
    yes: "Entonces la temperatura no es la causa; revisemos el reactivo o la configuración.",
    no: "Eso confirma un problema de temperatura: revisa los sensores y la refrigeración.",
    yesSupports: false,
  },
  "flu-1": {
    instruction: "Corre la misma muestra diluida 1 a 2, 1 a 4 y 1 a 5.",
    question: "¿Los resultados salen proporcionales a la dilución?",
    yes: "Bien, el pipeteo se ve proporcional; eso le resta peso a la fluídica.",
    no: "Si no son proporcionales, sospecha del pipeteo o de la mezcla. Si da exactamente la mitad, revisa el factor de dilución en el software.",
    yesSupports: false,
  },
  "flu-2": {
    instruction: "Corre la detección de nivel y el acondicionamiento, con la utilidad Level detection.",
    question: "¿La toma de muestra y de diluyente es consistente?",
    yes: "Bien; entonces revisa el software o el método.",
    no: "Eso apunta a una burbuja, una obstrucción o un error de nivel: revisa la fluídica y el pipeteo.",
    yesSupports: false,
  },
  "wash-1": {
    instruction: "Inspecciona la estación de lavado.",
    question: "¿El lavado y el secado son parejos, sin residuos?",
    yes: "Bien, eso le resta peso a la contaminación.",
    no: "Prioriza el lavado, las cubetas y los insumos de lavado.",
    yesSupports: false,
  },
  "ctrl-1": {
    instruction: "Revisa cómo se preparó el control y si cambió de lote o de frasco cuando empezó la falla.",
    question: "¿Hubo algún cambio de lote, de frasco o de preparación en ese momento?",
    yes: "Entonces lo más probable es el control o el calibrador: prepara un control nuevo, revisa caducidad y almacenamiento, y vuelve a correrlo.",
    no: "Si no hubo cambios, el problema puede ser técnico; sigamos.",
    yesSupports: true,
  },
  "limit-1": {
    instruction: "Compara la muestra o el control con los límites de interferencia del inserto: bilirrubina, hemólisis y lipemia.",
    question: "¿Alguna interferencia rebasa el límite del inserto?",
    yes: "Entonces la interferencia explica la desviación; no muevas piezas. Repite con dilución, con otra muestra o con otro método.",
    no: "Bien, la interferencia no lo explica; volvamos a revisar la parte técnica.",
    yesSupports: true,
  },
  "met-1": {
    instruction: "Compara el resultado con el límite de linealidad del inserto y revisa la unidad reportada.",
    question: "¿El valor queda dentro del rango lineal?",
    yes: "Bien, el rango no es el problema.",
    no: "Diluye y repite según el inserto antes de pensar en el equipo, y revisa cómo está configurada la dilución.",
    yesSupports: false,
  },
  "soft-1": {
    instruction: "Revisa la configuración de la técnica: factor, dilución, unidades y calibración activa.",
    question: "¿Todo está configurado correctamente?",
    yes: "Bien, eso descarta un error de configuración.",
    no: "Corrige la configuración o el sistema del laboratorio antes de tocar el equipo.",
    yesSupports: false,
  },
};

/** Confirmatory / corrective actions of the DRI rules, said naturally (fallback: humanize). */
const ACTIONS_ES: Record<string, string> = {
  "Ejecutar Photometry y revisar línea base / darkness current.": "Corre Photometry y revisa la línea base y la corriente de oscuridad.",
  "Comparar pruebas 340 nm contra filtros distintos.": "Compara las pruebas de 340 nanómetros contra las de otros filtros.",
  "Revisar cubetas, rotor de reacción y blanco de cubeta.": "Revisa las cubetas, el rotor de reacciones y el blanco de cubeta.",
  "Limpiar o revisar cubetas y sistema óptico antes de tocar refacciones.": "Antes de cambiar refacciones, limpia y revisa las cubetas y el sistema óptico.",
  "Corregir filtros / alineación solo después de confirmar desviación reproducible.": "Ajusta filtros o alineación solo si la desviación se repite.",
  "Comparar birreactivas contra monoreactivas equivalentes.": "Compara las pruebas de dos reactivos contra pruebas equivalentes de un solo reactivo.",
  "Verificar brazo R2, timing y mezcla.": "Revisa el brazo de reactivo 2, los tiempos y la mezcla.",
  "Revisar pumps / valves y conditioning.": "Revisa bombas, válvulas y el acondicionamiento.",
  "Purgar y condicionar antes de desmontar.": "Purga y acondiciona antes de desmontar.",
  "Revisar obstrucción, burbujas y válvulas previas a cambio de piezas.": "Antes de cambiar piezas, busca obstrucciones, burbujas y fallas de válvulas.",
  "Ejecutar Thermostatting.": "Corre la utilidad Thermostatting.",
  "Comparar enzimáticas sensibles vs endpoint estables.": "Compara las pruebas enzimáticas, que son sensibles a la temperatura, contra las de punto final.",
  "Revisar refrigeración y estabilidad a bordo.": "Revisa la refrigeración y la estabilidad a bordo de los reactivos.",
  "Confirmar temperatura del rotor y refrigerador antes de culpar al reactivo.": "Confirma la temperatura del rotor y del refrigerador antes de culpar al reactivo.",
  "Validar reactivo fresco y estabilidad a bordo.": "Prueba con reactivo fresco y revisa su estabilidad a bordo.",
  "Ejecutar linealidad 1:2, 1:4 y 1:5.": "Corre diluciones 1 a 2, 1 a 4 y 1 a 5.",
  "Verificar factor de dilución aplicado.": "Verifica el factor de dilución aplicado.",
  "Revisar burbujas, volumen muerto, válvulas y detección de nivel.": "Revisa burbujas, volumen muerto, válvulas y detección de nivel.",
  "Condicionar y purgar antes de desmontar.": "Acondiciona y purga antes de desmontar.",
  "Confirmar si LIS muestra valor corregido o crudo.": "Confirma si el sistema del laboratorio muestra el valor corregido o el crudo.",
  "Revisar estación de lavado y solución de lavado.": "Revisa la estación y la solución de lavado.",
  "Revisar residuos, agua destilada y carryover.": "Revisa los residuos, el agua destilada y el arrastre entre muestras.",
  "Corregir insumos de lavado y contaminación antes de cambiar piezas.": "Corrige los insumos de lavado y la contaminación antes de cambiar piezas.",
  "Revisar lote, preparación, caducidad y almacenamiento.": "Revisa el lote, la preparación, la caducidad y el almacenamiento del control y del calibrador.",
  "Validar calibración activa y técnica configurada.": "Verifica que la calibración activa y la técnica configurada sean las correctas.",
  "No mover piezas hasta descartar control/calibrador/reactivo.": "No muevas piezas hasta descartar el control, el calibrador y el reactivo.",
  "Comparar el resultado contra los umbrales IFU de bilirrubina, hemólisis y lipemia.": "Compara el resultado con los límites del inserto para bilirrubina, hemólisis y lipemia.",
  "Confirmar si la muestra o control exceden las limitaciones del procedimiento.": "Confirma si la muestra o el control rebasan las limitaciones del procedimiento.",
  "Repetir con dilución, nueva muestra o método alternativo cuando aplique.": "Repite con dilución, con una muestra nueva o con otro método si aplica.",
  "No mover piezas si el comportamiento coincide con una interferencia documentada.": "No muevas piezas si el comportamiento coincide con una interferencia documentada.",
  "Documentar la limitación del procedimiento y confirmar con la muestra/analito interferente.": "Documenta la limitación y confírmala con la muestra que interfiere.",
  "Comparar el valor obtenido con el límite de linealidad del IFU.": "Compara el valor obtenido con el límite de linealidad del inserto.",
  "Verificar dilución manual o automática y su factor de corrección.": "Verifica la dilución, manual o automática, y su factor de corrección.",
  "Repetir dentro del rango lineal antes de asumir un problema mecánico.": "Repite dentro del rango lineal antes de suponer un problema mecánico.",
  "Diluir y repetir según IFU antes de escalar a hardware.": "Diluye y repite según el inserto antes de escalar a una revisión del equipo.",
  "Confirmar unidad reportada y configuración de la técnica.": "Confirma la unidad reportada y la configuración de la técnica.",
  "Revisar técnica, factor de dilución y unidades.": "Revisa la técnica, el factor de dilución y las unidades.",
  "Corregir configuración antes de tocar hardware.": "Corrige la configuración antes de tocar el equipo.",
};
export const actionSpeech = (text: string) => ACTIONS_ES[text.trim()] ?? humanize(text);

/** Evidence the engine says is missing, as "me falta …". */
const MISSING_ES: Record<string, string> = {
  "Blanco fotométrico instrumental reciente en el monitor BPL": "un blanco fotométrico reciente del equipo",
  "Comparativo monoreactivo equivalente": "una prueba equivalente de un solo reactivo para comparar",
  "Evidencia BPL del monitor (blancos, calibraciones y QC del equipo)": "los blancos, calibraciones y controles del equipo",
  "Lote de control/calibrador": "el lote del control o del calibrador",
  "Referencia QC / valuesheet aplicada": "comparar el control contra su hoja de datos",
  "Resultado de Photometry / baseline": "el resultado de la prueba de fotometría",
  "Resultado de Thermostatting": "el resultado de la prueba de temperatura",
  "Resultado de Washing station / carryover": "la revisión de la estación de lavado",
  "Resultados de linealidad / dilución 1:2, 1:4, 1:5": "las diluciones 1 a 2, 1 a 4 y 1 a 5",
  "Unidad del resultado capturado para compararla con LOD/LOQ/linealidad IFU": "la unidad del resultado, para compararla con los límites del inserto",
  "Valor esperado y valor obtenido para confirmar factor": "el valor esperado y el obtenido",
  "Verificar unidad y umbral IFU del posible interferente": "la unidad y el límite del inserto para la posible interferencia",
};
export const missingSpeech = (text: string) => MISSING_ES[text.trim()] ?? humanize(text.charAt(0).toLowerCase() + text.slice(1));

/**
 * Last line of defence for engine text read aloud: expand the lab's abbreviations and symbols so Alexa does not spell
 * them ("QC" → "control de calidad", "valuesheet" → "hoja de datos", "1:2" → "1 a 2", "/" → "o").
 */
export function humanize(text: string): string {
  return String(text ?? "")
    .replace(/\bQC\b/g, "control de calidad")
    .replace(/\bvaluesheets?\b/gi, "hoja de datos")
    .replace(/\bIFU\b/g, "inserto")
    .replace(/\bLIS\b/g, "sistema del laboratorio")
    .replace(/\bLOD\b/g, "límite de detección")
    .replace(/\bLOQ\b/g, "límite de cuantificación")
    .replace(/\bCV\b/g, "coeficiente de variación")
    .replace(/\bBPL\b/g, "monitor del equipo")
    .replace(/\bcarryover\b/gi, "arrastre")
    .replace(/\bdrift\b/gi, "deriva")
    .replace(/\bbaseline\b/gi, "línea base")
    .replace(/\bR([12])\b/g, "reactivo $1")
    .replace(/(\d)\s*:\s*(\d)/g, "$1 a $2")
    .replace(/(\d)\s*nm\b/g, "$1 nanómetros")
    .replace(/(\d)\s*°C/g, "$1 grados")
    .replace(/\s*\/\s*/g, " o ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Where the evidence came from, as people say it. */
export const SOURCE_SPOKEN: Record<string, string> = { monitoring: "las alarmas", bpl: "los controles del equipo", sat: "el respaldo SAT", advisory: "la asesoría" };

/** Test codes inside engine text ("GLUCOSE", "ALT-GPT") → spoken Spanish names. */
export const sayTestsIn = (text: string) =>
  text.replace(/\b[A-Z][A-Z0-9]*(?:[ -][A-Z0-9]+)*\b/g, (m) => (m.length > 2 && TEST_SYNONYMS[canonicalTest(m)] ? sayTest(m) : m));
const testsList = (csv: string) => {
  const xs = csv.split(/\s*,\s*/).filter(Boolean).map((x) => sayTest(x));
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
};

/** The engine's evidence lines (positive/negative weights) as a colleague would explain them. */
const REASONS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(\d+)% de fallidas comparten (.+?)\.?$/i, (m) => `el ${m[1]} por ciento de las pruebas que fallan usan ${factorSpeech(m[2]!)}`],
  [/^Las pruebas correctas no comparten de forma fuerte el mismo filtro/i, () => "las pruebas que salen bien no usan el mismo filtro"],
  [/^Las pruebas correctas también usan el mismo filtro/i, () => "las pruebas que salen bien usan el mismo filtro"],
  [/^El tipo de problema es compatible con fotometr/i, () => "el tipo de falla es compatible con un problema de fotometría"],
  [/^El blanco fotométrico instrumental está rechazado/i, () => "el blanco fotométrico del equipo salió rechazado"],
  [/^El blanco fotométrico instrumental está aceptado: el rechazo apunta a reactivo/i, () => "el blanco fotométrico del equipo salió bien, así que el rechazo apunta al reactivo, a la cubeta o al lavado"],
  [/^El blanco fotométrico instrumental está aceptado/i, () => "el blanco fotométrico del equipo salió bien"],
  [/^El blanco fotométrico instrumental rechazado compite/i, () => "el blanco fotométrico rechazado apunta más a la óptica"],
  [/^(\d+) blancos de reactivo rechazados en el monitor BPL comparten la ruta óptica/i, (m) => `${m[1]} blancos de reactivo se rechazaron y comparten la ruta óptica`],
  [/^(\d+) blanco\(s\) de reactivo rechazado\(s\)/i, (m) => `${m[1] === "1" ? "un blanco de reactivo se rechazó" : `${m[1]} blancos de reactivo se rechazaron`}`],
  [/^Existe una explicación analítica más directa: (.+)$/i, (m) => `hay una explicación más directa: ${humanize(sayTestsIn(m[1]!)).toLowerCase()}`],
  [/^El lote en uso (?:explica|puede explicar|ofrece).*?: (.+?)\.?$/i, (m) => `el lote en uso lo explica mejor: ${humanize(sayTestsIn(m[1]!)).toLowerCase()}`],
  [/^Las fallidas se concentran en técnicas bireactivas/i, () => "las pruebas que fallan son de dos reactivos"],
  [/^Las monoreactivas comparables se mantienen correctas/i, () => "las pruebas parecidas de un solo reactivo salen bien"],
  [/^Las calibraciones rechazadas en el monitor BPL se concentran en técnicas bireactivas/i, () => "las calibraciones rechazadas son de pruebas de dos reactivos"],
  [/^Sin pruebas correctas para contrastar/i, () => "no tengo pruebas que salgan bien para comparar"],
  [/^Las fallidas son sensibles a temperatura/i, () => "las pruebas que fallan son sensibles a la temperatura"],
  [/^La temperatura ambiente reportada \((.+?) °C\) es elevada/i, (m) => `la temperatura del laboratorio está alta, ${m[1]} grados`],
  [/^El monitor BPL registra calibraciones rechazadas en técnicas sensibles a temperatura/i, () => "se rechazaron calibraciones de pruebas sensibles a la temperatura"],
  [/^Las técnicas endpoint correctas contrastan contra cinéticas sensibles/i, () => "las pruebas de punto final salen bien y las cinéticas, sensibles a la temperatura, no"],
  [/^El tipo de problema coincide con pipeteo/i, () => "el tipo de falla coincide con un problema de pipeteo o dilución"],
  [/^Reglas Westgard de error aleatorio \((.+?)\)/i, (m) => `los controles muestran error aleatorio: ${explainRule(m[1]!.split(/\s*,\s*/)[0]!)}`],
  [/^Reglas Westgard sistemáticas \((.+?)\)/i, (m) => `los controles muestran un sesgo constante: ${explainRule(m[1]!.split(/\s*,\s*/)[0]!)}`],
  [/^(\d+) curvas de calibración con correlación baja/i, (m) => `${m[1]} curvas de calibración tienen correlación baja`],
  [/^La dilución exacta a la mitad/i, () => "el resultado da exactamente la mitad, lo que sugiere un factor de dilución mal configurado"],
  [/^La observación\/tipo de evento sugiere configuración/i, () => "lo que describes suena a configuración o a cómo se reporta"],
  [/^El valor capturado rebasa la linealidad/i, () => "el valor rebasa la linealidad del inserto"],
  [/^Ya existe evidencia mecánica fuerte/i, () => "hay evidencia mecánica fuerte"],
  [/^El caso fue marcado como blanco\/rechazo óptico/i, () => "el caso se marcó como blanco o rechazo óptico"],
  [/^El patrón es intermitente/i, () => "la falla va y viene, como pasa con el arrastre entre muestras"],
  [/^Hay reactivos sensibles a agua\/lavado/i, () => "entre las que fallan hay reactivos sensibles al agua o al lavado"],
  [/^Patrón intermitente aceptado\/rechazado en (.+?) según/i, (m) => `${testsList(m[1]!)} ${m[1]!.includes(",") ? "alternan" : "alterna"} entre aceptado y rechazado`],
  [/^No hay un patrón técnico común dominante/i, () => "las pruebas que fallan no tienen nada técnico en común"],
  [/^El factor técnico dominante \((.+?)\) también lo comparten las pruebas correctas/i, (m) => `lo técnico que tienen en común, ${factorSpeech(m[1]!)}, también lo usan las pruebas que salen bien`],
  [/^QC rechazado con blanco y calibración aceptados en (.+?):/i, (m) => `el control de ${testsList(m[1]!)} se rechazó aunque el blanco y la calibración salieron bien`],
  [/^El tipo de evento es compatible con control/i, () => "el tipo de falla es típico de un problema de control o calibrador"],
  [/^Calibraciones rechazadas con blancos aceptados/i, () => "se rechazaron calibraciones aunque los blancos salieron bien"],
  [/^El valuesheet confirma/i, () => "la hoja de datos confirma que el control quedó fuera del límite"],
  [/^El resultado ya rebasó 2SD/i, () => "el resultado ya pasó 2 desviaciones estándar y está cerca del rechazo"],
  [/^La referencia QC aplicada no confirma/i, () => "la hoja de datos del control todavía no confirma el rechazo"],
  [/^Existe una señal mecánica más fuerte/i, () => "hay una señal mecánica más fuerte"],
  [/^Se observaron curvas normales/i, () => "las curvas de reacción se ven normales pese a la desviación"],
  [/^Cambio de lote reciente solo en las fallidas/i, () => "solo las pruebas que fallan cambiaron de lote hace poco, y el inserto pide calibrar después de cambiar de lote"],
  [/^Cambio de lote reciente .*calibración aceptada después/i, () => "hubo cambio de lote, pero después se calibró y la calibración salió bien"],
  [/^Las pruebas correctas también cambiaron de lote/i, () => "las pruebas que salen bien también cambiaron de lote"],
  [/^Lote caducado en uso/i, () => "las pruebas que fallan están usando un lote caducado"],
  [/^Ninguna prueba correcta evaluada en el SAT trabaja con lote caducado/i, () => "ninguna de las pruebas que salen bien usa un lote caducado"],
  [/^Las pruebas correctas también trabajan con lote caducado/i, () => "las pruebas que salen bien también usan lotes caducados"],
  [/^El último lote registrado .* está caducado/i, () => "el último lote registrado de las que fallan está caducado"],
  [/^Estabilidad a bordo del IFU del lote excedida/i, () => "el reactivo ya pasó su estabilidad a bordo"],
  [/blanco.*fuera del límite del certificado/i, () => "el blanco del reactivo está fuera del límite del certificado del lote; el reactivo puede estar deteriorado"],
  [/^(.+?): el reactivo lleva abierto más tiempo del que admite su IFU/i, () => "el reactivo lleva abierto más tiempo del que permite el inserto"],
  [/^(.+?) resultó (passed|normal) y reduce/i, (m) => `${humanize(m[1]!)} salió bien`],
  [/^Sí existe evidencia funcional anormal/i, () => "las utilidades del equipo muestran una falla funcional"],
  [/^Existe evidencia funcional anormal/i, () => "las utilidades del equipo muestran una falla funcional"],
];
export function reasonSpeech(label: string): string {
  const t = String(label ?? "").replace(/\s*\([+−-]\d+\)$/, "").trim();
  for (const [re, fn] of REASONS) {
    const m = t.match(re);
    if (m) return fn(m);
  }
  const out = humanize(sayTestsIn(t.split(/[:;]/)[0]!.trim()));
  return out.charAt(0).toLowerCase() + out.slice(1);
}
