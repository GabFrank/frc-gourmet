/**
 * Helpers para generación de PDFs con pdfmake.
 *
 * Centraliza:
 * - `buildPdfBase64(docDef)` / `buildExcelBase64(headers, rows)` — primitivas
 *   que devuelven el archivo en base64 listo para que el frontend lo descargue.
 * - Estilos comunes (`PDF_STYLES`, `PDF_DEFAULT_STYLE`).
 * - Composición: `pdfHeaderEmpresa`, `pdfFooterPaginado`, `pdfBloqueFirma*`,
 *   `pdfTablaSimple`, `pdfTablaMontos`.
 * - Formato: `pdfFmtFecha`, `pdfFmtFechaHora`, `pdfFmtMonto`, `pdfFmtMontoMoneda`,
 *   `pdfTextoEnLetras` (wraps `monto-letras.utils.ts`).
 *
 * Cada handler de export-*-pdf compone un `docDefinition` usando estos helpers
 * y llama `buildPdfBase64`. El header de empresa se cachea en memoria 60s para
 * evitar leer el logo del disco en cada PDF.
 *
 * **Logo en modo cliente:** `loadLogoAsDataUrl` lee del filesystem local. En
 * `mode=client`, el archivo del logo vive en el servidor remoto — el cliente
 * no tendría acceso. Solución (E2 deferred): cachear el logo como dataURL en
 * `Empresa.logoDataUrl` cuando se sube; el cliente lee el dataURL ya resuelto
 * del registro. Por ahora, en modo cliente el header simplemente omite el logo.
 */

import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Empresa } from '../../src/app/database/entities/sistema/empresa.entity';
import { montoEnLetras, MonedaCode } from './monto-letras.utils';

// @ts-ignore
const pdfMake = require('pdfmake/build/pdfmake');
try {
  // @ts-ignore
  require('pdfmake/build/vfs_fonts');
} catch (_e) { /* VFS opcional */ }

// @ts-ignore
import * as ExcelJS from 'exceljs';

// ============================================================
// PRIMITIVES
// ============================================================

export async function buildPdfBase64(docDef: any): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const merged = {
        ...docDef,
        defaultStyle: { ...PDF_DEFAULT_STYLE, ...(docDef.defaultStyle || {}) },
        styles: { ...PDF_STYLES, ...(docDef.styles || {}) },
      };
      const doc = pdfMake.createPdf(merged);
      doc.getBuffer((buf: Buffer) => {
        resolve(Buffer.from(buf).toString('base64'));
      });
    } catch (e) {
      reject(e);
    }
  });
}

export async function buildExcelBase64(headers: string[], rows: any[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reporte');
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

// ============================================================
// ESTILOS
// ============================================================

export const PDF_DEFAULT_STYLE: any = {
  fontSize: 10,
  lineHeight: 1.2,
};

export const PDF_STYLES: any = {
  h1:            { fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
  h2:            { fontSize: 13, bold: true, margin: [0, 8, 0, 4] },
  h3:            { fontSize: 11, bold: true, margin: [0, 6, 0, 3] },
  subtitle:      { fontSize: 11, alignment: 'center', margin: [0, 0, 0, 8] },
  sectionHeader: { fontSize: 11, bold: true, margin: [0, 8, 0, 4], decoration: 'underline' },
  label:         { fontSize: 9, color: '#666' },
  value:         { fontSize: 10 },
  campo:         { fontSize: 10, margin: [0, 2, 0, 2] },
  campoBold:     { fontSize: 10, bold: true, margin: [0, 2, 0, 2] },
  smallMuted:    { fontSize: 8, color: '#888' },
  monto:         { fontSize: 12, bold: true, alignment: 'right' },
  montoGrande:   { fontSize: 14, bold: true, alignment: 'right' },
  legal:         { fontSize: 9, alignment: 'justify', margin: [0, 4, 0, 4] },
  firma:         { fontSize: 9, alignment: 'center', margin: [0, 4, 0, 0] },
  tableHeader:   { fontSize: 10, bold: true, fillColor: '#f0f0f0' },
};

// ============================================================
// FORMATO
// ============================================================

export function pdfFmtFecha(d?: Date | string | null): string {
  if (!d) return '';
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return ''; }
}

export function pdfFmtFechaHora(d?: Date | string | null): string {
  if (!d) return '';
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('es-PY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

export function pdfFmtMonto(n: number | string | null | undefined, decimals = 2): string {
  const num = Number(n || 0);
  return num.toLocaleString('es-PY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function pdfFmtMontoMoneda(n: number, moneda: MonedaCode | string = 'PYG'): string {
  const code = (moneda || 'PYG').toUpperCase();
  if (code === 'PYG') return `Gs. ${pdfFmtMonto(n, 0)}`;
  if (code === 'USD') return `US$ ${pdfFmtMonto(n, 2)}`;
  if (code === 'BRL') return `R$ ${pdfFmtMonto(n, 2)}`;
  return `${code} ${pdfFmtMonto(n, 2)}`;
}

export function pdfTextoEnLetras(monto: number, moneda: MonedaCode | string = 'PYG'): string {
  const code = (moneda || 'PYG').toUpperCase() as MonedaCode;
  return montoEnLetras(monto, code);
}

// ============================================================
// HEADER EMPRESA (con cache de logo)
// ============================================================

let _empresaCache: {
  data: Empresa | null;
  logoDataUrl: string | null;
  expires: number;
} = { data: null, logoDataUrl: null, expires: 0 };

async function getEmpresaCached(dataSource: DataSource): Promise<{
  empresa: Empresa | null;
  logoDataUrl: string | null;
}> {
  const now = Date.now();
  if (_empresaCache.expires > now && _empresaCache.data) {
    return { empresa: _empresaCache.data, logoDataUrl: _empresaCache.logoDataUrl };
  }
  let empresa: Empresa | null = null;
  try {
    empresa = await dataSource.getRepository(Empresa).findOne({ where: { id: 1 } as any });
  } catch (e) {
    console.warn('pdf.utils: no se pudo cargar Empresa', e);
  }
  let logoDataUrl: string | null = null;
  if (empresa?.logoUrl) {
    logoDataUrl = await loadLogoAsDataUrl(empresa.logoUrl);
  }
  _empresaCache = { data: empresa, logoDataUrl, expires: now + 60_000 };
  return { empresa, logoDataUrl };
}

/** Invalidar cache cuando se edita Empresa (llamar desde `update-empresa`). */
export function invalidatePdfEmpresaCache(): void {
  _empresaCache = { data: null, logoDataUrl: null, expires: 0 };
}

async function loadLogoAsDataUrl(logoUrl: string): Promise<string | null> {
  try {
    if (!logoUrl.startsWith('app://')) return null;
    const rest = logoUrl.replace(/^app:\/\//, '');
    const slash = rest.indexOf('/');
    if (slash <= 0) return null;
    const carpeta = rest.substring(0, slash);
    const relPath = rest.substring(slash + 1);
    const abs = path.join(app.getPath('userData'), carpeta, relPath);
    if (!fs.existsSync(abs)) return null;
    const buf = fs.readFileSync(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = ext === '.png'  ? 'image/png'
              : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
              : ext === '.gif'  ? 'image/gif'
              : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn('loadLogoAsDataUrl failed:', e);
    return null;
  }
}

export interface PdfHeaderOpts {
  showLogo?: boolean;
  showTimbrado?: boolean;
  subtitle?: string;
  titulo?: string;     // si se provee, se renderiza como h1 después del logo+empresa
}

export async function pdfHeaderEmpresa(
  dataSource: DataSource,
  opts: PdfHeaderOpts = {}
): Promise<any> {
  const { empresa, logoDataUrl } = await getEmpresaCached(dataSource);
  const showLogo = opts.showLogo !== false;
  const showTimbrado = opts.showTimbrado === true;

  const empresaInfo: any[] = [];
  if (empresa) {
    const nombre = (empresa.razonSocial || empresa.nombre || '').toUpperCase();
    if (nombre) empresaInfo.push({ text: nombre, fontSize: 12, bold: true, alignment: 'center' });
    if (empresa.ruc) empresaInfo.push({ text: `RUC: ${empresa.ruc}`, fontSize: 9, alignment: 'center' });
    if (empresa.direccion) empresaInfo.push({ text: empresa.direccion, fontSize: 9, alignment: 'center' });
    const contacto = [empresa.telefono, empresa.email].filter(Boolean).join(' · ');
    if (contacto) empresaInfo.push({ text: contacto, fontSize: 9, alignment: 'center' });
    if (showTimbrado && empresa.timbradoNumero) {
      const tvig = empresa.timbradoVigenciaHasta
        ? ` · Vigencia: ${pdfFmtFecha(empresa.timbradoVigenciaHasta)}`
        : '';
      empresaInfo.push({
        text: `Timbrado: ${empresa.timbradoNumero}${tvig}`,
        style: 'smallMuted', alignment: 'center',
      });
      if (empresa.puntoExpedicion) {
        empresaInfo.push({
          text: `Punto de expedición: ${empresa.puntoExpedicion}`,
          style: 'smallMuted', alignment: 'center',
        });
      }
    }
  }

  const stack: any[] = [];
  if (showLogo && logoDataUrl) {
    stack.push({
      columns: [
        { image: logoDataUrl, width: 70, alignment: 'left' },
        { stack: empresaInfo, width: '*' },
        { text: '', width: 70 },  // balanceo visual
      ],
    });
  } else if (empresaInfo.length > 0) {
    stack.push({ stack: empresaInfo });
  }

  if (opts.titulo) {
    stack.push({ text: opts.titulo.toUpperCase(), style: 'h1', margin: [0, 10, 0, 4] });
  }
  if (opts.subtitle) {
    stack.push({ text: opts.subtitle, style: 'subtitle' });
  }

  return { stack, margin: [0, 0, 0, 12] };
}

// ============================================================
// FOOTER
// ============================================================

export function pdfFooterPaginado(opts: { showGenerado?: boolean } = {}) {
  const showGen = opts.showGenerado !== false;
  return (currentPage: number, pageCount: number) => ({
    columns: [
      showGen
        ? { text: `Generado: ${new Date().toLocaleString('es-PY')}`, style: 'smallMuted', margin: [40, 10, 0, 0] }
        : { text: '', margin: [40, 10, 0, 0] },
      { text: `Página ${currentPage} de ${pageCount}`, style: 'smallMuted', alignment: 'right', margin: [0, 10, 40, 0] },
    ],
  });
}

// ============================================================
// BLOQUES DE FIRMA
// ============================================================

export interface BloqueFirmaOpts {
  showAclaracion?: boolean;
  showCi?: boolean;
  width?: string | number;
  preTopMargin?: number;   // espacio antes de la línea (default 30)
}

export function pdfBloqueFirma(label: string, opts: BloqueFirmaOpts = {}): any {
  const lines: any[] = [
    { text: '________________________________', alignment: 'center' },
    { text: label.toUpperCase(), style: 'firma' },
  ];
  if (opts.showAclaracion) {
    lines.push({ text: 'Aclaración: _____________________', style: 'smallMuted', alignment: 'center', margin: [0, 6, 0, 0] });
  }
  if (opts.showCi) {
    lines.push({ text: 'C.I.: _____________________', style: 'smallMuted', alignment: 'center', margin: [0, 4, 0, 0] });
  }
  return {
    stack: lines,
    width: opts.width || '*',
    margin: [0, opts.preTopMargin ?? 30, 0, 0],
  };
}

export function pdfBloqueFirmaDoble(labels: [string, string], opts: BloqueFirmaOpts = {}): any {
  return { columns: labels.map(l => pdfBloqueFirma(l, opts)) };
}

export function pdfBloqueFirmaTriple(labels: [string, string, string], opts: BloqueFirmaOpts = {}): any {
  return { columns: labels.map(l => pdfBloqueFirma(l, opts)) };
}

// ============================================================
// TABLAS HELPERS
// ============================================================

export interface TablaOpts {
  widths?: any[];
  alignment?: ('left' | 'center' | 'right')[];
  layout?: string;
  headerFill?: string;
}

export function pdfTablaSimple(headers: string[], rows: any[][], opts: TablaOpts = {}): any {
  const widths = opts.widths || headers.map(() => '*');
  const headerRow = headers.map((h, i) => ({
    text: (h || '').toUpperCase(),
    bold: true,
    fillColor: opts.headerFill || '#f0f0f0',
    alignment: opts.alignment?.[i] || 'left',
  }));
  const bodyRows = rows.map(row => row.map((cell, i) => {
    if (cell != null && typeof cell === 'object') return cell;
    return { text: String(cell ?? ''), alignment: opts.alignment?.[i] || 'left' };
  }));
  return {
    table: { headerRows: 1, widths, body: [headerRow, ...bodyRows] },
    layout: opts.layout || 'lightHorizontalLines',
  };
}

/**
 * Tabla con columna(s) de monto alineadas a la derecha y opcionalmente una
 * fila de total al final. `montoCols` indica los índices de columnas a alinear
 * a la derecha.
 */
export function pdfTablaMontos(
  headers: string[],
  rows: any[][],
  opts: TablaOpts & { montoCols?: number[]; totalLabel?: string; totalValue?: string | number; totalCol?: number } = {}
): any {
  const montoCols = new Set(opts.montoCols || [headers.length - 1]);
  const alignment = headers.map((_, i) => montoCols.has(i) ? 'right' : 'left') as ('left' | 'right')[];

  const tabla = pdfTablaSimple(headers, rows, { ...opts, alignment: opts.alignment || alignment });
  if (opts.totalLabel != null && opts.totalValue != null) {
    const totalCol = opts.totalCol != null ? opts.totalCol : headers.length - 1;
    const totalRow = headers.map((_, i) => {
      if (i === totalCol - 1 || (totalCol === 0 && i === 0)) {
        return { text: opts.totalLabel, bold: true, alignment: 'right' };
      }
      if (i === totalCol) {
        const v = typeof opts.totalValue === 'number' ? pdfFmtMonto(opts.totalValue) : String(opts.totalValue);
        return { text: v, bold: true, alignment: 'right' };
      }
      return { text: '' };
    });
    tabla.table.body.push(totalRow);
  }
  return tabla;
}

/**
 * Bloque "etiqueta: valor" en columnas — para mostrar metadatos de un
 * documento (fecha, cliente, número, etc.) en bloques de 2 columnas.
 */
export function pdfMetadatos(items: { label: string; value: string }[], colsPerRow: 2 | 3 = 2): any {
  const rows: any[] = [];
  for (let i = 0; i < items.length; i += colsPerRow) {
    const cols = items.slice(i, i + colsPerRow).map(it => ({
      stack: [
        { text: it.label.toUpperCase(), style: 'label' },
        { text: it.value || '—', style: 'value' },
      ],
      width: '*',
    }));
    while (cols.length < colsPerRow) cols.push({ stack: [], width: '*' } as any);
    rows.push({ columns: cols, margin: [0, 2, 0, 2] });
  }
  return { stack: rows };
}

// ============================================================
// PLANTILLAS REUSABLES (para E3.4 — pagaré, recibo, etc.)
// ============================================================

export interface RenderPagareOpts {
  empresaHeader: any;
  numeroDocumento: string;
  fechaEmision: Date | string;
  fechaVencimiento?: Date | string;
  lugar?: string;
  deudor: { nombre: string; documento?: string; direccion?: string };
  acreedor?: { nombre: string; documento?: string };
  montoTotal: number;
  moneda: MonedaCode | string;
  cuotas?: { numero: number; fechaVencimiento: Date | string; monto: number }[];
  clausulasExtra?: string;
}

/**
 * Renderiza un docDefinition de pagaré genérico. Lo usan:
 * - `export-pagare-cpc-pdf` (venta a crédito)
 * - `export-pagare-cpp-pdf` (préstamo recibido)
 * - `export-pagare-prestamo-funcionario-pdf`
 */
export function renderPagareDoc(opts: RenderPagareOpts): any {
  const monedaCode = ((opts.moneda || 'PYG') as string).toUpperCase();
  const lugarYFecha = `${(opts.lugar || 'ASUNCIÓN').toUpperCase()}, ${pdfFmtFecha(opts.fechaEmision)}`;
  const cuerpoLegal =
    `Por la presente, EL/LA SUSCRIPTO/A ${opts.deudor.nombre.toUpperCase()}` +
    (opts.deudor.documento ? `, con documento ${opts.deudor.documento}` : '') +
    (opts.deudor.direccion ? `, con domicilio en ${opts.deudor.direccion}` : '') +
    `, RECONOCE DEBER y SE OBLIGA A PAGAR a la orden de ${(opts.acreedor?.nombre || '—').toUpperCase()}` +
    (opts.acreedor?.documento ? ` (${opts.acreedor.documento})` : '') +
    `, la suma de ${pdfFmtMontoMoneda(opts.montoTotal, monedaCode)} (${pdfTextoEnLetras(opts.montoTotal, monedaCode)})` +
    (opts.fechaVencimiento ? `, con fecha de vencimiento ${pdfFmtFecha(opts.fechaVencimiento)}` : '') +
    `, en el lugar y modalidad pactados.`;

  const content: any[] = [
    opts.empresaHeader,
    { text: 'PAGARÉ', style: 'h1' },
    { text: `N° ${opts.numeroDocumento}`, style: 'subtitle' },
    { text: lugarYFecha, alignment: 'right', margin: [0, 0, 0, 12] },
    { text: cuerpoLegal, style: 'legal' },
  ];

  if (opts.cuotas && opts.cuotas.length > 0) {
    content.push({ text: 'PLAN DE PAGOS', style: 'sectionHeader' });
    content.push(pdfTablaMontos(
      ['N° CUOTA', 'VENCIMIENTO', 'MONTO'],
      opts.cuotas.map(c => [
        String(c.numero),
        pdfFmtFecha(c.fechaVencimiento),
        pdfFmtMonto(c.monto, monedaCode === 'PYG' ? 0 : 2),
      ]),
      { widths: ['auto', 'auto', '*'], montoCols: [2],
        totalLabel: 'TOTAL', totalValue: pdfFmtMonto(opts.montoTotal, monedaCode === 'PYG' ? 0 : 2) }
    ));
  }

  if (opts.clausulasExtra) {
    content.push({ text: 'CLÁUSULAS ADICIONALES', style: 'sectionHeader' });
    content.push({ text: opts.clausulasExtra, style: 'legal' });
  }

  content.push({ text: ' ' });
  content.push(pdfBloqueFirmaDoble(['FIRMA DEL DEUDOR', 'FIRMA DEL ACREEDOR'], { showAclaracion: true, showCi: true }));

  return {
    content,
    footer: pdfFooterPaginado(),
  };
}

export interface RenderReciboOpts {
  empresaHeader: any;
  tipo: 'COBRO' | 'PAGO';     // afecta el título y bloques
  numeroDocumento: string;
  fecha: Date | string;
  contraparte: { rol: string; nombre: string; documento?: string };  // ej. rol='Cliente'
  montoTotal: number;
  moneda: MonedaCode | string;
  detalle?: string;
  formaPago?: string;
  referencias?: { label: string; value: string }[];
}

/**
 * Renderiza un docDefinition de recibo (cobro / pago). Lo usan:
 * - `export-recibo-cobro-cpc-pdf`
 * - `export-recibo-pago-cpp-pdf`
 * - `export-vale-autorizacion-pdf` (con tipo='PAGO')
 */
export function renderReciboDoc(opts: RenderReciboOpts): any {
  const monedaCode = ((opts.moneda || 'PYG') as string).toUpperCase();
  const titulo = opts.tipo === 'COBRO' ? 'RECIBO DE COBRO' : 'RECIBO DE PAGO';

  const meta: { label: string; value: string }[] = [
    { label: 'Número', value: opts.numeroDocumento },
    { label: 'Fecha', value: pdfFmtFecha(opts.fecha) },
    { label: opts.contraparte.rol, value: opts.contraparte.nombre },
    { label: 'Documento', value: opts.contraparte.documento || '—' },
    ...(opts.referencias || []),
  ];

  const verbo = opts.tipo === 'COBRO' ? 'RECIBÍ' : 'PAGUÉ';
  const direccion = opts.tipo === 'COBRO' ? 'DE' : 'A';
  const cuerpo = `${verbo} ${direccion} ${opts.contraparte.nombre.toUpperCase()} la suma de ` +
    `${pdfFmtMontoMoneda(opts.montoTotal, monedaCode)} (${pdfTextoEnLetras(opts.montoTotal, monedaCode)})` +
    (opts.detalle ? `, en concepto de ${opts.detalle}` : '') +
    (opts.formaPago ? `, mediante ${opts.formaPago}` : '') + '.';

  return {
    content: [
      opts.empresaHeader,
      { text: titulo, style: 'h1' },
      { text: ' ' },
      pdfMetadatos(meta, 2),
      { text: ' ' },
      { text: cuerpo, style: 'legal' },
      { text: ' ' },
      { text: ' ' },
      pdfBloqueFirmaDoble(
        opts.tipo === 'COBRO'
          ? ['FIRMA DEL COBRADOR', `FIRMA DEL ${opts.contraparte.rol.toUpperCase()}`]
          : ['FIRMA DEL PAGADOR', `FIRMA DEL ${opts.contraparte.rol.toUpperCase()}`],
        { showAclaracion: true }
      ),
    ],
    footer: pdfFooterPaginado(),
  };
}
