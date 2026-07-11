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

export interface MenuObservacion {
  id: number;
  descripcion: string;
}

export interface MenuProducto {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  iva: number;
  imageUrl: string | null;
  categoriaId: number | string;
  categoriaNombre: string;
  opciones: MenuOpcion[];
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

/** Ítem del carrito con su personalización. */
export interface CartItem {
  uid: string;                 // id local de la línea (permite repetir el mismo producto con distinta config)
  productoId: number;
  nombreProducto: string;
  imageUrl: string | null;
  opcion: MenuOpcion;
  adicionales: MenuAdicional[];
  observaciones: MenuObservacion[];
  notaLibre: string | null;
  cantidad: number;
  precioUnitario: number;      // opcion.precio + Σ adicionales
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
