/**
 * Tienda (storefront): revalidación del carrito y flecha de volver de la barra.
 *
 *  - el carrito toma de la carta vigente el precio y también el NOMBRE (antes
 *    dejaba el nombre viejo: un ítem guardado salía con otro nombre del que se cobra)
 *  - quita lo que ya no se vende
 *  - la flecha vuelve a la carta, y desde el checkout al carrito
 *
 * Uso: npm run test:storefront-carrito
 */
import 'reflect-metadata';
import '@angular/compiler';

const mem: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => { mem[k] = String(v); },
  removeItem: (k: string) => { delete mem[k]; },
};

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const { CartService } = await import('../projects/storefront/src/app/core/cart.service');
  const { destinoAtras } = await import('../projects/storefront/src/app/core/navegacion');

  const linea = (over: any) => ({
    productoId: 1, nombreProducto: 'GASEOSA 500ML', imageUrl: null,
    opcion: { tipo: 'PRESENTACION', label: 'UNIDAD', presentacionId: 1 },
    adicionales: [], observaciones: [], notaLibre: null, cantidad: 1, precioUnitario: 10000, ...over,
  });
  mem['frc_sf_cart'] = JSON.stringify([
    { ...linea({}), uid: 'L1' },
    { ...linea({ productoId: 3, nombreProducto: 'PIZZA', opcion: { tipo: 'PIZZA', presentacionId: 9, saborIds: [1] } }), uid: 'L2' },
  ]);
  const cart = new CartService();
  const menu: any = {
    productos: [{
      id: 1, nombre: 'COCA COLA 500 ML', imageUrl: null, adicionales: [],
      opciones: [{ tipo: 'PRESENTACION', presentacionId: 1, recetaId: null, precio: 12000 }],
    }],
  };
  const r = cart.revalidar(menu);
  ok(cart.items.length === 1 && cart.items[0].nombreProducto === 'COCA COLA 500 ML', 'el carrito toma el nombre de la carta vigente', cart.items[0]?.nombreProducto);
  ok(cart.items[0].precioUnitario === 12000 && r.cambiados.length === 1, 'y el precio vigente (avisa el cambio)', r.cambiados);
  ok(r.quitados.length === 1 && r.quitados[0] === 'PIZZA', 'quita lo que ya no se vende', r.quitados);
  ok(JSON.parse(mem['frc_sf_cart'])[0].nombreProducto === 'COCA COLA 500 ML', 'lo guarda así en el navegador');

  const casos: [string, string | null][] = [
    ['/', null], ['/?mesa=abc', null], ['/producto/5', null], ['/pizza/151/3', null],
    ['/carrito', '/'], ['/checkout', '/carrito'], ['/mis-pedidos', '/'], ['/cuenta?completar=1', '/'],
    ['/login?volver=%2Fcheckout', '/'], ['/pago/PO-000001', '/'],
  ];
  for (const [url, esperado] of casos) ok(destinoAtras(url) === esperado, `flecha en ${url} → ${esperado ?? '(sin flecha)'}`, destinoAtras(url));

  console.log(`\n[storefront] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error('[storefront] FATAL:', e); process.exit(1); });
