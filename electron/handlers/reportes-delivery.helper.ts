/**
 * Métricas de delivery y retiro para los informes de venta.
 *
 * Motor único: lo consumen el reporte de cierre de mes, el dashboard de ventas
 * y el resumen de caja. La razón de que sea uno solo y no tres consultas
 * parecidas es la de siempre en este repo — dos pantallas que cuentan lo mismo
 * de dos maneras terminan mostrando números distintos y nadie sabe cuál creer.
 *
 * ─── Criterios (leer antes de tocar) ────────────────────────────────────────
 *
 * **La ventana es `ventas.created_at`, para todo.** Tentaba contar los envíos
 * por `deliveries.fecha_entregado` ("envíos entregados en el mes"), pero
 * entonces los envíos del período y la facturación del período dejarían de
 * hablar del mismo conjunto de ventas: `envíos × ticket promedio` no daría la
 * facturación de delivery, y el KPI quedaría irreconciliable con el resto de la
 * pantalla. Se cuenta por fecha de la venta y el label dice "envíos", no
 * "entregados". Un pedido tomado el 31 y entregado el 1 cuenta en el mes en que
 * se vendió, que es también donde está su plata.
 *
 * **La plata sale de `pagos_detalles`, nunca de `ventas.total`.** `PAGO −
 * VUELTO` sobre `pd.activo`, con cada moneda convertida a la principal por
 * `compraLocal`. Mismo camino que `sumaVentasRango`, así que los totales por
 * canal suman exactamente la facturación del reporte.
 *
 * **La excepción es el envío**, que sale de `ventas.costo_delivery`: es un
 * monto congelado al asignar la zona y no se puede derivar de los cobros (un
 * pago mixto no dice qué parte era el envío).
 *
 * **`Number()` sobre todo decimal.** En Postgres los `decimal` llegan como
 * string porque el repo no registra `pg.types.setTypeParser(1700)`; sin el cast
 * `+=` concatena y el total sale `NaN`. Ya pasó en el arqueo de caja.
 *
 * **Los tiempos se calculan en JS**, no con date-diff de SQL: `EXTRACT(EPOCH…)`
 * y `julianday()` no se parecen en nada y ramificar por driver una aritmética
 * de cuatro etapas es más frágil que traer los timestamps y restarlos acá.
 */

import { DataSource } from 'typeorm';
import { dbQuery } from '../utils/db-query';
import { VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { RangoFechas } from './reportes-periodo.util';
import {
  CanalVenta, CANAL_VENTA_ORDEN, CANAL_VENTA_LABEL,
  canalVentaExpr, joinDeliveryCanal,
} from '../utils/canal-venta.utils';

/**
 * Contexto de cotización. Misma forma que el `CotCtx` de
 * `reportes-ventas.helper.ts`, que lo importa desde acá para que haya una sola
 * definición.
 */
export interface CotizacionCtx {
  monPrincipal: number;
  cotMap: { [id: number]: number };
  isPg: boolean;
}

/** Zona con la que se agrupa un reparto sin `precio_delivery_id`. */
export const ZONA_SIN_ASIGNAR = 'SIN ZONA';

/** Repartidor con el que se agrupa una entrega sin funcionario asignado. */
const REPARTIDOR_SIN_ASIGNAR = 'SIN REPARTIDOR';

function esPrincipal(v: any): boolean { return v === true || v === 1 || v === '1'; }
function num(v: any): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * Condición `WHERE` sobre `ventas v` más sus parámetros. Misma forma que el
 * `VentaFiltro` de `dashboard-ventas.handler.ts`, redeclarada acá a propósito:
 * importarla crearía un ciclo, porque ese handler consume este archivo para sus
 * chips de delivery. Son cuatro líneas; el ciclo sería peor.
 */
export interface FiltroVentas {
  sql: string;
  params: any[];
}

/** Filtro de un rango de fechas, en el formato que espera `dbQuery`. */
export function filtroDeRango(r: RangoFechas): FiltroVentas {
  return {
    sql: 'v.created_at >= ? AND v.created_at <= ?',
    params: [r.desde.toISOString(), r.hasta.toISOString()],
  };
}

/** El filtro acotado a ventas concluidas, que es la base de casi todo acá. */
function concluidas(filtro: FiltroVentas): FiltroVentas {
  return { sql: `v.estado = ? AND ${filtro.sql}`, params: [VentaEstado.CONCLUIDA, ...filtro.params] };
}

/**
 * Facturación (en moneda principal) y cantidad de tickets, agrupadas por una
 * expresión SQL arbitraria.
 *
 * Son dos consultas y no una a propósito: la de plata tiene que abrir por
 * moneda para poder convertir antes de sumar, y eso multiplica las filas — un
 * `COUNT(DISTINCT v.id)` en la misma consulta seguiría siendo correcto, pero
 * deja de serlo en cuanto alguien agrega un `LEFT JOIN` más. Separadas, cada
 * una responde una sola pregunta.
 */
async function agrupar(
  ds: DataSource,
  ctx: CotizacionCtx,
  filtro: FiltroVentas,
  grupoExpr: string,
  joins: string,
  filtroExtra = '',
): Promise<Map<string, { tickets: number; facturacion: number }>> {
  const base = concluidas(filtro);
  const where = `${base.sql}${filtroExtra ? ` AND ${filtroExtra}` : ''}`;
  const params = base.params;

  const filasPlata: any[] = await dbQuery(ds, `
    SELECT ${grupoExpr} AS grupo,
           pd.moneda_id AS moneda_id,
           m.principal  AS principal,
           COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) AS total
    FROM ventas v
    ${joins}
    LEFT JOIN pagos p ON v.pago_id = p.id
    LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
    LEFT JOIN monedas m ON m.id = pd.moneda_id
    WHERE ${where}
    GROUP BY ${grupoExpr}, pd.moneda_id, m.principal
  `, params);

  const filasTickets: any[] = await dbQuery(ds, `
    SELECT ${grupoExpr} AS grupo, COUNT(DISTINCT v.id) AS cnt
    FROM ventas v
    ${joins}
    WHERE ${where}
    GROUP BY ${grupoExpr}
  `, params);

  const acc = new Map<string, { tickets: number; facturacion: number }>();
  const entrada = (k: string) => {
    if (!acc.has(k)) acc.set(k, { tickets: 0, facturacion: 0 });
    return acc.get(k)!;
  };

  for (const f of filasPlata) {
    if (f.moneda_id == null) continue;
    const cot = esPrincipal(f.principal) ? 1 : (ctx.cotMap[Number(f.moneda_id)] || 0);
    entrada(String(f.grupo)).facturacion += Math.round(num(f.total) * cot);
  }
  for (const f of filasTickets) entrada(String(f.grupo)).tickets += num(f.cnt);

  return acc;
}

/**
 * Suma de `ventas.costo_delivery` del período, agrupada por `grupoExpr`.
 *
 * Sin agrupación (`grupoExpr = null`) se omite el `GROUP BY` entero en vez de
 * agrupar por una constante: `GROUP BY 'TOTAL'` es ambiguo entre drivers (en
 * Postgres un literal en GROUP BY roza la sintaxis de posición ordinal) y no
 * hace falta — un agregado sin GROUP BY ya devuelve exactamente una fila.
 */
async function envioRecaudado(
  ds: DataSource,
  filtro: FiltroVentas,
  grupoExpr: string | null,
  joins: string,
): Promise<Map<string, number>> {
  const base = concluidas(filtro);
  const select = grupoExpr ? `${grupoExpr} AS grupo, ` : '';
  const groupBy = grupoExpr ? `GROUP BY ${grupoExpr}` : '';
  const filas: any[] = await dbQuery(ds, `
    SELECT ${select}COALESCE(SUM(v.costo_delivery), 0) AS total
    FROM ventas v
    ${joins}
    WHERE ${base.sql}
      AND v.costo_delivery IS NOT NULL
    ${groupBy}
  `, base.params);
  const acc = new Map<string, number>();
  for (const f of filas) {
    const k = grupoExpr ? String(f.grupo) : TOTAL_SIN_AGRUPAR;
    acc.set(k, (acc.get(k) || 0) + num(f.total));
  }
  return acc;
}

/** Clave del Map cuando `envioRecaudado` corre sin agrupar. */
const TOTAL_SIN_AGRUPAR = 'TOTAL';

// ─────────────────────────── KPIs ───────────────────────────

export interface KpisDelivery {
  envios: number;
  retiros: number;
  ingresoEnvios: number;
  facturacionDelivery: number;
  ticketPromedioDelivery: number;
}

/**
 * Recibe un `FiltroVentas` y no un rango: el reporte filtra por período, pero
 * el dashboard filtra por CAJA ABIERTA (la "Opción B" que evita que un turno
 * que cruza medianoche reinicie el total). Las dos vistas tienen que contar los
 * envíos con la misma aritmética, así que lo que varía es el filtro, no la
 * función.
 */
export async function kpisDelivery(
  ds: DataSource,
  ctx: CotizacionCtx,
  filtro: FiltroVentas,
): Promise<KpisDelivery> {
  const porCanal = await agrupar(ds, ctx, filtro, canalVentaExpr(), joinDeliveryCanal());
  const delivery = porCanal.get(CanalVenta.DELIVERY) || { tickets: 0, facturacion: 0 };
  const retiro = porCanal.get(CanalVenta.RETIRO) || { tickets: 0, facturacion: 0 };
  const envios = (await envioRecaudado(ds, filtro, null, '')).get(TOTAL_SIN_AGRUPAR) || 0;

  return {
    envios: delivery.tickets,
    retiros: retiro.tickets,
    ingresoEnvios: Math.round(envios),
    facturacionDelivery: delivery.facturacion,
    ticketPromedioDelivery: delivery.tickets > 0 ? Math.round(delivery.facturacion / delivery.tickets) : 0,
  };
}

// ─────────────────────── Mix por canal ───────────────────────

export interface FilaCanal {
  canal: CanalVenta;
  label: string;
  tickets: number;
  facturacion: number;
  ticketPromedio: number;
  pct: number;
}

export async function mixPorCanal(
  ds: DataSource,
  ctx: CotizacionCtx,
  filtro: FiltroVentas,
): Promise<FilaCanal[]> {
  const acc = await agrupar(ds, ctx, filtro, canalVentaExpr(), joinDeliveryCanal());
  const total = [...acc.values()].reduce((s, v) => s + v.facturacion, 0);
  // Se recorre el orden fijo del enum y no las claves del Map: un canal sin
  // ventas tiene que aparecer en cero, no desaparecer de la dona — su ausencia
  // es justamente el dato (p. ej. "este mes no hubo un solo retiro").
  return CANAL_VENTA_ORDEN.map((canal) => {
    const v = acc.get(canal) || { tickets: 0, facturacion: 0 };
    return {
      canal,
      label: CANAL_VENTA_LABEL[canal],
      tickets: v.tickets,
      facturacion: v.facturacion,
      ticketPromedio: v.tickets > 0 ? Math.round(v.facturacion / v.tickets) : 0,
      pct: total > 0 ? +((v.facturacion / total) * 100).toFixed(1) : 0,
    };
  });
}

/**
 * Reparto por puerta de entrada (`Venta.canalOrigen`) dentro de lo que se
 * entrega: cuánto del delivery lo cargó el cajero y cuánto entró solo por la
 * tienda online. Es la métrica que dice si la web se está usando.
 */
export async function origenDeLosRepartos(
  ds: DataSource,
  ctx: CotizacionCtx,
  filtro: FiltroVentas,
): Promise<{ origen: string; tickets: number; facturacion: number }[]> {
  const acc = await agrupar(
    ds, ctx, filtro,
    `v.canal_origen`,
    joinDeliveryCanal(),
    `v.delivery_id IS NOT NULL`,
  );
  return [...acc.entries()]
    .map(([origen, v]) => ({ origen: String(origen || 'LOCAL').toUpperCase(), ...v }))
    .sort((a, b) => b.tickets - a.tickets);
}

// ─────────────────────── Envíos por zona ───────────────────────

export interface FilaZona {
  zona: string;
  envios: number;
  facturacion: number;
  ticketPromedio: number;
  envioRecaudado: number;
  minutosPromedio: number | null;
}

export async function enviosPorZona(
  ds: DataSource,
  ctx: CotizacionCtx,
  filtro: FiltroVentas,
): Promise<FilaZona[]> {
  // `COALESCE` sobre el nombre y no sobre el id: agrupar por id dejaría la fila
  // "sin zona" con clave NULL, que en un Map se vuelve la string "null".
  const zonaExpr = `COALESCE(pdz.descripcion, '${ZONA_SIN_ASIGNAR}')`;
  const joins = `
    ${joinDeliveryCanal()}
    LEFT JOIN precios_delivery pdz ON pdz.id = dcanal.precio_delivery_id
  `;
  // Sólo repartos: un retiro no tiene zona y su fila sería siempre "SIN ZONA",
  // ensuciando el ranking con algo que no es una zona.
  const soloEnvios = `v.delivery_id IS NOT NULL AND (dcanal.modo IS NULL OR dcanal.modo <> 'RETIRO')`;

  const acc = await agrupar(ds, ctx, filtro, zonaExpr, joins, soloEnvios);
  const envios = await envioRecaudado(ds, filtro, zonaExpr, joins);
  const tiempos = await minutosDeEntregaPorGrupo(ds, filtro, zonaExpr, joins, soloEnvios);

  return [...acc.entries()]
    .map(([zona, v]) => ({
      zona,
      envios: v.tickets,
      facturacion: v.facturacion,
      ticketPromedio: v.tickets > 0 ? Math.round(v.facturacion / v.tickets) : 0,
      envioRecaudado: Math.round(envios.get(zona) || 0),
      minutosPromedio: tiempos.get(zona) ?? null,
    }))
    .sort((a, b) => b.envios - a.envios || b.facturacion - a.facturacion);
}

// ─────────────────────── Repartidores ───────────────────────

export interface FilaRepartidor {
  nombre: string;
  entregas: number;
  facturacion: number;
  envioRecaudado: number;
  minutosPromedio: number | null;
}

export async function rankingRepartidores(
  ds: DataSource,
  ctx: CotizacionCtx,
  filtro: FiltroVentas,
): Promise<FilaRepartidor[]> {
  const nombreExpr = `COALESCE(perrep.nombre, '${REPARTIDOR_SIN_ASIGNAR}')`;
  const joins = `
    ${joinDeliveryCanal()}
    LEFT JOIN funcionarios frep ON frep.id = dcanal.entregado_por_funcionario_id
    LEFT JOIN personas perrep ON perrep.id = frep.persona_id
  `;
  const soloEnvios = `v.delivery_id IS NOT NULL AND (dcanal.modo IS NULL OR dcanal.modo <> 'RETIRO')`;

  const acc = await agrupar(ds, ctx, filtro, nombreExpr, joins, soloEnvios);
  const envios = await envioRecaudado(ds, filtro, nombreExpr, joins);
  const tiempos = await minutosDeEntregaPorGrupo(ds, filtro, nombreExpr, joins, soloEnvios);

  return [...acc.entries()]
    .map(([nombre, v]) => ({
      nombre: String(nombre).toUpperCase(),
      entregas: v.tickets,
      facturacion: v.facturacion,
      envioRecaudado: Math.round(envios.get(nombre) || 0),
      minutosPromedio: tiempos.get(nombre) ?? null,
    }))
    .sort((a, b) => b.entregas - a.entregas || b.facturacion - a.facturacion)
    .slice(0, 10);
}

// ─────────────────────── Tiempos y SLA ───────────────────────

const MS_POR_MINUTO = 60000;

/** Minutos entre dos timestamps, o null si falta alguno o el orden es inverso. */
function minutosEntre(desde: any, hasta: any): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / MS_POR_MINUTO;
}

function promedio(xs: number[]): number | null {
  if (!xs.length) return null;
  return +(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1);
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return +(o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2).toFixed(1);
}

/** Minutos promedio de entrega (abierto → entregado) por grupo. */
async function minutosDeEntregaPorGrupo(
  ds: DataSource,
  filtro: FiltroVentas,
  grupoExpr: string,
  joins: string,
  filtroExtra: string,
): Promise<Map<string, number>> {
  const base = concluidas(filtro);
  const filas: any[] = await dbQuery(ds, `
    SELECT ${grupoExpr} AS grupo,
           dcanal.fecha_abierto   AS abierto,
           dcanal.fecha_entregado AS entregado
    FROM ventas v
    ${joins}
    WHERE ${base.sql}
      AND dcanal.fecha_entregado IS NOT NULL
      AND ${filtroExtra}
  `, base.params);

  const porGrupo = new Map<string, number[]>();
  for (const f of filas) {
    const m = minutosEntre(f.abierto, f.entregado);
    if (m == null) continue;
    const k = String(f.grupo);
    if (!porGrupo.has(k)) porGrupo.set(k, []);
    porGrupo.get(k)!.push(m);
  }
  const acc = new Map<string, number>();
  for (const [k, xs] of porGrupo) {
    const p = promedio(xs);
    if (p != null) acc.set(k, p);
  }
  return acc;
}

export interface EtapaTiempo {
  etapa: string;
  promedio: number | null;
  mediana: number | null;
  muestras: number;
}

export interface TiemposEntrega {
  etapas: EtapaTiempo[];
  /** Total abierto → entregado, repartido por semáforo de la config del PdV. */
  sla: { verde: number; amarillo: number; rojo: number; total: number };
  umbralAmarillo: number;
  umbralRojo: number;
}

/**
 * Tiempos por etapa del reparto y cumplimiento del SLA.
 *
 * Los umbrales salen de `PdvConfig.deliveryTiempoAmarillo/Rojo`, los mismos que
 * colorean la lista del PdV. Hasta ahora sólo servían para pintar una fila; acá
 * se agregan, que es donde dicen algo: "el 18% de los envíos pasó el rojo".
 *
 * Sólo entran repartos ENTREGADOS: un pedido todavía en la calle no tiene
 * tiempo total, y contarlo como cero bajaría el promedio a gusto del reloj.
 */
export async function tiemposEntrega(
  ds: DataSource,
  filtro: FiltroVentas,
  umbralAmarillo: number,
  umbralRojo: number,
): Promise<TiemposEntrega> {
  const base = concluidas(filtro);
  const filas: any[] = await dbQuery(ds, `
    SELECT d.fecha_abierto      AS abierto,
           d.fecha_para_entrega AS para_entrega,
           d.fecha_en_camino    AS en_camino,
           d.fecha_entregado    AS entregado
    FROM ventas v
    JOIN deliveries d ON d.id = v.delivery_id
    WHERE ${base.sql}
      AND (d.modo IS NULL OR d.modo <> 'RETIRO')
      AND d.fecha_entregado IS NOT NULL
  `, base.params);

  const preparacion: number[] = [];
  const despacho: number[] = [];
  const calle: number[] = [];
  const total: number[] = [];

  for (const f of filas) {
    // Cada etapa se acumula sólo si tiene sus dos extremos. Un delivery que
    // saltó de ABIERTO a EN_CAMINO sin pasar por PARA_ENTREGA (la máquina de
    // estados lo permite) no tiene etapa de despacho, y rellenarla con cero
    // diría que el despacho es instantáneo cuando en realidad no existió.
    const p = minutosEntre(f.abierto, f.para_entrega);
    const d = minutosEntre(f.para_entrega, f.en_camino);
    const c = minutosEntre(f.en_camino, f.entregado);
    const t = minutosEntre(f.abierto, f.entregado);
    if (p != null) preparacion.push(p);
    if (d != null) despacho.push(d);
    if (c != null) calle.push(c);
    if (t != null) total.push(t);
  }

  const etapa = (nombre: string, xs: number[]): EtapaTiempo => ({
    etapa: nombre, promedio: promedio(xs), mediana: mediana(xs), muestras: xs.length,
  });

  const sla = { verde: 0, amarillo: 0, rojo: 0, total: total.length };
  for (const t of total) {
    if (t >= umbralRojo) sla.rojo++;
    else if (t >= umbralAmarillo) sla.amarillo++;
    else sla.verde++;
  }

  return {
    etapas: [
      etapa('PREPARACIÓN', preparacion),
      etapa('DESPACHO', despacho),
      etapa('EN CALLE', calle),
      etapa('TOTAL', total),
    ],
    sla,
    umbralAmarillo,
    umbralRojo,
  };
}

// ─────────────────────── Cancelaciones ───────────────────────

export interface CancelacionesDelivery {
  cantidad: number;
  /** % sobre el total de repartos del período (cancelados incluidos). */
  tasa: number;
  montoPerdido: number;
  motivos: { motivo: string; cantidad: number }[];
}

/**
 * Repartos cancelados del período.
 *
 * `delivery-cancelar` cancela también la venta, así que estas ventas están en
 * CANCELADA y NO aparecen en ninguna otra métrica de este archivo (todas filtran
 * CONCLUIDA). Por eso la consulta es aparte en vez de un grupo más.
 *
 * El **monto perdido** se calcula sobre `venta_items` sin filtrar por estado del
 * ítem: la cancelación los pasa a CANCELADO, así que filtrar por ACTIVO daría
 * cero siempre. Se toma el precio de venta al que estaban cargados, en la moneda
 * principal — misma convención que el margen y el top de productos del reporte,
 * que tampoco convierten `venta_items`.
 */
export async function cancelacionesDelivery(
  ds: DataSource,
  filtro: FiltroVentas,
): Promise<CancelacionesDelivery> {
  // Única función del archivo que NO parte de `concluidas()`: una venta
  // cancelada está en CANCELADA justamente porque se canceló.
  const canceladas = { sql: `v.estado = ? AND ${filtro.sql}`, params: [VentaEstado.CANCELADA, ...filtro.params] };

  const resumen: any[] = await dbQuery(ds, `
    SELECT COUNT(DISTINCT v.id) AS cnt
    FROM ventas v
    JOIN deliveries d ON d.id = v.delivery_id
    WHERE ${canceladas.sql}
      AND d.estado = 'CANCELADO'
  `, canceladas.params);
  const cantidad = num(resumen?.[0]?.cnt);

  const perdido: any[] = await dbQuery(ds, `
    SELECT COALESCE(SUM(vi.cantidad * vi.precio_venta_unitario), 0) AS total
    FROM ventas v
    JOIN deliveries d ON d.id = v.delivery_id
    JOIN venta_items vi ON vi.venta_id = v.id
    WHERE ${canceladas.sql}
      AND d.estado = 'CANCELADO'
  `, canceladas.params);

  const motivosRows: any[] = await dbQuery(ds, `
    SELECT COALESCE(d.motivo_cancelacion, 'SIN MOTIVO') AS motivo, COUNT(*) AS cnt
    FROM ventas v
    JOIN deliveries d ON d.id = v.delivery_id
    WHERE ${canceladas.sql}
      AND d.estado = 'CANCELADO'
    GROUP BY COALESCE(d.motivo_cancelacion, 'SIN MOTIVO')
    ORDER BY cnt DESC
  `, canceladas.params);

  // Denominador de la tasa: repartos cancelados + repartos que sí se cerraron.
  const vivosFiltro = concluidas(filtro);
  const vivos: any[] = await dbQuery(ds, `
    SELECT COUNT(DISTINCT v.id) AS cnt
    FROM ventas v
    WHERE v.delivery_id IS NOT NULL AND ${vivosFiltro.sql}
  `, vivosFiltro.params);

  const base = cantidad + num(vivos?.[0]?.cnt);

  return {
    cantidad,
    tasa: base > 0 ? +((cantidad / base) * 100).toFixed(1) : 0,
    montoPerdido: Math.round(num(perdido?.[0]?.total)),
    motivos: motivosRows.slice(0, 6).map((m) => ({
      motivo: String(m.motivo || 'SIN MOTIVO').toUpperCase(),
      cantidad: num(m.cnt),
    })),
  };
}

// ─────────────────── Estado operativo (sin período) ───────────────────

/**
 * Repartos que están en la calle **ahora mismo**.
 *
 * Deliberadamente sin filtro de período: es un dato operativo, no analítico. El
 * cajero quiere saber cuántos pedidos hay dando vueltas sin cerrar, y ese
 * número no depende del mes que esté mirando el dashboard. Un delivery
 * cancelado pasa a CANCELADO, así que no puede colarse acá.
 */
export async function deliveriesEnCamino(ds: DataSource): Promise<number> {
  const filas: any[] = await dbQuery(ds, `
    SELECT COUNT(*) AS cnt FROM deliveries WHERE estado = 'EN_CAMINO'
  `, []);
  return num(filas?.[0]?.cnt);
}

// ─────────────────── Cobro anticipado vs contra entrega ───────────────────

export interface CobroAnticipado {
  anticipado: number;
  contraEntrega: number;
}

export async function cobroAnticipadoVsContraEntrega(
  ds: DataSource,
  filtro: FiltroVentas,
): Promise<CobroAnticipado> {
  const base = concluidas(filtro);
  const filas: any[] = await dbQuery(ds, `
    SELECT d.cobro_anticipado AS anticipado, COUNT(DISTINCT v.id) AS cnt
    FROM ventas v
    JOIN deliveries d ON d.id = v.delivery_id
    WHERE ${base.sql}
    GROUP BY d.cobro_anticipado
  `, base.params);

  let anticipado = 0, contraEntrega = 0;
  for (const f of filas) {
    // `cobro_anticipado` es boolean en Postgres y 0/1 en SQLite.
    if (f.anticipado === true || f.anticipado === 1 || f.anticipado === '1') anticipado += num(f.cnt);
    else contraEntrega += num(f.cnt);
  }
  return { anticipado, contraEntrega };
}

// ─────────────────────── Resumen por caja ───────────────────────

export interface ResumenDeliveryCaja {
  envios: number;
  retiros: number;
  cancelados: number;
  /** `SUM(ventas.costo_delivery)` cobrado en el turno, en moneda principal. */
  cobroEnvios: number;
  /** Repartos del turno marcados para cobrar por adelantado. */
  anticipados: number;
  /** Repartos del turno que quedan sin entregar al cerrar la caja. */
  pendientes: number;
}

/**
 * Bloque de delivery del cierre de caja.
 *
 * Vive acá y no en `resumen-caja.utils.ts` para que el cajero y el gerente
 * cuenten los envíos igual — pero no reusa `kpisDelivery` porque el cierre no
 * necesita facturación por canal, y arrastrar la conversión multimoneda para
 * cuatro conteos obligaría al util del arqueo a depender del mapa de
 * cotizaciones. Los montos de acá son `costo_delivery`, que ya está en la
 * moneda principal.
 *
 * `pendientes` es el dato con más valor operativo del bloque: dice cuántos
 * pedidos quedan en la calle cuando se cierra el turno.
 */
export async function resumenDeliveryCaja(
  ds: DataSource,
  cajaId: number,
): Promise<ResumenDeliveryCaja> {
  const filas: any[] = await dbQuery(ds, `
    SELECT d.modo             AS modo,
           d.estado           AS estado,
           d.cobro_anticipado AS anticipado,
           v.estado           AS venta_estado,
           v.costo_delivery   AS costo
    FROM ventas v
    JOIN deliveries d ON d.id = v.delivery_id
    WHERE v.caja_id = ?
  `, [cajaId]);

  const r: ResumenDeliveryCaja = {
    envios: 0, retiros: 0, cancelados: 0, cobroEnvios: 0, anticipados: 0, pendientes: 0,
  };

  for (const f of filas) {
    const esRetiro = String(f.modo || '').toUpperCase() === 'RETIRO';
    const cancelado = String(f.estado || '').toUpperCase() === 'CANCELADO';
    if (cancelado) { r.cancelados++; continue; }
    // Sólo las concluidas cuentan como venta del turno; una ABIERTA todavía no
    // se cobró y sumarla al arqueo diría que entró plata que no entró.
    if (String(f.venta_estado || '').toUpperCase() !== VentaEstado.CONCLUIDA) {
      r.pendientes++;
      continue;
    }
    if (esRetiro) r.retiros++; else r.envios++;
    r.cobroEnvios += num(f.costo);
    if (f.anticipado === true || f.anticipado === 1 || f.anticipado === '1') r.anticipados++;
  }
  r.cobroEnvios = Math.round(r.cobroEnvios);

  // Un reparto cobrado pero todavia sin entregar tambien esta en la calle.
  const sinEntregar: any[] = await dbQuery(ds, `
    SELECT COUNT(*) AS cnt
    FROM ventas v
    JOIN deliveries d ON d.id = v.delivery_id
    WHERE v.caja_id = ?
      AND d.estado NOT IN ('ENTREGADO', 'CANCELADO')
      AND v.estado = ?
  `, [cajaId, VentaEstado.CONCLUIDA]);
  r.pendientes += num(sinEntregar?.[0]?.cnt);

  return r;
}

// ─────────────────────── Orquestador ───────────────────────

export interface BloqueDelivery {
  kpis: KpisDelivery;
  kpisAnterior: KpisDelivery | null;
  mixCanal: FilaCanal[];
  zonas: FilaZona[];
  repartidores: FilaRepartidor[];
  tiempos: TiemposEntrega;
  cancelaciones: CancelacionesDelivery;
  cobroAnticipado: CobroAnticipado;
  origenRepartos: { origen: string; tickets: number; facturacion: number }[];
}

/**
 * Arma el bloque completo para el reporte de cierre de mes.
 *
 * Los umbrales de SLA se leen una vez y se pasan; que cada sub-función fuera a
 * buscar la `PdvConfig` por su cuenta multiplicaría la misma consulta por seis.
 */
export async function construirBloqueDelivery(
  ds: DataSource,
  ctx: CotizacionCtx,
  actual: RangoFechas,
  anterior: RangoFechas | null,
): Promise<BloqueDelivery> {
  const cfg: any[] = await dbQuery(ds, `
    SELECT delivery_tiempo_amarillo AS amarillo, delivery_tiempo_rojo AS rojo
    FROM pdv_config LIMIT 1
  `, []);
  const umbralAmarillo = num(cfg?.[0]?.amarillo) || 30;
  const umbralRojo = num(cfg?.[0]?.rojo) || 60;

  const fActual = filtroDeRango(actual);
  const fAnterior = anterior ? filtroDeRango(anterior) : null;

  const [kpis, kpisAnterior, mixCanal, zonas, repartidores, tiempos, cancelaciones, cobro, origen] =
    await Promise.all([
      kpisDelivery(ds, ctx, fActual),
      fAnterior ? kpisDelivery(ds, ctx, fAnterior) : Promise.resolve(null),
      mixPorCanal(ds, ctx, fActual),
      enviosPorZona(ds, ctx, fActual),
      rankingRepartidores(ds, ctx, fActual),
      tiemposEntrega(ds, fActual, umbralAmarillo, umbralRojo),
      cancelacionesDelivery(ds, fActual),
      cobroAnticipadoVsContraEntrega(ds, fActual),
      origenDeLosRepartos(ds, ctx, fActual),
    ]);

  return {
    kpis,
    kpisAnterior,
    mixCanal,
    zonas,
    repartidores,
    tiempos,
    cancelaciones,
    cobroAnticipado: cobro,
    origenRepartos: origen,
  };
}
