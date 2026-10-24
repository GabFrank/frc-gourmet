/**
 * Disciplina y Reconocimiento (DR) — handlers RPC (fase 1, bloque faltas).
 * Ver docs/planes/PLAN-multas-premios-encuestas.md (§12 prevalece).
 *
 * Ciclo de una falta: REGISTRADA → (APELADA) → APROBADA | JUSTIFICADA | ANULADA.
 * Al aprobar una falta con resultado MULTA se materializa una Penalizacion
 * «[DR] …» (la liquidación la toma sin cambios). El vínculo es único
 * (dr_falta.penalizacion_id) y la aprobación es un UPDATE condicional sobre el
 * estado, así dos aprobaciones simultáneas no generan dos penalizaciones.
 *
 * Identidad: «mis faltas» y «apelar» usan el usuario de la sesión
 * (Funcionario.usuario), nunca un id que mande el cliente.
 */
import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, Like } from 'typeorm';
import { ConfiguracionRrhh } from '../../src/app/database/entities/rrhh/configuracion-rrhh.entity';
import { DrLiquidacionPendiente } from '../../src/app/database/entities/rrhh/disciplina/dr-liquidacion-pendiente.entity';
import { DrLiquidacionPendienteEstado } from '../../src/app/database/entities/rrhh/disciplina/dr-liquidacion-pendiente-estado.enum';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Penalizacion } from '../../src/app/database/entities/rrhh/penalizacion.entity';
import { PenalizacionTipo } from '../../src/app/database/entities/rrhh/penalizacion-tipo.enum';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { DrTipoFalta } from '../../src/app/database/entities/rrhh/disciplina/dr-tipo-falta.entity';
import { DrFalta } from '../../src/app/database/entities/rrhh/disciplina/dr-falta.entity';
import { DrFaltaEstado, DrFaltaResultado } from '../../src/app/database/entities/rrhh/disciplina/dr-falta.enum';
import { ensurePermission, getEffectiveUser } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { PREFIJO_DR } from '../utils/disciplina-proteccion';
import {
  calcularMulta,
  mesDestino,
  validarMoneda,
  aplicarTope,
  mesSiguiente,
  DisciplinaError,
  EstadosLiquidacionPorMes,
  FaltaPrevia,
  debeIgnorarTardanza,
} from '../services/disciplina';

const P = {
  CONFIGURAR: 'RRHH_DR_CONFIGURAR',
  REGISTRAR: 'RRHH_DR_REGISTRAR',
  APROBAR: 'RRHH_DR_APROBAR',
  MIS_DATOS: 'RRHH_DR_MIS_DATOS',
};

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}

function aError(e: unknown): never {
  if (e instanceof DisciplinaError) fail((e as any).codigo ?? 'DR_ERROR', e.message);
  throw e;
}

const up = (s: unknown): any => (typeof s === 'string' ? s.trim().toUpperCase() : s ?? null);

function fechaIso(f: unknown): string {
  if (f instanceof Date) return f.toISOString().slice(0, 10);
  const s = String(f ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('VALIDACION', 'FECHA INVÁLIDA (YYYY-MM-DD)');
  return s;
}

function parseEscala(txt: unknown): Record<string, number> | null {
  if (!txt) return null;
  if (typeof txt === 'object') return txt as any;
  try {
    const o = JSON.parse(String(txt));
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/** Funcionario del usuario de la sesión (identidad real, no del cliente). */
async function funcionarioDeSesion(ds: DataSource, user: Usuario): Promise<Funcionario> {
  const f = await ds.getRepository(Funcionario).findOne({
    where: { usuario: { id: user.id } } as any,
    relations: ['monedaSalario'],
  });
  if (!f) fail('SIN_FUNCIONARIO', 'TU USUARIO NO ESTÁ VINCULADO A UN FUNCIONARIO');
  return f;
}

/** Tope mensual DR (DR_TOPE_DESCUENTO_MENSUAL); 0 o vacío = sin tope. */
async function topeMensual(m: EntityManager): Promise<number | null> {
  const c = await m.getRepository(ConfiguracionRrhh).findOne({ where: { clave: 'DR_TOPE_DESCUENTO_MENSUAL' } as any });
  const v = Number(c?.valor);
  return v > 0 ? v : null;
}

/** Suma de Penalizacion [DR] vigentes del funcionario en el mes (YYYY-MM). */
async function drDescontadoEnMes(m: EntityManager, funcionarioId: number, mes: string): Promise<number> {
  const pens = await m.getRepository(Penalizacion).find({
    where: { funcionario: { id: funcionarioId }, anulada: false, descripcion: Like(`${PREFIJO_DR}%`) } as any,
  });
  return pens.filter((p: any) => fechaIso(p.fecha).slice(0, 7) === mes).reduce((s, p: any) => s + (Number(p.monto) || 0), 0);
}

/** Separación de funciones: quien registró la falta no la aprueba, justifica ni anula. */
function noAutoResolver(falta: any, user: { id: number }): void {
  if (falta?.detectadoPor?.id && falta.detectadoPor.id === user.id) {
    fail('AUTO_RESOLUCION', 'NO PODÉS RESOLVER UNA FALTA QUE REGISTRASTE VOS: LA RESUELVE OTRO APROBADOR');
  }
}

/** Si hay un borrador de liquidación de ese funcionario y mes, queda desactualizado hasta regenerarlo. */
export async function marcarBorradorDesactualizado(m: EntityManager, funcionarioId: number, mes: string | null, motivo: string): Promise<void> {
  if (!mes) return;
  const liq = await m.getRepository(LiquidacionSueldo).findOne({ where: { funcionario: { id: funcionarioId }, periodo: mes } as any });
  if (!liq || (liq.estado as string) !== 'BORRADOR') return;
  const ya = await m.getRepository(DrLiquidacionPendiente).count({
    where: { funcionario: { id: funcionarioId }, mes, estado: DrLiquidacionPendienteEstado.PENDIENTE } as any,
  });
  if (ya) return;
  await m.getRepository(DrLiquidacionPendiente).save(m.getRepository(DrLiquidacionPendiente).create({
    funcionario: { id: funcionarioId }, mes, liquidacion: { id: liq.id }, motivo: up(motivo), estado: DrLiquidacionPendienteEstado.PENDIENTE,
  } as any));
}

/** Calcula n.º de ocurrencia, resultado y monto de una falta nueva con el motor. */
async function calcularFalta(
  m: EntityManager,
  tipo: DrTipoFalta,
  funcionarioId: number,
  fecha: string,
  minutosTardanza?: number | null,
) {
  const previas = await m.getRepository(DrFalta).find({
    where: { funcionario: { id: funcionarioId }, tipoFalta: { id: tipo.id } } as any,
  });
  const prev: FaltaPrevia[] = previas.map((p) => ({ fecha: fechaIso(p.fecha), estado: p.estado as any }));
  try {
    return calcularMulta(
      {
        advertenciasPrevias: Number(tipo.advertenciasPrevias) || 0,
        montoMulta: Number(tipo.montoMulta) || 0,
        escalaMontos: parseEscala((tipo as any).escalaMontos),
        reinicio: tipo.reinicio as any,
        toleranciaMinutos: (tipo as any).toleranciaMinutos ?? null,
      },
      prev,
      fecha,
      { minutosTardanza: minutosTardanza ?? undefined },
    );
  } catch (e) {
    return aError(e);
  }
}

async function estadosLiquidacion(m: EntityManager, funcionarioId: number): Promise<EstadosLiquidacionPorMes> {
  const liqs = await m.getRepository(LiquidacionSueldo).find({ where: { funcionario: { id: funcionarioId } } as any });
  const out: EstadosLiquidacionPorMes = {};
  for (const l of liqs) {
    if ((l.estado as string) === 'ANULADA') continue;
    out[l.periodo] = l.estado as any;
  }
  return out;
}

export function registerDisciplinaHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  const usuarioId = () => getEffectiveUser(getCurrentUser)?.id;

  // ───────────── Catálogo: tipos de falta ─────────────
  ipcMain.handle('dr-get-tipos-falta', async (_e, filtros: { incluirInactivos?: boolean } = {}) => {
    await ensurePermission(dataSource, getCurrentUser, [P.CONFIGURAR, P.REGISTRAR, P.APROBAR]);
    return dataSource.getRepository(DrTipoFalta).find({
      where: filtros?.incluirInactivos ? {} : ({ activo: true } as any),
      relations: ['grupo', 'moneda'],
      order: { orden: 'ASC', nombre: 'ASC' } as any,
    });
  });

  ipcMain.handle('dr-save-tipo-falta', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    const repo = dataSource.getRepository(DrTipoFalta);
    const ent = data?.id ? await repo.findOneBy({ id: data.id } as any) : repo.create();
    if (!ent) fail('NO_ENCONTRADO', 'TIPO DE FALTA NO ENCONTRADO');
    if (!data?.nombre || !String(data.nombre).trim()) fail('VALIDACION', 'EL NOMBRE ES OBLIGATORIO');
    if (Number(data.montoMulta ?? 0) < 0) fail('VALIDACION', 'EL MONTO NO PUEDE SER NEGATIVO');
    if (Number(data.advertenciasPrevias ?? 0) < 0) fail('VALIDACION', 'LAS ADVERTENCIAS NO PUEDEN SER NEGATIVAS');
    const { id, createdAt, updatedAt, createdBy, updatedBy, ...campos } = data;
    if (campos.escalaMontos && typeof campos.escalaMontos === 'object') campos.escalaMontos = JSON.stringify(campos.escalaMontos);
    Object.assign(ent, campos, { nombre: up(campos.nombre), descripcion: up(campos.descripcion) });
    await setEntityUserTracking(dataSource, ent, usuarioId(), !!data?.id);
    return repo.save(ent);
  });

  ipcMain.handle('dr-set-tipo-falta-activo', async (_e, id: number, activo: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    await dataSource.getRepository(DrTipoFalta).update({ id } as any, { activo: !!activo } as any);
    return { ok: true };
  });

  // ───────────── Registro de faltas ─────────────
  /**
   * data: { tipoFaltaId, fecha, funcionarioIds: number[], observacion?, minutosTardanza?, checklistFallado? }
   * Varios funcionarios = mismo lote (TODOS_PRESENTES o selección múltiple).
   */
  ipcMain.handle('dr-registrar-falta', async (_e, data: any) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.REGISTRAR);
    const fecha = fechaIso(data?.fecha);
    const ids: number[] = Array.from(
      new Set<number>((data?.funcionarioIds ?? []).map((x: any) => Number(x)).filter((x: number) => x > 0)),
    );
    if (!ids.length) fail('VALIDACION', 'ELEGÍ AL MENOS UN FUNCIONARIO');

    return dataSource.transaction(async (m) => {
      const tipo = await m.getRepository(DrTipoFalta).findOne({ where: { id: data.tipoFaltaId } as any, relations: ['moneda'] });
      if (!tipo || !(tipo as any).activo) fail('NO_ENCONTRADO', 'TIPO DE FALTA INEXISTENTE O INACTIVO');
      const funcs = await m.getRepository(Funcionario).findBy({ id: In(ids) } as any);
      if (funcs.length !== ids.length) fail('NO_ENCONTRADO', 'HAY FUNCIONARIOS INEXISTENTES');
      const loteId = ids.length > 1 ? randomUUID() : null;
      const creadas: DrFalta[] = [];
      const esTardanza = !!(tipo as any).fuenteAsistencia || (data.minutosTardanza !== undefined && data.minutosTardanza !== null);
      const ignoradas: { funcionarioId: number; motivo: string }[] = [];
      for (const fid of ids) {
        // §12: no descontar dos veces la misma tardanza. Si asistencias ya generó una Penalizacion
        // automática (no DR) ese día, la tardanza DR de ese día se ignora (aunque sea de ₲0).
        if (esTardanza) {
          const autos = await m.getRepository(Penalizacion).find({
            where: { funcionario: { id: fid }, autoGenerada: true, anulada: false } as any,
          });
          const fechasAuto = autos
            .filter((p: any) => !String(p.descripcion ?? '').startsWith(PREFIJO_DR))
            .map((p: any) => fechaIso(p.fecha));
          if (debeIgnorarTardanza(fecha, fechasAuto)) {
            ignoradas.push({ funcionarioId: fid, motivo: 'YA TIENE PENALIZACIÓN AUTOMÁTICA DE ASISTENCIA ESE DÍA' });
            continue;
          }
        }
        const r = await calcularFalta(m, tipo, fid, fecha, data.minutosTardanza);
        if (r.resultado === 'NINGUNO') continue; // tardanza dentro de tolerancia: no cuenta como falta
        const falta = m.getRepository(DrFalta).create({
          fecha: fecha as any,
          funcionario: { id: fid } as any,
          tipoFalta: { id: tipo.id } as any,
          detectadoPor: { id: user.id } as any,
          observacion: up(data.observacion),
          minutosTardanza: data.minutosTardanza ?? null,
          nOcurrencia: r.nOcurrencia,
          resultado: r.resultado as DrFaltaResultado,
          montoCalculado: r.monto,
          moneda: (tipo as any).moneda ? ({ id: (tipo as any).moneda.id } as any) : null,
          estado: DrFaltaEstado.REGISTRADA,
          apelacionVence: new Date(Date.now() + (Number((tipo as any).plazoApelacionHoras) || 0) * 3600_000),
          loteId,
          checklistFallado: data.checklistFallado ? JSON.stringify(data.checklistFallado) : null,
        } as any) as unknown as DrFalta;
        await setEntityUserTracking(dataSource, falta, user.id, false);
        creadas.push(await m.getRepository(DrFalta).save(falta));
      }
      return { creadas, loteId, ignoradas };
    });
  });

  ipcMain.handle('dr-get-faltas', async (_e, f: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, [P.REGISTRAR, P.APROBAR]);
    const qb = dataSource.getRepository(DrFalta).createQueryBuilder('f')
      .leftJoinAndSelect('f.funcionario', 'fu')
      .leftJoinAndSelect('fu.persona', 'pe')
      .leftJoinAndSelect('f.tipoFalta', 't')
      .leftJoinAndSelect('f.moneda', 'mo')
      .orderBy('f.fecha', 'DESC').addOrderBy('f.id', 'DESC');
    if (f?.funcionarioId) qb.andWhere('fu.id = :fid', { fid: f.funcionarioId });
    if (f?.estado) qb.andWhere('f.estado = :e', { e: f.estado });
    if (f?.desde) qb.andWhere('f.fecha >= :d', { d: fechaIso(f.desde) });
    if (f?.hasta) qb.andWhere('f.fecha <= :h', { h: fechaIso(f.hasta) });
    qb.take(Math.min(Number(f?.limite) || 200, 1000));
    return qb.getMany();
  });

  // ───────────── Mis datos y apelación (identidad de sesión) ─────────────
  ipcMain.handle('dr-mis-faltas', async () => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.MIS_DATOS);
    const func = await funcionarioDeSesion(dataSource, user);
    return dataSource.getRepository(DrFalta).find({
      where: { funcionario: { id: func.id } } as any,
      relations: ['tipoFalta', 'moneda'],
      order: { fecha: 'DESC' } as any,
    });
  });

  ipcMain.handle('dr-apelar-falta', async (_e, faltaId: number, texto: string) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.MIS_DATOS);
    const func = await funcionarioDeSesion(dataSource, user);
    if (!texto || !String(texto).trim()) fail('VALIDACION', 'ESCRIBÍ EL MOTIVO DE LA APELACIÓN');
    const falta = await dataSource.getRepository(DrFalta).findOne({ where: { id: faltaId } as any, relations: ['funcionario'] });
    if (!falta || falta.funcionario.id !== func.id) fail('NO_ENCONTRADO', 'FALTA NO ENCONTRADA');
    const vence = (falta as any).apelacionVence;
    if (vence && new Date(vence).getTime() < Date.now()) fail('PLAZO_VENCIDO', 'VENCIÓ EL PLAZO PARA APELAR');
    if ((falta as any).renunciaApelacion) fail('RENUNCIO_APELACION', 'YA RENUNCIASTE A APELAR ESTA FALTA');
    const res = await dataSource.getRepository(DrFalta).update(
      { id: faltaId, estado: DrFaltaEstado.REGISTRADA, renunciaApelacion: false } as any,
      { estado: DrFaltaEstado.APELADA, apelacionTexto: up(texto), apelacionFecha: new Date() } as any,
    );
    if (!res.affected) fail('ESTADO_INVALIDO', 'LA FALTA YA NO SE PUEDE APELAR');
    return { ok: true };
  });

  /** El funcionario renuncia a apelar (acepta la falta): desde ahí se puede aprobar sin esperar el plazo. */
  ipcMain.handle('dr-renunciar-apelacion', async (_e, faltaId: number) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.MIS_DATOS);
    const func = await funcionarioDeSesion(dataSource, user);
    const falta = await dataSource.getRepository(DrFalta).findOne({ where: { id: faltaId } as any, relations: ['funcionario'] });
    if (!falta || falta.funcionario.id !== func.id) fail('NO_ENCONTRADO', 'FALTA NO ENCONTRADA');
    const res = await dataSource.getRepository(DrFalta).update(
      { id: faltaId, estado: DrFaltaEstado.REGISTRADA } as any,
      { renunciaApelacion: true } as any,
    );
    if (!res.affected) fail('ESTADO_INVALIDO', 'LA FALTA YA NO ADMITE RENUNCIA');
    return { ok: true };
  });

  // ───────────── Resolución ─────────────
  /** Aprueba una falta. Si es MULTA crea la Penalizacion [DR] en el mes de liquidación abierto. */
  ipcMain.handle('dr-aprobar-falta', async (_e, faltaId: number, resolucion?: string) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.APROBAR);
    return dataSource.transaction(async (m) => {
      const repo = m.getRepository(DrFalta);
      const falta: any = await repo.findOne({
        where: { id: faltaId } as any,
        relations: ['funcionario', 'funcionario.monedaSalario', 'tipoFalta', 'moneda', 'detectadoPor'],
      });
      if (!falta) fail('NO_ENCONTRADO', 'FALTA NO ENCONTRADA');
      noAutoResolver(falta, user);
      if (![DrFaltaEstado.REGISTRADA, DrFaltaEstado.APELADA].includes(falta.estado)) fail('ESTADO_INVALIDO', 'LA FALTA YA FUE RESUELTA');
      // §12: con el plazo de apelación vigente solo se aprueba si la persona renunció a apelar.
      // (Si apeló, la falta está APELADA y se resuelve con la apelación a la vista.)
      if (falta.estado === DrFaltaEstado.REGISTRADA && !falta.renunciaApelacion && falta.apelacionVence
        && new Date(falta.apelacionVence).getTime() > Date.now()) {
        fail('PLAZO_APELACION_VIGENTE', 'TODAVÍA CORRE EL PLAZO DE APELACIÓN: ESPERÁ A QUE VENZA O A QUE LA PERSONA RENUNCIE');
      }

      let penalizacion: Penalizacion | null = null;
      let mes: string | null = null;
      let cuotasInfo: { mes: string; monto: number }[] = [];
      const monto = Number(falta.montoCalculado) || 0;
      if (falta.resultado === DrFaltaResultado.MULTA && monto > 0) {
        try {
          if (falta.moneda) validarMoneda(falta.moneda.id, falta.funcionario.monedaSalario?.id);
          mes = mesDestino(fechaIso(falta.fecha), await estadosLiquidacion(m, falta.funcionario.id));
        } catch (e) {
          aError(e);
        }
        // Tope mensual: lo que excede pasa en cuotas a los meses siguientes (máx. 24).
        const tope = await topeMensual(m);
        const cuotas: { mes: string; monto: number }[] = [];
        let resto = monto;
        let mesCuota = mes!;
        for (let k = 0; resto > 0 && k < 24; k++) {
          const t = aplicarTope(resto, await drDescontadoEnMes(m, falta.funcionario.id, mesCuota), tope);
          if (t.montoEsteMes > 0) cuotas.push({ mes: mesCuota, monto: t.montoEsteMes });
          resto = t.excedente;
          mesCuota = mesSiguiente(mesCuota);
        }
        if (resto > 0) fail('TOPE_EXCEDIDO', 'LA MULTA SUPERA 24 MESES DE TOPE: REVISÁ EL TOPE MENSUAL');
        const base = `${PREFIJO_DR} ${falta.tipoFalta.nombre} #${falta.nOcurrencia} (FALTA ${falta.id})`.toUpperCase();
        for (let k = 0; k < cuotas.length; k++) {
          const c = cuotas[k];
          const nueva = m.getRepository(Penalizacion).create({
            funcionario: { id: falta.funcionario.id } as any,
            tipo: PenalizacionTipo.OTRO,
            descripcion: cuotas.length > 1 ? `${base} CUOTA ${k + 1}/${cuotas.length}` : base,
            monto: c.monto,
            fecha: (c.mes === fechaIso(falta.fecha).slice(0, 7) ? fechaIso(falta.fecha) : `${c.mes}-01`) as any,
            registradoPor: { id: user.id } as any,
            anulada: false,
            autoGenerada: true,
          });
          await setEntityUserTracking(dataSource, nueva, user.id, false);
          const g = await m.getRepository(Penalizacion).save(nueva);
          if (k === 0) penalizacion = g;
          await marcarBorradorDesactualizado(m, falta.funcionario.id, c.mes, `FALTA ${falta.id} APROBADA`);
        }
        cuotasInfo = cuotas;
      }
      const res = await repo.update(
        { id: faltaId, estado: falta.estado } as any,
        {
          estado: DrFaltaEstado.APROBADA,
          resueltoPor: { id: user.id },
          resueltoEn: new Date(),
          resolucionTexto: up(resolucion),
          penalizacion: penalizacion ? { id: penalizacion.id } : null,
          mesDestino: mes,
        } as any,
      );
      if (!res.affected) fail('ESTADO_INVALIDO', 'LA FALTA CAMBIÓ MIENTRAS SE APROBABA'); // revierte la transacción
      return { ok: true, penalizacionId: penalizacion?.id ?? null, mesDestino: mes, cuotas: cuotasInfo };
    });
  });

  /** Justifica (apelación aceptada) o anula una falta. Si tenía Penalizacion [DR], la anula. */
  const cerrarSinMulta = (canal: string, estadoFinal: DrFaltaEstado) =>
    ipcMain.handle(canal, async (_e, faltaId: number, motivo: string) => {
      const user = await ensurePermission(dataSource, getCurrentUser, P.APROBAR);
      if (!motivo || !String(motivo).trim()) fail('VALIDACION', 'EL MOTIVO ES OBLIGATORIO');
      return dataSource.transaction(async (m) => {
        const repo = m.getRepository(DrFalta);
        const falta: any = await repo.findOne({ where: { id: faltaId } as any, relations: ['penalizacion', 'funcionario', 'detectadoPor'] });
        if (!falta) fail('NO_ENCONTRADO', 'FALTA NO ENCONTRADA');
        noAutoResolver(falta, user);
        const permitidos = estadoFinal === DrFaltaEstado.JUSTIFICADA
          ? [DrFaltaEstado.REGISTRADA, DrFaltaEstado.APELADA]
          : [DrFaltaEstado.REGISTRADA, DrFaltaEstado.APELADA, DrFaltaEstado.APROBADA];
        if (!permitidos.includes(falta.estado)) fail('ESTADO_INVALIDO', 'NO SE PUEDE CAMBIAR EL ESTADO DE ESTA FALTA');
        if (falta.penalizacion) {
          // Todas las cuotas de esta falta (misma marca «(FALTA id)»).
          const pens: any[] = await m.getRepository(Penalizacion).find({
            where: { funcionario: { id: falta.funcionario.id }, anulada: false, descripcion: Like(`${PREFIJO_DR}%(FALTA ${falta.id})%`) } as any,
          });
          for (const p of pens) {
            const mesP = fechaIso(p.fecha).slice(0, 7);
            const liq = await m.getRepository(LiquidacionSueldo).findOne({
              where: { funcionario: { id: falta.funcionario.id }, periodo: mesP } as any,
            });
            if (liq && ['APROBADA', 'PAGADA'].includes(liq.estado as string)) {
              fail('LIQUIDACION_CERRADA', 'LA MULTA YA ESTÁ EN UNA LIQUIDACIÓN APROBADA O PAGADA');
            }
          }
          for (const p of pens) {
            await m.getRepository(Penalizacion).update({ id: p.id } as any, { anulada: true } as any);
            await marcarBorradorDesactualizado(m, falta.funcionario.id, fechaIso(p.fecha).slice(0, 7), `FALTA ${falta.id} ${estadoFinal}`);
          }
        }
        const res = await repo.update(
          { id: faltaId, estado: falta.estado } as any,
          {
            estado: estadoFinal,
            resueltoPor: { id: user.id },
            resueltoEn: new Date(),
            ...(estadoFinal === DrFaltaEstado.ANULADA ? { motivoAnulacion: up(motivo) } : { resolucionTexto: up(motivo) }),
          } as any,
        );
        if (!res.affected) fail('ESTADO_INVALIDO', 'LA FALTA CAMBIÓ MIENTRAS SE PROCESABA');
        return { ok: true };
      });
    });
  cerrarSinMulta('dr-justificar-falta', DrFaltaEstado.JUSTIFICADA);
  cerrarSinMulta('dr-anular-falta', DrFaltaEstado.ANULADA);
}
