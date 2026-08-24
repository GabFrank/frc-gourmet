/**
 * Reversa completa de una venta: ítems, cobro, cuenta por cobrar y stock.
 *
 * POR QUÉ EXISTE
 *
 * Cancelar una venta ya cobrada estaba repartido en tres llamadas sueltas desde
 * el renderer (`updateVenta` + `revertirStockVenta` + la baja de la entidad de
 * turno), sin transacción y sin tocar el dinero: el `Pago` y sus `PagoDetalle`
 * quedaban `activo = true` colgando de una venta CANCELADA. `computeResumenCaja`
 * filtra las ventas por `estado = CONCLUIDA`, así que el efectivo esperado sí
 * bajaba, pero cualquier consumidor que parta del `Pago` (cobro parcial,
 * reportes por forma de pago) las seguía contando.
 *
 * Todo lo de acá corre dentro de un `EntityManager` transaccional provisto por
 * el llamador: o se revierte todo, o no se revierte nada.
 *
 * QUÉ NO HACE
 *
 * No devuelve plata a la caja ni genera un movimiento de egreso: la venta
 * cancelada simplemente deja de contar. El arqueo de la caja se calcula sobre
 * ventas CONCLUIDA, no sobre un ledger de movimientos, así que un asiento de
 * reversa duplicaría el efecto.
 */

import { DataSource, EntityManager } from 'typeorm';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { VentaItem, EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { PagoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { CobroParcial } from '../../src/app/database/entities/ventas/cobro-parcial.entity';
import {
  StockMovimiento,
  StockMovimientoTipoReferencia,
} from '../../src/app/database/entities/productos/stock-movimiento.entity';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import {
  CuentaPorCobrarEstado,
  MovimientoClienteTipo,
} from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { setEntityUserTracking } from './entity.utils';

export interface ReversaVentaResumen {
  itemsCancelados: number;
  pagoDetallesDesactivados: number;
  cobrosParcialesDesactivados: number;
  movimientosStockRevertidos: number;
  cpcRevertidaId: number | null;
}

/**
 * Verifica ANTES de tocar nada que la venta se pueda cancelar.
 *
 * Una CPC con cobros registrados no se puede revertir sola: hay plata cobrada
 * contra esa cuenta que habría que devolver. Mismo criterio que ya aplica
 * `updateVenta` para las ventas a crédito.
 *
 * @throws Error con mensaje para el usuario si la venta no es cancelable.
 */
export async function verificarVentaCancelable(
  manager: EntityManager,
  ventaId: number,
): Promise<void> {
  const cpc = await manager.getRepository(CuentaPorCobrar).findOne({
    where: { ventaId, estado: CuentaPorCobrarEstado.ACTIVO },
  });
  if (cpc && Number(cpc.montoCobrado) > 0) {
    throw new Error(
      'No se puede cancelar una venta a crédito con cobros registrados. Anule primero los cobros de la cuenta por cobrar.',
    );
  }
}

/**
 * Cancela la venta y revierte todo lo que generó: ítems, cobro, CPC y stock.
 *
 * Idempotente: si la venta ya está CANCELADA no vuelve a revertir nada (los
 * `activo = false` ya aplicados no se re-aplican y la CPC ya revertida se
 * saltea), así que un reintento tras un error de red no descuadra al cliente.
 */
export async function cancelarVentaCompletaEnTx(
  manager: EntityManager,
  dataSource: DataSource,
  ventaId: number,
  opts: { usuarioId?: number; motivo?: string } = {},
): Promise<ReversaVentaResumen> {
  const resumen: ReversaVentaResumen = {
    itemsCancelados: 0,
    pagoDetallesDesactivados: 0,
    cobrosParcialesDesactivados: 0,
    movimientosStockRevertidos: 0,
    cpcRevertidaId: null,
  };

  const venta = await manager.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['pago'],
  });
  if (!venta) throw new Error(`Venta ${ventaId} no encontrada`);

  const yaCancelada = venta.estado === VentaEstado.CANCELADA;
  const estabaCobrada = venta.estado === VentaEstado.CONCLUIDA;

  // 1 · Ítems activos → CANCELADO. Sin esto la venta cancelada sigue sumando en
  // cualquier lectura que recorra ítems por estado en vez de por venta.
  const items = await manager.getRepository(VentaItem).find({
    where: { venta: { id: ventaId }, estado: EstadoVentaItem.ACTIVO },
  });
  for (const item of items) {
    item.estado = EstadoVentaItem.CANCELADO;
    item.horaCancelado = new Date();
    item.montoCubierto = 0;
    await setEntityUserTracking(dataSource, item, opts.usuarioId, true);
  }
  if (items.length) await manager.save(VentaItem, items);
  resumen.itemsCancelados = items.length;

  // 2 · Cobro: baja lógica de las líneas de pago y de las rondas de cobro
  // parcial. `activo = false` es el mismo mecanismo que usa `anularCobroParcial`
  // y el que respeta `computeResumenCaja`.
  if (venta.pago?.id) {
    const detalles = await manager.getRepository(PagoDetalle).find({
      where: { pago: { id: venta.pago.id }, activo: true },
    });
    for (const d of detalles) d.activo = false;
    if (detalles.length) await manager.save(PagoDetalle, detalles);
    resumen.pagoDetallesDesactivados = detalles.length;
  }

  const rondas = await manager.getRepository(CobroParcial).find({
    where: { venta: { id: ventaId }, activo: true },
  });
  for (const r of rondas) r.activo = false;
  if (rondas.length) await manager.save(CobroParcial, rondas);
  resumen.cobrosParcialesDesactivados = rondas.length;

  // 3 · Cuenta por cobrar (venta a crédito) + saldo del cliente.
  const cpc = await manager.getRepository(CuentaPorCobrar).findOne({
    where: { ventaId, estado: CuentaPorCobrarEstado.ACTIVO },
    relations: ['cliente'],
  });
  if (cpc) {
    if (Number(cpc.montoCobrado) > 0) {
      throw new Error(
        'No se puede cancelar una venta a crédito con cobros registrados. Anule primero los cobros de la cuenta por cobrar.',
      );
    }
    const montoOriginal = Number(cpc.montoTotal);
    const clienteId = cpc.cliente?.id;

    cpc.estado = CuentaPorCobrarEstado.CANCELADO;
    cpc.fechaCancelacion = new Date();
    cpc.motivoCancelacion = (opts.motivo || 'CANCELACION DE VENTA').toUpperCase();
    await setEntityUserTracking(dataSource, cpc, opts.usuarioId, true);
    await manager.save(CuentaPorCobrar, cpc);
    resumen.cpcRevertidaId = cpc.id;

    if (clienteId) {
      const cliente = await manager.getRepository(Cliente).findOne({ where: { id: clienteId } });
      if (cliente) {
        cliente.saldoActual = +(Number(cliente.saldoActual) - montoOriginal).toFixed(2);
        await manager.save(Cliente, cliente);
      }
      const mov = manager.getRepository(MovimientoCliente).create({
        cliente: { id: clienteId } as any,
        tipo: MovimientoClienteTipo.AJUSTE_NEGATIVO,
        monto: montoOriginal,
        fecha: new Date(),
        cuentaPorCobrarId: cpc.id,
        ventaId,
        observacion: `CANCELACION VENTA #${ventaId} - REVERSION CPC #${cpc.id}`,
      });
      await setEntityUserTracking(dataSource, mov, opts.usuarioId, false);
      await manager.save(MovimientoCliente, mov);
    }
  }

  // 4 · Stock: sólo si la venta llegó a descontarlo. Los movimientos se dan de
  // baja lógica (dejan de contar en el cálculo de existencias).
  if (estabaCobrada || yaCancelada) {
    const movimientos = await manager.getRepository(StockMovimiento).find({
      where: {
        referencia: ventaId,
        tipoReferencia: StockMovimientoTipoReferencia.VENTA,
        activo: true,
      },
    });
    for (const mov of movimientos) mov.activo = false;
    if (movimientos.length) await manager.save(StockMovimiento, movimientos);
    resumen.movimientosStockRevertidos = movimientos.length;
  }

  // 5 · La venta.
  if (!yaCancelada) {
    venta.estado = VentaEstado.CANCELADA;
    await setEntityUserTracking(dataSource, venta, opts.usuarioId, true);
    await manager.save(Venta, venta);
  }

  return resumen;
}
