/**
 * Unit: rangos y buckets compartidos de los dashboards.
 *
 * Valida `rangoToFechas` y `bucketsForRango` de forma determinística — sin base
 * de datos. Cubre en particular:
 *  - que los bordes sean día completo (00:00:00.000 → 23:59:59.999);
 *  - que los buckets sean contiguos, sin huecos ni solapes;
 *  - que `last-month` cubra el mes calendario anterior completo, incluso cuando
 *    ese mes tiene más días que el actual;
 *  - que `rangoToFechas` sea EXACTAMENTE la unión de `bucketsForRango`, para
 *    todo rango. Esto es lo que garantiza que el total de la card cierre con la
 *    suma de las barras del chart; cuando cada función tenía su propia
 *    aritmética, `3months` y `6months` discrepaban en días.
 *
 * Uso: npm run test:dashboard-rangos
 */
import {
  anclaJornada, rangoToFechas, bucketsForRango, RANGOS, RANGO_LABEL, Rango } from '../src/app/shared/utils/dashboard-rangos.util';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}
function hms(d: Date): string {
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}:${`${d.getSeconds()}`.padStart(2, '0')}.${`${d.getMilliseconds()}`.padStart(3, '0')}`;
}

function main() {
  console.log('\n── rangoToFechas ──\n');

  // ── today · 15 Jul 2026 ──
  console.log('[A] today · now = 15 Jul 2026 14:30');
  {
    const now = new Date(2026, 6, 15, 14, 30, 0);
    const { desde, hasta } = rangoToFechas('today', now);
    ok(ymd(desde) === '2026-07-15', 'desde = 15 Jul', ymd(desde));
    ok(ymd(hasta) === '2026-07-15', 'hasta = 15 Jul', ymd(hasta));
    ok(hms(desde) === '00:00:00.000', 'desde arranca a las 00:00:00.000', hms(desde));
    // 'today' grafica por hora, asi que la ventana llega hasta el final de la
    // hora en curso, no hasta medianoche: es la union de sus buckets.
    ok(hms(hasta) === '14:59:59.999', 'hasta cierra al final de la hora actual', hms(hasta));
  }

  // ── week / month · ventanas móviles ──
  console.log('\n[B] week y month · ventanas móviles (hoy incluido)');
  {
    const now = new Date(2026, 6, 15, 14, 30, 0);
    const w = rangoToFechas('week', now);
    ok(ymd(w.desde) === '2026-07-09', 'week.desde = 9 Jul (7 días contando hoy)', ymd(w.desde));
    ok(ymd(w.hasta) === '2026-07-15', 'week.hasta = 15 Jul', ymd(w.hasta));
    const m = rangoToFechas('month', now);
    ok(ymd(m.desde) === '2026-06-16', 'month.desde = 16 Jun (30 días contando hoy)', ymd(m.desde));
  }

  // ── 3months / 6months · ventanas derivadas de los buckets ──
  console.log('\n[C] 3months y 6months · la ventana es la de sus buckets');
  {
    const now = new Date(2026, 6, 15, 14, 30, 0); // 15 Jul 2026
    // 12 semanas terminando hoy = 84 días contando hoy.
    const t = rangoToFechas('3months', now);
    ok(ymd(t.desde) === '2026-04-23', '3months.desde = 23 Abr (12 semanas atrás)', ymd(t.desde));
    ok(ymd(t.hasta) === '2026-07-15', '3months.hasta = 15 Jul (hoy)', ymd(t.hasta));
    // 6 meses calendario, el actual incluido y completo.
    const s = rangoToFechas('6months', now);
    ok(ymd(s.desde) === '2026-02-01', '6months.desde = 1 Feb (mes calendario)', ymd(s.desde));
    ok(ymd(s.hasta) === '2026-07-31', '6months.hasta = 31 Jul (fin del mes actual)', ymd(s.hasta));
  }
  {
    // Fin de mes: al ser meses calendario, el día de hoy no desborda nada.
    const now = new Date(2026, 4, 31, 10, 0, 0); // 31 May 2026
    ok(ymd(rangoToFechas('6months', now).desde) === '2025-12-01', '6months desde 31 May = 1 Dic 2025', ymd(rangoToFechas('6months', now).desde));
  }

  // ── last-month · mes calendario anterior completo ──
  console.log('\n[D] last-month · mes calendario anterior COMPLETO');
  {
    // Estamos en Julio (31d); el mes anterior es Junio (30d).
    const now = new Date(2026, 6, 15, 10, 0, 0);
    const p = rangoToFechas('last-month', now);
    ok(ymd(p.desde) === '2026-06-01', 'desde = 1 Jun', ymd(p.desde));
    ok(ymd(p.hasta) === '2026-06-30', 'hasta = 30 Jun', ymd(p.hasta));
  }
  {
    // Estamos en Marzo (31d) de un año NO bisiesto; el anterior es Febrero (28d).
    const now = new Date(2026, 2, 31, 10, 0, 0);
    const p = rangoToFechas('last-month', now);
    ok(ymd(p.desde) === '2026-02-01', 'desde = 1 Feb', ymd(p.desde));
    ok(ymd(p.hasta) === '2026-02-28', 'hasta = 28 Feb (no bisiesto)', ymd(p.hasta));
  }
  {
    // Enero → el mes anterior cruza de año.
    const now = new Date(2026, 0, 10, 10, 0, 0);
    const p = rangoToFechas('last-month', now);
    ok(ymd(p.desde) === '2025-12-01', 'desde = 1 Dic 2025 (cruza de año)', ymd(p.desde));
    ok(ymd(p.hasta) === '2025-12-31', 'hasta = 31 Dic 2025', ymd(p.hasta));
  }

  console.log('\n── bucketsForRango ──\n');

  // ── cantidad y label por rango ──
  console.log('[E] cantidad de buckets y labels');
  {
    const now = new Date(2026, 6, 15, 14, 30, 0); // miércoles 15 Jul 2026, 14:30
    const hoy = bucketsForRango('today', now);
    ok(hoy.length === 15, 'today = 15 buckets (00h..14h)', hoy.length);
    ok(hoy[0].label === '00h' && hoy[14].label === '14h', 'labels horarios 00h..14h', [hoy[0].label, hoy[14].label]);

    const week = bucketsForRango('week', now);
    ok(week.length === 7, 'week = 7 buckets', week.length);
    ok(week[6].label === 'Mie', 'último bucket de week = hoy (Mie)', week[6].label);

    const month = bucketsForRango('month', now);
    ok(month.length === 30, 'month = 30 buckets', month.length);
    ok(month[29].label === '15', 'último bucket de month = día 15', month[29].label);

    const lastMonth = bucketsForRango('last-month', now);
    ok(lastMonth.length === 30, 'last-month = 30 buckets (Junio)', lastMonth.length);

    const tres = bucketsForRango('3months', now);
    ok(tres.length === 12, '3months = 12 buckets semanales', tres.length);
    ok(tres[11].label === 'S12', 'último bucket de 3months = S12', tres[11].label);

    const seis = bucketsForRango('6months', now);
    ok(seis.length === 6, '6months = 6 buckets mensuales', seis.length);
    ok(seis[5].label === 'Jul', 'último bucket de 6months = Jul (mes actual)', seis[5].label);
    ok(seis[0].label === 'Feb', 'primer bucket de 6months = Feb', seis[0].label);
  }

  // ── contigüidad: sin huecos ni solapes ──
  console.log('\n[F] los buckets son contiguos (sin huecos ni solapes)');
  {
    const now = new Date(2026, 6, 15, 14, 30, 0);
    for (const rango of RANGOS) {
      const bs = bucketsForRango(rango, now);
      let contiguo = true;
      let ordenado = true;
      for (let i = 0; i < bs.length; i++) {
        if (bs[i].hasta.getTime() <= bs[i].desde.getTime()) ordenado = false;
        if (i > 0 && bs[i].desde.getTime() - bs[i - 1].hasta.getTime() !== 1) contiguo = false;
      }
      ok(ordenado, `${rango}: cada bucket tiene desde < hasta`);
      ok(contiguo, `${rango}: bucket[i].desde = bucket[i-1].hasta + 1ms`);
    }
  }

  // ── el último bucket cierra en/después de hoy ──
  console.log('\n[G] el último bucket llega hasta hoy (salvo last-month, que es pasado)');
  {
    const now = new Date(2026, 6, 15, 14, 30, 0);
    for (const rango of RANGOS) {
      if (rango === 'last-month') continue;
      const bs = bucketsForRango(rango, now);
      const ultimo = bs[bs.length - 1];
      ok(ultimo.hasta.getTime() >= now.getTime(), `${rango}: el último bucket incluye el momento actual`, ymd(ultimo.hasta));
    }
    const lm = bucketsForRango('last-month', now);
    ok(lm[lm.length - 1].hasta.getTime() < now.getTime(), 'last-month: el último bucket es anterior a hoy');
  }

  // ── el invariante que ata card y chart ──
  console.log('\n[H] rangoToFechas === union de bucketsForRango (para TODO rango)');
  {
    // Si esto se rompe, el total de la card deja de cerrar con la suma de las
    // barras del chart: son la misma ventana consultada por dos caminos.
    for (const now of [
      new Date(2026, 6, 15, 14, 30, 0),  // mitad de mes
      new Date(2026, 4, 31, 23, 59, 0),  // ultimo dia de un mes de 31
      new Date(2026, 0, 1, 0, 30, 0),    // primer dia del año
      new Date(2024, 1, 29, 12, 0, 0),   // 29 de febrero (bisiesto)
    ]) {
      for (const rango of RANGOS) {
        const f = rangoToFechas(rango, now);
        const bs = bucketsForRango(rango, now);
        const igualDesde = f.desde.getTime() === bs[0].desde.getTime();
        const igualHasta = f.hasta.getTime() === bs[bs.length - 1].hasta.getTime();
        ok(igualDesde && igualHasta, `${ymd(now)} · ${rango}: la ventana coincide con sus buckets`,
          { fechas: [ymd(f.desde), ymd(f.hasta)], buckets: [ymd(bs[0].desde), ymd(bs[bs.length - 1].hasta)] });
      }
    }
  }

  // ── cobertura: todo rango tiene label de UI ──
  console.log('\n[I] cada rango tiene su label de UI');
  {
    for (const rango of RANGOS) {
      const label = RANGO_LABEL[rango as Rango];
      ok(typeof label === 'string' && label.length > 0, `${rango} → "${label}"`);
    }
  }
  // ═══════════════ JORNADA COMERCIAL ═══════════════
  // Los turnos noche cruzan las 00:00 y llegan hasta las 02:00. Con corte a las
  // 07:00 la jornada del dia D va de D 07:00 a D+1 06:59:59.999.
  //
  // El invariante union(buckets)==rango NO detecta un ancla equivocada: las dos
  // funciones seguirian coincidiendo entre si, sobre una ventana mal ubicada.
  // Por eso estos casos miran la ventana, no la coherencia interna.
  console.log('\n[jornada] Ancla: antes del corte, la jornada viva es la de AYER');
  {
    const H = 7;
    // Martes 15 a las 03:00 -> la jornada en curso arranco el LUNES 14 a las 07:00
    const madrugada = new Date(2026, 6, 15, 3, 0, 0);
    const a = anclaJornada(madrugada, H);
    ok(a.getDate() === 14, 'ancla a las 03:00 apunta al dia anterior', a.getDate());

    const despues = new Date(2026, 6, 15, 9, 0, 0);
    ok(anclaJornada(despues, H).getDate() === 15, 'ancla a las 09:00 apunta a hoy');

    // Borde exacto: 07:00:00.000 ya es la jornada nueva
    ok(anclaJornada(new Date(2026, 6, 15, 7, 0, 0, 0), H).getDate() === 15, 'las 07:00 en punto ya es hoy');
    ok(anclaJornada(new Date(2026, 6, 15, 6, 59, 59, 999), H).getDate() === 14, 'las 06:59:59.999 siguen siendo ayer');

    ok(anclaJornada(madrugada, 0).getDate() === 15, 'con corte 0 el ancla es el dia calendario');
  }

  console.log('\n[jornada] today: los buckets CRUZAN la medianoche');
  {
    const H = 7;
    // 03:00 del martes: la jornada arranco ayer 07:00 -> 21 horas transcurridas
    const b = bucketsForRango('today', new Date(2026, 6, 15, 3, 30, 0), H);
    ok(b.length === 21, 'a las 03:30 hay 21 tramos (07h de ayer .. 03h de hoy)', b.length);
    ok(b[0].label === '07h', 'el primero es 07h', b[0].label);
    ok(b[0].desde.getDate() === 14, 'y cae en el dia ANTERIOR', b[0].desde.getDate());
    ok(b[b.length - 1].label === '03h', 'el ultimo es 03h', b[b.length - 1].label);
    ok(b[b.length - 1].desde.getDate() === 15, 'y cae en el dia de hoy');
    // El bug que esto ataja: iterar 0..now.getHours() daria 7..3 = ningun bucket
    ok(b.length > 0, 'NO queda vacio (el bug de iterar 7..3)');

    const r = rangoToFechas('today', new Date(2026, 6, 15, 3, 30, 0), H);
    ok(r.desde.getDate() === 14 && r.desde.getHours() === 7, 'el rango arranca ayer 07:00');
  }

  console.log('\n[jornada] La ventana de un dia dura 24h exactas');
  {
    const H = 7;
    const r = rangoToFechas('week', new Date(2026, 6, 15, 10, 0, 0), H);
    const b = bucketsForRango('week', new Date(2026, 6, 15, 10, 0, 0), H);
    ok(b[0].desde.getHours() === 7, 'cada dia arranca a las 07:00', b[0].desde.getHours());
    ok(b[0].hasta.getHours() === 6 && b[0].hasta.getMinutes() === 59, 'y termina 06:59', b[0].hasta.getHours());
    const dur = b[0].hasta.getTime() - b[0].desde.getTime();
    ok(dur === 24 * 3600 * 1000 - 1, 'la jornada dura 24h menos 1ms', dur);
    ok(r.desde.getTime() === b[0].desde.getTime(), 'invariante: el rango arranca donde el primer bucket');
  }

  console.log('\n[jornada] Antes del corte, TODOS los rangos anclan en ayer');
  {
    const H = 7;
    const madrugada = new Date(2026, 6, 1, 2, 0, 0); // 1 de julio 02:00
    for (const rango of ['week', 'month', '3months'] as const) {
      const b = bucketsForRango(rango, madrugada, H);
      const ult = b[b.length - 1];
      ok(ult.desde.getMonth() === 5, `${rango}: el ultimo bucket sigue en JUNIO`, ult.desde.getMonth());
    }
    // 6months usa getMonth() directo: a las 02:00 del 1 de julio la jornada es de junio
    const b6 = bucketsForRango('6months', madrugada, H);
    ok(b6[b6.length - 1].label === 'Jun', '6months: el ultimo mes es Junio, no Julio', b6[b6.length - 1].label);
  }

  console.log('\n[jornada] El invariante union(buckets)==rango sigue cerrando con corte');
  {
    for (const H of [0, 5, 7, 12]) {
      for (const rango of RANGOS) {
        const now = new Date(2026, 6, 15, 3, 30, 0);
        const r = rangoToFechas(rango, now, H);
        const b = bucketsForRango(rango, now, H);
        ok(r.desde.getTime() === b[0].desde.getTime() && r.hasta.getTime() === b[b.length - 1].hasta.getTime(),
          `H=${H} ${rango}: rango == union de buckets`);
      }
    }
  }

  console.log('\n[jornada] corte 0 reproduce EXACTAMENTE el dia calendario');
  {
    const now = new Date(2026, 6, 15, 14, 0, 0);
    for (const rango of RANGOS) {
      const sin = rangoToFechas(rango, now);
      const con0 = rangoToFechas(rango, now, 0);
      ok(sin.desde.getTime() === con0.desde.getTime() && sin.hasta.getTime() === con0.hasta.getTime(),
        `${rango}: sin parametro == con 0`);
    }
  }


  console.log(`\n${failed === 0 ? '✅' : '❌'} DASHBOARD RANGOS: ${passed} OK, ${failed} fallos.\n`);
  if (failed > 0) process.exit(1);
}

main();
