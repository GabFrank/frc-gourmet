import { DataSource } from 'typeorm';
import { dbQuery } from '../utils/db-query';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import {
  getMonedaPrincipalId, getCotizacionMap, sumaVentasRango, desgloseVentasRango, filtroRango,
} from './dashboard-ventas.handler';
import { resolverPeriodo, variacionPct, RangoFechas } from './reportes-periodo.util';
import type { ReportePeriodoParams } from './reportes.handler';

const DIAS_LUN_PRIMERO = [1, 2, 3, 4, 5, 6, 0]; // strftime/EXTRACT DOW: 0=Dom..6=Sáb
const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface CotCtx {
  monPrincipal: number;
  cotMap: { [id: number]: number };
  isPg: boolean;
}

/** Expresiones de fecha driver-aware. created_at se guarda como se persiste
 * (ISO/UTC en SQLite, timestamp en Postgres); las franjas horarias siguen ese
 * huso — igual criterio que los dashboards existentes. */
function dowExpr(isPg: boolean): string {
  return isPg ? `EXTRACT(DOW FROM v.created_at)` : `CAST(strftime('%w', v.created_at) AS INTEGER)`;
}
function hourExpr(isPg: boolean): string {
  return isPg ? `EXTRACT(HOUR FROM v.created_at)` : `CAST(strftime('%H', v.created_at) AS INTEGER)`;
}
function dayExpr(isPg: boolean): string {
  return isPg ? `to_char(v.created_at, 'YYYY-MM-DD')` : `strftime('%Y-%m-%d', v.created_at)`;
}

function esPrincipal(v: any): boolean { return v === true || v === 1 || v === '1'; }

// ─────────────────────────── KPIs ───────────────────────────
async function kpisVentas(ds: DataSource, ctx: CotCtx, r: RangoFechas) {
  const filtro = filtroRango(r.desde.toISOString(), r.hasta.toISOString());
  const { cnt, suma } = await sumaVentasRango(ds, ctx.monPrincipal, filtro, ctx.cotMap);

  const margenRows: any[] = await dbQuery(ds, `
    SELECT COALESCE(SUM(vi.cantidad * vi.precio_venta_unitario), 0) as ingreso,
           COALESCE(SUM(vi.cantidad * vi.precio_costo_unitario), 0) as costo
    FROM venta_items vi
    JOIN ventas v ON v.id = vi.venta_id
    WHERE v.estado = ? AND vi.estado = ? AND v.created_at >= ? AND v.created_at <= ?
  `, [VentaEstado.CONCLUIDA, EstadoVentaItem.ACTIVO, r.desde.toISOString(), r.hasta.toISOString()]);
  const ingreso = Number(margenRows?.[0]?.ingreso || 0);
  const costo = Number(margenRows?.[0]?.costo || 0);
  const margenPct = ingreso > 0 ? +(((ingreso - costo) / ingreso) * 100).toFixed(1) : 0;

  const mesasRows: any[] = await dbQuery(ds, `
    SELECT COUNT(DISTINCT v.mesa_id) as cnt FROM ventas v
    WHERE v.estado = ? AND v.mesa_id IS NOT NULL AND v.created_at >= ? AND v.created_at <= ?
  `, [VentaEstado.CONCLUIDA, r.desde.toISOString(), r.hasta.toISOString()]);

  return {
    facturacion: suma,
    tickets: cnt,
    ticketPromedio: cnt > 0 ? Math.round(suma / cnt) : 0,
    margenPct,
    mesas: Number(mesasRows?.[0]?.cnt || 0),
  };
}

function conDelta(act: number, ant: number | null) {
  return { valor: act, variacion: ant == null ? null : variacionPct(act, ant) };
}

// ─────────────────────── Serie diaria (Gs) ───────────────────────
async function sumaDiariaGs(ds: DataSource, ctx: CotCtx, r: RangoFechas): Promise<{ [dia: string]: number }> {
  const rows: any[] = await dbQuery(ds, `
    SELECT ${dayExpr(ctx.isPg)} as dia, pd.moneda_id as moneda_id, m.principal as principal,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
    FROM ventas v
    JOIN pagos p ON v.pago_id = p.id
    JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
    JOIN monedas m ON m.id = pd.moneda_id
    WHERE v.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY ${dayExpr(ctx.isPg)}, pd.moneda_id, m.principal
  `, [VentaEstado.CONCLUIDA, r.desde.toISOString(), r.hasta.toISOString()]);
  const map: { [dia: string]: number } = {};
  for (const row of rows) {
    const cot = esPrincipal(row.principal) ? 1 : (ctx.cotMap[Number(row.moneda_id)] || 0);
    const dia = String(row.dia);
    map[dia] = (map[dia] || 0) + Math.round(Number(row.total || 0) * cot);
  }
  return map;
}

function listaDias(r: RangoFechas): Date[] {
  const dias: Date[] = [];
  const d = new Date(r.desde); d.setHours(0, 0, 0, 0);
  const fin = new Date(r.hasta);
  while (d <= fin) { dias.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return dias;
}
function claveDia(d: Date): string {
  const y = d.getFullYear(), m = `${d.getMonth() + 1}`.padStart(2, '0'), dd = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Serie de tendencia: diaria si el rango es ≤ 45 días; si no, agrupada en
 * cubetas de 7 días. actual y anterior comparten la misma cantidad de puntos. */
async function serieTendencia(ds: DataSource, ctx: CotCtx, actual: RangoFechas, anterior: RangoFechas | null) {
  const diasA = listaDias(actual);
  const mapA = await sumaDiariaGs(ds, ctx, actual);
  const valoresDiaA = diasA.map((d) => mapA[claveDia(d)] || 0);

  const usarSemanas = diasA.length > 45;
  const bucket = (dias: Date[], valores: number[]) => {
    if (!usarSemanas) return { labels: dias.map((d) => `${d.getDate()}`), valores };
    const labels: string[] = []; const out: number[] = [];
    for (let i = 0; i < valores.length; i += 7) {
      out.push(valores.slice(i, i + 7).reduce((a, b) => a + b, 0));
      labels.push(`S${Math.floor(i / 7) + 1}`);
    }
    return { labels, valores: out };
  };
  const a = bucket(diasA, valoresDiaA);

  let anteriorArr: number[] = [];
  if (anterior) {
    const diasP = listaDias(anterior);
    const mapP = await sumaDiariaGs(ds, ctx, anterior);
    const valoresDiaP = diasP.map((d) => mapP[claveDia(d)] || 0);
    anteriorArr = bucket(diasP, valoresDiaP).valores;
    // Alinear longitud con actual (por índice).
    anteriorArr = a.valores.map((_, i) => anteriorArr[i] ?? 0);
  }
  return { labels: a.labels, actual: a.valores, anterior: anteriorArr };
}

// ─────────────────────── Día de semana ───────────────────────
async function ventasPorDiaSemana(ds: DataSource, ctx: CotCtx, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT ${dowExpr(ctx.isPg)} as dow, pd.moneda_id as moneda_id, m.principal as principal,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
    FROM ventas v
    JOIN pagos p ON v.pago_id = p.id
    JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
    JOIN monedas m ON m.id = pd.moneda_id
    WHERE v.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY ${dowExpr(ctx.isPg)}, pd.moneda_id, m.principal
  `, [VentaEstado.CONCLUIDA, r.desde.toISOString(), r.hasta.toISOString()]);
  const porDow: { [dow: number]: number } = {};
  for (const row of rows) {
    const cot = esPrincipal(row.principal) ? 1 : (ctx.cotMap[Number(row.moneda_id)] || 0);
    const dow = Number(row.dow);
    porDow[dow] = (porDow[dow] || 0) + Math.round(Number(row.total || 0) * cot);
  }
  return DIAS_LUN_PRIMERO.map((dow, i) => ({ dia: DIAS_LABEL[i], total: porDow[dow] || 0 }));
}

// ─────────────────────── Horas pico ───────────────────────
async function horasPico(ds: DataSource, ctx: CotCtx, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT ${dowExpr(ctx.isPg)} as dow, ${hourExpr(ctx.isPg)} as hora, COUNT(DISTINCT v.id) as cnt
    FROM ventas v
    WHERE v.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY ${dowExpr(ctx.isPg)}, ${hourExpr(ctx.isPg)}
  `, [VentaEstado.CONCLUIDA, r.desde.toISOString(), r.hasta.toISOString()]);
  let minH = 23, maxH = 0; let hayDatos = false;
  const cell: { [k: string]: number } = {};
  for (const row of rows) {
    const dow = Number(row.dow), hora = Number(row.hora), cnt = Number(row.cnt || 0);
    if (cnt <= 0) continue;
    hayDatos = true;
    cell[`${dow}_${hora}`] = cnt;
    if (hora < minH) minH = hora; if (hora > maxH) maxH = hora;
  }
  if (!hayDatos) { minH = 11; maxH = 23; }
  const horas: number[] = [];
  for (let h = minH; h <= maxH; h++) horas.push(h);
  const matriz = DIAS_LUN_PRIMERO.map((dow) => horas.map((h) => cell[`${dow}_${h}`] || 0));
  return { dias: DIAS_LABEL, horas, matriz };
}

// ─────────────────── Productos (top + menu engineering) ───────────────────
async function productos(ds: DataSource, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT p.id, p.nombre,
           SUM(vi.cantidad) as unidades,
           SUM(vi.cantidad * vi.precio_venta_unitario) as ingreso,
           SUM(vi.cantidad * vi.precio_costo_unitario) as costo
    FROM venta_items vi
    JOIN ventas v ON v.id = vi.venta_id
    JOIN producto p ON p.id = vi.producto_id
    WHERE v.estado = ? AND vi.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY p.id, p.nombre
    ORDER BY unidades DESC
    LIMIT 20
  `, [VentaEstado.CONCLUIDA, EstadoVentaItem.ACTIVO, r.desde.toISOString(), r.hasta.toISOString()]);
  const maxUnidades = rows.reduce((m, r2) => Math.max(m, Number(r2.unidades || 0)), 0);
  const items = rows.map((r2) => {
    const ingreso = Number(r2.ingreso || 0), costo = Number(r2.costo || 0), unidades = Number(r2.unidades || 0);
    const margenPct = ingreso > 0 ? +(((ingreso - costo) / ingreso) * 100).toFixed(1) : 0;
    return {
      nombre: String(r2.nombre || '').toUpperCase(),
      unidades, ingreso, margenPct,
      popularidad: maxUnidades > 0 ? Math.round((unidades / maxUnidades) * 100) : 0,
    };
  });
  return { topProductos: items.slice(0, 8), menuEngineering: items.slice(0, 15) };
}

// ─────────────────────── Mix de forma de pago ───────────────────────
async function mixPago(ds: DataSource, ctx: CotCtx, r: RangoFechas) {
  const filtro = filtroRango(r.desde.toISOString(), r.hasta.toISOString());
  const { totalGs, porFormaPago } = await desgloseVentasRango(ds, ctx.monPrincipal, filtro);
  const agg: { [nombre: string]: number } = {};
  for (const fp of porFormaPago) agg[fp.formaPago] = (agg[fp.formaPago] || 0) + Number(fp.totalEnGs || 0);
  return Object.entries(agg)
    .map(([nombre, total]) => ({ nombre, total, pct: totalGs > 0 ? +((total / totalGs) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.total - a.total);
}

// ─────────────────── Combinaciones (market-basket) ───────────────────
async function combinaciones(ds: DataSource, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT pa.nombre as p1, pb.nombre as p2, COUNT(DISTINCT a.venta_id) as freq
    FROM venta_items a
    JOIN venta_items b ON a.venta_id = b.venta_id AND a.producto_id < b.producto_id
    JOIN ventas v ON v.id = a.venta_id
    JOIN producto pa ON pa.id = a.producto_id
    JOIN producto pb ON pb.id = b.producto_id
    WHERE v.estado = ? AND a.estado = ? AND b.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY pa.nombre, pb.nombre
    ORDER BY freq DESC
    LIMIT 8
  `, [VentaEstado.CONCLUIDA, EstadoVentaItem.ACTIVO, EstadoVentaItem.ACTIVO, r.desde.toISOString(), r.hasta.toISOString()]);
  return rows.map((r2) => ({
    par: `${String(r2.p1 || '').toUpperCase()} + ${String(r2.p2 || '').toUpperCase()}`,
    frecuencia: Number(r2.freq || 0),
  }));
}

// ─────────────────────── Meseros ───────────────────────
async function meseros(ds: DataSource, ctx: CotCtx, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT u.id as usuario_id, COALESCE(per.nombre, u.nickname) as nombre,
           COUNT(DISTINCT v.id) as cantidad,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
    FROM ventas v
    LEFT JOIN pagos p ON v.pago_id = p.id
    LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.moneda_id = ? AND pd.activo
    LEFT JOIN usuarios u ON u.id = v.created_by
    LEFT JOIN personas per ON per.id = u.persona_id
    WHERE v.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY u.id, per.nombre, u.nickname
    ORDER BY total DESC
    LIMIT 8
  `, [ctx.monPrincipal, VentaEstado.CONCLUIDA, r.desde.toISOString(), r.hasta.toISOString()]);
  return rows.filter((r2) => r2.usuario_id != null).map((r2) => ({
    nombre: String(r2.nombre || 'SIN USUARIO').toUpperCase(),
    cantidad: Number(r2.cantidad || 0),
    total: Number(r2.total || 0),
  }));
}

// ─────────────────────── Orquestador ───────────────────────
export async function construirReporteVentasCierre(
  dataSource: DataSource,
  params: ReportePeriodoParams,
): Promise<any> {
  const periodo = resolverPeriodo(params);
  const { actual, anterior } = periodo;
  const ctx: CotCtx = {
    monPrincipal: await getMonedaPrincipalId(dataSource),
    cotMap: {},
    isPg: dataSource.options.type === 'postgres',
  };
  ctx.cotMap = await getCotizacionMap(dataSource, ctx.monPrincipal);

  const kAct = await kpisVentas(dataSource, ctx, actual);
  const kAnt = anterior ? await kpisVentas(dataSource, ctx, anterior) : null;

  const [tendencia, diaSemana, hp, prods, mix, combos, mes] = await Promise.all([
    serieTendencia(dataSource, ctx, actual, anterior),
    ventasPorDiaSemana(dataSource, ctx, actual),
    horasPico(dataSource, ctx, actual),
    productos(dataSource, actual),
    mixPago(dataSource, ctx, actual),
    combinaciones(dataSource, actual),
    meseros(dataSource, ctx, actual),
  ]);

  return {
    periodoLabel: periodo.label,
    periodoLabelAnterior: periodo.labelAnterior,
    kpis: {
      facturacion: conDelta(kAct.facturacion, kAnt?.facturacion ?? null),
      tickets: conDelta(kAct.tickets, kAnt?.tickets ?? null),
      ticketPromedio: conDelta(kAct.ticketPromedio, kAnt?.ticketPromedio ?? null),
      // Margen es un porcentaje: la "variación" es la diferencia en puntos.
      margenPct: { valor: kAct.margenPct, variacion: kAnt ? +(kAct.margenPct - kAnt.margenPct).toFixed(1) : null, esPuntos: true },
      mesas: conDelta(kAct.mesas, kAnt?.mesas ?? null),
    },
    tendencia,
    diaSemana,
    horasPico: hp,
    topProductos: prods.topProductos,
    menuEngineering: prods.menuEngineering,
    mixPago: mix,
    combinaciones: combos,
    meseros: mes,
  };
}
