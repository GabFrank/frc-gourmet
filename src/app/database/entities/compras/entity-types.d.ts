/**
 * Type declarations to avoid circular dependencies in entity relationships
 */

import { BaseModel } from '../base.entity';
import { Moneda } from '../financiero/moneda.entity';
import { Caja } from '../financiero/caja.entity';
import { PagoEstado, CompraEstado } from './estado.enum';
import { Producto } from '../productos/producto.entity';
import { Ingrediente } from '../productos/ingrediente.entity';
import { Presentacion } from '../productos/presentacion.entity';
import { Persona } from '../personas/persona.entity';

// Forward declarations to avoid circular dependencies
export interface ICompra extends BaseModel {
  estado: CompraEstado;
  total: number;
  isRecepcionMercaderia: boolean;
  activo: boolean;
  proveedor?: IProveedor;
  pago?: IPago;
  moneda: Moneda;
  detalles: ICompraDetalle[];
}

export interface ICompraDetalle extends BaseModel {
  cantidad: number;
  valor: number;
  activo: boolean;
  compra: ICompra;
  producto?: Producto;
  ingrediente?: Ingrediente;
  presentacion?: Presentacion;
}

export interface IProveedor extends BaseModel {
  nombre: string;
  razon_social?: string | null;
  ruc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  activo: boolean;
  persona?: Persona | null;
  compras: ICompra[];
  proveedorProductos: IProveedorProducto[];
}

export interface IProveedorProducto extends BaseModel {
  activo: boolean;
  proveedor: IProveedor;
  producto?: Producto;
  ingrediente?: Ingrediente;
  compra?: ICompra;
}

// Declare the PagoDetalle interface for proper type checking
export interface IPagoDetalle extends BaseModel {
  valor: number;
  activo: boolean;
  pago: IPago;
  moneda: Moneda;
}

// Declare the Pago interface for proper type checking
export interface IPago extends BaseModel {
  estado: PagoEstado;
  activo: boolean;
  caja: Caja;
  detalles: IPagoDetalle[];
  compras: ICompra[];
}
