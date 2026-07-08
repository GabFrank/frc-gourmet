/** Modelos ligeros del storefront (no reusa entities TypeORM; solo DTOs de /pub). */

export interface MenuMoneda {
  id: number;
  denominacion: string | null;
  simbolo: string | null;
}

export interface MenuPresentacion {
  id: number;
  nombre: string;
  principal: boolean;
  precio: number;
  moneda: MenuMoneda | null;
}

export interface MenuProducto {
  id: number;
  nombre: string;
  tipo: string;
  iva: number;
  imageUrl: string | null;
  categoriaId: number | string;
  categoriaNombre: string;
  presentaciones: MenuPresentacion[];
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

export interface CartItem {
  productoId: number;
  presentacionId: number;
  nombreProducto: string;
  nombrePresentacion: string;
  precioUnitario: number;
  cantidad: number;
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
