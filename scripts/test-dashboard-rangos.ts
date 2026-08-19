/**
 * Unit: rangos y buckets compartidos de los dashboards.
 *
 * Valida `rangoToFechas` y `bucketsForRango` de forma determinística — sin base
 * de datos. Cubre en particular:
 *  - que los bordes sean día completo (00:00:00.000 → 23:59:59.999);
 *  - que `3months` / `6months` NO desborden de mes (31/05 − 3 meses = 28/02, no
 *    el 03/03 que devuelve `setMonth` a secas);
 *  - que los buckets sean contiguos, sin huecos ni solapes;
 *  - que `last-month` cubra el mes calendario anterior completo, incluso cuando
 *    ese mes tiene más días que el actual.
 *
 * Uso: npm run test:dashboard-rangos
 */
import { rangoToFechas, bucketsForRango, RANGOS, RANGO_LABEL, Rango } from '../src/app/shared/utils/dashboard-rangos.util';

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
    ok(hms(hasta) === '23:59:59.999', 'hasta cierra a las 23:59:59.999', hms(hasta));
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

  // ── 3months / 6months · sin desborde de mes ──
  console.log('\n[C] 3months y 6months · el 31 de mayo NO debe desbordar a marzo');
  {
    const now = new Date(2026, 4, 31, 10, 0, 0); // 31 May 2026
    const t = rangoToFechas('3months', now);
    // setMonth(mes-3) daría 2026-03-03 (febrero no tiene 31). Debe recortar a 28/02.
    ok(ymd(t.desde) === '2026-02-28', '3months.desde = 28 Feb (recortado, no 3 Mar)', ymd(t.desde));
    const s = rangoToFechas('6months', now);
    ok(ymd(s.desde) === '2025-11-30', '6months.desde = 30 Nov (recortado, no 1 Dic)', ymd(s.desde));
  }
  {
    // Caso sin desborde: el día existe en el mes destino, se conserva.
    const now = new Date(2026, 6, 15, 10, 0, 0);
    ok(ymd(rangoToFechas('3months', now).desde) === '2026-04-15', '3months desde 15 Jul = 15 Abr', ymd(rangoToFechas('3months', now).desde));
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

  // ── cobertura: todo rango tiene label de UI ──
  console.log('\n[H] cada rango tiene su label de UI');
  {
    for (const rango of RANGOS) {
      const label = RANGO_LABEL[rango as Rango];
      ok(typeof label === 'string' && label.length > 0, `${rango} → "${label}"`);
    }
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} DASHBOARD RANGOS: ${passed} OK, ${failed} fallos.\n`);
  if (failed > 0) process.exit(1);
}

main();
