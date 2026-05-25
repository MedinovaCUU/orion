export type ServiceCatalogKind = 'averia' | 'solucion';

export interface ServiceCatalogRow {
  catalog_kind: ServiceCatalogKind;
  catalog_code: string;
  catalog_type: string;
  catalog_detail: string;
  category_code: string;
}

export interface AveriaCatalogRow {
  cda: string;
  tipo_averia: string;
  detalle_averia: string;
  cta: string;
}

export interface SolucionCatalogRow {
  cds: string;
  tipo_solucion: string;
  detalle_solucion: string;
  cts: string;
}

export const splitServiceCatalog = (rows: ServiceCatalogRow[]) => {
  const averias: AveriaCatalogRow[] = [];
  const soluciones: SolucionCatalogRow[] = [];

  rows.forEach((row) => {
    if (row.catalog_kind === 'averia') {
      averias.push({
        cda: row.catalog_code,
        tipo_averia: row.catalog_type,
        detalle_averia: row.catalog_detail,
        cta: row.category_code,
      });
      return;
    }

    soluciones.push({
      cds: row.catalog_code,
      tipo_solucion: row.catalog_type,
      detalle_solucion: row.catalog_detail,
      cts: row.category_code,
    });
  });

  return { averias, soluciones };
};
