/** Modelos ligeros del storefront (DTOs de /pub, no reusa entities TypeORM). */

export interface MenuMoneda {
  id: number;
  denominacion: string | null;
  simbolo: string | null;
  decimales?: number;
}

/** Una opción de precio del producto (presentación, receta, variación o combo). */
export interface MenuOpcion {
  key: string;
  tipo: 'PRESENTACION' | 'RECETA' | 'VARIACION' | 'COMBO';
  label: string;
  precio: number;
  moneda: MenuMoneda | null;
  presentacionId?: number;
  recetaId?: number;
}

export interface MenuAdicional {
  id: number;
  nombre: string;
  precio: number;
}

/** Pizza: un tamaño ofertado. */
export interface MenuTamano {
  presentacionId: number;
  nombre: string;
  orden: number;
}

/** Pizza: precio de un sabor para un tamaño. */
export interface MenuSaborPrecio {
  presentacionId: number;
  precio: number;
  recetaPresentacionId: number;
}

/** Pizza: un sabor con sus precios por tamaño. */
export interface MenuSaborPizza {
  saborId: number;
  nombre: string;
  descripcion: string | null;
  imageUrl: string | null;
  precios: MenuSaborPrecio[];
  precioDesde: number;
}

export interface PizzaConfig {
  maxSabores: number;
  estrategia: 'MAYOR_PRECIO' | 'PROMEDIO';
}

export interface MenuObservacion {
  id: number;
  descripcion: string;
}

export interface MenuProducto {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  esPizza?: boolean;
  iva: number;
  imageUrl: string | null;
  categoriaId: number | string;
  categoriaNombre: string;
  opciones: MenuOpcion[];
  // Pizza (ELABORADO_CON_VARIACION): estructura sabor × tamaño.
  tamanos?: MenuTamano[] | null;
  sabores?: MenuSaborPizza[] | null;
  pizzaConfig?: PizzaConfig | null;
  precioDesde: number;
  moneda: MenuMoneda | null;
  adicionales: MenuAdicional[];
  observaciones: MenuObservacion[];
}

export interface MenuCategoria {
  id: number | string;
  nombre: string;
}

export interface MenuSnapshot {
  categorias: MenuCategoria[];
  productos: MenuProducto[];
  total: number;
  publicadoEn: string;
}

export interface ZonaDelivery {
  id: number;
  nombre: string;
  tarifa: number;
  montoMinimo: number;
}

export interface CuentaCliente {
  id: number;
  telefono: string;
  telefonoVerificado: boolean;
  email: string | null;
  nombre: string | null;
  clienteId: number | null;
}

/** Opción elegida de una línea (cubre todos los tipos, incluida pizza). */
export interface CartOpcion {
  tipo: 'PRESENTACION' | 'RECETA' | 'VARIACION' | 'COMBO' | 'PIZZA';
  label: string;
  presentacionId?: number;
  recetaId?: number;
  saborIds?: number[];         // pizza: 1..maxSabores (mitad y mitad)
}

/** Ítem del carrito con su personalización. */
export interface CartItem {
  uid: string;                 // id local de la línea (permite repetir el mismo producto con distinta config)
  productoId: number;
  nombreProducto: string;
  imageUrl: string | null;
  opcion: CartOpcion;
  adicionales: MenuAdicional[];
  observaciones: MenuObservacion[];
  notaLibre: string | null;
  cantidad: number;
  precioUnitario: number;      // precio de la opción + Σ adicionales
}

export type TipoPedido = 'PICKUP' | 'DELIVERY';

export interface PedidoResumen {
  numero: string;
  estado: string;
  tipoPedido: string;
  subtotal: number;
  costoEnvio: number;
  total: number;
  direccionEntrega: string | null;
  notas: string | null;
  createdAt: string;
  items: {
    nombreProducto: string;
    nombrePresentacion: string | null;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }[];
}
