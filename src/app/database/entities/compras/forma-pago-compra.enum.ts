// Forma de pago acotada para compras: solo dos opciones operativas reales.
// Se ingresa al finalizar la compra. La cuenta bancaria especifica (si aplica)
// puede dejarse en blanco al cargar y resolverse al pagar.
export enum FormaPagoCompra {
  EFECTIVO = 'EFECTIVO',
  BANCO = 'BANCO',
}
