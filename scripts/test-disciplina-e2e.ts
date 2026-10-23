/**
 * E2E: Disciplina y Reconocimiento (DR) — bloque faltas.
 *
 * Handlers REALES contra SQLite temporal (migraciones completas):
 *  A) Catálogo: crear tipo de falta (1 advertencia, luego 50.000).
 *  B) Registro: 1.ª ocurrencia = ADVERTENCIA, 2.ª = MULTA; lote de varios funcionarios.
 *  C) Permisos: colaborador sin RRHH_DR_REGISTRAR no puede registrar ni aprobar.
 *  D) Identidad: «mis faltas» y apelar usan el usuario de sesión; no se apela una falta ajena.
 *  E) Aprobar MULTA → Penalizacion «[DR]» única; doble aprobación rechazada.
 *  F) La liquidación BORRADOR del mes la incluye como descuento.
 *  G) Mes con liquidación APROBADA → la multa va al mes siguiente.
 *  H) Anular falta aprobada → Penalizacion anulada. Justificar apelación → sin penalización.
 *  I) Handlers viejos no pueden editar una Penalizacion [DR].
 *
 * Uso: npm run test:disciplina-e2e
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerDisciplinaHandlers } from '../electron/handlers/disciplina.handler';
import { registerAsistenciasHandlers } from '../electron/handlers/asistencias.handler';
import { registerLiquidacionSueldoHandlers, seedLiquidacionConceptos } from '../electron/handlers/liquidacion-sueldo.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function rechaza(p: Promise<any>, codigo: string | RegExp, name: string) {
  try { await p; ok(false, name, 'no lanzó'); }
  catch (e: any) {
    const m = typeof codigo === 'string' ? e?.code === codigo : codigo.test(String(e?.message));
    ok(m, name, { code: e?.code, msg: e?.message });
  }
}
const approx = (a: any, b: number) => Math.abs(Number(a) - b) < 0.01;
const call = (canal: string, ...args: any[]) => invokeHandlerWithContext(canal, undefined, ...args);

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-disciplina-e2e.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const ds = new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[disciplina-e2e] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { Penalizacion } = E('rrhh/penalizacion.entity');
  const { LiquidacionSueldo } = E('rrhh/liquidacion-sueldo.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { DrFalta } = E('rrhh/disciplina/dr-falta.entity');

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

  const admin: any = await save(Usuario, { nickname: 'ADMIN', password: 'x', activo: true });
  await permisos(admin, 'ADMIN_DR', [
    'RRHH_DR_CONFIGURAR', 'RRHH_DR_REGISTRAR', 'RRHH_DR_APROBAR', 'RRHH_PENALIZACION_REGISTRAR',
    'RRHH_LIQUIDACION_GENERAR', 'RRHH_LIQUIDACION_APROBAR',
  ]);
  const colab: any = await save(Usuario, { nickname: 'COLAB', password: 'x', activo: true });
  await permisos(colab, 'COLABORADOR_DR_TEST', ['RRHH_DR_MIS_DATOS', 'RRHH_DR_VOTAR']);

  let actual: any = admin;
  const como = async <T>(u: any, fn: () => Promise<T>) => { const prev = actual; actual = u; try { return await fn(); } finally { actual = prev; } };
  await seedLiquidacionConceptos(ds);
  registerDisciplinaHandlers(ds, () => actual);
  registerAsistenciasHandlers(ds, () => actual);
  registerLiquidacionSueldoHandlers(ds, () => actual);

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const cargo: any = await save(Cargo, { nombre: 'COCINERO', activo: true });
  const mkFunc = async (nombre: string, usuario?: any) => {
    const persona: any = await save(Persona, { nombre, apellido: 'TEST', activo: true });
    return save<any>(Funcionario, {
      persona, cargo, fechaIngreso: '2024-01-01', salarioBase: 3000000, monedaSalario: pyg,
      activo: true, ipsActivo: false, esJornalero: false, usuario,
    });
  };
  const fA: any = await mkFunc('ANA', colab);
  const fB: any = await mkFunc('BETO');
  const fC: any = await mkFunc('CARLA');

  // ===== A) Catálogo =====
  console.log('\n[A] Catálogo de tipos de falta');
  const tipo = await call('dr-save-tipo-falta', {
    nombre: 'cocina sucia al cierre', advertenciasPrevias: 1, montoMulta: 50000, moneda: { id: pyg.id },
    reinicio: 'MENSUAL', plazoApelacionHoras: 48, activo: true,
  });
  ok(tipo?.id > 0 && tipo.nombre === 'COCINA SUCIA AL CIERRE', 'crea tipo de falta en MAYÚSCULAS', tipo?.nombre);
  const tipos = await call('dr-get-tipos-falta');
  ok(tipos.length === 1, 'lista tipos activos', tipos.length);
  await rechaza(call('dr-save-tipo-falta', { nombre: 'X', montoMulta: -1 }), 'VALIDACION', 'rechaza monto negativo');

  // ===== B) Registro =====
  console.log('\n[B] Registro de faltas');
  const r1 = await call('dr-registrar-falta', { tipoFaltaId: tipo.id, fecha: '2026-11-03', funcionarioIds: [fA.id] });
  ok(r1.creadas[0].resultado === 'ADVERTENCIA' && r1.creadas[0].nOcurrencia === 1, '1.ª ocurrencia = ADVERTENCIA', r1.creadas[0]);
  const r2 = await call('dr-registrar-falta', { tipoFaltaId: tipo.id, fecha: '2026-11-05', funcionarioIds: [fA.id] });
  ok(r2.creadas[0].resultado === 'MULTA' && approx(r2.creadas[0].montoCalculado, 50000), '2.ª ocurrencia = MULTA 50.000', r2.creadas[0]);
  const lote = await call('dr-registrar-falta', { tipoFaltaId: tipo.id, fecha: '2026-11-05', funcionarioIds: [fB.id, fC.id] });
  ok(lote.creadas.length === 2 && !!lote.loteId && lote.creadas.every((f: any) => f.loteId === lote.loteId), 'lote de 2 con el mismo loteId', lote);

  // ===== C) Permisos =====
  console.log('\n[C] Permisos');
  await como(colab, () => rechaza(call('dr-registrar-falta', { tipoFaltaId: tipo.id, fecha: '2026-11-05', funcionarioIds: [fB.id] }), 'FORBIDDEN', 'colaborador no registra faltas'));
  await como(colab, () => rechaza(call('dr-aprobar-falta', r2.creadas[0].id), 'FORBIDDEN', 'colaborador no aprueba'));
  await rechaza(call('dr-mis-faltas'), 'FORBIDDEN', 'admin sin MIS_DATOS no usa «mis faltas»');

  // ===== D) Identidad de sesión =====
  console.log('\n[D] Mis faltas y apelación');
  const mias = await como(colab, () => call('dr-mis-faltas'));
  ok(mias.length === 2, 'colaborador ve solo sus 2 faltas', mias.length);
  const faltaB = lote.creadas[0];
  await como(colab, () => rechaza(call('dr-apelar-falta', faltaB.id, 'no fui yo'), 'NO_ENCONTRADO', 'no puede apelar falta ajena'));
  await como(colab, () => call('dr-apelar-falta', r1.creadas[0].id, 'estaba de franco'));
  const apelada: any = await ds.getRepository(DrFalta).findOne({ where: { id: r1.creadas[0].id } });
  ok(apelada.estado === 'APELADA' && apelada.apelacionTexto === 'ESTABA DE FRANCO', 'apelación guardada', apelada.estado);

  // ===== E) Aprobar MULTA =====
  console.log('\n[E] Aprobar multa → Penalizacion [DR]');
  const ap = await call('dr-aprobar-falta', r2.creadas[0].id, 'ok');
  ok(!!ap.penalizacionId && ap.mesDestino === '2026-11', 'crea penalización en mes 2026-11', ap);
  const pen: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap.penalizacionId }, relations: ['funcionario'] });
  ok(pen && pen.descripcion.startsWith('[DR]') && approx(pen.monto, 50000) && pen.funcionario.id === fA.id, 'penalización [DR] 50.000 a ANA', pen?.descripcion);
  await rechaza(call('dr-aprobar-falta', r2.creadas[0].id), 'ESTADO_INVALIDO', 'segunda aprobación rechazada');
  const nPen = await ds.getRepository(Penalizacion).count();
  ok(nPen === 1, 'sigue habiendo 1 sola penalización', nPen);

  // ===== F) Liquidación borrador =====
  console.log('\n[F] Liquidación borrador incluye la multa');
  const liq = await call('generar-liquidacion-borrador', { funcionarioId: fA.id, periodo: '2026-11', monedaPagoId: pyg.id });
  const det = await call('get-liquidacion-sueldo', liq.id);
  ok(approx(det.totalDescuentos, 50000), 'totalDescuentos = 50.000 (la multa DR)', det.totalDescuentos);

  // ===== G) Mes cerrado → siguiente =====
  console.log('\n[G] Mes con liquidación aprobada → mes siguiente');
  await call('aprobar-liquidacion-sueldo', liq.id);
  const r3 = await call('dr-registrar-falta', { tipoFaltaId: tipo.id, fecha: '2026-11-20', funcionarioIds: [fA.id] });
  const ap3 = await call('dr-aprobar-falta', r3.creadas[0].id);
  ok(ap3.mesDestino === '2026-12', 'va a 2026-12', ap3);
  const pen3: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap3.penalizacionId } });
  ok(String(pen3.fecha).slice(0, 7) === '2026-12', 'fecha de la penalización en diciembre', pen3.fecha);
  await rechaza(call('dr-anular-falta', r2.creadas[0].id, 'error'), 'LIQUIDACION_CERRADA', 'no anula multa ya liquidada (aprobada)');

  // ===== H) Anular / justificar =====
  console.log('\n[H] Anular y justificar');
  await call('dr-anular-falta', r3.creadas[0].id, 'cargada por error');
  const pen3b: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap3.penalizacionId } });
  ok(pen3b.anulada === true, 'anular falta → penalización anulada', pen3b.anulada);
  await call('dr-justificar-falta', r1.creadas[0].id, 'apelación aceptada');
  const just: any = await ds.getRepository(DrFalta).findOne({ where: { id: r1.creadas[0].id }, relations: ['penalizacion'] });
  ok(just.estado === 'JUSTIFICADA' && !just.penalizacion, 'justificada sin penalización', just.estado);
  await rechaza(call('dr-justificar-falta', r1.creadas[0].id, 'otra vez'), 'ESTADO_INVALIDO', 'no se justifica dos veces');

  // ===== I) Protección en handlers viejos =====
  console.log('\n[I] Handlers viejos no editan [DR]');
  await rechaza(call('update-penalizacion', { id: ap.penalizacionId, monto: 1 }), /DISCIPLINA/, 'update-penalizacion bloqueado para [DR]');
  await rechaza(call('anular-penalizacion', ap.penalizacionId), /DISCIPLINA/, 'anular-penalizacion bloqueado para [DR]');
  const penIntacta: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap.penalizacionId } });
  ok(approx(penIntacta.monto, 50000) && penIntacta.anulada === false, 'penalización [DR] intacta', penIntacta);

  await ds.destroy();
  console.log(`\n[disciplina-e2e] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
