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
import { resolveRequestDeviceId } from '../utils/current-device.utils';
import { parseLocalDate } from '../utils/date.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { ensurePermission } from '../utils/auth.utils';

// ===== Helpers internos =====

// Stock actual en unidad base = SUMA(movimientos activos) con signo segun tipo
async function getStockActualUnidadBase(qr: any, productoId: number): Promise<number> {
  const movs = await qr.manager
    .getRepository(StockMovimiento)
    .createQueryBuilder('m')
    .where('m.producto_id = :pid', { pid: productoId })
    .andWhere('m.activo = true')
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
    .andWhere('pc.activo = true')
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
    .where('producto_id = :pid AND activo = true', { pid: productoId })
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
  // Defensive: fechaInicio puede venir como string si proviene de compra.fechaCompra leida de BD (columna 'date')
  const fechaInicioDate = parseLocalDate(fechaInicio) || new Date();
  for (let i = 0; i < cantidadCuotas; i++) {
    const venc = new Date(fechaInicioDate);
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
    // F5 paso 4: filtro por dispositivo de origen
    if (params.dispositivoId) qb.andWhere('c.dispositivo_id = :compraDispId', { compraDispId: params.dispositivoId });
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

    // Enriquecer cada compra con estado de pago derivado del CPP (cuotas pagadas vs total).
    // - Sin CPP (data legacy contado): se asume PAGADO (mov caja mayor directo) si esta FINALIZADA.
    // - Con CPP: PAGADO si todas las cuotas estan PAGADA; PENDIENTE si ninguna paga; PARCIAL otherwise.
    if (items.length > 0) {
      const compraIds = items.map((c: any) => c.id);
      const cppRows: any[] = await dataSource.getRepository(CuentaPorPagar)
        .createQueryBuilder('cpp')
        .leftJoin('cpp.cuotas', 'cuota')
        .where('cpp.compra_id IN (:...ids)', { ids: compraIds })
        .select([
          'cpp.compra_id AS compraId',
          'cpp.cantidadCuotas AS cantidadCuotas',
          'COUNT(cuota.id) AS totalCuotas',
          "SUM(CASE WHEN cuota.estado = 'PAGADA' THEN 1 ELSE 0 END) AS cuotasPagadas",
          "SUM(CASE WHEN cuota.estado = 'PARCIAL' THEN 1 ELSE 0 END) AS cuotasParciales",
          'cpp.montoTotal AS montoTotal',
          'cpp.montoPagado AS montoPagado',
        ])
        .groupBy('cpp.compra_id')
        .addGroupBy('cpp.cantidadCuotas')
        .addGroupBy('cpp.montoTotal')
        .addGroupBy('cpp.montoPagado')
        .getRawMany();

      const cppMap = new Map<number, any>();
      for (const r of cppRows) cppMap.set(Number(r.compraId), r);

      for (const c of items as any[]) {
        const r = cppMap.get(c.id);
        if (r) {
          const total = Number(r.totalCuotas) || 0;
          const pagadas = Number(r.cuotasPagadas) || 0;
          const parciales = Number(r.cuotasParciales) || 0;
          let estadoPago: 'PAGADO' | 'PARCIAL' | 'PENDIENTE';
          if (total > 0 && pagadas === total) estadoPago = 'PAGADO';
          else if (pagadas > 0 || parciales > 0) estadoPago = 'PARCIAL';
          else estadoPago = 'PENDIENTE';
          (c as any).estadoPago = estadoPago;
          (c as any).cuotasPagadas = pagadas;
          (c as any).cuotasTotal = total;
          (c as any).montoPagado = +(Number(r.montoPagado) || 0).toFixed(2);
        } else {
          // Compra sin CPP: legacy contado finalizada => PAGADO; ABIERTO/CANCELADO => N/A.
          (c as any).estadoPago = c.estado === 'FINALIZADO' ? 'PAGADO' : null;
          (c as any).cuotasPagadas = null;
          (c as any).cuotasTotal = null;
          (c as any).montoPagado = null;
        }
      }
    }

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
      // F5 paso 3: device tracking
      const deviceId = resolveRequestDeviceId(_event);
      const compra = qr.manager.create(Compra, {
        estado: CompraEstado.ABIERTO,
        isRecepcionMercaderia: data.isRecepcionMercaderia ?? false,
        activo: true,
        numeroNota: data.numeroNota?.toUpperCase() || null,
        tipoBoleta: data.tipoBoleta || null,
        fechaCompra: parseLocalDate(data.fechaCompra) || new Date(),
        credito: !!data.credito,
        plazoDias: data.plazoDias ?? null,
        proveedor: data.proveedorId ? { id: data.proveedorId } as any : null,
        compraCategoria: data.compraCategoriaId ? { id: data.compraCategoriaId } as any : null,
        moneda: { id: data.monedaId } as any,
        formaPago: data.formaPagoId ? { id: data.formaPagoId } as any : null,
        dispositivo: deviceId != null ? ({ id: deviceId } as any) : null,
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
      if (data.fechaCompra !== undefined) compra.fechaCompra = parseLocalDate(data.fechaCompra);
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

  // Finaliza una compra: impacta stock + costo + SIEMPRE genera CPP (1 cuota contado, N credito).
  // El pago efectivo se hace despues via "pagar-cuotas-compras-lote" (Caja Mayor → Egreso → Pagar compras).
  // payload: {
  //   formaPagoCompra?: 'EFECTIVO' | 'BANCO',  // default EFECTIVO
  //   cuentaBancariaId?: number | null,         // opcional si BANCO (puede decidirse al pagar)
  //   fechaCreditoInicio?: string,              // si credito = true: fecha de la 1ra cuota
  //   cantidadCuotas?: number,                  // si credito = true: N cuotas mensuales
  //   pagarAhora?: boolean,                     // solo si credito = false: indica retornar cuotaId para abrir dialog de pago
  // }
  ipcMain.handle('finalizar-compra', async (_event: any, id: number, payload: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
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

      // Fecha de boleta (para stock movement y precio_costo, refleja la fecha facturada)
      const fechaBoleta = compra.fechaCompra || new Date();
      // Fecha del movimiento de caja mayor: timestamp real de la operacion (consistente con
      // gastos, retiros, etc.). Evita ademas problemas de display de medianoche sin TZ.
      const ahora = new Date();
      const monedaId = compra.moneda.id;

      // 1. Por cada detalle: stock + costo promedio + ProveedorProducto upsert
      for (const det of compra.detalles) {
        const productoId = det.producto.id;
        const cantidadUB = Number(det.cantidadUnidadBase);
        const presentacionCantidad = det.presentacion?.cantidad ? Number(det.presentacion.cantidad) : 1;
        const costoUnitarioUB = presentacionCantidad > 0
          ? Number(det.costoUnitarioPresentacion) / presentacionCantidad
          : Number(det.costoUnitarioPresentacion);

        // IMPORTANTE: el costo promedio ponderado debe calcularse ANTES de persistir
        // el StockMovimiento. Si no, getStockActualUnidadBase devuelve el stock con la
        // cantidad nueva ya sumada y la formula la cuenta dos veces (denominador inflado).
        await aplicarCostoPromedioPonderado(qr, productoId, cantidadUB, +costoUnitarioUB.toFixed(2), monedaId, fechaBoleta, userId);

        // Stock movement (solo si producto controla stock)
        if (det.producto.controlaStock) {
          const sm = qr.manager.create(StockMovimiento, {
            cantidad: cantidadUB,
            tipo: StockMovimientoTipo.COMPRA,
            tipoReferencia: StockMovimientoTipoReferencia.COMPRA,
            referencia: id,
            fecha: fechaBoleta,
            activo: true,
            observaciones: `COMPRA #${id} — ${compra.proveedor?.nombre || ''}`.toUpperCase(),
            producto: { id: productoId } as any,
          });
          await setEntityUserTracking(dataSource, sm, userId, false);
          await qr.manager.save(StockMovimiento, sm);
        }

        // ProveedorProducto upsert: guardamos el costo en UNIDAD BASE para que la UI
        // pueda comparar entre compras de distintas presentaciones sin re-calcular.
        await upsertProveedorProducto(qr, compra.proveedor.id, productoId, +costoUnitarioUB.toFixed(2), fechaBoleta, id, userId);
      }

      // 2. SIEMPRE generar CPP. Contado = 1 cuota a venc. fechaCompra. Credito = N cuotas mensuales.
      const cantidadCuotas = compra.credito
        ? Math.max(1, Number(payload.cantidadCuotas) || 1)
        : 1;
      const fechaInicio = compra.credito
        ? (parseLocalDate(payload.fechaCreditoInicio) || fechaBoleta)
        : fechaBoleta;

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

      // Persistir forma de pago (enum) y cuenta bancaria opcional.
      const formaPagoCompra = String(payload.formaPagoCompra || 'EFECTIVO').toUpperCase();
      (compra as any).formaPagoCompra = formaPagoCompra === 'BANCO' ? 'BANCO' : 'EFECTIVO';
      if (payload.cuentaBancariaId) {
        (compra as any).cuentaBancaria = { id: Number(payload.cuentaBancariaId) } as any;
      } else {
        (compra as any).cuentaBancaria = null;
      }

      // 3. Marcar como FINALIZADO
      compra.total = total;
      compra.estado = CompraEstado.FINALIZADO;
      await setEntityUserTracking(dataSource, compra, userId, true);
      await qr.manager.save(Compra, compra);

      // Si pagarAhora y es contado, ubicar la cuotaId (1ra y unica) para retornar.
      let cuotaIdParaPagar: number | null = null;
      if (!compra.credito && payload.pagarAhora === true) {
        const cuota = await qr.manager.getRepository(CuentaPorPagarCuota).findOne({
          where: { cuentaPorPagar: { id: cppId } } as any,
          order: { numero: 'ASC' },
        });
        cuotaIdParaPagar = cuota?.id ?? null;
      }

      await qr.commitTransaction();
      const compraFinal = await dataSource.getRepository(Compra).findOne({
        where: { id },
        relations: ['proveedor', 'proveedor.persona', 'moneda', 'formaPago', 'compraCategoria', 'detalles', 'detalles.producto', 'detalles.presentacion', 'cuentaPorPagar', 'cuentaBancaria'],
      });
      return { compra: compraFinal, cuotaIdParaPagar };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  });

  // Anula una compra. Si estaba ABIERTO solo marca CANCELADO. Si estaba FINALIZADO revierte stock+caja+CPP.
  ipcMain.handle('anular-compra', async (_event: any, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
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
    const entity: any = repo.create(rest);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    // F5 paso 3: propagar device_id del request context si no vino explicito.
    if (!rest?.dispositivo && !rest?.dispositivo_id) {
      const deviceId = resolveRequestDeviceId(_event);
      if (deviceId != null) entity.dispositivo = { id: deviceId };
    }
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

  // Productos del proveedor con paginacion + busqueda por nombre del producto.
  // Enriquece cada item con `ultimoCostoUnidadBase` y `presentacionNombre` (de la ultima compra)
  // para que la UI compare costos consistentemente en unidad base.
  ipcMain.handle('getProveedorProductosPaginado', async (_event: any, params: any) => {
    const proveedorId = Number(params?.proveedorId);
    if (!proveedorId) return { items: [], total: 0, page: 0, pageSize: 10 };
    const search: string = params?.search ? String(params.search).trim().toUpperCase() : '';
    const pageSize = Math.min(50, Math.max(1, Number(params?.pageSize) || 10));
    const page = Math.max(0, Number(params?.page) || 0);

    const repo = dataSource.getRepository(ProveedorProducto);
    const qb = repo.createQueryBuilder('pp')
      .leftJoinAndSelect('pp.producto', 'prod')
      .leftJoin('pp.proveedor', 'pv')
      .where('pv.id = :proveedorId', { proveedorId })
      .andWhere('pp.activo = true')
      .orderBy('pp.ultimaCompraFecha', 'DESC')
      .addOrderBy('pp.id', 'DESC');

    if (search) {
      qb.andWhere('UPPER(prod.nombre) LIKE UPPER(:s)', { s: `%${search}%` });
    }
    qb.skip(page * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    // Enriquecer con datos de la ultima compra (presentacion + factor) para calcular UB.
    if (items.length > 0) {
      const compraIds = items.map((it: any) => it.compra?.id).filter((v: any) => !!v);
      const productoIds = items.map((it: any) => it.producto?.id).filter((v: any) => !!v);
      let detalles: any[] = [];
      if (compraIds.length && productoIds.length) {
        const cdRepo = dataSource.getRepository(CompraDetalle);
        detalles = await cdRepo.createQueryBuilder('cd')
          .leftJoin('cd.presentacion', 'pres')
          .where('cd.compra_id IN (:...compraIds)', { compraIds })
          .andWhere('cd.producto_id IN (:...productoIds)', { productoIds })
          .select([
            'cd.compra_id AS compraId',
            'cd.producto_id AS productoId',
            'cd.costoUnitarioPresentacion AS costoUnitarioPresentacion',
            'pres.nombre AS presentacionNombre',
            'pres.cantidad AS presentacionCantidad',
          ])
          .getRawMany();
      }
      const detalleMap = new Map<string, any>();
      for (const d of detalles) {
        detalleMap.set(`${d.compraId}_${d.productoId}`, d);
      }
      for (const item of items as any[]) {
        const key = `${item.compra?.id}_${item.producto?.id}`;
        const det = detalleMap.get(key);
        if (det) {
          const factor = det.presentacionCantidad ? Number(det.presentacionCantidad) : 1;
          const costoPres = Number(det.costoUnitarioPresentacion) || 0;
          item.ultimoCostoUnidadBase = factor > 0 ? +(costoPres / factor).toFixed(2) : costoPres;
          item.ultimaPresentacionNombre = det.presentacionNombre || null;
          item.ultimaPresentacionCantidad = factor;
        } else {
          // Fallback: si no hay detalle (datos legacy), asume cantidad=1.
          item.ultimoCostoUnidadBase = item.ultimoCostoUnitario != null ? Number(item.ultimoCostoUnitario) : null;
          item.ultimaPresentacionNombre = null;
          item.ultimaPresentacionCantidad = 1;
        }
      }
    }

    return { items, total, page, pageSize };
  });

  // Ultimas compras de un producto (cualquier proveedor) para comparar precios.
  // Retorna { items, total, page, pageSize }.
  ipcMain.handle('getUltimasComprasProducto', async (_event: any, params: any) => {
    const productoId = Number(params?.productoId);
    if (!productoId) return { items: [], total: 0, page: 0, pageSize: 5 };
    const pageSize = Math.min(50, Math.max(1, Number(params?.pageSize) || 5));
    const page = Math.max(0, Number(params?.page) || 0);

    const cdRepo = dataSource.getRepository(CompraDetalle);
    const qb = cdRepo.createQueryBuilder('cd')
      .innerJoin('cd.compra', 'c')
      .leftJoin('c.proveedor', 'pv')
      .leftJoin('c.moneda', 'mon')
      .leftJoin('cd.presentacion', 'pres')
      .where('cd.producto_id = :productoId', { productoId })
      .andWhere('c.estado = :estado', { estado: CompraEstado.FINALIZADO })
      .select([
        'cd.id AS id',
        'c.id AS compraId',
        'c.fechaCompra AS fechaCompra',
        'pv.nombre AS proveedorNombre',
        'mon.simbolo AS monedaSimbolo',
        'cd.cantidad AS cantidad',
        'cd.cantidadUnidadBase AS cantidadUnidadBase',
        'cd.costoUnitarioPresentacion AS costoUnitario',
        'pres.nombre AS presentacionNombre',
        'pres.cantidad AS presentacionCantidad',
      ])
      .orderBy('c.fechaCompra', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .offset(page * pageSize)
      .limit(pageSize);

    const itemsRaw = await qb.getRawMany();
    // Enriquecer con costoUnidadBase para que la UI compare en una unica unidad.
    const items = itemsRaw.map((r: any) => {
      const factor = r.presentacionCantidad ? Number(r.presentacionCantidad) : 1;
      const costoPres = Number(r.costoUnitario) || 0;
      const costoUB = factor > 0 ? +(costoPres / factor).toFixed(2) : costoPres;
      return { ...r, costoUnidadBase: costoUB };
    });
    const totalRow = await cdRepo.createQueryBuilder('cd')
      .innerJoin('cd.compra', 'c')
      .where('cd.producto_id = :productoId', { productoId })
      .andWhere('c.estado = :estado', { estado: CompraEstado.FINALIZADO })
      .getCount();
    return { items, total: totalRow, page, pageSize };
  });

  // Ultimo costo conocido del producto, EN UNIDAD BASE.
  // Si se pasa proveedorId, prioriza la ultima compra del par (proveedor, producto).
  // Fallback: ultimo CompraDetalle FINALIZADO de cualquier proveedor.
  ipcMain.handle('getUltimoCostoProducto', async (_event: any, params: any) => {
    const productoId = Number(params?.productoId);
    if (!productoId) return { ultimoCosto: null, fuente: null, fecha: null };
    const proveedorId = params?.proveedorId ? Number(params.proveedorId) : null;
    const cdRepo = dataSource.getRepository(CompraDetalle);

    // Prioriza la ultima compra del par (proveedor, producto): JOIN con compra.proveedor.
    if (proveedorId) {
      const row = await cdRepo.createQueryBuilder('cd')
        .innerJoin('cd.compra', 'c')
        .leftJoin('cd.presentacion', 'pres')
        .where('cd.producto_id = :productoId', { productoId })
        .andWhere('c.proveedor_id = :proveedorId', { proveedorId })
        .andWhere('c.estado = :estado', { estado: CompraEstado.FINALIZADO })
        .orderBy('c.fechaCompra', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .select([
          'cd.costoUnitarioPresentacion AS costo',
          'pres.cantidad AS presFactor',
          'c.fechaCompra AS fecha',
        ])
        .limit(1)
        .getRawOne();
      if (row && row.costo != null) {
        const factor = row.presFactor ? Number(row.presFactor) : 1;
        const costoPres = Number(row.costo);
        const costoUB = factor > 0 ? +(costoPres / factor).toFixed(2) : costoPres;
        return {
          ultimoCosto: costoUB,
          fuente: 'PROVEEDOR_PRODUCTO',
          fecha: row.fecha || null,
        };
      }
    }

    // Fallback: cualquier proveedor.
    const row = await cdRepo.createQueryBuilder('cd')
      .innerJoin('cd.compra', 'c')
      .leftJoin('cd.presentacion', 'pres')
      .where('cd.producto_id = :productoId', { productoId })
      .andWhere('c.estado = :estado', { estado: CompraEstado.FINALIZADO })
      .orderBy('c.fechaCompra', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .select([
        'cd.costoUnitarioPresentacion AS costo',
        'pres.cantidad AS presFactor',
        'c.fechaCompra AS fecha',
      ])
      .limit(1)
      .getRawOne();
    if (row && row.costo != null) {
      const factor = row.presFactor ? Number(row.presFactor) : 1;
      const costoPres = Number(row.costo);
      const costoUB = factor > 0 ? +(costoPres / factor).toFixed(2) : costoPres;
      return {
        ultimoCosto: costoUB,
        fuente: 'COMPRA_DETALLE',
        fecha: row.fecha || null,
      };
    }
    return { ultimoCosto: null, fuente: null, fecha: null };
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
