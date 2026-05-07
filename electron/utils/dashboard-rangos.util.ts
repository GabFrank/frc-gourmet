export type Rango =
  | 'today'
  | 'week'
  | 'month'
  | 'last-month'
  | '3months'
  | '6months';

export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

export type Granularidad = 'hour' | 'day' | 'week' | 'month';

export interface Bucket {
  label: string;
  desde: Date;
  hasta: Date;
}

export function rangoToFechas(rango: Rango): RangoFechas {
  const now = new Date();
  const hasta = new Date(now);
  hasta.setHours(23, 59, 59, 999);
  const desde = new Date(now);
  desde.setHours(0, 0, 0, 0);

  switch (rango) {
    case 'today':
      break;
    case 'week':
      desde.setDate(desde.getDate() - 6);
      break;
    case 'month':
      desde.setDate(1);
      break;
    case 'last-month': {
      const firstThis = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      desde.setTime(new Date(firstThis.getFullYear(), firstThis.getMonth() - 1, 1, 0, 0, 0, 0).getTime());
      hasta.setTime(new Date(firstThis.getFullYear(), firstThis.getMonth(), 0, 23, 59, 59, 999).getTime());
      break;
    }
    case '3months':
      desde.setMonth(desde.getMonth() - 3);
      break;
    case '6months':
      desde.setMonth(desde.getMonth() - 6);
      break;
  }
  return { desde, hasta };
}

export function granularidadFor(rango: Rango): Granularidad {
  switch (rango) {
    case 'today':
      return 'hour';
    case 'week':
    case 'month':
    case 'last-month':
      return 'day';
    case '3months':
      return 'week';
    case '6months':
      return 'month';
  }
}

const DIAS_NOMBRE = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const MESES_NOMBRE = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function bucketsForRango(rango: Rango): Bucket[] {
  const { desde, hasta } = rangoToFechas(rango);
  const buckets: Bucket[] = [];
  const granularidad = granularidadFor(rango);

  if (granularidad === 'hour') {
    for (let h = 0; h < 24; h++) {
      const b = new Date(desde);
      b.setHours(h, 0, 0, 0);
      const e = new Date(desde);
      e.setHours(h, 59, 59, 999);
      buckets.push({
        label: `${String(h).padStart(2, '0')}h`,
        desde: b,
        hasta: e,
      });
    }
  } else if (granularidad === 'day') {
    const cur = new Date(desde);
    cur.setHours(0, 0, 0, 0);
    while (cur.getTime() <= hasta.getTime()) {
      const b = new Date(cur);
      const e = new Date(cur);
      e.setHours(23, 59, 59, 999);
      const isWeek = rango === 'week';
      buckets.push({
        label: isWeek ? DIAS_NOMBRE[b.getDay()] : `${b.getDate()}`,
        desde: b,
        hasta: e,
      });
      cur.setDate(cur.getDate() + 1);
    }
  } else if (granularidad === 'week') {
    // 12 semanas hacia atrás (3 meses)
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7 - 6);
      d.setHours(0, 0, 0, 0);
      const f = new Date(d);
      f.setDate(f.getDate() + 6);
      f.setHours(23, 59, 59, 999);
      buckets.push({ label: `S${12 - i}`, desde: d, hasta: f });
    }
  } else { // month
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      const f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      buckets.push({ label: MESES_NOMBRE[d.getMonth()], desde: d, hasta: f });
    }
  }

  return buckets;
}

const RANGO_LABELS: Record<Rango, string> = {
  today: 'hoy',
  week: 'esta semana',
  month: 'del mes',
  'last-month': 'del mes anterior',
  '3months': 'últimos 3 meses',
  '6months': 'últimos 6 meses',
};

export function rangoLabel(rango: Rango): string {
  return RANGO_LABELS[rango];
}
