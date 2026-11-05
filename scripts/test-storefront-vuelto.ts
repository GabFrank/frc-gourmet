/**
 * Tienda (storefront, F8): conversión de la moneda del menú y sugerencias de «Vuelto para».
 * La conversión tiene que dar lo mismo que valida el servidor (`totalEnMoneda`).
 *
 * Uso: npm run test:storefront-vuelto
 */
import { convertir, formatear, sugerenciasVuelto } from '../projects/storefront/src/app/core/moneda-tienda';
import { totalEnMoneda } from '../electron/utils/pago-pedido.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const gs = { simbolo: '₲', decimales: 0, principal: true, cotizacion: 1 };
const usd = { simbolo: 'US$', decimales: 2, principal: false, cotizacion: 6000 };
const brl = { simbolo: 'R$', decimales: 2, principal: false, cotizacion: 1175 };

console.log('\n[1] Conversión');
ok(convertir(45000, gs) === 45000 && convertir(45000, usd) === 7.5, '₲ 45.000 = ₲ 45.000 = US$ 7,50');
ok(convertir(45001, usd) === 7.51, 'se redondea hacia arriba (nunca muestra menos de lo que cuesta)');
for (const [v, m] of [[45000, usd], [45001, usd], [12345, brl], [99999, brl]] as const) {
  ok(convertir(v, m) === totalEnMoneda(v, m.cotizacion, m.decimales), `igual al servidor: ${v} → ${m.simbolo}`, [convertir(v, m), totalEnMoneda(v, m.cotizacion, m.decimales)]);
}
ok(formatear(7.5, usd) === 'US$ 7,50' && formatear(45000, gs) === '₲ 45.000', 'formato con los decimales de cada moneda', [formatear(7.5, usd), formatear(45000, gs)]);

console.log('\n[2] Sugerencias de vuelto');
const billGs = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const s45 = sugerenciasVuelto(45000, billGs);
ok(s45.every((v) => v > 45000) && s45.includes(50000) && s45.includes(100000), 'total ₲ 45.000 → incluye 50.000 y 100.000, todas mayores', s45);
ok(JSON.stringify(s45) === JSON.stringify([...s45].sort((a, b) => a - b)) && new Set(s45).size === s45.length && s45.length <= 4, 'ordenadas, sin repetidos, hasta 4', s45);
const s50 = sugerenciasVuelto(50000, billGs);
ok(!s50.includes(50000) && s50.every((v) => v > 50000), 'total exacto a un billete → nunca el mismo monto', s50);
ok(JSON.stringify(sugerenciasVuelto(7.5, [1, 5, 10, 20, 50, 100])) === '[8,10,20,50]', 'US$ 7,50 → 8, 10, 20, 50', sugerenciasVuelto(7.5, [1, 5, 10, 20, 50, 100]));
const s250 = sugerenciasVuelto(250000, billGs);
ok(s250.length > 0 && s250.every((v) => v > 250000), 'total mayor al billete más grande → sumas redondas', s250);
ok(sugerenciasVuelto(45000, []).length === 0, 'sin billetes cargados → sin sugerencias');

console.log(`\n[storefront-vuelto] RESULTADO: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
