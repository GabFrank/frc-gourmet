import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { ComandaItem, ComandaItemEstado } from '../../src/app/database/entities/ventas/comanda-item.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { dbQuery } from '../utils/db-query';
import {
  Rango,
  RangoBucket,
  rangoToFechas,
  bucketsForRango,
  bucketsForVentana,
  ventanaDeFechas,
} from '../utils/dashboard-rangos.util';

// El "total" real de una venta NO vive en la columna ventas.total (no poblada),
// sino en pagos_detalles (PAGO - VUELTO). Estos helpers calculan el monto cobrado
// en la moneda principal, igual que getVentasTotalByCaja / getResumenCaja.
/**
 * Hora de arranque de la jornada comercial (`PdvConfig.inicioJornadaHora`).
 *
 * Cacheada: cuatro dashboards leyendo la config en cada request es una query de
 * mas por request, y este valor cambia una vez cada mucho.
 *
 * Fallback a 7 si no hay fila de `pdv_config` — en una instalacion nueva la
 * config no existe hasta terminar el onboarding, y los dashboards se pueden
 * abrir antes.
 */
let cacheInicioJornada: { valor: number; expira: number } | null = null;

export function invalidarCacheJornada(): void {
  cacheInicioJornada = null;
}

export async function getInicioJornada(dataSource: DataSource): Promise<number> {
  if (cacheInicioJornada && Date.now() < cacheInicioJornada.expira) return cacheInicioJornada.valor;
  let valor = 7;
  try {
    const rows: any[] = await dbQuery(dataSource, `SELECT inicio_jornada_hora FROM pdv_config LIMIT 1`, []);
    const h = Number(rows?.[0]?.inicio_jornada_hora);
    if (Number.isFinite(h) && h >= 0 && h <= 23) valor = h;
  } catch {
    /* tabla o columna todavia no migrada: se usa el default */
  }
  cacheInicioJornada = { valor, expira: Date.now() + 60_000 };
  return valor;
}

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

/**
 * Filtro combinado del pedido: qué ventas entran en los KPIs.
 *
 * `rango` sigue aceptando el string suelto (`'week'`) porque asi lo mandan hoy
 * el dashboard del desktop, el home y la PWA. Los campos nuevos son opcionales.
 *
 * ⚠️ Un filtro cuenta como EXPLICITO por sus CAMPOS (`desde`/`hasta`/`cajaIds`),
 * no por su forma: `{ rango: 'today' }` sin esos campos se comporta igual que el
 * string `'today'` y sigue cayendo en la Opcion B. Definirlo por "es un objeto"
 * rompia justo el default que se quiere preservar (el boton "volver a hoy").
 */
export interface KpisFiltro {
  rango?: Rango;
  /** ISO. Si viene, pisa al rango. */
  desde?: string;
  hasta?: string;
  /** Varias cajas; se combina con el periodo, no lo reemplaza. */
  cajaIds?: number[];
}

export type KpisParam = Rango | KpisFiltro | undefined;

/** AND de dos filtros. Seguro en los dos drivers: `dbQuery` reescribe `?`→`$N`
 *  secuencialmente y ninguno de los fragmentos usa `OR`. */
export function filtroY(a: VentaFiltro, b: VentaFiltro | null): VentaFiltro {
  if (!b) return a;
  return { sql: `${a.sql} AND ${b.sql}`, params: [...a.params, ...b.params] };
}

export function filtroCajas(cajaIds: number[]): VentaFiltro {
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

  ipcMain.handle('get-dashboard-ventas-kpis', async (_event, param: KpisParam = 'week') => {
    try {
      // Compat: el string suelto sigue siendo valido (desktop, home y PWA).
      const filtro: KpisFiltro = typeof param === 'string' ? { rango: param } : (param || {});
      const rango: Rango = filtro.rango || 'week';
      const cajaIds = (filtro.cajaIds || []).map(Number).filter((n) => Number.isFinite(n));
      // "Explicito" = el usuario eligio periodo o cajas. Con eso, la Opcion B
      // (el total sigue a la caja abierta) NO aplica: manda lo que pidio.
      const periodoExplicito = !!(filtro.desde || filtro.hasta);
      const filtroExplicito = periodoExplicito || cajaIds.length > 0;
      // Un unico `now` para todo el request: rangoToFechas y bucketsForRango
      // tienen que mirar el mismo instante o la ventana de la card y la del
      // chart pueden caer en horas (o dias) distintos entre await y await.
      const now = new Date();
      const inicioJornada = await getInicioJornada(dataSource);
      // Los limites de "hoy" salen del MISMO util que los buckets del chart.
      // Antes se calculaban aca con `setHours(0,...)`, saltandose el util: con la
      // jornada encendida, la card habria cortado a medianoche mientras el top de
      // productos cortaba a las 07:00 — el mismo desfase card/chart que el
      // invariante de `rangoToFechas` existe para evitar, dentro de una pantalla.
      const { desde: hoyInicio, hasta: hoyFin } = rangoToFechas('today', now, inicioJornada);

      // Ventana del periodo pedido: fechas explicitas si vinieron, si no el rango.
      const ventanaPreset = rangoToFechas(rango, now, inicioJornada);
      const ventana = periodoExplicito
        ? ventanaDeFechas(filtro.desde, filtro.hasta, ventanaPreset, inicioJornada)
        : ventanaPreset;
      const filtroCajasSel: VentaFiltro | null = cajaIds.length > 0 ? filtroCajas(cajaIds) : null;
      // Elegir SOLO cajas no debe acotar ademas al dia de hoy: una caja es un
      // turno cerrado, y su periodo es el suyo. Cruzarla con la ventana de "hoy"
      // hacia que elegir una caja de la semana pasada devolviera cero con el
      // cartel "No hubo ventas en el periodo" — falso, la caja si tuvo ventas.
      // El selector ofrece cajas viejas, asi que es el camino normal, no un borde.
      const soloCajas = !periodoExplicito && cajaIds.length > 0;
      // Periodo Y cajas: se combinan, no se excluyen.
      const filtroPeriodo = soloCajas
        ? (filtroCajasSel as VentaFiltro)
        : filtroY(
            filtroRango(ventana.desde.toISOString(), ventana.hasta.toISOString()),
            filtroCajasSel,
          );

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
      const totalBasadoEnCajas = !filtroExplicito && cajaIdsAbiertas.length > 0;
      // Con filtro explicito manda lo que pidio el usuario. Sin filtro, la
      // Opcion B: el total sigue a la caja abierta para que un turno que cruza
      // el corte no se parta al medio.
      const filtroHoy: VentaFiltro = filtroExplicito
        ? filtroPeriodo
        : totalBasadoEnCajas
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

      // 5. Top productos — usa el MISMO filtro combinado que el total.
      // Antes tenia su propio `v.created_at >= ? AND <= ?` y no sabia de
      // `cajaIds`: filtrando por caja 7, el total mostraba esa caja y el top de
      // productos TODAS, en la misma pantalla.
      const topRows: any[] = await dbQuery(dataSource, `
        SELECT p.id, p.nombre, SUM(vi.cantidad) as cantidad,
               SUM(vi.cantidad * vi.precio_venta_unitario) as total
        FROM venta_items vi
        JOIN ventas v ON v.id = vi.venta_id
        JOIN producto p ON p.id = vi.producto_id
        WHERE v.estado = ?
          AND vi.estado = ?
          AND ${filtroPeriodo.sql}
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT 8
      `, [VentaEstado.CONCLUIDA, EstadoVentaItem.ACTIVO, ...filtroPeriodo.params]);

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
      // Los tramos salen de la ventana REAL, no del preset: con fechas explicitas
      // `rango` sigue siendo el default y el chart se iria a otro periodo.
      const tramos = periodoExplicito
        ? bucketsForVentana(ventana.desde, ventana.hasta, inicioJornada)
        : bucketsForRango(rango, now, inicioJornada);
      const periodoData = await buildVentasPorPeriodo(dataSource, tramos, filtroCajasSel);

      // Desde cuando acumula el total, para que la UI no muestre dos "hoy"
      // distintos sin explicacion: con la Opcion B el total sigue la APERTURA de
      // la caja, que puede ser anterior al corte de jornada.
      const totalDesde = totalBasadoEnCajas
        ? (cajasAbiertasEntities[0]?.fechaApertura ?? hoyInicio)
        : (filtroExplicito ? ventana.desde : hoyInicio);

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
        // Metadatos del filtro aplicado, para que la UI pueda rotularlo.
        totalDesde: totalDesde instanceof Date ? totalDesde.toISOString() : totalDesde,
        inicioJornada,
        // Con SOLO cajas no hay ventana de fecha aplicada: mandar una igual
        // hacia que la UI rotulara un periodo que no se estaba filtrando. El
        // rotulo tiene que decir lo que se consulto, no lo que sobro del preset.
        filtroAplicado: filtroExplicito
          ? {
              desde: soloCajas ? null : ventana.desde.toISOString(),
              hasta: soloCajas ? null : ventana.hasta.toISOString(),
              cajaIds,
            }
          : null,
      };
    } catch (error) {
      console.error('Error get-dashboard-ventas-kpis:', error);
      throw error;
    }
  });
}

/**
 * Serie del chart. `tramos` ya viene resuelto por el caller para que el chart y
 * las cards miren SIEMPRE la misma ventana.
 *
 * Antes esta funcion recibia el preset (`rango`) y armaba los buckets sola. Con
 * fechas explicitas eso rompia: las cards usaban la ventana pedida y el chart
 * seguia en el preset — el usuario filtraba julio y veia las cards de julio con
 * un chart de la semana actual, en cero. Es el mismo desfase card/chart que el
 * invariante de `rangoToFechas` existe para evitar.
 */
async function buildVentasPorPeriodo(
  dataSource: DataSource,
  tramos: RangoBucket[],
  filtroExtra: VentaFiltro | null = null,
): Promise<{ labels: string[]; ventas: number[]; cantidades: number[] }> {
  const labels: string[] = [];
  const ventas: number[] = [];
  const cantidades: number[] = [];

  const monedaPrincipalId = await getMonedaPrincipalId(dataSource);
  const cotizacionMap = await getCotizacionMap(dataSource, monedaPrincipalId);

  // Acá solo se agrega el total cobrado de cada tramo.
  for (const bucket of tramos) {
    const r = await sumaVentasRango(
      dataSource,
      monedaPrincipalId,
      filtroY(filtroRango(bucket.desde.toISOString(), bucket.hasta.toISOString()), filtroExtra),
      cotizacionMap,
    );
    labels.push(bucket.label);
    ventas.push(r.suma);
    cantidades.push(r.cnt);
  }

  return { labels, ventas, cantidades };
}
