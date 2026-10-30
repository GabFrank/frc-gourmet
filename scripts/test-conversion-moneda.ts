/**
 * Cotización del lado del renderer (#332): `tasaEntreMonedas`,
 * `tasaDesdeCotizacion` y `cotizacionSugerida` de
 * `src/app/shared/utils/conversion-moneda.ts`.
 *
 * El backend ya resolvía bien Gs → USD (`getCotizacionBidireccional`), pero los
 * tres diálogos que pagan en otra moneda mandan SU cotización y el backend la
 * respeta: el bug seguía vivo en la UI. Este test fija que el espejo del
 * renderer da lo mismo que el backend para las mismas filas.
 *
 * QUÉ REVERTIR PARA QUE FALLE: volver `cotizacionA` a buscar sólo la fila
 * origen → destino (Gs → USD queda en null), o multiplicar en vez de dividir
 * cuando el origen es la principal (Gs → USD da × 6.000).
 */
import {
  compraLocalVigente,
  cotizacionSugerida,
  tasaDesdeCotizacion,
  tasaEntreMonedas,
} from '../src/app/shared/utils/conversion-moneda';

let fallos = 0;
let oks = 0;
function ok(cond: boolean, msg: string, extra?: unknown): void {
  if (cond) {
    oks++;
    console.log(`  ✓ ${msg}`);
  } else {
    fallos++;
    console.log(`  ✗ ${msg}`, extra ?? '');
  }
}
const cerca = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-9;

const GS = 1;
const USD = 2;
const BRL = 3;

// USD guardado como lo guarda la UI (extranjera → principal), con una fila vieja
// del mismo par; BRL guardado en la dirección VIEJA (principal → extranjera).
const cambios = [
  { monedaOrigen: { id: USD }, monedaDestino: { id: GS }, compraLocal: 5950, activo: true, createdAt: '2026-05-15T10:00:00Z' },
  { monedaOrigen: { id: USD }, monedaDestino: { id: GS }, compraLocal: '6000.0000', activo: true, createdAt: '2026-05-18T10:00:00Z' },
  { monedaOrigen: { id: GS }, monedaDestino: { id: BRL }, compraLocal: 1200, activo: true, createdAt: '2026-05-16T10:00:00Z' },
  { monedaOrigen: { id: USD }, monedaDestino: { id: GS }, compraLocal: 9999, activo: false, createdAt: '2026-06-01T10:00:00Z' },
];

console.log('[conversion-moneda] compraLocalVigente');
ok(compraLocalVigente(cambios, USD, GS) === 6000, 'USD/Gs: la fila activa más reciente (6.000), no la inactiva ni la vieja');
ok(compraLocalVigente(cambios, GS, USD) === 6000, 'Gs/USD: la busca también en la dirección inversa');
ok(compraLocalVigente(cambios, BRL, GS) === 1200, 'BRL guardado Gs → BRL: compraLocal sigue siendo Gs por 1 BRL');
ok(compraLocalVigente([], USD, GS) === null, 'sin filas → null');

console.log('[conversion-moneda] tasaEntreMonedas (espejo de getCotizacionBidireccional)');
ok(tasaEntreMonedas(cambios, USD, GS, GS) === 6000, 'USD → Gs multiplica');
ok(cerca(tasaEntreMonedas(cambios, GS, USD, GS), 1 / 6000), 'Gs → USD divide (era × 6.000 o null)');
ok(cerca(150_000 * (tasaEntreMonedas(cambios, GS, USD, GS) ?? 0), 25), '150.000 Gs pagan 25 US$');
ok(tasaEntreMonedas(cambios, BRL, GS, GS) === 1200, 'BRL → Gs con la fila en la dirección vieja');
ok(cerca(tasaEntreMonedas(cambios, GS, BRL, GS), 1 / 1200), 'Gs → BRL con la fila en la dirección vieja');
ok(cerca(tasaEntreMonedas(cambios, USD, BRL, GS), 5), 'USD → BRL cruza por la principal (6.000 / 1.200)');
ok(tasaEntreMonedas(cambios, USD, USD, GS) === 1, 'misma moneda → 1');
ok(tasaEntreMonedas(cambios, GS, USD, null) === null, 'sin principal no se adivina');
ok(tasaEntreMonedas([{ monedaOrigen: { id: USD }, monedaDestino: { id: GS }, compraLocal: 0, activo: true }], GS, USD, GS) === null,
  'cotización en 0 → null, nunca división por cero');

console.log('[conversion-moneda] cotización tipeada por el cajero');
ok(cotizacionSugerida(cambios, GS, USD, GS) === 6000, 'Gs → USD se precarga como 1 US$ = 6.000 Gs');
ok(cotizacionSugerida(cambios, USD, GS, GS) === 6000, 'USD → Gs también 6.000');
ok(cerca(cotizacionSugerida(cambios, USD, BRL, GS), 5), 'entre dos extranjeras: factor directo');
ok(cerca(tasaDesdeCotizacion(6000, GS, USD, GS), 1 / 6000), 'lo tipeado (6.000) se pasa a tasa Gs → USD dividiendo');
ok(tasaDesdeCotizacion(6000, USD, GS, GS) === 6000, 'USD → Gs: lo tipeado es la tasa');
ok(tasaDesdeCotizacion(5, USD, BRL, GS) === 5, 'dos extranjeras: factor directo');
ok(tasaDesdeCotizacion(0, GS, USD, GS) === null, 'cotización vacía o 0 → null');
ok(tasaDesdeCotizacion(null, GS, GS, GS) === 1, 'misma moneda → 1 aunque el campo esté vacío');
// La conversión de ida y vuelta tiene que cerrar: lo sugerido, pasado a tasa,
// es la misma tasa que resuelve el backend.
for (const [o, d] of [[GS, USD], [USD, GS], [GS, BRL], [BRL, GS], [USD, BRL]]) {
  ok(cerca(tasaDesdeCotizacion(cotizacionSugerida(cambios, o, d, GS), o, d, GS), tasaEntreMonedas(cambios, o, d, GS) ?? NaN),
    `sugerida → tasa coincide con tasaEntreMonedas (${o} → ${d})`);
}

console.log(`\n[conversion-moneda] ${oks} OK, ${fallos} FALLARON`);
process.exit(fallos ? 1 : 0);
