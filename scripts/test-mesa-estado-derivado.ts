/**
 * El color y el tooltip de una mesa en el plano del PdV.
 *
 * La regla: el COLOR responde una sola pregunta — ¿la mesa tiene cuenta propia?
 * — y el BADGE carga la otra dimensión: ¿hay comandas sentadas acá? Son dos
 * señales ortogonales. Colapsarlas en un solo bit destruye la distinción que
 * necesita el cajero: "no hay nada que cobrarle a la mesa" (verde/amarillo) vs
 * "hay cuenta de mesa Y además comandas" (naranja + badge).
 *
 * Se testea la función pura extraída del componente. La versión real vive en
 * `pdv.component.ts` (`estamparMesa`); acá se replica la tabla de decisión para
 * fijarla, porque es lógica de negocio disfrazada de CSS.
 *
 * Uso: npm run test:mesa-estado
 */
let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Se IMPORTA la función real; antes el test replicaba la matriz de decisión y
// cualquier cambio en el componente lo dejaba verde con lógica vieja.
import { derivarEstadoVisualMesa } from '../src/app/shared/utils/mesa-estado.util';

function estampar(mesa: any): { clase: string; tooltip: string } {
  return derivarEstadoVisualMesa(mesa);
}

function main() {
  console.log('\n[matriz] Las 4 combinaciones cuenta propia × comandas');

  const vacia = estampar({});
  ok(vacia.clase === 'table-active', 'vacía → verde', vacia.clase);
  ok(vacia.tooltip === 'Mesa libre', 'vacía → "Mesa libre"', vacia.tooltip);

  const soloComandas = estampar({ comandas: [{ id: 1 }] });
  ok(soloComandas.clase === 'table-solo-comandas', 'sólo comandas → amarillo', soloComandas.clase);
  ok(/Sin cuenta de mesa/.test(soloComandas.tooltip),
    'sólo comandas → el tooltip lo dice (antes mentía "Mesa disponible")', soloComandas.tooltip);

  const soloCuenta = estampar({ venta: { id: 9 } });
  ok(soloCuenta.clase === 'table-inactive', 'sólo cuenta → naranja', soloCuenta.clase);
  ok(soloCuenta.tooltip === 'Cuenta de mesa abierta', 'sólo cuenta → tooltip', soloCuenta.tooltip);

  const ambas = estampar({ venta: { id: 9 }, comandas: [{ id: 1 }, { id: 2 }] });
  ok(ambas.clase === 'table-inactive', 'cuenta + comandas → naranja (el badge desempata)', ambas.clase);
  ok(/hay 3 cuentas/.test(ambas.tooltip),
    'cuenta + comandas → avisa cuántas cuentas hay en total', ambas.tooltip);

  console.log('\n[reserva] La reserva pisa a todo lo demás');
  ok(estampar({ reservado: true }).clase === 'table-reserved', 'reservada vacía → azul');
  ok(estampar({ reservado: true, venta: { id: 1 } }).clase === 'table-reserved',
    'reservada con cuenta → azul igual');
  ok(estampar({ reservado: true, comandas: [{ id: 1 }] }).clase === 'table-reserved',
    'reservada con comandas → azul igual');

  console.log('\n[bordes] Casos que confundían');
  ok(estampar({ comandas: [] }).clase === 'table-active',
    'array de comandas vacío no es lo mismo que tener comandas');
  ok(estampar({ venta: null, comandas: [{ id: 1 }] }).clase === 'table-solo-comandas',
    'venta null explícita cuenta como sin cuenta');
  ok(/1 comanda sentada acá/.test(estampar({ comandas: [{ id: 1 }] }).tooltip),
    'singular sin "(s)" pegoteado', estampar({ comandas: [{ id: 1 }] }).tooltip);
  ok(/2 comandas sentadas acá/.test(estampar({ comandas: [{ id: 1 }, { id: 2 }] }).tooltip),
    'plural con dos', estampar({ comandas: [{ id: 1 }, { id: 2 }] }).tooltip);

  console.log('\n[regla] El color NO mira las comandas');
  // Es el corazón de la decisión: si el color derivara también de las comandas,
  // amarillo y naranja colapsarían y el cajero perdería la señal.
  ok(estampar({ comandas: [{ id: 1 }] }).clase !== estampar({ venta: { id: 1 } }).clase,
    'sólo comandas y sólo cuenta NO son el mismo color');

  console.log(`\n${failed === 0 ? '✅' : '❌'} mesa-estado: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
