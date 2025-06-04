import { ipcRenderer } from 'electron';

// === PRODUCT INTERFACES ===

// NEW PRODUCT ARCHITECTURE INTERFACES

export enum TipoProducto {
  RETAIL = 'RETAIL',
  ELABORADO = 'ELABORADO', 
  INGREDIENTE = 'INGREDIENTE',
  COMBO = 'COMBO',
  PACKAGING = 'PACKAGING'
}

export enum TipoUnidadMedida {
  GRAMO = 'GRAMO',
  KILOGRAMO = 'KILOGRAMO',
  MILILITRO = 'MILILITRO',
  LITRO = 'LITRO',
  UNIDAD = 'UNIDAD',
  PAQUETE = 'PAQUETE',
  CAJA = 'CAJA',
  BOLSA = 'BOLSA',
  CENTIMETRO_CUADRADO = 'CENTIMETRO_CUADRADO',
  CENTIMETRO = 'CENTIMETRO',
  METRO = 'METRO'
}

export enum CategoriaMedida {
  MASA = 'MASA',
  VOLUMEN = 'VOLUMEN',
  UNIDAD = 'UNIDAD',
  AREA = 'AREA',
  LONGITUD = 'LONGITUD'
}

export enum OrigenIngrediente {
  COMPRADO = 'COMPRADO',
  ELABORADO = 'ELABORADO'
}

export enum TipoVariacion {
  TAMAÑO = 'TAMAÑO',
  SABOR = 'SABOR',
  OTRO = 'OTRO'
}

export enum TipoReceta {
  PRODUCTO = 'PRODUCTO',
  INGREDIENTE = 'INGREDIENTE',
  PACKAGING = 'PACKAGING'
}

export enum TipoObservacion {
  SIMPLE = 'SIMPLE',
  CON_COSTO = 'CON_COSTO',
  CON_RECETA = 'CON_RECETA'
}

// Core interfaces
export interface UnidadMedida {
  id?: number;
  nombre: string;
  simbolo: string;
  tipo: TipoUnidadMedida;
  categoria: CategoriaMedida;
  factorConversionBase: number;
  esUnidadBase: boolean;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductoBase {
  id?: number;
  nombre: string;
  nombreAlternativo?: string;
  descripcion?: string;
  tipoProducto: TipoProducto;
  iva: number;
  isPesable: boolean;
  hasVencimiento: boolean;
  hasStock: boolean;
  hasVariaciones: boolean;
  requierePackaging: boolean;
  alertarVencimientoDias?: number;
  activo: boolean;
  subcategoriaId: number;
  subcategoria?: any; // Subcategoria interface
  images?: any[]; // ProductoImage interfaces
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Ingrediente {
  id?: number;
  productoBaseId: number;
  productoBase?: ProductoBase;
  origen: OrigenIngrediente;
  unidadMedidaId: number;
  unidadMedida?: UnidadMedida;
  costoPorUnidad: number;
  monedaId: number;
  moneda?: any; // Moneda interface
  porcentajeMerma: number;
  rendimiento: number;
  recetaElaboracionId?: number;
  recetaElaboracion?: any; // Receta interface
  stockActual: number;
  stockMinimo: number;
  activo: boolean;
  costoConMerma?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductoVariacion {
  id?: number;
  productoBaseId: number;
  productoBase?: ProductoBase;
  nombre: string;
  descripcion?: string;
  tipoVariacion: TipoVariacion;
  recetaId?: number;
  receta?: any; // Receta interface
  orden: number;
  maxSaboresCombinados?: number;
  imageUrl?: string;
  activo: boolean;
  presentacionesTamaño?: any[]; // ProductoPresentacion interfaces
  presentacionesSabor?: any[]; // ProductoPresentacion interfaces
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Receta {
  id?: number;
  nombre: string;
  descripcion?: string;
  instruccionesPreparacion?: string;
  tipoReceta: TipoReceta;
  productoBaseId?: number;
  productoBase?: ProductoBase;
  unidadMedidaSalidaId: number;
  unidadMedidaSalida?: UnidadMedida;
  cantidadSalida: number;
  tiempoPreparacionMinutos?: number;
  activo: boolean;
  costoCalculado: number;
  items?: RecetaItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RecetaItem {
  id?: number;
  recetaId: number;
  receta?: Receta;
  ingredienteId: number;
  ingrediente?: Ingrediente;
  cantidad: number;
  unidadMedidaId: number;
  unidadMedida?: UnidadMedida;
  orden: number;
  activo: boolean;
  costoItem?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductoPresentacion {
  id?: number;
  productoBaseId: number;
  productoBase?: ProductoBase;
  nombre: string;
  descripcion?: string;
  variacionTamañoId?: number;
  variacionTamaño?: ProductoVariacion;
  variacionSaborId?: number;
  variacionSabor?: ProductoVariacion;
  unidadMedidaId: number;
  unidadMedida?: UnidadMedida;
  cantidad: number;
  recetaId?: number;
  receta?: Receta;
  recetaPackagingId?: number;
  recetaPackaging?: Receta;
  principal: boolean;
  disponibleVenta: boolean;
  disponibleDelivery: boolean;
  activo: boolean;
  imageUrl?: string;
  precios?: any[]; // PrecioVenta interfaces
  codigos?: any[]; // Codigo interfaces
  costoTotal?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PrecioVenta {
  id?: number;
  presentacionId?: number;
  presentacion?: ProductoPresentacion;
  comboId?: number;
  combo?: any; // Combo interface
  monedaId: number;
  moneda?: any; // Moneda interface
  tipoPrecioId?: number;
  tipoPrecio?: any; // TipoPrecio interface
  valor: number;
  activo: boolean;
  principal: boolean;
  valorMonedaPrincipal?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Combo {
  id?: number;
  productoBaseId: number;
  productoBase?: ProductoBase;
  nombre: string;
  descripcion?: string;
  porcentajeDescuento: number;
  montoDescuentoFijo: number;
  fechaVigenciaInicio?: Date;
  fechaVigenciaFin?: Date;
  activo: boolean;
  items?: ComboItem[];
  precioTotal?: number;
  costoTotal?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ComboItem {
  id?: number;
  comboId: number;
  combo?: Combo;
  presentacionId: number;
  presentacion?: ProductoPresentacion;
  cantidad: number;
  esOpcional: boolean;
  orden: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Observacion {
  id?: number;
  nombre: string;
  descripcion?: string;
  tipoObservacion: TipoObservacion;
  costoAdicional: number;
  monedaId?: number;
  moneda?: any; // Moneda interface
  recetaId?: number;
  receta?: Receta;
  esObligatoria: boolean;
  permitePersonalizacion: boolean;
  orden: number;
  activo: boolean;
  costoTotal?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// === PRODUCTOS API METHODS ===

export const productosAPI = {
  // === NEW PRODUCT ARCHITECTURE METHODS ===
  
  // UnidadMedida methods
  getUnidadesMedida: (): Promise<UnidadMedida[]> => ipcRenderer.invoke('productos:getUnidadesMedida'),
  getUnidadMedida: (id: number): Promise<UnidadMedida> => ipcRenderer.invoke('productos:getUnidadMedida', id),
  createUnidadMedida: (data: Partial<UnidadMedida>): Promise<UnidadMedida> => ipcRenderer.invoke('productos:createUnidadMedida', data),
  updateUnidadMedida: (id: number, data: Partial<UnidadMedida>): Promise<UnidadMedida> => ipcRenderer.invoke('productos:updateUnidadMedida', id, data),
  deleteUnidadMedida: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteUnidadMedida', id),

  // ProductoBase methods
  getProductosBase: (): Promise<ProductoBase[]> => ipcRenderer.invoke('productos:getProductosBase'),
  getProductoBase: (id: number): Promise<ProductoBase> => ipcRenderer.invoke('productos:getProductoBase', id),
  createProductoBase: (data: Partial<ProductoBase>): Promise<ProductoBase> => ipcRenderer.invoke('productos:createProductoBase', data),
  updateProductoBase: (id: number, data: Partial<ProductoBase>): Promise<ProductoBase> => ipcRenderer.invoke('productos:updateProductoBase', id, data),
  deleteProductoBase: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteProductoBase', id),
  searchProductosBaseByDescripcion: (searchTerm: string, page: number, pageSize: number, exactMatch: boolean): Promise<{items: ProductoBase[], total: number}> => ipcRenderer.invoke('productos:searchProductosBaseByDescripcion', searchTerm, page, pageSize, exactMatch),

  // Ingrediente (new) methods
  getIngredientesNuevo: (): Promise<Ingrediente[]> => ipcRenderer.invoke('productos:getIngredientesNuevo'),
  getIngredienteNuevo: (id: number): Promise<Ingrediente> => ipcRenderer.invoke('productos:getIngredienteNuevo', id),
  createIngredienteNuevo: (data: Partial<Ingrediente>): Promise<Ingrediente> => ipcRenderer.invoke('productos:createIngredienteNuevo', data),
  updateIngredienteNuevo: (id: number, data: Partial<Ingrediente>): Promise<Ingrediente> => ipcRenderer.invoke('productos:updateIngredienteNuevo', id, data),
  deleteIngredienteNuevo: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteIngredienteNuevo', id),

  // ProductoVariacion methods
  getProductosVariaciones: (): Promise<ProductoVariacion[]> => ipcRenderer.invoke('productos:getProductosVariaciones'),
  getProductoVariacion: (id: number): Promise<ProductoVariacion> => ipcRenderer.invoke('productos:getProductoVariacion', id),
  getProductosVariacionesByProductoBase: (productoBaseId: number): Promise<ProductoVariacion[]> => ipcRenderer.invoke('productos:getProductosVariacionesByProductoBase', productoBaseId),
  createProductoVariacion: (data: Partial<ProductoVariacion>): Promise<ProductoVariacion> => ipcRenderer.invoke('productos:createProductoVariacion', data),
  updateProductoVariacion: (id: number, data: Partial<ProductoVariacion>): Promise<ProductoVariacion> => ipcRenderer.invoke('productos:updateProductoVariacion', id, data),
  deleteProductoVariacion: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteProductoVariacion', id),

  // Receta (new) methods
  getRecetasNueva: (): Promise<Receta[]> => ipcRenderer.invoke('productos:getRecetasNueva'),
  getRecetaNueva: (id: number): Promise<Receta> => ipcRenderer.invoke('productos:getRecetaNueva', id),
  createRecetaNueva: (data: Partial<Receta>): Promise<Receta> => ipcRenderer.invoke('productos:createRecetaNueva', data),
  updateRecetaNueva: (id: number, data: Partial<Receta>): Promise<Receta> => ipcRenderer.invoke('productos:updateRecetaNueva', id, data),
  deleteRecetaNueva: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteRecetaNueva', id),

  // RecetaItem (new) methods
  getRecetaItemsNueva: (recetaId: number): Promise<RecetaItem[]> => ipcRenderer.invoke('productos:getRecetaItemsNueva', recetaId),
  getRecetaItemNueva: (id: number): Promise<RecetaItem> => ipcRenderer.invoke('productos:getRecetaItemNueva', id),
  createRecetaItemNueva: (data: Partial<RecetaItem>): Promise<RecetaItem> => ipcRenderer.invoke('productos:createRecetaItemNueva', data),
  updateRecetaItemNueva: (id: number, data: Partial<RecetaItem>): Promise<RecetaItem> => ipcRenderer.invoke('productos:updateRecetaItemNueva', id, data),
  deleteRecetaItemNueva: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteRecetaItemNueva', id),

  // ProductoPresentacion methods
  getProductosPresentaciones: (): Promise<ProductoPresentacion[]> => ipcRenderer.invoke('productos:getProductosPresentaciones'),
  getProductoPresentacion: (id: number): Promise<ProductoPresentacion> => ipcRenderer.invoke('productos:getProductoPresentacion', id),
  getProductosPresentacionesByProductoBase: (productoBaseId: number): Promise<ProductoPresentacion[]> => ipcRenderer.invoke('productos:getProductosPresentacionesByProductoBase', productoBaseId),
  createProductoPresentacion: (data: Partial<ProductoPresentacion>): Promise<ProductoPresentacion> => ipcRenderer.invoke('productos:createProductoPresentacion', data),
  updateProductoPresentacion: (id: number, data: Partial<ProductoPresentacion>): Promise<ProductoPresentacion> => ipcRenderer.invoke('productos:updateProductoPresentacion', id, data),
  deleteProductoPresentacion: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteProductoPresentacion', id),

  // Combo (new) methods
  getCombosNuevo: (): Promise<Combo[]> => ipcRenderer.invoke('productos:getCombosNuevo'),
  getComboNuevo: (id: number): Promise<Combo> => ipcRenderer.invoke('productos:getComboNuevo', id),
  createComboNuevo: (data: Partial<Combo>): Promise<Combo> => ipcRenderer.invoke('productos:createComboNuevo', data),
  updateComboNuevo: (id: number, data: Partial<Combo>): Promise<Combo> => ipcRenderer.invoke('productos:updateComboNuevo', id, data),
  deleteComboNuevo: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteComboNuevo', id),

  // ComboItem (new) methods
  getComboItemsNuevo: (comboId: number): Promise<ComboItem[]> => ipcRenderer.invoke('productos:getComboItemsNuevo', comboId),
  getComboItemNuevo: (id: number): Promise<ComboItem> => ipcRenderer.invoke('productos:getComboItemNuevo', id),
  createComboItemNuevo: (data: Partial<ComboItem>): Promise<ComboItem> => ipcRenderer.invoke('productos:createComboItemNuevo', data),
  updateComboItemNuevo: (id: number, data: Partial<ComboItem>): Promise<ComboItem> => ipcRenderer.invoke('productos:updateComboItemNuevo', id, data),
  deleteComboItemNuevo: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteComboItemNuevo', id),

  // Observacion (new) methods
  getObservacionesNueva: (): Promise<Observacion[]> => ipcRenderer.invoke('productos:getObservacionesNueva'),
  getObservacionNueva: (id: number): Promise<Observacion> => ipcRenderer.invoke('productos:getObservacionNueva', id),
  createObservacionNueva: (data: Partial<Observacion>): Promise<Observacion> => ipcRenderer.invoke('productos:createObservacionNueva', data),
  updateObservacionNueva: (id: number, data: Partial<Observacion>): Promise<Observacion> => ipcRenderer.invoke('productos:updateObservacionNueva', id, data),
  deleteObservacionNueva: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deleteObservacionNueva', id),

  // PrecioVenta methods
  getPreciosVentaNuevo: (): Promise<PrecioVenta[]> => ipcRenderer.invoke('productos:getPreciosVentaNuevo'),
  getPrecioVentaNuevo: (id: number): Promise<PrecioVenta> => ipcRenderer.invoke('productos:getPrecioVentaNuevo', id),
  createPrecioVentaNuevo: (data: Partial<PrecioVenta>): Promise<PrecioVenta> => ipcRenderer.invoke('productos:createPrecioVentaNuevo', data),
  updatePrecioVentaNuevo: (id: number, data: Partial<PrecioVenta>): Promise<PrecioVenta> => ipcRenderer.invoke('productos:updatePrecioVentaNuevo', id, data),
  deletePrecioVentaNuevo: (id: number): Promise<boolean> => ipcRenderer.invoke('productos:deletePrecioVentaNuevo', id),

  // === LEGACY METHODS (to be added during migration) ===
  // TODO: Add legacy methods when needed during migration phase
};

export default productosAPI; 