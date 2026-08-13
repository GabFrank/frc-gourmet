import { loadPdfMake } from 'src/app/pages/facturacion/plantillas/plantilla-render.util';
import { KpiCard } from './reporte-visual';

export interface ReporteExportData {
  titulo: string;
  periodoLabel: string;
  comparaLabel: string | null;
  kpis: KpiCard[];
  imagenes: Array<{ titulo: string; dataUrl: string }>;
  tablas: Array<{ titulo: string; headers: string[]; filas: string[][] }>;
}

/**
 * Captura los <canvas> de chart.js dentro de un contenedor, emparejados con su
 * título vía el atributo `data-rep-titulo` del wrapper de la tarjeta.
 */
export function capturarGraficos(container: HTMLElement): Array<{ titulo: string; dataUrl: string }> {
  const out: Array<{ titulo: string; dataUrl: string }> = [];
  container.querySelectorAll<HTMLElement>('[data-rep-titulo]').forEach((el) => {
    const canvas = el.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    try { out.push({ titulo: el.getAttribute('data-rep-titulo') || '', dataUrl: canvas.toDataURL('image/png', 1) }); } catch { /* canvas vacío */ }
  });
  return out;
}

/** Base64 (sin prefijo data:) del primer gráfico, para enviar por WhatsApp. */
export function primerGraficoBase64(container: HTMLElement): string | null {
  const canvas = container.querySelector('[data-rep-titulo] canvas') as HTMLCanvasElement | null;
  if (!canvas) return null;
  try { return canvas.toDataURL('image/png').split(',')[1] || null; } catch { return null; }
}

/** Caption de texto con los KPIs para acompañar la imagen en WhatsApp. */
export function captionKpis(titulo: string, periodoLabel: string, kpis: KpiCard[]): string {
  const lineas = kpis.map((k) => {
    const delta = k.tieneDelta ? `  (${k.dir === 'up' ? '↑' : '↓'}${k.deltaTexto})` : '';
    return `• ${k.label}: ${k.valor}${delta}`;
  });
  return `*${titulo}*\n${periodoLabel}\n\n${lineas.join('\n')}`;
}

/** Genera y descarga el PDF del reporte. */
export async function exportarReportePdf(data: ReporteExportData): Promise<void> {
  const pdfMake = await loadPdfMake();
  const content: any[] = [
    { text: data.titulo, style: 'h1' },
    { text: data.periodoLabel + (data.comparaLabel ? `   ·   vs ${data.comparaLabel}` : ''), style: 'sub', margin: [0, 2, 0, 14] },
  ];

  if (data.kpis.length) {
    content.push({
      table: {
        widths: Array(data.kpis.length).fill('*'),
        body: [
          data.kpis.map((k) => ({ text: k.label.toUpperCase(), style: 'kpiLabel' })),
          data.kpis.map((k) => ({ text: k.valor, style: 'kpiValue' })),
          data.kpis.map((k) => ({ text: k.tieneDelta ? `${k.dir === 'up' ? '▲ ' : '▼ '}${k.deltaTexto}` : '', style: 'kpiDelta', color: k.buena ? '#2e7d32' : '#c62828' })),
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 18],
    });
  }

  for (let i = 0; i < data.imagenes.length; i += 2) {
    const par = data.imagenes.slice(i, i + 2);
    content.push({
      columns: par.map((g) => ({ width: '*', stack: [{ text: g.titulo, style: 'cardTitle' }, { image: g.dataUrl, width: 248 }] })),
      columnGap: 16,
      margin: [0, 0, 0, 14],
    });
  }

  for (const t of data.tablas) {
    content.push({ text: t.titulo, style: 'cardTitle', margin: [0, 6, 0, 4] });
    content.push({
      table: {
        headerRows: 1,
        widths: t.headers.map((_, i) => (i === 0 ? '*' : 'auto')),
        body: [t.headers.map((h) => ({ text: h.toUpperCase(), style: 'th' })), ...t.filas.map((f) => f.map((c) => ({ text: c, style: 'td' })))],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 14],
    });
  }

  const dd = {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [28, 28, 28, 34],
    footer: (page: number, total: number) => ({ text: `FRC Gourmet · ${page}/${total}`, alignment: 'center', fontSize: 8, color: '#999', margin: [0, 8, 0, 0] }),
    content,
    styles: {
      h1: { fontSize: 18, bold: true, color: '#db392e' },
      sub: { fontSize: 10, color: '#666666' },
      kpiLabel: { fontSize: 7.5, color: '#888888' },
      kpiValue: { fontSize: 13, bold: true },
      kpiDelta: { fontSize: 8.5, bold: true },
      cardTitle: { fontSize: 11, bold: true, margin: [0, 0, 0, 4] },
      th: { fontSize: 7.5, bold: true, color: '#888888' },
      td: { fontSize: 9 },
    },
    defaultStyle: { fontSize: 10 },
  };

  pdfMake.createPdf(dd).download(`${data.titulo.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
