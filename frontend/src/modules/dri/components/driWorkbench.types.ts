import type { ReactNode } from 'react';
import type { SatReportSummary } from '../../sat-report/satReportTypes';
import type { BplSerialSummary } from '../../equipment-monitoring/bplEvents';
import type {
  DriEngineResult,
  DriGraphEdge,
  DriGraphNode,
  DriHypothesisResult,
  DriRelationSignal,
} from '../types/dri.types';
import type { DriPatchReceipt, DriSourceKind } from '../utils/contextSources';
import type { DriAdvisoryCase, DriMonitoringContext, DriSourceBuild } from '../utils/sourcePatches';

/**
 * Contratos del banco de trabajo DRI. Cada componente del escenario/dock/fuentes recibe
 * exactamente estas props; el contenedor (DriDashboard) es dueño del estado.
 */

export type DriReagentState = 'failed' | 'correct' | 'none';

export interface DriShellControls {
  systemCoreRadius: number;
  systemStep: number;
  factorBaseRadius: number;
  factorStep: number;
  reagentRadius: number;
}

export interface DriSystemPill {
  key: string;
  label: string;
}

export type DriLiveState = 'empty' | 'live' | 'saved';

/* ------------------------------------------------------------ Escenario */

export interface DriRelationStageProps {
  nodes: DriGraphNode[];
  edges: DriGraphEdge[];
  selectedNodeIds: string[];
  onToggleNode: (nodeId: string) => void;
  onClearSelection: () => void;
  focusedSystemKey: string | null;
  onFocusSystem: (key: string | null) => void;
  systemPills: DriSystemPill[];
  multiSelect: boolean;
  onToggleMultiSelect: () => void;
  shellControls: DriShellControls;
  onShellControlChange: (field: keyof DriShellControls, value: number) => void;
  onResetShellControls: () => void;
  /** Resultado vivo del motor (null hasta que haya al menos una prueba fallida). */
  analysis: DriEngineResult | null;
  /** Señal relacional del nodo seleccionado, si el nodo es un factor. */
  selectedSignal: DriRelationSignal | null;
  selectedNode: DriGraphNode | null;
  counts: { failed: number; correct: number; factors: number; systems: number };
  liveState: DriLiveState;
  caseCode: string | null;
  isDemo: boolean;
  /** Etiqueta corta (código) de un reactivo para chips del inspector. */
  reagentLabel: (reagentId: string) => string;
  /** Contenido adicional flotante (p. ej. avisos) que el contenedor quiera sobreponer. */
  children?: ReactNode;
}

/* ----------------------------------------------------------- Hipótesis */

export interface DriHypothesisDockProps {
  analysis: DriEngineResult | null;
  /** Resultado vivo anterior para mostrar deltas (▲▼) por hipótesis. */
  previousAnalysis: DriEngineResult | null;
  selectedHypothesisKey: string | null;
  onSelectHypothesis: (key: string) => void;
  /** Fija el resultado vivo y abre el explorador 3D en ese hallazgo. */
  onLocateInExplorer: (hypothesis: DriHypothesisResult) => void;
  explorerAvailable: boolean;
  liveState: DriLiveState;
  caseCode: string | null;
  saving: boolean;
  canSave: boolean;
  isDemo: boolean;
  onSave: () => void;
  reagentLabel: (reagentId: string) => string;
  /** Solo reactivos visibles del modelo activo (ya deduplicados) pueden sugerirse como prueba discriminante. */
  isReagentVisible: (reagentId: string) => boolean;
  onSetReagentState: (reagentId: string, state: DriReagentState) => void;
  /** Sin permiso de captura: se ocultan guardar y las acciones que editan el caso. */
  readOnly?: boolean;
}

/* ------------------------------------------------------------ Contraste */

export interface DriContrastMatrixProps {
  analysis: DriEngineResult | null;
  failedReagentIds: string[];
  correctReagentIds: string[];
  reagentLabel: (reagentId: string) => string;
  reagentName: (reagentId: string) => string;
  /** Solo reactivos visibles del modelo activo (ya deduplicados) pueden sugerirse. */
  isReagentVisible: (reagentId: string) => boolean;
  onSetReagentState: (reagentId: string, state: DriReagentState) => void;
  /** Sin permiso de captura: se ocultan las acciones rápidas que editan el caso. */
  readOnly?: boolean;
  selectedSignalId: string | null;
  onSelectSignal: (signalId: string | null) => void;
}

/* -------------------------------------------------------------- Fuentes */

export type DriSourceStatus = 'idle' | 'loading' | 'available' | 'applied' | 'empty' | 'error' | 'dismissed';

export interface DriSourceSnapshot<TData> {
  kind: DriSourceKind;
  status: DriSourceStatus;
  data: TData | null;
  build: DriSourceBuild | null;
  receipt: DriPatchReceipt | null;
  error: string | null;
  loadedAt: string | null;
  /** Titular corto para la tarjeta de la fuente. */
  headline: string;
  /** Líneas secundarias (conteos, avisos). */
  details: string[];
}

export interface DriContextSourcesApi {
  sat: DriSourceSnapshot<SatReportSummary>;
  bpl: DriSourceSnapshot<BplSerialSummary>;
  monitoring: DriSourceSnapshot<DriMonitoringContext>;
  advisory: DriSourceSnapshot<DriAdvisoryCase>;
  /** Carga el último SAT: de la serie si se indica, si no el último global. */
  loadSat: (serial?: string) => Promise<void>;
  /** Un reporte recién importado se aplica de inmediato. */
  acceptImportedSat: (summary: SatReportSummary) => void;
  loadBpl: (serial: string, options?: { autoApply?: boolean }) => Promise<void>;
  loadMonitoring: (serial: string, options?: { autoApply?: boolean }) => Promise<void>;
  /** Carga SAT + BPL + Monitoreo de una serie; `apply` decide qué se proyecta sin clic adicional. */
  loadAllForSerial: (serial: string, options?: { apply?: 'none' | 'bpl' | 'all' }) => Promise<void>;
  /** Un caso elegido en el selector se aplica de inmediato. */
  acceptAdvisory: (advisoryCase: DriAdvisoryCase) => void;
  apply: (kind: DriSourceKind) => void;
  remove: (kind: DriSourceKind) => void;
  dismiss: (kind: DriSourceKind) => void;
  applyAllAvailable: () => void;
  /** Quita todas las fuentes aplicadas (p. ej. al reiniciar la captura). */
  clearAll: () => void;
  appliedKinds: DriSourceKind[];
  availableKinds: DriSourceKind[];
  busy: boolean;
  lastMessage: string | null;
}

export interface DriSourcesStripProps {
  sources: DriContextSourcesApi;
  serial: string;
  previewMode: boolean;
  onImportSat: (summary: SatReportSummary) => void;
  onOpenAdvisoryPicker: () => void;
}

export interface DriAdvisoryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (advisoryCase: DriAdvisoryCase) => void;
  /** Serie actual del caso para priorizar coincidencias. */
  serialHint: string;
}
