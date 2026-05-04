import { ipcMain } from 'electron';
import { DataSource, Brackets } from 'typeorm';
import { Proveedor } from '../../src/app/database/entities/compras/proveedor.entity';
import { Compra } from '../../src/app/database/entities/compras/compra.entity';
import { CompraDetalle } from '../../src/app/database/entities/compras/compra-detalle.entity';
import { Pago } from '../../src/app/database/entities/compras/pago.entity';
import { PagoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { ProveedorProducto } from '../../src/app/database/entities/compras/proveedor-producto.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { CompraEstado } from '../../src/app/database/entities/compras/estado.enum';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Presentacion } from '../../src/app/database/entities/productos/presentacion.entity';
import { PrecioCosto, FuenteCosto } from '../../src/app/database/entities/productos/precio-costo.entity';
import { StockMovimiento, StockMovimientoTipo, StockMovimientoTipoReferencia } from '../../src/app/database/entities/productos/stock-movimiento.entity';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import { CuentaPorPagarTipo, CuentaPorPagarEstado, CuotaEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';

// ===== Helpers internos =====

// Stock actual en unidad base = SUMA(movimientos activos) con signo segun tipo
async function getStockActualUnidadBase(qr: any, productoId: number): Promise<number> {
  const movs = await qr.manager
    .getRepository(StockMovimiento)
    .createQueryBuilder('m')
    .where('m.producto_id = :pid', { pid: productoId })
    .andWhere('m.activo = 1')
    .getMany();
  let total = 0;
  for (const m of movs) {
    const c = Number(m.cantidad);
    switch (m.tipo) {
      case StockMovimientoTipo.COMPRA:
      case StockMovimientoTipo.AJUSTE_POSITIVO:
      case StockMovimientoTipo.PRODUCCION_ENTRADA:
        total += c; break;
      case StockMovimientoTipo.VENTA:
      case StockMovimientoTipo.AJUSTE_NEGATIVO:
      case StockMovimientoTipo.DESCARTE:
      case StockMovimientoTipo.PRODUCCION_SALIDA:
        total -= c; break;
      case StockMovimientoTipo.TRANSFERENCIA:
        // Transferencia neutra a nivel producto
        break;
    }
  }
  return total;
}

// Ultimo PrecioCosto activo del producto (en unidad base)
async function getCostoActivoActual(qr: any, productoId: number): Promise<number | null> {
  const pc = await qr.manager
    .getRepository(PrecioCosto)
    .createQueryBuilder('pc')
    .where('pc.producto_id = :pid', { pid: productoId })
    .andWhere('pc.activo = 1')
    .orderBy('pc.id', 'DESC')
    .getOne();
  return pc ? Number(pc.valor) : null;
}

// Aplica costo promedio ponderado: desactiva el costo previo y crea uno nuevo con fuente=COMPRA.
// stockAnterior+cantidadAgregada (en unidad base) y costoAnterior+costoAgregado (en moneda/unidadBase).
async function aplicarCostoPromedioPonderado(
  qr: any,
  productoId: number,
  cantidadAgregada: number,
  costoAgregadoUnidadBase: number,
  monedaId: number,
  fecha: Date,
  userId: number | undefined,
): Promise<void> {
  const stockActual = await getStockActualUnidadBase(qr, productoId);
  const costoActual = await getCostoActivoActual(qr, productoId);

  let nuevoCosto: number;
  if (stockActual <= 0 || costoActual === null) {
    nuevoCosto = costoAgregadoUnidadBase;
  } else {
    const totalValor = stockActual * costoActual + cantidadAgregada * costoAgregadoUnidadBase;
    const totalUnidades = stockActual + cantidadAgregada;
    nuevoCosto = totalUnidades > 0 ? totalValor / totalUnidades : costoAgregadoUnidadBase;
  }
  nuevoCosto = +nuevoCosto.toFixed(2);

  // Desactivar el costo activo previo
  await qr.manager
    .getRepository(PrecioCosto)
    .createQueryBuilder()
    .update(PrecioCosto)
    .set({ activo: false })
    .where('producto_id = :pid AND activo = 1', { pid: productoId })
    .execute();

  // Crear nuevo costo activo
  const pc = qr.manager.create(PrecioCosto, {
    fuente: FuenteCosto.COMPRA,
    valor: nuevoCosto,
    fecha,
    activo: true,
    producto: { id: productoId } as any,
    moneda: { id: monedaId } as any,
  });
  await setEntityUserTracking(qr.connection, pc, userId, false);
  await qr.manager.save(PrecioCosto, pc);
}

// Upsert ProveedorProducto (proveedor+producto) actualizando ultimo costo y fecha
async function upsertProveedorProducto(
  qr: any,
  proveedorId: number,
  productoId: number,
  ultimoCostoUnitario: number,
  ultimaCompraFecha: Date,
  compraId: number,
  userId: number | undefined,
): Promise<void> {
  const repo = qr.manager.getRepository(ProveedorProducto);
  let pp = await repo.findOne({
    where: { proveedor: { id: proveedorId }, producto: { id: productoId } } as any,
  });
  if (pp) {
    pp.ultimoCostoUnitario = ultimoCostoUnitario;
    pp.ultimaCompraFecha = ultimaCompraFecha;
    pp.compra = { id: compraId } as any;
    pp.activo = true;
    await setEntityUserTracking(qr.connection, pp, userId, true);
    await repo.save(pp);
  } else {
    pp = repo.create({
      proveedor: { id: proveedorId } as any,
      producto: { id: productoId } as any,
      ultimoCostoUnitario,
      ultimaCompraFecha,
      compra: { id: compraId } as any,
      activo: true,
    });
    await setEntityUserTracking(qr.connection, pp, userId, false);
    await repo.save(pp);
  }
}

// Genera N cuotas mensuales para un CPP dentro de la transaccion
async function generarCuotasMensualesCPP(
  qr: any,
  cppId: number,
  montoTotal: number,
  cantidadCuotas: number,
  fechaInicio: Date,
  userId: number | undefined,
): Promise<void> {
  const cuotaRepo = qr.manager.getRepository(CuentaPorPagarCuota);
  const montoCuota = +(montoTotal / cantidadCuotas).toFixed(2);
  for (let i = 0; i < cantidadCuotas; i++) {
    const venc = new Date(fechaInicio);
    venc.setMonth(venc.getMonth() + i);
    const monto = (i === cantidadCuotas - 1)
      ? +(montoTotal - montoCuota * (cantidadCuotas - 1)).toFixed(2)
      : montoCuota;
    const cuota = cuotaRepo.create({
      cuentaPorPagar: { id: cppId } as any,
      numero: i + 1,
      fechaVencimiento: venc,
      monto,
      montoPagado: 0,
      estado: CuotaEstado.PENDIENTE,
    });
    await setEntityUserTracking(qr.connection, cuota, userId, false);
    await cuotaRepo.save(cuota);
  }
}

// Recalcula y persiste el total de la compra en base a sus detalles activos
async function recalcularTotalCompra(qr: any, compraId: number): Promise<number> {
  const detalles = await qr.manager
    .getRepository(CompraDetalle)
    .find({ where: { compra: { id: compraId }, activo: true } as any });
  const total = detalles.reduce((sum: number, d: any) => sum + Number(d.subtotal), 0);
  await qr.manager
    .getRepository(Compra)
    .createQueryBuilder()
    .update(Compra)
    .set({ total: +total.toFixed(2) })
    .where('id = :id', { id: compraId })
    .execute();
  return +total.toFixed(2);
}

export function registerComprasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {

  // ===================== PROVEEDORES =====================
  ipcMain.handle('getProveedores', async () => {
    const repo = dataSource.getRepository(Proveedor);
    return await repo.find({ relations: ['persona'], order: { nombre: 'ASC' } });
  });

  ipcMain.handle('getProveedor', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(Proveedor);
    return await repo.findOne({ where: { id }, relations: ['persona'] });
  });

  ipcMain.handle('createProveedor', async (_event: any, data: any) => {
    const repo = dataSource.getRepository(Proveedor);
    const entity = repo.create(data);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    const saved = await repo.save(entity) as unknown as Proveedor;
    if (!saved?.id) throw new Error('No se pudo guardar el proveedor.');
    return await repo.findOne({ where: { id: saved.id }, relations: ['persona'] });
  });

  ipcMain.handle('updateProveedor', async (_event: any, id: number, data: any) => {
    const repo = dataSource.getRepository(Proveedor);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`Proveedor ID ${id} not found`);
    repo.merge(entity, data);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    await repo.save(entity);
    return await repo.findOne({ where: { id }, relations: ['persona'] });
  });

  ipcMain.handle('deleteProveedor', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(Proveedor);
    const compraRepo = dataSource.getRepository(Compra);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`Proveedor ID ${id} not found`);
    const comprasCount = await compraRepo.count({ where: { proveedor: { id } } });
    if (comprasCount > 0) {
      throw new Error('No se puede eliminar el proveedor porque tiene compras asociadas. Considere desactivarlo.');
    }
    await repo.remove(entity);
    return { success: true, affected: 1 };
  });

  // CompraCategoria handlers viven en cuentas-por-pagar.handler.ts (legacy ubicacion).

  // ===================== COMPRAS — listado + detalle =====================
  // Listado paginado con filtros
  ipcMain.handle('get-compras-paginado', async (_event: any, params: any = {}) => {
    const repo = dataSource.getRepository(Compra);
    const qb = repo.createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'p')
      .leftJoinAndSelect('p.persona', 'pe')
      .leftJoinAndSelect('c.compraCategoria', 'cc')
      .leftJoinAndSelect('c.moneda', 'm')
      .leftJoinAndSelect('c.formaPago', 'fp');

    if (params.proveedorId) qb.andWhere('c.proveedor.id = :pid', { pid: params.proveedorId });
    if (params.estado) qb.andWhere('c.estado = :estado', { estado: params.estado });
    if (params.compraCategoriaId) qb.andWhere('c.compraCategoria.id = :ccid', { ccid: params.compraCategoriaId });
    if (params.credito === true || params.credito === false) {
      qb.andWhere('c.credito = :cr', { cr: params.credito ? 1 : 0 });
    }
    if (params.fechaDesde) qb.andWhere('c.fechaCompra >= :fd', { fd: params.fechaDesde });
    if (params.fechaHasta) qb.andWhere('c.fechaCompra <= :fh', { fh: params.fechaHasta });
    if (params.search) {
      qb.andWhere(new Brackets(b => {
        b.where('LOWER(c.numeroNota) LIKE :q', { q: `%${String(params.search).toLowerCase()}%` })
         .orWhere('LOWER(p.nombre) LIKE :q', { q: `%${String(params.search).toLowerCase()}%` });
      }));
    }
    qb.orderBy('c.id', 'DESC');

    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Math.min(200, Number(params.pageSize) || 25));
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  });

  // Listado simple (legacy)
  ipcMain.handle('getCompras', async () => {
    const repo = dataSource.getRepository(Compra);
    return await repo.find({
      relations: ['proveedor', 'proveedor.persona', 'moneda', 'formaPago', 'compraCategoria', 'detalles', 'detalles.producto', 'detalles.presentacion'],
      order: { id: 'DESC' },
      take: 100,
    });
  });

  ipcMain.handle('getCompra', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(Compra);
    const compra = await repo.findOne({
      where: { id },
      relations: [
        'proveedor', 'proveedor.persona',
        'moneda', 'formaPago', 'compraCategoria',
        'detalles', 'detalles.producto', 'detalles.presentacion',
        'cuentaPorPagar',
      ],
    });
    if (!compra) throw new Error(`Compra ID ${id} not found`);
    return compra;
  });

  // ===================== COMPRAS — workflow =====================
  // Crea compra en estado ABIERTO con sus detalles. NO impacta stock/caja/CPP.
  ipcMain.handle('create-compra-borrador', async (_event: any, data: any) => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const compra = qr.manager.create(Compra, {
        estado: CompraEstado.ABIERTO,
        isRecepcionMercaderia: data.isRecepcionMercaderia ?? false,
        activo: true,
        numeroNota: data.numeroNota?.toUpperCase() || null,
        tipoBoleta: data.tipoBoleta || null,
        fechaCompra: data.fechaCompra ? new Date(data.fechaCompra) : new Date(),
        credito: !!data.credito,
        plazoDias: data.plazoDias ?? null,
        proveedor: data.proveedorId ? { id: data.proveedorId } as any : null,
        compraCategoria: data.compraCategoriaId ? { id: data.compraCategoriaId } as any : null,
        moneda: { id: data.monedaId } as any,
        formaPago: data.formaPagoId ? { id: data.formaPagoId } as any : null,
        total: 0,
      });
      await setEntityUserTracking(dataSource, compra, userId, false);
      const saved = await qr.manager.save(Compra, compra);

      // Crear detalles
      const detalles = data.detalles || [];
      let total = 0;
      for (const d of detalles) {
        const presentacionFactor = d.presentacionId
          ? await getPresentacionFactor(qr, d.presentacionId)
          : 1;
        const cantidad = Number(d.cantidad);
        const costoUnitario = Number(d.costoUnitarioPresentacion);
        const subtotal = +(cantidad * costoUnitario).toFixed(2);
        const cantidadUB = +(cantidad * presentacionFactor).toFixed(3);
        total += subtotal;
        const det = qr.manager.create(CompraDetalle, {
          compra: { id: saved.id } as any,
          producto: { id: d.productoId } as any,
          presentacion: d.presentacionId ? { id: d.presentacionId } as any : null,
          cantidad,
          costoUnitarioPresentacion: costoUnitario,
          subtotal,
          cantidadUnidadBase: cantidadUB,
          activo: true,
        });
        await setEntityUserTracking(dataSource, det, userId, false);
        await qr.manager.save(CompraDetalle, det);
      }
      await qr.manager
        .getRepository(Compra)
        .createQueryBuilder()
        .update(Compra)
        .set({ total: +total.toFixed(2) })
        .where('id = :id', { id: saved.id })
        .execute();

      await qr.commitTransaction();
      return await dataSource.getRepository(Compra).findOne({
        where: { id: saved.id },
        relations: ['proveedor', 'proveedor.persona', 'moneda', 'formaPago', 'compraCategoria', 'detalles', 'detalles.producto', 'detalles.presentacion'],
      });
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // Actualiza cabecera y reemplaza detalles. Solo permitido si estado=ABIERTO.
  ipcMain.handle('update-compra-borrador', async (_event: any, id: number, data: any) => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const compra = await qr.manager.getRepository(Compra).findOne({ where: { id } });
      if (!compra) throw new Error(`Compra ID ${id} not found`);
      if (compra.estado !== CompraEstado.ABIERTO) {
        throw new Error('Solo se pueden editar compras en estado ABIERTO (borrador).');
      }

      // Actualizar cabecera
      if (data.numeroNota !== undefined) compra.numeroNota = data.numeroNota?.toUpperCase() || undefined;
      if (data.tipoBoleta !== undefined) compra.tipoBoleta = data.tipoBoleta || undefined;
      if (data.fechaCompra !== undefined) compra.fechaCompra = data.fechaCompra ? new Date(data.fechaCompra) : undefined;
      if (data.credito !== undefined) compra.credito = !!data.credito;
      if (data.plazoDias !== undefined) compra.plazoDias = data.plazoDias ?? undefined;
      if (data.proveedorId !== undefined) compra.proveedor = data.proveedorId ? { id: data.proveedorId } as any : undefined;
      if (data.compraCategoriaId !== undefined) compra.compraCategoria = data.compraCategoriaId ? { id: data.compraCategoriaId } as any : null;
      if (data.monedaId !== undefined) compra.moneda = { id: data.monedaId } as any;
      if (data.formaPagoId !== undefined) compra.formaPago = data.formaPagoId ? { id: data.formaPagoId } as any : undefined;
      await setEntityUserTracking(dataSource, compra, userId, true);
      await qr.manager.save(Compra, compra);

      // Reemplazar detalles si vienen en el payload
      if (Array.isArray(data.detalles)) {
        await qr.manager
          .getRepository(CompraDetalle)
          .createQueryBuilder()
          .delete()
          .from(CompraDetalle)
          .where('compra_id = :cid', { cid: id })
          .execute();

        let total = 0;
        for (const d of data.detalles) {
          const presentacionFactor = d.presentacionId
            ? await getPresentacionFactor(qr, d.presentacionId)
            : 1;
          const cantidad = Number(d.cantidad);
          const costoUnitario = Number(d.costoUnitarioPresentacion);
          const subtotal = +(cantidad * costoUnitario).toFixed(2);
          const cantidadUB = +(cantidad * presentacionFactor).toFixed(3);
          total += subtotal;
          const det = qr.manager.create(CompraDetalle, {
            compra: { id } as any,
            producto: { id: d.productoId } as any,
            presentacion: d.presentacionId ? { id: d.presentacionId } as any : null,
            cantidad,
            costoUnitarioPresentacion: costoUnitario,
            subtotal,
            cantidadUnidadBase: cantidadUB,
            activo: true,
          });
          await setEntityUserTracking(dataSource, det, userId, false);
          await qr.manager.save(CompraDetalle, det);
        }
        await qr.manager
          .getRepository(Compra)
          .createQueryBuilder()
          .update(Compra)
          .set({ total: +total.toFixed(2) })
          .where('id = :id', { id })
          .execute();
      } else {
        await recalcularTotalCompra(qr, id);
      }

      await qr.commitTransaction();
      return await dataSource.getRepository(Compra).findOne({
        where: { id },
        relations: ['proveedor', 'proveedor.persona', 'moneda', 'formaPago', 'compraCategoria', 'detalles', 'detalles.producto', 'detalles.presentacion'],
      });
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // Finaliza una compra: impacta stock + costo + caja mayor (contado) o CPP (credito)
  // payload: { cajaMayorId?, formaPagoId?, fechaCreditoInicio?, cantidadCuotas? }
  ipcMain.handle('finalizar-compra', async (_event: any, id: number, payload: any = {}) => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const compraRepo = qr.manager.getRepository(Compra);
      const compra = await compraRepo.findOne({
        where: { id },
        relations: ['proveedor', 'moneda', 'formaPago', 'detalles', 'detalles.producto', 'detalles.presentacion'],
      });
      if (!compra) throw new Error(`Compra ID ${id} not found`);
      if (compra.estado !== CompraEstado.ABIERTO) {
        throw new Error(`Solo se puede finalizar una compra en estado ABIERTO (estado actual: ${compra.estado}).`);
      }
      if (!compra.detalles || compra.detalles.length === 0) {
        throw new Error('La compra no tiene detalles.');
      }
      if (!compra.proveedor?.id) {
        throw new Error('La compra no tiene proveedor.');
      }

      // Recalcular total para asegurar consistencia
      let total = 0;
      for (const d of compra.detalles) total += Number(d.subtotal);
      total = +total.toFixed(2);

      const fecha = compra.fechaCompra || new Date();
      const monedaId = compra.moneda.id;

      // 1. Por cada detalle: stock + costo promedio + ProveedorProducto upsert
      for (const det of compra.detalles) {
        const productoId = det.producto.id;
        const cantidadUB = Number(det.cantidadUnidadBase);
        const presentacionCantidad = det.presentacion?.cantidad ? Number(det.presentacion.cantidad) : 1;
        const costoUnitarioUB = presentacionCantidad > 0
          ? Number(det.costoUnitarioPresentacion) / presentacionCantidad
          : Number(det.costoUnitarioPresentacion);

        // Stock movement (solo si producto controla stock)
        if (det.producto.controlaStock) {
          const sm = qr.manager.create(StockMovimiento, {
            cantidad: cantidadUB,
            tipo: StockMovimientoTipo.COMPRA,
            tipoReferencia: StockMovimientoTipoReferencia.COMPRA,
            referencia: id,
            fecha,
            activo: true,
            observaciones: `COMPRA #${id} — ${compra.proveedor?.nombre || ''}`.toUpperCase(),
            producto: { id: productoId } as any,
          });
          await setEntityUserTracking(dataSource, sm, userId, false);
          await qr.manager.save(StockMovimiento, sm);
        }

        // Costo promedio ponderado
        await aplicarCostoPromedioPonderado(qr, productoId, cantidadUB, +costoUnitarioUB.toFixed(2), monedaId, fecha, userId);

        // ProveedorProducto upsert
        await upsertProveedorProducto(qr, compra.proveedor.id, productoId, Number(det.costoUnitarioPresentacion), fecha, id, userId);
      }

      // 2. Pago: contado (caja mayor) o credito (CPP)
      if (compra.credito) {
        const fechaInicio = payload.fechaCreditoInicio ? new Date(payload.fechaCreditoInicio) : fecha;
        const cantidadCuotas = Math.max(1, Number(payload.cantidadCuotas) || 1);
        const cppEntity = qr.manager.create(CuentaPorPagar, {
          descripcion: `COMPRA #${id} — ${compra.proveedor?.nombre || ''}`.toUpperCase(),
          tipo: CuentaPorPagarTipo.COMPRA,
          proveedor: { id: compra.proveedor.id } as any,
          montoTotal: total,
          montoPagado: 0,
          moneda: { id: monedaId } as any,
          fechaInicio,
          cantidadCuotas,
          estado: CuentaPorPagarEstado.ACTIVO,
          observacion: compra.numeroNota ? `NOTA ${compra.numeroNota}` : null,
          compraId: id,
        });
        await setEntityUserTracking(dataSource, cppEntity, userId, false);
        const cppSaved = await qr.manager.save(CuentaPorPagar, cppEntity);
        const cppId = (Array.isArray(cppSaved) ? cppSaved[0] : cppSaved).id;

        await generarCuotasMensualesCPP(qr, cppId, total, cantidadCuotas, fechaInicio, userId);

        compra.cuentaPorPagar = { id: cppId } as any;
      } else {
        // Contado: requiere cajaMayorId + formaPagoId
        const cajaMayorId = Number(payload.cajaMayorId);
        const formaPagoId = Number(payload.formaPagoId || compra.formaPago?.id);
        if (!cajaMayorId || !formaPagoId) {
          throw new Error('Para compras al contado se requieren cajaMayorId y formaPagoId.');
        }
        const cu = getCurrentUser();
        const movimiento = qr.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId } as any,
          tipoMovimiento: TipoMovimiento.EGRESO_COMPRA,
          moneda: { id: monedaId } as any,
          formaPago: { id: formaPagoId } as any,
          monto: total,
          fecha,
          observacion: `COMPRA #${id} — ${compra.proveedor?.nombre || ''}`.toUpperCase(),
          compraId: id,
        });
        if (cu) movimiento.responsable = cu;
        await setEntityUserTracking(dataSource, movimiento, userId, false);
        await qr.manager.save(CajaMayorMovimiento, movimiento);
        await actualizarSaldoCajaMayor(qr, cajaMayorId, monedaId, formaPagoId, total, TipoMovimiento.EGRESO_COMPRA);

        compra.formaPago = { id: formaPagoId } as any;
      }

      // 3. Marcar como FINALIZADO
      compra.total = total;
      compra.estado = CompraEstado.FINALIZADO;
      await setEntityUserTracking(dataSource, compra, userId, true);
      await qr.manager.save(Compra, compra);

      await qr.commitTransaction();
      return await dataSource.getRepository(Compra).findOne({
        where: { id },
        relations: ['proveedor', 'proveedor.persona', 'moneda', 'formaPago', 'compraCategoria', 'detalles', 'detalles.producto', 'detalles.presentacion', 'cuentaPorPagar'],
      });
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // Anula una compra. Si estaba ABIERTO solo marca CANCELADO. Si estaba FINALIZADO revierte stock+caja+CPP.
  ipcMain.handle('anular-compra', async (_event: any, id: number, motivo: string) => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const cu = getCurrentUser();
      const compraRepo = qr.manager.getRepository(Compra);
      const compra = await compraRepo.findOne({
        where: { id },
        relations: ['proveedor', 'moneda', 'formaPago', 'detalles', 'detalles.producto', 'cuentaPorPagar'],
      });
      if (!compra) throw new Error(`Compra ID ${id} not found`);
      if (compra.estado === CompraEstado.CANCELADO) throw new Error('La compra ya esta anulada.');

      const eraFinalizada = compra.estado === CompraEstado.FINALIZADO;

      if (eraFinalizada) {
        // Si tiene CPP a credito: validar que ninguna cuota este pagada (parcial o total)
        if (compra.cuentaPorPagar?.id) {
          const cuotas = await qr.manager.getRepository(CuentaPorPagarCuota).find({
            where: { cuentaPorPagar: { id: compra.cuentaPorPagar.id } } as any,
          });
          const algunaPagada = cuotas.some((c: any) =>
            Number(c.montoPagado) > 0 || c.estado === CuotaEstado.PAGADA || c.estado === CuotaEstado.PARCIAL
          );
          if (algunaPagada) {
            throw new Error('No se puede anular: la cuenta por pagar tiene cuotas pagadas. Cancele las cuotas pagadas primero.');
          }

          // Marcar CPP como CANCELADO y cuotas pendientes como CANCELADA
          await qr.manager.getRepository(CuentaPorPagarCuota)
            .createQueryBuilder()
            .update(CuentaPorPagarCuota)
            .set({ estado: CuotaEstado.CANCELADA })
            .where('cuenta_por_pagar_id = :cppId AND estado = :pendiente', {
              cppId: compra.cuentaPorPagar.id,
              pendiente: CuotaEstado.PENDIENTE,
            })
            .execute();
          const cppRepo = qr.manager.getRepository(CuentaPorPagar);
          const cpp = await cppRepo.findOne({ where: { id: compra.cuentaPorPagar.id } });
          if (cpp) {
            cpp.estado = CuentaPorPagarEstado.CANCELADO;
            await setEntityUserTracking(dataSource, cpp, userId, true);
            await cppRepo.save(cpp);
          }
        }

        // Si era contado: buscar movimiento original y crear contra-movimiento
        const movRepo = qr.manager.getRepository(CajaMayorMovimiento);
        const movOriginal = await movRepo.findOne({
          where: { compraId: id, tipoMovimiento: TipoMovimiento.EGRESO_COMPRA } as any,
          relations: ['cajaMayor', 'moneda', 'formaPago'],
        });
        if (movOriginal) {
          const yaAnulado = await movRepo.findOne({
            where: { referenciaAnulacion: { id: movOriginal.id } as any } as any,
          });
          if (!yaAnulado) {
            const contra = qr.manager.create(CajaMayorMovimiento, {
              cajaMayor: movOriginal.cajaMayor,
              tipoMovimiento: TipoMovimiento.ANULACION,
              moneda: movOriginal.moneda,
              formaPago: movOriginal.formaPago,
              monto: movOriginal.monto,
              fecha: new Date(),
              observacion: `ANULACION COMPRA #${id}: ${motivo || ''}`.toUpperCase(),
              referenciaAnulacion: movOriginal,
              compraId: id,
            });
            if (cu) contra.responsable = cu;
            await setEntityUserTracking(dataSource, contra, userId, false);
            await qr.manager.save(CajaMayorMovimiento, contra);
            // Restituir saldo: el original era egreso, ajuste positivo
            await actualizarSaldoCajaMayor(
              qr,
              movOriginal.cajaMayor.id,
              movOriginal.moneda.id,
              movOriginal.formaPago.id,
              Number(movOriginal.monto),
              TipoMovimiento.AJUSTE_POSITIVO,
            );
          }
        }

        // Revertir stock por cada detalle (solo los que controlan stock)
        for (const det of compra.detalles || []) {
          if (!det.producto?.controlaStock) continue;
          const sm = qr.manager.create(StockMovimiento, {
            cantidad: Number(det.cantidadUnidadBase),
            tipo: StockMovimientoTipo.AJUSTE_NEGATIVO,
            tipoReferencia: StockMovimientoTipoReferencia.AJUSTE,
            referencia: id,
            fecha: new Date(),
            activo: true,
            observaciones: `ANULACION COMPRA #${id}`.toUpperCase(),
            producto: { id: det.producto.id } as any,
          });
          await setEntityUserTracking(dataSource, sm, userId, false);
          await qr.manager.save(StockMovimiento, sm);
        }
      }

      compra.estado = CompraEstado.CANCELADO;
      compra.motivoAnulacion = (motivo || '').toUpperCase() || undefined;
      await setEntityUserTracking(dataSource, compra, userId, true);
      await qr.manager.save(Compra, compra);

      await qr.commitTransaction();
      return { success: true };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // ===================== COMPRA — handlers legacy (mantener por compat) =====================
  ipcMain.handle('createCompra', async (_event: any, data: any) => {
    const repo = dataSource.getRepository(Compra);
    const { detalles, ...rest } = data;
    const entity = repo.create(rest);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('updateCompra', async (_event: any, id: number, data: any) => {
    const repo = dataSource.getRepository(Compra);
    const { detalles, ...rest } = data;
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`Compra ID ${id} not found`);
    repo.merge(entity, rest);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    return await repo.save(entity);
  });

  ipcMain.handle('deleteCompra', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(Compra);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`Compra ID ${id} not found`);
    entity.activo = false;
    entity.estado = CompraEstado.CANCELADO;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    await repo.save(entity);
    return { success: true, affected: 1 };
  });

  // ===================== COMPRA DETALLE — legacy individual handlers =====================
  ipcMain.handle('getCompraDetalles', async (_event: any, compraId: number) => {
    const repo = dataSource.getRepository(CompraDetalle);
    return await repo.find({
      where: { compra: { id: compraId } as any },
      relations: ['producto', 'presentacion'],
      order: { id: 'ASC' },
    });
  });

  ipcMain.handle('createCompraDetalle', async (_event: any, data: any) => {
    const repo = dataSource.getRepository(CompraDetalle);
    const entity = repo.create(data);
    return await repo.save(entity);
  });

  ipcMain.handle('updateCompraDetalle', async (_event: any, id: number, data: any) => {
    const repo = dataSource.getRepository(CompraDetalle);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`CompraDetalle ID ${id} not found`);
    repo.merge(entity, data);
    return await repo.save(entity);
  });

  ipcMain.handle('deleteCompraDetalle', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(CompraDetalle);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`CompraDetalle ID ${id} not found`);
    await repo.remove(entity);
    return { success: true };
  });

  // ===================== PROVEEDOR PRODUCTO =====================
  ipcMain.handle('getProveedorProductos', async (_event: any, proveedorId: number) => {
    const repo = dataSource.getRepository(ProveedorProducto);
    return await repo.find({
      where: { proveedor: { id: proveedorId }, activo: true } as any,
      relations: ['producto', 'compra'],
      order: { ultimaCompraFecha: 'DESC' },
    });
  });

  ipcMain.handle('getProveedorProducto', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(ProveedorProducto);
    return await repo.findOne({ where: { id }, relations: ['proveedor', 'producto', 'compra'] });
  });

  ipcMain.handle('createProveedorProducto', async (_event: any, data: any) => {
    const repo = dataSource.getRepository(ProveedorProducto);
    const entity = repo.create(data);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('updateProveedorProducto', async (_event: any, id: number, data: any) => {
    const repo = dataSource.getRepository(ProveedorProducto);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`ProveedorProducto ID ${id} not found`);
    repo.merge(entity, data);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    return await repo.save(entity);
  });

  ipcMain.handle('deleteProveedorProducto', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(ProveedorProducto);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`ProveedorProducto ID ${id} not found`);
    entity.activo = false;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    await repo.save(entity);
    return { success: true, affected: 1 };
  });

  // ===================== FORMAS DE PAGO =====================
  ipcMain.handle('getFormasPago', async () => {
    const repo = dataSource.getRepository(FormasPago);
    return await repo.find({
      where: { activo: true },
      relations: [
        'maquinasPos',
        'maquinasPos.cuentaBancaria',
        'maquinasPos.cuentaBancaria.moneda',
        'cuentasBancarias',
        'cuentasBancarias.moneda',
      ],
    });
  });

  ipcMain.handle('getFormaPago', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(FormasPago);
    return await repo.findOneBy({ id });
  });

  ipcMain.handle('createFormaPago', async (_event: any, data: any) => {
    const repo = dataSource.getRepository(FormasPago);
    const { maquinasPosIds, cuentasBancariasIds, ...rest } = data || {};
    const entity = repo.create(rest);
    if (Array.isArray(maquinasPosIds)) (entity as any).maquinasPos = maquinasPosIds.map((id: number) => ({ id }));
    if (Array.isArray(cuentasBancariasIds)) (entity as any).cuentasBancarias = cuentasBancariasIds.map((id: number) => ({ id }));
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('updateFormaPago', async (_event: any, id: number, data: any) => {
    const repo = dataSource.getRepository(FormasPago);
    const entity = await repo.findOne({ where: { id }, relations: ['maquinasPos', 'cuentasBancarias'] });
    if (!entity) throw new Error(`FormaPago ID ${id} not found`);
    const { maquinasPosIds, cuentasBancariasIds, ...rest } = data || {};
    repo.merge(entity, rest);
    if (Array.isArray(maquinasPosIds)) (entity as any).maquinasPos = maquinasPosIds.map((mid: number) => ({ id: mid }));
    if (Array.isArray(cuentasBancariasIds)) (entity as any).cuentasBancarias = cuentasBancariasIds.map((cid: number) => ({ id: cid }));
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    return await repo.save(entity);
  });

  ipcMain.handle('deleteFormaPago', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(FormasPago);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`FormaPago ID ${id} not found`);
    entity.activo = false;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    await repo.save(entity);
    return { success: true, affected: 1 };
  });

  // ===================== PAGO / PAGO DETALLE — legacy (deprecadas) =====================
  ipcMain.handle('getPagos', async () => {
    const repo = dataSource.getRepository(Pago);
    return await repo.find({ relations: ['caja', 'detalles', 'compras', 'createdBy', 'updatedBy'] });
  });

  ipcMain.handle('getPago', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(Pago);
    return await repo.findOne({ where: { id }, relations: ['caja', 'detalles', 'compras', 'createdBy', 'updatedBy'] });
  });

  ipcMain.handle('createPago', async (_event: any, data: any) => {
    const repo = dataSource.getRepository(Pago);
    const entity = repo.create(data);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('updatePago', async (_event: any, id: number, data: any) => {
    const repo = dataSource.getRepository(Pago);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`Pago ID ${id} not found`);
    repo.merge(entity, data);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    return await repo.save(entity);
  });

  ipcMain.handle('deletePago', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(Pago);
    const entity = await repo.findOne({ where: { id }, relations: ['detalles'] });
    if (!entity) throw new Error(`Pago ID ${id} not found`);
    if (entity.detalles?.length) {
      await dataSource.getRepository(PagoDetalle).remove(entity.detalles);
    }
    await repo.remove(entity);
    return { success: true, affected: 1 };
  });

  ipcMain.handle('getPagoDetalles', async (_event: any, pagoId: number) => {
    const repo = dataSource.getRepository(PagoDetalle);
    return await repo.find({ where: { pago: { id: pagoId } as any }, relations: ['moneda', 'formaPago'], order: { id: 'ASC' } });
  });

  ipcMain.handle('createPagoDetalle', async (_event: any, data: any) => {
    const repo = dataSource.getRepository(PagoDetalle);
    return await repo.save(repo.create(data));
  });

  ipcMain.handle('updatePagoDetalle', async (_event: any, id: number, data: any) => {
    const repo = dataSource.getRepository(PagoDetalle);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`PagoDetalle ID ${id} not found`);
    repo.merge(entity, data);
    return await repo.save(entity);
  });

  ipcMain.handle('deletePagoDetalle', async (_event: any, id: number) => {
    const repo = dataSource.getRepository(PagoDetalle);
    const entity = await repo.findOneBy({ id });
    if (!entity) throw new Error(`PagoDetalle ID ${id} not found`);
    await repo.remove(entity);
    return { success: true, affected: 1 };
  });
}

// Helper local de presentacion
async function getPresentacionFactor(qr: any, presentacionId: number): Promise<number> {
  const p = await qr.manager.getRepository(Presentacion).findOne({ where: { id: presentacionId } });
  if (!p) return 1;
  const c = Number(p.cantidad);
  return c > 0 ? c : 1;
}
