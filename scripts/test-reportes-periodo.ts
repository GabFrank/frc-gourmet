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

  console.log(`\n${failed === 0 ? '✅' : '❌'} REPORTES PERÍODO: ${passed} OK, ${failed} fallos.\n`);
  if (failed > 0) process.exit(1);
}

main();
