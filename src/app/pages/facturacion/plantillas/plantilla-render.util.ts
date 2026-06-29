import { BackgroundTransform, PlantillaConfig, PlantillaElemento } from './plantilla-design.model';

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
    id?: number | string; cantidad?: number; descripcion?: string; precioUnitario?: number;
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
  // Marcas para formularios pre-impresos con casillero contado/credito.
  if (key === 'factura.marcaContado') return ctx.factura?.condicionVenta === 'CONTADO' ? 'X' : '';
  if (key === 'factura.marcaCredito') return ctx.factura?.condicionVenta === 'CREDITO' ? 'X' : '';
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
 * Formatea el valor de una celda de item segun el campo. Las columnas
 * numericas quedan en blanco si no hay dato (cada item llena solo su IVA).
 */
function itemCellText(field: string | undefined, raw: any): string {
  if (field === 'descripcion') return raw != null ? String(raw) : '';
  if (field === 'id') return raw != null && raw !== '' ? String(raw) : '';
  return raw == null || raw === '' ? '' : fmtNumber(raw);
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
  opts?: { background?: string; backgroundTransform?: BackgroundTransform },
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
            { field: 'id', header: 'ID', wMm: 12, align: 'center' as const },
            { field: 'cantidad', header: 'Cant.', wMm: 15, align: 'right' as const },
            { field: 'descripcion', header: 'Descripción', wMm: 70, align: 'left' as const },
            { field: 'precioUnitario', header: 'P. Unit.', wMm: 25, align: 'right' as const },
            { field: 'total', header: 'Total', wMm: 28, align: 'right' as const },
          ];
      const widths = cols.map((c) => mmToPt(c.wMm));
      const body: any[][] = [];
      // La hoja pre-impresa ya trae los titulos; el encabezado es opcional.
      if (el.showHeader) {
        body.push(cols.map((c) => ({ text: c.header, bold: true, alignment: c.align || 'left', fontSize: el.fontSize || 8 })));
      }
      for (const it of ctx.items || []) {
        body.push(cols.map((c) => ({
          text: itemCellText(c.field, (it as any)[c.field]),
          alignment: c.align || (c.field === 'descripcion' ? 'left' : 'right'),
          fontSize: el.fontSize || 8,
        })));
      }
      content.push({
        table: { headerRows: el.showHeader ? 1 : 0, widths, body },
        layout: el.showHeader ? 'lightHorizontalLines' : 'noBorders',
        absolutePosition: { x, y },
        width: widths.reduce((a, b) => a + b, 0),
      });
      continue;
    }

    if (el.type === 'itemColumn') {
      // Columna individual de items: cada fila se posiciona en y + i*rowHeight.
      // El alto de fila se DERIVA del contenedor (area / cantidad de filas) para
      // que todas las columnas queden alineadas y las filas llenen el area.
      const rowH = (config.itemAreaHeightMm && config.itemRows)
        ? mmToPt(Number(config.itemAreaHeightMm) / Number(config.itemRows))
        : mmToPt(Number(config.itemRowHeightMm) || el.rowHeightMm || 6);
      const width = el.wMm ? mmToPt(el.wMm) : undefined;
      const align = el.align || (el.field === 'descripcion' ? 'left' : el.field === 'id' ? 'center' : 'right');
      (ctx.items || []).forEach((it, i) => {
        content.push({
          text: itemCellText(el.field, (it as any)[el.field || '']),
          absolutePosition: { x, y: y + i * rowH },
          width,
          alignment: align,
          fontSize: el.fontSize || 8,
        });
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
    const bt = opts.backgroundTransform;
    if (bt) {
      dd.background = () => ({
        image: opts.background,
        width: mmToPt(bt.widthMm || page.anchoMm),
        absolutePosition: { x: mmToPt(bt.offsetXMm || 0), y: mmToPt(bt.offsetYMm || 0) },
      });
    } else {
      dd.background = () => ({ image: opts.background, width: mmToPt(page.anchoMm) });
    }
  }
  return dd;
}

/**
 * Imprime un docDefinition mostrando UN solo dialogo de impresion, sin abrir
 * una ventana de PDF aparte. `pdfMake.print()` en Electron abre una ventana
 * extra (Chromium PDF viewer) ademas del dialogo nativo, lo que genera el
 * doble dialogo. Aca usamos un iframe oculto reutilizable: una sola impresion.
 */
export function printDocDefinition(pdfMake: any, dd: any): void {
  pdfMake.createPdf(dd).getBlob((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const ID = 'frc-factura-print-iframe';
    let iframe = document.getElementById(ID) as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = ID;
      iframe.style.position = 'fixed';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }
    iframe.onload = () => {
      // Pequeno delay para que el visor PDF del iframe termine de renderizar.
      setTimeout(() => {
        try {
          iframe!.contentWindow?.focus();
          iframe!.contentWindow?.print();
        } catch (e) {
          console.error('Error al imprimir la factura:', e);
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }, 300);
    };
    iframe.src = url;
  });
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
