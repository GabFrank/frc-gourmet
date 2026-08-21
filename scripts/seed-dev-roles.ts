/**
 * Siembra el entorno DEV para probar permisos por rol.
 *
 * Crea tres usuarios con combinaciones distintas de roles, se asegura de que
 * existan monedas, billetes y un dispositivo de caja, y deja una caja ABIERTA
 * lista para operar. Todo idempotente: correrlo dos veces no duplica nada.
 *
 *   TEST_MOZO     -> MOZO
 *   TEST_CAJERO   -> CAJERO + MOZO
 *   TEST_GERENTE  -> GERENTE + CAJERO + MOZO
 *
 * Si ya existe un usuario con esos nicknames que NO haya creado este script,
 * aborta en vez de pisarle la password.
 *
 * Password de los tres: 123 (sin obligacion de cambiarla).
 *
 * NO CORRER CONTRA PRODUCCION. Escribe sobre la base que usa la app de este
 * equipo, por eso exige `--confirmar`.
 *
 * Uso: npm run seed:dev-roles -- --confirmar
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { hashPassword } from '../electron/utils/password.utils';

const PASSWORD_DEV = '123';

function userDataPath(): string {
  const argIdx = process.argv.indexOf('--userData');
  if (argIdx >= 0 && process.argv[argIdx + 1]) return process.argv[argIdx + 1];
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'frc-gourmet');
  if (process.platform === 'win32') return path.join(process.env['APPDATA'] || '', 'frc-gourmet');
  return path.join(os.homedir(), '.config', 'frc-gourmet');
}

async function main() {
  if (!process.argv.includes('--confirmar')) {
    console.error('Falta --confirmar. Este script escribe sobre la base de la app; no correrlo en produccion.');
    process.exit(1);
  }

  const dir = userDataPath();
  const dbFile = path.join(dir, 'frc-gourmet.db');
  if (!fs.existsSync(dbFile)) {
    console.error(`No existe la base ${dbFile}. Levanta la app una vez para que corra las migraciones.`);
    process.exit(1);
  }
  console.log(`[seed-dev-roles] Base: ${dbFile}`);

  const base = getDataSourceOptions(dir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaBillete } = E('financiero/moneda-billete.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');

  // ── Catalogos base ───────────────────────────────────────────────────────
  const monedas = await ds.getRepository(Moneda).count();
  const billetes = await ds.getRepository(MonedaBillete).count();
  console.log(`[seed-dev-roles] Monedas: ${monedas}, billetes: ${billetes}.`);
  if (monedas === 0) {
    console.error('No hay monedas. Levanta la app una vez: los seeds del sistema las crean solos.');
    process.exit(1);
  }
  if (billetes === 0) {
    console.warn('  ⚠ No hay billetes cargados: el conteo de caja no va a poder desglosarse.');
  }

  // ── Dispositivo de caja ──────────────────────────────────────────────────
  const dispRepo = ds.getRepository(Dispositivo);
  // Se reusa un dispositivo de caja existente porque en el entorno dev ya suele
  // haber uno y crear otro confunde el `dispositivo_id` de las cajas. Se avisa
  // cual se adopto, para que no pase inadvertido si es uno "real".
  let dispositivo: any = await dispRepo.findOne({ where: { isCaja: true, activo: true } as any });
  if (!dispositivo) {
    dispositivo = await dispRepo.save(dispRepo.create({
      nombre: 'CAJA DEV', isCaja: true, isVenta: true, activo: true,
    } as any) as any);
    console.log(`[seed-dev-roles] Dispositivo creado: ${dispositivo.nombre} (id ${dispositivo.id}).`);
  } else {
    console.log(`[seed-dev-roles] Dispositivo existente: ${dispositivo.nombre} (id ${dispositivo.id}).`);
  }

  // ── Usuarios y roles ─────────────────────────────────────────────────────
  const roleRepo = ds.getRepository(Role);
  const usuarioRepo = ds.getRepository(Usuario);
  const personaRepo = ds.getRepository(Persona);
  const usuarioRoleRepo = ds.getRepository(UsuarioRole);

  // Los nicknames llevan prefijo para no chocar con usuarios reales: `MOZO1` a
  // secas es perfectamente plausible en un local con turnos rotativos, y este
  // script resetea la password del usuario que encuentra.
  const perfiles: Array<{ nickname: string; nombre: string; roles: string[] }> = [
    { nickname: 'TEST_MOZO', nombre: 'MOZO DE PRUEBA', roles: ['MOZO'] },
    { nickname: 'TEST_CAJERO', nombre: 'CAJERO DE PRUEBA', roles: ['CAJERO', 'MOZO'] },
    { nickname: 'TEST_GERENTE', nombre: 'GERENTE DE PRUEBA', roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  ];

  const hash = await hashPassword(PASSWORD_DEV);
  for (const perfil of perfiles) {
    let usuario: any = await usuarioRepo.findOne({ where: { nickname: perfil.nickname } as any });
    if (!usuario) {
      const persona: any = await personaRepo.save(personaRepo.create({
        nombre: perfil.nombre, tipoPersona: 'FISICA', activo: true,
      } as any) as any);
      usuario = await usuarioRepo.save(usuarioRepo.create({
        nickname: perfil.nickname, password: hash, activo: true,
        mustChangePassword: false, persona,
      } as any) as any);
      console.log(`[seed-dev-roles] Usuario creado: ${perfil.nickname}.`);
    } else {
      // Resetear una password y apagar `mustChangePassword` es debilitar un
      // control de seguridad. Solo se hace sobre un usuario que este script haya
      // creado — identificado por el nombre de su persona. Si el nickname existe
      // pero es otra persona, se aborta: es un usuario real.
      const persona: any = (usuario as any).persona
        ?? (await usuarioRepo.findOne({ where: { id: usuario.id } as any, relations: ['persona'] }))?.persona;
      const nombrePersona = String(persona?.nombre || '').toUpperCase();
      if (nombrePersona !== perfil.nombre) {
        console.error(
          `\n❌ Ya existe un usuario "${perfil.nickname}" que NO fue creado por este script`
          + ` (persona: "${persona?.nombre ?? 'sin persona'}", se esperaba "${perfil.nombre}").`
          + `\n   No se toca: resetearle la password apagaria su cambio de contrasenha obligatorio.`
          + `\n   Renombra ese usuario o borra el perfil de la lista antes de seguir.\n`,
        );
        process.exit(1);
      }
      usuario.password = hash;
      usuario.activo = true;
      (usuario as any).mustChangePassword = false;
      await usuarioRepo.save(usuario);
      console.log(`[seed-dev-roles] Usuario de prueba existente: ${perfil.nickname} (password reseteada).`);
    }

    for (const descripcion of perfil.roles) {
      const rol: any = await roleRepo.findOne({ where: { descripcion } as any });
      if (!rol) {
        console.warn(`  ⚠ Rol ${descripcion} no existe. Levanta la app: lo crea el seed de roles plantilla.`);
        continue;
      }
      const yaTiene = await usuarioRoleRepo.count({
        where: { usuario: { id: usuario.id }, role: { id: rol.id } } as any,
      });
      if (!yaTiene) {
        await usuarioRoleRepo.save(usuarioRoleRepo.create({ usuario, role: rol } as any) as any);
        console.log(`  + ${perfil.nickname} -> ${descripcion}`);
      }
    }
  }

  // ── Caja abierta ─────────────────────────────────────────────────────────
  const cajaRepo = ds.getRepository(Caja);
  const abierta: any = await cajaRepo.findOne({
    where: { dispositivo: { id: dispositivo.id }, estado: 'ABIERTO' } as any,
    relations: ['createdBy'],
  });
  if (abierta) {
    console.log(`[seed-dev-roles] Ya hay una caja ABIERTA (id ${abierta.id}), abierta por usuario ${abierta.createdBy?.id ?? '?'}.`);
  } else {
    // La caja la abre TEST_CAJERO: asi se puede probar que solo quien la abrio la
    // cierra, que es el guard que tiene `update-caja`.
    const cajero: any = await usuarioRepo.findOne({ where: { nickname: 'TEST_CAJERO' } as any });
    const conteoRepo = ds.getRepository(Conteo);
    const conteo: any = await conteoRepo.save(conteoRepo.create({
      activo: true, tipo: 'APERTURA', fecha: new Date(),
      observaciones: 'APERTURA SEMBRADA PARA PRUEBAS DE ROLES',
      dispositivo,
    } as any) as any);
    const caja: any = await cajaRepo.save(cajaRepo.create({
      fechaApertura: new Date(), estado: 'ABIERTO', activo: true,
      dispositivo, conteoApertura: conteo,
      ...(cajero ? { createdBy: cajero } : {}),
    } as any) as any);
    console.log(`[seed-dev-roles] Caja ABIERTA creada (id ${caja.id}) por TEST_CAJERO en ${dispositivo.nombre}.`);
  }

  await ds.destroy();
  console.log(`\n✅ Entorno dev listo. Usuarios TEST_MOZO / TEST_CAJERO / TEST_GERENTE, password ${PASSWORD_DEV}.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
