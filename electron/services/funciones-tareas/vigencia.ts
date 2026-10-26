/**
 * Cargo y turno vigentes de un funcionario a una fecha (§10 A9).
 * Cargo: `HistoricoCargo` que cubre la fecha (el de `fecha_desde` más reciente); si no hay,
 * `funcionario.cargo`. Turno: `FuncionarioTurno` que cubre la fecha, solo turnos activos.
 */
import { DataSource, EntityManager } from 'typeorm';
import { Funcionario } from '../../../src/app/database/entities/rrhh/funcionario.entity';
import { HistoricoCargo } from '../../../src/app/database/entities/rrhh/historico-cargo.entity';
import { FuncionarioTurno } from '../../../src/app/database/entities/rrhh/funcionario-turno.entity';
import { Cargo } from '../../../src/app/database/entities/rrhh/cargo.entity';
import { Turno } from '../../../src/app/database/entities/rrhh/turno.entity';
import { diaDe } from './fechas';

type Db = DataSource | EntityManager;

interface ConVigencia { fechaDesde: unknown; fechaHasta?: unknown }

function cubre(r: ConVigencia, dia: string): boolean {
  const d = diaDe(r.fechaDesde);
  const h = diaDe(r.fechaHasta);
  return !!d && d <= dia && (!h || h >= dia);
}

/** De una lista de registros con vigencia, el que cubre el día (el de inicio más reciente). */
export function vigenteEn<T extends ConVigencia & { id: number }>(lista: T[], dia: string): T | null {
  let mejor: T | null = null;
  for (const r of lista) {
    if (!cubre(r, dia)) continue;
    if (!mejor) { mejor = r; continue; }
    const a = diaDe(r.fechaDesde)!;
    const b = diaDe(mejor.fechaDesde)!;
    if (a > b || (a === b && r.id > mejor.id)) mejor = r;
  }
  return mejor;
}

/** Si el funcionario trabaja ese día según ingreso/egreso y `activo`. */
export function funcionarioVigente(f: Funcionario, dia: string): boolean {
  if (!f.activo) return false;
  const ing = diaDe(f.fechaIngreso);
  const egr = diaDe(f.fechaEgreso);
  if (ing && ing > dia) return false;
  if (egr && egr < dia) return false;
  return true;
}

export function cargoVigenteDe(f: Funcionario, historicos: HistoricoCargo[], dia: string): Cargo | null {
  const h = vigenteEn(historicos as any[], dia) as HistoricoCargo | null;
  return h?.cargo ?? f.cargo ?? null;
}

export function turnoVigenteDe(asignaciones: FuncionarioTurno[], dia: string): Turno | null {
  const activas = asignaciones.filter((a) => a.turno && a.turno.activo !== false);
  const a = vigenteEn(activas as any[], dia) as FuncionarioTurno | null;
  return a?.turno ?? null;
}

export async function cargoVigente(db: Db, funcionarioId: number, dia: string): Promise<Cargo | null> {
  const f = await db.getRepository(Funcionario).findOne({ where: { id: funcionarioId } as any, relations: ['cargo'] });
  if (!f) return null;
  const hs = await db.getRepository(HistoricoCargo).find({
    where: { funcionario: { id: funcionarioId } } as any,
    relations: ['cargo'],
  });
  return cargoVigenteDe(f, hs, dia);
}

export async function turnoVigente(db: Db, funcionarioId: number, dia: string): Promise<Turno | null> {
  const as = await db.getRepository(FuncionarioTurno).find({
    where: { funcionario: { id: funcionarioId } } as any,
    relations: ['turno'],
  });
  return turnoVigenteDe(as, dia);
}
