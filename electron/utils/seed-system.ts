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
import { Familia } from '../../src/app/database/entities/productos/familia.entity';
import { Subfamilia } from '../../src/app/database/entities/productos/subfamilia.entity';
import { Observacion } from '../../src/app/database/entities/productos/observacion.entity';
import { Turno } from '../../src/app/database/entities/rrhh/turno.entity';
import { Feriado } from '../../src/app/database/entities/rrhh/feriado.entity';
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
    await seedRolesPlantilla(dataSource);
    await seedTipoCliente(dataSource);
    await seedTipoPrecio(dataSource);
    await seedMonedasBilletes(dataSource);
    await seedDispositivoDefault(dataSource);
    await seedSectorDefault(dataSource);
    await seedCargosBasicos(dataSource);
    await seedMotivosVale(dataSource);
    await seedFamiliaSubfamiliaDefault(dataSource);
    await seedTurnosDefault(dataSource);
    await seedFeriadosNacionalesPY(dataSource);
    await seedObservacionesBasicas(dataSource);
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

// ===================== FAMILIA / SUBFAMILIA DEFAULT =====================
async function seedFamiliaSubfamiliaDefault(dataSource: DataSource): Promise<void> {
  const famRepo = dataSource.getRepository(Familia);
  const count = await famRepo.count();
  if (count > 0) {
    console.log(`  Familia: ${count} ya existen, skipping.`);
    return;
  }

  const familia = await famRepo.save(famRepo.create({ nombre: 'GENERAL', activo: true }));

  const subRepo = dataSource.getRepository(Subfamilia);
  await subRepo.save(subRepo.create({ nombre: 'GENERAL', activo: true, familia }));

  console.log('  Familia/Subfamilia: 1 default "GENERAL" creada.');
}

// ===================== TURNOS DEFAULT =====================
async function seedTurnosDefault(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Turno);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Turno: ${count} ya existen, skipping.`);
    return;
  }

  const turnos = [
    { nombre: 'MAÑANA', horaEntrada: '06:00', horaSalida: '14:00', toleranciaTardanzaMinutos: 5, activo: true },
    { nombre: 'TARDE', horaEntrada: '14:00', horaSalida: '22:00', toleranciaTardanzaMinutos: 5, activo: true },
    { nombre: 'NOCHE', horaEntrada: '22:00', horaSalida: '06:00', toleranciaTardanzaMinutos: 5, activo: true },
  ];

  for (const data of turnos) {
    const entity = repo.create(data as any);
    await repo.save(entity);
  }
  console.log(`  Turno: ${turnos.length} creados.`);
}

// ===================== FERIADOS NACIONALES PY =====================
// Sembramos feriados fijos del anio en curso. Los movibles (Jueves/Viernes Santo)
// requieren calculo de Pascua y los carga el usuario manualmente.
// Idempotente por fecha (unique).
async function seedFeriadosNacionalesPY(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Feriado);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Feriado: ${count} ya existen, skipping.`);
    return;
  }

  const year = new Date().getFullYear();
  const fijos: Array<{ mes: number; dia: number; descripcion: string }> = [
    { mes: 1, dia: 1, descripcion: 'AÑO NUEVO' },
    { mes: 3, dia: 1, descripcion: 'DIA DE LOS HEROES' },
    { mes: 5, dia: 1, descripcion: 'DIA DEL TRABAJADOR' },
    { mes: 5, dia: 14, descripcion: 'DIA DE LA INDEPENDENCIA' },
    { mes: 5, dia: 15, descripcion: 'DIA DE LA INDEPENDENCIA' },
    { mes: 6, dia: 12, descripcion: 'PAZ DEL CHACO' },
    { mes: 8, dia: 15, descripcion: 'FUNDACION DE ASUNCION' },
    { mes: 9, dia: 29, descripcion: 'BATALLA DE BOQUERON' },
    { mes: 12, dia: 8, descripcion: 'VIRGEN DE CAACUPE' },
    { mes: 12, dia: 25, descripcion: 'NAVIDAD' },
  ];

  for (const f of fijos) {
    const entity = repo.create({
      fecha: new Date(year, f.mes - 1, f.dia),
      descripcion: f.descripcion,
      esNacional: true,
      recargoPorcentaje: 100,
      activo: true,
    });
    await repo.save(entity);
  }
  console.log(`  Feriado: ${fijos.length} feriados nacionales PY ${year} creados.`);
}

// ===================== OBSERVACIONES BASICAS =====================
async function seedObservacionesBasicas(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Observacion);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Observacion: ${count} ya existen, skipping.`);
    return;
  }

  const observaciones = [
    'PARA LLEVAR',
    'PARA COMER AQUI',
    'SIN HIELO',
    'SIN CEBOLLA',
    'SIN TOMATE',
    'SIN SAL',
    'POCO COCIDO',
    'TERMINO MEDIO',
    'BIEN COCIDO',
    'SIN PICANTE',
    'EXTRA PICANTE',
  ];

  for (const descripcion of observaciones) {
    const entity = repo.create({ descripcion, activo: true });
    await repo.save(entity);
  }
  console.log(`  Observacion: ${observaciones.length} creadas.`);
}

// ===================== ROLES PLANTILLA =====================
// Crea roles plantilla con permisos curados si no existen. Idempotente por
// descripcion: si el rol ya existe (creado por usuario), NO toca sus permisos.
const ROLES_PLANTILLA: Array<{ descripcion: string; permisos: string[] }> = [
  {
    descripcion: 'GERENTE',
    permisos: [
      'HOME_DASHBOARD_VER',
      'VENTAS_DASHBOARD_VER', 'COMPRAS_DASHBOARD_VER', 'PRODUCTOS_DASHBOARD_VER',
      'FINANCIERO_DASHBOARD_VER', 'CAJA_MAYOR_DASHBOARD_VER', 'RRHH_DASHBOARD_VER',
      'RRHH_FUNCIONARIO_VER', 'RRHH_FUNCIONARIO_EDITAR',
      'RRHH_ASISTENCIA_REGISTRAR', 'RRHH_ASISTENCIA_JUSTIFICAR',
      'RRHH_VALE_CREAR', 'RRHH_VALE_CONFIRMAR',
      'RRHH_PRESTAMO_OTORGAR',
      'RRHH_LIQUIDACION_GENERAR', 'RRHH_LIQUIDACION_APROBAR', 'RRHH_LIQUIDACION_PAGAR',
      'RRHH_VACACION_GESTIONAR', 'RRHH_LIQUIDACION_FINAL_GENERAR',
      'RRHH_PENALIZACION_REGISTRAR', 'RRHH_BONO_OTORGAR',
      'RRHH_REPORTE_GENERAR', 'RRHH_NOTIFICACIONES_VER',
      'COMISION_REGLA_VER', 'COMISION_REGLA_GESTIONAR', 'COMISION_REGLA_EDITAR',
      'COMISION_LIQUIDACION_GENERAR', 'COMISION_LIQUIDACION_APROBAR',
      'COMISION_EQUIPO_GESTIONAR',
      'CPC_GESTIONAR', 'CPC_COBRAR', 'CPC_CANCELAR',
      'COMPRAS_IMPORTAR_FACTURA',
    ],
  },
  {
    descripcion: 'CAJERO',
    permisos: [
      'HOME_DASHBOARD_VER', 'VENTAS_DASHBOARD_VER', 'CAJA_MAYOR_DASHBOARD_VER',
      'CPC_COBRAR',
      'RRHH_ASISTENCIA_REGISTRAR',
    ],
  },
  {
    descripcion: 'MOZO',
    permisos: [
      'HOME_DASHBOARD_VER',
      'RRHH_ASISTENCIA_REGISTRAR',
    ],
  },
];

async function seedRolesPlantilla(dataSource: DataSource): Promise<void> {
  const roleRepo = dataSource.getRepository(Role);
  const permissionRepo = dataSource.getRepository(Permission);
  const rolePermissionRepo = dataSource.getRepository(RolePermission);

  for (const plantilla of ROLES_PLANTILLA) {
    const existing = await roleRepo.findOne({ where: { descripcion: plantilla.descripcion } });
    if (existing) {
      console.log(`  Rol ${plantilla.descripcion}: ya existe, skipping.`);
      continue;
    }

    const role = await roleRepo.save(roleRepo.create({ descripcion: plantilla.descripcion, activo: true }));

    let assigned = 0;
    for (const codigo of plantilla.permisos) {
      const perm = await permissionRepo.findOne({ where: { codigo } });
      if (!perm) continue;
      await rolePermissionRepo.save(rolePermissionRepo.create({ role, permission: perm }));
      assigned++;
    }
    console.log(`  Rol ${plantilla.descripcion}: creado con ${assigned}/${plantilla.permisos.length} permisos.`);
  }
}
