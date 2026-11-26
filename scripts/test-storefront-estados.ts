/**
 * Tienda (storefront): cómo ve el cliente el estado de su pedido en «Mis pedidos».
 *
 * Chip, línea de ayuda y barra de pasos según el estado y cómo le llega el pedido
 * (retiro, delivery, mesa). Ningún estado muestra «Recibido», que el cliente leía
 * como «ya lo recibí».
 *
 * Uso: npm run test:storefront-estados
 */
import { vistaEstadoPedido } from '../projects/storefront/src/app/core/estado-pedido';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const marca = (v: any) => v.pasos?.map((p: any) => (p.actual ? '*' : p.hecho ? 'x' : '.')).join('') ?? null;

const ESTADOS = ['PENDIENTE_PAGO', 'RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'RECHAZADO', 'CANCELADO'];
for (const tipo of ['PICKUP', 'DELIVERY', 'MESA_QR']) {
  for (const e of ESTADOS) {
    const v = vistaEstadoPedido(e, tipo);
    ok(!!v.chip && v.chip !== e && !/recibido/i.test(v.chip), `${tipo} ${e} → «${v.chip}»`, v.chip);
  }
}

const casos: [string, string, string, string | null, string][] = [
  // estado, tipo, chip, pasos (x hecho · * actual · . pendiente), tono
  ['RECIBIDO', 'PICKUP', 'Esperando confirmación', '*...', 'espera'],
  ['EN_PREPARACION', 'PICKUP', 'En preparación', 'x*..', 'curso'],
  ['LISTO', 'PICKUP', 'Listo para retirar', 'xx*.', 'curso'],
  ['ENTREGADO', 'PICKUP', 'Retirado', 'xxxx', 'ok'],
  ['LISTO', 'DELIVERY', 'Listo, sale enseguida', 'x*..', 'curso'],
  ['EN_CAMINO', 'DELIVERY', 'En camino', 'xx*.', 'curso'],
  ['ENTREGADO', 'DELIVERY', 'Entregado', 'xxxx', 'ok'],
  ['LISTO', 'MESA_QR', 'Listo, ya te lo llevan', 'x*.', 'curso'],
  ['ENTREGADO', 'MESA_QR', 'Entregado', 'xxx', 'ok'],
  ['RECHAZADO', 'DELIVERY', 'No fue aceptado', null, 'error'],
  ['CANCELADO', 'PICKUP', 'Cancelado', null, 'error'],
  ['PENDIENTE_PAGO', 'PICKUP', 'Falta pagar', null, 'espera'],
];
for (const [estado, tipo, chip, pasos, tono] of casos) {
  const v = vistaEstadoPedido(estado, tipo);
  ok(v.chip === chip && marca(v) === pasos && v.tono === tono, `${tipo} ${estado}: «${chip}» ${pasos ?? '(sin barra)'} ${tono}`, [v.chip, marca(v), v.tono]);
}
ok(vistaEstadoPedido('RECIBIDO', 'PICKUP').ayuda === 'El local todavía no confirmó tu pedido.', 'RECIBIDO explica que falta la confirmación del local');
ok(vistaEstadoPedido('RECIBIDO', 'DELIVERY').pasos!.map((p) => p.label).join(' → ') === 'Enviado → Preparando → En camino → Entregado', 'delivery: pasos con «En camino»');
ok(vistaEstadoPedido('RECIBIDO', 'MESA_QR').pasos!.length === 3, 'mesa: tres pasos');

console.log(`\n[storefront-estados] RESULTADO: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
