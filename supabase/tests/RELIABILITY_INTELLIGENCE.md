# ORION | Reliability Intelligence — inteligencia de reacondicionamientos

Pestaña **Confiabilidad** del panel (solo administradores). Evalúa cada reacondicionamiento con tasas ajustadas por
exposición, curvas de supervivencia, componentes que fallan después de la entrega y decisiones documentadas.

## Piezas

| Capa | Archivo | Qué hace |
|---|---|---|
| Base de datos | `migrations/20261013170000_reliability_intelligence.sql` | Tablas de registro, guardas, bitácora, `get_reliability_lab()`, `get_reliability_audit()` |
| Estadística | `frontend/src/components/reliabilityStats.ts` | KM (Greenwood, log −log), log-rank (estratificado), Cox (Efron, estratos), Weibull (MV + IC por razón de verosimilitudes), MCF (Nelson), Poisson exacto (Garwood), Mantel–Haenszel (Greenland–Robins), bootstrap por equipo, permutación por estrato, Wilson, Newcombe, Fisher, Spearman |
| Dominio | `frontend/src/components/reliabilityAnalytics.ts` | Episodios, entrega, seguimiento, cohortes, kit observado, componentes, veredictos, preguntas estratégicas, Monte Carlo |
| Vistas | `ReliabilityCenter.tsx`, `ReliabilityViews.tsx`, `ReliabilityCapture.tsx`, `ReliabilityPanels.tsx`, `reliabilityCharts.ts`, `reliabilityReport.ts` | Resumen, supervivencia, piezas, componentes, línea de vida/expediente, registro, decisión y costos, método, informe PDF |

## Definiciones (las mismas en pantalla, informe y pruebas)

- **Episodio**: registros «Reacondicionamiento» de una serie separados por ≤ 60 días. Varios episodios por equipo se analizan por separado.
- **Entrega (día 0)**: primer reporte de instalación posterior (≤ 365 días) o la fecha de asignación del equipo; gana la más temprana y la fuente queda visible.
- **Seguimiento**: hasta el horizonte (30/90/180/365 d), el corte, el retiro o el siguiente reacondicionamiento. Censura a la derecha; nunca se extrapola.
- **Falla**: servicio «correctivo» (opcional: «correctivo o visita»). Una falla ≠ una visita ≠ relación causal.
- **Primera instalación** (comparador de «nuevo»): serie cuyo primer registro desde 2023-03-01 es su instalación y nunca se reacondicionó antes.
- **Exposición**: días calendario ÷ 365.25. No hay horas de operación: ninguna métrica se presenta como horas operativas (el «MTBF» es calendario).
- **Kit observado**: piezas cambiadas en ≥ 20 % de los reacondicionamientos de un modelo con ≥ 5 episodios. No sustituye al «Refurbish Register».
- **Destino interno** (cliente «Biosystems»): excluido por defecto.

## Niveles de evidencia

- **Diferencia sostenida**: IC 95 % excluye 1 en el análisis crudo y en el ajustado por modelo (misma dirección) **y** la verificación robusta por equipo coincide (bootstrap por equipo o permutación dentro del modelo).
- **Indicio no concluyente**: diferencia ≥ 50 % (tasas) o ≥ 5 puntos (proporciones), o significativa en un solo análisis.
- **Sin diferencia detectada**: compatible con no diferencia (no demuestra igualdad).
- **EVIDENCIA INSUFICIENTE**: < 10 equipos por grupo o < 10 eventos.
- **SIN DATOS REGISTRADOS**: la información aún no se captura.

## Registro (fase 1) — integridad

- `refurbishment_episodes` (alcance, liberación, presupuesto solicitado/aprobado + fuente), `refurbishment_component_decisions`
  (condición → recomendación → autorización → acción, riesgo residual), `refurbishment_acceptance_tests`, `reliability_failure_links`, `reliability_costs`.
- RLS: lectura/escritura `is_staff()`; borrado solo `is_admin()`. Solo un administrador autoriza/rechaza/pospone (trigger); rechazo/aplazamiento exige motivo.
- Autores (`created_by`, `updated_by`, `recommended_by`, `authorized_by`, `assessed_by`) los pone el servidor con `auth.uid()`.
- Aprobar/reprobar una prueba exige especificación **y** documento de origen (no se inventan tolerancias).
- Afirmar o descartar una relación falla↔decisión exige evidencia escrita; si no, queda «no determinada».
- Un comprobante (`source_document`) cuenta una sola vez por categoría. El presupuesto del episodio no se suma al costo total.
- `reliability_audit_log`: cada alta/cambio/borrado con la fila anterior y nueva; solo lectura para administradores, sin escritura desde clientes.
- Evidencia ligada a `servicios_historial`/`tickets` con `on delete restrict`: el historial referenciado no puede desaparecer.

## Contratos de integración pendientes (Andrómeda y otros)

Hoy no existen en Orion; se cargan a mano en «Registro» hasta conectar la fuente:

| Fuente | Destino | Campos mínimos |
|---|---|---|
| Andrómeda · costo de producto / consumo de refacción | `reliability_costs` (phase según servicio, category `refacciones`) | serie, fecha, monto MXN, naturaleza `comprobado`, folio SAP/remisión en `source_document`, servicio de Orion si existe |
| Viáticos / traslados / paquetería | `reliability_costs` (`viaticos`, `traslado`, `paqueteria`) | serie, fecha, monto, folio del comprobante, servicio relacionado |
| Protocolo del fabricante («Refurbish Register») | kit oficial por modelo (sustituye al kit observado) | modelo, código, obligatorio/sugerido, versión del documento |
| Paros del equipo | tabla de indisponibilidad (pendiente) | serie, inicio, fin, causa, fuente |

La importación masiva desde Excel/CSV (con validación y detección de duplicados por comprobante) es el siguiente paso de la fase 1.

## Pruebas

```bash
cd frontend && npm run test:reliability:stats      # fórmulas contra lifelines 0.30 / scipy 1.17
cd frontend && npm run test:reliability:analytics  # reglas de dominio + generador FICTICIO
PGLITE_MODULE=/ruta/@electric-sql/pglite/dist/index.js node supabase/tests/reliability_intelligence.test.mjs
```

Página aislada: `frontend/tests/fixtures/reliability-lab.html` (datos ficticios); `?real` carga
`reliability-lab-real.local.json` (export local de producción, ignorado por git; nunca se publica).
