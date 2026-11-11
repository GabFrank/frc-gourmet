/**
 * Deuda de una venta a cuenta cuando se edita después de aceptada
 * (docs/planes/PLAN-tienda-deuda-editada.md; decisión del propietario 2026-11-09).
 *
 * Un pedido web «A cuenta» deja, al aceptarse, una venta ABIERTA con un detalle CREDITO por el
 * total y una CPC ACTIVA con ese monto (`cargarDeudaPedidoACuenta`). Si después el local agrega o
 * quita ítems, cambia el envío o pone un descuento, la deuda tiene que seguir al total:
 *
 * - **Con cobros** (`cpc.montoCobrado > 0`) la venta no se edita: `verificarEdicionVentaConDeuda`
 *   lo frena antes del cambio (corregir una deuda ya cobrada en parte es trabajo de caja, a mano).
 * - **Sube:** la deuda sube hasta lo que permite el límite del cliente (el tope se respeta). Lo
 *   que pase del tope queda como saldo de la venta y se cobra al entregar, como cualquier saldo.
 * - **Baja:** la deuda baja. Si llega a cero, la CPC se cancela con la reversa de siempre.
 * - Cada cambio deja su `MovimientoCliente` (AJUSTE_POSITIVO / AJUSTE_NEGATIVO) y mueve el saldo
 *   del cliente por la diferencia, así `recalcular-saldo-cliente` sigue cerrando.
 *
 * Solo ventas ABIERTAS: una venta concluida (la del PdV a crédito) no se resincroniza.
 */
import { DataSource, EntityManager } from 'typeorm';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import { CuentaPorCobrarEstado, MovimientoClienteTipo } from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { ajustarSaldoCliente } from './saldo-atomico.utils';
import { cancelarCuotasAbiertasDeCpc } from './cpc-cuotas.utils';
import { clienteBloqueado, estadoCreditoCliente, FORMA_PAGO_CREDITO, withClienteLock } from './credito-tienda.utils';

export const ERROR_VENTA_DEUDA_COBRADA = 'VENTA_A_CUENTA_CON_COBROS';
/** Lo que ve el personal. Para corregirla, primero se anula el cobro de la cuenta por cobrar. */
export const MENSAJE_VENTA_DEUDA_COBRADA = 'Esta venta tiene una deuda a cuenta con cobros y no se puede modificar. Para corregirla, anulá primero el cobro de la cuenta por cobrar.';

export class DeudaVentaError extends Error {
  constructor(public codigo: string, mensaje: string) {
    super(mensaje);
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function cpcActivaDeVenta(m: EntityManager, ventaId: number): Promise<CuentaPorCobrar | null> {
  return m.getRepository(CuentaPorCobrar).findOne({
    where: { ventaId, estado: CuentaPorCobrarEstado.ACTIVO },
    relations: ['cliente', 'moneda'],
    order: { id: 'DESC' },
  });
}

/** La venta de un ítem (los handlers de ítems no siempre traen la relación cargada). */
export async function ventaIdDeItem(ds: DataSource | EntityManager, itemId: number): Promise<number | null> {
  const r = await ds.query(`SELECT venta_id FROM venta_items WHERE id = ${Number(itemId) | 0}`);
  const v = Number(r?.[0]?.venta_id);
  return v > 0 ? v : null;
}

/** El pago de una línea de pago. */
export async function pagoIdDeDetalle(ds: DataSource | EntityManager, detalleId: number): Promise<number | null> {
  const r = await ds.query(`SELECT pago_id FROM pagos_detalles WHERE id = ${Number(detalleId) | 0}`);
  const v = Number(r?.[0]?.pago_id);
  return v > 0 ? v : null;
}

/** La venta de un delivery. */
export async function ventaIdDeDelivery(ds: DataSource | EntityManager, deliveryId: number): Promise<number | null> {
  const r = await ds.query(`SELECT id FROM ventas WHERE delivery_id = ${Number(deliveryId) | 0} ORDER BY id DESC`);
  const v = Number(r?.[0]?.id);
  return v > 0 ? v : null;
}

/** La venta de un pago (para los cambios de líneas de descuento/aumento). */
export async function ventaIdDePago(ds: DataSource | EntityManager, pagoId: number): Promise<number | null> {
  const r = await ds.query(`SELECT id FROM ventas WHERE pago_id = ${Number(pagoId) | 0} ORDER BY id DESC`);
  const v = Number(r?.[0]?.id);
  return v > 0 ? v : null;
}

/**
 * Antes de editar una venta: si tiene deuda a cuenta con cobros, se frena. Sin deuda (o sin
 * cobros) no hace nada.
 */
export async function verificarEdicionVentaConDeuda(ds: DataSource, ventaId: number | null | undefined): Promise<void> {
  if (!ventaId) return;
  const cpc = await cpcActivaDeVenta(ds.manager, ventaId);
  if (cpc && Number(cpc.montoCobrado) > 0.005) {
    throw new DeudaVentaError(ERROR_VENTA_DEUDA_COBRADA,
      `${ERROR_VENTA_DEUDA_COBRADA}: ${MENSAJE_VENTA_DEUDA_COBRADA}`);
  }
}

/** Total de la venta como lo ve el PdV: ítems activos + envío − descuento + aumento. */
async function totalVenta(m: EntityManager, ventaId: number, pagoId: number | null) {
  const [it] = await m.query(
    `SELECT COALESCE(SUM((COALESCE(precio_venta_unitario,0) + COALESCE(precio_adicionales,0) - COALESCE(descuento_unitario,0)) * COALESCE(cantidad,0)), 0) AS t
       FROM venta_items WHERE venta_id = ${ventaId | 0} AND estado = 'ACTIVO'`,
  );
  let total = Number(it?.t) || 0;
  const detalles = pagoId
    ? await m.getRepository(PagoDetalle).find({ where: { pago: { id: pagoId }, activo: true }, relations: ['formaPago', 'moneda'] })
    : [];
  return { items: total, detalles };
}

export interface ResultadoDeuda {
  cambio: boolean;
  anterior?: number;
  deuda?: number;
  /** Lo que quedó afuera por el tope: se cobra al entregar. */
  excedente?: number;
  cancelada?: boolean;
}

/**
 * Lleva la deuda de la venta al total actual. Idempotente: sin diferencia no escribe nada.
 * Se llama DESPUÉS de cada cambio que puede mover el total.
 */
export async function resincronizarDeudaVenta(ds: DataSource, ventaId: number | null | undefined, usuarioId?: number | null): Promise<ResultadoDeuda> {
  if (!ventaId) return { cambio: false };
  const previa = await cpcActivaDeVenta(ds.manager, ventaId);
  const clienteId = Number((previa as any)?.cliente?.id);
  if (!previa || !clienteId) return { cambio: false };
  return withClienteLock(clienteId, () => ds.transaction(async (m) => {
    const cliente = await clienteBloqueado(m, clienteId);
    const cpc = await cpcActivaDeVenta(m, ventaId);
    if (!cpc || !cliente) return { cambio: false };
    if (Number(cpc.montoCobrado) > 0.005) return { cambio: false };
    const venta = await m.getRepository(Venta).findOne({ where: { id: ventaId }, relations: ['pago'] });
    if (!venta || String(venta.estado) !== 'ABIERTA') return { cambio: false };

    const pagoId = (venta as any).pago?.id ?? null;
    const { items, detalles } = await totalVenta(m, ventaId, pagoId);
    const monedaCpc = (cpc as any).moneda?.id ?? null;
    let descuento = 0, aumento = 0, otrosPagos = 0;
    let lineaCredito: PagoDetalle | null = null;
    for (const d of detalles) {
      const v = Number(d.valor) || 0;
      if (d.tipo === TipoDetalle.DESCUENTO) descuento += v;
      else if (d.tipo === TipoDetalle.AUMENTO) aumento += v;
      else if (String((d as any).formaPago?.nombre || '').toUpperCase() === FORMA_PAGO_CREDITO) {
        if (!lineaCredito) lineaCredito = d;
      } else if (((d as any).moneda?.id ?? null) === monedaCpc) {
        // Lo que el cliente ya pagó por otro medio (misma moneda) no va a la cuenta.
        otrosPagos += v;
      }
    }
    const total = items + (Number(venta.costoDelivery) || 0) - descuento + aumento;
    const anterior = r2(Number(cpc.montoTotal) || 0);
    let objetivo = r2(Math.max(0, total - otrosPagos));
    let excedente = 0;
    if (objetivo > anterior) {
      // El saldo del cliente ya incluye esta deuda: puede subir hasta lo disponible.
      const est = await estadoCreditoCliente(m, cliente);
      const tope = r2(anterior + (est.habilitado ? est.disponible ?? 0 : 0));
      if (objetivo > tope) {
        excedente = r2(objetivo - tope);
        objetivo = tope;
      }
    }
    if (Math.abs(objetivo - anterior) < 0.005) return { cambio: false, anterior, deuda: anterior, excedente };

    const usuario = usuarioId ? ({ id: usuarioId } as any) : undefined;
    const ahora = new Date();
    const delta = r2(objetivo - anterior);
    const repoCpc = m.getRepository(CuentaPorCobrar);
    if (objetivo <= 0) {
      await repoCpc.update({ id: cpc.id }, {
        estado: CuentaPorCobrarEstado.CANCELADO, fechaCancelacion: ahora,
        motivoCancelacion: `VENTA #${ventaId} SIN SALDO TRAS EDITARLA`,
      } as any);
      await cancelarCuotasAbiertasDeCpc(m, cpc.id);
      if (lineaCredito) await m.getRepository(PagoDetalle).update({ id: lineaCredito.id }, { activo: false } as any);
    } else {
      await repoCpc.update({ id: cpc.id }, { montoTotal: objetivo } as any);
      const cuotas = await m.getRepository(CuentaPorCobrarCuota).find({ where: { cuentaPorCobrar: { id: cpc.id } }, order: { numero: 'ASC' } });
      const n = Math.max(1, cuotas.length);
      const base = r2(objetivo / n);
      for (let i = 0; i < cuotas.length; i++) {
        const monto = i === cuotas.length - 1 ? r2(objetivo - base * (n - 1)) : base;
        await m.getRepository(CuentaPorCobrarCuota).update({ id: cuotas[i].id }, { monto } as any);
      }
      if (lineaCredito) await m.getRepository(PagoDetalle).update({ id: lineaCredito.id }, { valor: objetivo } as any);
    }
    await m.getRepository(MovimientoCliente).save(m.getRepository(MovimientoCliente).create({
      cliente: { id: clienteId } as any,
      tipo: delta > 0 ? MovimientoClienteTipo.AJUSTE_POSITIVO : MovimientoClienteTipo.AJUSTE_NEGATIVO,
      monto: Math.abs(delta),
      fecha: ahora,
      ventaId,
      cuentaPorCobrarId: cpc.id,
      observacion: `VENTA #${ventaId} EDITADA: DEUDA ${anterior} → ${objetivo}`.slice(0, 255),
      registradoPor: usuario,
      createdBy: usuario,
    } as any));
    await ajustarSaldoCliente(m, clienteId, delta);
    return { cambio: true, anterior, deuda: objetivo, excedente, cancelada: objetivo <= 0 };
  }));
}

/**
 * Para los handlers: resincroniza sin romper el cambio ya hecho (si falla, queda en el log y el
 * personal ve la diferencia como saldo de la venta).
 */
export async function trasEditarVenta(ds: DataSource, ventaId: number | null | undefined, usuarioId?: number | null): Promise<void> {
  try {
    const r = await resincronizarDeudaVenta(ds, ventaId, usuarioId);
    if (r.excedente) console.warn(`[deuda-venta] venta ${ventaId}: ${r.excedente} quedan fuera del tope del cliente (se cobran al entregar)`);
  } catch (e: any) {
    console.error(`[deuda-venta] venta ${ventaId}: no se pudo ajustar la deuda:`, e?.message || e);
  }
}
