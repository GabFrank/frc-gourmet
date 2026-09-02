/**
 * El aviso al abrir una segunda caja.
 *
 * Nace de un incidente real: la PC de delivery, que siempre se une a la caja de la
 * principal, abrió una segunda y nadie se enteró hasta el cierre. El backend no
 * estaba mal —valida una caja por TERMINAL, y varias cajas simultáneas son
 * legítimas— lo que faltaba era el aviso.
 *
 * Se testea la función pura porque el diálogo de Angular no entra en los ts-node.
 *
 * Uso: npm run test:caja-apertura
 */
let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

import {
  analizarCajasAbiertas,
  nombreTerminal,
  nombreAbridor,
  tiempoDesde,
} from '../src/app/shared/utils/caja-apertura.util';

const AHORA = new Date('2026-09-02T14:00:00');

function caja(over: any = {}): any {
  return {
    id: 10,
    fechaApertura: new Date('2026-09-02T08:00:00'),
    dispositivo: { id: 1, nombre: 'CAJA PRINCIPAL' },
    createdBy: { nickname: 'jperez', persona: { nombre: 'JUAN PEREZ' } },
    ...over,
  };
}

function main() {
  console.log('\n[vacío] Sin cajas abiertas no hay nada que avisar');
  const nada = analizarCajasAbiertas([], 2, AHORA);
  ok(nada.hayOtrasAbiertas === false, 'lista vacía → sin aviso');
  ok(nada.mensaje === '', 'lista vacía → mensaje vacío', nada.mensaje);
  ok(nada.terminalesOcupadas.length === 0, 'lista vacía → ninguna terminal ocupada');
  ok(analizarCajasAbiertas(null as any, 2, AHORA).hayOtrasAbiertas === false,
    'null se trata como vacío, no explota');
  ok(analizarCajasAbiertas(undefined, 2, AHORA).hayOtrasAbiertas === false,
    'undefined se trata como vacío, no explota');

  console.log('\n[el caso del incidente] Caja abierta en OTRA terminal');
  const otra = analizarCajasAbiertas([caja()], 2, AHORA);
  ok(otra.hayOtrasAbiertas === true, 'caja en terminal ajena → hay aviso');
  ok(/otra terminal/.test(otra.mensaje), 'el mensaje nombra que es otra terminal', otra.mensaje);
  ok(otra.detalle.length === 1, 'una línea de detalle por caja', otra.detalle);
  ok(/CAJA PRINCIPAL/.test(otra.detalle[0]), 'el detalle nombra la terminal', otra.detalle[0]);
  ok(/JUAN PEREZ/.test(otra.detalle[0]), 'el detalle nombra a quién la abrió', otra.detalle[0]);
  ok(/hace 6 h/.test(otra.detalle[0]), 'el detalle dice hace cuánto', otra.detalle[0]);
  ok(/Caja #10/.test(otra.detalle[0]), 'el detalle identifica la caja', otra.detalle[0]);

  console.log('\n[propia] La caja de ESTA terminal no dispara el aviso');
  // El backend ya la rechaza con un error específico; un banner acá sería ruido.
  const propia = analizarCajasAbiertas([caja({ dispositivo: { id: 2, nombre: 'DELIVERY' } })], 2, AHORA);
  ok(propia.hayOtrasAbiertas === false, 'caja en la terminal actual → sin aviso');
  ok(propia.terminalesOcupadas.includes(2),
    'pero la terminal SÍ figura como ocupada (no se puede reelegir)', propia.terminalesOcupadas);

  console.log('\n[terminales ocupadas] Es lo que filtra el desplegable');
  const varias = analizarCajasAbiertas(
    [caja({ id: 1, dispositivo: { id: 1, nombre: 'A' } }),
     caja({ id: 2, dispositivo: { id: 3, nombre: 'C' } })],
    2, AHORA,
  );
  ok(varias.terminalesOcupadas.length === 2, 'dos terminales ocupadas', varias.terminalesOcupadas);
  ok(varias.terminalesOcupadas.includes(1) && varias.terminalesOcupadas.includes(3),
    'las dos correctas', varias.terminalesOcupadas);
  ok(/2 cajas abiertas/.test(varias.mensaje), 'el mensaje pluraliza con el conteo', varias.mensaje);

  const duplicada = analizarCajasAbiertas(
    [caja({ id: 1, dispositivo: { id: 1 } }), caja({ id: 2, dispositivo: { id: 1 } })], 9, AHORA);
  ok(duplicada.terminalesOcupadas.length === 1,
    'la misma terminal dos veces se cuenta una sola', duplicada.terminalesOcupadas);

  console.log('\n[sin dispositivo] No revienta ni inventa una terminal ocupada');
  const sinDisp = analizarCajasAbiertas([caja({ dispositivo: null })], 2, AHORA);
  ok(sinDisp.hayOtrasAbiertas === true, 'caja sin dispositivo igual avisa');
  ok(sinDisp.terminalesOcupadas.length === 0,
    'una caja sin dispositivo no ocupa ninguna terminal', sinDisp.terminalesOcupadas);
  ok(/SIN IDENTIFICAR/.test(sinDisp.detalle[0]), 'el detalle lo dice en vez de mentir', sinDisp.detalle[0]);

  console.log('\n[dispositivo actual desconocido] Fail-safe: avisa de todas');
  // En standalone sin device configurado no se puede saber cuál es "la propia".
  // Avisar de más es correcto; callarse sería volver al bug.
  const sinActual = analizarCajasAbiertas([caja()], null, AHORA);
  ok(sinActual.hayOtrasAbiertas === true, 'sin dispositivo actual → avisa igual');

  console.log('\n[nombres] Fallbacks');
  ok(nombreTerminal({ dispositivo: { id: 7, nombre: null } }) === 'TERMINAL #7',
    'sin nombre cae al id');
  ok(nombreTerminal({ dispositivo: { id: 7, nombre: '  caja 2 ' } }) === 'CAJA 2',
    'el nombre se normaliza a UPPERCASE y sin espacios');
  ok(nombreAbridor({ createdBy: { nickname: 'jp', persona: null } }) === 'JP',
    'sin persona cae al nickname');
  ok(nombreAbridor({ createdBy: null }) === 'USUARIO DESCONOCIDO',
    'sin createdBy no rompe');

  console.log('\n[tiempoDesde] Redondeo y bordes');
  ok(tiempoDesde(new Date('2026-09-02T13:59:40'), AHORA) === 'recién', 'menos de un minuto → recién');
  ok(tiempoDesde(new Date('2026-09-02T13:45:00'), AHORA) === 'hace 15 min', 'minutos');
  ok(tiempoDesde(new Date('2026-09-02T12:00:00'), AHORA) === 'hace 2 h', 'horas exactas sin "0 min"');
  ok(tiempoDesde(new Date('2026-09-02T11:45:00'), AHORA) === 'hace 2 h 15 min', 'horas y minutos');
  ok(tiempoDesde(null, AHORA) === '', 'null → vacío');
  ok(tiempoDesde('no es una fecha', AHORA) === '', 'basura → vacío, no "NaN"');
  ok(tiempoDesde(new Date('2026-09-02T15:00:00'), AHORA) === '',
    'fecha futura → vacío (un "hace -60 min" es peor que nada)');
  ok(tiempoDesde('2026-09-02T13:00:00', AHORA) === 'hace 1 h',
    'acepta string además de Date (TypeORM devuelve string en SQLite)');

  console.log(`\n${failed === 0 ? '✅' : '❌'} caja-apertura: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
