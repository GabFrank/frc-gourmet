import { DataSource } from 'typeorm';
import { dbQuery } from '../utils/db-query';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { getMonedaPrincipalId, getCotizacionMap } from './dashboard-ventas.handler';
import { resolverPeriodo, variacionPct, RangoFechas } from './reportes-periodo.util';
import type { ReportePeriodoParams } from './reportes.handler';

const TIPOS_INGRESO: string[] = [
  TipoMovimiento.INGRESO_RETIRO_CAJA, TipoMovimiento.INGRESO_CIERRE_CAJA, TipoMovimiento.INGRESO_ENTRADA_VARIA,
  TipoMovimiento.INGRESO_OPERACION_FINANCIERA, TipoMovimiento.INGRESO_RETIRO_BANCO, TipoMovimiento.INGRESO_COBRO_CLIENTE,
  TipoMovimiento.INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO, TipoMovimiento.TRANSFERENCIA_ENTRADA, TipoMovimiento.AJUSTE_POSITIVO,
];
const TIPOS_EGRESO: string[] = [
  TipoMovimiento.EGRESO_GASTO, TipoMovimiento.EGRESO_COMPRA, TipoMovimiento.EGRESO_CUOTA_COMPRA, TipoMovimiento.EGRESO_CUOTA_PRESTAMO,
  TipoMovimiento.EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO, TipoMovimiento.EGRESO_VALE, TipoMovimiento.EGRESO_SALARIO, TipoMovimiento.EGRESO_CHEQUE,
  TipoMovimiento.EGRESO_OPERACION_FINANCIERA, TipoMovimiento.EGRESO_DEPOSITO_BANCO, TipoMovimiento.EGRESO_CAJA_INICIAL,
  TipoMovimiento.TRANSFERENCIA_SALIDA, TipoMovimiento.AJUSTE_NEGATIVO,
];
const INGRESO_SET = new Set(TIPOS_INGRESO);

// Etiqueta humana por tipo (para la composición ingresos/egresos).
const LABEL_TIPO: { [k: string]: string } = {
  INGRESO_RETIRO_CAJA: 'Ventas (retiro de caja)', INGRESO_CIERRE_CAJA: 'Ventas (cierre de caja)',
  INGRESO_ENTRADA_VARIA: 'Entradas varias', INGRESO_OPERACION_FINANCIERA: 'Operaciones financieras',
  INGRESO_RETIRO_BANCO: 'Retiros de banco', INGRESO_COBRO_CLIENTE: 'Cobros a clientes',
  INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO: 'Cobros a funcionarios', TRANSFERENCIA_ENTRADA: 'Transferencias',
  AJUSTE_POSITIVO: 'Ajustes',
  EGRESO_GASTO: 'Gastos operativos', EGRESO_COMPRA: 'Compras', EGRESO_CUOTA_COMPRA: 'Compras (cuotas)',
  EGRESO_CUOTA_PRESTAMO: 'Préstamos (cuotas)', EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO: 'Préstamos a funcionarios',
  EGRESO_VALE: 'Vales / adelantos', EGRESO_SALARIO: 'Salarios', EGRESO_CHEQUE: 'Cheques emitidos',
  EGRESO_OPERACION_FINANCIERA: 'Operaciones financieras', EGRESO_DEPOSITO_BANCO: 'Depósitos a banco',
  EGRESO_CAJA_INICIAL: 'Caja inicial', TRANSFERENCIA_SALIDA: 'Transferencias', AJUSTE_NEGATIVO: 'Ajustes',
};

// Movimientos "activos": excluye la anulación (contra-mov) y el original anulado.
const MOV_ACTIVO = `
  mv.tipo_movimiento != 'ANULACION'
  AND mv.referencia_anulacion_id IS NULL
  AND mv.id NOT IN (SELECT referencia_anulacion_id FROM cajas_mayor_movimientos WHERE referencia_anulacion_id IS NOT NULL)
`;

function esPrincipal(v: any): boolean { return v === true || v === 1 || v === '1'; }

interface Ctx { cotMap: { [id: number]: number }; }
function convertir(monto: number, monedaId: any, principal: any, ctx: Ctx): number {
  const cot = esPrincipal(principal) ? 1 : (ctx.cotMap[Number(monedaId)] || (monedaId == null ? 1 : 0));
  return Math.round(Number(monto || 0) * cot);
}

// ─────────────────────── KPIs ───────────────────────
async function ingresoEgresoRango(ds: DataSource, ctx: Ctx, r: RangoFechas): Promise<{ ingresos: number; egresos: number }> {
  const rows: any[] = await dbQuery(ds, `
    SELECT mv.tipo_movimiento as tipo, mv.moneda_id as moneda_id, m.principal as principal, SUM(mv.monto) as total
    FROM cajas_mayor_movimientos mv
    LEFT JOIN monedas m ON m.id = mv.moneda_id
    WHERE ${MOV_ACTIVO} AND mv.fecha >= ? AND mv.fecha <= ?
    GROUP BY mv.tipo_movimiento, mv.moneda_id, m.principal
  `, [r.desde.toISOString(), r.hasta.toISOString()]);
  let ingresos = 0, egresos = 0;
  for (const row of rows) {
    const gs = convertir(row.total, row.moneda_id, row.principal, ctx);
    if (INGRESO_SET.has(String(row.tipo))) ingresos += gs; else egresos += gs;
  }
  return { ingresos, egresos };
}

async function gastosRango(ds: DataSource, ctx: Ctx, r: RangoFechas): Promise<number> {
  const rows: any[] = await dbQuery(ds, `
    SELECT g.moneda_id as moneda_id, m.principal as principal, SUM(g.monto) as total
    FROM gastos g LEFT JOIN monedas m ON m.id = g.moneda_id
    WHERE g.estado != 'CANCELADO' AND g.fecha >= ? AND g.fecha <= ?
    GROUP BY g.moneda_id, m.principal
  `, [r.desde.toISOString(), r.hasta.toISOString()]);
  return rows.reduce((s, row) => s + convertir(row.total, row.moneda_id, row.principal, ctx), 0);
}

async function porCobrarVencido(ds: DataSource, ctx: Ctx, hoyStr: string): Promise<number> {
  const rows: any[] = await dbQuery(ds, `
    SELECT cpc.moneda_id as moneda_id, m.principal as principal,
           COALESCE(SUM(c.monto - c.monto_cobrado), 0) as saldo
    FROM cuentas_por_cobrar_cuotas c
    JOIN cuentas_por_cobrar cpc ON cpc.id = c.cuenta_por_cobrar_id
    LEFT JOIN monedas m ON m.id = cpc.moneda_id
    WHERE c.estado IN ('PENDIENTE','PARCIAL') AND cpc.estado = 'ACTIVO' AND c.fecha_vencimiento < ?
    GROUP BY cpc.moneda_id, m.principal
  `, [hoyStr]);
  return rows.reduce((s, row) => s + convertir(row.saldo, row.moneda_id, row.principal, ctx), 0);
}

// ─────────────────────── Flujo de caja por semana ───────────────────────
/** Suma ingresos/egresos por cubetas de 7 días (calendario local), una ventana
 * a la vez con filtro por rango. Evita el desfase UTC/local que produciría un
 * GROUP BY por fecha extraída en SQL (mv.fecha es datetime UTC), y reconcilia
 * exactamente con los KPIs de ingresos/egresos (mismo MOV_ACTIVO + conversión). */
async function flujoCaja(ds: DataSource, ctx: Ctx, r: RangoFechas) {
  // Días del rango (inicio de día local)
  const dias: Date[] = [];
  const d = new Date(r.desde); d.setHours(0, 0, 0, 0); const fin = new Date(r.hasta);
  while (d <= fin) { dias.push(new Date(d)); d.setDate(d.getDate() + 1); }

  const labels: string[] = [], ingresos: number[] = [], egresos: number[] = [], neto: number[] = [];
  for (let i = 0; i < dias.length; i += 7) {
    const grupo = dias.slice(i, i + 7);
    const desde = new Date(grupo[0]); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(grupo[grupo.length - 1]); hasta.setHours(23, 59, 59, 999);
    const rows: any[] = await dbQuery(ds, `
      SELECT mv.tipo_movimiento as tipo, mv.moneda_id as moneda_id, m.principal as principal, SUM(mv.monto) as total
      FROM cajas_mayor_movimientos mv LEFT JOIN monedas m ON m.id = mv.moneda_id
      WHERE ${MOV_ACTIVO} AND mv.fecha >= ? AND mv.fecha <= ?
      GROUP BY mv.tipo_movimiento, mv.moneda_id, m.principal
    `, [desde.toISOString(), hasta.toISOString()]);
    let ing = 0, eg = 0;
    for (const row of rows) {
      const gs = convertir(row.total, row.moneda_id, row.principal, ctx);
      if (INGRESO_SET.has(String(row.tipo))) ing += gs; else eg += gs;
    }
    labels.push(`Sem ${Math.floor(i / 7) + 1}`); ingresos.push(ing); egresos.push(eg); neto.push(ing - eg);
  }
  return { labels, ingresos, egresos, neto };
}

// ─────────────────── Composición ingresos / egresos ───────────────────
async function composicion(ds: DataSource, ctx: Ctx, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT mv.tipo_movimiento as tipo, mv.moneda_id as moneda_id, m.principal as principal, SUM(mv.monto) as total
    FROM cajas_mayor_movimientos mv LEFT JOIN monedas m ON m.id = mv.moneda_id
    WHERE ${MOV_ACTIVO} AND mv.fecha >= ? AND mv.fecha <= ?
    GROUP BY mv.tipo_movimiento, mv.moneda_id, m.principal
  `, [r.desde.toISOString(), r.hasta.toISOString()]);
  const ingMap: { [k: string]: number } = {}, egMap: { [k: string]: number } = {};
  for (const row of rows) {
    const tipo = String(row.tipo);
    const gs = convertir(row.total, row.moneda_id, row.principal, ctx);
    const label = LABEL_TIPO[tipo] || tipo;
    if (INGRESO_SET.has(tipo)) ingMap[label] = (ingMap[label] || 0) + gs;
    else egMap[label] = (egMap[label] || 0) + gs;
  }
  const armar = (map: { [k: string]: number }) => {
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).map(([nombre, v]) => ({ nombre, total: v, pct: total > 0 ? +((v / total) * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.total - a.total);
  };
  return { ingresos: armar(ingMap), egresos: armar(egMap) };
}

// ─────────────────── Gastos por categoría ───────────────────
async function gastosPorCategoria(ds: DataSource, ctx: Ctx, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT gc.nombre as nombre, g.moneda_id as moneda_id, m.principal as principal, SUM(g.monto) as total
    FROM gastos g
    JOIN gastos_categorias gc ON gc.id = g.gasto_categoria_id
    LEFT JOIN monedas m ON m.id = g.moneda_id
    WHERE g.estado != 'CANCELADO' AND g.fecha >= ? AND g.fecha <= ?
    GROUP BY gc.nombre, g.moneda_id, m.principal
  `, [r.desde.toISOString(), r.hasta.toISOString()]);
  const map: { [k: string]: number } = {};
  for (const row of rows) {
    const label = String(row.nombre || 'SIN CATEGORÍA').toUpperCase();
    map[label] = (map[label] || 0) + convertir(row.total, row.moneda_id, row.principal, ctx);
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  return Object.entries(map).map(([nombre, v]) => ({ nombre, total: v, pct: total > 0 ? Math.round((v / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total).slice(0, 8);
}

// ─────────────────── Aging CPC / CPP (snapshot) ───────────────────
function bucketAging(cuotas: Array<{ fecha: string; saldo: number }>, hoy: Date) {
  // [porVencer, 1-30, 31-60, +60]
  const b = [0, 0, 0, 0];
  for (const c of cuotas) {
    const fv = new Date(c.fecha); fv.setHours(0, 0, 0, 0);
    const dias = Math.floor((hoy.getTime() - fv.getTime()) / 86400000); // >0 = vencida
    if (dias <= 0) b[0] += c.saldo;
    else if (dias <= 30) b[1] += c.saldo;
    else if (dias <= 60) b[2] += c.saldo;
    else b[3] += c.saldo;
  }
  const total = b.reduce((a, x) => a + x, 0);
  return { total, buckets: b, pcts: b.map((x) => (total > 0 ? Math.round((x / total) * 100) : 0)) };
}

async function aging(ds: DataSource, ctx: Ctx, hoy: Date) {
  const cppRows: any[] = await dbQuery(ds, `
    SELECT c.fecha_vencimiento as fecha, (c.monto - c.monto_pagado) as saldo, cpp.moneda_id as moneda_id, m.principal as principal
    FROM cuentas_por_pagar_cuotas c
    JOIN cuentas_por_pagar cpp ON cpp.id = c.cuenta_por_pagar_id
    LEFT JOIN monedas m ON m.id = cpp.moneda_id
    WHERE c.estado IN ('PENDIENTE','PARCIAL') AND cpp.estado = 'ACTIVO' AND cpp.tipo != 'PRESTAMO_FUNCIONARIO'
  `, []);
  const cpcRows: any[] = await dbQuery(ds, `
    SELECT c.fecha_vencimiento as fecha, (c.monto - c.monto_cobrado) as saldo, cpc.moneda_id as moneda_id, m.principal as principal
    FROM cuentas_por_cobrar_cuotas c
    JOIN cuentas_por_cobrar cpc ON cpc.id = c.cuenta_por_cobrar_id
    LEFT JOIN monedas m ON m.id = cpc.moneda_id
    WHERE c.estado IN ('PENDIENTE','PARCIAL') AND cpc.estado = 'ACTIVO'
  `, []);
  const mapConv = (rows: any[]) => rows.map((r) => ({ fecha: String(r.fecha), saldo: convertir(r.saldo, r.moneda_id, r.principal, ctx) }));
  return { porPagar: bucketAging(mapConv(cppRows), hoy), porCobrar: bucketAging(mapConv(cpcRows), hoy) };
}

// ─────────────────── Comisiones POS ───────────────────
async function comisionesPos(ds: DataSource, r: RangoFechas) {
  const rows: any[] = await dbQuery(ds, `
    SELECT COALESCE(mp.nombre, 'SIN MÁQUINA') as nombre,
           COALESCE(SUM(a.monto_comision), 0) as comision,
           COALESCE(SUM(a.monto_original), 0) as original
    FROM acreditaciones_pos a
    LEFT JOIN maquinas_pos mp ON mp.id = a.maquina_pos_id
    WHERE a.fecha_transaccion >= ? AND a.fecha_transaccion <= ?
    GROUP BY mp.nombre
    ORDER BY comision DESC
  `, [r.desde.toISOString(), r.hasta.toISOString()]);
  const total = rows.reduce((s, r2) => s + Number(r2.comision || 0), 0);
  const facturado = rows.reduce((s, r2) => s + Number(r2.original || 0), 0);
  return {
    total, facturado,
    pctPromedio: facturado > 0 ? +((total / facturado) * 100).toFixed(2) : 0,
    porMaquina: rows.map((r2) => ({ nombre: String(r2.nombre || '').toUpperCase(), comision: Number(r2.comision || 0) })),
  };
}

// ─────────────────── Próximos vencimientos (30 días) ───────────────────
async function vencimientos(ds: DataSource, hoy: Date) {
  const hoyStr = hoy.toISOString().slice(0, 10);
  const en30 = new Date(hoy); en30.setDate(en30.getDate() + 30);
  const cppRows: any[] = await dbQuery(ds, `
    SELECT c.numero as numero, c.fecha_vencimiento as fecha, (c.monto - c.monto_pagado) as monto,
           COALESCE(pr.razon_social, pr.nombre, cpp.descripcion) as beneficiario, cpp.descripcion as descripcion
    FROM cuentas_por_pagar_cuotas c
    JOIN cuentas_por_pagar cpp ON cpp.id = c.cuenta_por_pagar_id
    LEFT JOIN proveedores pr ON pr.id = cpp.proveedor_id
    WHERE c.estado IN ('PENDIENTE','PARCIAL') AND cpp.estado = 'ACTIVO'
      AND c.fecha_vencimiento >= ? AND c.fecha_vencimiento <= ?
    LIMIT 20
  `, [hoyStr, en30.toISOString().slice(0, 10)]);
  const chRows: any[] = await dbQuery(ds, `
    SELECT ch.numero_cheque as numero, ch.fecha_pago as fecha, ch.monto as monto, COALESCE(ch.beneficiario, 'CHEQUE') as beneficiario
    FROM cheques ch
    WHERE ch.estado = 'DIFERIDO' AND ch.fecha_pago IS NOT NULL AND ch.fecha_pago BETWEEN ? AND ?
    LIMIT 20
  `, [hoy.toISOString(), en30.toISOString()]);
  const items = [
    ...cppRows.map((r) => ({
      fecha: r.fecha, tipo: 'CPP',
      concepto: `Cuota ${r.numero} · ${String(r.descripcion || 'Cuenta por pagar').toUpperCase()}`,
      beneficiario: String(r.beneficiario || '').toUpperCase(), monto: Number(r.monto || 0),
    })),
    ...chRows.map((r) => ({
      fecha: r.fecha, tipo: 'Cheque',
      concepto: `Cheque N° ${r.numero || ''}`.trim(),
      beneficiario: String(r.beneficiario || '').toUpperCase(), monto: Number(r.monto || 0),
    })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).slice(0, 12);
  const totalComprometido = items.reduce((s, i) => s + i.monto, 0);
  return { items, totalComprometido };
}

// ─────────────────────── Orquestador ───────────────────────
export async function construirReporteFinanzasCierre(
  dataSource: DataSource,
  params: ReportePeriodoParams,
): Promise<any> {
  const periodo = resolverPeriodo(params);
  const { actual, anterior } = periodo;
  const monPrincipal = await getMonedaPrincipalId(dataSource);
  const ctx: Ctx = { cotMap: await getCotizacionMap(dataSource, monPrincipal) };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hoyStr = hoy.toISOString().slice(0, 10);

  const ieAct = await ingresoEgresoRango(dataSource, ctx, actual);
  const gastAct = await gastosRango(dataSource, ctx, actual);
  const ieAnt = anterior ? await ingresoEgresoRango(dataSource, ctx, anterior) : null;
  const gastAnt = anterior ? await gastosRango(dataSource, ctx, anterior) : null;
  const cobrarVenc = await porCobrarVencido(dataSource, ctx, hoyStr);

  const [flujo, comp, gastosCat, ag, pos, venc] = await Promise.all([
    flujoCaja(dataSource, ctx, actual),
    composicion(dataSource, ctx, actual),
    gastosPorCategoria(dataSource, ctx, actual),
    aging(dataSource, ctx, hoy),
    comisionesPos(dataSource, actual),
    vencimientos(dataSource, hoy),
  ]);

  const delta = (a: number, b: number | null) => ({ valor: a, variacion: b == null ? null : variacionPct(a, b) });
  const netoAct = ieAct.ingresos - ieAct.egresos;
  const netoAnt = ieAnt ? ieAnt.ingresos - ieAnt.egresos : null;

  return {
    periodoLabel: periodo.label,
    periodoLabelAnterior: periodo.labelAnterior,
    kpis: {
      ingresos: delta(ieAct.ingresos, ieAnt?.ingresos ?? null),
      egresos: { ...delta(ieAct.egresos, ieAnt?.egresos ?? null), invertido: true },
      flujoNeto: delta(netoAct, netoAnt),
      gastos: { ...delta(gastAct, gastAnt), invertido: true },
      porCobrarVencido: { valor: cobrarVenc, variacion: null },
    },
    flujoCaja: flujo,
    composicionIngresos: comp.ingresos,
    composicionEgresos: comp.egresos,
    gastosPorCategoria: gastosCat,
    aging: ag,
    comisionesPos: pos,
    vencimientos: venc.items,
    totalComprometido: venc.totalComprometido,
  };
}
