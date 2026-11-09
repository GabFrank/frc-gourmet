/**
 * F8b fase 2 (docs/planes/PLAN-tienda-f8b-credito.md): compra a cuenta desde la tienda.
 *
 * Reglas (decisiones del propietario, 07/11):
 * - Solo una cuenta web VINCULADA a mano a un cliente activo con crédito, y con identidad
 *   verificada (teléfono por código o correo verificado). Invitados y MESA_QR, nunca.
 * - En la web el límite es DURO: el cliente no puede «forzar» como el cajero en el PdV.
 *   Disponible = límite − saldo − pedidos web a cuenta todavía sin aceptar. Límite 0 = sin tope.
 * - La deuda nace AL ACEPTAR (en la misma transacción que crea la venta): Pago + detalle
 *   «CREDITO» por el total (como un cobro anticipado, la venta queda saldada), CPC de UNA cuota
 *   que vence el último día del mes, MovimientoCliente CARGO y saldo. Cancelar la venta lo revierte
 *   con la reversa de siempre (`cancelarVentaCompletaEnTx`).
 *
 * Concurrencia: dos pedidos del mismo cliente se serializan con `withClienteLock` (el servidor es
 * un solo proceso); en Postgres además se toma la fila del cliente con FOR UPDATE dentro de la
 * transacción de la deuda, para no cruzarse con una venta a crédito del PdV.
 */
import { DataSource, EntityManager } from 'typeorm';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { CuentaCliente } from '../../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { EstadoPedidoOnline, MetodoPagoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import {
  CuentaPorCobrarCuotaEstado, CuentaPorCobrarEstado, CuentaPorCobrarTipo, MovimientoClienteTipo,
} from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { Pago } from '../../src/app/database/entities/compras/pago.entity';
import { PagoEstado } from '../../src/app/database/entities/compras/estado.enum';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { ajustarSaldoCliente } from './saldo-atomico.utils';

export const FORMA_PAGO_CREDITO = 'CREDITO';

/** Estados de un pedido a cuenta que todavía no generó deuda (reserva el disponible). */
const ESTADOS_RESERVA = [EstadoPedidoOnline.RECIBIDO, EstadoPedidoOnline.ACEPTADO];

/** La tienda ofrece «A cuenta» (interruptor en `metodos_pago`). */
export function creditoHabilitadoEnTienda(cfg: { metodosPago?: string | null } | null | undefined): boolean {
  try {
    const lista = cfg?.metodosPago ? JSON.parse(cfg.metodosPago) : null;
    return Array.isArray(lista) && lista.includes(MetodoPagoOnline.CREDITO);
  } catch {
    return false;
  }
}

/** Ingreso verificado: el teléfono por código de WhatsApp o un correo verificado (Google). */
export function identidadVerificada(c: CuentaCliente | null | undefined): boolean {
  return !!c && ((!!c.telefono && !!c.telefonoVerificado) || (!!c.email && !!c.emailVerificado));
}

const lockTails = new Map<number, Promise<void>>();
/** Serializa por cliente (pedido a cuenta y su deuda). Mismo patrón que `withPedidoLock`. */
export async function withClienteLock<T>(clienteId: number, fn: () => Promise<T>): Promise<T> {
  const prev = lockTails.get(clienteId) ?? Promise.resolve();
  let release!: () => void;
  const myTurn = new Promise<void>((res) => (release = res));
  const composed = prev.then(() => myTurn);
  lockTails.set(clienteId, composed);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (lockTails.get(clienteId) === composed) lockTails.delete(clienteId);
  }
}

/** Suma de los pedidos web a cuenta de este cliente que todavía no generaron deuda. */
export async function reservadoWeb(m: EntityManager, clienteId: number, excluirPedidoId?: number): Promise<number> {
  const qb = m.getRepository(PedidoOnline).createQueryBuilder('p')
    .select('COALESCE(SUM(p.total), 0)', 'total')
    .where('p.cliente_id = :c', { c: clienteId })
    .andWhere('p.metodo_pago = :m', { m: MetodoPagoOnline.CREDITO })
    .andWhere('p.venta_id IS NULL')
    .andWhere('p.estado IN (:...e)', { e: ESTADOS_RESERVA });
  if (excluirPedidoId) qb.andWhere('p.id <> :x', { x: excluirPedidoId });
  const r = await qb.getRawOne();
  return Number(r?.total) || 0;
}

export interface EstadoCredito {
  habilitado: boolean;
  /** null = sin tope (límite 0). */
  disponible: number | null;
  limite: number;
  motivo?: 'sin_vinculo' | 'cliente_inactivo' | 'sin_credito' | 'identidad_no_verificada';
}

/** Lo que puede gastar a cuenta este cliente hoy, descontando lo ya reservado en la web. */
export async function estadoCreditoCliente(m: EntityManager, cliente: Cliente | null | undefined, excluirPedidoId?: number): Promise<EstadoCredito> {
  if (!cliente) return { habilitado: false, disponible: 0, limite: 0, motivo: 'sin_vinculo' };
  if (!cliente.activo) return { habilitado: false, disponible: 0, limite: 0, motivo: 'cliente_inactivo' };
  if (!cliente.credito) return { habilitado: false, disponible: 0, limite: 0, motivo: 'sin_credito' };
  const limite = Number(cliente.limite_credito) || 0;
  // Límite 0 = sin crédito (decisión 2026-11-09: el tope se respeta en la web y en el PdV).
  if (limite <= 0) return { habilitado: false, disponible: 0, limite: 0, motivo: 'sin_limite' };
  const saldo = Number(cliente.saldoActual) || 0;
  const reservado = await reservadoWeb(m, cliente.id, excluirPedidoId);
  return { habilitado: true, disponible: Math.max(0, Math.round((limite - saldo - reservado) * 100) / 100), limite };
}

/** Estado del crédito de una cuenta web (para «Mi cuenta» y el checkout). */
export async function estadoCreditoCuenta(ds: DataSource, cuenta: CuentaCliente | null | undefined): Promise<EstadoCredito> {
  const cli: any = cuenta?.cliente;
  if (!cli?.id) return { habilitado: false, disponible: 0, limite: 0, motivo: 'sin_vinculo' };
  if (!identidadVerificada(cuenta)) return { habilitado: false, disponible: 0, limite: 0, motivo: 'identidad_no_verificada' };
  const cliente = await ds.getRepository(Cliente).findOne({ where: { id: cli.id } });
  return estadoCreditoCliente(ds.manager, cliente);
}

/**
 * Último día del mes de `fecha` en la hora de Paraguay (el servidor puede correr en UTC: una
 * compra aceptada el 30/11 a las 22:00 en Asunción ya es 1/12 en UTC y vencería un mes después).
 */
export function finDeMes(fecha: Date, zona = 'America/Asuncion'): Date {
  let anio = fecha.getFullYear();
  let mes = fecha.getMonth();
  try {
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: 'numeric' }).formatToParts(fecha);
    anio = Number(partes.find((p) => p.type === 'year')?.value) || anio;
    mes = (Number(partes.find((p) => p.type === 'month')?.value) || mes + 1) - 1;
  } catch {
    /* sin datos de zona horaria: la del servidor */
  }
  return new Date(anio, mes + 1, 0);
}

/**
 * Lee el cliente con FOR UPDATE en Postgres (sin relaciones: FOR UPDATE no va con outer joins).
 * La materialización lo llama AL EMPEZAR la transacción, antes de insertar la venta con ese
 * cliente: el insert toma un KEY SHARE sobre la fila, y bloquearla después podía cruzarse con una
 * venta a crédito del PdV del mismo cliente (deadlock, auditoría F8b fase 2).
 */
export async function clienteBloqueado(m: EntityManager, clienteId: number): Promise<Cliente | null> {
  const pg = m.connection.options.type === 'postgres';
  return m.getRepository(Cliente).findOne({
    where: { id: clienteId },
    ...(pg ? { lock: { mode: 'pessimistic_write' as const } } : {}),
  });
}

async function formaPagoCredito(m: EntityManager): Promise<FormasPago> {
  const repo = m.getRepository(FormasPago);
  const fp = await repo.createQueryBuilder('fp').where('UPPER(fp.nombre) = :n', { n: FORMA_PAGO_CREDITO }).getOne();
  if (fp) return fp;
  // Igual que `cobrar-venta-credito`: no mueve la caja física.
  return repo.save(repo.create({ nombre: FORMA_PAGO_CREDITO, movimentaCaja: false, principal: false, orden: 99, activo: true } as any) as any) as any;
}

export class CreditoTiendaError extends Error {
  constructor(public codigo: 'credito_sin_cliente' | 'credito_no_habilitado' | 'credito_insuficiente', detalle?: string) {
    super(detalle ? `${codigo}: ${detalle}` : codigo);
  }
}

/**
 * La deuda del pedido a cuenta, dentro de la transacción que crea la venta. Revalida (el cliente
 * pudo perder el crédito entre el pedido y la aceptación) con el cliente bloqueado. Deja la venta
 * con un Pago ABIERTO y un detalle CREDITO por el total: el PdV la ve saldada y la concluye como
 * un pedido pagado online.
 */
export async function cargarDeudaPedidoACuenta(
  m: EntityManager,
  params: { pedido: PedidoOnline; ventaId: number; cajaId: number; monedaId: number; usuarioId?: number | null; ahora?: Date },
): Promise<{ pagoId: number; cpcId: number }> {
  const { pedido, ventaId, cajaId, monedaId } = params;
  const ahora = params.ahora || new Date();
  const clienteId = Number(pedido.clienteId);
  if (!clienteId) throw new CreditoTiendaError('credito_sin_cliente', 'el pedido a cuenta no tiene cliente');
  const cliente = await clienteBloqueado(m, clienteId);
  if (!cliente || !cliente.activo || !cliente.credito) {
    throw new CreditoTiendaError('credito_no_habilitado', 'el cliente ya no tiene crédito habilitado');
  }
  const monto = Math.round(Number(pedido.total) * 100) / 100;
  if (!(monto > 0)) throw new CreditoTiendaError('credito_insuficiente', 'monto inválido');
  const est = await estadoCreditoCliente(m, cliente, pedido.id);
  if (est.disponible !== null && monto > est.disponible + 1e-9) {
    throw new CreditoTiendaError('credito_insuficiente', `disponible ${est.disponible}, pedido ${monto}`);
  }

  const usuario = params.usuarioId ? ({ id: params.usuarioId } as any) : undefined;
  const fp = await formaPagoCredito(m);
  const pago = await m.getRepository(Pago).save(m.getRepository(Pago).create({
    estado: PagoEstado.ABIERTO, caja: { id: cajaId } as any, activo: true, createdBy: usuario,
  } as any) as any) as Pago;
  await m.getRepository(PagoDetalle).save(m.getRepository(PagoDetalle).create({
    valor: monto,
    descripcion: `A CUENTA ${pedido.numero}`.slice(0, 255),
    activo: true,
    tipo: TipoDetalle.PAGO,
    pago: { id: pago.id } as any,
    moneda: { id: monedaId } as any,
    formaPago: { id: fp.id } as any,
    createdBy: usuario,
  } as any));

  const cpc = await m.getRepository(CuentaPorCobrar).save(m.getRepository(CuentaPorCobrar).create({
    cliente: { id: clienteId } as any,
    tipo: CuentaPorCobrarTipo.CREDITO_VENTA,
    descripcion: `PEDIDO WEB ${pedido.numero} A CUENTA`.toUpperCase(),
    montoTotal: monto,
    montoCobrado: 0,
    moneda: { id: monedaId } as any,
    fechaInicio: ahora,
    cantidadCuotas: 1,
    estado: CuentaPorCobrarEstado.ACTIVO,
    ventaId,
    createdBy: usuario,
  } as any) as any) as CuentaPorCobrar;
  await m.getRepository(CuentaPorCobrarCuota).save(m.getRepository(CuentaPorCobrarCuota).create({
    cuentaPorCobrar: { id: cpc.id } as any,
    numero: 1,
    fechaVencimiento: finDeMes(ahora),
    monto,
    montoCobrado: 0,
    estado: CuentaPorCobrarCuotaEstado.PENDIENTE,
    createdBy: usuario,
  } as any));
  await m.getRepository(MovimientoCliente).save(m.getRepository(MovimientoCliente).create({
    cliente: { id: clienteId } as any,
    tipo: MovimientoClienteTipo.CARGO,
    monto,
    fecha: ahora,
    ventaId,
    cuentaPorCobrarId: cpc.id,
    observacion: `CARGO POR PEDIDO WEB ${pedido.numero} A CUENTA`,
    registradoPor: usuario,
    createdBy: usuario,
  } as any));
  await ajustarSaldoCliente(m, clienteId, monto);
  return { pagoId: pago.id, cpcId: cpc.id };
}

/** ¿La venta ya tiene una cuenta por cobrar activa? (no se cobra dos veces a crédito). */
export async function ventaTieneCpcActiva(m: EntityManager, ventaId: number): Promise<boolean> {
  return (await m.getRepository(CuentaPorCobrar).count({ where: { ventaId, estado: CuentaPorCobrarEstado.ACTIVO } })) > 0;
}

