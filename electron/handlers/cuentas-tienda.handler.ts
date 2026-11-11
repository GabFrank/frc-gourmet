import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CuentaCliente } from '../../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import { AccionVinculoCuenta, CuentaClienteVinculo } from '../../src/app/database/entities/pedidos-online/cuenta-cliente-vinculo.entity';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';

/**
 * F8b fase 1 (docs/planes/PLAN-tienda-f8b-credito.md): las cuentas de la tienda y su vínculo con
 * el `Cliente` interno.
 *
 * El vínculo es SIEMPRE manual: cualquiera puede crear una cuenta web con el teléfono o el correo
 * de otro, así que unirlas solas por coincidencia sería regalar el crédito de ese cliente. Lo hace
 * el personal con `CLIENTES_GESTIONAR` y queda en `cuentas_cliente_vinculos` quién y cuándo.
 * Un cliente tiene a lo sumo UNA cuenta web (índice único parcial), para que dos cuentas no gasten
 * el mismo crédito.
 *
 * Ver la lista exige `CLIENTES_VER`: muestra teléfonos y correos de clientes.
 */
export const PERM_VER_CUENTAS = 'CLIENTES_VER';
export const PERM_VINCULAR_CUENTAS = 'CLIENTES_GESTIONAR';

export interface FiltrosCuentasTienda {
  texto?: string;
  vinculo?: 'TODAS' | 'VINCULADAS' | 'SIN_VINCULAR';
  page?: number;
  pageSize?: number;
}

const upper = (v: any): string | null => {
  const s = String(v ?? '').trim().toUpperCase().slice(0, 200);
  return s || null;
};

function nombreCliente(c: Cliente | null | undefined): string {
  if (!c) return '';
  const p: any = (c as any).persona;
  const t = (x: any) => String(x ?? '').trim();
  return t((c as any).razon_social) || [t(p?.nombre), t(p?.apellido)].filter(Boolean).join(' ') || `CLIENTE #${c.id}`;
}

/** Fila de la pantalla: sin hash de contraseña ni nada del ingreso. */
function mapFila(c: CuentaCliente, pedidos: number): any {
  const cli: any = c.cliente || null;
  return {
    id: c.id,
    nombre: c.nombre ?? null,
    telefono: c.telefono ?? null,
    telefonoVerificado: !!c.telefonoVerificado,
    telefonoContacto: c.telefonoContacto ?? null,
    email: c.email ?? null,
    emailVerificado: !!c.emailVerificado,
    activo: !!c.activo,
    ultimoLogin: c.ultimoLogin ?? null,
    createdAt: c.createdAt,
    pedidos,
    cliente: cli ? { id: cli.id, nombre: nombreCliente(cli), ruc: cli.ruc ?? null, credito: !!cli.credito, activo: !!cli.activo } : null,
    vinculadoPor: (c.vinculadoPor as any)?.nickname ?? null,
    vinculadoEn: c.vinculadoEn ?? null,
  };
}

/** El índice único «un cliente, una cuenta» rechazó la escritura (carrera entre dos pantallas). */
function esViolacionUnica(e: any): boolean {
  const m = String(e?.message || '') + String(e?.driverError?.message || '');
  return e?.code === '23505' || e?.driverError?.code === '23505' || /UNIQUE constraint failed/i.test(m);
}

export function registerCuentasTiendaHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  const repo = () => dataSource.getRepository(CuentaCliente);

  ipcMain.handle('get-cuentas-tienda', async (_e: any, filtros: FiltrosCuentasTienda = {}) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_VER_CUENTAS);
    const pageSize = Math.min(Math.max(Number(filtros.pageSize) || 25, 1), 100);
    const page = Math.max(Number(filtros.page) || 1, 1);
    const qb = repo().createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cli')
      .leftJoinAndSelect('cli.persona', 'per')
      .leftJoinAndSelect('c.vinculadoPor', 'vp')
      .orderBy('c.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const texto = String(filtros.texto || '').trim();
    if (texto) {
      const t = `%${texto.toUpperCase()}%`;
      // Sin el 0 inicial: «0981…» encuentra la cuenta guardada como «595981…» (y la vieja «0981…»).
      const digitos = texto.replace(/\D/g, '').replace(/^0+/, '');
      qb.andWhere(
        `(UPPER(COALESCE(c.nombre, '')) LIKE :t OR UPPER(COALESCE(c.email, '')) LIKE :t`
        + (digitos ? ` OR COALESCE(c.telefono, '') LIKE :d OR COALESCE(c.telefono_contacto, '') LIKE :d` : '')
        + `)`,
        { t, d: `%${digitos}%` },
      );
    }
    if (filtros.vinculo === 'VINCULADAS') qb.andWhere('c.cliente_id IS NOT NULL');
    if (filtros.vinculo === 'SIN_VINCULAR') qb.andWhere('c.cliente_id IS NULL');
    const [cuentas, total] = await qb.getManyAndCount();

    const conteo = new Map<number, number>();
    if (cuentas.length) {
      const filas: any[] = await dataSource.getRepository(PedidoOnline).createQueryBuilder('p')
        .select('p.cuenta_cliente_id', 'cuenta')
        .addSelect('COUNT(*)', 'n')
        .where('p.cuenta_cliente_id IN (:...ids)', { ids: cuentas.map((c) => c.id) })
        .groupBy('p.cuenta_cliente_id')
        .getRawMany();
      for (const f of filas) conteo.set(Number(f.cuenta), Number(f.n) || 0);
    }
    return { success: true, total, page, pageSize, data: cuentas.map((c) => mapFila(c, conteo.get(c.id) || 0)) };
  });

  ipcMain.handle('get-vinculos-cuenta-tienda', async (_e: any, cuentaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_VER_CUENTAS);
    const filas = await dataSource.getRepository(CuentaClienteVinculo).find({
      where: { cuentaClienteId: Number(cuentaId) },
      relations: ['createdBy'],
      order: { id: 'DESC' },
      take: 50,
    });
    const clientes = filas.length
      ? await dataSource.getRepository(Cliente).find({
        where: filas.map((f) => ({ id: f.clienteId })),
        relations: ['persona'],
      })
      : [];
    const porId = new Map(clientes.map((c) => [c.id, c]));
    return {
      success: true,
      data: filas.map((f) => ({
        id: f.id,
        accion: f.accion,
        motivo: f.motivo ?? null,
        fecha: f.createdAt,
        usuario: (f.createdBy as any)?.nickname ?? null,
        cliente: { id: f.clienteId, nombre: nombreCliente(porId.get(f.clienteId)) },
      })),
    };
  });

  ipcMain.handle('vincular-cuenta-tienda', async (_e: any, cuentaId: number, clienteId: number, motivo?: string) => {
    const usuario = await ensurePermission(dataSource, getCurrentUser, PERM_VINCULAR_CUENTAS);
    const idCuenta = Number(cuentaId);
    const idCliente = Number(clienteId);
    if (!idCuenta || !idCliente) return { success: false, error: 'datos_invalidos' };
    try {
      return await dataSource.transaction(async (m) => {
        const cuenta = await m.getRepository(CuentaCliente).findOne({ where: { id: idCuenta }, relations: ['cliente'] });
        if (!cuenta) return { success: false, error: 'cuenta_no_encontrada' };
        const actual = (cuenta.cliente as any)?.id ?? null;
        if (actual === idCliente) return { success: true, sinCambios: true };
        // Cambiar de cliente es desvincular y volver a vincular: dos decisiones, dos registros.
        if (actual) return { success: false, error: 'cuenta_ya_vinculada' };
        const cliente = await m.getRepository(Cliente).findOne({ where: { id: idCliente } });
        if (!cliente || !cliente.activo) return { success: false, error: 'cliente_no_disponible' };
        const otra = await m.getRepository(CuentaCliente).createQueryBuilder('c')
          .where('c.cliente_id = :id', { id: idCliente }).getOne();
        if (otra) return { success: false, error: 'cliente_ya_tiene_cuenta', cuentaId: otra.id };

        // Condicional: si otra pantalla la vinculó entre la lectura y acá, no se pisa.
        const r = await m.createQueryBuilder().update(CuentaCliente)
          .set({ cliente: { id: idCliente } as any, vinculadoPor: { id: usuario.id } as any, vinculadoEn: new Date() })
          .where('id = :id AND cliente_id IS NULL', { id: idCuenta })
          .execute();
        if (!r.affected) return { success: false, error: 'cuenta_ya_vinculada' };
        await m.getRepository(CuentaClienteVinculo).save(m.getRepository(CuentaClienteVinculo).create({
          cuentaClienteId: idCuenta, clienteId: idCliente, accion: AccionVinculoCuenta.VINCULAR, motivo: upper(motivo),
          createdBy: { id: usuario.id } as any, updatedBy: { id: usuario.id } as any,
        }));
        return { success: true };
      });
    } catch (e) {
      if (esViolacionUnica(e)) return { success: false, error: 'cliente_ya_tiene_cuenta' };
      throw e;
    }
  });

  ipcMain.handle('desvincular-cuenta-tienda', async (_e: any, cuentaId: number, motivo: string) => {
    const usuario = await ensurePermission(dataSource, getCurrentUser, PERM_VINCULAR_CUENTAS);
    const idCuenta = Number(cuentaId);
    const motivoN = upper(motivo);
    if (!motivoN) return { success: false, error: 'motivo_requerido' };
    return dataSource.transaction(async (m) => {
      const cuenta = await m.getRepository(CuentaCliente).findOne({ where: { id: idCuenta }, relations: ['cliente'] });
      if (!cuenta) return { success: false, error: 'cuenta_no_encontrada' };
      const actual = (cuenta.cliente as any)?.id ?? null;
      if (!actual) return { success: true, sinCambios: true };
      const r = await m.createQueryBuilder().update(CuentaCliente)
        .set({ cliente: null as any, vinculadoPor: null as any, vinculadoEn: null as any })
        .where('id = :id AND cliente_id = :cli', { id: idCuenta, cli: actual })
        .execute();
      if (!r.affected) return { success: false, error: 'cuenta_cambio_reintentar' };
      await m.getRepository(CuentaClienteVinculo).save(m.getRepository(CuentaClienteVinculo).create({
        cuentaClienteId: idCuenta, clienteId: actual, accion: AccionVinculoCuenta.DESVINCULAR, motivo: motivoN,
        createdBy: { id: usuario.id } as any, updatedBy: { id: usuario.id } as any,
      }));
      return { success: true };
    });
  });

  /** Para la ficha del cliente: su cuenta web vinculada, si tiene. */
  ipcMain.handle('get-cuenta-tienda-de-cliente', async (_e: any, clienteId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_VER_CUENTAS);
    const c = await repo().createQueryBuilder('c')
      .leftJoinAndSelect('c.vinculadoPor', 'vp')
      .where('c.cliente_id = :id', { id: Number(clienteId) })
      .getOne();
    if (!c) return { success: true, data: null };
    return {
      success: true,
      data: {
        id: c.id, nombre: c.nombre ?? null, telefono: c.telefono ?? null, email: c.email ?? null,
        vinculadoPor: (c.vinculadoPor as any)?.nickname ?? null, vinculadoEn: c.vinculadoEn ?? null,
      },
    };
  });
}
