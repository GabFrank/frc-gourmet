/**
 * Funciones y Tareas (FT) — handlers RPC, fase 1 (ABM + operación).
 * Ver docs/planes/PLAN-funciones-tareas.md (§5; §10 y §11 prevalecen).
 *
 * Todos los canales `ft-*` llaman `ensurePermission`: `/api/rpc` es default-allow y el guard
 * por handler es la única frontera (§10 B5). Identidad de «mis tareas» y marcar: el
 * funcionario del usuario de la sesión, nunca un id del cliente. Nadie verifica lo propio.
 * Los cambios de estado son UPDATE condicionales sobre el estado leído (dos clics a la vez
 * no pisan nada).
 */
import { ipcMain } from 'electron';
import { DataSource, EntityManager, In } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Cargo } from '../../src/app/database/entities/rrhh/cargo.entity';
import { Turno } from '../../src/app/database/entities/rrhh/turno.entity';
import { DrGrupo } from '../../src/app/database/entities/rrhh/disciplina/dr-grupo.entity';
import { DrTipoFalta } from '../../src/app/database/entities/rrhh/disciplina/dr-tipo-falta.entity';
import { DrCriterio } from '../../src/app/database/entities/rrhh/disciplina/dr-criterio.entity';
import { FtFuncion } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-funcion.entity';
import { FtPlantillaTarea } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-plantilla-tarea.entity';
import { FtPlantillaItem } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-plantilla-item.entity';
import { FtReglaAviso } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-regla-aviso.entity';
import { FtTarea } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-tarea.entity';
import { FtTareaItem } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-tarea-item.entity';
import { FtConfig } from '../../src/app/database/entities/rrhh/funciones-tareas/ft-config.entity';
import {
  FtAncla, FtCanalAviso, FtEstadoTarea, FtEvento, FtEvidencia, FtMomentoAviso, FtOrigenTarea, FtRecurrencia, FtTipoTarea,
} from '../../src/app/database/entities/rrhh/funciones-tareas/ft.enums';
import { ensurePermission, getEffectiveUser, getUserPermissionCodes } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { buscarFuncionarioDeUsuario, funcionarioDeSesion } from '../utils/funcionario-sesion.utils';
import {
  ahoraFt, esDiaValido, esHoraValida, fechaLocal, fechaLocalHoy, paramTs, sumarDias, sumarMinutos,
} from '../services/funciones-tareas/fechas';
import { FT_CLAVES, FT_CONFIG_DEFAULTS, FT_CONFIG_EDITABLE, escribirConfigFt } from '../services/funciones-tareas/config';
import { cargoVigente } from '../services/funciones-tareas/vigencia';

const P = {
  CONFIGURAR: 'RRHH_FT_CONFIGURAR',
  VER_TODO: 'RRHH_FT_VER_TODO',
  MARCAR_PROPIAS: 'RRHH_FT_MARCAR_PROPIAS',
  VERIFICAR: 'RRHH_FT_VERIFICAR',
  REPORTES: 'RRHH_FT_REPORTES',
};
/** Quienes pueden leer la configuración y las tareas de cualquiera. */
const LECTURA_GENERAL = [P.CONFIGURAR, P.VER_TODO, P.VERIFICAR, P.REPORTES];
const MAX_DIAS_RANGO = 31;

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}

const up = (s: unknown): string | null => {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  return t ? t.toUpperCase() : null;
};

/** Id de una relación que llega como `xId` o como `x: { id }`; null si no viene. */
function idDe(data: any, rel: string): number | null {
  const v = data?.[`${rel}Id`] ?? data?.[rel]?.id ?? (typeof data?.[rel] === 'number' ? data[rel] : null);
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function enumValido<T extends Record<string, string>>(e: T, v: unknown, campo: string, def?: T[keyof T]): T[keyof T] {
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  if (!Object.values(e).includes(v as any)) fail('VALIDACION', `${campo.toUpperCase()} INVÁLIDO: ${v}`);
  return v as T[keyof T];
}

function entero(v: unknown, campo: string, min: number, max: number, def: number): number {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail('VALIDACION', `${campo.toUpperCase()} FUERA DE RANGO (${min} A ${max})`);
  return n;
}

function diaOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = v instanceof Date ? fechaLocal(v) : String(v).slice(0, 10);
  if (!esDiaValido(s)) fail('VALIDACION', `${campo.toUpperCase()} INVÁLIDA (YYYY-MM-DD)`);
  return s;
}

async function existe(m: DataSource | EntityManager, ent: any, id: number | null, nombre: string): Promise<void> {
  if (id == null) return;
  const n = await m.getRepository(ent).count({ where: { id } as any });
  if (!n) fail('NO_ENCONTRADO', `${nombre} NO ENCONTRADO`);
}

function nombreFuncionario(f: Funcionario | null | undefined): string {
  const p: any = f?.persona;
  return p ? [p.nombre, p.apellido].filter(Boolean).join(' ') : '';
}

export function registerFuncionesTareasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  const usuarioId = () => getEffectiveUser(getCurrentUser)?.id;
  const permisosDe = async (u: Usuario) => getUserPermissionCodes(dataSource, u.id);
  const tieneAlguno = (codes: Set<string>, lista: string[]) => lista.some((c) => codes.has(c));

  // ═════════════════════════ Funciones (generales y específicas) ═════════════════════════

  /** filtros: { cargoId?, funcionarioId?, incluirInactivas? } */
  ipcMain.handle('ft-funciones-list', async (_e, filtros: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, LECTURA_GENERAL);
    const qb = dataSource.getRepository(FtFuncion).createQueryBuilder('fn')
      .leftJoinAndSelect('fn.cargo', 'c')
      .leftJoinAndSelect('fn.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'pe')
      .orderBy('fn.orden', 'ASC').addOrderBy('fn.id', 'ASC');
    const cargoId = idDe(filtros, 'cargo');
    const funcId = idDe(filtros, 'funcionario');
    if (cargoId) qb.andWhere('c.id = :c', { c: cargoId });
    if (funcId) qb.andWhere('f.id = :f', { f: funcId });
    if (!filtros?.incluirInactivas) qb.andWhere('fn.activo = :a', { a: true });
    return qb.getMany();
  });

  /** data: { id?, descripcion, detalle?, orden?, activo?, cargoId? | funcionarioId? } — exactamente uno de los dos. */
  ipcMain.handle('ft-funciones-save', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    const repo = dataSource.getRepository(FtFuncion);
    const ent = data?.id ? await repo.findOneBy({ id: data.id } as any) : repo.create();
    if (!ent) fail('NO_ENCONTRADO', 'FUNCIÓN NO ENCONTRADA');
    const descripcion = up(data?.descripcion);
    if (!descripcion) fail('VALIDACION', 'LA DESCRIPCIÓN ES OBLIGATORIA');
    const cargoId = idDe(data, 'cargo');
    const funcId = idDe(data, 'funcionario');
    if ((cargoId == null) === (funcId == null)) {
      fail('VALIDACION', 'LA FUNCIÓN ES DE UN CARGO (GENERAL) O DE UN FUNCIONARIO (ESPECÍFICA): EXACTAMENTE UNO DE LOS DOS');
    }
    await existe(dataSource, Cargo, cargoId, 'CARGO');
    await existe(dataSource, Funcionario, funcId, 'FUNCIONARIO');
    Object.assign(ent, {
      descripcion,
      detalle: up(data?.detalle),
      orden: entero(data?.orden, 'orden', -100000, 100000, ent.orden ?? 0),
      activo: data?.activo === undefined ? ent.activo ?? true : !!data.activo,
      cargo: cargoId ? ({ id: cargoId } as any) : null,
      funcionario: funcId ? ({ id: funcId } as any) : null,
    });
    await setEntityUserTracking(dataSource, ent, usuarioId(), !!data?.id);
    return repo.save(ent);
  });

  ipcMain.handle('ft-funciones-set-activo', async (_e, id: number, activo: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    const r = await dataSource.getRepository(FtFuncion).update({ id } as any, { activo: !!activo } as any);
    if (!r.affected) fail('NO_ENCONTRADO', 'FUNCIÓN NO ENCONTRADA');
    return { ok: true };
  });

  ipcMain.handle('ft-funciones-delete', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    const r = await dataSource.getRepository(FtFuncion).delete({ id } as any);
    if (!r.affected) fail('NO_ENCONTRADO', 'FUNCIÓN NO ENCONTRADA');
    return { ok: true };
  });

  /**
   * Funciones combinadas de un funcionario a una fecha (def. hoy): generales del cargo vigente
   * (HistoricoCargo; si no hay, funcionario.cargo) + específicas. Sin permisos de lectura
   * general, solo las propias.
   */
  ipcMain.handle('ft-funciones-de', async (_e, funcionarioIdArg?: number, fechaArg?: string) => {
    const user = await ensurePermission(dataSource, getCurrentUser, [...LECTURA_GENERAL, P.MARCAR_PROPIAS]);
    const codes = await permisosDe(user);
    let funcionarioId = Number(funcionarioIdArg) || null;
    if (!tieneAlguno(codes, LECTURA_GENERAL)) {
      const propio = await funcionarioDeSesion(dataSource, user);
      if (funcionarioId && funcionarioId !== propio.id) fail('FORBIDDEN', 'SOLO PODÉS VER TUS PROPIAS FUNCIONES');
      funcionarioId = propio.id;
    }
    if (!funcionarioId) fail('VALIDACION', 'FALTA EL FUNCIONARIO');
    const fecha = diaOpcional(fechaArg, 'fecha') ?? fechaLocalHoy();
    const func = await dataSource.getRepository(Funcionario).findOne({ where: { id: funcionarioId } as any, relations: ['persona'] });
    if (!func) fail('NO_ENCONTRADO', 'FUNCIONARIO NO ENCONTRADO');
    const cargo = await cargoVigente(dataSource, funcionarioId, fecha);
    const repo = dataSource.getRepository(FtFuncion);
    const orden = { orden: 'ASC', id: 'ASC' } as any;
    const generales = cargo ? await repo.find({ where: { cargo: { id: cargo.id }, activo: true } as any, order: orden }) : [];
    const especificas = await repo.find({ where: { funcionario: { id: funcionarioId }, activo: true } as any, order: orden });
    return {
      fecha,
      funcionario: { id: func.id, nombre: nombreFuncionario(func) },
      cargo: cargo ? { id: cargo.id, nombre: cargo.nombre } : null,
      generales,
      especificas,
    };
  });

  // ═════════════════════════ Plantillas de tareas / checklists ═════════════════════════

  /** filtros: { cargoId?, funcionarioId?, turnoId?, grupoId?, incluirInactivas? } */
  ipcMain.handle('ft-plantillas-list', async (_e, filtros: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, LECTURA_GENERAL);
    const qb = dataSource.getRepository(FtPlantillaTarea).createQueryBuilder('p')
      .leftJoinAndSelect('p.cargo', 'c')
      .leftJoinAndSelect('p.turno', 't')
      .leftJoinAndSelect('p.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'pe')
      .leftJoinAndSelect('p.grupo', 'g')
      .leftJoinAndSelect('p.reemplazaPlantilla', 'r')
      .orderBy('p.titulo', 'ASC').addOrderBy('p.id', 'ASC');
    for (const [rel, alias] of [['cargo', 'c'], ['funcionario', 'f'], ['turno', 't'], ['grupo', 'g']] as const) {
      const id = idDe(filtros, rel);
      if (id) qb.andWhere(`${alias}.id = :${rel}`, { [rel]: id });
    }
    if (!filtros?.incluirInactivas) qb.andWhere('p.activo = :a', { a: true });
    return qb.getMany();
  });

  const RELACIONES_PLANTILLA = [
    'cargo', 'turno', 'funcionario', 'funcionario.persona', 'grupo', 'reemplazaPlantilla', 'verificadorCargo', 'tipoFalta', 'criterio', 'items', 'reglas',
  ];
  async function cargarPlantilla(m: DataSource | EntityManager, id: number): Promise<FtPlantillaTarea> {
    const p = await m.getRepository(FtPlantillaTarea).findOne({ where: { id } as any, relations: RELACIONES_PLANTILLA });
    if (!p) fail('NO_ENCONTRADO', 'PLANTILLA NO ENCONTRADA');
    p.items = [...(p.items ?? [])].sort((a, b) => (a.orden - b.orden) || (a.id - b.id));
    p.reglas = [...(p.reglas ?? [])].sort((a, b) => a.id - b.id);
    return p;
  }

  ipcMain.handle('ft-plantillas-get', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, LECTURA_GENERAL);
    return cargarPlantilla(dataSource, Number(id));
  });

  /**
   * Alta/edición con ítems y reglas de aviso (se reemplazan por la lista enviada: los que
   * traen id se actualizan, los que faltan se borran). Editar no toca las tareas ya generadas
   * (tienen snapshot).
   * Alcance válido: solo funcionario (específica) · cargo (+ turno opcional) · grupo DR (área).
   */
  ipcMain.handle('ft-plantillas-save', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    const esEdicion = !!data?.id;
    const titulo = up(data?.titulo);
    if (!titulo) fail('VALIDACION', 'EL TÍTULO ES OBLIGATORIO');

    const cargoId = idDe(data, 'cargo');
    const turnoId = idDe(data, 'turno');
    const funcId = idDe(data, 'funcionario');
    const grupoId = idDe(data, 'grupo');
    const alcanceOk =
      (funcId != null && cargoId == null && turnoId == null && grupoId == null) ||
      (cargoId != null && funcId == null && grupoId == null) ||
      (grupoId != null && funcId == null && cargoId == null && turnoId == null);
    if (!alcanceOk) {
      fail('ALCANCE_INVALIDO', 'ALCANCE INVÁLIDO: UN FUNCIONARIO, UN CARGO (CON O SIN TURNO) O UN ÁREA (GRUPO)');
    }
    const reemplazaId = idDe(data, 'reemplazaPlantilla');
    if (reemplazaId != null && funcId == null) fail('VALIDACION', 'SOLO UNA PLANTILLA ESPECÍFICA (DE UN FUNCIONARIO) PUEDE REEMPLAZAR A OTRA');
    if (reemplazaId != null && reemplazaId === Number(data?.id)) fail('VALIDACION', 'UNA PLANTILLA NO PUEDE REEMPLAZARSE A SÍ MISMA');

    const tipo = enumValido(FtTipoTarea, data?.tipo, 'tipo', FtTipoTarea.SIMPLE);
    const recurrencia = enumValido(FtRecurrencia, data?.recurrencia, 'recurrencia', FtRecurrencia.DIARIA);
    const ancla = enumValido(FtAncla, data?.ancla, 'ancla', FtAncla.INICIO_TURNO);
    const evidencia = enumValido(FtEvidencia, data?.evidencia, 'evidencia', FtEvidencia.NINGUNA);
    const evento = data?.evento ? enumValido(FtEvento, data.evento, 'evento') : null;
    let diasSemana: number | null = null;
    let diaMes: number | null = null;
    let fechaUnica: string | null = null;
    if (recurrencia === FtRecurrencia.DIAS_SEMANA) {
      diasSemana = entero(data?.diasSemana, 'días de la semana', 1, 127, 0);
      if (!diasSemana) fail('VALIDACION', 'ELEGÍ AL MENOS UN DÍA DE LA SEMANA');
    }
    if (recurrencia === FtRecurrencia.MENSUAL) {
      diaMes = entero(data?.diaMes, 'día del mes', 1, 31, 0);
      if (!diaMes) fail('VALIDACION', 'FALTA EL DÍA DEL MES');
    }
    if (recurrencia === FtRecurrencia.UNICA) {
      fechaUnica = diaOpcional(data?.fechaUnica, 'fecha única');
      if (!fechaUnica) fail('VALIDACION', 'FALTA LA FECHA DE LA TAREA ÚNICA');
    }
    if (recurrencia === FtRecurrencia.EVENTO && !evento) fail('VALIDACION', 'FALTA EL EVENTO QUE DISPARA LA TAREA');
    if ((recurrencia === FtRecurrencia.EVENTO) !== (ancla === FtAncla.EVENTO)) {
      fail('VALIDACION', 'LA RECURRENCIA EVENTO VA CON EL ANCLA EVENTO (Y SOLO ELLA)');
    }
    let horaFija: string | null = null;
    if (ancla === FtAncla.HORA_FIJA) {
      horaFija = String(data?.horaFija ?? '').slice(0, 5);
      if (!esHoraValida(horaFija)) fail('VALIDACION', 'HORA FIJA INVÁLIDA (HH:MM)');
    }
    const vigenciaDesde = diaOpcional(data?.vigenciaDesde, 'vigencia desde');
    const vigenciaHasta = diaOpcional(data?.vigenciaHasta, 'vigencia hasta');
    if (vigenciaDesde && vigenciaHasta && vigenciaDesde > vigenciaHasta) fail('VALIDACION', 'LA VIGENCIA TERMINA ANTES DE EMPEZAR');
    const requiereVerificacion = !!data?.requiereVerificacion;
    const verificadorCargoId = requiereVerificacion ? idDe(data, 'verificadorCargo') : null;

    const itemsIn: any[] = Array.isArray(data?.items) ? data.items : [];
    const items = itemsIn.map((it, i) => {
      const texto = up(it?.texto);
      if (!texto) fail('VALIDACION', `EL ÍTEM ${i + 1} NO TIENE TEXTO`);
      return { id: Number(it?.id) || null, texto, orden: entero(it?.orden, 'orden del ítem', -100000, 100000, i), obligatorio: it?.obligatorio === undefined ? true : !!it.obligatorio };
    });
    if (tipo === FtTipoTarea.CHECKLIST && !items.length) fail('VALIDACION', 'UN CHECKLIST NECESITA AL MENOS UN ÍTEM');
    if (tipo === FtTipoTarea.SIMPLE && items.length) fail('VALIDACION', 'UNA TAREA SIMPLE NO LLEVA ÍTEMS (USÁ CHECKLIST)');

    const reglasIn: any[] = Array.isArray(data?.reglas) ? data.reglas : [];
    const reglas = reglasIn.map((r) => ({
      id: Number(r?.id) || null,
      momento: enumValido(FtMomentoAviso, r?.momento, 'momento del aviso'),
      minutos: entero(r?.minutos, 'minutos del aviso', 0, 7 * 24 * 60, 0),
      nivel: entero(r?.nivel, 'nivel del aviso', 1, 3, 1),
      canal: enumValido(FtCanalAviso, r?.canal, 'canal del aviso', FtCanalAviso.APP),
      destino: r?.destino ? String(r.destino).trim() || null : null,
      activo: r?.activo === undefined ? true : !!r.activo,
    }));

    return dataSource.transaction(async (m) => {
      const repo = m.getRepository(FtPlantillaTarea);
      const ent = esEdicion ? await repo.findOneBy({ id: data.id } as any) : repo.create();
      if (!ent) fail('NO_ENCONTRADO', 'PLANTILLA NO ENCONTRADA');
      await existe(m, Cargo, cargoId, 'CARGO');
      await existe(m, Turno, turnoId, 'TURNO');
      await existe(m, Funcionario, funcId, 'FUNCIONARIO');
      await existe(m, DrGrupo, grupoId, 'GRUPO');
      await existe(m, Cargo, verificadorCargoId, 'CARGO VERIFICADOR');
      const tipoFaltaId = idDe(data, 'tipoFalta');
      const criterioId = idDe(data, 'criterio');
      await existe(m, DrTipoFalta, tipoFaltaId, 'TIPO DE FALTA');
      await existe(m, DrCriterio, criterioId, 'CRITERIO');
      if (reemplazaId != null) {
        const general = await repo.findOne({ where: { id: reemplazaId } as any, relations: ['funcionario'] });
        if (!general) fail('NO_ENCONTRADO', 'LA PLANTILLA A REEMPLAZAR NO EXISTE');
        if (general.funcionario) fail('VALIDACION', 'SOLO SE PUEDE REEMPLAZAR UNA PLANTILLA GENERAL');
      }
      const ref = (id: number | null) => (id ? ({ id } as any) : null);
      Object.assign(ent, {
        titulo,
        instrucciones: up(data?.instrucciones),
        tipo,
        activo: data?.activo === undefined ? ent.activo ?? true : !!data.activo,
        critica: !!data?.critica,
        peso: entero(data?.peso, 'peso', 0, 1000, 1),
        cargo: ref(cargoId),
        turno: ref(turnoId),
        funcionario: ref(funcId),
        grupo: ref(grupoId),
        reemplazaPlantilla: ref(reemplazaId),
        recurrencia,
        diasSemana,
        diaMes,
        fechaUnica,
        evento,
        ancla,
        offsetInicioMin: entero(data?.offsetInicioMin, 'desfase', -24 * 60, 24 * 60, 0),
        duracionMin: entero(data?.duracionMin, 'duración', 1, 7 * 24 * 60, 60),
        horaFija,
        evidencia,
        requiereVerificacion,
        verificadorCargo: ref(verificadorCargoId),
        tipoFalta: ref(tipoFaltaId),
        criterio: ref(criterioId),
        vigenciaDesde,
        vigenciaHasta,
      });
      delete (ent as any).items;
      delete (ent as any).reglas;
      await setEntityUserTracking(dataSource, ent, usuarioId(), esEdicion);
      const guardada = await repo.save(ent);

      // Ítems: upsert por id, borrar los que no vinieron.
      const itemRepo = m.getRepository(FtPlantillaItem);
      const prevItems = esEdicion ? await itemRepo.find({ where: { plantilla: { id: guardada.id } } as any }) : [];
      const quedan = new Set<number>();
      for (const it of items) {
        let fila = it.id ? prevItems.find((x) => x.id === it.id) : undefined;
        if (it.id && !fila) fail('NO_ENCONTRADO', `ÍTEM ${it.id} NO PERTENECE A LA PLANTILLA`);
        fila = fila ?? itemRepo.create({ plantilla: { id: guardada.id } as any });
        Object.assign(fila, { texto: it.texto, orden: it.orden, obligatorio: it.obligatorio });
        const g = await itemRepo.save(fila);
        quedan.add(g.id);
      }
      const borrarItems = prevItems.filter((x) => !quedan.has(x.id)).map((x) => x.id);
      if (borrarItems.length) await itemRepo.delete({ id: In(borrarItems) } as any);

      const reglaRepo = m.getRepository(FtReglaAviso);
      const prevReglas = esEdicion ? await reglaRepo.find({ where: { plantilla: { id: guardada.id } } as any }) : [];
      const quedanR = new Set<number>();
      for (const r of reglas) {
        let fila = r.id ? prevReglas.find((x) => x.id === r.id) : undefined;
        if (r.id && !fila) fail('NO_ENCONTRADO', `REGLA ${r.id} NO PERTENECE A LA PLANTILLA`);
        fila = fila ?? reglaRepo.create({ plantilla: { id: guardada.id } as any });
        const { id: _id, ...campos } = r;
        Object.assign(fila, campos);
        const g = await reglaRepo.save(fila);
        quedanR.add(g.id);
      }
      const borrarReglas = prevReglas.filter((x) => !quedanR.has(x.id)).map((x) => x.id);
      if (borrarReglas.length) await reglaRepo.delete({ id: In(borrarReglas) } as any);

      return cargarPlantilla(m, guardada.id);
    });
  });

  ipcMain.handle('ft-plantillas-set-activo', async (_e, id: number, activo: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    const r = await dataSource.getRepository(FtPlantillaTarea).update({ id } as any, { activo: !!activo } as any);
    if (!r.affected) fail('NO_ENCONTRADO', 'PLANTILLA NO ENCONTRADA');
    return { ok: true };
  });

  /** Borra solo si nunca generó tareas ni la reemplaza otra; si no, desactivarla. */
  ipcMain.handle('ft-plantillas-delete', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    return dataSource.transaction(async (m) => {
      const usadas = await m.getRepository(FtTarea).count({ where: { plantilla: { id } } as any });
      const reemplazos = await m.getRepository(FtPlantillaTarea).count({ where: { reemplazaPlantilla: { id } } as any });
      if (usadas || reemplazos) fail('EN_USO', 'LA PLANTILLA YA TIENE TAREAS O LA REEMPLAZA OTRA: DESACTIVALA EN VEZ DE BORRARLA');
      await m.getRepository(FtPlantillaItem).delete({ plantilla: { id } } as any);
      await m.getRepository(FtReglaAviso).delete({ plantilla: { id } } as any);
      const r = await m.getRepository(FtPlantillaTarea).delete({ id } as any);
      if (!r.affected) fail('NO_ENCONTRADO', 'PLANTILLA NO ENCONTRADA');
      return { ok: true };
    });
  });

  // ═════════════════════════ Configuración del motor ═════════════════════════

  /** Valores con sus defaults, más el estado interno (último tick y lock) de solo lectura. */
  ipcMain.handle('ft-config-get', async () => {
    await ensurePermission(dataSource, getCurrentUser, LECTURA_GENERAL);
    const filas = await dataSource.getRepository(FtConfig).find();
    const out: Record<string, any> = { ...FT_CONFIG_DEFAULTS };
    for (const f of filas) {
      if (f.clave in FT_CONFIG_EDITABLE) out[f.clave] = f.valor ?? '';
    }
    const json = (clave: string) => {
      const v = filas.find((f) => f.clave === clave)?.valor;
      try { return v ? JSON.parse(v) : null; } catch { return null; }
    };
    return { valores: out, ultimoTick: json(FT_CLAVES.ULTIMO_TICK), lock: json(FT_CLAVES.MOTOR_LOCK) };
  });

  /** valores: { clave: valor, ... } — solo claves editables, validadas. */
  ipcMain.handle('ft-config-set', async (_e, valores: Record<string, unknown>) => {
    await ensurePermission(dataSource, getCurrentUser, P.CONFIGURAR);
    if (!valores || typeof valores !== 'object') fail('VALIDACION', 'NADA PARA GUARDAR');
    const limpio: [string, string][] = [];
    for (const [clave, raw] of Object.entries(valores)) {
      const valida = FT_CONFIG_EDITABLE[clave];
      if (!valida) fail('VALIDACION', `CLAVE NO CONFIGURABLE: ${clave}`);
      const v = typeof raw === 'boolean' ? String(raw) : String(raw ?? '').trim();
      if (!valida(v)) fail('VALIDACION', `VALOR INVÁLIDO PARA ${clave}: ${v}`);
      limpio.push([clave, v]);
    }
    await dataSource.transaction(async (m) => {
      for (const [c, v] of limpio) await escribirConfigFt(m, c, v);
    });
    return { ok: true };
  });

  // ═════════════════════════ Operación ═════════════════════════

  const relacionesTarea = ['items', 'items.item', 'plantilla', 'funcionario', 'funcionario.persona', 'hechaPor', 'verificadaPor'];

  async function cargarTarea(m: DataSource | EntityManager, id: number): Promise<FtTarea> {
    const t = await m.getRepository(FtTarea).findOne({ where: { id } as any, relations: relacionesTarea });
    if (!t) fail('NO_ENCONTRADO', 'TAREA NO ENCONTRADA');
    t.items = [...(t.items ?? [])].sort((a, b) => a.id - b.id);
    return t;
  }

  /** Para devolver al cliente sin datos del usuario (password, etc.). */
  function limpiarTarea(t: FtTarea): any {
    const u = (x: any) => (x ? { id: x.id, nickname: x.nickname } : null);
    const f: any = t.funcionario;
    return {
      ...t,
      funcionario: f ? { id: f.id, nombre: nombreFuncionario(f) } : null,
      hechaPor: u(t.hechaPor),
      verificadaPor: u(t.verificadaPor),
      items: (t.items ?? []).map((i) => ({ id: i.id, texto: i.texto, hecho: i.hecho, hechoEn: i.hechoEn, obligatorio: i.item ? i.item.obligatorio : true })),
    };
  }

  /**
   * Tareas del funcionario de la sesión para hoy (local) y las del turno de ayer que siguen
   * abiertas pasada la medianoche (turno nocturno).
   */
  ipcMain.handle('ft-mis-tareas-hoy', async () => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.MARCAR_PROPIAS);
    const func = await funcionarioDeSesion(dataSource, user);
    const ahora = ahoraFt();
    const hoy = fechaLocal(ahora);
    const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const tareas = await dataSource.getRepository(FtTarea).createQueryBuilder('t')
      .leftJoinAndSelect('t.items', 'i')
      .leftJoinAndSelect('i.item', 'pi')
      .leftJoinAndSelect('t.plantilla', 'p')
      .leftJoinAndSelect('t.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'pe')
      .where('f.id = :fid', { fid: func.id })
      .andWhere('(t.fecha = :hoy OR (t.fecha = :ayer AND t.vence >= :inicioHoy))', {
        hoy, ayer: sumarDias(hoy, -1), inicioHoy: paramTs(dataSource, inicioHoy),
      })
      .orderBy('t.inicio', 'ASC').addOrderBy('t.id', 'ASC').addOrderBy('i.id', 'ASC')
      .getMany();
    return tareas.map(limpiarTarea);
  });

  /** Lista para encargados (pendientes de verificar, etc.). filtros: { desde, hasta (≤ 31 días), funcionarioId?, estado? } */
  ipcMain.handle('ft-tareas-list', async (_e, filtros: any = {}) => {
    await ensurePermission(dataSource, getCurrentUser, LECTURA_GENERAL);
    const hoy = fechaLocalHoy();
    const desde = diaOpcional(filtros?.desde, 'desde') ?? hoy;
    const hasta = diaOpcional(filtros?.hasta, 'hasta') ?? desde;
    if (desde > hasta) fail('VALIDACION', 'EL RANGO TERMINA ANTES DE EMPEZAR');
    if (sumarDias(desde, MAX_DIAS_RANGO - 1) < hasta) fail('RANGO_EXCEDIDO', `EL RANGO MÁXIMO ES DE ${MAX_DIAS_RANGO} DÍAS`);
    const qb = dataSource.getRepository(FtTarea).createQueryBuilder('t')
      .leftJoinAndSelect('t.items', 'i')
      .leftJoinAndSelect('i.item', 'pi')
      .leftJoinAndSelect('t.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'pe')
      .leftJoinAndSelect('t.hechaPor', 'hp')
      .leftJoinAndSelect('t.verificadaPor', 'vp')
      .where('t.fecha >= :desde AND t.fecha <= :hasta', { desde, hasta })
      .orderBy('t.fecha', 'ASC').addOrderBy('t.inicio', 'ASC').addOrderBy('t.id', 'ASC').addOrderBy('i.id', 'ASC');
    const fid = idDe(filtros, 'funcionario');
    if (fid) qb.andWhere('f.id = :fid', { fid });
    if (filtros?.estado) qb.andWhere('t.estado = :e', { e: enumValido(FtEstadoTarea, filtros.estado, 'estado') });
    return (await qb.getMany()).map(limpiarTarea);
  });

  /**
   * Marcar una tarea propia. data: { itemId?, hecho? (def. true), nota?, evidenciaUrl?, completar? }
   *  - con itemId: marca/desmarca ese ítem del checklist; al quedar todos los obligatorios
   *    hechos, la tarea pasa sola a HECHA.
   *  - sin itemId: completa la tarea (completar def. true). Exige los ítems obligatorios y la
   *    evidencia que pida la plantilla (NOTA o FOTO).
   *  - `completar: false` sin itemId: solo guarda la nota / evidencia.
   * Se puede marcar en PENDIENTE o RECHAZADA (rehacer).
   */
  ipcMain.handle('ft-tarea-marcar', async (_e, tareaId: number, data: any = {}) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.MARCAR_PROPIAS);
    const func = await funcionarioDeSesion(dataSource, user);
    const abiertas = [FtEstadoTarea.PENDIENTE, FtEstadoTarea.RECHAZADA];
    const res = await dataSource.transaction(async (m) => {
      const t = await cargarTarea(m, Number(tareaId));
      if (t.funcionario.id !== func.id) fail('NO_ENCONTRADO', 'TAREA NO ENCONTRADA');
      if (!abiertas.includes(t.estado)) fail('ESTADO_INVALIDO', `LA TAREA ESTÁ ${t.estado}: NO SE PUEDE MARCAR`);
      const ahora = ahoraFt();
      const cambios: any = {};
      if (data?.nota !== undefined) cambios.nota = up(data.nota);
      if (data?.evidenciaUrl !== undefined) cambios.evidenciaUrl = data.evidenciaUrl ? String(data.evidenciaUrl).slice(0, 500) : null;

      const itemId = Number(data?.itemId) || null;
      let completar = itemId ? false : data?.completar !== false;
      if (itemId) {
        const it = (t.items ?? []).find((i) => i.id === itemId);
        if (!it) fail('NO_ENCONTRADO', 'ÍTEM NO ENCONTRADO EN LA TAREA');
        const hecho = data?.hecho === undefined ? true : !!data.hecho;
        await m.getRepository(FtTareaItem).update({ id: it.id } as any, { hecho, hechoEn: hecho ? ahora : null } as any);
        it.hecho = hecho;
        const obligatoriosOk = (t.items ?? []).every((i) => i.hecho || (i.item ? !i.item.obligatorio : false));
        if (hecho && obligatoriosOk) completar = true;
      }
      const notaFinal = cambios.nota !== undefined ? cambios.nota : t.nota;
      const evidFinal = cambios.evidenciaUrl !== undefined ? cambios.evidenciaUrl : t.evidenciaUrl;
      if (completar) {
        const faltan = (t.items ?? []).filter((i) => !i.hecho && (i.item ? i.item.obligatorio : true));
        if (faltan.length) {
          if (!itemId) fail('ITEMS_PENDIENTES', `FALTAN ${faltan.length} ÍTEM(S) OBLIGATORIO(S) DEL CHECKLIST`);
          completar = false;
        }
      }
      if (completar) {
        const ev = t.plantilla?.evidencia ?? FtEvidencia.NINGUNA;
        if (ev === FtEvidencia.NOTA && !notaFinal) {
          if (!itemId) fail('EVIDENCIA_REQUERIDA', 'ESTA TAREA PIDE UNA NOTA PARA DARLA POR HECHA');
          completar = false;
        }
        if (ev === FtEvidencia.FOTO && !evidFinal) {
          if (!itemId) fail('EVIDENCIA_REQUERIDA', 'ESTA TAREA PIDE UNA FOTO PARA DARLA POR HECHA');
          completar = false;
        }
      }
      if (completar) Object.assign(cambios, { estado: FtEstadoTarea.HECHA, hechaPor: { id: user.id }, hechaEn: ahora });
      if (Object.keys(cambios).length) {
        const r = await m.createQueryBuilder().update(FtTarea).set(cambios)
          .where('id = :id', { id: t.id }).andWhere('estado IN (:...ab)', { ab: abiertas }).execute();
        if (!r.affected) fail('ESTADO_INVALIDO', 'LA TAREA CAMBIÓ DE ESTADO, VOLVÉ A CARGARLA');
      }
      return t.id;
    });
    return limpiarTarea(await cargarTarea(dataSource, res));
  });

  /**
   * «No aplica» (hoy no corresponde, con motivo). La persona en su tarea PENDIENTE o RECHAZADA;
   * quien tiene RRHH_FT_VERIFICAR, en cualquiera de otro funcionario que no esté cerrada
   * (también VENCIDA).
   */
  ipcMain.handle('ft-tarea-no-aplica', async (_e, tareaId: number, motivo: string) => {
    const user = await ensurePermission(dataSource, getCurrentUser, [P.MARCAR_PROPIAS, P.VERIFICAR]);
    const motivoUp = up(motivo);
    if (!motivoUp) fail('VALIDACION', 'ESCRIBÍ POR QUÉ NO APLICA');
    const codes = await permisosDe(user);
    const t = await cargarTarea(dataSource, Number(tareaId));
    const propio = await buscarFuncionarioDeUsuario(dataSource, user.id);
    const esPropia = !!propio && propio.id === t.funcionario.id;
    let permitidos: FtEstadoTarea[];
    if (esPropia) {
      if (!codes.has(P.MARCAR_PROPIAS)) fail('FORBIDDEN', `PERMISO REQUERIDO: ${P.MARCAR_PROPIAS}`);
      permitidos = [FtEstadoTarea.PENDIENTE, FtEstadoTarea.RECHAZADA];
    } else {
      if (!codes.has(P.VERIFICAR)) fail('NO_ENCONTRADO', 'TAREA NO ENCONTRADA');
      permitidos = [FtEstadoTarea.PENDIENTE, FtEstadoTarea.RECHAZADA, FtEstadoTarea.VENCIDA];
    }
    if (!permitidos.includes(t.estado)) fail('ESTADO_INVALIDO', `LA TAREA ESTÁ ${t.estado}`);
    const r = await dataSource.createQueryBuilder().update(FtTarea)
      .set({ estado: FtEstadoTarea.NO_APLICA, motivoNoAplica: motivoUp, hechaPor: { id: user.id }, hechaEn: ahoraFt() } as any)
      .where('id = :id', { id: t.id }).andWhere('estado IN (:...p)', { p: permitidos }).execute();
    if (!r.affected) fail('ESTADO_INVALIDO', 'LA TAREA CAMBIÓ DE ESTADO, VOLVÉ A CARGARLA');
    return limpiarTarea(await cargarTarea(dataSource, t.id));
  });

  /** Nadie verifica (ni rechaza) su propia tarea ni una que marcó él (mismo criterio que DR). */
  async function validarVerificador(t: FtTarea, user: Usuario): Promise<void> {
    const propio = await buscarFuncionarioDeUsuario(dataSource, user.id);
    if ((propio && propio.id === t.funcionario.id) || t.hechaPor?.id === user.id) {
      fail('PROPIA', 'NO PODÉS VERIFICAR NI RECHAZAR TU PROPIA TAREA');
    }
    const plantilla = t.plantilla
      ? await dataSource.getRepository(FtPlantillaTarea).findOne({ where: { id: t.plantilla.id } as any, relations: ['verificadorCargo'] })
      : null;
    const cargoVerif = plantilla?.verificadorCargo;
    if (cargoVerif) {
      const codes = await permisosDe(user);
      if (!codes.has(P.CONFIGURAR)) {
        const cargo = propio ? await cargoVigente(dataSource, propio.id, fechaLocalHoy()) : null;
        if (!cargo || cargo.id !== cargoVerif.id) fail('FORBIDDEN', `ESTA TAREA LA VERIFICA EL CARGO ${cargoVerif.nombre}`);
      }
    }
  }

  ipcMain.handle('ft-tarea-verificar', async (_e, tareaId: number, nota?: string) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.VERIFICAR);
    const t = await cargarTarea(dataSource, Number(tareaId));
    await validarVerificador(t, user);
    if (t.estado !== FtEstadoTarea.HECHA) fail('ESTADO_INVALIDO', `SOLO SE VERIFICA UNA TAREA HECHA (ESTÁ ${t.estado})`);
    const set: any = { estado: FtEstadoTarea.VERIFICADA, verificadaPor: { id: user.id }, verificadaEn: ahoraFt() };
    const n = up(nota);
    if (n) set.nota = t.nota ? `${t.nota} | VERIFICACIÓN: ${n}` : `VERIFICACIÓN: ${n}`;
    const r = await dataSource.createQueryBuilder().update(FtTarea).set(set)
      .where('id = :id', { id: t.id }).andWhere('estado = :h', { h: FtEstadoTarea.HECHA }).execute();
    if (!r.affected) fail('ESTADO_INVALIDO', 'LA TAREA CAMBIÓ DE ESTADO, VOLVÉ A CARGARLA');
    return limpiarTarea(await cargarTarea(dataSource, t.id));
  });

  /** Rechazar una tarea HECHA (queda RECHAZADA y la persona la puede rehacer). Motivo obligatorio. */
  ipcMain.handle('ft-tarea-rechazar', async (_e, tareaId: number, motivo: string) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.VERIFICAR);
    const motivoUp = up(motivo);
    if (!motivoUp) fail('VALIDACION', 'ESCRIBÍ EL MOTIVO DEL RECHAZO');
    const t = await cargarTarea(dataSource, Number(tareaId));
    await validarVerificador(t, user);
    if (t.estado !== FtEstadoTarea.HECHA) fail('ESTADO_INVALIDO', `SOLO SE RECHAZA UNA TAREA HECHA (ESTÁ ${t.estado})`);
    const r = await dataSource.createQueryBuilder().update(FtTarea)
      .set({
        estado: FtEstadoTarea.RECHAZADA,
        verificadaPor: { id: user.id },
        verificadaEn: ahoraFt(),
        nota: t.nota ? `${t.nota} | RECHAZO: ${motivoUp}` : `RECHAZO: ${motivoUp}`,
      } as any)
      .where('id = :id', { id: t.id }).andWhere('estado = :h', { h: FtEstadoTarea.HECHA }).execute();
    if (!r.affected) fail('ESTADO_INVALIDO', 'LA TAREA CAMBIÓ DE ESTADO, VOLVÉ A CARGARLA');
    return limpiarTarea(await cargarTarea(dataSource, t.id));
  });

  /**
   * Tarea manual para un funcionario. data: { funcionarioId, titulo?, plantillaId?, fecha? (def. hoy),
   * inicio? (def. ahora), vence? | duracionMin? (def. 60), critica?, peso?, items?: string[] }.
   * Con plantilla toma título/ítems de ella; `evento_ref` único para no chocar con la del motor.
   */
  ipcMain.handle('ft-tarea-crear-manual', async (_e, data: any) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.VERIFICAR);
    const funcId = idDe(data, 'funcionario');
    if (!funcId) fail('VALIDACION', 'FALTA EL FUNCIONARIO');
    const plantillaId = idDe(data, 'plantilla');
    const fecha = diaOpcional(data?.fecha, 'fecha') ?? fechaLocalHoy();
    const inicio = data?.inicio ? new Date(data.inicio) : ahoraFt();
    if (isNaN(inicio.getTime())) fail('VALIDACION', 'INICIO INVÁLIDO');
    const vence = data?.vence ? new Date(data.vence) : sumarMinutos(inicio, entero(data?.duracionMin, 'duración', 1, 7 * 24 * 60, 60));
    if (isNaN(vence.getTime()) || vence.getTime() <= inicio.getTime()) fail('VALIDACION', 'EL VENCIMIENTO TIENE QUE SER POSTERIOR AL INICIO');

    const id = await dataSource.transaction(async (m) => {
      await existe(m, Funcionario, funcId, 'FUNCIONARIO');
      const plantilla = plantillaId
        ? await m.getRepository(FtPlantillaTarea).findOne({ where: { id: plantillaId } as any, relations: ['items'] })
        : null;
      if (plantillaId && !plantilla) fail('NO_ENCONTRADO', 'PLANTILLA NO ENCONTRADA');
      const titulo = up(data?.titulo) ?? plantilla?.titulo ?? null;
      if (!titulo) fail('VALIDACION', 'EL TÍTULO ES OBLIGATORIO');
      const repo = m.getRepository(FtTarea);
      const t = repo.create({
        plantilla: plantilla ? ({ id: plantilla.id } as any) : null,
        funcionario: { id: funcId } as any,
        fecha,
        inicio,
        vence,
        estado: FtEstadoTarea.PENDIENTE,
        titulo,
        critica: data?.critica === undefined ? !!plantilla?.critica : !!data.critica,
        peso: entero(data?.peso, 'peso', 0, 1000, plantilla ? Number(plantilla.peso) || 0 : 1),
        origen: FtOrigenTarea.MANUAL,
        eventoRef: plantilla ? `MANUAL:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` : '',
      } as any) as unknown as FtTarea;
      await setEntityUserTracking(dataSource, t, user.id, false);
      const g = await repo.save(t);
      const textos: { texto: string; itemId: number | null }[] = Array.isArray(data?.items) && data.items.length
        ? data.items.map((x: any) => ({ texto: up(typeof x === 'string' ? x : x?.texto) ?? '', itemId: null }))
        : plantilla?.tipo === FtTipoTarea.CHECKLIST
          ? [...(plantilla.items ?? [])].sort((a, b) => (a.orden - b.orden) || (a.id - b.id)).map((i) => ({ texto: i.texto, itemId: i.id }))
          : [];
      for (const x of textos) {
        if (!x.texto) fail('VALIDACION', 'HAY UN ÍTEM SIN TEXTO');
        await m.getRepository(FtTareaItem).save(m.getRepository(FtTareaItem).create({
          tarea: { id: g.id } as any, item: x.itemId ? ({ id: x.itemId } as any) : null, texto: x.texto, hecho: false,
        } as any));
      }
      return g.id;
    });
    return limpiarTarea(await cargarTarea(dataSource, id));
  });
}

