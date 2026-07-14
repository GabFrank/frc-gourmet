/**
 * Genera una (o dos) imagen(es) PNG con el resumen de cierre de una caja PdV,
 * con un estilo tipo "tarjeta" similar al resumen de la PWA. Se usa para el
 * envío automático por WhatsApp al cerrar la caja.
 *
 * El render se hace con una BrowserWindow offscreen (Chromium ya embebido en
 * Electron): HTML self-contained → capturePage → PNG → base64. No agrega
 * dependencias. Best-effort: el caller decide qué hacer si devuelve null.
 */
import { BrowserWindow } from 'electron';
import { DataSource } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';
import { Empresa } from '../../src/app/database/entities/sistema/empresa.entity';
import { computeResumenCaja, ResumenCaja } from './resumen-caja.utils';

interface MonedaFmt { simbolo: string; decimales: number; }
interface Row { label: string; value: string; cls?: 'pos' | 'neg' | 'total'; indent?: boolean; head?: boolean; }
interface Section { title: string; rows: Row[]; }
/** Datos para convertir ventas de cada moneda a la moneda principal (guaraníes). */
interface Conversion {
  principalId: number | null;
  /** cotizacion[monedaId] = compraLocal de esa moneda → principal (la principal = 1). */
  cotizacion: { [monedaId: number]: number };
}

const IMG_WIDTH = 480;

function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any
  )[c]);
}

function fmtFecha(d: any): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('es-PY'); } catch { return String(d); }
}

/** Construye las secciones del resumen a partir del ResumenCaja. */
function armarSecciones(resumen: ResumenCaja, monedaFmt: { [id: number]: MonedaFmt }, conversion: Conversion): {
  ventasDesc: Section[];
  gastosRetirosArqueo: Section[];
} {
  const sim = (id: any) => monedaFmt[Number(id)]?.simbolo || '';
  const fmt = (id: any, monto: number): string => {
    const dec = monedaFmt[Number(id)]?.decimales ?? 0;
    const n = Number(monto || 0).toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return `${sim(id)} ${n}`.trim();
  };

  // ── Ventas por forma de pago (agrupado) + total ──
  const ventas: Section = { title: `Ventas (${resumen.cantidadVentas})`, rows: [] };
  const grupos = new Map<string, { monedaId: number; total: number }[]>();
  for (const fp of resumen.ventasPorFormaPago) {
    const nombre = String(fp.formaPago || 'SIN FORMA').toUpperCase();
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre)!.push({ monedaId: fp.monedaId, total: fp.total });
  }
  for (const [nombre, items] of grupos) {
    if (items.length === 1) {
      ventas.rows.push({ label: nombre, value: fmt(items[0].monedaId, items[0].total) });
    } else {
      ventas.rows.push({ label: nombre, value: '', head: true });
      for (const it of items) ventas.rows.push({ label: sim(it.monedaId) || '·', value: fmt(it.monedaId, it.total), indent: true });
    }
  }
  if (resumen.ventasPorFormaPago.length === 0) ventas.rows.push({ label: 'Sin ventas', value: '' });

  // ── Total de ventas: agrupador por moneda + total convertido a guaraníes ──
  if (resumen.ventasTotalPorMoneda.length) {
    ventas.rows.push({ label: 'Total de ventas', value: '', head: true });
    let totalEnGs = 0;
    for (const vt of resumen.ventasTotalPorMoneda) {
      ventas.rows.push({ label: sim(vt.monedaId) || `Moneda ${vt.monedaId}`, value: fmt(vt.monedaId, vt.total), indent: true });
      const cotiz = conversion.principalId != null && Number(vt.monedaId) === conversion.principalId
        ? 1
        : (conversion.cotizacion[Number(vt.monedaId)] || 0);
      totalEnGs += Number(vt.total || 0) * cotiz;
    }
    const totalLabel = conversion.principalId != null ? `Total en ${sim(conversion.principalId) || 'Gs'}` : 'Total';
    ventas.rows.push({ label: totalLabel, value: fmt(conversion.principalId ?? -1, Math.round(totalEnGs)), cls: 'total' });
  }

  // ── Descuentos / Aumentos ──
  const descRows: Row[] = [];
  for (const id of Object.keys(resumen.descuentosPorMoneda).map(Number).filter((id) => resumen.descuentosPorMoneda[id])) {
    descRows.push({ label: 'Descuentos', value: fmt(id, resumen.descuentosPorMoneda[id]), cls: 'neg' });
  }
  for (const id of Object.keys(resumen.aumentosPorMoneda).map(Number).filter((id) => resumen.aumentosPorMoneda[id])) {
    descRows.push({ label: 'Aumentos', value: fmt(id, resumen.aumentosPorMoneda[id]), cls: 'pos' });
  }

  const ventasDesc: Section[] = [ventas];
  if (descRows.length) ventasDesc.push({ title: 'Descuentos / Aumentos', rows: descRows });

  // ── Gastos ──
  const gastosRetirosArqueo: Section[] = [];
  if (resumen.gastos.length) {
    const g: Section = { title: 'Gastos', rows: [] };
    const tot: { [id: number]: number } = {};
    for (const x of resumen.gastos) {
      g.rows.push({ label: String(x.descripcion || x.categoria || 'GASTO').toUpperCase(), value: fmt(x.monedaId, x.monto) });
      tot[Number(x.monedaId)] = (tot[Number(x.monedaId)] || 0) + Number(x.monto || 0);
    }
    for (const id of Object.keys(tot).map(Number)) g.rows.push({ label: 'TOTAL GASTOS', value: fmt(id, tot[id]), cls: 'total' });
    gastosRetirosArqueo.push(g);
  }

  // ── Retiros ──
  if (resumen.retiros.length) {
    const rt: Section = { title: 'Retiros', rows: [] };
    const tot: { [id: number]: number } = {};
    for (const r of resumen.retiros) {
      rt.rows.push({ label: `RETIRO N° ${r.id}${r.responsable ? ' · ' + String(r.responsable).toUpperCase() : ''}`, value: '', head: true });
      for (const d of (r.detalles || [])) {
        rt.rows.push({ label: String(d.monedaDenominacion || '').toUpperCase() || sim(d.monedaId), value: fmt(d.monedaId, d.monto), indent: true });
        tot[Number(d.monedaId)] = (tot[Number(d.monedaId)] || 0) + Number(d.monto || 0);
      }
    }
    for (const id of Object.keys(tot).map(Number)) rt.rows.push({ label: 'TOTAL RETIROS', value: fmt(id, tot[id]), cls: 'total' });
    gastosRetirosArqueo.push(rt);
  }

  // ── Arqueo por moneda ──
  const arqueo: Section = { title: 'Arqueo de caja', rows: [] };
  const aperturaMap: { [id: number]: number } = {};
  for (const x of resumen.conteoApertura) aperturaMap[Number(x.monedaId)] = Number(x.total || 0);
  const cierreMap: { [id: number]: number } = {};
  for (const x of resumen.conteoCierre) cierreMap[Number(x.monedaId)] = Number(x.total || 0);
  const ids = new Set<number>();
  [aperturaMap, cierreMap, resumen.esperadoPorMoneda, resumen.diferenciaPorMoneda].forEach((m) => Object.keys(m).forEach((k) => ids.add(Number(k))));
  for (const id of ids) {
    const dif = Number(resumen.diferenciaPorMoneda[id] || 0);
    arqueo.rows.push({ label: (sim(id) || `Moneda ${id}`), value: '', head: true });
    arqueo.rows.push({ label: 'Apertura', value: fmt(id, aperturaMap[id] || 0), indent: true });
    arqueo.rows.push({ label: 'Cierre', value: fmt(id, cierreMap[id] || 0), indent: true });
    arqueo.rows.push({ label: 'Esperado', value: fmt(id, resumen.esperadoPorMoneda[id] || 0), indent: true });
    arqueo.rows.push({ label: 'Diferencia', value: fmt(id, dif), indent: true, cls: dif > 0 ? 'pos' : dif < 0 ? 'neg' : undefined });
  }
  gastosRetirosArqueo.push(arqueo);

  return { ventasDesc, gastosRetirosArqueo };
}

function renderHeaderHtml(empresaNombre: string, resumen: ResumenCaja): string {
  const caja: any = resumen.caja;
  const cajero = caja?.createdBy?.persona?.nombre || caja?.createdBy?.nickname || '—';
  const terminal = caja?.dispositivo?.nombre || '—';
  const metaRows = [
    ['Caja N°', String(caja?.id ?? '')],
    ['Cajero', String(cajero).toUpperCase()],
    ['Terminal', String(terminal).toUpperCase()],
    ['Apertura', fmtFecha(caja?.fechaApertura)],
    ['Cierre', fmtFecha(caja?.fechaCierre)],
  ];
  return `
    <div class="header">
      <div class="empresa">${esc(empresaNombre || '')}</div>
      <div class="titulo">CIERRE DE CAJA</div>
      <div class="meta">
        ${metaRows.map(([k, v]) => `<div class="meta-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
      </div>
    </div>`;
}

function renderSectionHtml(s: Section): string {
  const rows = s.rows.map((r) => {
    if (r.head) return `<div class="row head"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`;
    const cls = ['row', r.indent ? 'indent' : '', r.cls === 'total' ? 'total' : ''].filter(Boolean).join(' ');
    const valCls = r.cls === 'pos' ? 'pos' : r.cls === 'neg' ? 'neg' : '';
    return `<div class="${cls}"><span>${esc(r.label)}</span><b class="${valCls}">${esc(r.value)}</b></div>`;
  }).join('');
  return `<div class="card"><div class="card-title">${esc(s.title)}</div>${rows}</div>`;
}

function pageHtml(header: string, sections: Section[], pageInfo?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: ${IMG_WIDTH}px; background: #eef1f5; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a2230; padding: 16px; }
    .header { background: linear-gradient(135deg,#1f2d3d,#324b63); color: #fff; border-radius: 16px; padding: 16px 18px; margin-bottom: 14px; }
    .empresa { font-size: 13px; opacity: .85; text-transform: uppercase; letter-spacing: .04em; }
    .titulo { font-size: 22px; font-weight: 800; margin: 2px 0 10px; }
    .meta-row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; opacity: .95; }
    .meta-row b { font-weight: 700; }
    .card { background: #fff; border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
    .card-title { font-size: 14px; font-weight: 700; color: #324b63; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .02em; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid #eef1f5; font-size: 14px; }
    .row:first-of-type { border-top: none; }
    .row span { color: #33414f; }
    .row b { font-weight: 700; white-space: nowrap; }
    .row.indent { padding-left: 14px; border-top: none; padding-top: 3px; padding-bottom: 3px; }
    .row.indent span { color: #6b7684; }
    .row.head { border-top: 1px solid #eef1f5; font-weight: 700; color: #33414f; padding-bottom: 2px; }
    .row.head span { font-weight: 700; text-transform: uppercase; font-size: 13px; }
    .row.total { border-top: 1px solid #d9dfe7; }
    .row.total span, .row.total b { font-weight: 800; }
    b.pos { color: #2e7d32; }
    b.neg { color: #c62828; }
    .pageinfo { text-align: center; font-size: 12px; color: #6b7684; margin-top: 4px; }
  </style></head><body>
    ${header}
    ${sections.map(renderSectionHtml).join('')}
    ${pageInfo ? `<div class="pageinfo">${esc(pageInfo)}</div>` : ''}
  </body></html>`;
}

/** Renderiza un HTML a PNG (base64) usando una ventana offscreen. */
async function renderHtmlToPngBase64(html: string): Promise<string> {
  const win = new BrowserWindow({
    width: IMG_WIDTH + 32,
    height: 400,
    show: false,
    webPreferences: { offscreen: true, sandbox: false },
  });
  try {
    win.webContents.setFrameRate(1);
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const height = await win.webContents.executeJavaScript(
      'Math.min(6000, Math.ceil(document.body.scrollHeight))',
    );
    win.setContentSize(IMG_WIDTH + 32, Math.max(200, Number(height) || 200));
    // Esperar un frame pintado (offscreen emite 'paint'), con fallback por tiempo.
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      win.webContents.once('paint', () => setTimeout(finish, 200));
      setTimeout(finish, 1200);
    });
    const image = await win.webContents.capturePage();
    return image.toPNG().toString('base64');
  } finally {
    win.destroy();
  }
}

/**
 * Genera la(s) imagen(es) del resumen de cierre. Devuelve base64 PNG (1 o 2) o
 * null si no se pudo (best-effort). También devuelve el resumen para el caption.
 */
export async function generarResumenCajaImagenes(
  dataSource: DataSource,
  cajaId: number,
): Promise<{ base64List: string[]; resumen: ResumenCaja; empresaNombre: string } | null> {
  const resumen = await computeResumenCaja(dataSource, cajaId);

  const monedas = await dataSource.getRepository(Moneda).find();
  const monedaFmt: { [id: number]: MonedaFmt } = {};
  for (const m of monedas) monedaFmt[m.id] = { simbolo: (m as any).simbolo || '', decimales: Number((m as any).decimales) || 0 };

  // Moneda principal (para convertir ventas de otras monedas a guaraníes en el
  // total). Prioriza el flag `principal`; si no hay, cae a GUARANI/PYG.
  const monedaPrincipal = monedas.find((m: any) => m.principal)
    || monedas.find((m: any) => String(m.denominacion || '').toUpperCase() === 'GUARANI')
    || monedas.find((m: any) => String(m.simbolo || '').toUpperCase() === 'PYG')
    || null;
  const principalId = monedaPrincipal?.id ?? null;
  const cotizacion: { [monedaId: number]: number } = {};
  if (principalId != null) {
    // compraLocal más reciente de cada moneda origen → principal.
    const cambios = await dataSource.getRepository(MonedaCambio).find({
      where: { monedaDestino: { id: principalId } as any, activo: true },
      relations: ['monedaOrigen'],
      order: { createdAt: 'DESC' as any },
    });
    for (const c of cambios) {
      const oid = (c as any).monedaOrigen?.id;
      if (oid != null && cotizacion[Number(oid)] == null) cotizacion[Number(oid)] = Number((c as any).compraLocal || 0);
    }
  }
  const conversion: Conversion = { principalId, cotizacion };

  let empresaNombre = '';
  try {
    const empresa = await dataSource.getRepository(Empresa).find();
    empresaNombre = (empresa?.[0]?.razonSocial || empresa?.[0]?.nombre || '') as string;
  } catch { /* sin empresa */ }

  const header = renderHeaderHtml(empresaNombre, resumen);
  const { ventasDesc, gastosRetirosArqueo } = armarSecciones(resumen, monedaFmt, conversion);

  // Decidir 1 o 2 imágenes según volumen (gastos/retiros hacen el resumen largo).
  const hayExtra = resumen.gastos.length > 0 || resumen.retiros.length > 0;
  const base64List: string[] = [];
  if (hayExtra) {
    base64List.push(await renderHtmlToPngBase64(pageHtml(header, ventasDesc, 'Página 1/2')));
    base64List.push(await renderHtmlToPngBase64(pageHtml(header, gastosRetirosArqueo, 'Página 2/2')));
  } else {
    base64List.push(await renderHtmlToPngBase64(pageHtml(header, [...ventasDesc, ...gastosRetirosArqueo])));
  }

  return { base64List, resumen, empresaNombre };
}

/** Texto corto de encabezado/caption o fallback si falla el render de imagen. */
export function buildResumenCajaCaption(
  resumen: ResumenCaja,
  empresaNombre: string,
): string {
  const caja: any = resumen.caja;
  const cajero = caja?.createdBy?.persona?.nombre || caja?.createdBy?.nickname || '—';
  const lineas = [
    `🧾 *CIERRE DE CAJA*${empresaNombre ? ' · ' + empresaNombre.toUpperCase() : ''}`,
    `Caja N° ${caja?.id ?? ''} · ${String(cajero).toUpperCase()}`,
    `Cierre: ${fmtFecha(caja?.fechaCierre)}`,
    `N° ventas: ${resumen.cantidadVentas}`,
  ];
  return lineas.join('\n');
}
