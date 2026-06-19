import { DRI_REAGENT_CONTEXT } from './driReagentContext.generated';
import type { DriCatalog, DriEquipmentModel, DriReagent } from '../types/dri.types';

export interface DriCatalogContextRow {
  codigo: string;
  modelo_familia: 'BAX00' | 'AX5';
  descripcion: string;
  descripcion_normalizada: string;
  presentacion: string;
  rendimiento_total?: number | null;
  rendimiento_util?: number | null;
  rendimiento_util_seguro?: number | null;
  source_sheet?: string | null;
}

export interface DriAliasContextRow {
  alias_normalizado: string;
  modelo_familia: 'BAX00' | 'AX5' | 'ALL';
  descripcion_normalizada: string;
  notas?: string | null;
}

interface DriIdentitySpec {
  displayCode: string;
  displayName: string;
  canonicalNames: readonly string[];
}

type DriContextEntry = (typeof DRI_REAGENT_CONTEXT)[keyof typeof DRI_REAGENT_CONTEXT];

const EXTRA_IDENTITY_SPECS: Record<string, DriIdentitySpec> = {
  LDH: {
    displayCode: 'LDH',
    displayName: 'Lactato deshidrogenasa',
    canonicalNames: ['LACTATE DEHYDROGENASE LDH', 'LACTATE DEHYDROGENASE'],
  },
  HGB: {
    displayCode: 'HGB',
    displayName: 'Hemoglobina',
    canonicalNames: ['HEMOGLOBIN', 'HEMOGLOBINA'],
  },
};

const CONTEXT_SPECS: Record<string, DriIdentitySpec> = Object.fromEntries(
  Object.entries(DRI_REAGENT_CONTEXT).map(([reagentId, context]) => [
    reagentId,
    {
      displayCode: context.displayCode,
      displayName: context.displayName,
      canonicalNames: context.canonicalNames,
    },
  ]),
);

const IDENTITY_SPECS: Record<string, DriIdentitySpec> = {
  ...CONTEXT_SPECS,
  ...EXTRA_IDENTITY_SPECS,
};

const normalizeIdentityText = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[_\-\/()]+/g, ' ')
    .replace(/\b(BAX00|AX5|BSA|BA400|BA200|BA|A25|A15|VERIF|VERIFY)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const buildCandidateSet = (reagent: DriReagent) =>
  unique(
    [
      reagent.id,
      reagent.name,
      reagent.displayCode,
      reagent.displayName,
      reagent.referenceCode,
      ...(reagent.canonicalNames || []),
    ]
      .map((value) => normalizeIdentityText(value))
      .filter(Boolean),
  );

const buildSpecIndex = () => {
  const exact = new Map<string, string>();
  Object.entries(IDENTITY_SPECS).forEach(([reagentId, spec]) => {
    exact.set(normalizeIdentityText(reagentId), reagentId);
    exact.set(normalizeIdentityText(spec.displayCode), reagentId);
    exact.set(normalizeIdentityText(spec.displayName), reagentId);
    spec.canonicalNames.forEach((name) => exact.set(normalizeIdentityText(name), reagentId));
  });
  return exact;
};

const SPEC_INDEX = buildSpecIndex();

const FALLBACK_CODE_OVERRIDES: Record<string, string> = {
  HEMOGLOBIN: 'HGB',
  HEMOGLOBINA: 'HGB',
  CHOLESTEROL: 'CHOL',
  COLESTEROL: 'CHOL',
  GLUCOSE: 'GLU',
  GLUCOSA: 'GLU',
  'GLUCOSE HEXOKINASE': 'GLU HK',
  'GLUCOSE HEXOQUINASA': 'GLU HK',
  'LACTATE DEHYDROGENASE': 'LDH',
  'LACTATO DESHIDROGENASA': 'LDH',
};

const inferFallbackCode = (candidates: string[]) => {
  for (const candidate of candidates) {
    if (FALLBACK_CODE_OVERRIDES[candidate]) {
      return FALLBACK_CODE_OVERRIDES[candidate];
    }
    const parenMatch = candidate.match(/\b([A-Z0-9]{2,8})\b$/);
    if (parenMatch && ['LDH', 'HGB', 'CHOL', 'GLU', 'GGT', 'AST', 'ALT', 'CK'].includes(parenMatch[1])) {
      return parenMatch[1];
    }
  }
  return null;
};

const resolveSpecKey = (
  candidates: string[],
  aliasRows: DriAliasContextRow[],
  catalogRows: DriCatalogContextRow[],
) => {
  for (const candidate of candidates) {
    const direct = SPEC_INDEX.get(candidate);
    if (direct) {
      return direct;
    }
  }

  const aliasDescriptions = aliasRows
    .filter((row) => candidates.includes(normalizeIdentityText(row.alias_normalizado)))
    .map((row) => normalizeIdentityText(row.descripcion_normalizada));

  for (const aliasDescription of aliasDescriptions) {
    const direct = SPEC_INDEX.get(aliasDescription);
    if (direct) {
      return direct;
    }
  }

  const catalogDescriptions = catalogRows
    .filter(
      (row) =>
        candidates.includes(normalizeIdentityText(row.descripcion_normalizada)) ||
        candidates.includes(normalizeIdentityText(row.descripcion)),
    )
    .map((row) => normalizeIdentityText(row.descripcion_normalizada));

  for (const catalogDescription of catalogDescriptions) {
    const direct = SPEC_INDEX.get(catalogDescription);
    if (direct) {
      return direct;
    }
  }

  return null;
};

const normalizePlatformKey = (value: string) => {
  if (value === 'BAX00') {
    return 'BAx00';
  }
  if (value === 'AX5') {
    return 'Ax5';
  }
  return value;
};

const inferPlatformsFromContextEntry = (entry: DriContextEntry): DriEquipmentModel[] => {
  const platforms = new Set<DriEquipmentModel>();
  Object.entries(entry.productCodesByPlatform || {}).forEach(([platform, codes]) => {
    if (Array.isArray(codes) && codes.length && ['BA400', 'BA200', 'A15'].includes(platform)) {
      platforms.add(platform as DriEquipmentModel);
    }
  });

  if (!platforms.size) {
    entry.productEntries.forEach((product) => {
      const code = String(product.productCode || '');
      if (code.startsWith('21') || code.startsWith('23')) {
        platforms.add('BA400');
        platforms.add('BA200');
      } else if (code.startsWith('12')) {
        platforms.add('A15');
      }
    });
  }

  return Array.from(platforms);
};

const buildSyntheticContextReagents = (
  existingReagents: DriReagent[],
  catalogRows: DriCatalogContextRow[],
): DriReagent[] => {
  const existingIds = new Set(existingReagents.map((reagent) => reagent.id));

  return Object.entries(DRI_REAGENT_CONTEXT).flatMap(([reagentId, entry]) => {
    if (existingIds.has(reagentId)) {
      return [];
    }

    const spec = IDENTITY_SPECS[reagentId];
    if (!spec) {
      return [];
    }

    const supplementalEntries = buildSupplementalProductEntries(entry, catalogRows, spec);
    const platforms = inferPlatformsFromContextEntry(entry);
    if (!platforms.length) {
      return [];
    }

    return [{
      id: reagentId,
      name: spec.displayName,
      displayCode: spec.displayCode,
      displayName: spec.displayName,
      canonicalNames: [...spec.canonicalNames],
      calibrationMode: null,
      readMode: null,
      primaryWavelengthNm: null,
      referenceWavelengthNm: null,
      reportedMethod: null,
      reagentType: null,
      operationalNote: null,
      preliminaryRisk: entry.missingFields.length ? 'Contexto IFU listo; falta programación técnica.' : 'Contexto IFU/documental disponible.',
      sourceStatus: 'Contexto documental sintético',
      confidence: 'pending',
      sourceType: 'ifu',
      sourceReference: `einfo.bio · ${reagentId}`,
      metadata: {
        syntheticFromContext: true,
      },
      referenceCode: spec.displayCode,
      platforms,
      analyticalFamily: null,
      reactionKind: null,
      reagentScheme: null,
      usesR1: null,
      usesR2: null,
      sharedR2Group: null,
      mechanicalSubsystems: null,
      relatedReagentIds: null,
      technicalProfile: {
        identity: {
          reagentKey: reagentId,
          displayCode: spec.displayCode,
          displayName: spec.displayName,
          canonicalNames: spec.canonicalNames,
          aliases: [],
        },
        catalogProducts: supplementalEntries,
        productCodesByPlatform: entry.productCodesByPlatform || {},
        documentation: entry.documentation || null,
        ifuFacts: entry.facts || null,
        missingFields: entry.missingFields || [],
        qc_reference: {
          references: entry.qcReferences || [],
        },
      },
    }];
  });
};

const mergeQcReferences = (reagent: DriReagent, generatedReferences: ReadonlyArray<Record<string, unknown>>) => {
  const technicalProfile = (reagent.technicalProfile || {}) as Record<string, unknown>;
  const currentRoot =
    (technicalProfile.qc_reference as { references?: unknown[] } | undefined) ||
    (technicalProfile.qcReference as { references?: unknown[] } | undefined);
  const currentReferences = Array.isArray(currentRoot?.references) ? currentRoot.references : [];
  const merged = new Map<string, Record<string, unknown>>();

  [...currentReferences, ...generatedReferences].forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const row = item as Record<string, unknown>;
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id
        : `${reagent.id}::${String(row.productCode || '')}::${String(row.lot || '')}::${String(row.controlLevel || '')}`;
    merged.set(id, row);
  });

  return Array.from(merged.values());
};

const buildSupplementalProductEntries = (
  generatedEntry: DriContextEntry | undefined,
  catalogRows: DriCatalogContextRow[],
  spec: DriIdentitySpec,
) => {
  const normalizedCatalogRows = catalogRows.filter((row) =>
    spec.canonicalNames.map(normalizeIdentityText).includes(normalizeIdentityText(row.descripcion_normalizada)),
  );

  const entries = new Map<string, Record<string, unknown>>();
  generatedEntry?.productEntries.forEach((entry) => {
    entries.set(entry.productCode, entry);
  });
  normalizedCatalogRows.forEach((row) => {
    if (!entries.has(row.codigo)) {
      entries.set(row.codigo, {
        productCode: row.codigo,
        platformFamily: row.modelo_familia === 'BAX00' ? 'bax00' : 'ax5',
        itemName: row.descripcion,
        description: row.descripcion,
        format: row.presentacion,
        systems: row.modelo_familia,
        ifuDocs: 0,
        valuesheetDocs: 0,
        totalDocs: 0,
      });
    }
  });

  return Array.from(entries.values());
};

export const getReagentDisplayCode = (reagent: DriReagent) => reagent.displayCode || reagent.referenceCode || reagent.id;

export const getReagentDisplayName = (reagent: DriReagent) => reagent.displayName || reagent.name || reagent.id;

export const buildReagentSearchText = (reagent: DriReagent) => {
  const technicalProfile = (reagent.technicalProfile || {}) as Record<string, unknown>;
  const contextIdentity = (technicalProfile.identity || {}) as Record<string, unknown>;
  const catalogProducts = Array.isArray(technicalProfile.catalogProducts) ? technicalProfile.catalogProducts : [];
  const aliases = Array.isArray(contextIdentity.aliases) ? contextIdentity.aliases : [];

  return [
    reagent.id,
    reagent.name,
    reagent.displayCode,
    reagent.displayName,
    reagent.referenceCode,
    ...(reagent.canonicalNames || []),
    ...aliases.map((item) => (item && typeof item === 'object' ? String((item as Record<string, unknown>).alias || '') : '')),
    ...catalogProducts.map((item) =>
      item && typeof item === 'object'
        ? `${String((item as Record<string, unknown>).productCode || '')} ${String((item as Record<string, unknown>).description || '')}`
        : '',
    ),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

export const enrichCatalogWithReagentIdentity = (
  catalog: DriCatalog,
  {
    catalogRows,
    aliasRows,
  }: {
    catalogRows: DriCatalogContextRow[];
    aliasRows: DriAliasContextRow[];
  },
): DriCatalog => {
  const normalizedCatalogRows = catalogRows.map((row) => ({
    ...row,
    descripcion_normalizada: normalizeIdentityText(row.descripcion_normalizada || row.descripcion),
    descripcion: row.descripcion,
  }));
  const normalizedAliasRows = aliasRows.map((row) => ({
    ...row,
    alias_normalizado: normalizeIdentityText(row.alias_normalizado),
    descripcion_normalizada: normalizeIdentityText(row.descripcion_normalizada),
  }));
  const baseReagents = [
    ...catalog.reagents,
    ...buildSyntheticContextReagents(catalog.reagents, normalizedCatalogRows),
  ];

  return {
    ...catalog,
    reagents: baseReagents.map((reagent) => {
      const candidates = buildCandidateSet(reagent);
      const matchedSpecKey = resolveSpecKey(candidates, normalizedAliasRows, normalizedCatalogRows) || reagent.id;
      const matchedSpec = IDENTITY_SPECS[matchedSpecKey];
      const generatedEntry = DRI_REAGENT_CONTEXT[matchedSpecKey as keyof typeof DRI_REAGENT_CONTEXT];

      const displayCode = matchedSpec?.displayCode || inferFallbackCode(candidates) || reagent.referenceCode || reagent.id;
      const displayName = matchedSpec?.displayName || reagent.displayName || reagent.name || displayCode;
      const canonicalNames = matchedSpec?.canonicalNames || reagent.canonicalNames || [displayName];
      const relevantAliasRows = normalizedAliasRows.filter((row) =>
        canonicalNames.map(normalizeIdentityText).includes(row.descripcion_normalizada),
      );
      const supplementalEntries = buildSupplementalProductEntries(generatedEntry, normalizedCatalogRows, {
        displayCode,
        displayName,
        canonicalNames,
      });
      const mergedQcReferences = mergeQcReferences(reagent, generatedEntry?.qcReferences || []);
      const technicalProfile = {
        ...(reagent.technicalProfile || {}),
        identity: {
          reagentKey: matchedSpecKey,
          displayCode,
          displayName,
          canonicalNames,
          aliases: relevantAliasRows.map((row) => ({
            alias: row.alias_normalizado,
            canonical: row.descripcion_normalizada,
            modelFamily: row.modelo_familia,
            notes: row.notas || null,
          })),
        },
        catalogProducts: supplementalEntries,
        productCodesByPlatform: generatedEntry?.productCodesByPlatform || {},
        documentation: generatedEntry?.documentation || null,
        ifuFacts: generatedEntry?.facts || null,
        missingFields: generatedEntry?.missingFields || [],
        qc_reference: {
          references: mergedQcReferences,
        },
      } as Record<string, unknown>;

      return {
        ...reagent,
        displayCode,
        displayName,
        canonicalNames: [...canonicalNames],
        referenceCode: displayCode,
        technicalProfile,
        metadata: {
          ...(reagent.metadata || {}),
          driIdentity: {
            displayCode,
            displayName,
            matchedSpecKey,
            productCodes: supplementalEntries.map((entry) => String(entry.productCode || '')),
            families: unique(
              supplementalEntries
                .map((entry) => String(entry.systems || ''))
                .filter(Boolean)
                .map(normalizePlatformKey),
            ),
          },
        },
      };
    }),
  };
};
