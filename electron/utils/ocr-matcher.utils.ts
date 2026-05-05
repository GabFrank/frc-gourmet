import { FacturaJson } from './factura-import.utils';

export type Confianza = 'ALTA' | 'MEDIA' | 'NINGUNA';

export interface ProveedorCandidato {
  id: number;
  nombre: string;
  ruc: string | null;
  score: number;
}

export interface ProductoCandidato {
  productoId: number;
  presentacionId: number | null;
  nombre: string;
  presentacionNombre: string | null;
  score: number;
}

export interface MatchItem {
  indice: number;
  lineaOcr: {
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    codigoProveedor: string | null;
  };
  match: { productoId: number; presentacionId: number | null; nombre: string } | null;
  confianza: Confianza;
  candidatos: ProductoCandidato[];
  omitir: boolean;
}

export interface MatchResult {
  documentoId: number;
  documento: {
    numeroNota: string | null;
    fecha: string | null;
    tipo: string;
    moneda: string;
    total: number;
    timbrado: string | null;
  };
  proveedor: {
    textoOcr: string;
    rucOcr: string | null;
    match: { id: number; nombre: string } | null;
    confianza: Confianza;
    candidatos: ProveedorCandidato[];
  };
  items: MatchItem[];
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

export function normalize(s: string): string {
  return (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function buildProveedorNombre(p: any): string {
  return p?.nombre || p?.razonSocial || p?.persona?.nombre || '';
}

function isLikelyGtin(s: string): boolean {
  return /^\d{8,14}$/.test((s || '').trim());
}

interface BuildOpts {
  documentoId: number;
  factura: FacturaJson;
  proveedoresActivos: any[];
  aliasProveedores: any[];
  productosActivos: any[];
  presentaciones: any[];
  codigosBarra: any[];
  aliasProductos: any[];
}

export function buildMatchResult(opts: BuildOpts): MatchResult {
  const factura = opts.factura;
  const proveedorTextoOcr = normalize(factura.proveedor.nombre);
  const rucOcr = factura.proveedor.ruc || null;

  // Match proveedor
  let provMatch: { id: number; nombre: string } | null = null;
  let provConfianza: Confianza = 'NINGUNA';

  if (rucOcr) {
    const direct = opts.proveedoresActivos.find(p => (p.ruc || '').replace(/[^0-9A-Za-z]/g, '') === rucOcr.replace(/[^0-9A-Za-z]/g, ''));
    if (direct) {
      provMatch = { id: direct.id, nombre: buildProveedorNombre(direct) };
      provConfianza = 'ALTA';
    }
  }
  if (!provMatch && rucOcr) {
    const aliasByRuc = opts.aliasProveedores.find(a => (a.rucOcr || '') === rucOcr);
    if (aliasByRuc?.proveedor) {
      provMatch = { id: aliasByRuc.proveedor.id, nombre: buildProveedorNombre(aliasByRuc.proveedor) };
      provConfianza = 'ALTA';
    }
  }
  if (!provMatch) {
    const aliasByText = opts.aliasProveedores.find(a => normalize(a.textoOcr) === proveedorTextoOcr);
    if (aliasByText?.proveedor) {
      provMatch = { id: aliasByText.proveedor.id, nombre: buildProveedorNombre(aliasByText.proveedor) };
      provConfianza = 'ALTA';
    }
  }

  const provCandidatos: ProveedorCandidato[] = opts.proveedoresActivos
    .map(p => ({
      id: p.id,
      nombre: buildProveedorNombre(p),
      ruc: p.ruc || null,
      score: similarity(normalize(buildProveedorNombre(p)), proveedorTextoOcr),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!provMatch && provCandidatos.length > 0 && provCandidatos[0].score >= 0.85) {
    provMatch = { id: provCandidatos[0].id, nombre: provCandidatos[0].nombre };
    provConfianza = 'MEDIA';
  } else if (!provMatch && provCandidatos.length > 0 && provCandidatos[0].score >= 0.6) {
    provConfianza = 'MEDIA';
  }

  // Items
  const items: MatchItem[] = factura.items.map((line, idx) => {
    const descNorm = normalize(line.descripcion);
    const codigoProv = line.codigoProveedor || null;

    let itemMatch: { productoId: number; presentacionId: number | null; nombre: string } | null = null;
    let itemConfianza: Confianza = 'NINGUNA';

    // 1) GTIN exacto en CodigoBarra
    if (codigoProv && isLikelyGtin(codigoProv)) {
      const cb = opts.codigosBarra.find(c => (c.codigo || '').trim() === codigoProv.trim());
      if (cb?.presentacion?.producto) {
        itemMatch = {
          productoId: cb.presentacion.producto.id,
          presentacionId: cb.presentacion.id,
          nombre: cb.presentacion.producto.nombre,
        };
        itemConfianza = 'ALTA';
      }
    }

    // 2) Alias por proveedor + texto
    if (!itemMatch && provMatch) {
      const alias = opts.aliasProductos.find(a =>
        a.proveedor?.id === provMatch!.id && normalize(a.textoOcr) === descNorm
      );
      if (alias?.producto) {
        itemMatch = {
          productoId: alias.producto.id,
          presentacionId: alias.presentacion?.id || null,
          nombre: alias.producto.nombre,
        };
        itemConfianza = (alias.vecesUsado || 0) >= 2 ? 'ALTA' : 'MEDIA';
      }
    }

    // 3) Fuzzy contra productos activos
    const productoCandidatos: ProductoCandidato[] = opts.productosActivos
      .map(p => ({
        productoId: p.id,
        presentacionId: null as number | null,
        nombre: p.nombre,
        presentacionNombre: null as string | null,
        score: similarity(normalize(p.nombre), descNorm),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (!itemMatch && productoCandidatos.length > 0) {
      if (productoCandidatos[0].score >= 0.85) {
        const top = productoCandidatos[0];
        const pres = opts.presentaciones.find(pr => pr.producto?.id === top.productoId && pr.principal);
        itemMatch = {
          productoId: top.productoId,
          presentacionId: pres?.id || null,
          nombre: top.nombre,
        };
        itemConfianza = 'MEDIA';
      } else if (productoCandidatos[0].score >= 0.5) {
        itemConfianza = 'MEDIA';
      }
    }

    return {
      indice: idx,
      lineaOcr: {
        descripcion: line.descripcion,
        cantidad: line.cantidad,
        precioUnitario: line.precioUnitario,
        subtotal: line.subtotal,
        codigoProveedor: codigoProv,
      },
      match: itemMatch,
      confianza: itemConfianza,
      candidatos: productoCandidatos,
      omitir: false,
    };
  });

  return {
    documentoId: opts.documentoId,
    documento: {
      numeroNota: factura.documento.numeroNota,
      fecha: factura.documento.fecha,
      tipo: factura.documento.tipo,
      moneda: factura.documento.moneda,
      total: factura.documento.totalDocumento,
      timbrado: factura.documento.timbrado,
    },
    proveedor: {
      textoOcr: factura.proveedor.nombre,
      rucOcr,
      match: provMatch,
      confianza: provConfianza,
      candidatos: provCandidatos,
    },
    items,
  };
}
