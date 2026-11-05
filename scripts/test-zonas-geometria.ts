/**
 * Geometría de las zonas de delivery (diseñador de zonas, F7): varias áreas por zona.
 *
 *  - una zona con un área se guarda como Polygon (como siempre); con varias, MultiPolygon
 *  - abrir y volver a guardar una zona no pierde ninguna área (antes el diseñador leía
 *    sólo la primera y, al guardar, borraba las demás sin avisar)
 *  - lo que guarda el diseñador lo resuelve el servidor: un pedido en cada área cae en la zona
 *  - clic sobre un borde inserta el punto en el lado correcto (incluido el que cierra el anillo)
 *
 * Uso: npm run test:zonas-geometria
 */
import { indiceParaInsertar, parsearAreas, serializarAreas, ParLatLng } from '../src/app/pages/ventas/pedidos-online/zona-geometria';
import { puntoEnGeometria, resolverZonaPorPunto } from '../electron/utils/geo.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Dos barrios separados (Salto del Guairá), [lat, lng].
const norte: ParLatLng[] = [[-24.05, -54.31], [-24.05, -54.30], [-24.04, -54.30], [-24.04, -54.31]];
const sur: ParLatLng[] = [[-24.08, -54.32], [-24.08, -54.31], [-24.07, -54.31]];

console.log('\n[1] Guardar');
const uno = serializarAreas([norte]);
ok(JSON.parse(uno!).type === 'Polygon', 'un área → Polygon', uno);
const anillo = JSON.parse(uno!).coordinates[0];
ok(anillo.length === 5 && anillo[0][0] === anillo[4][0] && anillo[0][1] === anillo[4][1] && anillo[0][0] === -54.31,
  'el anillo va en [lng, lat] y cierra repitiendo el primero', anillo);
const dos = serializarAreas([norte, sur]);
ok(JSON.parse(dos!).type === 'MultiPolygon' && JSON.parse(dos!).coordinates.length === 2, 'dos áreas → MultiPolygon con 2', dos);
ok(serializarAreas([norte, [[-24, -54], [-24.1, -54.1]]])!.includes('Polygon') && JSON.parse(serializarAreas([norte, [[-24, -54], [-24.1, -54.1]]])!).type === 'Polygon',
  'un área de menos de 3 puntos no cuenta como área');
ok(serializarAreas([]) === null && serializarAreas([[]]) === null, 'sin áreas completas → null');

console.log('\n[2] Abrir y volver a guardar');
const leidas = parsearAreas(dos);
ok(leidas.length === 2 && leidas[0].length === 4 && leidas[1].length === 3, 'se leen las dos áreas, sin el punto de cierre', leidas.map((a) => a.length));
ok(serializarAreas(leidas) === dos, 'abrir y guardar sin tocar da exactamente lo mismo (no se pierde ningún área)');
ok(parsearAreas(uno).length === 1, 'una zona vieja de un área se lee igual');
ok(parsearAreas('{roto').length === 0 && parsearAreas(null).length === 0
  && parsearAreas(JSON.stringify({ type: 'Point', coordinates: [1, 2] })).length === 0, 'texto inválido o no-área → sin áreas');
const feature = JSON.stringify({ type: 'Feature', geometry: JSON.parse(dos!) });
ok(parsearAreas(feature).length === 2, 'acepta Feature envolviendo la geometría');

console.log('\n[3] El servidor resuelve lo que guarda el diseñador');
ok(puntoEnGeometria(-24.045, -54.305, dos), 'un pedido en el área norte cae en la zona');
ok(puntoEnGeometria(-24.0775, -54.3125, dos), 'un pedido en el área sur cae en la zona');
ok(!puntoEnGeometria(-24.06, -54.305, dos), 'entre las dos áreas no cae');
const zona = resolverZonaPorPunto(-24.0775, -54.3125, [{ id: 7, orden: 1, poligono: dos }] as any);
ok((zona as any)?.id === 7, 'resolverZonaPorPunto encuentra la zona por su segunda área', zona);

console.log('\n[4] Clic sobre un borde');
const plano = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
ok(indiceParaInsertar(plano, { x: 50, y: 2 }) === 1, 'sobre el lado 0→1 va en la posición 1');
ok(indiceParaInsertar(plano, { x: 98, y: 50 }) === 2, 'sobre el lado 1→2 va en la posición 2');
ok(indiceParaInsertar(plano, { x: 1, y: 50 }) === 4, 'sobre el lado que cierra el anillo (3→0) va al final');
ok(indiceParaInsertar([{ x: 0, y: 0 }], { x: 5, y: 5 }) === 1, 'con un solo punto, al final');

console.log(`\n[zonas-geometria] RESULTADO: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
