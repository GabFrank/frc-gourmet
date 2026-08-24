import { DataSource } from 'typeorm';
import { dbQuery } from '../utils/db-query';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import {
  getMonedaPrincipalId, getCotizacionMap, sumaVentasRango, desgloseVentasRango, filtroRango,
} from './dashboard-ventas.handler';
import { resolverPeriodo, variacionPct, RangoFechas } from './reportes-periodo.util';
import type { ReportePeriodoParams } from './reportes.handler';
import { getInicioJornada } from './dashboard-ventas.handler';

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
function listaDias(r: RangoFechas): Date[] {
  const dias: Date[] = [];
  const d = new Date(r.desde); d.setHours(0, 0, 0, 0);
  const fin = new Date(r.hasta);
  while (d <= fin) { dias.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return dias;
}

/** Suma en Gs de un tramo [inicioDia, finDia] (día calendario local) con la
 * misma función que el KPI de facturación → la serie reconcilia con el KPI y se
 * evita el desfase UTC/local de un GROUP BY por fecha extraída en SQL. */
async function sumaTramoGs(ds: DataSource, ctx: CotCtx, primerDia: Date, ultimoDia: Date): Promise<number> {
  const desde = new Date(primerDia); desde.setHours(0, 0, 0, 0);
  const hasta = new Date(ultimoDia); hasta.setHours(23, 59, 59, 999);
  const { suma } = await sumaVentasRango(ds, ctx.monPrincipal, filtroRango(desde.toISOString(), hasta.toISOString()), ctx.cotMap);
  return suma;
}

/** Cubetas de la serie de un rango: diaria si ≤ 45 días, o en ventanas de 7
 * días si es más largo. Cada cubeta se suma con una sola consulta por rango
 * (evita cientos de consultas por día en rangos largos). */
async function serieCubetas(ds: DataSource, ctx: CotCtx, r: RangoFechas, usarSemanas: boolean): Promise<{ labels: string[]; valores: number[] }> {
  const dias = listaDias(r);
  const labels: string[] = []; const valores: number[] = [];
  if (!usarSemanas) {
    for (const dia of dias) {
      valores.push(await sumaTramoGs(ds, ctx, dia, dia));
      labels.push(`${dia.getDate()}`);
    }
  } else {
    for (let i = 0; i < dias.length; i += 7) {
      const grupo = dias.slice(i, i + 7);
      valores.push(await sumaTramoGs(ds, ctx, grupo[0], grupo[grupo.length - 1]));
      labels.push(`S${Math.floor(i / 7) + 1}`);
    }
  }
  return { labels, valores };
}

/** Serie de tendencia: diaria si el rango es ≤ 45 días; si no, agrupada en
 * cubetas de 7 días. El eje x lo define el período actual; si el período de
 * comparación tiene más cubetas (p. ej. mes anterior más largo), las cubetas
 * sobrantes se pliegan en el último punto para que la línea punteada siga
 * sumando el total completo del período anterior. */
async function serieTendencia(ds: DataSource, ctx: CotCtx, actual: RangoFechas, anterior: RangoFechas | null) {
  const usarSemanas = listaDias(actual).length > 45;
  const a = await serieCubetas(ds, ctx, actual, usarSemanas);

  let anteriorArr: number[] = [];
  if (anterior) {
    const p = await serieCubetas(ds, ctx, anterior, usarSemanas);
    anteriorArr = a.valores.map((_, i) => p.valores[i] ?? 0);
    // Plegar las cubetas sobrantes del anterior en el último punto visible.
    if (anteriorArr.length > 0 && p.valores.length > a.valores.length) {
      anteriorArr[anteriorArr.length - 1] += p.valores.slice(a.valores.length).reduce((s, v) => s + v, 0);
    }
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
  // Cantidad de ventas por mesero (independiente de la moneda de pago).
  const cntRows: any[] = await dbQuery(ds, `
    SELECT v.created_by as usuario_id, COUNT(*) as cantidad
    FROM ventas v
    WHERE v.estado = ? AND v.created_by IS NOT NULL AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY v.created_by
  `, [VentaEstado.CONCLUIDA, r.desde.toISOString(), r.hasta.toISOString()]);
  const cantidadPorUsuario: { [id: number]: number } = {};
  for (const row of cntRows) cantidadPorUsuario[Number(row.usuario_id)] = Number(row.cantidad || 0);

  // Monto cobrado por mesero, convertido a moneda principal (todas las monedas).
  const rows: any[] = await dbQuery(ds, `
    SELECT u.id as usuario_id, COALESCE(per.nombre, u.nickname) as nombre,
           pd.moneda_id as moneda_id, m.principal as principal,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
    FROM ventas v
    JOIN pagos p ON v.pago_id = p.id
    JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
    JOIN monedas m ON m.id = pd.moneda_id
    JOIN usuarios u ON u.id = v.created_by
    LEFT JOIN personas per ON per.id = u.persona_id
    WHERE v.estado = ? AND v.created_at >= ? AND v.created_at <= ?
    GROUP BY u.id, per.nombre, u.nickname, pd.moneda_id, m.principal
  `, [VentaEstado.CONCLUIDA, r.desde.toISOString(), r.hasta.toISOString()]);

  const acc: { [id: number]: { nombre: string; total: number } } = {};
  for (const row of rows) {
    const id = Number(row.usuario_id);
    const cot = esPrincipal(row.principal) ? 1 : (ctx.cotMap[Number(row.moneda_id)] || 0);
    if (!acc[id]) acc[id] = { nombre: String(row.nombre || 'SIN USUARIO').toUpperCase(), total: 0 };
    acc[id].total += Math.round(Number(row.total || 0) * cot);
  }
  return Object.entries(acc)
    .map(([id, v]) => ({ nombre: v.nombre, cantidad: cantidadPorUsuario[Number(id)] || 0, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

// ─────────────────────── Orquestador ───────────────────────
export async function construirReporteVentasCierre(
  dataSource: DataSource,
  params: ReportePeriodoParams,
): Promise<any> {
  const inicioJornada = await getInicioJornada(dataSource);
  const periodo = resolverPeriodo(params, new Date(), inicioJornada);
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
