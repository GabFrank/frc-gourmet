/**
 * Tienda (storefront, F9): funciones puras del detalle del pedido.
 *
 *  [1] Repetir / Modificar: rearmar el carrito desde un pedido contra la carta vigente
 *  [2] Compartir: texto sin datos personales y enlaces de WhatsApp / teléfono
 *  [3] Texto del pago y detalle de cada línea
 *
 * Uso: npm run test:storefront-detalle
 */
import 'reflect-metadata';
import { lineasDesdePedido } from '../projects/storefront/src/app/core/repetir-pedido';
import { numeroWa, textoCompartirPedido, urlTelefono, urlWhatsapp } from '../projects/storefront/src/app/core/compartir-pedido';
import { detallePersonalizacion, textoPagoCliente } from '../projects/storefront/src/app/pages/pedido/pedido-detalle.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const menu: any = {
  categorias: [], total: 3, publicadoEn: '',
  productos: [
    {
      id: 1, nombre: 'HAMBURGUESA', descripcion: null, tipo: 'RETAIL', iva: 10, imageUrl: 'h.jpg', categoriaId: 1, categoriaNombre: 'X',
      opciones: [
        { key: 'p10', tipo: 'PRESENTACION', label: 'SIMPLE', precio: 30000, moneda: null, presentacionId: 10 },
        { key: 'p11', tipo: 'PRESENTACION', label: 'DOBLE', precio: 45000, moneda: null, presentacionId: 11 },
      ],
      precioDesde: 30000, moneda: null,
      adicionales: [{ id: 5, nombre: 'QUESO', precio: 5000 }],
      observaciones: [{ id: 1, descripcion: 'SIN SAL' }],
    },
    {
      id: 2, nombre: 'MILANESA', descripcion: null, tipo: 'ELABORADO_CON_VARIACION', iva: 10, imageUrl: null, categoriaId: 1, categoriaNombre: 'X',
      opciones: [
        { key: 'r1', tipo: 'VARIACION', label: 'DE CARNE', precio: 40000, moneda: null, recetaId: 101 },
        { key: 'r2', tipo: 'VARIACION', label: 'DE POLLO', precio: 38000, moneda: null, recetaId: 102 },
      ],
      precioDesde: 38000, moneda: null, adicionales: [], observaciones: [],
    },
    {
      id: 3, nombre: 'PIZZA', descripcion: null, tipo: 'ELABORADO_CON_VARIACION', esPizza: true, iva: 10, imageUrl: 'p.jpg', categoriaId: 1, categoriaNombre: 'X',
      opciones: [], precioDesde: 60000, moneda: null, adicionales: [], observaciones: [],
      tamanos: [{ presentacionId: 30, nombre: 'GRANDE', orden: 1 }],
      pizzaConfig: { maxSabores: 2, estrategia: 'MAYOR_PRECIO' },
      sabores: [
        { saborId: 7, nombre: 'CALABRESA', descripcion: null, imageUrl: 'cal.jpg', precioDesde: 70000, precios: [{ presentacionId: 30, precio: 70000, recetaPresentacionId: 1, recetaId: 501 }] },
        { saborId: 8, nombre: 'MUZZA', descripcion: null, imageUrl: null, precioDesde: 60000, precios: [{ presentacionId: 30, precio: 60000, recetaPresentacionId: 2, recetaId: 502 }] },
      ],
    },
  ],
  personalizacionPorReceta: {
    '501': { quitables: [{ id: 900, nombre: 'CEBOLLA' }], cambiables: [], adicionales: [{ id: 950, nombre: 'BORDE', precio: 10000 }] },
    '502': { quitables: [], cambiables: [], adicionales: [] },
  },
};

console.log('\n[1] Repetir');
const hamb = { productoId: 1, presentacionId: 11, nombreProducto: 'HAMBURGUESA', nombrePresentacion: 'DOBLE', cantidad: 2,
  personalizacion: { opcion: { label: 'DOBLE', tipo: 'PRESENTACION', recetaId: null }, adicionales: [{ id: 5, nombre: 'QUESO', precio: 4000 }], observaciones: ['SIN SAL', 'YA NO EXISTE'], notaLibre: 'bien cocida' } };
const r1 = lineasDesdePedido([hamb], menu);
const l1: any = r1.lineas[0];
ok(r1.lineas.length === 1 && l1.opcion.presentacionId === 11 && l1.opcion.label === 'DOBLE' && l1.cantidad === 2, '1: presentación y cantidad', l1?.opcion);
ok(l1.precioUnitario === 50000, '1: precio de HOY (45.000 + queso 5.000), no el del pedido', l1?.precioUnitario);
ok(l1.adicionales.length === 1 && l1.observaciones.length === 1 && l1.observaciones[0].descripcion === 'SIN SAL' && l1.notaLibre === 'bien cocida',
  '1: adicionales, preferencias vigentes y nota', l1 && { a: l1.adicionales, o: l1.observaciones });
ok(r1.avisos.length === 1 && /YA NO EXISTE/.test(r1.avisos[0]), '1: la preferencia que ya no existe se avisa (no se pierde callada)', r1.avisos);

const mila = { productoId: 2, presentacionId: null, nombreProducto: 'MILANESA', cantidad: 1, personalizacion: { opcion: { label: 'DE POLLO', tipo: 'VARIACION', recetaId: 102 } } };
const r2 = lineasDesdePedido([mila], menu);
ok(r2.lineas[0]?.opcion.recetaId === 102 && r2.lineas[0]?.precioUnitario === 38000, '1: variación por su receta', r2.lineas[0]?.opcion);
const milaVieja = { ...mila, personalizacion: { opcion: { label: 'DE POLLO', tipo: 'VARIACION' } } };
const r2b = lineasDesdePedido([milaVieja], menu);
ok(r2b.lineas.length === 0 && r2b.faltantes[0] === 'MILANESA', '1: pedido viejo sin receta y dos variaciones → no adivina, avisa', r2b);

const pizza = { productoId: 3, presentacionId: 30, nombreProducto: 'PIZZA', nombrePresentacion: 'GRANDE', cantidad: 1, personalizacion: {
  opcion: { label: 'GRANDE · CALABRESA / MUZZA', tipo: 'PIZZA', recetaId: null },
  sabores: [
    { saborId: 7, nombre: 'CALABRESA', personalizacion: { quitados: [{ id: 900, nombre: 'CEBOLLA' }], cambios: [], adicionales: [{ id: 950, nombre: 'BORDE', precio: 10000 }] } },
    { saborId: 8, nombre: 'MUZZA' },
  ], adicionales: [], observaciones: [] } };
const r3 = lineasDesdePedido([pizza], menu);
const l3: any = r3.lineas[0];
ok(l3 && l3.opcion.saborIds.join() === '7,8' && l3.opcion.personalizacionSabores.length === 1
  && l3.opcion.personalizacionSabores[0].quitar[0].id === 900 && l3.imageUrl === 'cal.jpg', '1: pizza mitad y mitad con la personalización de cada sabor', l3?.opcion);
ok(l3?.precioUnitario === 75000, '1: pizza al mayor precio + borde × ½ (la regla del PdV)', l3?.precioUnitario);

const sinProducto = { productoId: 99, nombreProducto: 'EMPANADA', cantidad: 3, personalizacion: { opcion: { tipo: 'PRESENTACION' } } };
const adicionalViejo = { ...hamb, personalizacion: { ...hamb.personalizacion, adicionales: [{ id: 6, nombre: 'BACON' }] } };
const presentacionVieja = { ...hamb, presentacionId: 12 };
const r4 = lineasDesdePedido([hamb, sinProducto, adicionalViejo, presentacionVieja], menu);
ok(r4.lineas.length === 1 && r4.faltantes.length === 3 && r4.faltantes[0] === 'EMPANADA',
  '1: lo que ya no se vende (producto, adicional, tamaño) no vuelve y se avisa', r4.faltantes);
ok(lineasDesdePedido([{ ...hamb, productoId: undefined }], menu).lineas.length === 0, '1: sin producto en el ítem (pedido muy viejo) no rompe');

console.log('\n[2] Compartir');
const ped = { numero: 'W-0042', tipoPedido: 'DELIVERY', total: 95000, items: [{ cantidad: 2, nombreProducto: 'HAMBURGUESA', nombrePresentacion: 'DOBLE' }, { cantidad: 1, nombreProducto: 'COCA', nombrePresentacion: 'Estándar' }] };
const txt = textoCompartirPedido(ped, { comercio: 'DON FRANCO', estado: 'En camino' });
ok(/Pedido W-0042 en DON FRANCO \(delivery\)/.test(txt) && /Estado: En camino/.test(txt) && /• 2× HAMBURGUESA \(DOBLE\)/.test(txt)
  && /• 1× COCA$/m.test(txt) && /Total: ₲ 95\.000/.test(txt), '2: texto con número, comercio, estado, productos y total', txt);
const muchos = { ...ped, items: Array.from({ length: 20 }, (_, i) => ({ cantidad: 1, nombreProducto: `P${i}` })) };
ok(/y 5 más/.test(textoCompartirPedido(muchos)), '2: un pedido largo se corta (WhatsApp no recibe un testamento)');
ok(numeroWa('0981 123 456') === '595981123456' && numeroWa('981123456') === '595981123456' && numeroWa('+595 981 123456') === '595981123456'
  && numeroWa('12') === null && numeroWa('') === null, '2: número para wa.me');
ok(urlWhatsapp('hola & chau') === 'https://wa.me/?text=hola%20%26%20chau' && urlWhatsapp('x', '0981123456') === 'https://wa.me/595981123456?text=x',
  '2: enlace de WhatsApp (con y sin destinatario), texto codificado');
ok(urlTelefono('0981 123-456') === 'tel:0981123456' && urlTelefono('+595 21 123456') === 'tel:+59521123456' && urlTelefono('abc') === null,
  '2: enlace tel: sólo con dígitos');

console.log('\n[3] Pago y detalle');
const monedas = [{ id: 1, simbolo: '₲', decimales: 0, principal: true }, { id: 2, simbolo: 'US$', decimales: 2, principal: false }];
ok(textoPagoCliente({ metodoPago: 'EFECTIVO', pagoModalidad: 'AL_RECIBIR', pagoMonedaId: 2, vueltoPara: 20, tipoPedido: 'DELIVERY' }, monedas)
  === 'Efectivo al recibir · en US$ · pagás con US$ 20,00', '3: efectivo en dólares con «paga con»',
  textoPagoCliente({ metodoPago: 'EFECTIVO', pagoModalidad: 'AL_RECIBIR', pagoMonedaId: 2, vueltoPara: 20, tipoPedido: 'DELIVERY' }, monedas));
ok(textoPagoCliente({ metodoPago: 'EFECTIVO', pagoModalidad: 'AL_RECIBIR', vueltoPara: null, tipoPedido: 'PICKUP' }, monedas) === 'Efectivo al retirar · sin vuelto',
  '3: retiro en guaraníes sin vuelto');
ok(textoPagoCliente({ metodoPago: 'QR', pagoModalidad: 'AL_RECIBIR', tipoPedido: 'DELIVERY' }, monedas) === 'QR al recibir', '3: QR al recibir');
ok(textoPagoCliente({ metodoPago: 'EFECTIVO', pagoModalidad: null }, monedas) === 'Efectivo' && textoPagoCliente({ metodoPago: 'UPAY', pagoModalidad: 'ONLINE' }, monedas) === 'Tarjeta online',
  '3: pedidos anteriores a F8 y tarjeta online sólo dicen el método');
ok(detallePersonalizacion(pizza.personalizacion) === 'CALABRESA / MUZZA · CALABRESA: sin cebolla, + BORDE', '3: detalle de la pizza',
  detallePersonalizacion(pizza.personalizacion));
ok(detallePersonalizacion(hamb.personalizacion) === '+ QUESO · SIN SAL · YA NO EXISTE · "bien cocida"', '3: detalle con adicionales, preferencias y nota',
  detallePersonalizacion(hamb.personalizacion));

console.log(`\n[storefront-detalle] RESULTADO: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
