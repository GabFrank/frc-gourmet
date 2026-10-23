/**
 * Disciplina y Reconocimiento (DR) — errores con puntos y puntaje diario por criterios.
 * Errores: los puntos se copian de la gravedad al registrar; anular no borra (estado ANULADO).
 * Puntaje: único por (fecha, funcionario, criterio); volver a cargar reemplaza el valor.
 * Lo propio («mis puntos») se resuelve siempre desde la sesión, nunca por parámetro.
 */
import { ipcMain } from 'electron';
import { Between, DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { DrError } from '../../src/app/database/entities/rrhh/disciplina/dr-error.entity';
import { DrErrorEstado } from '../../src/app/database/entities/rrhh/disciplina/dr-error-estado.enum';
import { DrTipoError } from '../../src/app/database/entities/rrhh/disciplina/dr-tipo-error.entity';
import { DrCriterio } from '../../src/app/database/entities/rrhh/disciplina/dr-criterio.entity';
import { DrPuntajeCriterio } from '../../src/app/database/entities/rrhh/disciplina/dr-puntaje-criterio.entity';
import { DrPremio } from '../../src/app/database/entities/rrhh/disciplina/dr-premio.entity';
import { DrResultadoPremio } from '../../src/app/database/entities/rrhh/disciplina/dr-resultado-premio.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';

const P = {
  REGISTRAR: 'RRHH_DR_REGISTRAR',
  PUNTUAR: 'RRHH_DR_PUNTUAR',
  APROBAR: 'RRHH_DR_APROBAR',
  RESULTADOS: 'RRHH_DR_RESULTADOS_VER',
  MIS_DATOS: 'RRHH_DR_MIS_DATOS',
};

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}

const up = (s: unknown): any => (typeof s === 'string' && s.trim() ? s.trim().toUpperCase() : null);

function fechaIso(f: unknown): string {
  if (f instanceof Date) return f.toISOString().slice(0, 10);
  const s = String(f ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('VALIDACION', 'FECHA INVÁLIDA (YYYY-MM-DD)');
  return s;
}

async function funcionarioDeSesion(ds: DataSource, user: Usuario): Promise<Funcionario> {
  const f = await ds.getRepository(Funcionario).findOne({ where: { usuario: { id: user.id } } as any });
  if (!f) fail('SIN_FUNCIONARIO', 'TU USUARIO NO ESTÁ VINCULADO A UN FUNCIONARIO');
  return f;
}

export function registerDisciplinaPuntosHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  /** Registra uno o varios errores (mismo tipo y fecha). Puntos = gravedad vigente al registrar. */
  ipcMain.handle('dr-registrar-error', async (_e, data: { fecha: string; tipoErrorId: number; funcionarioIds: number[]; detalle?: string }) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.REGISTRAR);
    const fecha = fechaIso(data?.fecha);
    const ids = Array.from(new Set((data?.funcionarioIds ?? []).map(Number).filter((x) => x > 0)));
    if (!ids.length) fail('VALIDACION', 'ELEGÍ AL MENOS UN FUNCIONARIO');
    return dataSource.transaction(async (m) => {
      const tipo: any = await m.getRepository(DrTipoError).findOne({ where: { id: data.tipoErrorId } as any, relations: ['gravedad'] });
      if (!tipo || tipo.activo === false) fail('NO_ENCONTRADO', 'TIPO DE ERROR NO ENCONTRADO O INACTIVO');
      const puntos = Number(tipo.gravedad?.puntos) || 0;
      const creados: any[] = [];
      for (const fid of ids) {
        const existe = await m.getRepository(Funcionario).count({ where: { id: fid } as any });
        if (!existe) fail('NO_ENCONTRADO', `FUNCIONARIO ${fid} NO ENCONTRADO`);
        const e = m.getRepository(DrError).create({
          fecha: fecha as any, funcionario: { id: fid } as any, tipoError: { id: tipo.id } as any,
          puntos, detalle: up(data.detalle), registradoPor: { id: user.id } as any, estado: DrErrorEstado.VIGENTE,
        } as any) as unknown as DrError;
        await setEntityUserTracking(dataSource, e, user.id, false);
        creados.push(await m.getRepository(DrError).save(e));
      }
      return creados.map((c) => ({ id: c.id, funcionarioId: c.funcionario.id, puntos: Number(c.puntos) }));
    });
  });

  ipcMain.handle('dr-anular-error', async (_e, errorId: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, P.APROBAR);
    if (!motivo || !String(motivo).trim()) fail('VALIDACION', 'INDICÁ EL MOTIVO DE LA ANULACIÓN');
    const res = await dataSource.getRepository(DrError).update(
      { id: errorId, estado: DrErrorEstado.VIGENTE } as any,
      { estado: DrErrorEstado.ANULADO, motivoAnulacion: up(motivo) } as any,
    );
    if (!res.affected) fail('ESTADO_INVALIDO', 'EL ERROR NO EXISTE O YA FUE ANULADO');
    return { ok: true };
  });

  ipcMain.handle('dr-get-errores', async (_e, f: { desde?: string; hasta?: string; funcionarioId?: number; estado?: string } = {}) => {
    await ensurePermission(dataSource, getCurrentUser, [P.REGISTRAR, P.APROBAR, P.RESULTADOS]);
    const where: any = {};
    if (f?.desde && f?.hasta) where.fecha = Between(fechaIso(f.desde), fechaIso(f.hasta));
    if (f?.funcionarioId) where.funcionario = { id: f.funcionarioId };
    if (f?.estado) where.estado = f.estado;
    return dataSource.getRepository(DrError).find({
      where, relations: ['funcionario', 'funcionario.persona', 'tipoError', 'tipoError.gravedad'], order: { fecha: 'DESC', id: 'DESC' } as any, take: 1000,
    });
  });

  /** Carga el puntaje del día: [{funcionarioId, criterioId, valor}]. Valida la escala del criterio. */
  ipcMain.handle('dr-puntuar', async (_e, data: { fecha: string; puntajes: { funcionarioId: number; criterioId: number; valor: number }[] }) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.PUNTUAR);
    const fecha = fechaIso(data?.fecha);
    const items = data?.puntajes ?? [];
    if (!items.length) fail('VALIDACION', 'NO HAY PUNTAJES PARA GUARDAR');
    return dataSource.transaction(async (m) => {
      const criterios = new Map<number, DrCriterio>();
      let guardados = 0;
      for (const it of items) {
        let c = criterios.get(it.criterioId);
        if (!c) {
          c = (await m.getRepository(DrCriterio).findOne({ where: { id: it.criterioId } as any })) ?? undefined;
          if (!c || (c as any).activo === false) fail('NO_ENCONTRADO', `CRITERIO ${it.criterioId} NO ENCONTRADO`);
          criterios.set(it.criterioId, c);
        }
        const valor = Number(it.valor);
        if (!Number.isInteger(valor) || valor < c.escalaMin || valor > c.escalaMax) {
          fail('VALIDACION', `VALOR FUERA DE ESCALA (${c.escalaMin}-${c.escalaMax})`);
        }
        const repo = m.getRepository(DrPuntajeCriterio);
        const prev = await repo.findOne({ where: { fecha: fecha as any, funcionario: { id: it.funcionarioId }, criterio: { id: it.criterioId } } as any });
        if (prev) {
          await repo.update({ id: prev.id } as any, { valor, auditor: { id: user.id } } as any);
        } else {
          const p = repo.create({ fecha: fecha as any, funcionario: { id: it.funcionarioId } as any, criterio: { id: it.criterioId } as any, valor, auditor: { id: user.id } as any } as any) as unknown as DrPuntajeCriterio;
          await setEntityUserTracking(dataSource, p, user.id, false);
          await repo.save(p);
        }
        guardados++;
      }
      return { ok: true, guardados };
    });
  });

  ipcMain.handle('dr-get-puntajes', async (_e, f: { premioId: number; desde: string; hasta: string }) => {
    await ensurePermission(dataSource, getCurrentUser, [P.PUNTUAR, P.APROBAR, P.RESULTADOS]);
    return dataSource.getRepository(DrPuntajeCriterio).find({
      where: { criterio: { premio: { id: f.premioId } }, fecha: Between(fechaIso(f.desde), fechaIso(f.hasta)) } as any,
      relations: ['funcionario', 'criterio'],
      order: { fecha: 'ASC' } as any,
    });
  });

  /** Lo propio: errores con puntos, puntajes y saldo del funcionario de la sesión en el rango. */
  ipcMain.handle('dr-mis-puntos', async (_e, f: { desde: string; hasta: string }) => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.MIS_DATOS);
    const func = await funcionarioDeSesion(dataSource, user);
    const rango = Between(fechaIso(f?.desde), fechaIso(f?.hasta));
    const errores = await dataSource.getRepository(DrError).find({
      where: { funcionario: { id: func.id }, fecha: rango } as any, relations: ['tipoError', 'tipoError.gravedad'], order: { fecha: 'DESC' } as any,
    });
    const puntajes = await dataSource.getRepository(DrPuntajeCriterio).find({
      where: { funcionario: { id: func.id }, fecha: rango } as any, relations: ['criterio', 'criterio.premio'], order: { fecha: 'DESC' } as any,
    });
    const premiosSaldo = await dataSource.getRepository(DrPremio).find({ where: { metodo: 'SALDO_PUNTOS', activo: true } as any });
    const descontado = errores.filter((e) => e.estado === DrErrorEstado.VIGENTE).reduce((s, e) => s + (Number(e.puntos) || 0), 0);
    return {
      errores,
      puntajes,
      saldos: premiosSaldo.map((p: any) => ({ premioId: p.id, premio: p.nombre, saldo: (Number(p.puntosIniciales) || 0) - descontado })),
    };
  });

  ipcMain.handle('dr-mis-premios', async () => {
    const user = await ensurePermission(dataSource, getCurrentUser, P.MIS_DATOS);
    const func = await funcionarioDeSesion(dataSource, user);
    return dataSource.getRepository(DrResultadoPremio).find({
      where: { funcionario: { id: func.id }, ganador: true } as any,
      relations: ['periodo', 'periodo.premio', 'moneda'],
      order: { id: 'DESC' } as any,
    });
  });
}
