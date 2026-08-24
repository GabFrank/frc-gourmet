/**
 * Unit: resolución de períodos de los reportes de cierre de mes.
 *
 * Valida `resolverPeriodo` (rangos y ventanas de comparación) y `variacionPct`
 * de forma determinística — sin base de datos. Cubre en particular que:
 *  - `month` (mes-a-fecha) compara contra el mismo día del mes anterior.
 *  - `prevMonth` (mes completo) compara contra el mes calendario ANTERIOR
 *    COMPLETO, aun cuando ese mes tenga más días (regresión detectada en la
 *    revisión de código).
 *
 * Uso: npm run test:reportes-periodo
 */
import { resolverPeriodo, variacionPct } from '../electron/handlers/reportes-periodo.util';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

function main() {
  console.log('\n── resolverPeriodo ──\n');

  // ── month (mes-a-fecha) el 15/Jul/2026 ──
  console.log('[A] month (mes-a-fecha) · now = 15 Jul 2026');
  {
    const now = new Date(2026, 6, 15, 10, 0, 0); // Jul = mes 6
    const p = resolverPeriodo({ rango: 'month', comparar: true }, now);
    ok(ymd(p.actual.desde) === '2026-07-01', 'actual.desde = 1 Jul', ymd(p.actual.desde));
    ok(ymd(p.actual.hasta) === '2026-07-15', 'actual.hasta = 15 Jul (hoy)', ymd(p.actual.hasta));
    ok(p.anterior !== null && ymd(p.anterior.desde) === '2026-06-01', 'anterior.desde = 1 Jun', p.anterior && ymd(p.anterior.desde));
    ok(p.anterior !== null && ymd(p.anterior.hasta) === '2026-06-15', 'anterior.hasta = 15 Jun (mismo día)', p.anterior && ymd(p.anterior.hasta));
  }

  // ── prevMonth (mes completo) el 15/Jul/2026 → Junio (30d), previo = Mayo (31d) ──
  console.log('\n[B] prevMonth (mes completo) · now = 15 Jul 2026 → Junio; previo debe ser Mayo COMPLETO');
  {
    const now = new Date(2026, 6, 15, 10, 0, 0);
    const p = resolverPeriodo({ rango: 'prevMonth', comparar: true }, now);
    ok(ymd(p.actual.desde) === '2026-06-01', 'actual.desde = 1 Jun', ymd(p.actual.desde));
    ok(ymd(p.actual.hasta) === '2026-06-30', 'actual.hasta = 30 Jun', ymd(p.actual.hasta));
    // El bug corregido truncaba Mayo a 30 días; debe ser 31.
    ok(p.anterior !== null && ymd(p.anterior.desde) === '2026-05-01', 'anterior.desde = 1 May', p.anterior && ymd(p.anterior.desde));
    ok(p.anterior !== null && ymd(p.anterior.hasta) === '2026-05-31', 'anterior.hasta = 31 May (mes completo, no 30)', p.anterior && ymd(p.anterior.hasta));
  }

  // ── prevMonth · now = 10 Abr 2026 → Marzo (31d), previo = Febrero (28d) ──
  console.log('\n[C] prevMonth · now = 10 Abr 2026 → Marzo; previo = Febrero COMPLETO (28d)');
  {
    const now = new Date(2026, 3, 10, 10, 0, 0); // Abr = mes 3
    const p = resolverPeriodo({ rango: 'prevMonth', comparar: true }, now);
    ok(ymd(p.actual.desde) === '2026-03-01', 'actual.desde = 1 Mar', ymd(p.actual.desde));
    ok(ymd(p.actual.hasta) === '2026-03-31', 'actual.hasta = 31 Mar', ymd(p.actual.hasta));
    ok(p.anterior !== null && ymd(p.anterior.hasta) === '2026-02-28', 'anterior.hasta = 28 Feb (mes corto completo)', p.anterior && ymd(p.anterior.hasta));
    ok(p.labelAnterior === 'Feb 2026', 'labelAnterior = Feb 2026', p.labelAnterior);
  }

  // ── month el 31/Mar → comparación recorta a los días de Febrero ──
  console.log('\n[D] month · now = 31 Mar 2026 → comparación mes-a-fecha se recorta a Febrero (28d)');
  {
    const now = new Date(2026, 2, 31, 10, 0, 0); // Mar = mes 2
    const p = resolverPeriodo({ rango: 'month', comparar: true }, now);
    ok(ymd(p.actual.hasta) === '2026-03-31', 'actual.hasta = 31 Mar', ymd(p.actual.hasta));
    ok(p.anterior !== null && ymd(p.anterior.hasta) === '2026-02-28', 'anterior.hasta = 28 Feb (recorte por mes corto)', p.anterior && ymd(p.anterior.hasta));
  }

  // ── week / quarter: ventana de igual longitud inmediatamente anterior ──
  console.log('\n[E] week · ventana anterior de igual longitud');
  {
    const now = new Date(2026, 6, 15, 10, 0, 0);
    const p = resolverPeriodo({ rango: 'week', comparar: true }, now);
    ok(ymd(p.actual.desde) === '2026-07-09' && ymd(p.actual.hasta) === '2026-07-15', 'actual = 9–15 Jul (7 días)', `${ymd(p.actual.desde)}..${ymd(p.actual.hasta)}`);
    ok(p.anterior !== null && ymd(p.anterior.hasta) === '2026-07-08', 'anterior.hasta = 8 Jul (día previo)', p.anterior && ymd(p.anterior.hasta));
    ok(p.anterior !== null && ymd(p.anterior.desde) === '2026-07-02', 'anterior.desde = 2 Jul (7 días)', p.anterior && ymd(p.anterior.desde));
  }

  // ── sin comparar → anterior null ──
  console.log('\n[F] sin comparar');
  {
    const now = new Date(2026, 6, 15, 10, 0, 0);
    const p = resolverPeriodo({ rango: 'month', comparar: false }, now);
    ok(p.anterior === null, 'anterior = null', p.anterior);
    ok(p.labelAnterior === null, 'labelAnterior = null', p.labelAnterior);
  }

  // ── variacionPct ──
  console.log('\n[G] variacionPct');
  ok(variacionPct(150, 100) === 50, '+50% (150 vs 100)', variacionPct(150, 100));
  ok(variacionPct(50, 100) === -50, '-50% (50 vs 100)', variacionPct(50, 100));
  ok(variacionPct(100, 0) === null, 'null cuando base = 0', variacionPct(100, 0));


  // ── jornada comercial (B3): reportes usan el mismo ancla que dashboards ──
  console.log('\n[H] jornada comercial · inicioJornada = 7');
  {
    // 01:30 del 16/Jul todavia pertenece a la jornada del 15/Jul.
    const madrugada = new Date(2026, 6, 16, 1, 30, 0);
    const p = resolverPeriodo({ rango: 'today', comparar: false }, madrugada, 7);
    ok(ymd(p.actual.desde) === '2026-07-15', 'today madrugada arranca el dia anterior', ymd(p.actual.desde));
    ok(p.actual.desde.getHours() === 7, 'desde a las 07:00', p.actual.desde.getHours());
    ok(ymd(p.actual.hasta) === '2026-07-16', 'hasta cruza medianoche', ymd(p.actual.hasta));
    ok(p.actual.hasta.getHours() === 6 && p.actual.hasta.getMinutes() === 59,
       'hasta 06:59:59.999', `${p.actual.hasta.getHours()}:${p.actual.hasta.getMinutes()}`);
    ok(madrugada >= p.actual.desde && madrugada <= p.actual.hasta, 'la venta de la 01:30 cae dentro');
  }
  {
    // 10:00 del 16/Jul ya es jornada del 16.
    const manana = new Date(2026, 6, 16, 10, 0, 0);
    const p = resolverPeriodo({ rango: 'today', comparar: false }, manana, 7);
    ok(ymd(p.actual.desde) === '2026-07-16', 'today de manana arranca el mismo dia', ymd(p.actual.desde));
  }
  {
    // Sin jornada (0) el comportamiento historico no cambia.
    const madrugada = new Date(2026, 6, 16, 1, 30, 0);
    const p = resolverPeriodo({ rango: 'today', comparar: false }, madrugada, 0);
    ok(ymd(p.actual.desde) === '2026-07-16', 'inicioJornada=0 mantiene el dia calendario', ymd(p.actual.desde));
    ok(p.actual.desde.getHours() === 0, 'desde a las 00:00', p.actual.desde.getHours());
  }
  {
    // El mes tambien se corre: 01:30 del 1/Ago pertenece a Julio.
    const madrugada = new Date(2026, 7, 1, 1, 30, 0);
    const p = resolverPeriodo({ rango: 'month', comparar: false }, madrugada, 7);
    ok(p.actual.desde.getMonth() === 6, 'month en la madrugada del 1 sigue en el mes anterior', p.actual.desde.getMonth());
  }
  {
    // custom: las fechas elegidas por el usuario tambien respetan la ventana.
    const now = new Date(2026, 6, 20, 10, 0, 0);
    const p = resolverPeriodo({ rango: 'custom', desde: '2026-07-01', hasta: '2026-07-15', comparar: false }, now, 7);
    ok(p.actual.desde.getHours() === 7, 'custom desde a las 07:00', p.actual.desde.getHours());
    ok(ymd(p.actual.hasta) === '2026-07-16' && p.actual.hasta.getHours() === 6,
       'custom hasta llega a las 06:59 del dia siguiente', `${ymd(p.actual.hasta)} ${p.actual.hasta.getHours()}`);
  }


  // ── comparación con jornada (la que pasaba desapercibida) ──
  console.log('\n[I] ventana de comparación con jornada · inicioJornada = 7');
  {
    // Este es el DEFAULT de la pantalla: rango `month` con comparar activado.
    // La ventana `anterior` se armaba con medianoche fija mientras la `actual`
    // ya usaba la jornada: salia 24 h mas larga y el % de variacion quedaba
    // sesgado en todos los reportes.
    const now = new Date(2026, 7, 19, 14, 0, 0); // 19 Ago 2026 14:00
    const p = resolverPeriodo({ rango: 'month', comparar: true }, now, 7);
    const horas = (r: any) => (r.hasta.getTime() - r.desde.getTime()) / 3_600_000;
    ok(Math.abs(horas(p.actual) - horas(p.anterior!)) < 1,
       'actual y anterior tienen la misma longitud',
       { actual: horas(p.actual), anterior: horas(p.anterior!) });
    ok(p.anterior!.desde.getHours() === 7, 'anterior.desde arranca en el corte', p.anterior!.desde.getHours());
    ok(p.anterior!.hasta.getHours() === 6, 'anterior.hasta cierra en el corte', p.anterior!.hasta.getHours());
    ok(ymd(p.anterior!.desde) === '2026-07-01', 'anterior arranca el 1 de julio', ymd(p.anterior!.desde));
    // La jornada del 19 termina el 20 a las 06:59, asi que leer el dia de corte
    // de `hasta` daba 20 en vez de 19.
    ok(ymd(p.anterior!.hasta) === '2026-07-20',
       'el corte es el dia 19 (su jornada cierra el 20 a las 06:59)', ymd(p.anterior!.hasta));
  }
  {
    // Con jornada 0 la comparacion es la de siempre.
    const now = new Date(2026, 7, 19, 14, 0, 0);
    const p = resolverPeriodo({ rango: 'month', comparar: true }, now, 0);
    ok(ymd(p.anterior!.desde) === '2026-07-01' && p.anterior!.desde.getHours() === 0,
       'jornada 0: anterior arranca a medianoche del 1', ymd(p.anterior!.desde));
    ok(ymd(p.anterior!.hasta) === '2026-07-19' && p.anterior!.hasta.getHours() === 23,
       'jornada 0: anterior cierra el 19 a las 23:59', ymd(p.anterior!.hasta));
  }
  {
    // prevMonth: mes completo, tambien con los limites de la jornada.
    const now = new Date(2026, 7, 19, 14, 0, 0);
    const p = resolverPeriodo({ rango: 'prevMonth', comparar: true }, now, 7);
    ok(p.anterior!.desde.getHours() === 7 && p.anterior!.hasta.getHours() === 6,
       'prevMonth: la comparacion respeta el corte',
       [p.anterior!.desde.getHours(), p.anterior!.hasta.getHours()]);
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} REPORTES PERÍODO: ${passed} OK, ${failed} fallos.\n`);
  if (failed > 0) process.exit(1);
}

main();
