/**
 * Lectura del salón: las señales del PdV que ningún proveedor de música tiene.
 *
 * Este es el diferencial del módulo. Rockbot, Soundtrack y compañía programan
 * por hora y día; ninguno sabe si el local está lleno **ahora**, porque ninguno
 * tiene el punto de venta. Nosotros sí.
 *
 * Base de la regla (Milliman; Caldwell & Hibbert 2002): tempo lento alarga la
 * estadía y el consumo; tempo rápido acelera el consumo y la rotación. Por eso:
 *
 *   salón lleno + ritmo alto  → más energía  (rotar mesas cuando hay cola)
 *   salón vacío con gente     → menos energía (retener y que consuman más)
 */
import { DataSource } from 'typeorm';
import { PdvMesa, PdvMesaEstado } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';

export interface EstadoSalon {
  mesasTotales: number;
  mesasOcupadas: number;
  ocupacionPct: number;
  /** Ventas cerradas en la última hora, por minuto. */
  ventasPorMinuto: number;
  /** Ventas de la última hora. */
  ventasUltimaHora: number;
}

export async function leerEstadoSalon(dataSource: DataSource): Promise<EstadoSalon> {
  const mesaRepo = dataSource.getRepository(PdvMesa);
  const ventaRepo = dataSource.getRepository(Venta);

  const [mesasTotales, mesasOcupadas] = await Promise.all([
    mesaRepo.count({ where: { activo: true } }),
    mesaRepo.count({ where: { activo: true, estado: PdvMesaEstado.OCUPADO } }),
  ]);

  const desde = new Date(Date.now() - 60 * 60 * 1000);
  const ventasUltimaHora = await ventaRepo
    .createQueryBuilder('v')
    .where('v.createdAt >= :desde', { desde })
    .getCount();

  return {
    mesasTotales,
    mesasOcupadas,
    ocupacionPct: mesasTotales > 0 ? (mesasOcupadas / mesasTotales) * 100 : 0,
    ventasPorMinuto: ventasUltimaHora / 60,
    ventasUltimaHora,
  };
}

/**
 * Ventas por franja horaria de las últimas N semanas. Es lo que le permite al
 * planificador saber cuándo es el pico REAL del local, no el teórico: el
 * horario que el dueño cree que es pico y el que muestran las ventas no siempre
 * coinciden.
 */
export async function ventasPorFranja(
  dataSource: DataSource,
  semanas = 4,
): Promise<Array<{ hora: number; ventas: number }>> {
  const ventaRepo = dataSource.getRepository(Venta);
  const desde = new Date();
  desde.setDate(desde.getDate() - semanas * 7);

  const ventas = await ventaRepo
    .createQueryBuilder('v')
    .select('v.createdAt', 'createdAt')
    .where('v.createdAt >= :desde', { desde })
    .getRawMany();

  // Se agrupa en JS y no con GROUP BY sobre la fecha: en SQLite las fechas se
  // guardan en UTC y en Paraguay (UTC-3) la noche caería en la hora equivocada.
  const porHora = new Map<number, number>();
  for (const v of ventas) {
    const fecha = new Date(v.createdAt);
    if (Number.isNaN(fecha.getTime())) continue;
    const h = fecha.getHours();
    porHora.set(h, (porHora.get(h) || 0) + 1);
  }

  return Array.from(porHora.entries())
    .map(([hora, ventas]) => ({ hora, ventas }))
    .sort((a, b) => a.hora - b.hora);
}
