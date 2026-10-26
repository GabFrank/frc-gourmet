/**
 * E2E: Funciones y Tareas (FT) — fase 1 (ABM, motor de generación/vencimiento, operación).
 *
 * Handlers y motor REALES contra SQLite temporal (migraciones completas) o, con
 * FT_E2E_PG=<base>, contra Postgres en 127.0.0.1:5432 (usuario PGUSER o postgres; la base
 * se vacía). Corre en America/Asuncion (UTC-3) salvo que se pase TZ, para que un error de
 * huso horario (toISOString, timestamp sin zona) se note.
 *
 *  A) Validaciones: ft_funcion exactamente uno de cargo/funcionario; alcance de plantilla.
 *  B) ft-funciones-de: generales del cargo vigente (HistoricoCargo) + específicas.
 *  C) Motor apagado no genera.
 *  D) Idempotencia: 2 ticks = mismas tareas.
 *  E) Específica que reemplaza a la general; específica que se suma.
 *  F) Turno nocturno: FIN_TURNO cae al día siguiente; generación «de ayer» pasada la medianoche.
 *  G) Cambio de cargo a mitad de mes.
 *  H) Editar la plantilla no altera tareas ya generadas (snapshot).
 *  I) Marcar: propias, evidencia NOTA, checklist con ítems obligatorios, ajenas no.
 *  J) Verificar/rechazar: nadie verifica lo propio; rechazada se rehace.
 *  K) Permisos: con solo RRHH_FT_REPORTES se rechaza ft-tarea-marcar.
 *  L) No aplica, tarea manual, vencimiento PENDIENTE→VENCIDA.
 *  M) Lock en base: con un lock ajeno vigente el tick no corre; vencido, sí.
 * Fase 2 (F2-*): dedupe de avisos (2 ticks = 1), canal WHATSAPP enviado por la app, ausente con
 *  crítica, canal GERENTE sin enviarDirecto/dispatchEvento (mockeados) y visible en ft-avisos,
 *  grupo ADM por dispatchEvento, nivel 3 → ft_propuesta_falta PENDIENTE (nunca dr_falta),
 *  resolver propuestas, NOTIF_GLOBAL_ACTIVO apagado no envía, evento de caja idempotente, hook
 *  con error forzado no rompe abrir caja, foto excedida/no imagen rechazada.
 *
 * Uso: npm run test:funciones-tareas   ·   FT_E2E_PG=ft_e2e npm run test:funciones-tareas
 */
process.env['TZ'] = process.env['TZ'] || 'America/Asuncion';
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerFuncionesTareasHandlers } from '../electron/handlers/funciones-tareas.handler';
import { registerFuncionesTareasLecturaHandlers } from '../electron/handlers/funciones-tareas-lectura.handler';
import { clearPermissionCache } from '../electron/utils/auth.utils';
import { ejecutarTickFt, ftOnEvento, tomarLockFt } from '../electron/services/funciones-tareas/motor';
import { fijarEnviadorFt } from '../electron/services/funciones-tareas/avisos';
import { esperarEventosFt, fijarInterceptorEventoFt } from '../electron/services/funciones-tareas/eventos';
import { setNotificacionDataSource } from '../electron/services/notificacion.service';
import { seedNotificaciones } from '../electron/handlers/notificaciones-config.handler';
import { registerFinancieroHandlers } from '../electron/handlers/financiero.handler';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';
import { fijarRelojFt } from '../electron/services/funciones-tareas/fechas';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function rechaza(p: Promise<any>, codigo: string, name: string) {
  try { await p; ok(false, name, 'no lanzó'); }
  catch (e: any) { ok(e?.code === codigo, name, { code: e?.code, msg: e?.message }); }
}
const call = (canal: string, ...args: any[]) => invokeHandlerWithContext(canal, undefined, ...args);
/** Date local. */
const L = (y: number, m: number, d: number, hh = 0, mi = 0) => new Date(y, m - 1, d, hh, mi);
const hm = (d: any) => { const x = new Date(d); return `${x.getDate()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-funciones-tareas-e2e.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['FT_E2E_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  if (pgDb) { await ds.query('DROP SCHEMA public CASCADE'); await ds.query('CREATE SCHEMA public'); }
  await ds.runMigrations({ transaction: 'each' });
  console.log(`[ft-e2e] ${pgDb ? 'postgres' : 'sqlite'} · TZ=${process.env['TZ']} · migraciones OK`);

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Turno } = E('rrhh/turno.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { FuncionarioTurno } = E('rrhh/funcionario-turno.entity');
  const { HistoricoCargo } = E('rrhh/historico-cargo.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { FtTarea } = E('rrhh/funciones-tareas/ft-tarea.entity');
  const { FtConfig } = E('rrhh/funciones-tareas/ft-config.entity');

  const save = <T>(cls: any, data: any): Promise<T> => ds.getRepository(cls).save(ds.getRepository(cls).create(data));
  const permisos = async (u: any, rol: string, codigos: string[]) => {
    const role: any = await save(Role, { descripcion: rol, activo: true });
    await save(UsuarioRole, { usuario: u, role });
    for (const codigo of codigos) {
      let perm: any = await ds.getRepository(Permission).findOne({ where: { codigo } });
      if (!perm) perm = await save(Permission, { codigo, descripcion: codigo, activo: true });
      await save(RolePermission, { role, permission: perm });
    }
  };
  const FT = ['RRHH_FT_CONFIGURAR', 'RRHH_FT_VER_TODO', 'RRHH_FT_MARCAR_PROPIAS', 'RRHH_FT_VERIFICAR', 'RRHH_FT_REPORTES'];
  const admin: any = await save(Usuario, { nickname: 'ADMIN', password: 'x', activo: true });
  await permisos(admin, 'ADMIN_FT', FT);
  const uAna: any = await save(Usuario, { nickname: 'ANA', password: 'x', activo: true });
  await permisos(uAna, 'COLAB_FT', ['RRHH_FT_MARCAR_PROPIAS']);
  const uBeto: any = await save(Usuario, { nickname: 'BETO', password: 'x', activo: true });
  await permisos(uBeto, 'COLAB_FT_2', ['RRHH_FT_MARCAR_PROPIAS']);
  const uVero: any = await save(Usuario, { nickname: 'VERO', password: 'x', activo: true });
  await permisos(uVero, 'ENCARGADA_FT', ['RRHH_FT_MARCAR_PROPIAS', 'RRHH_FT_VERIFICAR']);
  const uRep: any = await save(Usuario, { nickname: 'GERENTE_BOT', password: 'x', activo: true });
  await permisos(uRep, 'REPORTES_FT', ['RRHH_FT_REPORTES']);

  let actual: any = admin;
  const como = async <T>(u: any, fn: () => Promise<T>) => { const prev = actual; actual = u; try { return await fn(); } finally { actual = prev; } };
  clearPermissionCache();
  registerFuncionesTareasHandlers(ds, () => actual);
  registerFuncionesTareasLecturaHandlers(ds, () => actual);

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const cocinero: any = await save(Cargo, { nombre: 'COCINERO', activo: true });
  const gerente: any = await save(Cargo, { nombre: 'GERENTE DE COCINA', activo: true });
  const diurno: any = await save(Turno, { nombre: 'DIURNO', horaEntrada: '08:00', horaSalida: '16:00', toleranciaTardanzaMinutos: 5, activo: true });
  const nocturno: any = await save(Turno, { nombre: 'NOCTURNO', horaEntrada: '22:00', horaSalida: '06:00', toleranciaTardanzaMinutos: 5, activo: true });
  const mkFunc = async (nombre: string, cargo: any, usuario?: any, turno?: any) => {
    const persona: any = await save(Persona, { nombre, apellido: 'TEST', activo: true });
    const f: any = await save(Funcionario, {
      persona, cargo, fechaIngreso: '2024-01-01', salarioBase: 3000000, monedaSalario: pyg,
      activo: true, ipsActivo: false, esJornalero: false, usuario,
    });
    if (turno) await save(FuncionarioTurno, { funcionario: f, turno, fechaDesde: '2024-01-01' });
    return f;
  };
  const fAna = await mkFunc('ANA', cocinero, uAna, diurno);
  const fBeto = await mkFunc('BETO', cocinero, uBeto, nocturno);
  const fCarla = await mkFunc('CARLA', cocinero); // sin turno: solo HORA_FIJA
  const fVero = await mkFunc('VERO', gerente, uVero, diurno);
  // Carla: cocinera hasta el 14/11, gerente desde el 15/11 (funcionario.cargo quedó viejo a propósito).
  await save(HistoricoCargo, { funcionario: fCarla, cargo: cocinero, fechaDesde: '2024-01-01', fechaHasta: '2026-11-14' });
  await save(HistoricoCargo, { funcionario: fCarla, cargo: gerente, fechaDesde: '2026-11-15' });

  const tareas = async (where: any = {}) => ds.getRepository(FtTarea).find({ where, relations: ['plantilla', 'funcionario'], order: { id: 'ASC' } });
  const de = (ts: any[], fid: number, pid?: number, fecha?: string) => ts.filter((t) => t.funcionario.id === fid && (pid === undefined || t.plantilla?.id === pid) && (!fecha || String(t.fecha).slice(0, 10) === fecha));
  const tick = async (ahora: Date) => { fijarRelojFt(ahora); return ejecutarTickFt(ds, { ahora }); };

  // ===== A) Validaciones =====
  console.log('\n[A] Validaciones de ABM');
  await rechaza(call('ft-funciones-save', { descripcion: 'X', cargoId: cocinero.id, funcionarioId: fAna.id }), 'VALIDACION', 'función con cargo Y funcionario → rechazada');
  await rechaza(call('ft-funciones-save', { descripcion: 'X' }), 'VALIDACION', 'función sin dueño → rechazada');
  const fnCoc = await call('ft-funciones-save', { descripcion: 'preparar mise en place', cargoId: cocinero.id, orden: 1 });
  ok(fnCoc?.id > 0 && fnCoc.descripcion === 'PREPARAR MISE EN PLACE', 'función general del cargo, en MAYÚSCULAS', fnCoc?.descripcion);
  await call('ft-funciones-save', { descripcion: 'controlar pedidos a proveedores', cargo: { id: gerente.id } });
  await call('ft-funciones-save', { descripcion: 'abrir la cocina', funcionarioId: fCarla.id });
  await rechaza(call('ft-plantillas-save', { titulo: 'X', cargoId: cocinero.id, funcionarioId: fAna.id, ancla: 'HORA_FIJA', horaFija: '09:00' }), 'ALCANCE_INVALIDO', 'plantilla cargo+funcionario → alcance inválido');
  await rechaza(call('ft-plantillas-save', { titulo: 'X', turnoId: diurno.id, ancla: 'HORA_FIJA', horaFija: '09:00' }), 'ALCANCE_INVALIDO', 'plantilla solo turno → alcance inválido');
  await rechaza(call('ft-plantillas-save', { titulo: 'X', cargoId: cocinero.id, tipo: 'CHECKLIST' }), 'VALIDACION', 'checklist sin ítems → rechazado');
  await rechaza(call('ft-plantillas-save', { titulo: 'X', cargoId: cocinero.id, ancla: 'HORA_FIJA', horaFija: '25:00' }), 'VALIDACION', 'hora fija inválida → rechazada');

  // Plantillas
  const p1 = await call('ft-plantillas-save', {
    titulo: 'checklist de apertura', cargoId: cocinero.id, tipo: 'CHECKLIST', ancla: 'INICIO_TURNO', duracionMin: 60,
    items: [{ texto: 'encender campana', obligatorio: true }, { texto: 'revisar heladeras', obligatorio: true }, { texto: 'poner música', obligatorio: false }],
    reglas: [{ momento: 'ANTES_VENCER', minutos: 15, nivel: 1, canal: 'APP' }],
    requiereVerificacion: true,
  });
  ok(p1?.items?.length === 3 && p1.reglas?.length === 1, 'plantilla checklist con 3 ítems y 1 regla de aviso', { items: p1?.items?.length, reglas: p1?.reglas?.length });
  const p2 = await call('ft-plantillas-save', { titulo: 'cierre del turno noche', cargoId: cocinero.id, turnoId: nocturno.id, ancla: 'FIN_TURNO', offsetInicioMin: -30, duracionMin: 30 });
  const p3 = await call('ft-plantillas-save', { titulo: 'revisar stock', cargoId: gerente.id, ancla: 'HORA_FIJA', horaFija: '10:00', duracionMin: 60 });
  const p4 = await call('ft-plantillas-save', {
    titulo: 'apertura de ana', funcionarioId: fAna.id, reemplazaPlantillaId: p1.id, ancla: 'HORA_FIJA', horaFija: '09:00', duracionMin: 120, evidencia: 'NOTA',
  });
  const p5 = await call('ft-plantillas-save', { titulo: 'limpieza de cocina', cargoId: cocinero.id, ancla: 'HORA_FIJA', horaFija: '12:00', duracionMin: 60 });
  await rechaza(call('ft-plantillas-save', { titulo: 'X', cargoId: cocinero.id, reemplazaPlantillaId: p1.id, ancla: 'HORA_FIJA', horaFija: '09:00' }), 'VALIDACION', 'una general no puede reemplazar a otra');
  // Edición de ítems: se quita uno, se edita otro, se agrega uno.
  const p1e = await call('ft-plantillas-save', { ...p1, items: [{ id: p1.items[0].id, texto: 'encender campana y luces' }, p1.items[1], p1.items[2]], reglas: [] });
  ok(p1e.items.length === 3 && p1e.items[0].texto === 'ENCENDER CAMPANA Y LUCES' && p1e.items[0].id === p1.items[0].id && p1e.reglas.length === 0, 'editar plantilla: ítem actualizado por id y regla quitada');

  // ===== B) ft-funciones-de =====
  console.log('\n[B] Funciones combinadas (cargo vigente)');
  const fd14 = await call('ft-funciones-de', fCarla.id, '2026-11-14');
  ok(fd14.cargo?.id === cocinero.id && fd14.generales.length === 1 && fd14.especificas.length === 1, '14/11: Carla cocinera (1 general) + 1 específica', { cargo: fd14.cargo, g: fd14.generales.length, e: fd14.especificas.length });
  const fd15 = await call('ft-funciones-de', fCarla.id, '2026-11-15');
  ok(fd15.cargo?.id === gerente.id && fd15.generales[0]?.descripcion === 'CONTROLAR PEDIDOS A PROVEEDORES', '15/11: Carla gerente por HistoricoCargo (no funcionario.cargo)', fd15.cargo);
  const propias = await como(uAna, () => call('ft-funciones-de'));
  ok(propias.funcionario.id === fAna.id && propias.generales.length === 1, 'colaboradora ve sus propias funciones sin pasar id');
  await rechaza(como(uAna, () => call('ft-funciones-de', fBeto.id)), 'FORBIDDEN', 'colaboradora no ve funciones de otro');

  // ===== C) Motor apagado =====
  console.log('\n[C] Motor apagado por defecto');
  const r0 = await tick(L(2026, 11, 14, 7, 0));
  ok(r0.omitido === 'APAGADO' && (await tareas()).length === 0, 'con ft_config.activo apagado no genera nada', r0);
  await call('ft-config-set', { activo: true, intervalo_min: '5' });
  await rechaza(call('ft-config-set', { motor_lock: 'x' }), 'VALIDACION', 'motor_lock no es configurable');
  const cfg = await call('ft-config-get');
  ok(cfg.valores.activo === 'true' && cfg.valores.intervalo_min === '5', 'ft-config-get devuelve lo guardado', cfg.valores);

  // ===== D) Idempotencia =====
  console.log('\n[D] Idempotencia');
  const r1 = await tick(L(2026, 11, 14, 7, 0));
  const t1 = await tareas();
  // Ana: P4 (reemplaza P1) + P5 · Beto: P1 + P2 + P5 · Carla: P5 (sin turno) · Vero: P3
  ok(r1.ejecutado && r1.generadas === 7 && t1.length === 7, '1.er tick genera 7 tareas', { r1, n: t1.length });
  const r2 = await tick(L(2026, 11, 14, 7, 0));
  const t2 = await tareas();
  ok(r2.generadas === 0 && t2.length === 7 && JSON.stringify(t2.map((t: any) => t.id)) === JSON.stringify(t1.map((t: any) => t.id)), '2.º tick: mismas tareas, ninguna nueva', r2);
  const ultimo = (await call('ft-config-get')).ultimoTick;
  ok(ultimo?.ejecutado === true && ultimo.generadas === 0, 'queda registrado el último tick');

  // ===== E) Específica =====
  console.log('\n[E] Específica que reemplaza / que se suma');
  ok(de(t2, fAna.id, p1.id).length === 0 && de(t2, fAna.id, p4.id).length === 1, 'Ana no tiene la general reemplazada y sí su específica');
  ok(de(t2, fAna.id, p5.id).length === 1, 'Ana conserva las otras generales del cargo');
  ok(de(t2, fBeto.id, p1.id).length === 1, 'Beto (mismo cargo) sí tiene la general');
  const tP1Beto: any = de(t2, fBeto.id, p1.id)[0];
  const itemsBeto = await ds.query(`SELECT texto FROM ft_tarea_item WHERE tarea_id = ${tP1Beto.id} ORDER BY id`);
  ok(itemsBeto.length === 3 && itemsBeto[0].texto === 'ENCENDER CAMPANA Y LUCES', 'el checklist generado copia los ítems de la plantilla', itemsBeto);

  // ===== F) Nocturno =====
  console.log('\n[F] Turno nocturno');
  ok(hm(tP1Beto.inicio) === '14 22:00' && hm(tP1Beto.vence) === '14 23:00', 'inicio de turno nocturno 22:00 del 14', [hm(tP1Beto.inicio), hm(tP1Beto.vence)]);
  const tP2Beto: any = de(t2, fBeto.id, p2.id)[0];
  ok(String(tP2Beto.fecha).slice(0, 10) === '2026-11-14' && hm(tP2Beto.inicio) === '15 05:30' && hm(tP2Beto.vence) === '15 06:00', 'cierre del turno noche: fecha 14 (día de entrada), ventana 15 05:30–06:00', [tP2Beto.fecha, hm(tP2Beto.inicio), hm(tP2Beto.vence)]);
  // ===== H) Snapshot =====
  console.log('\n[H] Editar plantilla no reescribe historia');
  const tAntes: any = de(await tareas(), fCarla.id, p5.id, '2026-11-14')[0];
  await call('ft-plantillas-save', { ...(await call('ft-plantillas-get', p5.id)), titulo: 'limpieza profunda', critica: true, peso: 5 });
  const tDesp: any = await ds.getRepository(FtTarea).findOneBy({ id: tAntes.id });
  ok(tDesp.titulo === 'LIMPIEZA DE COCINA' && tDesp.critica === false && Number(tDesp.peso) === 1, 'la tarea vieja mantiene título, crítica y peso', [tDesp.titulo, tDesp.critica, tDesp.peso]);

  // ===== I) Marcar =====
  console.log('\n[I] Marcar tareas propias');
  fijarRelojFt(L(2026, 11, 14, 9, 30));
  const misAna = await como(uAna, () => call('ft-mis-tareas-hoy'));
  ok(misAna.length === 2 && misAna.every((t: any) => t.funcionario.id === fAna.id) && !('usuario' in misAna[0].funcionario), 'mis tareas de hoy: solo las 2 de Ana, sin datos de usuario', misAna.map((t: any) => t.titulo));
  const tP4Ana = misAna.find((t: any) => t.plantilla?.id === p4.id);
  const tP5Ana = misAna.find((t: any) => t.plantilla?.id === p5.id);
  await rechaza(como(uAna, () => call('ft-tarea-marcar', tP4Ana.id, {})), 'EVIDENCIA_REQUERIDA', 'tarea con evidencia NOTA no se completa sin nota');
  const m4 = await como(uAna, () => call('ft-tarea-marcar', tP4Ana.id, { nota: 'todo en orden' }));
  ok(m4.estado === 'HECHA' && m4.nota === 'TODO EN ORDEN' && m4.hechaPor?.id === uAna.id, 'con nota queda HECHA', m4.estado);
  await rechaza(como(uAna, () => call('ft-tarea-marcar', tP4Ana.id, {})), 'ESTADO_INVALIDO', 'no se marca dos veces');
  await rechaza(como(uAna, () => call('ft-tarea-marcar', tP1Beto.id, {})), 'NO_ENCONTRADO', 'no se marca una tarea ajena');
  const m5 = await como(uAna, () => call('ft-tarea-marcar', tP5Ana.id, {}));
  ok(m5.estado === 'HECHA', 'tarea simple propia → HECHA');
  // Checklist de Beto
  fijarRelojFt(L(2026, 11, 14, 22, 10));
  const misBeto = await como(uBeto, () => call('ft-mis-tareas-hoy'));
  const ck = misBeto.find((t: any) => t.id === tP1Beto.id);
  ok(ck && ck.items.length === 3 && ck.items[2].obligatorio === false, 'Beto ve su checklist con el ítem opcional marcado como tal');
  const opc = await como(uBeto, () => call('ft-tarea-marcar', ck.id, { itemId: ck.items[2].id }));
  ok(opc.estado === 'PENDIENTE' && opc.items[2].hecho === true, 'marcar el ítem opcional no completa la tarea');
  await rechaza(como(uBeto, () => call('ft-tarea-marcar', ck.id, {})), 'ITEMS_PENDIENTES', 'completar sin los obligatorios → rechazado');
  await como(uBeto, () => call('ft-tarea-marcar', ck.id, { itemId: ck.items[0].id }));
  const fin = await como(uBeto, () => call('ft-tarea-marcar', ck.id, { itemId: ck.items[1].id }));
  ok(fin.estado === 'HECHA', 'con todos los obligatorios marcados la tarea pasa sola a HECHA', fin.estado);
  fijarRelojFt(L(2026, 11, 15, 1, 0));
  const misBetoMadrugada = await como(uBeto, () => call('ft-mis-tareas-hoy'));
  ok(misBetoMadrugada.some((t: any) => t.id === tP2Beto.id), 'a la 01:00 Beto sigue viendo el cierre de su turno del 14');

  // ===== J) Verificar / rechazar =====
  console.log('\n[J] Verificación');
  fijarRelojFt(L(2026, 11, 14, 12, 0));
  await rechaza(como(uAna, () => call('ft-tarea-verificar', tP5Ana.id)), 'FORBIDDEN', 'sin RRHH_FT_VERIFICAR no se verifica');
  const v1 = await como(uVero, () => call('ft-tarea-verificar', tP5Ana.id));
  ok(v1.estado === 'VERIFICADA' && v1.verificadaPor?.id === uVero.id, 'la encargada verifica la tarea de Ana');
  const tP3Vero: any = de(await tareas(), fVero.id, p3.id, '2026-11-14')[0];
  await como(uVero, () => call('ft-tarea-marcar', tP3Vero.id, {}));
  await rechaza(como(uVero, () => call('ft-tarea-verificar', tP3Vero.id)), 'PROPIA', 'nadie verifica su propia tarea');
  await rechaza(como(uVero, () => call('ft-tarea-rechazar', tP3Vero.id, 'X')), 'PROPIA', 'ni la rechaza');
  const v2 = await call('ft-tarea-verificar', tP3Vero.id);
  ok(v2.estado === 'VERIFICADA', 'otro usuario (admin) sí la verifica');
  await rechaza(como(uVero, () => call('ft-tarea-rechazar', ck.id, '')), 'VALIDACION', 'rechazar exige motivo');
  const rj = await como(uVero, () => call('ft-tarea-rechazar', ck.id, 'campana sucia'));
  ok(rj.estado === 'RECHAZADA' && /RECHAZO: CAMPANA SUCIA/.test(rj.nota), 'rechazada con motivo', rj.nota);
  fijarRelojFt(L(2026, 11, 14, 22, 50));
  const rehecha = await como(uBeto, () => call('ft-tarea-marcar', ck.id, {}));
  ok(rehecha.estado === 'HECHA', 'la persona rehace la tarea rechazada');

  // ===== K) Permisos =====
  console.log('\n[K] Permisos');
  const tP5Beto: any = de(await tareas(), fBeto.id, p5.id, '2026-11-14')[0];
  await rechaza(como(uRep, () => call('ft-tarea-marcar', tP5Beto.id, {})), 'FORBIDDEN', 'con solo RRHH_FT_REPORTES se rechaza ft-tarea-marcar');
  await rechaza(como(uRep, () => call('ft-plantillas-save', { titulo: 'X', cargoId: cocinero.id, ancla: 'HORA_FIJA', horaFija: '09:00' })), 'FORBIDDEN', 'ni puede crear plantillas');
  await rechaza(como(uRep, () => call('ft-config-set', { activo: false })), 'FORBIDDEN', 'ni tocar la configuración');
  const lista = await como(uRep, () => call('ft-tareas-list', { desde: '2026-11-14', hasta: '2026-11-15' }));
  ok(Array.isArray(lista) && lista.length > 0, 'pero sí lee (ft-tareas-list)', lista.length);
  await rechaza(call('ft-tareas-list', { desde: '2026-10-01', hasta: '2026-11-15' }), 'RANGO_EXCEDIDO', 'rango de más de 31 días → rechazado');
  await rechaza(como(uAna, () => call('ft-tareas-list', {})), 'FORBIDDEN', 'la colaboradora no lista tareas de todos');

  // ===== L) No aplica, manual, vencimiento =====
  console.log('\n[L] No aplica, manual y vencimiento');
  await rechaza(como(uBeto, () => call('ft-tarea-no-aplica', tP5Beto.id, '  ')), 'VALIDACION', 'no aplica exige motivo');
  const na = await como(uBeto, () => call('ft-tarea-no-aplica', tP5Beto.id, 'franco compensatorio'));
  ok(na.estado === 'NO_APLICA' && na.motivoNoAplica === 'FRANCO COMPENSATORIO', 'no aplica con motivo');
  await rechaza(como(uAna, () => call('ft-tarea-crear-manual', { funcionarioId: fBeto.id, titulo: 'X' })), 'FORBIDDEN', 'la colaboradora no crea tareas manuales');
  const man = await como(uVero, () => call('ft-tarea-crear-manual', { funcionarioId: fAna.id, titulo: 'reponer servilletas', fecha: '2026-11-14', inicio: L(2026, 11, 14, 12, 0), duracionMin: 30 }));
  ok(man.origen === 'MANUAL' && man.estado === 'PENDIENTE' && man.titulo === 'REPONER SERVILLETAS', 'tarea manual creada', man);
  const man2 = await como(uVero, () => call('ft-tarea-crear-manual', { funcionarioId: fAna.id, plantillaId: p1.id, fecha: '2026-11-14', inicio: L(2026, 11, 14, 13, 0) }));
  ok(man2.items.length === 3 && man2.plantilla?.id === p1.id, 'manual desde plantilla checklist copia los ítems (y no choca con el UNIQUE del motor)');
  // ===== V) Vencimiento =====
  console.log('\n[V] Vencimiento');
  const tP5Carla: any = de(await tareas(), fCarla.id, p5.id, '2026-11-14')[0];
  const rv = await tick(L(2026, 11, 14, 23, 30));
  const tv = await ds.getRepository(FtTarea).findOneBy({ id: tP5Carla.id });
  const tm = await ds.getRepository(FtTarea).findOneBy({ id: man.id });
  const tHecha = await ds.getRepository(FtTarea).findOneBy({ id: tP4Ana.id });
  ok(rv.vencidas >= 2 && tv.estado === 'VENCIDA' && tm.estado === 'VENCIDA', 'PENDIENTE con vence pasado → VENCIDA', { vencidas: rv.vencidas, carla: tv.estado, manual: tm.estado });
  ok(tHecha.estado === 'HECHA', 'las HECHAS no se tocan');
  const tP2 = await ds.getRepository(FtTarea).findOneBy({ id: tP2Beto.id });
  ok(tP2.estado === 'PENDIENTE', 'la del turno nocturno que vence a las 06:00 del 15 sigue PENDIENTE a las 23:30 del 14');
  await rechaza(como(uAna, () => call('ft-tarea-marcar', man.id, {})), 'ESTADO_INVALIDO', 'una VENCIDA no se marca');


  // ===== F2) Nocturno pasada la medianoche =====
  console.log('\n[F2] Generación del turno de ayer');
  const fBruno = await mkFunc('BRUNO', cocinero, undefined, nocturno);
  await tick(L(2026, 11, 15, 2, 0));
  const tBruno = de(await tareas(), fBruno.id);
  ok(de(tBruno, fBruno.id, p2.id, '2026-11-14').length === 1, 'a las 02:00 del 15 se genera la del turno del 14 que sigue abierta');
  ok(de(tBruno, fBruno.id, p1.id, '2026-11-14').length === 0, 'pero no la del 14 que ya venció (22:00–23:00)');
  ok(de(tBruno, fBruno.id, undefined, '2026-11-15').length === 3, 'y las del turno del 15 (P1, P2, P5)', tBruno.map((t: any) => [t.fecha, t.plantilla.id]));

  // ===== G) Cambio de cargo =====
  console.log('\n[G] Cambio de cargo a mitad de mes');
  await tick(L(2026, 11, 15, 7, 0));
  const tc = await tareas();
  ok(de(tc, fCarla.id, p5.id, '2026-11-14').length === 1 && de(tc, fCarla.id, p3.id, '2026-11-14').length === 0, '14/11: Carla recibe la de cocinero');
  ok(de(tc, fCarla.id, p3.id, '2026-11-15').length === 1 && de(tc, fCarla.id, p5.id, '2026-11-15').length === 0, '15/11: Carla recibe la de gerente y ya no la de cocinero');

  // ===== M) Lock =====
  console.log('\n[M] Lock en base');
  const lockRepo = ds.getRepository(FtConfig);
  const ahoraM = L(2026, 11, 16, 7, 0);
  await lockRepo.update({ clave: 'motor_lock' }, { valor: JSON.stringify({ duenio: 'OTRA-PC', expira: ahoraM.getTime() + 60_000 }) });
  const antesM = (await tareas()).length;
  const rl = await tick(ahoraM);
  ok(rl.omitido === 'LOCK' && (await tareas()).length === antesM, 'con lock ajeno vigente el tick no corre', rl);
  ok(!(await tomarLockFt(ds, 'TERCERA', ahoraM)), 'otro dueño tampoco lo toma');
  await lockRepo.update({ clave: 'motor_lock' }, { valor: JSON.stringify({ duenio: 'OTRA-PC', expira: ahoraM.getTime() - 1 }) });
  const rl2 = await tick(ahoraM);
  ok(rl2.ejecutado && rl2.generadas > 0, 'con el lock vencido el tick corre y genera el 16', rl2);
  const lockFin = await lockRepo.findOneBy({ clave: 'motor_lock' });
  ok(!lockFin?.valor, 'al terminar el tick libera el lock');

  // ===== C') Apagado de nuevo =====
  await call('ft-config-set', { activo: 'false' });
  const antesOff = (await tareas()).length;
  const roff = await tick(L(2026, 11, 17, 7, 0));
  ok(roff.omitido === 'APAGADO' && (await tareas()).length === antesOff, 'al apagarlo deja de generar');

  // ═════════════════════════ FASE 2 ═════════════════════════
  // Aislado de lo anterior: se apagan las plantillas de fase 1 y se usa otro cargo y otras fechas.
  console.log('\n[F2-0] Fase 2: preparación');
  for (const p of [p1, p2, p3, p4, p5]) await call('ft-plantillas-set-activo', p.id, false);
  await call('ft-config-set', { activo: 'true', umbral_reincidencia: '2', ventana_reincidencia_dias: '30' });
  setNotificacionDataSource(ds);
  await seedNotificaciones(ds); // RECORDATORIO_TAREA ya está en el catálogo
  const { ConfiguracionNotificacion } = E('notificaciones/configuracion-notificacion.entity');
  const globalNotif = async (on: boolean) => ds.getRepository(ConfiguracionNotificacion).update({ clave: 'NOTIF_GLOBAL_ACTIVO' }, { valor: on ? 'true' : 'false' });
  await globalNotif(true);
  const llamadas = { directo: [] as any[], dispatch: [] as any[] };
  fijarEnviadorFt({
    enviarDirecto: (async (p: any) => { llamadas.directo.push(p); return { canal: p.canal, destino: p.destino, estado: 'ENVIADO' }; }) as any,
    dispatchEvento: (async (codigo: string, p: any) => { llamadas.dispatch.push({ codigo, ...p }); return [{ canal: 'WHATSAPP', destino: 'GRUPO-ADM', estado: 'ENVIADO' }]; }) as any,
  });
  const { FtAvisoEnviado } = E('rrhh/funciones-tareas/ft-aviso-enviado.entity');
  const { FtPropuestaFalta } = E('rrhh/funciones-tareas/ft-propuesta-falta.entity');
  const { Asistencia } = E('rrhh/asistencia.entity');
  const avisos = async (where: any = {}) => ds.getRepository(FtAvisoEnviado).find({ where, relations: ['tarea'], order: { id: 'ASC' } });
  const cajeroC: any = await save(Cargo, { nombre: 'CAJERO', activo: true });
  const encargadoC: any = await save(Cargo, { nombre: 'ENCARGADO DE TURNO', activo: true });
  const uDani: any = await save(Usuario, { nickname: 'DANI', password: 'x', activo: true });
  await permisos(uDani, 'CAJERO_FT', ['RRHH_FT_MARCAR_PROPIAS', 'FINANCIERO_CAJA_OPERAR']);
  await permisos(admin, 'ADMIN_CAJA', ['FINANCIERO_CAJA_GESTIONAR', 'FINANCIERO_CAJA_OPERAR']);
  clearPermissionCache();
  const fDani = await mkFunc('DANI', cajeroC, uDani, diurno);
  const fFede = await mkFunc('FEDE', cajeroC, undefined, diurno);
  const fEli = await mkFunc('ELI', encargadoC, undefined, diurno);
  await ds.getRepository(Persona).update({ id: fDani.persona.id }, { telefono: '0981111111' });
  await ds.getRepository(Persona).update({ id: fFede.persona.id }, { telefono: '0983333333' });
  await ds.getRepository(Persona).update({ id: fEli.persona.id }, { telefono: '0982222222' });
  // Fede marcó entrada el 20 → no es ausente.
  await save(Asistencia, { funcionario: fFede, fecha: '2026-11-20', horaEntrada: '07:58', estado: 'PRESENTE', minutosTardanza: 0, justificada: false });
  const pa = await call('ft-plantillas-save', {
    titulo: 'arqueo de media mañana', cargoId: cajeroC.id, ancla: 'HORA_FIJA', horaFija: '10:00', duracionMin: 60, critica: true,
    requiereVerificacion: true, verificadorCargoId: encargadoC.id,
    reglas: [
      { momento: 'ANTES_VENCER', minutos: 15, nivel: 1, canal: 'WHATSAPP' },
      { momento: 'AL_VENCER', nivel: 1, canal: 'GERENTE' },
      { momento: 'ESCALAMIENTO', minutos: 30, nivel: 2, canal: 'WHATSAPP' },
      { momento: 'ESCALAMIENTO', minutos: 60, nivel: 3, canal: 'APP' },
    ],
  });
  ok(pa.reglas.length === 4, 'plantilla con 4 reglas (WHATSAPP, GERENTE, grupo ADM, nivel 3)');
  await tick(L(2026, 11, 20, 7, 0));
  const tDani20: any = de(await tareas(), fDani.id, pa.id, '2026-11-20')[0];
  const tFede20: any = de(await tareas(), fFede.id, pa.id, '2026-11-20')[0];
  ok(!!tDani20 && !!tFede20, 'genera la tarea para los dos cajeros');

  console.log('\n[F2-A] Dedupe y canal WHATSAPP');
  await tick(L(2026, 11, 20, 10, 46));
  await tick(L(2026, 11, 20, 10, 50));
  const av1 = await avisos({ clave: `ft:${tDani20.id}:ANTES_VENCER:1` });
  ok(av1.length === 1, '2 ticks = 1 aviso (UNIQUE clave)', av1.length);
  const directoDani = llamadas.directo.filter((x) => x.destino === '0981111111');
  ok(directoDani.length === 1 && directoDani[0].eventoCodigo === 'RECORDATORIO_TAREA', 'enviarDirecto una sola vez, al teléfono del responsable', directoDani);
  ok(av1[0]?.estado === 'ENVIADO' && av1[0]?.canal === 'WHATSAPP' && !!av1[0]?.enviadoEn && av1[0]?.intentos === 1, 'regla WHATSAPP queda ENVIADO por la app', av1[0]);

  console.log('\n[F2-B] Ausente con tarea crítica');
  const ausDani = await avisos({ clave: `ft:${tDani20.id}:AUSENTE:1` });
  const ausFede = await avisos({ clave: `ft:${tFede20.id}:AUSENTE:1` });
  ok(ausDani.length === 1 && ausDani[0].momento === 'AUSENTE' && ausDani[0].destino === '0982222222', 'sin marcación tras la tolerancia → aviso al encargado (cargo verificador)', ausDani[0]);
  ok(ausFede.length === 0, 'quien marcó entrada no genera aviso de ausente');
  ok(ausDani[0]?.canal === 'APP' && ausDani[0]?.estado === 'ENVIADO' && !llamadas.directo.some((x) => x.destino === '0982222222'), 'canal_ausente APP por defecto: no sale por WhatsApp');

  console.log('\n[F2-C] Canal GERENTE y grupo ADM');
  const nDir = llamadas.directo.length;
  const nDisp = llamadas.dispatch.length;
  await tick(L(2026, 11, 20, 11, 5));
  const avG = await avisos({ clave: `ft:${tDani20.id}:AL_VENCER:1` });
  ok(avG.length === 1 && avG[0].canal === 'GERENTE' && avG[0].estado === 'PARA_GERENTE', 'regla GERENTE queda PARA_GERENTE con canal GERENTE', avG[0]);
  ok(llamadas.directo.length === nDir && llamadas.dispatch.length === nDisp, 'regla GERENTE no llama a enviarDirecto ni a dispatchEvento', { dir: llamadas.directo.length - nDir, disp: llamadas.dispatch.length - nDisp });
  await tick(L(2026, 11, 20, 11, 35));
  const avEsc = await avisos({ clave: `ft:${tDani20.id}:ESCALAMIENTO:2` });
  const dispDani = llamadas.dispatch.filter((x) => x.dedupeKey === `ft:${tDani20.id}:ESCALAMIENTO:2`);
  ok(avEsc.length === 1 && avEsc[0].estado === 'ENVIADO' && avEsc[0].destino === 'GRUPO_ADM', 'nivel 2 al grupo ADM registrado y ENVIADO', avEsc[0]);
  ok(dispDani.length === 1 && dispDani[0].codigo === 'RECORDATORIO_TAREA', 'nivel 2 sale por dispatchEvento(RECORDATORIO_TAREA)', dispDani);
  await tick(L(2026, 11, 20, 12, 5));
  ok((await ds.getRepository(FtPropuestaFalta).count()) === 0, 'nivel 3 con 1 vencida (umbral 2) no propone nada');

  console.log('\n[F2-D] Escalamiento nivel 3 → propuesta PENDIENTE');
  await tick(L(2026, 11, 21, 7, 0));
  await tick(L(2026, 11, 21, 12, 5));
  await tick(L(2026, 11, 21, 12, 10));
  const props = await ds.getRepository(FtPropuestaFalta).find({ relations: ['funcionario', 'tarea'] });
  const propsDani = props.filter((x: any) => x.funcionario.id === fDani.id);
  ok(propsDani.length === 1 && propsDani[0].estado === 'PENDIENTE' && /2 VENCIDAS/.test(propsDani[0].motivo), 'reincidencia (2 en 30 días) → 1 ft_propuesta_falta PENDIENTE', propsDani.map((x: any) => [x.estado, x.motivo]));
  const drFaltas = await ds.query('SELECT COUNT(*) AS n FROM dr_falta');
  ok(Number(drFaltas[0].n) === 0, 'nunca inserta en dr_falta');
  const avN3 = await avisos({ clave: `ft:${propsDani[0]?.tarea?.id}:ESCALAMIENTO:3` });
  ok(avN3.length === 1 && /PROPUESTA DE FALTA/.test(avN3[0].mensaje) && avN3[0].destino === '0982222222', 'y avisa al encargado', avN3[0]);

  console.log('\n[F2-E] ft-avisos (lectura para el Gerente)');
  const lAv = await como(uRep, () => call('ft-avisos', { desde: '2026-11-20', hasta: '2026-11-21' }));
  const gerenteAv = lAv.filter((a: any) => a.canal === 'GERENTE');
  ok(gerenteAv.length >= 2 && gerenteAv.every((a: any) => a.destinoCanal === 'GERENTE' && a.estado === 'PARA_GERENTE' && !a.enviadoPorApp), 'los avisos GERENTE aparecen en ft-avisos, sin enviar por la app', gerenteAv.length);
  const waAv = lAv.find((a: any) => a.clave === `ft:${tDani20.id}:ANTES_VENCER:1`);
  ok(waAv?.enviadoPorApp === true && waAv.funcionario?.id === fDani.id && waAv.tarea?.id === tDani20.id, 'el WHATSAPP aparece marcado enviadoPorApp', waAv);
  const soloG = await como(uRep, () => call('ft-avisos', { desde: '2026-11-20', hasta: '2026-11-21', canal: 'GERENTE', estado: 'PARA_GERENTE' }));
  ok(soloG.length === gerenteAv.length, 'filtro por canal y estado', soloG.length);
  await rechaza(como(uRep, () => call('ft-avisos', { desde: '2026-10-01', hasta: '2026-11-21' })), 'RANGO_EXCEDIDO', 'ft-avisos: más de 31 días → rechazado');
  await rechaza(como(uVero, () => call('ft-avisos', { desde: '2026-11-20' })), 'FORBIDDEN', 'ft-avisos: solo RRHH_FT_REPORTES o VER_TODO');

  console.log('\n[F2-F] Propuestas: listar y resolver');
  const lpTodas = await como(uVero, () => call('ft-propuestas-list', { estado: 'PENDIENTE' }));
  ok(lpTodas.length === 2, 'ft-propuestas-list PENDIENTE: Dani y Fede (los dos reincidieron)', lpTodas.length);
  const lp = await como(uVero, () => call('ft-propuestas-list', { estado: 'PENDIENTE', funcionarioId: fDani.id }));
  ok(lp.length === 1 && lp[0].funcionario.id === fDani.id && /2 VENCIDAS/.test(lp[0].motivo), 'filtro por funcionario', lp.length);
  await rechaza(como(uRep, () => call('ft-propuesta-resolver', lp[0].id, { estado: 'DESCARTADA' })), 'FORBIDDEN', 'con solo REPORTES no se resuelve');
  await rechaza(como(uVero, () => call('ft-propuesta-resolver', lp[0].id, { estado: 'PENDIENTE' })), 'VALIDACION', 'no se «resuelve» como PENDIENTE');
  const rp = await como(uVero, () => call('ft-propuesta-resolver', lp[0].id, { estado: 'REGISTRADA', nota: 'cargada en DR' }));
  ok(rp.estado === 'REGISTRADA', 'la encargada la marca REGISTRADA');
  await rechaza(como(uVero, () => call('ft-propuesta-resolver', lp[0].id, { estado: 'DESCARTADA' })), 'ESTADO_INVALIDO', 'una resuelta no se vuelve a resolver');
  await call('ft-plantillas-set-activo', pa.id, false);

  console.log('\n[F2-G] NOTIF_GLOBAL_ACTIVO apagado');
  await globalNotif(false);
  const pb = await call('ft-plantillas-save', {
    titulo: 'contar cambio', funcionarioId: fDani.id, ancla: 'HORA_FIJA', horaFija: '15:00', duracionMin: 30,
    reglas: [{ momento: 'ANTES_INICIO', minutos: 10, nivel: 1, canal: 'WHATSAPP' }],
  });
  await tick(L(2026, 11, 22, 7, 0));
  const tPb: any = de(await tareas(), fDani.id, pb.id, '2026-11-22')[0];
  const nDir2 = llamadas.directo.length;
  await tick(L(2026, 11, 22, 14, 51));
  const avOff = await avisos({ clave: `ft:${tPb.id}:ANTES_INICIO:1` });
  ok(llamadas.directo.length === nDir2, 'con NOTIF_GLOBAL_ACTIVO apagado no se llama a enviarDirecto');
  ok(avOff.length === 1 && avOff[0].estado === 'FALLIDO' && /NOTIF_GLOBAL_ACTIVO/.test(avOff[0].error), 'queda FALLIDO con el motivo', avOff[0]);
  await globalNotif(true);
  await tick(L(2026, 11, 22, 14, 56));
  const avOn = await avisos({ clave: `ft:${tPb.id}:ANTES_INICIO:1` });
  ok(avOn[0].estado === 'ENVIADO' && avOn[0].intentos === 2 && llamadas.directo.length === nDir2 + 1, 'al prenderlo, el reintento lo envía una vez', avOn[0]);

  console.log('\n[F2-H] Eventos de caja');
  const pe = await call('ft-plantillas-save', {
    titulo: 'conteo de apertura de caja', cargoId: cajeroC.id, recurrencia: 'EVENTO', evento: 'CAJA_ABIERTA', eventoCaja: 'PDV',
    ancla: 'EVENTO', duracionMin: 30,
  });
  ok(pe.eventoCaja === 'PDV', 'plantilla EVENTO de caja PdV');
  registerFinancieroHandlers(ds, () => actual);
  registerCajaMayorHandlers(ds, () => actual);
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const term1: any = await save(Dispositivo, { nombre: 'CAJA FT 1', activo: true, isCaja: true });
  const term2: any = await save(Dispositivo, { nombre: 'CAJA FT 2', activo: true, isCaja: true });
  fijarRelojFt(L(2026, 11, 23, 9, 0));
  // Hook con error forzado: la apertura sale igual.
  fijarInterceptorEventoFt(() => { throw new Error('FALLO FORZADO DEL MÓDULO FT'); });
  const conteo1: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
  let cajaErr: any = null;
  try { cajaErr = await call('abrir-caja-desde-conteo', conteo1.id, term1.id); } catch (e: any) { cajaErr = { error: e?.message }; }
  await esperarEventosFt();
  ok(cajaErr?.id > 0 && cajaErr.estado === 'ABIERTO', 'hook de FT con error no rompe abrir-caja-desde-conteo', cajaErr);
  ok((await tareas({ eventoRef: `PDV:${cajaErr?.id}` })).length === 0, 'y no genera tarea (el error quedó atrapado)');
  fijarInterceptorEventoFt(null);
  // Caja de Dani: la tarea es solo de quien abrió.
  const conteo2: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
  const cajaDani = await como(uDani, () => call('create-caja', { dispositivo: { id: term2.id }, conteoApertura: { id: conteo2.id }, fechaApertura: new Date(), activo: true, estado: 'ABIERTO' }));
  await esperarEventosFt();
  const tEv = await tareas({ eventoRef: `PDV:${cajaDani.id}` });
  ok(tEv.length === 1 && tEv[0].funcionario.id === fDani.id && tEv[0].origen === 'EVENTO' && tEv[0].plantilla.id === pe.id, 'create-caja genera la tarea del evento para quien abrió', tEv.map((t: any) => [t.funcionario.id, t.origen]));
  ok(hm(tEv[0]?.inicio) === '23 09:00' && hm(tEv[0]?.vence) === '23 09:30', 'ventana desde el evento + duración', [hm(tEv[0]?.inicio), hm(tEv[0]?.vence)]);
  const rEv2 = await ftOnEvento(ds, 'CAJA_ABIERTA' as any, cajaDani.id, { tipoCaja: 'PDV' as any, usuarioId: uDani.id });
  ok(rEv2.generadas === 0 && rEv2.existentes === 1 && (await tareas({ eventoRef: `PDV:${cajaDani.id}` })).length === 1, 'el mismo evento dos veces no duplica (idempotente)', rEv2);
  const rMayor = await ftOnEvento(ds, 'CAJA_ABIERTA' as any, 99, { tipoCaja: 'MAYOR' as any });
  ok(rMayor.omitido === 'SIN_PLANTILLAS', 'una plantilla de caja PdV no se dispara con la caja mayor', rMayor);

  console.log('\n[F2-I] Foto de evidencia');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 1)]);
  await call('ft-config-set', { foto_max_kb: '50' });
  const grande = Buffer.concat([png, Buffer.alloc(60 * 1024, 1)]).toString('base64');
  await rechaza(como(uDani, () => call('ft-tarea-subir-foto', tEv[0].id, { base64: grande })), 'FOTO_EXCEDIDA', 'foto de más de foto_max_kb → rechazada');
  await rechaza(como(uDani, () => call('ft-tarea-subir-foto', tEv[0].id, { base64: Buffer.from('no soy una imagen').toString('base64') })), 'FOTO_INVALIDA', 'algo que no es imagen → rechazado');
  await rechaza(como(uAna, () => call('ft-tarea-subir-foto', tEv[0].id, { base64: png.toString('base64') })), 'NO_ENCONTRADO', 'no se sube foto a una tarea ajena');
  const foto = await como(uDani, () => call('ft-tarea-subir-foto', tEv[0].id, { base64: 'data:image/png;base64,' + png.toString('base64') }));
  const archivo = path.join(tmpDir, 'ft-evidencias', String(foto.url).replace('app://ft-evidencias/', ''));
  ok(/^app:\/\/ft-evidencias\/ftev-\d+-.+\.png$/.test(foto.url) && fs.existsSync(archivo) && foto.tarea.evidenciaUrl === foto.url, 'foto válida guardada en ft-evidencias y vinculada a la tarea', foto.url);
  await rechaza(como(uDani, () => call('ft-tarea-marcar', tEv[0].id, { evidenciaUrl: 'https://otro.sitio/x.png' })), 'VALIDACION', 'ft-tarea-marcar no acepta URLs ajenas a ft-evidencias');
  if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
  fijarEnviadorFt(null);

  console.log('\n[F5] Lecturas para el Gerente');
  const todas: any[] = await call('ft-tareas-list', { desde: '2026-11-01', hasta: '2026-11-30' });
  const cump = await como(uRep, () => call('ft-cumplimiento', { mes: '2026-11' }));
  ok(cump.desde === '2026-11-01' && cump.hasta === '2026-11-30' && cump.total.asignadas === todas.length, 'ft-cumplimiento por mes cuenta todas las tareas del mes', { total: cump.total.asignadas, n: todas.length });
  const sumaFilas = cump.filas.reduce((a: number, x: any) => a + x.asignadas, 0);
  const hechasOk = todas.filter((t) => ['HECHA', 'VERIFICADA'].includes(t.estado)).length;
  const base = todas.length - todas.filter((t) => t.estado === 'NO_APLICA').length;
  ok(sumaFilas === todas.length && cump.total.cumplimiento === (base ? Math.round((hechasOk * 1000) / base) / 10 : null), 'filas por persona suman el total y el % es (hechas+verificadas)/(asignadas-no aplica)', { sumaFilas, pct: cump.total.cumplimiento });
  const porCargo = await como(uRep, () => call('ft-cumplimiento', { mes: '2026-11', agrupar: 'cargo' }));
  ok(porCargo.filas.reduce((a: number, x: any) => a + x.asignadas, 0) === todas.length && porCargo.filas.some((x: any) => x.nombre === 'COCINERO'), 'agrupado por cargo vigente', porCargo.filas.map((x: any) => x.nombre));
  await rechaza(como(uRep, () => call('ft-cumplimiento', { desde: '2026-10-01', hasta: '2026-11-30' })), 'RANGO_EXCEDIDO', 'ft-cumplimiento: más de 31 días → rechazado');
  await rechaza(como(uAna, () => call('ft-cumplimiento', {})), 'FORBIDDEN', 'una colaboradora no lee el cumplimiento de todos');
  const venc = await como(uRep, () => call('ft-vencidas', { desde: '2026-11-01', hasta: '2026-11-30' }));
  ok(Array.isArray(venc) && venc.length >= todas.filter((t) => t.estado === 'VENCIDA').length && venc.every((v: any) => v.responsable?.id > 0 && v.atrasoMin >= 0), 'ft-vencidas trae las vencidas con responsable y atraso', venc.length);
  const hist = await como(uRep, () => call('ft-historico', { mes: '2026-11', por: 'semana' }));
  ok(hist.periodos.length >= 1 && hist.periodos.every((p: any) => /^2026-1[01]-\d\d$/.test(p.periodo)) && Array.isArray(hist.reincidencias), 'ft-historico por semana (lunes) con reincidencias', hist.periodos.map((p: any) => p.periodo));
  const deTurno = await como(uRep, () => call('ft-de-turno-hoy', '2026-11-14'));
  ok(deTurno.fecha === '2026-11-14' && deTurno.personas.every((p: any) => p.turno?.id > 0), 'ft-de-turno-hoy lista solo quienes tienen turno ese día', deTurno.personas.length);
  const motor = await como(uRep, () => call('ft-estado-motor'));
  ok(typeof motor.activo === 'boolean' && motor.intervaloMin >= 1 && motor.ultimoTick?.ejecutado !== undefined, 'ft-estado-motor devuelve activo, intervalo y último tick', motor);

  fijarRelojFt(null);
  await ds.destroy();
  console.log(`\n[ft-e2e] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
