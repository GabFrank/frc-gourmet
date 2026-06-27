import { PlantillaConfig, PlantillaElemento } from './plantilla-design.model';

/** Conversion milimetros -> puntos PDF (1 pt = 1/72 pulgada, 1 pulgada = 25.4mm). */
export const MM_TO_PT = 72 / 25.4; // ≈ 2.83465

export function mmToPt(mm: number): number {
  return (mm || 0) * MM_TO_PT;
}

/**
 * Contexto de datos para resolver las variables del diseno. Lo arma el flujo
 * de facturacion a partir de la Factura emitida (ver buildFacturaContext).
 */
export interface FacturaRenderContext {
  factura: { numeroCompleto?: string; fecha?: any; condicionVenta?: string };
  cliente: { nombre?: string; ruc?: string; direccion?: string; email?: string };
  timbrado: { numero?: string; vigencia?: string };
  totales: {
    gravada10?: number; gravada5?: number; exenta?: number;
    iva10?: number; iva5?: number; totalIva?: number;
    descuento?: number; total?: number; totalEnLetras?: string;
  };
  empresa: { nombre?: string; ruc?: string; direccion?: string };
  items: Array<{
    cantidad?: number; descripcion?: string; precioUnitario?: number;
    descuento?: number; exenta?: number; gravada5?: number; gravada10?: number; total?: number;
  }>;
}

function fmtNumber(v: any): string {
  const n = Number(v);
  if (isNaN(n)) return '';
  return n.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(v: any): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('es-PY');
}

/** Resuelve una clave de variable (ej. 'totales.total') contra el contexto. */
export function resolveVariable(key: string, ctx: FacturaRenderContext): string {
  if (!key) return '';
  const [grupo, campo] = key.split('.');
  const obj: any = (ctx as any)[grupo];
  if (!obj) return '';
  const value = obj[campo];
  if (key === 'factura.fecha') return fmtDate(value);
  if (grupo === 'totales' && campo !== 'totalEnLetras') return fmtNumber(value);
  return value != null ? String(value) : '';
}

function elementText(el: PlantillaElemento, ctx: FacturaRenderContext): string {
  if (el.type === 'variable') return resolveVariable(el.variable || '', ctx);
  return el.text || '';
}

/**
 * Construye el docDefinition de pdfmake para una plantilla + contexto.
 *
 * @param page  { anchoMm, altoMm } tamano de pagina.
 * @param config diseno serializado.
 * @param ctx datos a interpolar.
 * @param opts.background imagen de fondo (base64/dataURL) — usar solo en
 *        auto-impreso A4, NO en pre-impreso (la hoja ya esta impresa).
 */
export function buildDocDefinition(
  page: { anchoMm: number; altoMm: number },
  config: PlantillaConfig,
  ctx: FacturaRenderContext,
  opts?: { background?: string },
): any {
  const content: any[] = [];

  for (const el of config.elementos || []) {
    const x = mmToPt(el.xMm);
    const y = mmToPt(el.yMm);

    if (el.type === 'line') {
      content.push({
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: mmToPt(el.wMm || 50), y2: 0, lineWidth: 0.75 }],
        absolutePosition: { x, y },
      });
      continue;
    }

    if (el.type === 'box') {
      content.push({
        canvas: [{ type: 'rect', x: 0, y: 0, w: mmToPt(el.wMm || 30), h: mmToPt(el.hMm || 10), lineWidth: 0.75 }],
        absolutePosition: { x, y },
      });
      continue;
    }

    if (el.type === 'image' && el.imageUrl) {
      content.push({
        image: el.imageUrl,
        width: mmToPt(el.wMm || 30),
        absolutePosition: { x, y },
      });
      continue;
    }

    if (el.type === 'itemsTable') {
      const cols = el.columns && el.columns.length
        ? el.columns
        : [
            { field: 'cantidad', header: 'Cant.', wMm: 15, align: 'right' as const },
            { field: 'descripcion', header: 'Descripción', wMm: 80, align: 'left' as const },
            { field: 'precioUnitario', header: 'P. Unit.', wMm: 25, align: 'right' as const },
            { field: 'total', header: 'Total', wMm: 25, align: 'right' as const },
          ];
      const widths = cols.map((c) => mmToPt(c.wMm));
      const header = cols.map((c) => ({ text: c.header, bold: true, alignment: c.align || 'left', fontSize: el.fontSize || 8 }));
      const body: any[][] = [header];
      for (const it of ctx.items || []) {
        body.push(cols.map((c) => {
          const raw = (it as any)[c.field];
          const isNum = c.field !== 'descripcion';
          return { text: isNum ? fmtNumber(raw) : (raw ?? ''), alignment: c.align || (isNum ? 'right' : 'left'), fontSize: el.fontSize || 8 };
        }));
      }
      content.push({
        table: { headerRows: 1, widths, body },
        layout: 'lightHorizontalLines',
        absolutePosition: { x, y },
        width: widths.reduce((a, b) => a + b, 0),
      });
      continue;
    }

    // text / variable
    content.push({
      text: elementText(el, ctx),
      absolutePosition: { x, y },
      fontSize: el.fontSize || 9,
      bold: !!el.bold,
      alignment: el.align || 'left',
      width: el.wMm ? mmToPt(el.wMm) : undefined,
    });
  }

  const dd: any = {
    pageSize: { width: mmToPt(page.anchoMm), height: mmToPt(page.altoMm) },
    pageMargins: [0, 0, 0, 0],
    content,
    defaultStyle: { fontSize: 9 },
  };
  if (opts?.background) {
    dd.background = () => ({ image: opts.background, width: mmToPt(page.anchoMm) });
  }
  return dd;
}

/**
 * Carga pdfmake dinamicamente (sin types) y devuelve la instancia lista para
 * crear PDFs. Mismo patron que el resto de la app.
 */
export async function loadPdfMake(): Promise<any> {
  // @ts-ignore — pdfmake sin types
  const pdfMakeMod: any = await import('pdfmake/build/pdfmake');
  // @ts-ignore
  const pdfFontsMod: any = await import('pdfmake/build/vfs_fonts');
  const pdfMake: any = pdfMakeMod.default || pdfMakeMod;
  pdfMake.vfs = (pdfFontsMod.default || pdfFontsMod).pdfMake?.vfs || pdfFontsMod.pdfMake?.vfs;
  return pdfMake;
}
