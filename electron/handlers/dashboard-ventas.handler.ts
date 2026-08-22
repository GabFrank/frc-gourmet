import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { ComandaItem, ComandaItemEstado } from '../../src/app/database/entities/ventas/comanda-item.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { dbQuery } from '../utils/db-query';
import { Rango, rangoToFechas, bucketsForRango } from '../utils/dashboard-rangos.util';

// El "total" real de una venta NO vive en la columna ventas.total (no poblada),
// sino en pagos_detalles (PAGO - VUELTO). Estos helpers calculan el monto cobrado
// en la moneda principal, igual que getVentasTotalByCaja / getResumenCaja.
export async function getMonedaPrincipalId(dataSource: DataSource): Promise<number> {
  const rows: any[] = await dbQuery(
    dataSource,
    `SELECT id FROM monedas WHERE principal = true LIMIT 1`,
    [],
  );
  return Number(rows?.[0]?.id || 0);
}

// Filtro de ventas para los totales: o por rango de fechas (día calendario, para
// el histórico) o por caja_id (las cajas abiertas — Opción B: el total "de hoy"
// sigue la caja abierta, así una caja que cruza medianoche NO reinicia el total).
export type VentaFiltro = { sql: string; params: any[] };

export function filtroRango(desdeISO: string, hastaISO: string): VentaFiltro {
  return { sql: 'v.created_at >= ? AND v.created_at <= ?', params: [desdeISO, hastaISO] };
}

function filtroCajas(cajaIds: number[]): VentaFiltro {
  const placeholders = cajaIds.map(() => '?').join(',');
  return { sql: `v.caja_id IN (${placeholders})`, params: [...cajaIds] };
}

// Cotización (compraLocal) más reciente de cada moneda origen → principal.
// { monedaOrigenId: cotizacion }. La principal cotiza en 1 implícitamente.
export async function getCotizacionMap(
  dataSource: DataSource,
  monedaPrincipalId: number,
): Promise<{ [monedaId: number]: number }> {
  const cambioRows: any[] = await dbQuery(dataSource, `
    SELECT moneda_origen_id, "compraLocal" AS compra_local, created_at
    FROM monedas_cambio
    WHERE moneda_destino_id = ? AND activo = true
    ORDER BY created_at DESC
  `, [monedaPrincipalId]);
  const map: { [monedaId: number]: number } = {};
  for (const c of cambioRows) {
    const oid = Number(c.moneda_origen_id);
    if (map[oid] == null) map[oid] = Number(c.compra_local || 0);
  }
  return map;
}

// Total (PAGO - VUELTO) de ventas concluidas en un rango + cantidad de ventas.
// El total se convierte a la moneda principal (Gs) sumando TODAS las monedas con
// su cotización compraLocal — antes solo sumaba la moneda principal, así que el
// gráfico no reflejaba las ventas cobradas en USD/BRL. `cotizacionMap` se puede
// precomputar (buildVentasPorPeriodo) o se resuelve internamente si se omite.
export async function sumaVentasRango(
  dataSource: DataSource,
  monedaPrincipalId: number,
  filtro: VentaFiltro,
  cotizacionMap?: { [monedaId: number]: number },
): Promise<{ cnt: number; suma: number }> {
  const map = cotizacionMap || (await getCotizacionMap(dataSource, monedaPrincipalId));

  // Totales por moneda (para poder convertir cada una a Gs antes de sumar).
  const rows: any[] = await dbQuery(dataSource, `
    SELECT pd.moneda_id as moneda_id,
           m.principal   as principal,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
    FROM ventas v
    LEFT JOIN pagos p ON v.pago_id = p.id
    LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
    LEFT JOIN monedas m ON m.id = pd.moneda_id
    WHERE v.estado = ? AND ${filtro.sql}
    GROUP BY pd.moneda_id, m.principal
  `, [VentaEstado.CONCLUIDA, ...filtro.params]);

  let suma = 0;
  for (const r of rows) {
    if (r.moneda_id == null) continue;
    const monedaId = Number(r.moneda_id);
    const esPrincipal = r.principal === true || r.principal === 1 || r.principal === '1';
    const cotizacion = esPrincipal ? 1 : (map[monedaId] || 0);
    suma += Math.round(Number(r.total || 0) * cotizacion);
  }

  // Cantidad de ventas concluidas en el rango (independiente de la moneda).
  const cntRows: any[] = await dbQuery(dataSource, `
    SELECT COUNT(DISTINCT v.id) as cnt
    FROM ventas v
    WHERE v.estado = ? AND ${filtro.sql}
  `, [VentaEstado.CONCLUIDA, ...filtro.params]);

  return { cnt: Number(cntRows?.[0]?.cnt || 0), suma };
}

// Desglose del total cobrado en un rango: por moneda y por forma de pago, con
// CADA moneda convertida a la moneda principal (Gs) usando la cotización
// (compra_local) más reciente de monedas_cambio. El total en Gs suma TODAS las
// monedas convertidas, no solo la principal.
export async function desgloseVentasRango(
  dataSource: DataSource,
  monedaPrincipalId: number,
  filtro: VentaFiltro,
): Promise<{
  totalGs: number;
  porMoneda: any[];
  porFormaPago: any[];
}> {
  // Totales (PAGO - VUELTO) agrupados por moneda y forma de pago.
  const rows: any[] = await dbQuery(dataSource, `
    SELECT pd.moneda_id      as moneda_id,
           m.simbolo         as simbolo,
           m.denominacion    as denominacion,
           m.decimales       as decimales,
           m.principal       as principal,
           pd.forma_pago_id  as forma_pago_id,
           fp.nombre         as forma_pago_nombre,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
    FROM ventas v
    JOIN pagos p ON v.pago_id = p.id
    JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
    JOIN monedas m ON m.id = pd.moneda_id
    LEFT JOIN formas_pago fp ON fp.id = pd.forma_pago_id
    WHERE v.estado = ? AND ${filtro.sql}
    GROUP BY pd.moneda_id, m.simbolo, m.denominacion, m.decimales, m.principal, pd.forma_pago_id, fp.nombre
  `, [VentaEstado.CONCLUIDA, ...filtro.params]);

  // Cotización (compraLocal) más reciente de cada moneda origen → principal.
  // La columna en monedas_cambio es "compraLocal" (camelCase): el entity
  // MonedaCambio.compraLocal no define `name:` y no hay naming strategy snake,
  // así que TypeORM la creó camelCase. Se cita y se aliasea a compra_local.
  const cambioRows: any[] = await dbQuery(dataSource, `
    SELECT moneda_origen_id, "compraLocal" AS compra_local, created_at
    FROM monedas_cambio
    WHERE moneda_destino_id = ? AND activo = true
    ORDER BY created_at DESC
  `, [monedaPrincipalId]);
  const cotizacionPorMoneda: { [monedaId: number]: number } = {};
  for (const c of cambioRows) {
    const oid = Number(c.moneda_origen_id);
    if (cotizacionPorMoneda[oid] == null) cotizacionPorMoneda[oid] = Number(c.compra_local || 0);
  }

  const esPrincipalFlag = (v: any) => v === true || v === 1 || v === '1';

  const porMonedaMap: { [monedaId: number]: any } = {};
  const porFormaPago: any[] = [];
  let totalGs = 0;

  for (const r of rows) {
    const monedaId = Number(r.moneda_id);
    const esPrincipal = esPrincipalFlag(r.principal);
    const total = Number(r.total || 0);
    const cotizacion = esPrincipal ? 1 : (cotizacionPorMoneda[monedaId] || 0);
    const totalEnGs = Math.round(total * cotizacion);

    if (!porMonedaMap[monedaId]) {
      porMonedaMap[monedaId] = {
        monedaId,
        simbolo: r.simbolo || '',
        denominacion: String(r.denominacion || '').toUpperCase(),
        decimales: Number(r.decimales || 0),
        esPrincipal,
        cotizacion,
        total: 0,
        totalEnGs: 0,
      };
    }
    porMonedaMap[monedaId].total += total;
    porMonedaMap[monedaId].totalEnGs += totalEnGs;

    porFormaPago.push({
      formaPago: String(r.forma_pago_nombre || 'SIN FORMA').toUpperCase(),
      monedaId,
      simbolo: r.simbolo || '',
      total,
      totalEnGs,
      cotizacion,
    });

    totalGs += totalEnGs;
  }

  // Orden: principal primero, luego por aporte en Gs descendente.
  const porMoneda = Object.values(porMonedaMap).sort((a: any, b: any) => {
    if (a.esPrincipal !== b.esPrincipal) return a.esPrincipal ? -1 : 1;
    return b.totalEnGs - a.totalEnGs;
  });
  porFormaPago.sort((a: any, b: any) => b.totalEnGs - a.totalEnGs);

  return { totalGs, porMoneda, porFormaPago };
}

export function registerDashboardVentasHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-ventas-kpis', async (_event, rango: Rango = 'week') => {
    try {
      // Un unico `now` para todo el request: rangoToFechas y bucketsForRango
      // tienen que mirar el mismo instante o la ventana de la card y la del
      // chart pueden caer en horas (o dias) distintos entre await y await.
      const now = new Date();
      const hoyInicio = new Date(now);
      hoyInicio.setHours(0, 0, 0, 0);
      const hoyFin = new Date(now);
      hoyFin.setHours(23, 59, 59, 999);

      const monedaPrincipalId = await getMonedaPrincipalId(dataSource);

      // Cajas abiertas: se resuelven ANTES del total porque el KPI de "hoy"
      // se calcula sobre ellas (Opción B).
      const cajasAbiertasEntities = await dataSource.getRepository(Caja).find({
        where: { estado: CajaEstado.ABIERTO, activo: true },
        relations: ['createdBy', 'createdBy.persona', 'dispositivo'],
        order: { fechaApertura: 'ASC' },
      });

      // 1. Ventas + total. Opción B: si hay cajas abiertas, el total corresponde
      // a esas cajas (desde su apertura), NO al día calendario — así una caja que
      // cruza medianoche no reinicia el total. Sin cajas abiertas (local cerrado)
      // cae al día calendario para que la card no quede en 0. El total incluye
      // TODAS las monedas y formas de pago, convertidas y sumadas a Gs.
      const cajaIdsAbiertas = cajasAbiertasEntities.map((c) => c.id);
      const totalBasadoEnCajas = cajaIdsAbiertas.length > 0;
      const filtroHoy: VentaFiltro = totalBasadoEnCajas
        ? filtroCajas(cajaIdsAbiertas)
        : filtroRango(hoyInicio.toISOString(), hoyFin.toISOString());

      const { cnt: ventasHoy } = await sumaVentasRango(dataSource, monedaPrincipalId, filtroHoy);
      const desgloseHoy = await desgloseVentasRango(dataSource, monedaPrincipalId, filtroHoy);
      const totalHoyPYG = desgloseHoy.totalGs;
      const ticketPromedio = ventasHoy > 0 ? Math.round(totalHoyPYG / ventasHoy) : 0;

      // 2. Mesas
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesasTotal = await mesaRepo.count({ where: { activo: true } as any });
      // Ocupada = tiene CUENTA PROPIA abierta (venta con comanda_id IS NULL).
      // Se cuenta por la venta y no por la columna cache `m.estado`, que puede
      // venir desincronizada. Las comandas no cuentan: una mesa sin cuenta
      // propia con comandas encima no tiene nada que cobrarle.
      const mesasOcupadas = await mesaRepo
        .createQueryBuilder('m')
        .innerJoin(
          'ventas', 'v',
          'v.mesa_id = m.id AND v.estado = :ve AND v.comanda_id IS NULL',
          { ve: 'ABIERTA' },
        )
        .where('m.activo = :a', { a: true })
        .select('COUNT(DISTINCT m.id)', 'n')
        .getRawOne()
        .then((r: any) => Number(r?.n ?? 0));

      // 3. Comandas pendientes en cocina
      let comandasPendientes = 0;
      try {
        comandasPendientes = await dataSource.getRepository(ComandaItem)
          .createQueryBuilder('ci')
          .where('ci.estado = :e', { e: ComandaItemEstado.PENDIENTE })
          .getCount();
      } catch { /* opt */ }

      const cajasAbiertas: any[] = [];
      for (const caja of cajasAbiertasEntities) {
        const cajeroPersona: any = (caja.createdBy as any)?.persona;
        const cajero = (cajeroPersona?.nombre || (caja.createdBy as any)?.nickname || 'SIN USUARIO').toUpperCase();
        const horaApertura = caja.fechaApertura;
        const ms = Date.now() - new Date(horaApertura).getTime();
        const totalMin = Math.max(0, Math.floor(ms / 60000));
        const horas = Math.floor(totalMin / 60);
        const min = totalMin % 60;
        const horasAbierto = `${horas}h ${min}m`;

        // Ventas + monto de la caja (monto cobrado en moneda principal)
        const cajaTotalsRows: any[] = await dbQuery(dataSource, `
          SELECT COUNT(DISTINCT v.id) as cnt,
                 COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
               - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as suma
          FROM ventas v
          LEFT JOIN pagos p ON v.pago_id = p.id
          LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.moneda_id = ? AND pd.activo
          WHERE v.caja_id = ? AND v.estado = ?
        `, [monedaPrincipalId, caja.id, VentaEstado.CONCLUIDA]);
        const cantidadVentas = Number(cajaTotalsRows?.[0]?.cnt || 0);
        const ventaTotal = Number(cajaTotalsRows?.[0]?.suma || 0);

        // Mesas distintas atendidas
        const mesasRows: any[] = await dbQuery(dataSource, `
          SELECT COUNT(DISTINCT mesa_id) as cnt FROM ventas WHERE caja_id = ? AND mesa_id IS NOT NULL
        `, [caja.id]);
        const mesasAtendidas = Number(mesasRows?.[0]?.cnt || 0);

        cajasAbiertas.push({
          id: caja.id,
          cajero,
          horaApertura,
          horasAbierto,
          valorAperturaPYG: 0,
          valorAperturaUSD: 0,
          ventaTotal,
          mesasAtendidas,
          cantidadVentas,
        });
      }

      // 5. Top productos (en el rango)
      const { desde, hasta } = rangoToFechas(rango, now);
      const topRows: any[] = await dbQuery(dataSource, `
        SELECT p.id, p.nombre, SUM(vi.cantidad) as cantidad,
               SUM(vi.cantidad * vi.precio_venta_unitario) as total
        FROM venta_items vi
        JOIN ventas v ON v.id = vi.venta_id
        JOIN producto p ON p.id = vi.producto_id
        WHERE v.estado = ?
          AND vi.estado = ?
          AND v.created_at >= ?
          AND v.created_at <= ?
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT 8
      `, [VentaEstado.CONCLUIDA, EstadoVentaItem.ACTIVO, desde.toISOString(), hasta.toISOString()]);

      const maxTotal = topRows.reduce((m, r) => Math.max(m, Number(r.total || 0)), 0);
      const topProductos = topRows.map(r => ({
        nombre: String(r.nombre || '').toUpperCase(),
        cantidad: Number(r.cantidad || 0),
        total: Number(r.total || 0),
        porcentaje: maxTotal > 0 ? Math.round((Number(r.total || 0) / maxTotal) * 100) : 0,
      }));

      // 6. Top meseros (mismo alcance que el total: cajas abiertas o día). El
      // "mesero" es quien creó la venta (created_by). Total en moneda principal
      // (PAGO - VUELTO), mismo criterio que el ventaTotal por caja.
      const meseroRows: any[] = await dbQuery(dataSource, `
        SELECT u.id as usuario_id,
               COALESCE(per.nombre, u.nickname) as nombre,
               COUNT(DISTINCT v.id) as cantidad,
               COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
        FROM ventas v
        LEFT JOIN pagos p ON v.pago_id = p.id
        LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.moneda_id = ? AND pd.activo
        LEFT JOIN usuarios u ON u.id = v.created_by
        LEFT JOIN personas per ON per.id = u.persona_id
        WHERE v.estado = ? AND ${filtroHoy.sql}
        GROUP BY u.id, per.nombre, u.nickname
        ORDER BY total DESC
        LIMIT 8
      `, [monedaPrincipalId, VentaEstado.CONCLUIDA, ...filtroHoy.params]);

      const maxMesero = meseroRows.reduce((m, r) => Math.max(m, Number(r.total || 0)), 0);
      const topMeseros = meseroRows
        .filter((r) => r.usuario_id != null)
        .map((r) => ({
          nombre: String(r.nombre || 'SIN USUARIO').toUpperCase(),
          cantidad: Number(r.cantidad || 0),
          total: Number(r.total || 0),
          porcentaje: maxMesero > 0 ? Math.round((Number(r.total || 0) / maxMesero) * 100) : 0,
        }));

      // 7. Ventas por periodo (chart)
      const periodoData = await buildVentasPorPeriodo(dataSource, rango, now);

      return {
        ventasHoy,
        totalHoyPYG,
        ticketPromedio,
        mesasOcupadas,
        mesasTotal,
        comandasPendientes,
        cajasAbiertas,
        topProductos,
        topMeseros,
        ventasPorPeriodo: periodoData,
        // Desglose del total de hoy por moneda y forma de pago (todo en Gs).
        desgloseVentasHoy: desgloseHoy,
        // true → el total/desglose corresponde a las cajas abiertas (Opción B);
        // false → al día calendario (fallback sin cajas abiertas). El front usa
        // esto para el label de la card ("Total en caja" vs "Total hoy").
        totalBasadoEnCajas,
      };
    } catch (error) {
      console.error('Error get-dashboard-ventas-kpis:', error);
      throw error;
    }
  });
}

async function buildVentasPorPeriodo(
  dataSource: DataSource,
  rango: Rango,
  now: Date,
): Promise<{ labels: string[]; ventas: number[]; cantidades: number[] }> {
  const labels: string[] = [];
  const ventas: number[] = [];
  const cantidades: number[] = [];

  const monedaPrincipalId = await getMonedaPrincipalId(dataSource);
  const cotizacionMap = await getCotizacionMap(dataSource, monedaPrincipalId);

  // Los tramos del eje X (y su granularidad) los define `bucketsForRango`; acá
  // solo se agrega el total cobrado de cada uno.
  for (const bucket of bucketsForRango(rango, now)) {
    const r = await sumaVentasRango(
      dataSource,
      monedaPrincipalId,
      filtroRango(bucket.desde.toISOString(), bucket.hasta.toISOString()),
      cotizacionMap,
    );
    labels.push(bucket.label);
    ventas.push(r.suma);
    cantidades.push(r.cnt);
  }

  return { labels, ventas, cantidades };
}
