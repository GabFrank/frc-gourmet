import { DataSource } from 'typeorm';
import { Persona } from '../../src/app/database/entities/personas/persona.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Role } from '../../src/app/database/entities/personas/role.entity';
import { UsuarioRole } from '../../src/app/database/entities/personas/usuario-role.entity';
import { RolePermission } from '../../src/app/database/entities/personas/role-permission.entity';
import { Permission } from '../../src/app/database/entities/personas/permission.entity';
import { TipoCliente } from '../../src/app/database/entities/personas/tipo-cliente.entity';
import { TipoPrecio } from '../../src/app/database/entities/financiero/tipo-precio.entity';
import { MonedaBillete } from '../../src/app/database/entities/financiero/moneda-billete.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { Dispositivo } from '../../src/app/database/entities/financiero/dispositivo.entity';
import { Sector } from '../../src/app/database/entities/ventas/sector.entity';
import { Cargo } from '../../src/app/database/entities/rrhh/cargo.entity';
import { MotivoVale } from '../../src/app/database/entities/rrhh/motivo-vale.entity';
import { hashPassword } from './password.utils';

/**
 * Seed de datos minimos del sistema para que la app sea operable post-reset.
 * Idempotente: solo inserta si las tablas estan vacias.
 *
 * IMPORTANTE: este seed corre DESPUES de seedPermissions y seedInitialData
 * para poder vincular el rol admin a todos los permisos seedeados.
 */
export async function seedSystemData(dataSource: DataSource): Promise<void> {
  console.log('Checking if system seed data is needed...');
  try {
    await seedAdminUserAndRole(dataSource);
    await syncAdminPermissions(dataSource);
    await seedTipoCliente(dataSource);
    await seedTipoPrecio(dataSource);
    await seedMonedasBilletes(dataSource);
    await seedDispositivoDefault(dataSource);
    await seedSectorDefault(dataSource);
    await seedCargosBasicos(dataSource);
    await seedMotivosVale(dataSource);
    console.log('System seed data check complete.');
  } catch (error) {
    console.error('Error during system seed:', error);
  }
}

/**
 * Si el rol ADMINISTRADOR ya existe (admin creado en seed inicial), asegura que
 * tenga TODOS los permisos del sistema, incluyendo los agregados despues.
 * Idempotente: solo asigna los faltantes.
 */
async function syncAdminPermissions(dataSource: DataSource): Promise<void> {
  const roleRepo = dataSource.getRepository(Role);
  const adminRole = await roleRepo.findOne({ where: { descripcion: 'ADMINISTRADOR' } });
  if (!adminRole) return;

  const permissionRepo = dataSource.getRepository(Permission);
  const rolePermissionRepo = dataSource.getRepository(RolePermission);

  const allPermissions = await permissionRepo.find();
  let added = 0;
  for (const perm of allPermissions) {
    const exists = await rolePermissionRepo.findOne({
      where: { role: { id: adminRole.id }, permission: { id: perm.id } },
    });
    if (!exists) {
      const rp = rolePermissionRepo.create({ role: adminRole, permission: perm });
      await rolePermissionRepo.save(rp);
      added++;
    }
  }
  if (added > 0) {
    console.log(`  Sync ADMINISTRADOR: ${added} permiso(s) nuevos asignados.`);
  }
}

// ===================== ADMIN USER + ROLE + PERMISOS =====================
async function seedAdminUserAndRole(dataSource: DataSource): Promise<void> {
  const usuarioRepo = dataSource.getRepository(Usuario);
  const userCount = await usuarioRepo.count();
  if (userCount > 0) {
    console.log(`  Usuarios: ${userCount} ya existen, skipping admin seed.`);
    return;
  }

  const personaRepo = dataSource.getRepository(Persona);
  const roleRepo = dataSource.getRepository(Role);
  const usuarioRoleRepo = dataSource.getRepository(UsuarioRole);
  const permissionRepo = dataSource.getRepository(Permission);
  const rolePermissionRepo = dataSource.getRepository(RolePermission);

  const persona = personaRepo.create({
    nombre: 'ADMINISTRADOR',
    apellido: 'SISTEMA',
    activo: true,
  } as any);
  const savedPersona = await personaRepo.save(persona);

  const usuario = usuarioRepo.create({
    persona: savedPersona,
    nickname: 'admin',
    password: await hashPassword('admin'),
    activo: true,
  });
  await usuarioRepo.save(usuario);

  let adminRole = await roleRepo.findOne({ where: { descripcion: 'ADMINISTRADOR' } });
  if (!adminRole) {
    adminRole = roleRepo.create({ descripcion: 'ADMINISTRADOR', activo: true });
    adminRole = await roleRepo.save(adminRole);
  }

  const usuarioRole = usuarioRoleRepo.create({ usuario, role: adminRole });
  await usuarioRoleRepo.save(usuarioRole);

  const allPermissions = await permissionRepo.find();
  let assignedCount = 0;
  for (const perm of allPermissions) {
    const exists = await rolePermissionRepo.findOne({
      where: { role: { id: adminRole.id }, permission: { id: perm.id } },
    });
    if (!exists) {
      const rp = rolePermissionRepo.create({ role: adminRole, permission: perm });
      await rolePermissionRepo.save(rp);
      assignedCount++;
    }
  }
  console.log(`  Admin user creado (admin/admin) + rol ADMINISTRADOR con ${assignedCount} permisos asignados.`);
}

// ===================== TIPO CLIENTE =====================
async function seedTipoCliente(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(TipoCliente);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  TipoCliente: ${count} ya existen, skipping.`);
    return;
  }

  const tipos = [
    { descripcion: 'CONSUMIDOR FINAL', activo: true, credito: false, descuento: false, porcentaje_descuento: 0 },
    { descripcion: 'CLIENTE FRECUENTE', activo: true, credito: false, descuento: true, porcentaje_descuento: 5 },
    { descripcion: 'CLIENTE CORPORATIVO', activo: true, credito: true, descuento: true, porcentaje_descuento: 10 },
  ];

  for (const data of tipos) {
    const entity = repo.create(data);
    await repo.save(entity);
  }
  console.log(`  TipoCliente: ${tipos.length} creados.`);
}

// ===================== TIPO PRECIO =====================
async function seedTipoPrecio(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(TipoPrecio);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  TipoPrecio: ${count} ya existen, skipping.`);
    return;
  }

  const tipos = [
    { descripcion: 'PRECIO NORMAL', autorizacion: false, activo: true },
    { descripcion: 'PRECIO DELIVERY', autorizacion: false, activo: true },
    { descripcion: 'PRECIO MAYORISTA', autorizacion: true, activo: true },
  ];

  for (const data of tipos) {
    const entity = repo.create(data);
    await repo.save(entity);
  }
  console.log(`  TipoPrecio: ${tipos.length} creados.`);
}

// ===================== MONEDAS BILLETES =====================
async function seedMonedasBilletes(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(MonedaBillete);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  MonedaBillete: ${count} ya existen, skipping.`);
    return;
  }

  const monedaRepo = dataSource.getRepository(Moneda);
  const guarani = await monedaRepo.findOneBy({ denominacion: 'GUARANI' });
  const dolar = await monedaRepo.findOneBy({ denominacion: 'DOLAR' });
  const real = await monedaRepo.findOneBy({ denominacion: 'REAL' });

  if (!guarani) {
    console.log('  MonedaBillete: skipping, GUARANI no encontrado.');
    return;
  }

  const billetes: { moneda: Moneda; valor: number }[] = [];
  // PYG denominaciones tipicas
  for (const v of [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]) {
    billetes.push({ moneda: guarani, valor: v });
  }
  if (dolar) {
    for (const v of [1, 5, 10, 20, 50, 100]) {
      billetes.push({ moneda: dolar, valor: v });
    }
  }
  if (real) {
    for (const v of [2, 5, 10, 20, 50, 100, 200]) {
      billetes.push({ moneda: real, valor: v });
    }
  }

  for (const data of billetes) {
    const entity = repo.create({ ...data, activo: true });
    await repo.save(entity);
  }
  console.log(`  MonedaBillete: ${billetes.length} creados.`);
}

// ===================== DISPOSITIVO DEFAULT =====================
async function seedDispositivoDefault(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Dispositivo);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Dispositivo: ${count} ya existen, skipping.`);
    return;
  }

  const dispositivos = [
    { nombre: 'TERMINAL PRINCIPAL', isVenta: true, isCaja: true, isTouch: false, isMobile: false, activo: true },
  ];

  for (const data of dispositivos) {
    const entity = repo.create(data);
    await repo.save(entity);
  }
  console.log(`  Dispositivo: ${dispositivos.length} creado.`);
}

// ===================== SECTOR DEFAULT =====================
async function seedSectorDefault(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Sector);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Sector: ${count} ya existen, skipping.`);
    return;
  }

  const sectores = [
    { nombre: 'SALON', activo: true },
    { nombre: 'TERRAZA', activo: true },
    { nombre: 'BARRA', activo: true },
  ];

  for (const data of sectores) {
    const entity = repo.create(data);
    await repo.save(entity);
  }
  console.log(`  Sector: ${sectores.length} creados.`);
}

// ===================== CARGOS BASICOS =====================
async function seedCargosBasicos(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Cargo);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Cargo: ${count} ya existen, skipping.`);
    return;
  }

  const cargos = [
    { nombre: 'ADMINISTRADOR', activo: true },
    { nombre: 'CAJERO', activo: true },
    { nombre: 'MOZO', activo: true },
    { nombre: 'COCINERO', activo: true },
    { nombre: 'AYUDANTE COCINA', activo: true },
    { nombre: 'DELIVERY', activo: true },
    { nombre: 'LIMPIEZA', activo: true },
  ];

  for (const data of cargos) {
    const entity = repo.create(data as any);
    await repo.save(entity);
  }
  console.log(`  Cargo: ${cargos.length} creados.`);
}

// ===================== MOTIVOS DE VALE =====================
async function seedMotivosVale(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(MotivoVale);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  MotivoVale: ${count} ya existen, skipping.`);
    return;
  }

  const motivos = [
    { nombre: 'ADELANTO DE SUELDO', activo: true },
    { nombre: 'PRESTAMO PERSONAL', activo: true },
    { nombre: 'EMERGENCIA', activo: true },
    { nombre: 'OTROS', activo: true },
  ];

  for (const data of motivos) {
    const entity = repo.create(data as any);
    await repo.save(entity);
  }
  console.log(`  MotivoVale: ${motivos.length} creados.`);
}
