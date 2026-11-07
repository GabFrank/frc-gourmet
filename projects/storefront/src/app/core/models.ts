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
  /** F6b: receta de este sabor × tamaño (clave de `MenuSnapshot.personalizacionPorReceta`). */
  recetaId?: number | null;
}

/** F6b: lo que se puede personalizar de una receta (sabor × tamaño). */
export interface PersonalizacionReceta {
  quitables: { id: number; nombre: string }[];
  cambiables: { id: number; nombre: string; opciones: { productoId: number; nombre: string }[] }[];
  adicionales: MenuAdicional[];
}

/** F6b: lo que el cliente eligió para un sabor. */
export interface PersonalizacionSabor {
  saborId: number;
  nombreSabor?: string;
  quitar: { id: number; nombre: string }[];
  cambios: { recetaIngredienteId: number; nombre: string; productoId: number; reemplazoNombre: string }[];
  adicionales: MenuAdicional[];
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
  /**
   * Categoría de la tienda armada a mano en «Config Tienda Online»: sus productos, en orden.
   * Un producto puede estar en varias. Sin esto, la categoría agrupa por `MenuProducto.categoriaId`.
   */
  productoIds?: number[];
}

export interface MenuSnapshot {
  categorias: MenuCategoria[];
  productos: MenuProducto[];
  total: number;
  publicadoEn: string;
  /** F6b: solo con «Personalizar sabores» prendido en la tienda. */
  personalizacionPorReceta?: Record<string, PersonalizacionReceta> | null;
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
  /** Contacto sin verificar (cuentas de Google o email). No sirve para ingresar. */
  telefonoContacto?: string | null;
  email: string | null;
  nombre: string | null;
}

/** Opción elegida de una línea (cubre todos los tipos, incluida pizza). */
export interface CartOpcion {
  tipo: 'PRESENTACION' | 'RECETA' | 'VARIACION' | 'COMBO' | 'PIZZA';
  label: string;
  presentacionId?: number;
  recetaId?: number;
  saborIds?: number[];         // pizza: 1..maxSabores (mitad y mitad)
  personalizacionSabores?: PersonalizacionSabor[]; // F6b: sacar / cambiar / adicionales por sabor
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

export type TipoPedido = 'PICKUP' | 'DELIVERY' | 'MESA_QR';

/** Contexto de una mesa resuelto por su token QR (op pública `mesa.get`). */
export interface MesaCtx {
  mesaId: number;
  numero: number;
  habilitada: boolean;
  permiteMesa: boolean;
  nombreComercio?: string | null;
}

export interface PedidoResumen {
  numero: string;
  estado: string;
  tipoPedido: string;
  subtotal: number;
  costoEnvio: number;
  total: number;
  direccionEntrega: string | null;
  notas: string | null;
  motivoRechazo?: string | null;
  /** F4: pago con tarjeta (uPay). */
  metodoPago?: string;
  estadoPago?: string | null;
  pagoMonto?: number | null;
  createdAt: string;
  /** F9: solicitud de cancelación y acciones disponibles (las decide el servidor). */
  cancelacionSolicitadaEn?: string | null;
  cancelacionMotivo?: string | null;
  cancelacionRespuesta?: string | null;
  acciones?: { solicitarCancelacion: boolean; modificar: boolean; repetir: boolean; compartir: boolean };
  /** F8: cómo dijo que iba a pagar. */
  pagoModalidad?: string | null;
  pagoMonedaId?: number | null;
  vueltoPara?: number | null;
  pagoObservacion?: string | null;
  fechaAceptado?: string | null;
  fechaListo?: string | null;
  fechaEntregado?: string | null;
  items: {
    productoId?: number;
    presentacionId?: number | null;
    nombreProducto: string;
    nombrePresentacion: string | null;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    personalizacion?: any;
  }[];
}
