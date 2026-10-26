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
 *  E') Plazo de apelación: no se aprueba antes de que venza salvo renuncia del funcionario.
 *  J') Voto atómico: si fallan los agregados no queda la participación.
 *  P) Tardanza: sin doble descuento si asistencias ya generó una multa automática ese día.
 *  Q) Vista previa (dr-preview-falta): mismo resultado que el registro, sin crear filas; tardanza IGNORADA; permiso.
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
import { registerDisciplinaVotacionHandlers } from '../electron/handlers/disciplina-votacion.handler';
import { registerDisciplinaPremiosHandlers } from '../electron/handlers/disciplina-premios.handler';
import { registerDisciplinaCatalogosHandlers } from '../electron/handlers/disciplina-catalogos.handler';
import { registerDisciplinaPuntosHandlers } from '../electron/handlers/disciplina-puntos.handler';
import { registerDisciplinaReportesHandlers } from '../electron/handlers/disciplina-reportes.handler';
import { withRequestUser } from '../electron/utils/auth.utils';
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
  // DR_E2E_PG=<base> corre la misma suite contra un Postgres local (la base se recrea vacía).
  const pgDb = process.env['DR_E2E_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', database: pgDb, username: process.env['PGUSER'] || 'postgres' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
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
    'RRHH_DR_CONFIGURAR', 'RRHH_DR_REGISTRAR', 'RRHH_DR_PUNTUAR', 'RRHH_DR_APROBAR', 'RRHH_DR_RESULTADOS_VER', 'RRHH_PENALIZACION_REGISTRAR',
    'RRHH_LIQUIDACION_GENERAR', 'RRHH_LIQUIDACION_APROBAR',
  ]);
  const colab: any = await save(Usuario, { nickname: 'COLAB', password: 'x', activo: true });
  await permisos(colab, 'COLABORADOR_DR_TEST', ['RRHH_DR_MIS_DATOS', 'RRHH_DR_VOTAR']);

  const aprobador: any = await save(Usuario, { nickname: 'APROBADOR', password: 'x', activo: true });
  await permisos(aprobador, 'APROBADOR_DR', ['RRHH_DR_APROBAR', 'RRHH_DR_CONFIGURAR', 'RRHH_DR_REGISTRAR']);
  let actual: any = admin;
  const como = async <T>(u: any, fn: () => Promise<T>) => { const prev = actual; actual = u; try { return await fn(); } finally { actual = prev; } };
  // Separación de funciones: resuelve un usuario distinto del que registró.
  const resolver = (canal: string, ...a: any[]) => como(aprobador, () => call(canal, ...a));
  await seedLiquidacionConceptos(ds);
  registerDisciplinaHandlers(ds, () => actual);
  registerDisciplinaVotacionHandlers(ds, () => actual);
  registerDisciplinaPremiosHandlers(ds, () => actual);
  registerDisciplinaCatalogosHandlers(ds, () => actual);
  registerDisciplinaPuntosHandlers(ds, () => actual);
  registerDisciplinaReportesHandlers(ds, () => actual);
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
  const listaF: any[] = await call('dr-get-faltas', {});
  ok(listaF.length > 0 && listaF.every((x) => x.detectadoPor?.nickname && !('password' in x.detectadoPor)),
    'dr-get-faltas trae quién la registró (nickname) sin la contraseña', listaF[0]?.detectadoPor);
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
  // Plazo de apelación (48 h) vigente: no se aprueba hasta que venza o la persona renuncie.
  await rechaza(resolver('dr-aprobar-falta', r2.creadas[0].id, 'ok'), 'PLAZO_APELACION_VIGENTE', 'no aprueba con el plazo de apelación vigente');
  await como(colab, () => rechaza(call('dr-renunciar-apelacion', faltaB.id), 'NO_ENCONTRADO', 'no renuncia por una falta ajena'));
  await como(colab, () => call('dr-renunciar-apelacion', r2.creadas[0].id));
  await como(colab, () => rechaza(call('dr-apelar-falta', r2.creadas[0].id, 'me arrepentí'), 'RENUNCIO_APELACION', 'tras renunciar ya no puede apelar'));
  const ap = await resolver('dr-aprobar-falta', r2.creadas[0].id, 'ok');
  ok(!!ap.penalizacionId && ap.mesDestino === '2026-11', 'crea penalización en mes 2026-11', ap);
  const pen: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap.penalizacionId }, relations: ['funcionario'] });
  ok(pen && pen.descripcion.startsWith('[DR]') && approx(pen.monto, 50000) && pen.funcionario.id === fA.id, 'penalización [DR] 50.000 a ANA', pen?.descripcion);
  await rechaza(resolver('dr-aprobar-falta', r2.creadas[0].id), 'ESTADO_INVALIDO', 'segunda aprobación rechazada');
  await rechaza(call('dr-anular-falta', r2.creadas[0].id, 'X'), 'AUTO_RESOLUCION', 'quien registró la falta no la anula');
  await rechaza(call('dr-aprobar-falta', r1.creadas[0].id), 'AUTO_RESOLUCION', 'quien registró la falta no la aprueba');
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
  await como(colab, () => call('dr-renunciar-apelacion', r3.creadas[0].id));
  const ap3 = await resolver('dr-aprobar-falta', r3.creadas[0].id);
  ok(ap3.mesDestino === '2026-12', 'va a 2026-12', ap3);
  const pen3: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap3.penalizacionId } });
  ok(String(pen3.fecha).slice(0, 7) === '2026-12', 'fecha de la penalización en diciembre', pen3.fecha);
  await rechaza(resolver('dr-anular-falta', r2.creadas[0].id, 'error'), 'LIQUIDACION_CERRADA', 'no anula multa ya liquidada (aprobada)');

  // ===== H) Anular / justificar =====
  console.log('\n[H] Anular y justificar');
  await resolver('dr-anular-falta', r3.creadas[0].id, 'cargada por error');
  const pen3b: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap3.penalizacionId } });
  ok(pen3b.anulada === true, 'anular falta → penalización anulada', pen3b.anulada);
  await resolver('dr-justificar-falta', r1.creadas[0].id, 'apelación aceptada');
  const just: any = await ds.getRepository(DrFalta).findOne({ where: { id: r1.creadas[0].id }, relations: ['penalizacion'] });
  ok(just.estado === 'JUSTIFICADA' && !just.penalizacion, 'justificada sin penalización', just.estado);
  await rechaza(resolver('dr-justificar-falta', r1.creadas[0].id, 'otra vez'), 'ESTADO_INVALIDO', 'no se justifica dos veces');

  // ===== I) Protección en handlers viejos =====
  console.log('\n[I] Handlers viejos no editan [DR]');
  await rechaza(call('update-penalizacion', { id: ap.penalizacionId, monto: 1 }), /DISCIPLINA/, 'update-penalizacion bloqueado para [DR]');
  await rechaza(call('anular-penalizacion', ap.penalizacionId), /DISCIPLINA/, 'anular-penalizacion bloqueado para [DR]');
  const penIntacta: any = await ds.getRepository(Penalizacion).findOne({ where: { id: ap.penalizacionId } });
  ok(approx(penIntacta.monto, 50000) && penIntacta.anulada === false, 'penalización [DR] intacta', penIntacta);


  // ===== J) Votación anónima =====
  console.log('\n[J] Votación anónima');
  const { DrGrupo } = E('rrhh/disciplina/dr-grupo.entity');
  const { DrGrupoMiembro } = E('rrhh/disciplina/dr-grupo-miembro.entity');
  const { DrEncuesta } = E('rrhh/disciplina/dr-encuesta.entity');
  const { DrEncuestaPregunta } = E('rrhh/disciplina/dr-encuesta-pregunta.entity');
  const { DrVotoAgregado } = E('rrhh/disciplina/dr-voto-agregado.entity');
  const { DrParticipacion } = E('rrhh/disciplina/dr-participacion.entity');
  const grupo: any = await save(DrGrupo, { nombre: 'COCINA', activo: true });
  const votantes: any[] = [{ u: colab, f: fA }];
  for (const n of ['DANI', 'EVA', 'FABI']) {
    const u: any = await save(Usuario, { nickname: n, password: 'x', activo: true });
    await permisos(u, `COLAB_${n}`, ['RRHH_DR_VOTAR']);
    votantes.push({ u, f: await mkFunc(n, u) });
  }
  for (const v of votantes) await save(DrGrupoMiembro, { grupo, funcionario: v.f, rol: 'MIEMBRO', pesoVoto: 1, activo: true });
  const enc: any = await save(DrEncuesta, { titulo: 'COMPAÑERISMO', grupo, horasAbierta: 48, activo: true });
  const qEsc: any = await save(DrEncuestaPregunta, { encuesta: enc, texto: 'AYUDA A LOS DEMÁS', tipo: 'ESCALA', escalaMin: 1, escalaMax: 5, obligatoria: true, orden: 1, activo: true });
  const qTxt: any = await save(DrEncuestaPregunta, { encuesta: enc, texto: 'COMENTARIO', tipo: 'TEXTO', escalaMin: 1, obligatoria: false, orden: 2, activo: true });
  const per = await call('dr-abrir-periodo', { encuestaId: enc.id, desde: '2026-11-01', hasta: '2026-11-30' });
  ok(per.estado === 'ABIERTO', 'período abierto', per.estado);

  const pend = await como(colab, () => call('dr-mis-encuestas-pendientes'));
  ok(pend.length === 1 && pend[0].evaluados.length === 3 && !pend[0].evaluados.some((x: any) => x.id === fA.id), 'pendiente con 3 compañeros (sin autovoto)', pend);
  // Cada votante pone a FABI = 5 y al resto = 3
  const fabi = votantes[3].f;
  const envio = (v: any) => votantes.filter((o) => o.f.id !== v.f.id).flatMap((o) => [
    { evaluadoId: o.f.id, preguntaId: qEsc.id, valor: o.f.id === fabi.id ? 5 : 3 },
    { evaluadoId: o.f.id, preguntaId: qTxt.id, valor: o.f.id === fabi.id ? `bien ${v.f.id}` : '' },
  ]);
  // Atomicidad: si falla la escritura de los agregados, tampoco queda la participación (puede volver a votar).
  await ds.query('ALTER TABLE dr_voto_agregado RENAME TO dr_voto_agregado_bk');
  await como(colab, () => rechaza(withRequestUser(colab, () => call('dr-votar', per.id, envio(votantes[0]))) as Promise<any>, /.+/, 'voto falla si no se pueden guardar los agregados'));
  await ds.query('ALTER TABLE dr_voto_agregado_bk RENAME TO dr_voto_agregado');
  ok(await ds.getRepository(DrParticipacion).count() === 0, 'voto fallido no deja participación registrada');
  ok(await ds.getRepository(E('rrhh/disciplina/dr-respuesta-texto.entity').DrRespuestaTexto).count() === 0, 'voto fallido no deja comentarios sueltos');
  for (const v of votantes) await como(v.u, () => withRequestUser(v.u, () => call('dr-votar', per.id, envio(v))) as Promise<any>);
  await como(colab, () => rechaza(call('dr-votar', per.id, envio(votantes[0])), 'YA_VOTO', 'no vota dos veces'));
  await como(colab, () => rechaza(call('dr-votar', per.id, [{ evaluadoId: fA.id, preguntaId: qEsc.id, valor: 5 }]), /.+/, 'rechaza autovoto / envío incompleto'));
  const filasAbiertas: any[] = await ds.getRepository(DrVotoAgregado).find();
  ok(filasAbiertas.length > 0 && filasAbiertas.every((f) => f.datosCifrados && f.sumaPonderada == null), 'con período abierto los agregados están cifrados', filasAbiertas[0]);
  const columnas = async (t: string): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1`, [t])).map((c: any) => c.name)
    : (await ds.query(`PRAGMA table_info('${t}')`)).map((c: any) => c.name);
  const colsVoto = await columnas('dr_voto_agregado');
  const colsTxt = await columnas('dr_respuesta_texto');
  const sinVotante = (cols: string[]) => !cols.some((c) => /votante|usuario|funcionario|created|fecha/.test(c));
  ok(sinVotante(colsVoto) && sinVotante(colsTxt), 'tablas de votos sin votante ni fecha', { colsVoto, colsTxt });
  ok(await ds.getRepository(DrParticipacion).count() === 4, '4 participaciones');
  await rechaza(call('dr-get-resultados-encuesta', per.id), 'PERIODO_ABIERTO', 'sin resultados con período abierto');

  const { DrRespuestaTexto } = E('rrhh/disciplina/dr-respuesta-texto.entity');
  const idsAntes = [...(await ds.getRepository(DrRespuestaTexto).find()), ...(await ds.getRepository(DrParticipacion).find())].map((x: any) => x.id);
  const cierre = await call('dr-cerrar-periodo', per.id);
  const textosDesp: any[] = await ds.getRepository(DrRespuestaTexto).find();
  const partDesp: any[] = await ds.getRepository(DrParticipacion).find();
  ok(textosDesp.length === 3 && partDesp.length === 4 && [...textosDesp, ...partDesp].every((x) => !idsAntes.includes(x.id)),
    'al cerrar, textos y participaciones se reescriben con ids nuevos', { t: textosDesp.length, p: partDesp.length });
  ok(cierre.votantes === 4, 'cierre con 4 votantes', cierre);
  const perCerrados: any[] = await call('dr-get-periodos', { estado: 'CERRADO' });
  ok(perCerrados.some((x) => x.id === per.id), 'dr-get-periodos lista el período cerrado', perCerrados.map((x) => x.id));
  ok((await call('dr-get-periodos', { estado: 'ABIERTO' })).every((x: any) => x.id !== per.id), 'dr-get-periodos filtra por estado');
  await como(colab, () => rechaza(call('dr-get-periodos', {}), 'FORBIDDEN', 'colaborador no lista períodos'));
  const resu = await call('dr-get-resultados-encuesta', per.id);
  ok(resu.filas.length > 0 && resu.filas.every((f: any) => typeof f.evaluado === 'string' && f.evaluado.length > 0), 'resultados de encuesta traen el nombre del evaluado', resu.filas.map((f: any) => f.evaluado));
  const filaFabi = resu.filas.find((f: any) => f.evaluadoId === fabi.id && f.preguntaId === qEsc.id);
  const filaAna = resu.filas.find((f: any) => f.evaluadoId === fA.id && f.preguntaId === qEsc.id);
  ok(resu.suficiente && filaFabi && approx(filaFabi.promedio, 5) && filaFabi.cantidad === 3, 'FABI promedio 5 con 3 votos', filaFabi);
  ok(filaAna && approx(filaAna.promedio, 3), 'ANA promedio 3', filaAna);
  ok(resu.textos.length === 3 && resu.textos.every((t: any) => !('id' in t) && t.evaluadoId === fabi.id), '3 comentarios para FABI, sin id', resu.textos);
  const filasCerradas: any[] = await ds.getRepository(DrVotoAgregado).find();
  ok(filasCerradas.every((f) => f.datosCifrados == null), 'al cerrar se borra el cifrado');
  await como(colab, () => rechaza(call('dr-get-resultados-encuesta', per.id), 'FORBIDDEN', 'colaborador no ve resultados'));


  // ===== K) Premio por votación → Bono [DR] =====
  console.log('\n[K] Premio por votación');
  const { DrPremio } = E('rrhh/disciplina/dr-premio.entity');
  const { DrPeriodo } = E('rrhh/disciplina/dr-periodo.entity');
  const { Bono } = E('rrhh/bono.entity');
  const premio: any = await save(DrPremio, { nombre: 'COMPAÑERO DEL MES', monto: 100000, moneda: pyg, periodo: 'MENSUAL', metodo: 'VOTACION', reglaEmpate: 'DIVIDIR', encuesta: enc, grupo, orden: 1, activo: true });
  await ds.getRepository(DrPeriodo).update({ id: per.id }, { premio: { id: premio.id } });
  const calc = await call('dr-calcular-premio', per.id);
  const gan = calc.ranking.filter((x: any) => x.ganador);
  ok(calc.estado === 'GANADOR' && gan.length === 1 && gan[0].funcionarioId === fabi.id && approx(gan[0].montoPropuesto, 100000), 'gana FABI 100.000', calc);
  // Fase 4: ranking guardado y ajuste manual antes de aprobar.
  const resK = await call('dr-get-resultados-premio', per.id);
  const filaGanK = resK.find((x: any) => x.funcionarioId === fabi.id);
  ok(resK.length === calc.ranking.length && filaGanK?.ganador && filaGanK.estado === 'PROPUESTO', 'get-resultados-premio devuelve el ranking', resK);
  await rechaza(call('dr-ajustar-resultado-premio', { periodoId: per.id, resultadoId: filaGanK.id, montoAprobado: -1 }), 'VALIDACION', 'ajuste con monto negativo rechazado');
  const aj = await call('dr-ajustar-resultado-premio', { periodoId: per.id, resultadoId: filaGanK.id, montoAprobado: 100000 });
  ok(aj.ok === true, 'ajuste de monto aceptado con el premio PROPUESTO', aj);
  await como(colab, () => rechaza(call('dr-ajustar-resultado-premio', { periodoId: per.id, resultadoId: filaGanK.id, montoAprobado: 1 }), 'FORBIDDEN', 'colaborador no ajusta premios'));
  const apP = await call('dr-aprobar-premio', per.id);
  const resK2 = await call('dr-get-resultados-premio', per.id);
  ok(resK2.find((x: any) => x.funcionarioId === fabi.id)?.estado === 'APROBADO' && resK2.find((x: any) => x.funcionarioId === fabi.id)?.bonoId === apP.bonos[0], 'resultado APROBADO con su bono', resK2);
  await rechaza(call('dr-ajustar-resultado-premio', { periodoId: per.id, resultadoId: filaGanK.id, montoAprobado: 1 }), 'ESTADO_INVALIDO', 'no se ajusta un premio aprobado');
  const bono: any = await ds.getRepository(Bono).findOne({ where: { id: apP.bonos[0] }, relations: ['funcionario'] });
  ok(bono && bono.motivo.startsWith('[DR]') && approx(bono.monto, 100000) && bono.funcionario.id === fabi.id, 'Bono [DR] 100.000 a FABI', bono?.motivo);
  await rechaza(call('dr-aprobar-premio', per.id), 'ESTADO_INVALIDO', 'no se aprueba dos veces');
  await rechaza(call('dr-calcular-premio', per.id), 'ESTADO_INVALIDO', 'no se recalcula un premio aprobado');
  ok(await ds.getRepository(Bono).count() === 1, '1 solo bono');


  // ===== L) Catálogos configurables =====
  console.log('\n[L] Catálogos');
  const g2 = await call('dr-save-grupos', { nombre: 'salón', activo: true });
  ok(g2.id > 0 && g2.nombre === 'SALÓN', 'crea grupo en MAYÚSCULAS', g2);
  const mm = await call('dr-save-grupo-miembros', { grupo: g2.id, funcionario: { id: fB.id }, rol: 'MIEMBRO', pesoVoto: 2, activo: true });
  ok(mm.id > 0, 'agrega miembro', mm);
  const lista = await call('dr-get-grupo-miembros', { grupoId: g2.id });
  ok(lista.length === 1 && lista[0].funcionario.id === fB.id && Number(lista[0].pesoVoto) === 2, 'filtra miembros por grupo', lista.length);
  await rechaza(call('dr-save-premios', { nombre: 'X', metodo: 'VOTACION', monto: -5 }), 'VALIDACION', 'premio con monto negativo rechazado');
  await como(colab, () => rechaza(call('dr-save-grupos', { nombre: 'Y' }), 'FORBIDDEN', 'colaborador no configura'));
  const e2 = await call('dr-save-encuestas', { id: enc.id, titulo: 'compañerismo y orden' });
  ok(e2.titulo === 'COMPAÑERISMO Y ORDEN', 'edita encuesta', e2.titulo);

  // ===== M) Errores y SALDO_PUNTOS =====
  console.log('\n[M] Errores y saldo de puntos');
  const { DrGravedad } = E('rrhh/disciplina/dr-gravedad.entity');
  const { DrTipoError } = E('rrhh/disciplina/dr-tipo-error.entity');
  const { DrCriterio } = E('rrhh/disciplina/dr-criterio.entity');
  const { DrError } = E('rrhh/disciplina/dr-error.entity');
  const gM: any = await save(DrGrupo, { nombre: 'COCINA PUNTOS', activo: true });
  for (const f of [fA, fB, fC]) await save(DrGrupoMiembro, { grupo: gM, funcionario: f, rol: 'MIEMBRO', pesoVoto: 1, activo: true });
  const grave: any = await save(DrGravedad, { nombre: 'GRAVE', puntos: 3, orden: 1, activo: true });
  const leve: any = await save(DrGravedad, { nombre: 'LEVE', puntos: 1, orden: 2, activo: true });
  const teGrave: any = await save(DrTipoError, { nombre: 'PLATO FRÍO', gravedad: grave, grupo: gM, orden: 1, activo: true });
  const teLeve: any = await save(DrTipoError, { nombre: 'MESADA SUCIA', gravedad: leve, orden: 2, activo: true });
  const tesCanal: any[] = await call('dr-get-tipos-error', {});
  const teCanal = tesCanal.find((x) => x.id === teGrave.id);
  ok(teCanal?.gravedad?.id === grave.id && teCanal?.grupo?.id === gM.id, 'dr-get-tipos-error trae gravedad y grupo', teCanal);
  const rE1 = await call('dr-registrar-error', { fecha: '2026-07-06', tipoErrorId: teGrave.id, funcionarioIds: [fA.id, fB.id], detalle: 'mesa 4' });
  ok(rE1.length === 2 && rE1.every((x: any) => x.puntos === 3), 'registra error a 2 personas con 3 puntos', rE1);
  await call('dr-registrar-error', { fecha: '2026-07-07', tipoErrorId: teLeve.id, funcionarioIds: [fA.id] });
  const rC = await call('dr-registrar-error', { fecha: '2026-07-07', tipoErrorId: teLeve.id, funcionarioIds: [fC.id] });
  await ds.getRepository(DrGravedad).update({ id: grave.id }, { puntos: 9 });
  const e0: any = await ds.getRepository(DrError).findOne({ where: { id: rE1[0].id } });
  ok(Number(e0.puntos) === 3, 'cambiar la gravedad no altera errores ya registrados');
  await como(colab, () => rechaza(call('dr-registrar-error', { fecha: '2026-07-07', tipoErrorId: teLeve.id, funcionarioIds: [fB.id] }), 'FORBIDDEN', 'colaborador no registra errores'));
  await rechaza(call('dr-anular-error', rC[0].id, ''), 'VALIDACION', 'anular error exige motivo');
  await rechaza(call('dr-anular-error', rC[0].id, 'mío'), 'AUTO_RESOLUCION', 'quien registró el error no lo anula');
  await resolver('dr-anular-error', rC[0].id, 'carga equivocada');
  await rechaza(resolver('dr-anular-error', rC[0].id, 'otra vez'), 'ESTADO_INVALIDO', 'no se anula dos veces');
  await call('dr-registrar-error', { fecha: '2026-08-02', tipoErrorId: teGrave.id, funcionarioIds: [fC.id] }); // fuera del período
  const pSaldo: any = await save(DrPremio, { nombre: 'SALDO COCINA', monto: 100000, moneda: pyg, periodo: 'MENSUAL', metodo: 'SALDO_PUNTOS', reglaEmpate: 'DIVIDIR', puntosIniciales: 10, grupo: gM, orden: 2, activo: true });
  const perS: any = await save(DrPeriodo, { premio: pSaldo, desde: '2026-07-01', hasta: '2026-07-31', estado: 'CERRADO' });
  const cS = await call('dr-calcular-premio', perS.id);
  const ptsS = Object.fromEntries(cS.ranking.map((x: any) => [x.funcionarioId, x.puntaje]));
  ok(ptsS[fA.id] === 6 && ptsS[fB.id] === 7 && ptsS[fC.id] === 10, 'saldo = 10 − errores vigentes del período (ANA 6, BETO 7, CARLA 10)', ptsS);
  ok(cS.estado === 'GANADOR' && cS.ranking.find((x: any) => x.ganador).funcionarioId === fC.id, 'gana CARLA (error anulado y fuera de período no cuentan)', cS.estado);
  const mis = await como(colab, () => call('dr-mis-puntos', { desde: '2026-07-01', hasta: '2026-07-31' }));
  ok(mis.errores.length === 2 && mis.saldos.some((s: any) => s.premioId === pSaldo.id && s.saldo === 6), 'mis puntos: solo los de ANA, saldo 6', mis.saldos);
  await como(colab, () => rechaza(call('dr-get-errores', {}), 'FORBIDDEN', 'colaborador no ve errores de otros'));

  // ===== N) Puntaje por CRITERIOS =====
  console.log('\n[N] Criterios');
  const pCrit: any = await save(DrPremio, { nombre: 'COCINERO DE LA SEMANA', monto: 100000, moneda: pyg, periodo: 'SEMANAL', metodo: 'CRITERIOS', reglaEmpate: 'DIVIDIR', grupo: gM, orden: 3, activo: true });
  const c1: any = await save(DrCriterio, { premio: pCrit, texto: 'LIMPIEZA', escalaMin: 0, escalaMax: 2, orden: 1, activo: true });
  const c2: any = await save(DrCriterio, { premio: pCrit, texto: 'PUNTUALIDAD', escalaMin: 0, escalaMax: 2, orden: 2, activo: true });
  // Catálogo de criterios por canal (antes exigía `nombre`, que DrCriterio no tiene).
  const cCanal: any = await call('dr-save-criterios', { premio: { id: pCrit.id }, texto: 'orden de mesada', escalaMin: 0, escalaMax: 2, orden: 9, activo: false });
  ok(!!cCanal?.id, 'dr-save-criterios guarda un criterio por canal');
  const listaCrit: any[] = await call('dr-get-criterios', { incluirInactivos: true });
  ok(listaCrit.some((c: any) => c.id === cCanal.id && c.texto === 'ORDEN DE MESADA'), 'dr-get-criterios lista el criterio en MAYÚSCULAS');
  await call('dr-puntuar', { fecha: '2026-07-06', puntajes: [
    { funcionarioId: fA.id, criterioId: c1.id, valor: 2 }, { funcionarioId: fA.id, criterioId: c2.id, valor: 1 },
    { funcionarioId: fB.id, criterioId: c1.id, valor: 2 }, { funcionarioId: fB.id, criterioId: c2.id, valor: 0 },
  ] });
  await call('dr-puntuar', { fecha: '2026-07-06', puntajes: [{ funcionarioId: fB.id, criterioId: c2.id, valor: 1 }] }); // reemplaza, no duplica
  await call('dr-puntuar', { fecha: '2026-07-07', puntajes: [{ funcionarioId: fC.id, criterioId: c1.id, valor: 2 }] });
  await rechaza(call('dr-puntuar', { fecha: '2026-07-07', puntajes: [{ funcionarioId: fC.id, criterioId: c1.id, valor: 3 }] }), 'VALIDACION', 'valor fuera de escala rechazado');
  await como(colab, () => rechaza(call('dr-puntuar', { fecha: '2026-07-07', puntajes: [{ funcionarioId: fA.id, criterioId: c1.id, valor: 2 }] }), 'FORBIDDEN', 'colaborador no puntúa'));
  const perC: any = await save(DrPeriodo, { premio: pCrit, desde: '2026-07-06', hasta: '2026-07-12', estado: 'CERRADO' });
  const cC = await call('dr-calcular-premio', perC.id);
  const gan2 = cC.ranking.filter((x: any) => x.ganador);
  ok(cC.estado === 'EMPATE' && gan2.length === 2 && gan2.every((g: any) => g.puntaje === 3 && approx(g.montoPropuesto, 50000)), 'ANA y BETO empatan con 3 y dividen 50.000 c/u', cC.ranking);
  const apC = await call('dr-aprobar-premio', perC.id);
  ok(apC.bonos.length === 2, 'aprobar empate crea 2 bonos [DR]', apC);
  const misP = await como(colab, () => call('dr-mis-premios'));
  ok(misP.length === 1 && misP[0].periodo.id === perC.id, 'mis premios: ANA ve solo el suyo', misP.length);

  // ===== O) Tope mensual y borrador desactualizado =====
  console.log('\n[O] Tope mensual y borrador desactualizado');
  const { ConfiguracionRrhh } = E('rrhh/configuracion-rrhh.entity');
  const { DrLiquidacionPendiente } = E('rrhh/disciplina/dr-liquidacion-pendiente.entity');
  const cfgRepo = ds.getRepository(ConfiguracionRrhh);
  const cfgTope: any = await cfgRepo.findOne({ where: { clave: 'DR_TOPE_DESCUENTO_MENSUAL' } });
  if (cfgTope) await cfgRepo.update({ id: cfgTope.id }, { valor: '30000' });
  else await save(ConfiguracionRrhh, { clave: 'DR_TOPE_DESCUENTO_MENSUAL', valor: '30000', tipo: 'NUMBER', descripcion: 'TEST' });
  await call('dr-registrar-falta', { tipoFaltaId: tipo.id, fecha: '2027-02-03', funcionarioIds: [fB.id] });
  const rT = await call('dr-registrar-falta', { tipoFaltaId: tipo.id, fecha: '2027-02-10', funcionarioIds: [fB.id] });
  const liqB = await call('generar-liquidacion-borrador', { funcionarioId: fB.id, periodo: '2027-02', monedaPagoId: pyg.id });
  await rechaza(resolver('dr-aprobar-falta', rT.creadas[0].id), 'PLAZO_APELACION_VIGENTE', 'BETO: plazo vigente, no se aprueba');
  await ds.getRepository(DrFalta).update({ id: rT.creadas[0].id }, { apelacionVence: new Date(Date.now() - 60_000) } as any); // venció el plazo
  const apT = await resolver('dr-aprobar-falta', rT.creadas[0].id);
  ok(apT.cuotas.length === 2 && apT.cuotas[0].mes === '2027-02' && approx(apT.cuotas[0].monto, 30000) && apT.cuotas[1].mes === '2027-03' && approx(apT.cuotas[1].monto, 20000),
    'multa 50.000 con tope 30.000 → 30.000 feb + 20.000 mar', apT.cuotas);
  const pendO = await ds.getRepository(DrLiquidacionPendiente).count({ where: { mes: '2027-02', estado: 'PENDIENTE' } });
  ok(pendO === 1, 'el borrador de febrero queda desactualizado', pendO);
  await rechaza(call('aprobar-liquidacion-sueldo', liqB.id), /DESACTUALIZADA/, 'no se aprueba un borrador desactualizado');
  const liqB2 = await call('generar-liquidacion-borrador', { funcionarioId: fB.id, periodo: '2027-02', monedaPagoId: pyg.id });
  const detB = await call('get-liquidacion-sueldo', liqB2.id);
  ok(approx(detB.totalDescuentos, 30000), 'borrador regenerado descuenta solo la cuota de 30.000', detB.totalDescuentos);
  ok(await ds.getRepository(DrLiquidacionPendiente).count({ where: { estado: 'PENDIENTE' } }) === 0, 'regenerar resuelve el pendiente');
  await call('aprobar-liquidacion-sueldo', liqB2.id);
  await rechaza(resolver('dr-anular-falta', rT.creadas[0].id, 'error'), 'LIQUIDACION_CERRADA', 'no se anula si una cuota está en liquidación aprobada');
  await cfgRepo.update({ clave: 'DR_TOPE_DESCUENTO_MENSUAL' }, { valor: '0' });

  // ===== P) Doble descuento por tardanza =====
  console.log('\n[P] Tardanza: sin doble descuento con la multa automática de asistencias');
  const tTard = await call('dr-save-tipo-falta', {
    nombre: 'llegada tarde', advertenciasPrevias: 0, montoMulta: 10000, moneda: { id: pyg.id },
    reinicio: 'MENSUAL', plazoApelacionHoras: 0, toleranciaMinutos: 5, fuenteAsistencia: true, activo: true,
  });
  // Asistencias ya descontó la tardanza de CARLA el 04/05 (penalización automática, aunque sea ₲0).
  await save(Penalizacion, { funcionario: fC, tipo: 'TARDANZA', descripcion: 'TARDANZA AUTOMATICA', monto: 0, fecha: '2027-05-04', anulada: false, autoGenerada: true, registradoPor: admin });
  // Una penalización [DR] ese mismo día de BETO no cuenta como «automática de asistencias».
  await save(Penalizacion, { funcionario: fB, tipo: 'OTRO', descripcion: '[DR] OTRA FALTA (FALTA 999)', monto: 1000, fecha: '2027-05-04', anulada: false, autoGenerada: true, registradoPor: admin });
  const rP = await call('dr-registrar-falta', { tipoFaltaId: tTard.id, fecha: '2027-05-04', funcionarioIds: [fC.id, fB.id], minutosTardanza: 20 });
  ok(rP.creadas.length === 1 && rP.creadas[0].funcionario.id === fB.id, 'CARLA ignorada (ya tiene multa automática ese día), BETO sí', rP);
  ok(rP.ignoradas.length === 1 && rP.ignoradas[0].funcionarioId === fC.id, 'la respuesta informa a CARLA como ignorada', rP.ignoradas);
  const rP2 = await call('dr-registrar-falta', { tipoFaltaId: tTard.id, fecha: '2027-05-05', funcionarioIds: [fC.id], minutosTardanza: 20 });
  ok(rP2.creadas.length === 1 && rP2.creadas[0].resultado === 'MULTA' && approx(rP2.creadas[0].montoCalculado, 10000), 'otro día sin multa automática: CARLA sí recibe la multa DR', rP2.creadas[0]);
  const apTard = await resolver('dr-aprobar-falta', rP2.creadas[0].id); // plazo 0 h: ya vencido
  ok(!!apTard.penalizacionId, 'con plazo de apelación 0 h se aprueba enseguida', apTard);
  const penC: any[] = await ds.getRepository(Penalizacion).find({ where: { funcionario: { id: fC.id }, anulada: false } });
  const porDia = (d: string) => penC.filter((p) => String(p.fecha).slice(0, 10) === d).length;
  ok(porDia('2027-05-04') === 1 && porDia('2027-05-05') === 1, 'CARLA: una sola penalización por día', penC.map((p) => [p.fecha, p.descripcion]));

  // ===== Q) Vista previa de la falta (sin guardar) =====
  console.log('\n[Q] Vista previa: mismo cálculo que el registro, sin crear filas');
  const tQ = await call('dr-save-tipo-falta', {
    nombre: 'uniforme incompleto', advertenciasPrevias: 1, montoMulta: 30000, moneda: { id: pyg.id },
    reinicio: 'MENSUAL', plazoApelacionHoras: 48, activo: true,
  });
  const fD: any = await mkFunc('DANI');
  const nFaltasQ0 = await ds.getRepository(DrFalta).count();
  const pv1 = await call('dr-preview-falta', { tipoFaltaId: tQ.id, fecha: '2027-06-02', funcionarioIds: [fD.id] });
  ok(pv1.items.length === 1 && pv1.items[0].funcionarioId === fD.id && pv1.items[0].resultado === 'ADVERTENCIA' && pv1.items[0].nOcurrencia === 1 && approx(pv1.items[0].monto, 0),
    'preview 1.ª ocurrencia = ADVERTENCIA', pv1);
  ok(pv1.simbolo === 'Gs', 'preview trae el símbolo de la moneda', pv1.simbolo);
  ok(await ds.getRepository(DrFalta).count() === nFaltasQ0, 'preview no crea faltas');
  const rQ1 = await call('dr-registrar-falta', { tipoFaltaId: tQ.id, fecha: '2027-06-02', funcionarioIds: [fD.id] });
  ok(rQ1.creadas[0].resultado === pv1.items[0].resultado && rQ1.creadas[0].nOcurrencia === pv1.items[0].nOcurrencia && approx(rQ1.creadas[0].montoCalculado ?? 0, pv1.items[0].monto),
    'registro ADVERTENCIA = lo que mostró la preview', { pv: pv1.items[0], reg: rQ1.creadas[0] });
  const pv2 = await call('dr-preview-falta', { tipoFaltaId: tQ.id, fecha: '2027-06-03', funcionarioIds: [fD.id] });
  ok(pv2.items[0].resultado === 'MULTA' && pv2.items[0].nOcurrencia === 2 && approx(pv2.items[0].monto, 30000), 'preview 2.ª ocurrencia = MULTA 30.000', pv2.items[0]);
  const nFaltasQ1 = await ds.getRepository(DrFalta).count();
  ok(nFaltasQ1 === nFaltasQ0 + 1, 'preview de la multa tampoco crea faltas', [nFaltasQ0, nFaltasQ1]);
  const rQ2 = await call('dr-registrar-falta', { tipoFaltaId: tQ.id, fecha: '2027-06-03', funcionarioIds: [fD.id] });
  ok(rQ2.creadas[0].resultado === pv2.items[0].resultado && rQ2.creadas[0].nOcurrencia === pv2.items[0].nOcurrencia && approx(rQ2.creadas[0].montoCalculado, pv2.items[0].monto),
    'registro MULTA = lo que mostró la preview', { pv: pv2.items[0], reg: rQ2.creadas[0] });
  // Tardanza: CARLA ya tiene la penalización automática de asistencias el 04/05 (ver P); la [DR] de BETO no cuenta.
  const nFaltasQ2 = await ds.getRepository(DrFalta).count();
  const pvT = await call('dr-preview-falta', { tipoFaltaId: tTard.id, fecha: '2027-05-04', funcionarioIds: [fC.id, fB.id], minutosTardanza: 20 });
  const pvC = pvT.items.find((i: any) => i.funcionarioId === fC.id);
  const pvB = pvT.items.find((i: any) => i.funcionarioId === fB.id);
  ok(pvC?.resultado === 'IGNORADA' && approx(pvC.monto, 0) && pvC.nOcurrencia === null && !!pvC.motivo, 'preview tardanza: CARLA IGNORADA (multa automática ese día)', pvC);
  ok(pvB?.resultado === 'MULTA' && approx(pvB.monto, 10000), 'preview tardanza: BETO MULTA (la [DR] no cuenta como automática)', pvB);
  ok(await ds.getRepository(DrFalta).count() === nFaltasQ2, 'preview de tardanza no crea faltas');
  const pvSinMin = await call('dr-preview-falta', { tipoFaltaId: tTard.id, fecha: '2027-05-06', funcionarioIds: [fB.id] });
  ok(pvSinMin?.faltanMinutos === true && pvSinMin.items.length === 0, 'preview tardanza sin minutos: faltanMinutos, sin ítems', pvSinMin);
  await rechaza(call('dr-registrar-falta', { tipoFaltaId: tTard.id, fecha: '2027-05-06', funcionarioIds: [fB.id] }), 'VALIDACION', 'tardanza sin minutos no se registra');
  await rechaza(call('dr-preview-falta', { fecha: '2027-05-06', funcionarioIds: [fB.id] }), 'VALIDACION', 'preview sin tipo de falta');
  await como(colab, () => rechaza(call('dr-preview-falta', { tipoFaltaId: tQ.id, fecha: '2027-06-04', funcionarioIds: [fD.id] }), 'FORBIDDEN', 'colaborador sin RRHH_DR_REGISTRAR no usa la preview'));

  // ===== R) Fase 4: tablero y reporte por persona (cuadran con Penalizacion/Bono [DR]) =====
  console.log('\n[R] Tablero y reporte');
  const RD = '2026-07-01', RH = '2027-06-30';
  const tab = await call('dr-tablero', { desde: RD, hasta: RH });
  const faltasAprob: any[] = await ds.getRepository(DrFalta).createQueryBuilder('f')
    .leftJoinAndSelect('f.penalizacion', 'p').leftJoinAndSelect('f.funcionario', 'fu')
    .where('f.estado = :e', { e: 'APROBADA' }).andWhere('f.fecha BETWEEN :d AND :h', { d: RD, h: RH }).getMany();
  const espMultas = faltasAprob.filter((f) => f.penalizacion && !f.penalizacion.anulada).reduce((a, f) => a + Number(f.penalizacion.monto), 0);
  ok(approx(tab.totales.montoMultas, espMultas) && espMultas > 0, 'tablero: multas = Σ Penalizacion [DR] de faltas aprobadas', [tab.totales.montoMultas, espMultas]);
  const bonosDr: any[] = (await ds.getRepository(Bono).find()).filter((b: any) => String(b.motivo).startsWith('[DR]') && !b.anulado);
  const espPremios = bonosDr.reduce((a, b) => a + Number(b.monto), 0);
  ok(approx(tab.totales.montoPremios, espPremios) && espPremios > 0, 'tablero: premios = Σ Bono [DR]', [tab.totales.montoPremios, espPremios]);
  ok(approx(tab.totales.neto, espPremios - espMultas), 'tablero: neto = premios − multas', tab.totales);
  ok(tab.filas.every((r: any) => !('votos' in r) && !('respuestas' in r)), 'tablero no expone votos');
  const filaTabFabi = tab.filas.find((r: any) => r.funcionarioId === fabi.id);
  ok(filaTabFabi && filaTabFabi.premiosGanados >= 1, 'tablero: FABI con su premio ganado', filaTabFabi);
  const repF = await call('dr-reporte-persona', { funcionarioId: fabi.id, desde: RD, hasta: RH });
  ok(approx(repF.neto, filaTabFabi.neto) && repF.netoPorMes.every((m: any) => /^\d{4}-\d{2}$|SIN MES/.test(m.mes)), 'reporte FABI: neto igual al del tablero, por mes destino', { rep: repF.netoPorMes, tab: filaTabFabi.neto });
  for (const r of tab.filas.slice(0, 5)) {
    const rp = await call('dr-reporte-persona', { funcionarioId: r.funcionarioId, desde: RD, hasta: RH });
    ok(approx(rp.neto, r.neto), `reporte ${r.funcionario}: neto cuadra con el tablero`, [rp.neto, r.neto]);
  }
  await rechaza(call('dr-tablero', { desde: '2026-01-01', hasta: '2027-06-30' }), 'VALIDACION', 'tablero: rango > 366 días rechazado');
  await rechaza(call('dr-tablero', { desde: '2027-02-01', hasta: '2027-01-01' }), 'VALIDACION', 'tablero: desde > hasta rechazado');
  await rechaza(call('dr-reporte-persona', { funcionarioId: 999999, desde: RD, hasta: RH }), 'NO_ENCONTRADO', 'reporte de funcionario inexistente');
  await como(colab, () => rechaza(call('dr-tablero', { desde: RD, hasta: RH }), 'FORBIDDEN', 'colaborador no ve el tablero'));
  await como(colab, () => rechaza(call('dr-reporte-persona', { funcionarioId: fabi.id, desde: RD, hasta: RH }), 'FORBIDDEN', 'colaborador no ve reportes de otros'));
  const tabG = await call('dr-tablero', { desde: RD, hasta: RH, grupoId: grupo.id });
  ok(tabG.filas.length <= tab.filas.length, 'tablero filtra por grupo', [tabG.filas.length, tab.filas.length]);

  await ds.destroy();
  console.log(`\n[disciplina-e2e] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
