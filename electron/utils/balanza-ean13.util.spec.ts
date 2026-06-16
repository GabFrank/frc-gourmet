/**
 * Tests de lógica pura del parser EAN-13 de balanza. Autónomo. Correr con:
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","target":"es2020","esModuleInterop":true,"ignoreDeprecations":"6.0"}' \
 *   npx ts-node --transpile-only --skip-project electron/utils/balanza-ean13.util.spec.ts
 */
import {
  esEtiquetaBalanza,
  parseEtiquetaBalanza,
} from '../../src/app/shared/utils/balanza-ean13.util';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

// Etiqueta: prefijo 2, producto 001234, peso 01500 g, verificador 7
const etiqueta = '2001234015007';

check('detecta etiqueta de balanza', esEtiquetaBalanza(etiqueta) === true);
check('no es etiqueta: corta', esEtiquetaBalanza('12345') === false);
check('no es etiqueta: prefijo distinto', esEtiquetaBalanza('7001234015007') === false);
check('no es etiqueta: con letras', esEtiquetaBalanza('2001234ABC007') === false);

const r = parseEtiquetaBalanza(etiqueta);
check('parsea no-null', r !== null);
check('código producto = 001234', r?.codigoProducto === '001234');
check('valor embebido = 1500', r?.valorEmbebido === 1500);
check('peso en gramos = 1500 (factor 1)', r?.pesoGramos === 1500);
check('precio undefined en modo peso', r?.precio === undefined);

// Modo precio
const rp = parseEtiquetaBalanza(etiqueta, { modo: 'PRECIO' });
check('modo precio: precio = 1500', rp?.precio === 1500);
check('modo precio: pesoGramos undefined', rp?.pesoGramos === undefined);

// Factor de peso (etiqueta codifica peso en decagramos → factor 10)
const rf = parseEtiquetaBalanza(etiqueta, { factorPeso: 10 });
check('factor peso 10 → 15000 g', rf?.pesoGramos === 15000);

// Prefijo configurable
check('prefijo custom 9', esEtiquetaBalanza('9001234015007', { prefijo: '9' }) === true);
check('parse null si prefijo no coincide', parseEtiquetaBalanza('2001234015007', { prefijo: '9' }) === null);

console.log(`\nbalanza-ean13.util: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
