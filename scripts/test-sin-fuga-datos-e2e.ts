/**
 * E2E: los canales de lectura del dominio caja NO publican el hash de la
 * contraseña ni los datos personales del cajero, y todo lo que SÍ necesita el
 * hash sigue funcionando.
 *
 * Contexto: la investigación de las cajas 122/123 (2026-09-25) encontró que
 * `get-caja`, `getResumenCaja`, `getVentasByDateRange`, `get-retiros-caja`, …
 * devolvían la relación `createdBy` hidratada entera — o sea el **hash bcrypt
 * de la contraseña** del cajero y el documento/teléfono/dirección de su
 * `Persona` — a cualquier usuario con un JWT válido (`/api/rpc` es
 * default-allow). El fix de raíz es `@Column({ select: false })` en
 * `Usuario.password`; el resto es recortar los joins con
 * `electron/utils/select-usuario-publico.util.ts`.
 *
 * Uso: npm run test:sin-fuga-datos
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PODER DISCRIMINANTE — qué revertir para que falle cada assert
 * ─────────────────────────────────────────────────────────────────────────────
 *  [1]  sin `password` en los 11 canales   → volver cualquiera de los 11 joins
 *       a `leftJoinAndSelect` de `createdBy` **y** sacar el `select: false`
 *       (los dos fixes se tapan entre sí en estos canales: por eso el fix de
 *       raíz tiene su propio assert, el [1b])
 *  [1b] fix de raíz, fuera de los 11       → sacar `select: false` de
 *       `src/app/database/entities/personas/usuario.entity.ts`
 *  [1c] el fix de raíz en el patrón EXACTO de la deuda (`leftJoinAndSelect` de
 *       una relación a `Usuario`, que es como leen los ~20 canales que no se
 *       recortaron) → sacar `select: false`
 *  [2]  sin datos personales del cajero    → volver cualquier
 *       `selectUsuarioPublico(...)` a `leftJoinAndSelect` de `createdBy` +
 *       `createdBy.persona` (financiero.handler, ventas.handler,
 *       caja-mayor.handler, gastos-caja.handler, pdv-egresos.handler,
 *       resumen-caja.utils)
 *  [2b] sin columnas salariales del repartidor → volver
 *       `delivery.handler.ts` a `leftJoinAndSelect('delivery.entregadoPorFuncionario', …)`
 *  [2c] sin teléfono/email/fecha de nacimiento del CLIENTE en
 *       `delivery-listar-pdv` → volver su `leftJoin('cliente.persona', …)` +
 *       `addSelect([...])` a `leftJoinAndSelect`
 *  [2d] sin documento/teléfono/dirección/email/fecha de nacimiento de la
 *       `Persona` del REPARTIDOR → volver su `leftJoin('repartidor.persona', …)`
 *       a `leftJoinAndSelect`, o agregar un campo a
 *       `COLUMNAS_PERSONA_REPARTIDOR` (`delivery.handler.ts`)
 *  [3]  SÍ nickname y persona.nombre       → recortar de más (p. ej. sacar
 *       `nickname` de `COLUMNAS_USUARIO_PUBLICO`)
 *  [3b] SÍ el usuario recortado en los otros 3 canales de caja y en el retiro →
 *       romper el alias de `selectUsuarioPublico` (la relación llega `null` y los
 *       asserts negativos pasarían igual, con la UI sin cajero)
 *  [3c] SÍ el responsable del retiro MANUAL en `getResumenCaja`, y sin datos
 *       personales → romper/ampliar el `selectUsuarioPublico` de
 *       `resumen-caja.utils.ts`
 *  [4]  login IPC                          → sacar el `addSelect('usuario.password')`
 *       de `auth.handler.ts` (`login`)
 *  [4b] login HTTP                         → sacar el `addSelect` de
 *       `electron/server/auth-routes.ts`
 *  [5]  change-password + login con la nueva → sacar el `addSelect` de
 *       `personas.handler.ts` (`change-password`) o romper su `save`
 *  [5b] updateUsuario no rompe el hash     → en `personas.handler.ts`
 *       (`update-usuario`) forzar `usuario.password = usuarioData.password ?? ''`
 *       antes del `save` (es el modo de falla que `select: false` habilita)
 *  [5c] reset-password-with-code           → romper el `save` de
 *       `password-recovery.handler.ts`
 *  [5d] `update-usuario` CON password nuevo y `create-usuario` no devuelven el
 *       hash → sacar el recorte del `return` de `update-usuario`
 *       (`personas.handler.ts`) o devolver la entidad guardada en vez del refetch
 *       en `create-usuario`. `select: false` NO cubre esto: el hash se setea en
 *       memoria después de cargar la entidad
 *  [6]  validate-credentials               → sacar su `addSelect` en `auth.handler.ts`
 *  [6b] validate-credentials no devuelve el hash → devolver la entidad entera en
 *       vez de la proyección `{ id, nickname, persona }`
 *  [7]  migratePlaintextPasswords          → volver `electron/utils/migrate-passwords.ts`
 *       a `repo.find()` (sin el `addSelect` se vuelve un no-op SILENCIOSO)
 *  [8]  seed del admin default             → sacar el `addSelect` de
 *       `markDefaultAdminMustChangePassword` en `electron/utils/seed-system.ts`
 *  [8b] tarea de onboarding PASSWORD_ADMIN → sacar el `addSelect` de su `detect`
 *       en `electron/handlers/onboarding-tasks.config.ts` (sin él la tarea se
 *       marca COMPLETA con el admin todavía en `admin`/`admin`)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { hashPassword, isHashed, verifyPassword } from '../electron/utils/password.utils';
import { migratePlaintextPasswords } from '../electron/utils/migrate-passwords';
import { seedSystemData } from '../electron/utils/seed-system';
import { registerFinancieroHandlers } from '../electron/handlers/financiero.handler';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';
import { registerGastosCajaHandlers } from '../electron/handlers/gastos-caja.handler';
import { registerPdvEgresosHandlers } from '../electron/handlers/pdv-egresos.handler';
import { registerDeliveryHandlers } from '../electron/handlers/delivery.handler';
import { registerPersonasHandlers } from '../electron/handlers/personas.handler';
import { registerAuthHandlers } from '../electron/handlers/auth.handler';
import { registerPasswordRecoveryHandlers } from '../electron/handlers/password-recovery.handler';
import { ONBOARDING_TASKS } from '../electron/handlers/onboarding-tasks.config';
import { startServer, stopServer } from '../electron/server/server';

const PUERTO_HTTP = 17171;

/** Campos de la `Persona` de un usuario que NO deben salir de estos canales. */
const CAMPOS_PROHIBIDOS_PERSONA = ['documento', 'telefono', 'direccion', 'email', 'fechaNacimiento'];
/** Columnas de sueldo del `Funcionario` repartidor. */
const CAMPOS_PROHIBIDOS_FUNCIONARIO = ['salarioBase', 'valorJornal', 'numeroIps', 'cuentaBancariaPropia'];

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/**
 * Recorre la respuesta entera (objetos, arrays, cualquier profundidad) y llama
 * a `visitar` por cada par clave/valor. Cortar por tipo (p. ej. "sólo miro
 * `createdBy`") sería justamente lo que dejó pasar el bug: el hash viajaba por
 * un join que nadie había listado.
 */
function caminar(
  valor: any,
  visitar: (clave: string, v: any, ruta: string, contenedor: any) => void,
  ruta = '$',
  vistos = new Set<any>(),
): void {
  if (valor === null || typeof valor !== 'object') return;
  if (vistos.has(valor)) return;
  vistos.add(valor);
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => caminar(v, visitar, `${ruta}[${i}]`, vistos));
    return;
  }
  if (valor instanceof Date) return;
  for (const clave of Object.keys(valor)) {
    const hijo = (valor as any)[clave];
    visitar(clave, hijo, `${ruta}.${clave}`, valor);
    caminar(hijo, visitar, `${ruta}.${clave}`, vistos);
  }
}

/** Devuelve las rutas donde aparece alguna de las claves buscadas. */
function rutasConClave(respuesta: any, claves: string[]): string[] {
  const encontradas: string[] = [];
  caminar(respuesta, (clave, _v, ruta) => {
    if (claves.includes(clave)) encontradas.push(ruta);
  });
  return encontradas;
}

/**
 * Objetos que "parecen" un `Usuario`: tienen `nickname`. Es el discriminador
 * que no depende del nombre de la relación (`createdBy`, `revisadoPor`,
 * `responsableRetiro`, `responsableIngreso`, …).
 */
function usuariosEn(respuesta: any): any[] {
  const usuarios: any[] = [];
  const vistos = new Set<any>();
  const recorrer = (valor: any): void => {
    if (valor === null || typeof valor !== 'object' || vistos.has(valor)) return;
    vistos.add(valor);
    if (Array.isArray(valor)) { valor.forEach(recorrer); return; }
    if (valor instanceof Date) return;
    if (Object.prototype.hasOwnProperty.call(valor, 'nickname')) usuarios.push(valor);
    Object.values(valor).forEach(recorrer);
  };
  recorrer(respuesta);
  return usuarios;
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-sin-fuga-datos.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[sin-fuga-datos] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { PasswordResetToken } = E('auth/password-reset-token.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { GastoCaja } = E('financiero/gasto-caja.entity');
  const { EgresoCaja } = E('financiero/egreso-caja.entity');
  const { RetiroCaja } = E('financiero/retiro-caja.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { Venta } = E('ventas/venta.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // ── Fixture ───────────────────────────────────────────────────────────────
  // La persona del cajero lleva TODOS los campos sensibles cargados: si el
  // recorte no funciona, el assert 2 los encuentra. Con la persona vacía el
  // test pasaría con el bug adentro.
  const personaCajero: any = await save(Persona, {
    nombre: 'CAROLINA', apellido: 'GIMENEZ', tipoPersona: 'FISICA', activo: true,
    documento: '1234567', telefono: '0981111111', direccion: 'AVDA. SIEMPRE VIVA 742',
    email: 'cajera@ejemplo.com', fechaNacimiento: new Date('1990-05-20'),
    tipoDocumento: 'CI',
  });
  const PASS_INICIAL = 'secreto123';
  const cajero: any = await save(Usuario, {
    persona: { id: personaCajero.id }, nickname: 'cajera',
    password: await hashPassword(PASS_INICIAL), activo: true, mustChangePassword: false,
  });

  const rol: any = await save(Role, { descripcion: 'CAJERO', activo: true });
  for (const codigo of ['VENTAS_PDV', 'FINANCIERO_CAJA_VER', 'FINANCIERO_CAJA_GESTIONAR', 'USUARIOS_GESTIONAR', 'CAJA_MAYOR_VER']) {
    const perm: any = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role: rol, permission: perm });
  }
  await save(UsuarioRole, { usuario: cajero, role: rol });

  const gs: any = await save(Moneda, {
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
  });
  const fpEfectivo: any = await save(FormasPago, {
    nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true,
  });
  const dispositivo: any = await save(Dispositivo, { nombre: 'TERMINAL PRINCIPAL', activo: true });
  const conteo: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
    conteoApertura: { id: conteo.id }, dispositivo: { id: dispositivo.id },
    createdBy: { id: cajero.id }, revisadoPor: { id: cajero.id },
  });

  // Cliente (su `Persona` es la del CLIENTE, no la de un usuario: el recorte de
  // acá es otro — nombre/apellido/documento/dirección).
  const personaCliente: any = await save(Persona, {
    nombre: 'JUAN', apellido: 'PEREZ', tipoPersona: 'FISICA', activo: true,
    documento: '7654321', telefono: '0982222222', direccion: 'CALLE FALSA 123',
    email: 'cliente@ejemplo.com', fechaNacimiento: new Date('1985-03-14'),
    tipoDocumento: 'CI',
  });
  const cliente: any = await save(Cliente, {
    persona: { id: personaCliente.id }, activo: true, tributa: false, credito: false, saldoActual: 0,
  });

  // Repartidor: el `Funcionario` con sueldo, IPS y cuenta bancaria cargados.
  const personaRepartidor: any = await save(Persona, {
    nombre: 'MARIO', apellido: 'BENITEZ', tipoPersona: 'FISICA', activo: true,
    documento: '5555555', telefono: '0983333333', direccion: 'BARRIO SAN MIGUEL',
    email: 'repartidor@ejemplo.com', fechaNacimiento: new Date('1992-11-02'),
    tipoDocumento: 'CI',
  });
  const cargo: any = await save(Cargo, { nombre: 'REPARTIDOR', activo: true });
  const repartidor: any = await save(Funcionario, {
    persona: { id: personaRepartidor.id }, cargo: { id: cargo.id },
    fechaIngreso: new Date('2024-01-01'), salarioBase: 2550000, monedaSalario: { id: gs.id },
    esJornalero: false, valorJornal: 95000, ipsActivo: true, numeroIps: 'IPS-998877',
    cuentaBancariaPropia: '0011223344', activo: true,
  });

  const venta: any = await save(Venta, {
    estado: 'ABIERTA', caja: { id: caja.id }, cliente: { id: cliente.id },
    createdBy: { id: cajero.id }, canalOrigen: 'LOCAL',
  });
  const delivery: any = await save(Delivery, {
    venta: { id: venta.id }, cliente: { id: cliente.id },
    estado: 'ABIERTO', modo: 'DELIVERY', fechaAbierto: new Date(), cobroAnticipado: false,
    entregadoPorFuncionario: { id: repartidor.id }, direccion: 'CALLE FALSA 123',
  });
  await ds.getRepository(Venta).update(venta.id, { delivery: { id: delivery.id } } as any);

  await save(GastoCaja, {
    caja: { id: caja.id }, descripcion: 'HIELO', monto: 25000, moneda: { id: gs.id },
    formaPago: { id: fpEfectivo.id }, fecha: new Date(), estado: 'ACTIVO', createdBy: { id: cajero.id },
  });
  await save(EgresoCaja, {
    caja: { id: caja.id }, tipo: 'VALE', monto: 50000, moneda: { id: gs.id },
    formaPago: { id: fpEfectivo.id }, fecha: new Date(), estado: 'ACTIVO',
    descripcion: 'VALE DE PRUEBA', createdBy: { id: cajero.id },
  });
  // `origen: 'MANUAL'` no es decorativo: `computeResumenCaja` filtra
  // `retiro.origen = MANUAL`, así que este retiro es el que ejercita el recorte
  // de `responsableRetiro` de `resumen-caja.utils.ts` (assert 3c).
  const retiro: any = await save(RetiroCaja, {
    caja: { id: caja.id }, estado: 'FLOTANTE', origen: 'MANUAL', fechaRetiro: new Date(),
    responsableRetiro: { id: cajero.id }, responsableIngreso: { id: cajero.id },
    createdBy: { id: cajero.id },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  let usuarioActual: any = cajero;
  const getCurrentUser = () => usuarioActual;
  registerFinancieroHandlers(ds, getCurrentUser);
  registerVentasHandlers(ds, getCurrentUser);
  registerCajaMayorHandlers(ds, getCurrentUser);
  registerGastosCajaHandlers(ds, getCurrentUser);
  registerPdvEgresosHandlers(ds, getCurrentUser);
  registerDeliveryHandlers(ds, getCurrentUser);
  registerPersonasHandlers(ds, getCurrentUser);
  registerPasswordRecoveryHandlers(ds, getCurrentUser);
  registerAuthHandlers(ds, getCurrentUser, (u: any) => { usuarioActual = u || usuarioActual; });

  const call = (canal: string, ...args: any[]) => invokeHandlerWithContext(canal, undefined, ...args);

  const desde = new Date(Date.now() - 86400000).toISOString();
  const hasta = new Date(Date.now() + 86400000).toISOString();

  // ── 1/2/3. Los 11 canales ─────────────────────────────────────────────────
  console.log('\n[1-3] Los 11 canales de lectura del dominio caja');
  const canales: { nombre: string; ejecutar: () => Promise<any> }[] = [
    { nombre: 'get-cajas', ejecutar: () => call('get-cajas') },
    { nombre: 'get-caja', ejecutar: () => call('get-caja', caja.id) },
    { nombre: 'get-caja-by-dispositivo', ejecutar: () => call('get-caja-by-dispositivo', dispositivo.id) },
    { nombre: 'get-cajas-abiertas', ejecutar: () => call('get-cajas-abiertas') },
    { nombre: 'getResumenCaja', ejecutar: () => call('getResumenCaja', caja.id) },
    { nombre: 'getVentasByDateRange', ejecutar: () => call('getVentasByDateRange', desde, hasta, {}) },
    { nombre: 'get-retiros-caja', ejecutar: () => call('get-retiros-caja', {}) },
    { nombre: 'get-retiro-caja', ejecutar: () => call('get-retiro-caja', retiro.id) },
    { nombre: 'get-gastos-caja', ejecutar: () => call('get-gastos-caja', caja.id, true) },
    { nombre: 'get-egresos-caja', ejecutar: () => call('get-egresos-caja', caja.id, true) },
    { nombre: 'delivery-listar-pdv', ejecutar: () => call('delivery-listar-pdv', caja.id, {}) },
  ];

  const respuestas = new Map<string, any>();
  for (const canal of canales) {
    let respuesta: any;
    try {
      respuesta = await canal.ejecutar();
    } catch (e: any) {
      ok(false, `${canal.nombre} responde`, String(e?.message || e));
      continue;
    }
    respuestas.set(canal.nombre, respuesta);

    // [1] ninguna clave `password`, a ninguna profundidad.
    const conPassword = rutasConClave(respuesta, ['password']);
    ok(conPassword.length === 0, `${canal.nombre}: sin clave "password"`, conPassword);

    // [2] ninguna Persona de un Usuario con datos sensibles.
    const fugas: string[] = [];
    for (const usuario of usuariosEn(respuesta)) {
      const persona = usuario?.persona;
      if (!persona || typeof persona !== 'object') continue;
      for (const campo of CAMPOS_PROHIBIDOS_PERSONA) {
        if (Object.prototype.hasOwnProperty.call(persona, campo)) {
          fugas.push(`${usuario.nickname}.persona.${campo}`);
        }
      }
    }
    ok(fugas.length === 0, `${canal.nombre}: sin datos personales del usuario`, fugas);
  }

  // Los 11 respondieron (si uno explotó, arriba quedó el ✗; esto lo hace explícito).
  ok(respuestas.size === canales.length, 'los 11 canales respondieron', respuestas.size);

  // [1b] EL FIX DE RAÍZ, aparte de los 11 canales.
  //
  // Por qué va separado: los recortes de `selectUsuarioPublico` ya alcanzan
  // para que esos 11 no publiquen el hash, así que el assert [1] sigue en verde
  // aunque alguien saque el `select: false` — son dos capas que se tapan. Lo
  // que sólo el `select: false` cubre son las **otras ~20 lecturas** que siguen
  // hidratando un `Usuario` entero (deuda declarada en `known-bugs.md` y
  // `todos-pendientes.md`). Estos dos asserts son los que fallan si se revierte.
  const usuariosCrudos = await ds.getRepository(Usuario).find({ relations: ['persona'] });
  ok(
    rutasConClave(usuariosCrudos, ['password']).length === 0,
    'un find() pelado de Usuario NO trae el hash (select: false)',
    rutasConClave(usuariosCrudos, ['password']),
  );
  const listaUsuarios = await call('get-usuarios');
  ok(
    rutasConClave(listaUsuarios, ['password']).length === 0,
    'get-usuarios (canal no recortado) tampoco publica el hash',
    rutasConClave(listaUsuarios, ['password']),
  );

  // [1c] El patrón EXACTO de la deuda declarada: los ~20 canales que no se
  // recortaron leen el usuario con `leftJoinAndSelect('X.createdBy', …)` o con
  // `find({ relations: ['createdBy'] })`. Que `select: false` valga ahí —y no
  // sólo en un `find()` de `Usuario` pelado— es la premisa entera del ahorro; si
  // TypeORM se comportara distinto por tipo de join, el assert [1b] no lo vería.
  const cajaConJoin = await ds.getRepository(Caja).createQueryBuilder('c')
    .leftJoinAndSelect('c.createdBy', 'createdBy')
    .getOne();
  ok(
    !!(cajaConJoin as any)?.createdBy && rutasConClave(cajaConJoin, ['password']).length === 0,
    'leftJoinAndSelect de una relación a Usuario tampoco trae el hash (select: false)',
    rutasConClave(cajaConJoin, ['password']),
  );
  const cajaConRelations = await ds.getRepository(Caja).find({ relations: ['createdBy'] });
  ok(
    !!(cajaConRelations[0] as any)?.createdBy && rutasConClave(cajaConRelations, ['password']).length === 0,
    'find({ relations: [createdBy] }) tampoco trae el hash (select: false)',
    rutasConClave(cajaConRelations, ['password']),
  );

  // [2b] columnas salariales del repartidor en delivery-listar-pdv.
  const listaDelivery = respuestas.get('delivery-listar-pdv');
  const salariales = rutasConClave(listaDelivery, CAMPOS_PROHIBIDOS_FUNCIONARIO);
  ok(salariales.length === 0, 'delivery-listar-pdv: sin columnas salariales del repartidor', salariales);
  // …y el nombre del repartidor SÍ tiene que seguir estando (el panel lo muestra).
  const filaDelivery = (listaDelivery?.data || [])[0];
  ok(
    filaDelivery?.entregadoPorFuncionario?.persona?.nombre === 'MARIO',
    'delivery-listar-pdv: el nombre del repartidor sigue llegando',
    filaDelivery?.entregadoPorFuncionario,
  );
  // El cliente conserva nombre y dirección (fallback de convertir-modo-delivery).
  ok(
    filaDelivery?.cliente?.persona?.nombre === 'JUAN' && filaDelivery?.cliente?.persona?.direccion === 'CALLE FALSA 123',
    'delivery-listar-pdv: nombre y dirección del cliente conservados',
    filaDelivery?.cliente?.persona,
  );

  // [2c] La `Persona` del CLIENTE no la ve el walk del assert [2] (no tiene
  // `nickname`, así que `usuariosEn` no la ancla) ni el [2b] (sólo mira columnas
  // salariales): volver `cliente.persona` a `leftJoinAndSelect` pasaba en verde.
  //
  // `documento` y `direccion` NO están en la lista prohibida: son las dos
  // decisiones explícitas del PR (documento → facturación desde el historial;
  // dirección → fallback de `convertir-modo-delivery-dialog`). Que el documento
  // del cliente siga saliendo por un canal sin `ensurePermission` queda anotado
  // como deuda (T10 de la auditoría de diff), no es un descuido de este assert.
  ok(!!filaDelivery?.cliente?.persona, 'delivery-listar-pdv: llega la persona del cliente', filaDelivery?.cliente);
  const fugasCliente = ['telefono', 'email', 'fechaNacimiento'].filter((campo) =>
    Object.prototype.hasOwnProperty.call(filaDelivery?.cliente?.persona || {}, campo));
  ok(
    fugasCliente.length === 0,
    'delivery-listar-pdv: el cliente NO trae teléfono, email ni fecha de nacimiento',
    fugasCliente,
  );

  // [2d] Ídem con la `Persona` del REPARTIDOR: un revert parcial de
  // `repartidor.persona` (sin tocar el `Funcionario`) no rompía nada, porque [2b]
  // sólo cubre salario/IPS/cuenta bancaria. Acá sí está prohibido el `documento`:
  // el repartidor es un funcionario, no el cliente que se factura.
  const personaRepartidorRespuesta = filaDelivery?.entregadoPorFuncionario?.persona;
  ok(!!personaRepartidorRespuesta, 'delivery-listar-pdv: llega la persona del repartidor', filaDelivery?.entregadoPorFuncionario);
  const fugasRepartidor = CAMPOS_PROHIBIDOS_PERSONA.filter((campo) =>
    Object.prototype.hasOwnProperty.call(personaRepartidorRespuesta || {}, campo));
  ok(
    fugasRepartidor.length === 0,
    'delivery-listar-pdv: la persona del repartidor no trae documento/teléfono/dirección/email/fecha',
    fugasRepartidor,
  );

  // [3] lo que la UI SÍ muestra sigue viniendo.
  const cajas = respuestas.get('get-cajas') || [];
  const cajaLista = cajas.find((c: any) => c.id === caja.id);
  ok(cajaLista?.createdBy?.nickname === 'cajera', 'get-cajas: llega el nickname del cajero', cajaLista?.createdBy);
  ok(cajaLista?.createdBy?.persona?.nombre === 'CAROLINA', 'get-cajas: llega persona.nombre del cajero', cajaLista?.createdBy?.persona);
  ok(cajaLista?.createdBy?.persona?.apellido === 'GIMENEZ', 'get-cajas: llega persona.apellido del cajero');
  ok(cajaLista?.dispositivo?.nombre === 'TERMINAL PRINCIPAL', 'get-cajas: el dispositivo sigue hidratado');
  ok(cajaLista?.conteoApertura?.id === conteo.id, 'get-cajas: el conteo de apertura sigue hidratado');

  // [3b] Los otros canales de caja también tienen que seguir trayendo al cajero.
  // Sin esto, un alias mal puesto en `selectUsuarioPublico` dejaría la relación en
  // `null`: los asserts negativos [1]/[2] seguirían verdes y la UI perdería el
  // cajero en silencio.
  const cajaUna = respuestas.get('get-caja');
  ok(cajaUna?.createdBy?.persona?.nombre === 'CAROLINA', 'get-caja: llega el nombre del cajero', cajaUna?.createdBy);
  ok(cajaUna?.revisadoPor?.nickname === 'cajera', 'get-caja: llega el nickname de quien revisó', cajaUna?.revisadoPor);
  const cajasPorDispositivo = respuestas.get('get-caja-by-dispositivo') || [];
  ok(
    cajasPorDispositivo[0]?.createdBy?.persona?.nombre === 'CAROLINA',
    'get-caja-by-dispositivo: llega el nombre del cajero',
    cajasPorDispositivo[0]?.createdBy,
  );
  const cajasAbiertas = respuestas.get('get-cajas-abiertas') || [];
  ok(
    cajasAbiertas[0]?.createdBy?.persona?.nombre === 'CAROLINA',
    'get-cajas-abiertas: llega el nombre del cajero',
    cajasAbiertas[0]?.createdBy,
  );
  const retiroUno = respuestas.get('get-retiro-caja');
  ok(retiroUno?.responsableRetiro?.nickname === 'cajera', 'get-retiro-caja: llega el nickname del responsable del retiro', retiroUno?.responsableRetiro);
  ok(
    retiroUno?.responsableIngreso?.persona?.nombre === 'CAROLINA',
    'get-retiro-caja: llega el nombre del responsable del ingreso',
    retiroUno?.responsableIngreso,
  );

  const resumen = respuestas.get('getResumenCaja');
  ok(resumen?.caja?.createdBy?.persona?.nombre === 'CAROLINA', 'getResumenCaja: llega el nombre del cajero', resumen?.caja?.createdBy);

  // [3c] Retiros MANUALES del resumen: `computeResumenCaja` los proyecta a
  // `{ responsable: persona?.nombre }`, así que el recorte nuevo de
  // `responsableRetiro` no tenía ningún assert — ni positivo (que el nombre siga
  // llegando) ni negativo (que la proyección no se lleve campos sensibles).
  const retiroResumen = (resumen?.retiros || [])[0];
  ok(!!retiroResumen, 'getResumenCaja: el retiro MANUAL de la fixture aparece en el resumen', resumen?.retiros);
  ok(retiroResumen?.responsable === 'CAROLINA', 'getResumenCaja: llega el nombre del responsable del retiro', retiroResumen);
  const fugasRetiroResumen = rutasConClave(resumen?.retiros, [...CAMPOS_PROHIBIDOS_PERSONA, 'password']);
  ok(
    fugasRetiroResumen.length === 0,
    'getResumenCaja: los retiros no exponen datos personales del responsable',
    fugasRetiroResumen,
  );

  const retiros = respuestas.get('get-retiros-caja') || [];
  ok(retiros[0]?.responsableRetiro?.nickname === 'cajera', 'get-retiros-caja: llega el nickname del responsable', retiros[0]?.responsableRetiro);

  const gastos = respuestas.get('get-gastos-caja') || [];
  ok(gastos[0]?.createdBy?.persona?.nombre === 'CAROLINA', 'get-gastos-caja: llega el nombre de quien cargó el gasto', gastos[0]?.createdBy);
  const egresos = respuestas.get('get-egresos-caja') || [];
  ok(egresos[0]?.createdBy?.persona?.nombre === 'CAROLINA', 'get-egresos-caja: llega el nombre de quien cargó el egreso', egresos[0]?.createdBy);

  const historial = respuestas.get('getVentasByDateRange');
  const filaVenta = (historial?.data || [])[0];
  ok(filaVenta?.createdBy?.persona?.nombre === 'CAROLINA', 'getVentasByDateRange: llega el nombre del vendedor', filaVenta?.createdBy);
  ok(filaVenta?.caja?.createdBy?.persona?.nombre === 'CAROLINA', 'getVentasByDateRange: llega el nombre del cajero de la caja', filaVenta?.caja?.createdBy);
  ok(filaVenta?.cliente?.persona?.nombre === 'JUAN', 'getVentasByDateRange: llega el nombre del cliente');
  ok(filaVenta?.cliente?.persona?.documento === '7654321', 'getVentasByDateRange: se conserva el documento del cliente (facturación)');
  ok(
    filaVenta?.cliente?.persona?.telefono === undefined && filaVenta?.cliente?.persona?.email === undefined,
    'getVentasByDateRange: el cliente NO trae teléfono ni email',
    filaVenta?.cliente?.persona,
  );

  // ── 4. Login IPC ──────────────────────────────────────────────────────────
  console.log('\n[4] Login');
  const login = await call('login', { nickname: 'cajera', password: PASS_INICIAL, deviceInfo: {} });
  ok(login?.success === true, 'login IPC con la contraseña correcta', login?.message);
  // El assert de presencia va ANTES del negativo: `x?.usuario?.password === undefined`
  // pasa vacío si `usuario` no está en la respuesta, y entonces no prueba nada.
  ok(!!login?.usuario?.nickname, 'login IPC devuelve el usuario', login?.usuario);
  ok(login?.usuario?.password === undefined, 'login IPC no devuelve el hash al renderer');
  const loginMal = await call('login', { nickname: 'cajera', password: 'incorrecta', deviceInfo: {} });
  ok(loginMal?.success === false, 'login IPC rechaza una contraseña incorrecta');

  // [4b] Login HTTP (el camino de la PWA, /admin y el modo cliente).
  let fastify: any = null;
  try {
    fastify = await startServer({
      port: PUERTO_HTTP, host: '127.0.0.1', appVersion: '0.0.0-test',
      schemaVersion: '1', driver: 'sqlite', dataSource: ds,
    } as any);
    const res = await fetch(`http://127.0.0.1:${PUERTO_HTTP}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'cajera', password: PASS_INICIAL }),
    });
    const cuerpo: any = await res.json();
    ok(res.status === 200 && !!cuerpo?.accessToken, 'login HTTP (/api/auth/login) con la contraseña correcta', cuerpo);
    ok(JSON.stringify(cuerpo).includes('"password"') === false, 'login HTTP no devuelve el hash');
    const resMal = await fetch(`http://127.0.0.1:${PUERTO_HTTP}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'cajera', password: 'incorrecta' }),
    });
    ok(resMal.status === 401, 'login HTTP rechaza una contraseña incorrecta', resMal.status);
  } catch (e: any) {
    ok(false, 'login HTTP (/api/auth/login)', String(e?.message || e));
  } finally {
    if (fastify) { try { await stopServer(fastify); } catch { /* no bloquea el test */ } }
  }

  // ── 5. Escrituras sobre una entidad cargada SIN la columna ────────────────
  console.log('\n[5] Cambio de contraseña y writes sobre entidad sin la columna');
  const PASS_NUEVA = 'otracosa456';
  const cambio = await call('change-password', {
    usuarioId: cajero.id, currentPassword: PASS_INICIAL, newPassword: PASS_NUEVA,
  });
  ok(cambio?.success === true, 'change-password funciona', cambio?.message);
  ok(!!cambio?.usuario?.nickname, 'change-password devuelve el usuario', cambio?.usuario);
  ok(cambio?.usuario?.password === undefined, 'change-password no devuelve el hash');
  const loginNueva = await call('login', { nickname: 'cajera', password: PASS_NUEVA, deviceInfo: {} });
  ok(loginNueva?.success === true, 'login con la contraseña NUEVA', loginNueva?.message);
  const loginVieja = await call('login', { nickname: 'cajera', password: PASS_INICIAL, deviceInfo: {} });
  ok(loginVieja?.success === false, 'la contraseña vieja dejó de servir');

  // [5b] `update-usuario` guarda una entidad cargada sin `password`: el hash no
  // se puede pisar ni borrar.
  usuarioActual = cajero;
  const upd = await call('update-usuario', cajero.id, { nickname: 'cajera2' });
  ok(upd?.success === true, 'update-usuario funciona', upd?.message);
  const trasUpdate = await call('login', { nickname: 'cajera2', password: PASS_NUEVA, deviceInfo: {} });
  ok(trasUpdate?.success === true, 'update-usuario NO rompió el hash (login sigue andando)', trasUpdate?.message);
  const hashEnBase = await ds.getRepository(Usuario).createQueryBuilder('u')
    .addSelect('u.password').where('u.id = :id', { id: cajero.id }).getOne();
  ok(!!(hashEnBase as any)?.password && isHashed((hashEnBase as any).password), 'el hash sigue en la base y sigue siendo bcrypt');

  // [5d] `update-usuario` CON contraseña nueva: el camino del reset
  // administrativo (`reset-password-dialog` → `updateUsuario(id, { password,
  // mustChangePassword: true })`). `select: false` NO cubre este caso — el hash se
  // ASIGNA en memoria después de cargar la entidad y `save()` devuelve la misma
  // instancia, así que salía en la respuesta. Y es el hash de OTRO usuario.
  const PASS_RESETEADA = 'reseteada999';
  const updConPass = await call('update-usuario', cajero.id, {
    password: PASS_RESETEADA, mustChangePassword: true,
  });
  ok(updConPass?.success === true, 'update-usuario con password nuevo funciona', updConPass?.message);
  ok(!!updConPass?.usuario?.nickname, 'update-usuario devuelve el usuario', updConPass?.usuario);
  ok(
    rutasConClave(updConPass, ['password']).length === 0,
    'update-usuario con password nuevo NO devuelve el hash',
    rutasConClave(updConPass, ['password']),
  );
  // …y el hash nuevo SÍ quedó escrito: 5b sólo probaba que no se borre.
  const loginReseteada = await call('login', { nickname: 'cajera2', password: PASS_RESETEADA, deviceInfo: {} });
  ok(loginReseteada?.success === true, 'update-usuario con password nuevo sí cambia el hash en la base', loginReseteada?.message);

  // `create-usuario` hoy se salva por el refetch con `findOne` (que con
  // `select: false` ya no trae la columna), pero es un accidente feliz: si alguien
  // devolviera la entidad guardada en vez del refetch, el hash vuelve a salir.
  // El login de arriba dejó `mustChangePassword=true` en el usuario en memoria y
  // el gate de `ensurePermission` bloquea todo hasta cambiarla.
  usuarioActual = cajero;
  const creado = await call('create-usuario', { nickname: 'nuevo', password: 'nuevo123456', activo: true });
  ok(creado?.success === true, 'create-usuario funciona', creado?.message);
  ok(!!creado?.usuario?.nickname, 'create-usuario devuelve el usuario', creado?.usuario);
  ok(
    rutasConClave(creado, ['password']).length === 0,
    'create-usuario NO devuelve el hash',
    rutasConClave(creado, ['password']),
  );

  // [5c] recuperación por código: sólo ESCRIBE el hash (no necesita addSelect).
  const CODIGO = '123456';
  await save(PasswordResetToken, {
    usuario: { id: cajero.id }, tokenHash: await hashPassword(CODIGO), canal: 'EMAIL',
    destino: 'cajera@ejemplo.com', expiraEn: new Date(Date.now() + 600000), intentos: 0,
    usado: false, activo: true,
  });
  const PASS_RECUPERADA = 'recuperada789';
  const reset = await call('reset-password-with-code', {
    nickname: 'cajera2', codigo: CODIGO, newPassword: PASS_RECUPERADA,
  });
  ok(reset?.success === true, 'reset-password-with-code funciona', reset?.message);
  const loginRecuperada = await call('login', { nickname: 'cajera2', password: PASS_RECUPERADA, deviceInfo: {} });
  ok(loginRecuperada?.success === true, 'login con la contraseña recuperada', loginRecuperada?.message);

  // ── 6. validate-credentials ───────────────────────────────────────────────
  console.log('\n[6] validate-credentials');
  const val = await call('validate-credentials', { nickname: 'cajera2', password: PASS_RECUPERADA });
  ok(val?.success === true, 'validate-credentials con la contraseña correcta', val?.message);
  // [6b] El handler pide el hash con `addSelect`; el `return` es una proyección
  // (`{ id, nickname, persona }`), así que hoy no lo publica. Sin este assert,
  // pasar a devolver la entidad —el patrón de `login`— era una fuga silenciosa
  // en un canal default-allow.
  ok(!!val?.usuario?.nickname, 'validate-credentials devuelve el usuario', val?.usuario);
  ok(
    rutasConClave(val, ['password']).length === 0,
    'validate-credentials no devuelve el hash',
    rutasConClave(val, ['password']),
  );
  const valMal = await call('validate-credentials', { nickname: 'cajera2', password: 'nope' });
  ok(valMal?.success === false, 'validate-credentials rechaza una contraseña incorrecta');

  // ── 7. migratePlaintextPasswords ──────────────────────────────────────────
  console.log('\n[7] Migración one-shot plaintext → bcrypt');
  const legacy: any = await save(Usuario, {
    nickname: 'legacy', password: 'enclaro', activo: true, mustChangePassword: false,
  });
  await migratePlaintextPasswords(ds);
  const legacyTras = await ds.getRepository(Usuario).createQueryBuilder('u')
    .addSelect('u.password').where('u.id = :id', { id: legacy.id }).getOne();
  ok(
    isHashed((legacyTras as any)?.password) && await verifyPassword('enclaro', (legacyTras as any)?.password),
    'migratePlaintextPasswords hasheó el password en claro',
    (legacyTras as any)?.password,
  );
  // Y no rompió a los que ya estaban hasheados.
  const loginTrasMigracion = await call('login', { nickname: 'cajera2', password: PASS_RECUPERADA, deviceInfo: {} });
  ok(loginTrasMigracion?.success === true, 'migratePlaintextPasswords no tocó los hashes existentes');

  // ── 8. Seed: admin con la contraseña default ──────────────────────────────
  console.log('\n[8] Seed del admin default');
  const admin: any = await save(Usuario, {
    nickname: 'admin', password: await hashPassword('admin'), activo: true, mustChangePassword: false,
  });
  await seedSystemData(ds);
  const adminTras: any = await ds.getRepository(Usuario).findOne({ where: { id: admin.id } });
  ok(
    adminTras?.mustChangePassword === true,
    'markDefaultAdminMustChangePassword detectó el admin con la contraseña default',
    adminTras?.mustChangePassword,
  );

  // [8b] El caso gemelo del seed: la tarea de onboarding "cambiar password del
  // admin". Sin su `addSelect`, `verifyPassword('admin', undefined)` da false →
  // `count: 1` → la tarea se muestra COMPLETA con el admin todavía en
  // `admin`/`admin`, y ningún otro assert se pone rojo. `count: 0` = "falta
  // hacerla", que es lo correcto acá (el admin de la fixture sigue con la default).
  const tareaPassword = ONBOARDING_TASKS.find((t) => t.key === 'PASSWORD_ADMIN');
  ok(!!tareaPassword?.detect, 'existe la tarea de onboarding PASSWORD_ADMIN con detección', tareaPassword?.key);
  const deteccion = await tareaPassword!.detect!(ds);
  ok(
    deteccion?.count === 0,
    'onboarding PASSWORD_ADMIN detecta el admin con la contraseña default (tarea pendiente)',
    deteccion,
  );

  console.log(`\n[sin-fuga-datos] ${passed} OK, ${failed} fallidos`);
  await ds.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
