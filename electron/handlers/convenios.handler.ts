import { ipcMain } from 'electron';
import { DataSource, In } from 'typeorm';
import { Convenio } from '../../src/app/database/entities/personas/convenio.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import {
  CuentaPorCobrarEstado,
  CuentaPorCobrarCuotaEstado,
  MovimientoClienteTipo,
} from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { CobroConsolidado } from '../../src/app/database/entities/financiero/cobro-consolidado.entity';
import { CobroConsolidadoDetalle } from '../../src/app/database/entities/financiero/cobro-consolidado-detalle.entity';
import { CobroConsolidadoEstado, CobroConsolidadoFuente } from '../../src/app/database/entities/financiero/cobro-consolidado-enums';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import {
  buildPdfBase64,
  pdfHeaderEmpresa,
  pdfTablaMontos,
  pdfFmtFecha,
  pdfFmtMonto,
  pdfFmtMontoMoneda,
  pdfTextoEnLetras,
  pdfFooterPaginado,
} from '../utils/pdf.utils';
import { Empresa } from '../../src/app/database/entities/sistema/empresa.entity';

/** Linea de corte punteada (para separar/recortar recibos en una hoja). */
function lineaCorte(): any {
  return {
    margin: [0, 6, 0, 6],
    columns: [
      { text: '✂', width: 12, fontSize: 9, color: '#888' },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 503, y2: 6, dash: { length: 4 }, lineWidth: 0.7, lineColor: '#888' }] },
    ],
  };
}

/** Recibo compacto (varios entran en una A4). */
function reciboCompacto(empresaNombre: string, cobro: any, det: any, nombreCli: string): any {
  const monto = Number(det.montoCobrado);
  const doc = det.cliente?.ruc || det.cliente?.persona?.documento;
  return {
    stack: [
      {
        columns: [
          { text: empresaNombre, bold: true, fontSize: 11 },
          { text: `RECIBO DE COBRO N° ${cobro.id}-${det.id}`, alignment: 'right', fontSize: 10, bold: true },
        ],
      },
      {
        columns: [
          { text: `Fecha: ${pdfFmtFecha(cobro.fecha)}`, fontSize: 9 },
          { text: `Convenio: ${cobro.convenio?.nombre || ''}`, alignment: 'right', fontSize: 9 },
        ],
        margin: [0, 2, 0, 2],
      },
      { text: `Cliente: ${nombreCli}${doc ? '  ·  Doc: ' + doc : ''}`, fontSize: 9 },
      {
        text: `Recibí la suma de ${pdfFmtMontoMoneda(monto, 'PYG')} (${pdfTextoEnLetras(monto, 'PYG')}) en concepto de pago de deuda.`,
        fontSize: 9,
        margin: [0, 3, 0, 10],
      },
      {
        columns: [
          { text: '' },
          {
            width: 170,
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 170, y2: 0, lineWidth: 0.5 }] },
              { text: 'Firma del cobrador', alignment: 'center', fontSize: 8, margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },
    ],
  };
}

/** Deuda cobrable por cliente del convenio + total. Reusado por el handler de
 * preview y por el PDF del reporte. */
async function computeCobroPreview(dataSource: DataSource, convenioId: number): Promise<any> {
  const convenio = await dataSource.getRepository(Convenio).findOne({
    where: { id: convenioId },
    relations: ['clientes', 'clientes.persona'],
  });
  if (!convenio) throw new Error(`Convenio ${convenioId} no encontrado`);

  const clientes: any[] = [];
  let total = 0;
  for (const cli of convenio.clientes || []) {
    const cuotas = await getCuotasCobrablesCliente(dataSource.manager, cli.id);
    const deuda = +cuotas
      .reduce((s, c: any) => s + (Number(c.monto) - Number(c.montoCobrado)), 0)
      .toFixed(2);
    total += deuda;
    clientes.push({
      id: cli.id,
      nombre: nombreCliente(cli),
      documento: cli.ruc || cli.persona?.documento || null,
      cantidadCuotas: cuotas.length,
      deuda,
    });
  }
  clientes.sort((a, b) => b.deuda - a.deuda);
  return {
    convenio: { id: convenio.id, nombre: convenio.nombre, ruc: convenio.ruc, contacto: convenio.contacto },
    clientes,
    total: +total.toFixed(2),
    cantidadConDeuda: clientes.filter((c) => c.deuda > 0).length,
  };
}

const up = (s?: string | null) => (s ? String(s).toUpperCase() : s);

function nombreCliente(cliente: any): string {
  return (
    cliente?.razon_social ||
    [cliente?.persona?.nombre, cliente?.persona?.apellido].filter(Boolean).join(' ') ||
    `CLIENTE #${cliente?.id}`
  );
}

function calcEstadoCuota(monto: number, montoCobrado: number): CuentaPorCobrarCuotaEstado {
  if (montoCobrado >= monto) return CuentaPorCobrarCuotaEstado.COBRADO;
  if (montoCobrado > 0) return CuentaPorCobrarCuotaEstado.PARCIAL;
  return CuentaPorCobrarCuotaEstado.PENDIENTE;
}

/** Cuotas pendientes/parciales (de CxC ACTIVO) de un cliente, vencimiento ASC. */
async function getCuotasCobrablesCliente(manager: any, clienteId: number): Promise<any[]> {
  return manager.getRepository(CuentaPorCobrarCuota)
    .createQueryBuilder('cuota')
    .innerJoinAndSelect('cuota.cuentaPorCobrar', 'cpc')
    .leftJoin('cpc.cliente', 'cli')
    .where('cli.id = :clienteId', { clienteId })
    .andWhere('cpc.estado = :act', { act: CuentaPorCobrarEstado.ACTIVO })
    .andWhere('cuota.estado IN (:...est)', {
      est: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL],
    })
    .orderBy('cuota.fechaVencimiento', 'ASC')
    .addOrderBy('cuota.id', 'ASC')
    .getMany();
}

export function registerConveniosHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ===================== CONVENIOS CRUD =====================

  ipcMain.handle('get-convenios', async (_e, filtros?: any) => {
    const repo = dataSource.getRepository(Convenio);
    const qb = repo.createQueryBuilder('c').orderBy('c.nombre', 'ASC');
    if (filtros?.activo !== undefined && filtros?.activo !== null && filtros?.activo !== '') {
      qb.andWhere('c.activo = :a', { a: !!filtros.activo });
    }
    if (filtros?.nombre) {
      qb.andWhere('UPPER(c.nombre) LIKE UPPER(:n)', { n: `%${filtros.nombre}%` });
    }
    const convenios = await qb.getMany();

    // Agregados por convenio: cantidad de clientes y deuda total (saldoActual).
    const result: any[] = [];
    for (const conv of convenios) {
      const row = await dataSource
        .createQueryBuilder()
        .select('COUNT(cc.cliente_id)', 'cant')
        .addSelect('COALESCE(SUM(cl.saldo_actual), 0)', 'deuda')
        .from('cliente_convenios', 'cc')
        .leftJoin(Cliente, 'cl', 'cl.id = cc.cliente_id')
        .where('cc.convenio_id = :id', { id: conv.id })
        .getRawOne();
      result.push({
        ...conv,
        cantidadClientes: Number(row?.cant || 0),
        deudaTotal: Number(row?.deuda || 0),
      });
    }
    return result;
  });

  ipcMain.handle('get-convenio', async (_e, id: number) => {
    const repo = dataSource.getRepository(Convenio);
    return await repo.findOne({ where: { id }, relations: ['clientes', 'clientes.persona', 'clientes.tipo_cliente'] });
  });

  ipcMain.handle('create-convenio', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CLIENTES_GESTIONAR');
    const repo = dataSource.getRepository(Convenio);
    const entity = repo.create({
      nombre: up(data.nombre) || '',
      descripcion: up(data.descripcion) || undefined,
      ruc: up(data.ruc) || undefined,
      contacto: up(data.contacto) || undefined,
      activo: data.activo !== false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('update-convenio', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CLIENTES_GESTIONAR');
    const repo = dataSource.getRepository(Convenio);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) throw new Error(`Convenio ${id} no encontrado`);
    if (data.nombre !== undefined) entity.nombre = up(data.nombre) || entity.nombre;
    if (data.descripcion !== undefined) entity.descripcion = up(data.descripcion) || undefined;
    if (data.ruc !== undefined) entity.ruc = up(data.ruc) || undefined;
    if (data.contacto !== undefined) entity.contacto = up(data.contacto) || undefined;
    if (data.activo !== undefined) entity.activo = data.activo;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    return await repo.save(entity);
  });

  ipcMain.handle('delete-convenio', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'CLIENTES_GESTIONAR');
    const repo = dataSource.getRepository(Convenio);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) throw new Error(`Convenio ${id} no encontrado`);
    entity.activo = false; // soft delete
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    await repo.save(entity);
    return { success: true };
  });

  /** Reemplaza el set de clientes del convenio (M2M). */
  ipcMain.handle('set-convenio-clientes', async (_e, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CLIENTES_GESTIONAR');
    const convenioId: number = payload.convenioId;
    const clienteIds: number[] = (payload.clienteIds || []).map((n: any) => Number(n));
    const repo = dataSource.getRepository(Convenio);
    const convenio = await repo.findOne({ where: { id: convenioId } });
    if (!convenio) throw new Error(`Convenio ${convenioId} no encontrado`);
    const clientes = clienteIds.length
      ? await dataSource.getRepository(Cliente).find({ where: { id: In(clienteIds) } })
      : [];
    convenio.clientes = clientes as any;
    await repo.save(convenio);
    return { success: true, cantidad: clientes.length };
  });

  // ===================== COBRO CONSOLIDADO =====================

  /** Vista previa: deuda cobrable por cliente del convenio + total. */
  ipcMain.handle('get-cobro-consolidado-preview', async (_e, convenioId: number) => {
    return await computeCobroPreview(dataSource, convenioId);
  });

  /** PDF del reporte de cobro consolidado (total + clientes + deuda de cada uno). */
  ipcMain.handle('export-cobro-consolidado-preview-pdf', async (_e, convenioId: number) => {
    const preview = await computeCobroPreview(dataSource, convenioId);
    const empresaHeader = await pdfHeaderEmpresa(dataSource, { showLogo: true });
    const filas = preview.clientes
      .filter((c: any) => c.deuda > 0)
      .map((c: any) => [c.nombre, c.documento || '—', String(c.cantidadCuotas), pdfFmtMonto(c.deuda)]);

    const docDef = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 50],
      content: [
        empresaHeader,
        { text: 'REPORTE DE COBRO CONSOLIDADO', style: 'h1' },
        { text: preview.convenio.nombre, style: 'h2', alignment: 'center' },
        { text: ' ' },
        {
          columns: [
            { text: `Convenio: ${preview.convenio.nombre}` },
            { text: `Fecha: ${pdfFmtFecha(new Date())}`, alignment: 'right' },
          ],
          margin: [0, 0, 0, 8],
        },
        pdfTablaMontos(
          ['CLIENTE', 'DOCUMENTO', 'CUOTAS', 'DEUDA'],
          filas,
          { montoCols: [3], totalLabel: 'TOTAL A COBRAR', totalValue: preview.total, totalCol: 3 },
        ),
      ],
      footer: pdfFooterPaginado(),
    };
    const base64 = await buildPdfBase64(docDef);
    return { filename: `cobro-consolidado-${preview.convenio.nombre.replace(/\s+/g, '_')}.pdf`, base64, mimeType: 'application/pdf' };
  });

  /** PDF con un recibo por cliente del cobro consolidado ya registrado. */
  ipcMain.handle('export-recibo-cobro-consolidado-pdf', async (_e, cobroConsolidadoId: number) => {
    const cobro = await dataSource.getRepository(CobroConsolidado).findOne({
      where: { id: cobroConsolidadoId },
      relations: ['convenio', 'detalles', 'detalles.cliente', 'detalles.cliente.persona'],
    });
    if (!cobro) throw new Error(`Cobro consolidado ${cobroConsolidadoId} no encontrado`);
    const empresa = await dataSource.getRepository(Empresa).findOne({ where: {} });
    const empresaNombre = (empresa?.razonSocial || empresa?.nombre || 'EMPRESA').toUpperCase();

    // Recibos compactos: 3 por hoja A4, separados por linea de corte punteada.
    const POR_HOJA = 3;
    const content: any[] = [];
    (cobro.detalles || []).forEach((det: any, idx: number) => {
      const bloque = reciboCompacto(empresaNombre, cobro, det, nombreCliente(det.cliente));
      if (idx > 0 && idx % POR_HOJA === 0) bloque.pageBreak = 'before';
      content.push(bloque);
      content.push(lineaCorte());
    });

    const docDef = {
      pageSize: 'A4',
      pageMargins: [40, 28, 40, 28],
      content,
    };
    const base64 = await buildPdfBase64(docDef);
    return { filename: `recibos-cobro-consolidado-${cobro.id}.pdf`, base64, mimeType: 'application/pdf' };
  });

  /**
   * Registra el cobro consolidado: paga la deuda (cuotas pendientes) de cada
   * cliente del convenio, genera el ingreso (Caja Mayor o cuenta bancaria) y
   * guarda la cabecera + detalle por cliente para los recibos.
   */
  ipcMain.handle('registrar-cobro-consolidado', async (_e, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CPC_COBRAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const convenioId: number = payload.convenioId;
      const fuente: CobroConsolidadoFuente = payload.fuente === 'CUENTA_BANCARIA'
        ? CobroConsolidadoFuente.CUENTA_BANCARIA
        : CobroConsolidadoFuente.CAJA_MAYOR;
      const fecha: Date = payload.fecha ? new Date(payload.fecha) : new Date();
      const observacion: string = up(payload.observacion) || '';
      const clienteIdsFiltro: number[] | null = Array.isArray(payload.clienteIds) && payload.clienteIds.length
        ? payload.clienteIds.map((n: any) => Number(n))
        : null;
      const cu = getCurrentUser();

      const convenio = await queryRunner.manager.getRepository(Convenio).findOne({
        where: { id: convenioId },
        relations: ['clientes', 'clientes.persona'],
      });
      if (!convenio) throw new Error(`Convenio ${convenioId} no encontrado`);

      // Validar fuente
      let cajaMayorId: number | undefined;
      let monedaId: number | undefined;
      let formaPagoId: number | undefined;
      let cuentaBancariaId: number | undefined;
      if (fuente === CobroConsolidadoFuente.CAJA_MAYOR) {
        cajaMayorId = Number(payload.cajaMayorId) || undefined;
        monedaId = Number(payload.monedaId) || undefined;
        formaPagoId = Number(payload.formaPagoId) || undefined;
        if (!cajaMayorId || !monedaId || !formaPagoId) {
          throw new Error('Para cobro por Caja Mayor se requiere caja, moneda y forma de pago');
        }
      } else {
        cuentaBancariaId = Number(payload.cuentaBancariaId) || undefined;
        if (!cuentaBancariaId) throw new Error('Falta la cuenta bancaria');
      }

      // Cabecera (se completa monto al final)
      const cobro = queryRunner.manager.create(CobroConsolidado, {
        convenio: { id: convenioId } as any,
        fecha,
        montoTotal: 0,
        cantidadClientes: 0,
        fuente,
        cajaMayorId,
        monedaId,
        formaPagoId,
        cuentaBancariaId,
        observacion: observacion || undefined,
        estado: CobroConsolidadoEstado.ACTIVO,
      });
      await setEntityUserTracking(dataSource, cobro, cu?.id, false);
      const cobroSaved = await queryRunner.manager.save(CobroConsolidado, cobro);

      let totalGeneral = 0;
      let cantidad = 0;

      for (const cli of convenio.clientes || []) {
        if (clienteIdsFiltro && !clienteIdsFiltro.includes(cli.id)) continue;
        const cuotas = await getCuotasCobrablesCliente(queryRunner.manager, cli.id);
        if (!cuotas.length) continue;

        const clienteEntity = await queryRunner.manager.getRepository(Cliente).findOne({
          where: { id: cli.id }, relations: ['persona'],
        });
        const saldoAnterior = Number(clienteEntity?.saldoActual || 0);
        let montoCliente = 0;
        const cppTocados = new Map<number, any>();

        for (const cuota of cuotas) {
          const restante = +(Number(cuota.monto) - Number(cuota.montoCobrado)).toFixed(2);
          if (restante <= 0) continue;
          cuota.montoCobrado = +(Number(cuota.montoCobrado) + restante).toFixed(2);
          cuota.estado = calcEstadoCuota(Number(cuota.monto), Number(cuota.montoCobrado));
          cuota.fechaCobro = fecha;
          await setEntityUserTracking(dataSource, cuota, cu?.id, true);
          await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);
          montoCliente += restante;

          const cppId = cuota.cuentaPorCobrar.id;
          if (!cppTocados.has(cppId)) cppTocados.set(cppId, cuota.cuentaPorCobrar);
        }
        if (montoCliente <= 0) continue;
        montoCliente = +montoCliente.toFixed(2);

        // Actualizar cada CPP tocado (montoCobrado + estado si todas cobradas)
        for (const cppId of cppTocados.keys()) {
          const cpp = await queryRunner.manager.getRepository(CuentaPorCobrar).findOne({
            where: { id: cppId }, relations: ['cuotas'],
          });
          if (!cpp) continue;
          const cobradoCpp = (cpp.cuotas || []).reduce((s: number, c: any) => s + Number(c.montoCobrado), 0);
          cpp.montoCobrado = +cobradoCpp.toFixed(2);
          const todas = (cpp.cuotas || []).every((c: any) =>
            Number(c.montoCobrado) >= Number(c.monto) - 0.005 || c.estado === CuentaPorCobrarCuotaEstado.CANCELADO);
          if (todas) cpp.estado = CuentaPorCobrarEstado.COBRADO;
          await setEntityUserTracking(dataSource, cpp, cu?.id, true);
          await queryRunner.manager.save(CuentaPorCobrar, cpp);
        }

        // Ingreso del dinero
        let cajaMovId: number | undefined;
        const obs = `COBRO CONSOLIDADO #${cobroSaved.id} - ${convenio.nombre} - ${nombreCliente(cli)}`;
        if (fuente === CobroConsolidadoFuente.CAJA_MAYOR) {
          const movCM = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cajaMayorId } as any,
            tipoMovimiento: TipoMovimiento.INGRESO_COBRO_CLIENTE,
            moneda: { id: monedaId } as any,
            formaPago: { id: formaPagoId } as any,
            monto: montoCliente,
            fecha,
            observacion: obs,
            responsable: cu || undefined,
          } as any);
          await setEntityUserTracking(dataSource, movCM, cu?.id, false);
          const savedMov = await queryRunner.manager.save(CajaMayorMovimiento, movCM);
          cajaMovId = savedMov.id;
          await actualizarSaldoCajaMayor(queryRunner, cajaMayorId!, monedaId!, formaPagoId!, montoCliente, TipoMovimiento.INGRESO_COBRO_CLIENTE);
        }

        // Reducir saldo del cliente
        if (clienteEntity) {
          clienteEntity.saldoActual = +(Number(clienteEntity.saldoActual) - montoCliente).toFixed(2);
          await queryRunner.manager.save(Cliente, clienteEntity);
        }

        // MovimientoCliente PAGO (agregado por cliente)
        const movCli = queryRunner.manager.create(MovimientoCliente, {
          cliente: { id: cli.id } as any,
          tipo: MovimientoClienteTipo.PAGO,
          monto: montoCliente,
          fecha,
          cajaMayorMovimientoId: cajaMovId,
          observacion: obs,
          registradoPor: cu || undefined,
        } as any);
        await setEntityUserTracking(dataSource, movCli, cu?.id, false);
        await queryRunner.manager.save(MovimientoCliente, movCli);

        // Detalle del cobro consolidado
        const det = queryRunner.manager.create(CobroConsolidadoDetalle, {
          cobroConsolidado: { id: cobroSaved.id } as any,
          cliente: { id: cli.id } as any,
          montoCobrado: montoCliente,
          saldoAnterior,
        });
        await setEntityUserTracking(dataSource, det, cu?.id, false);
        await queryRunner.manager.save(CobroConsolidadoDetalle, det);

        totalGeneral += montoCliente;
        cantidad += 1;
      }

      if (cantidad === 0) {
        throw new Error('Ningun cliente del convenio tiene deuda cobrable');
      }

      // Acreditar cuenta bancaria (un solo credito por el total)
      if (fuente === CobroConsolidadoFuente.CUENTA_BANCARIA) {
        const cb = await queryRunner.manager.getRepository(CuentaBancaria).findOne({ where: { id: cuentaBancariaId } });
        if (!cb) throw new Error('Cuenta bancaria no encontrada');
        cb.saldo = +(Number(cb.saldo) + totalGeneral).toFixed(2);
        await queryRunner.manager.save(CuentaBancaria, cb);
      }

      cobroSaved.montoTotal = +totalGeneral.toFixed(2);
      cobroSaved.cantidadClientes = cantidad;
      await queryRunner.manager.save(CobroConsolidado, cobroSaved);

      await queryRunner.commitTransaction();
      return { success: true, cobroConsolidadoId: cobroSaved.id, montoTotal: cobroSaved.montoTotal, cantidadClientes: cantidad };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error registrando cobro consolidado:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-cobros-consolidados', async (_e, filtros?: any) => {
    const repo = dataSource.getRepository(CobroConsolidado);
    const qb = repo.createQueryBuilder('cc')
      .leftJoinAndSelect('cc.convenio', 'convenio')
      .orderBy('cc.fecha', 'DESC')
      .addOrderBy('cc.id', 'DESC');
    if (filtros?.convenioId) qb.andWhere('convenio.id = :cid', { cid: filtros.convenioId });
    if (filtros?.estado) qb.andWhere('cc.estado = :est', { est: filtros.estado });
    return await qb.getMany();
  });

  ipcMain.handle('get-cobro-consolidado', async (_e, id: number) => {
    const repo = dataSource.getRepository(CobroConsolidado);
    return await repo.findOne({
      where: { id },
      relations: ['convenio', 'detalles', 'detalles.cliente', 'detalles.cliente.persona'],
    });
  });
}
