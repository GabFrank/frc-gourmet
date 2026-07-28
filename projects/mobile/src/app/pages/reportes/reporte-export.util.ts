import { KpiCard } from './reporte-visual.util';

/**
 * Export de reportes mobile: carga pdfmake por import dinámico (browser),
 * captura los `<canvas>` marcados con `[data-rep-titulo]` y arma un PDF simple
 * A4 con KPIs, gráficos y tablas. También helpers para el envío por WhatsApp.
 */
async function loadPdfMake(): Promise<any> {
  // @ts-ignore — pdfmake sin types
  const pdfMakeMod: any = await import('pdfmake/build/pdfmake');
  // @ts-ignore
  const pdfFontsMod: any = await import('pdfmake/build/vfs_fonts');
  const pdfMake: any = pdfMakeMod.default || pdfMakeMod;
  pdfMake.vfs = (pdfFontsMod.default || pdfFontsMod).pdfMake?.vfs || pdfFontsMod.pdfMake?.vfs;
  return pdfMake;
}

export interface ReporteImagen { titulo: string; dataUrl: string; }
export interface ReporteTabla { titulo: string; headers: string[]; filas: string[][]; }
export interface ReporteExportData {
  titulo: string;
  periodoLabel: string;
  comparaLabel: string | null;
  kpis: KpiCard[];
  imagenes: ReporteImagen[];
  tablas: ReporteTabla[];
}

/** Captura los gráficos (canvas) de un contenedor como imágenes PNG. */
export function capturarGraficos(root: HTMLElement): ReporteImagen[] {
  const out: ReporteImagen[] = [];
  const wrappers = Array.from(root.querySelectorAll<HTMLElement>('[data-rep-titulo]'));
  for (const w of wrappers) {
    const canvas = w.querySelector('canvas');
    if (canvas) {
      try { out.push({ titulo: w.getAttribute('data-rep-titulo') || '', dataUrl: (canvas as HTMLCanvasElement).toDataURL('image/png') }); } catch { /* tainted */ }
    }
  }
  return out;
}

/** Primer gráfico del contenedor como base64 (sin el prefijo data:). */
export function primerGraficoBase64(root: HTMLElement): string | null {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-rep-titulo] canvas');
  if (!canvas) return null;
  try { return canvas.toDataURL('image/png').split(',')[1] || null; } catch { return null; }
}

/** Texto (caption) con los KPIs para el mensaje de WhatsApp. */
export function captionKpis(titulo: string, periodoLabel: string, kpis: KpiCard[]): string {
  const lineas = kpis.map((k) => `• ${k.label}: ${k.valor}${k.tieneDelta ? ` (${k.deltaTexto})` : ''}`);
  return `*${titulo}*\n${periodoLabel}\n\n${lineas.join('\n')}`;
}

export async function exportarReportePdf(data: ReporteExportData): Promise<void> {
  const pdfMake = await loadPdfMake();
  const ROJO = '#db392e';
  const content: any[] = [
    { text: data.titulo, color: ROJO, fontSize: 16, bold: true },
    { text: data.periodoLabel + (data.comparaLabel ? `  ·  vs ${data.comparaLabel}` : ''), color: '#666', fontSize: 9, margin: [0, 2, 0, 10] },
  ];

  // KPIs como tabla
  if (data.kpis.length) {
    content.push({
      table: {
        widths: Array(data.kpis.length).fill('*'),
        body: [
          data.kpis.map((k) => ({ text: k.label, fontSize: 8, color: '#888' })),
          data.kpis.map((k) => ({ text: k.valor, fontSize: 11, bold: true })),
          data.kpis.map((k) => ({ text: k.tieneDelta ? k.deltaTexto : '', fontSize: 8, color: k.buena ? '#1baf7a' : '#db392e' })),
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 12],
    });
  }

  // Gráficos (2 por fila)
  for (let i = 0; i < data.imagenes.length; i += 2) {
    const par = data.imagenes.slice(i, i + 2);
    content.push({
      columns: par.map((img) => ({
        width: '*',
        stack: [
          { text: img.titulo, fontSize: 9, bold: true, margin: [0, 0, 0, 4] },
          { image: img.dataUrl, width: 245 },
        ],
      })),
      columnGap: 12,
      margin: [0, 0, 0, 12],
    });
  }

  // Tablas
  for (const t of data.tablas) {
    content.push({ text: t.titulo, fontSize: 10, bold: true, margin: [0, 4, 0, 4] });
    content.push({
      table: {
        headerRows: 1,
        widths: t.headers.map((_, i) => (i === 0 ? '*' : 'auto')),
        body: [
          t.headers.map((h) => ({ text: h, fontSize: 8, bold: true, color: '#888' })),
          ...t.filas.map((f) => f.map((c) => ({ text: c, fontSize: 9 }))),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 10],
    });
  }

  const doc = { pageSize: 'A4', pageMargins: [28, 28, 28, 28], content, defaultStyle: { fontSize: 9 } };
  const nombre = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  pdfMake.createPdf(doc).download(`${nombre || 'reporte'}.pdf`);
}
