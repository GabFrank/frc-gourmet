import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CuentaBancariaDestino } from '../../src/app/database/entities/financiero/cuenta-bancaria-destino.entity';
import { Persona } from '../../src/app/database/entities/personas/persona.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';

/**
 * Handlers para Cuentas Bancarias de Destino (terceros, sin saldo).
 * 
 * DIFERENCIA CON banking.handler.ts (CuentaBancaria empresa):
 * - CuentaBancariaDestino: info de cobro de terceros (proveedores/clientes/funcionarios)
 * - CuentaBancaria: activos con saldo de la empresa
 * 
 * Fase 1 MVP: Solo proveedores. Cliente/Funcionario en fases 2-3.
 */
export function registerCuentasBancariasDestinoHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ── CREATE ──
  ipcMain.handle(
    'create-cuenta-bancaria-destino',
    async (_event, payload: Partial<CuentaBancariaDestino>) => {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CTA_BANCARIA_DESTINO_CREAR');

      const repo = dataSource.getRepository(CuentaBancariaDestino);

      // Validar que persona existe y está activa
      if (!payload.personaId) {
        throw new Error('personaId es requerido');
      }
      const personaRepo = dataSource.getRepository(Persona);
      const persona = await personaRepo.findOne({ where: { id: payload.personaId } });
      if (!persona) {
        throw new Error(`Persona ${payload.personaId} no encontrada`);
      }
      if (!persona.activo) {
        throw new Error('La persona está desactivada');
      }

      // Validar campos requeridos
      if (!payload.banco) throw new Error('banco es requerido');
      if (!payload.numeroCuenta) throw new Error('numeroCuenta es requerido');
      if (!payload.monedaId) throw new Error('monedaId es requerido');

      // Derivar titular de persona (desnormalizado, readonly en UI)
      const titular = `${persona.nombre || ''} ${persona.apellido || ''}`.trim().toUpperCase();
      if (!titular) {
        throw new Error('La persona no tiene nombre/apellido para derivar titular');
      }

      const cuenta = repo.create({
        ...payload,
        banco: payload.banco.toUpperCase(),
        numeroCuenta: payload.numeroCuenta.toUpperCase(),
        alias: payload.alias?.toUpperCase(),
        titular, // Derivado de persona
        activo: true,
      });

      setEntityUserTracking(dataSource, cuenta, getCurrentUser()?.id, false);
      const saved = await repo.save(cuenta);

      // Hidratar relaciones
      return await repo.findOne({
        where: { id: saved.id },
        relations: ['persona', 'moneda'],
      });
    }
  );

  // ── UPDATE ──
  ipcMain.handle(
    'update-cuenta-bancaria-destino',
    async (_event, id: number, payload: Partial<CuentaBancariaDestino>) => {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR');

      const repo = dataSource.getRepository(CuentaBancariaDestino);
      const cuenta = await repo.findOne({ where: { id }, relations: ['persona'] });
      if (!cuenta) {
        throw new Error(`Cuenta bancaria destino ${id} no encontrada`);
      }

      // personaId es INMUTABLE (no se puede cambiar una vez creada)
      if (payload.personaId && payload.personaId !== cuenta.personaId) {
        throw new Error('No se puede cambiar personaId de una cuenta existente');
      }

      // Si cambiaron datos de persona, re-derivar titular
      let titular = cuenta.titular;
      if (cuenta.persona) {
        const personaRepo = dataSource.getRepository(Persona);
        const personaActualizada = await personaRepo.findOne({ where: { id: cuenta.personaId } });
        if (personaActualizada) {
          titular = `${personaActualizada.nombre || ''} ${personaActualizada.apellido || ''}`.trim().toUpperCase();
        }
      }

      // Aplicar cambios
      Object.assign(cuenta, {
        banco: payload.banco ? payload.banco.toUpperCase() : cuenta.banco,
        numeroCuenta: payload.numeroCuenta ? payload.numeroCuenta.toUpperCase() : cuenta.numeroCuenta,
        alias: payload.alias !== undefined ? payload.alias?.toUpperCase() : cuenta.alias,
        monedaId: payload.monedaId || cuenta.monedaId,
        tipoCuenta: payload.tipoCuenta || cuenta.tipoCuenta,
        observacion: payload.observacion !== undefined ? payload.observacion : cuenta.observacion,
        titular, // Re-derivado
      });

      setEntityUserTracking(dataSource, cuenta, getCurrentUser()?.id, true);
      const saved = await repo.save(cuenta);

      return await repo.findOne({
        where: { id: saved.id },
        relations: ['persona', 'moneda'],
      });
    }
  );

  // ── DELETE (soft) ──
  ipcMain.handle('delete-cuenta-bancaria-destino', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR');

    const repo = dataSource.getRepository(CuentaBancariaDestino);
    const cuenta = await repo.findOne({ where: { id } });
    if (!cuenta) {
      throw new Error(`Cuenta bancaria destino ${id} no encontrada`);
    }

    // Validar que NO esté marcada como default en proveedor/cliente/funcionario activo
    // Fase 1: solo proveedores
    const proveedorRepo = dataSource.getRepository('Proveedor');
    const proveedorConCuenta = await proveedorRepo
      .createQueryBuilder('p')
      .where('p.cuenta_bancaria_default_id = :cuentaId', { cuentaId: id })
      .andWhere('p.activo = :activo', { activo: true })
      .getOne();

    if (proveedorConCuenta) {
      throw new Error(
        `No se puede desactivar: está marcada como cuenta preferida del proveedor "${(proveedorConCuenta as any).nombre}". Desmarcá primero.`
      );
    }

    // Soft delete
    cuenta.activo = false;
    setEntityUserTracking(dataSource, cuenta, getCurrentUser()?.id, true);
    await repo.save(cuenta);

    return { id, activo: false };
  });

  // ── GET BY PERSONA ──
  ipcMain.handle(
    'get-cuentas-bancarias-destino-by-persona',
    async (_event, payload: { personaId: number; incluirInactivas?: boolean }) => {
      // LECTURA PÚBLICA (sin permiso) — diseño documentado en domains/cuentas-bancarias.md
      const repo = dataSource.getRepository(CuentaBancariaDestino);

      const where: any = { personaId: payload.personaId };
      if (!payload.incluirInactivas) {
        where.activo = true;
      }

      return await repo.find({
        where,
        relations: ['persona', 'moneda'],
        order: { createdAt: 'DESC' },
      });
    }
  );

  // ── GET ONE ──
  ipcMain.handle('get-cuenta-bancaria-destino', async (_event, id: number) => {
    // LECTURA PÚBLICA (sin permiso)
    const repo = dataSource.getRepository(CuentaBancariaDestino);
    const cuenta = await repo.findOne({
      where: { id },
      relations: ['persona', 'moneda'],
    });

    if (!cuenta) {
      throw new Error(`Cuenta bancaria destino ${id} no encontrada`);
    }

    return cuenta;
  });

  console.log('[Cuentas Bancarias Destino handlers] Registrados (Fase 1 MVP: proveedores)');
}
