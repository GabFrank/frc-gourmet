/**
 * Disciplina y Reconocimiento (DR) — cálculo y aprobación de premios.
 * Calcular deja dr_resultado_premio en PROPUESTO (o DESIERTO); aprobar crea un Bono «[DR] …»
 * por ganador (vínculo único dr_resultado_premio.bono_id, UPDATE condicional sobre el estado).
 * Métodos: VOTACION (agregados del período cerrado), CRITERIOS (Σ puntajes del período) y
 * SALDO_PUNTOS (puntos iniciales − Σ errores VIGENTES del período, tipos del grupo del premio o globales).
 */
import { ipcMain } from 'electron';
import { marcarBorradorDesactualizado, funcionarioIdDeUsuario } from './disciplina.handler';
import { Between, DataSource, IsNull } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Bono } from '../../src/app/database/entities/rrhh/bono.entity';
import { BonoTipo } from '../../src/app/database/entities/rrhh/bono-tipo.enum';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { ConfiguracionRrhh } from '../../src/app/database/entities/rrhh/configuracion-rrhh.entity';
import { DrPeriodo } from '../../src/app/database/entities/rrhh/disciplina/dr-periodo.entity';
import { DrPeriodoEstado } from '../../src/app/database/entities/rrhh/disciplina/dr-periodo-estado.enum';
import { DrGrupoMiembro } from '../../src/app/database/entities/rrhh/disciplina/dr-grupo-miembro.entity';
import { DrParticipacion } from '../../src/app/database/entities/rrhh/disciplina/dr-participacion.entity';
import { DrVotoAgregado } from '../../src/app/database/entities/rrhh/disciplina/dr-voto-agregado.entity';
import { DrResultadoPremio } from '../../src/app/database/entities/rrhh/disciplina/dr-resultado-premio.entity';
import { DrPuntajeCriterio } from '../../src/app/database/entities/rrhh/disciplina/dr-puntaje-criterio.entity';
import { DrError } from '../../src/app/database/entities/rrhh/disciplina/dr-error.entity';
import { DrResultadoEstado } from '../../src/app/database/entities/rrhh/disciplina/dr-resultado-estado.enum';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { PREFIJO_DR } from '../utils/disciplina-proteccion';
import {
  calcularVotacion,
  calcularCriterios,
  calcularSaldoPuntos,
  resolverPremio,
  mesDestino,
  validarMoneda,
  DisciplinaError,
  MIN_VOTANTES_DEFAULT,
  ReglaEmpate,
} from '../services/disciplina';

const APROBAR = 'RRHH_DR_APROBAR';

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}

/** El enum de la entidad dice MONTO_COMPLETO_CADA_UNO; el motor, MONTO_COMPLETO_CU. */
function reglaMotor(r: string): ReglaEmpate {
  return r === 'MONTO_COMPLETO_CADA_UNO' ? 'MONTO_COMPLETO_CU' : (r as ReglaEmpate);
}

const nombreDe = (f: any) => `${f?.persona?.nombre ?? ''} ${f?.persona?.apellido ?? ''}`.trim() || `#${f?.id}`;

export function registerDisciplinaPremiosHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  ipcMain.handle('dr-calcular-premio', async (_e, periodoId: number) => {
    await ensurePermission(dataSource, getCurrentUser, APROBAR);
    return dataSource.transaction(async (m) => {
      const periodo: any = await m.getRepository(DrPeriodo).findOne({
        where: { id: periodoId } as any,
        relations: ['premio', 'premio.moneda', 'premio.grupo', 'premio.encuesta', 'premio.encuesta.grupo', 'encuesta'],
      });
      if (!periodo?.premio) fail('NO_ENCONTRADO', 'EL PERÍODO NO TIENE PREMIO');
      if (periodo.estado !== DrPeriodoEstado.CERRADO) fail('ESTADO_INVALIDO', 'EL PREMIO SE CALCULA CON EL PERÍODO CERRADO');
      const premio = periodo.premio;
      const ya = await m.getRepository(DrResultadoPremio).count({ where: { periodo: { id: periodoId }, estado: DrResultadoEstado.APROBADO } as any });
      if (ya) fail('ESTADO_INVALIDO', 'EL PREMIO YA FUE APROBADO');

      const grupoId = premio.grupo?.id ?? premio.encuesta?.grupo?.id;
      if (!grupoId) fail('CONFIGURACION', 'EL PREMIO NO TIENE GRUPO');
      const miembros = await m.getRepository(DrGrupoMiembro).find({
        where: { grupo: { id: grupoId }, activo: true } as any,
        relations: ['funcionario', 'funcionario.persona'],
      });
      const funcionarios = miembros.map((x) => ({ id: x.funcionario.id, nombre: nombreDe(x.funcionario) }));
      const desde = String(periodo.desde).slice(0, 10);
      const hastaP = String(periodo.hasta).slice(0, 10);
      let puntajes;
      let cantidadVotantes: number | null = null;
      let minVotantes: number | null = null;
      if (premio.metodo === 'VOTACION') {
        const agregados = await m.getRepository(DrVotoAgregado).find({ where: { periodo: { id: periodoId } } as any, relations: ['evaluado', 'pregunta'] });
        puntajes = calcularVotacion(funcionarios, agregados.map((a: any) => ({
          evaluadoId: a.evaluado.id, tipoPregunta: a.pregunta.tipo,
          sumaPonderada: Number(a.sumaPonderada) || 0, sumaPesos: Number(a.sumaPesos) || 0,
          cantidad: Number(a.cantidad) || 0, conteoSi: Number(a.conteoSi) || 0, conteoNo: Number(a.conteoNo) || 0,
        })));
        cantidadVotantes = await m.getRepository(DrParticipacion).count({ where: { periodo: { id: periodoId } } as any });
        const cfg = await m.getRepository(ConfiguracionRrhh).findOne({ where: { clave: 'DR_VOTACION_MIN_VOTANTES' } as any });
        minVotantes = Number(cfg?.valor) > 0 ? Number(cfg!.valor) : MIN_VOTANTES_DEFAULT;
      } else if (premio.metodo === 'CRITERIOS') {
        const filas: any[] = await m.getRepository(DrPuntajeCriterio).find({
          where: { criterio: { premio: { id: premio.id } }, fecha: Between(desde, hastaP) } as any, relations: ['funcionario'],
        });
        puntajes = calcularCriterios(funcionarios, filas.map((f) => ({ funcionarioId: f.funcionario.id, valor: Number(f.valor) || 0 })));
      } else if (premio.metodo === 'SALDO_PUNTOS') {
        const errores: any[] = await m.getRepository(DrError).find({
          where: { fecha: Between(desde, hastaP) } as any, relations: ['funcionario', 'tipoError', 'tipoError.grupo'],
        });
        const delGrupo = errores.filter((e) => !e.tipoError?.grupo || e.tipoError.grupo.id === grupoId);
        puntajes = calcularSaldoPuntos(funcionarios, Number(premio.puntosIniciales) || 0,
          delGrupo.map((e) => ({ funcionarioId: e.funcionario.id, puntos: Number(e.puntos) || 0, estado: e.estado })));
      } else {
        fail('CONFIGURACION', `MÉTODO ${premio.metodo} DESCONOCIDO`);
      }
      let r;
      try {
        r = resolverPremio({ metodo: premio.metodo, monto: Number(premio.monto) || 0, reglaEmpate: reglaMotor(premio.reglaEmpate), puntajes, cantidadVotantes: cantidadVotantes ?? undefined, minVotantes: minVotantes ?? undefined });
      } catch (e) {
        if (e instanceof DisciplinaError) fail((e as any).codigo, e.message);
        throw e;
      }
      // Recalcular reemplaza la propuesta anterior (nunca una aprobada: se valida arriba).
      await m.getRepository(DrResultadoPremio).delete({ periodo: { id: periodoId } } as any);
      // Anonimato: con menos votantes que el mínimo no se guarda ni se devuelve el puntaje por persona
      // (con 1 o 2 votantes el puntaje revelaría el voto de cada uno).
      const ocultar = premio.metodo === 'VOTACION' && cantidadVotantes != null && minVotantes != null && cantidadVotantes < minVotantes;
      if (ocultar) r.ranking = r.ranking.map((f: any) => ({ ...f, puntaje: 0, posicion: null as any }));
      for (const f of r.ranking) {
        await m.getRepository(DrResultadoPremio).save(m.getRepository(DrResultadoPremio).create({
          periodo: { id: periodoId }, funcionario: { id: f.funcionarioId }, puntaje: f.puntaje, posicion: f.posicion,
          ganador: f.ganador, montoPropuesto: f.montoPropuesto, moneda: premio.moneda ? { id: premio.moneda.id } : null,
          estado: r.estado === 'DESIERTO' ? DrResultadoEstado.DESIERTO : DrResultadoEstado.PROPUESTO,
        } as any));
      }
      return { estado: r.estado, motivoDesierto: r.motivoDesierto ?? null, ranking: r.ranking, cantidadVotantes, minVotantes };
    });
  });

  /** Ranking guardado de un período (fase 4, pantalla D4 de cierre). */
  ipcMain.handle('dr-get-resultados-premio', async (_e, periodoId: number) => {
    await ensurePermission(dataSource, getCurrentUser, [APROBAR, 'RRHH_DR_RESULTADOS_VER']);
    const filas: any[] = await dataSource.getRepository(DrResultadoPremio).find({
      where: { periodo: { id: periodoId } } as any,
      relations: ['funcionario', 'funcionario.persona', 'moneda', 'bono', 'aprobadoPor'],
      order: { posicion: 'ASC', id: 'ASC' } as any,
    });
    return filas.map((f) => ({
      id: f.id,
      funcionarioId: f.funcionario?.id,
      funcionario: nombreDe(f.funcionario),
      puntaje: Number(f.puntaje) || 0,
      posicion: f.posicion ?? null,
      ganador: !!f.ganador,
      montoPropuesto: Number(f.montoPropuesto) || 0,
      montoAprobado: f.montoAprobado == null ? null : Number(f.montoAprobado),
      monedaId: f.moneda?.id ?? null,
      estado: f.estado,
      bonoId: f.bono?.id ?? null,
      mesDestino: f.mesDestino ?? null,
      observacion: f.observacion ?? null,
    }));
  });

  /**
   * Ajuste manual antes de aprobar (fase 4): monto a pagar y/o ganador. Sirve para un premio
   * DESIERTO (empate con regla DESIERTO o sin mínimo de votantes) o para corregir el monto.
   * Nunca sobre un período con resultados APROBADOS. Queda registrado quién ajustó.
   */
  ipcMain.handle('dr-ajustar-resultado-premio', async (_e, d: { periodoId: number; resultadoId: number; montoAprobado?: number | null; ganador?: boolean }) => {
    const user = await ensurePermission(dataSource, getCurrentUser, APROBAR);
    return dataSource.transaction(async (m) => {
      const repo = m.getRepository(DrResultadoPremio);
      const fila: any = await repo.findOne({ where: { id: d?.resultadoId, periodo: { id: d?.periodoId } } as any, relations: ['periodo', 'periodo.premio', 'funcionario'] });
      if (!fila) fail('NO_ENCONTRADO', 'RESULTADO NO ENCONTRADO');
      if (fila.estado === DrResultadoEstado.APROBADO) fail('ESTADO_INVALIDO', 'EL PREMIO YA FUE APROBADO');
      if (fila.periodo?.estado !== DrPeriodoEstado.CERRADO) fail('ESTADO_INVALIDO', 'SOLO SE AJUSTA UN PERÍODO CERRADO Y SIN APROBAR');
      const aprobadas = await repo.count({ where: { periodo: { id: d.periodoId }, estado: DrResultadoEstado.APROBADO } as any });
      if (aprobadas) fail('ESTADO_INVALIDO', 'EL PREMIO YA FUE APROBADO');
      const propioAj = await funcionarioIdDeUsuario(m, user.id);
      if (propioAj && fila.funcionario?.id === propioAj) fail('AUTO_RESOLUCION', 'NO PODÉS AJUSTAR TU PROPIO RESULTADO');
      if (d.ganador === true && fila.estado !== DrResultadoEstado.DESIERTO) {
        fail('VALIDACION', 'EL GANADOR SE ELIGE A MANO SOLO CUANDO EL PREMIO QUEDÓ DESIERTO');
      }
      const cambios: any = {};
      if (d.montoAprobado !== undefined) {
        if (d.montoAprobado !== null && (!Number.isFinite(Number(d.montoAprobado)) || Number(d.montoAprobado) < 0)) {
          fail('VALIDACION', 'EL MONTO TIENE QUE SER UN NÚMERO MAYOR O IGUAL A CERO');
        }
        cambios.montoAprobado = d.montoAprobado === null ? null : Math.round(Number(d.montoAprobado) * 100) / 100;
      }
      if (d.ganador !== undefined) {
        cambios.ganador = !!d.ganador;
        if (d.ganador && !(Number(fila.montoPropuesto) > 0) && cambios.montoAprobado == null && fila.montoAprobado == null) {
          cambios.montoPropuesto = Number(fila.periodo?.premio?.monto) || 0;
        }
      }
      if (!Object.keys(cambios).length) fail('VALIDACION', 'NADA PARA AJUSTAR');
      const quien = `${user.nickname ?? user.id}`.toUpperCase();
      cambios.observacion = `AJUSTE MANUAL POR ${quien} ${new Date().toISOString().slice(0, 16)}`;
      const res = await repo.update({ id: fila.id, estado: fila.estado } as any, cambios);
      if (!res.affected) fail('ESTADO_INVALIDO', 'EL RESULTADO CAMBIÓ MIENTRAS SE AJUSTABA');
      // Un premio desierto con ganador elegido a mano pasa a PROPUESTO para poder aprobarse.
      if (fila.estado === DrResultadoEstado.DESIERTO && d.ganador) {
        const desiertas = await repo.find({ where: { periodo: { id: d.periodoId }, estado: DrResultadoEstado.DESIERTO } as any });
        if (desiertas.length) await repo.update(desiertas.map((x: any) => x.id), { estado: DrResultadoEstado.PROPUESTO } as any);
      }
      return { ok: true };
    });
  });

  /** Aprueba los ganadores propuestos: Bono [DR] por cada uno en el mes de liquidación abierto. */
  ipcMain.handle('dr-aprobar-premio', async (_e, periodoId: number) => {
    const user = await ensurePermission(dataSource, getCurrentUser, APROBAR);
    return dataSource.transaction(async (m) => {
      const periodo: any = await m.getRepository(DrPeriodo).findOne({ where: { id: periodoId } as any, relations: ['premio'] });
      if (!periodo?.premio) fail('NO_ENCONTRADO', 'EL PERÍODO NO TIENE PREMIO');
      if (periodo.estado !== DrPeriodoEstado.CERRADO) fail('ESTADO_INVALIDO', 'EL PREMIO SE APRUEBA CON EL PERÍODO CERRADO Y SIN APROBAR');
      const ganadores: any[] = await m.getRepository(DrResultadoPremio).find({
        where: { periodo: { id: periodoId }, ganador: true, estado: DrResultadoEstado.PROPUESTO } as any,
        relations: ['funcionario', 'funcionario.monedaSalario', 'moneda'],
      });
      if (!ganadores.length) fail('ESTADO_INVALIDO', 'NO HAY GANADORES PROPUESTOS PARA APROBAR');
      const propio = await funcionarioIdDeUsuario(m, user.id);
      if (propio && ganadores.some((g) => g.funcionario?.id === propio)) {
        fail('AUTO_RESOLUCION', 'ESTÁS ENTRE LOS GANADORES: EL PREMIO LO APRUEBA OTRO APROBADOR');
      }
      const bonos: number[] = [];
      for (const g of ganadores) {
        const liqs = await m.getRepository(LiquidacionSueldo).find({ where: { funcionario: { id: g.funcionario.id } } as any });
        const estados: any = {};
        for (const l of liqs) if ((l.estado as string) !== 'ANULADA') estados[l.periodo] = l.estado;
        const hasta = String(periodo.hasta).slice(0, 10);
        let mes: string;
        try {
          if (g.moneda) validarMoneda(g.moneda.id, g.funcionario.monedaSalario?.id);
          mes = mesDestino(hasta, estados);
        } catch (e) {
          if (e instanceof DisciplinaError) fail((e as any).codigo, e.message);
          throw e;
        }
        const monto = Number(g.montoAprobado ?? g.montoPropuesto) || 0;
        const bono = m.getRepository(Bono).create({
          funcionario: { id: g.funcionario.id } as any,
          tipo: BonoTipo.DESEMPENIO,
          monto,
          fecha: (mes === hasta.slice(0, 7) ? hasta : `${mes}-01`) as any,
          motivo: `${PREFIJO_DR} ${periodo.premio.nombre} (PERÍODO ${periodo.id})`.toUpperCase(),
          autorizadoPor: { id: user.id } as any,
          esRecurrente: false,
          anulado: false,
        } as any) as unknown as Bono;
        await setEntityUserTracking(dataSource, bono, user.id, false);
        const guardado = await m.getRepository(Bono).save(bono);
        const res = await m.getRepository(DrResultadoPremio).update(
          { id: g.id, estado: DrResultadoEstado.PROPUESTO, ganador: true, montoAprobado: g.montoAprobado == null ? IsNull() : g.montoAprobado } as any,
          { estado: DrResultadoEstado.APROBADO, montoAprobado: monto, bono: { id: guardado.id }, mesDestino: mes, aprobadoPor: { id: user.id }, aprobadoEn: new Date() } as any,
        );
        if (!res.affected) fail('ESTADO_INVALIDO', 'EL RESULTADO CAMBIÓ MIENTRAS SE APROBABA');
        await marcarBorradorDesactualizado(m, g.funcionario.id, mes, `PREMIO PERÍODO ${periodo.id} APROBADO`);
        bonos.push(guardado.id);
      }
      await m.getRepository(DrPeriodo).update({ id: periodoId } as any, { estado: DrPeriodoEstado.APROBADO, aprobadoPor: { id: user.id }, aprobadoEn: new Date() } as any);
      return { ok: true, bonos };
    });
  });
}

