/**
 * Disciplina y Reconocimiento (DR) — tablero y reporte por persona (fase 4).
 * Solo lectura y solo agregados: nunca expone votos individuales.
 * Montos que impactan en sueldo: multas = faltas APROBADAS con Penalizacion; premios = resultados APROBADOS
 * con Bono. El neto se agrupa por mes destino (el mes de liquidación donde cae).
 */
import { ipcMain } from 'electron';
import { Between, DataSource, In } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { DrFalta } from '../../src/app/database/entities/rrhh/disciplina/dr-falta.entity';
import { DrFaltaEstado, DrFaltaResultado } from '../../src/app/database/entities/rrhh/disciplina/dr-falta.enum';
import { DrError } from '../../src/app/database/entities/rrhh/disciplina/dr-error.entity';
import { DrErrorEstado } from '../../src/app/database/entities/rrhh/disciplina/dr-error-estado.enum';
import { DrPuntajeCriterio } from '../../src/app/database/entities/rrhh/disciplina/dr-puntaje-criterio.entity';
import { DrResultadoPremio } from '../../src/app/database/entities/rrhh/disciplina/dr-resultado-premio.entity';
import { DrResultadoEstado } from '../../src/app/database/entities/rrhh/disciplina/dr-resultado-estado.enum';
import { DrGrupoMiembro } from '../../src/app/database/entities/rrhh/disciplina/dr-grupo-miembro.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { normalizarFecha } from '../services/disciplina';

const PERMISOS = ['RRHH_DR_APROBAR', 'RRHH_DR_RESULTADOS_VER'];
const MAX_DIAS = 366;
const FALTAS_QUE_CUENTAN = [DrFaltaEstado.REGISTRADA, DrFaltaEstado.APELADA, DrFaltaEstado.APROBADA];

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}

const nombreDe = (f: any) => `${f?.persona?.nombre ?? ''} ${f?.persona?.apellido ?? ''}`.trim() || `#${f?.id}`;
const dos = (n: number) => String(n).padStart(2, '0');
const fechaStr = (v: any) => (v instanceof Date ? `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}` : String(v ?? '').slice(0, 10));

/** Valida el rango (fechas locales AAAA-MM-DD, desde ≤ hasta, máx. 366 días). */
export function rangoValido(desde?: string, hasta?: string): { desde: string; hasta: string } {
  if (!desde || !hasta) fail('VALIDACION', 'INDICÁ DESDE Y HASTA');
  const d = normalizarFecha(desde);
  const h = normalizarFecha(hasta);
  if (d > h) fail('VALIDACION', 'DESDE NO PUEDE SER POSTERIOR A HASTA');
  const dias = (Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1, +h.slice(8, 10)) - Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))) / 86400000;
  if (dias > MAX_DIAS) fail('VALIDACION', `EL RANGO NO PUEDE SUPERAR ${MAX_DIAS} DÍAS`);
  return { desde: d, hasta: h };
}

export function registerDisciplinaReportesHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  /** Tablero por funcionario en un rango: faltas, errores, puntaje diario, multas y premios. */
  ipcMain.handle('dr-tablero', async (_e, q: { desde: string; hasta: string; grupoId?: number | null }) => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS);
    const { desde, hasta } = rangoValido(q?.desde, q?.hasta);
    let ids: number[] | null = null;
    if (q?.grupoId) {
      const miembros = await dataSource.getRepository(DrGrupoMiembro).find({ where: { grupo: { id: q.grupoId }, activo: true } as any, relations: ['funcionario'] });
      ids = miembros.map((x) => x.funcionario.id);
      if (!ids.length) return { desde, hasta, filas: [], totales: totales([]) };
    }
    const porFunc = ids ? { funcionario: { id: In(ids) } } : {};
    const [faltas, errores, puntajes, premios] = await Promise.all([
      dataSource.getRepository(DrFalta).find({ where: { ...porFunc, fecha: Between(desde, hasta), estado: In(FALTAS_QUE_CUENTAN) } as any, relations: ['funcionario', 'funcionario.persona', 'penalizacion'] }),
      dataSource.getRepository(DrError).find({ where: { ...porFunc, fecha: Between(desde, hasta), estado: DrErrorEstado.VIGENTE } as any, relations: ['funcionario', 'funcionario.persona'] }),
      dataSource.getRepository(DrPuntajeCriterio).find({ where: { ...porFunc, fecha: Between(desde, hasta) } as any, relations: ['funcionario', 'funcionario.persona'] }),
      dataSource.getRepository(DrResultadoPremio).find({
        where: { ...porFunc, estado: DrResultadoEstado.APROBADO, periodo: { hasta: Between(desde, hasta) } } as any,
        relations: ['funcionario', 'funcionario.persona', 'periodo'],
      }),
    ]);
    const filas = new Map<number, any>();
    const fila = (f: any) => {
      if (!filas.has(f.id)) {
        filas.set(f.id, { funcionarioId: f.id, funcionario: nombreDe(f), advertencias: 0, multas: 0, faltasPendientes: 0, errores: 0, puntosErrores: 0, puntajeDiarioPromedio: null, diasPuntuados: 0, montoMultas: 0, montoPremios: 0, premiosGanados: 0, neto: 0 });
      }
      return filas.get(f.id);
    };
    for (const x of faltas as any[]) {
      const r = fila(x.funcionario);
      if (x.resultado === DrFaltaResultado.MULTA) r.multas++; else r.advertencias++;
      if (x.estado !== DrFaltaEstado.APROBADA) r.faltasPendientes++;
      else if (x.penalizacion && !x.penalizacion.anulada) r.montoMultas += Number(x.penalizacion.monto) || 0;
    }
    for (const x of errores as any[]) {
      const r = fila(x.funcionario);
      r.errores++;
      r.puntosErrores += Number(x.puntos) || 0;
    }
    const porDia = new Map<number, Map<string, number>>();
    for (const x of puntajes as any[]) {
      fila(x.funcionario);
      const m = porDia.get(x.funcionario.id) ?? new Map<string, number>();
      const dia = fechaStr(x.fecha);
      m.set(dia, (m.get(dia) ?? 0) + (Number(x.valor) || 0));
      porDia.set(x.funcionario.id, m);
    }
    for (const [id, m] of porDia) {
      const r = filas.get(id);
      const vals = [...m.values()];
      r.diasPuntuados = vals.length;
      r.puntajeDiarioPromedio = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    }
    for (const x of premios as any[]) {
      const r = fila(x.funcionario);
      if (x.ganador) r.premiosGanados++;
      r.montoPremios += Number(x.montoAprobado ?? 0) || 0;
    }
    const lista = [...filas.values()].map((r) => ({ ...r, neto: r.montoPremios - r.montoMultas }));
    lista.sort((a, b) => b.neto - a.neto || a.funcionario.localeCompare(b.funcionario));
    return { desde, hasta, filas: lista, totales: totales(lista) };
  });

  /** Detalle de una persona: hechos del rango y neto por mes destino (premios − multas). */
  ipcMain.handle('dr-reporte-persona', async (_e, q: { funcionarioId: number; desde: string; hasta: string }) => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS);
    const { desde, hasta } = rangoValido(q?.desde, q?.hasta);
    const func: any = await dataSource.getRepository(Funcionario).findOne({ where: { id: q?.funcionarioId } as any, relations: ['persona'] });
    if (!func) fail('NO_ENCONTRADO', 'FUNCIONARIO NO ENCONTRADO');
    const fid = { funcionario: { id: func.id } };
    const [faltas, errores, puntajes, premios] = await Promise.all([
      dataSource.getRepository(DrFalta).find({ where: { ...fid, fecha: Between(desde, hasta) } as any, relations: ['tipoFalta', 'penalizacion'], order: { fecha: 'ASC', id: 'ASC' } as any }),
      dataSource.getRepository(DrError).find({ where: { ...fid, fecha: Between(desde, hasta) } as any, relations: ['tipoError'], order: { fecha: 'ASC', id: 'ASC' } as any }),
      dataSource.getRepository(DrPuntajeCriterio).find({ where: { ...fid, fecha: Between(desde, hasta) } as any, relations: ['criterio'], order: { fecha: 'ASC', id: 'ASC' } as any }),
      dataSource.getRepository(DrResultadoPremio).find({ where: { ...fid, periodo: { hasta: Between(desde, hasta) } } as any, relations: ['periodo', 'periodo.premio'], order: { id: 'ASC' } as any }),
    ]);
    const neto = new Map<string, { mes: string; multas: number; premios: number; neto: number }>();
    const mes = (m: string | null | undefined) => {
      const k = m || 'SIN MES';
      if (!neto.has(k)) neto.set(k, { mes: k, multas: 0, premios: 0, neto: 0 });
      return neto.get(k)!;
    };
    const hechosFaltas = (faltas as any[]).map((x) => {
      const monto = x.estado === DrFaltaEstado.APROBADA && x.penalizacion && !x.penalizacion.anulada ? Number(x.penalizacion.monto) || 0 : 0;
      if (monto) mes(x.mesDestino).multas += monto;
      return { id: x.id, fecha: fechaStr(x.fecha), tipo: x.tipoFalta?.nombre ?? null, resultado: x.resultado, estado: x.estado, montoCalculado: Number(x.montoCalculado) || 0, montoEnSueldo: monto, mesDestino: x.mesDestino ?? null, motivo: x.motivo ?? null };
    });
    const hechosPremios = (premios as any[]).map((x) => {
      const monto = x.estado === DrResultadoEstado.APROBADO ? Number(x.montoAprobado ?? 0) || 0 : 0;
      if (monto) mes(x.mesDestino).premios += monto;
      return { id: x.id, periodoId: x.periodo?.id, premio: x.periodo?.premio?.nombre ?? null, desde: fechaStr(x.periodo?.desde), hasta: fechaStr(x.periodo?.hasta), posicion: x.posicion ?? null, ganador: !!x.ganador, puntaje: Number(x.puntaje) || 0, estado: x.estado, montoEnSueldo: monto, mesDestino: x.mesDestino ?? null };
    });
    const porDia = new Map<string, number>();
    for (const x of puntajes as any[]) porDia.set(fechaStr(x.fecha), (porDia.get(fechaStr(x.fecha)) ?? 0) + (Number(x.valor) || 0));
    const meses = [...neto.values()].map((m) => ({ ...m, neto: m.premios - m.multas })).sort((a, b) => a.mes.localeCompare(b.mes));
    return {
      funcionarioId: func.id,
      funcionario: nombreDe(func),
      desde,
      hasta,
      faltas: hechosFaltas,
      errores: (errores as any[]).map((x) => ({ id: x.id, fecha: fechaStr(x.fecha), tipo: x.tipoError?.nombre ?? null, puntos: Number(x.puntos) || 0, estado: x.estado, detalle: x.detalle ?? null })),
      puntajeDiario: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, total]) => ({ fecha, total })),
      premios: hechosPremios,
      netoPorMes: meses,
      neto: meses.reduce((a, m) => a + m.neto, 0),
    };
  });
}

function totales(filas: any[]) {
  const s = (k: string) => filas.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return { funcionarios: filas.length, advertencias: s('advertencias'), multas: s('multas'), errores: s('errores'), montoMultas: s('montoMultas'), montoPremios: s('montoPremios'), neto: s('montoPremios') - s('montoMultas') };
}
