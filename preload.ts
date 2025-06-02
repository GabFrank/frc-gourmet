// Preload script that will be executed before rendering the application
import { contextBridge, ipcRenderer } from 'electron';

// Import new product architecture interfaces
import * as ProductosNuevos from './productos.preload';

// Define types for our API
interface Category {
  id: number;
  name: string;
  description: string;
}

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category_id: number;
  image_path?: string;
  is_available: boolean;
}

interface OrderItem {
  product_id: number;
  quantity: number;
  notes?: string;
}

interface CreateOrderData {
  tableNumber: number;
  customerName: string;
  totalAmount: number;
  items: OrderItem[];
}

interface PrinterConfig {
  id?: number;
  name: string;
  type: 'epson' | 'star' | 'thermal';  // 'epson' and 'star' are supported by node-thermal-printer
  connectionType: 'usb' | 'network' | 'bluetooth';
  address: string; // IP address for network, path for USB, MAC for bluetooth
  port?: number;
  dpi?: number;
  width?: number; // in mm
  characterSet?: string;
  isDefault: boolean;
  options?: any; // Additional printer-specific options
}

// Document type enum (CI, RUC, CPF, PASAPORTE)
type DocumentoTipo = 'CI' | 'RUC' | 'CPF' | 'PASAPORTE';

// Person type enum (FISICA, JURIDICA)
type PersonaTipo = 'FISICA' | 'JURIDICA';

// Persona interface
interface Persona {
  id?: number;
  nombre: string;
  telefono?: string;
  direccion?: string;
  tipoDocumento: DocumentoTipo;
  documento: string;
  tipoPersona: PersonaTipo;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Usuario interface
interface Usuario {
  id?: number;
  persona: Persona;
  nickname: string;
  password: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Role interface
interface Role {
  id?: number;
  descripcion: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// UsuarioRole interface
interface UsuarioRole {
  id?: number;
  usuario: Usuario;
  role: Role;
  createdAt?: Date;
  updatedAt?: Date;
}

// TipoCliente interface
interface TipoCliente {
  id?: number;
  descripcion: string;
  activo: boolean;
  credito: boolean;
  descuento: boolean;
  porcentaje_descuento: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Cliente interface
interface Cliente {
  id?: number;
  persona: Persona;
  ruc?: string;
  razon_social?: string;
  tributa: boolean;
  tipo_cliente: TipoCliente;
  activo: boolean;
  credito: boolean;
  limite_credito: number;
  createdAt?: Date;
  updatedAt?: Date;
}

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

// DeviceInfo interface for login
interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
  userAgent: string;
  ip?: string;
}

// LoginResult interface for authentication
interface LoginResult {
  success: boolean;
  usuario?: Usuario;
  token?: string;
  message?: string;
  sessionId?: number;
}

// LoginSession interface
interface LoginSession {
  id?: number;
  usuario: Usuario;
  ip_address: string;
  user_agent: string;
  device_info?: string;
  login_time: Date;
  logout_time?: Date;
  is_active: boolean;
  last_activity_time?: Date;
  browser?: string;
  os?: string;
}

// === LEGACY PRODUCT INTERFACES (for compatibility during migration) ===

interface Categoria {
  id?: number;
  descripcion: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Subcategoria {
  id?: number;
  descripcion: string;
  categoria: Categoria;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RecetaVariacion {
  id?: number;
  nombre: string;
  activo: boolean;
  receta: Receta;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Producto {
  id?: number;
  codigo: string;
  descripcion: string;
  subcategoria: Subcategoria;
  precio: number;
  costo?: number;
  stock?: number;
  stock_minimo?: number;
  imageUrl?: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  recetaVariacion?: RecetaVariacion;
}

// Presentacion interface
interface Presentacion {
  id?: number;
  descripcion: string;
  tipoMedida: 'UNIDAD' | 'PAQUETE' | 'GRAMO' | 'LITRO';
  cantidad: number;
  principal: boolean;
  activo: boolean;
  productoId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Codigo interface
interface Codigo {
  id?: number;
  codigo: string;
  tipoCodigo: 'INTERNO' | 'BARRA' | 'QR';
  principal: boolean;
  activo: boolean;
  presentacionId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Moneda interface
interface Moneda {
  id?: number;
  denominacion: string;
  simbolo: string;
  principal: boolean;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// TipoPrecio interface
interface TipoPrecio {
  id?: number;
  descripcion: string;
  autorizacion: boolean;
  autorizadoPorId?: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// PrecioVenta interface
interface PrecioVenta {
  id?: number;
  valor: number;
  principal: boolean;
  activo: boolean;
  presentacionId: number;
  monedaId: number;
  tipoPrecioId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Receta interface
interface Receta {
  id?: number;
  nombre: string;
  modo_preparo?: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// RecetaItem interface
interface RecetaItem {
  id?: number;
  recetaId: number;
  ingredienteId: number;
  cantidad: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Add appropriate interface for Ingrediente if not already defined
interface Ingrediente {
  id?: number;
  descripcion: string;
  tipoMedida: 'UNIDAD' | 'GRAMO' | 'MILILITRO' | 'PAQUETE';
  costo: number;
  isProduccion: boolean;
  activo: boolean;
  recetaId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ProductoImage interface for legacy compatibility
interface ProductoImage {
  id?: number;
  productoId: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  isPrincipal: boolean;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// EstadoVentaItem enum for legacy compatibility
enum EstadoVentaItem {
  ACTIVO = 'ACTIVO',
  CANCELADO = 'CANCELADO',
  MODIFICADO = 'MODIFICADO'
}

// OrigenCosto enum for legacy compatibility  
enum OrigenCosto {
  MANUAL = 'MANUAL',
  RECETA = 'RECETA',
  PROVEEDOR = 'PROVEEDOR'
}

// === OTHER INTERFACES (financial, delivery, etc.) ===
// ... (continue with other interfaces as needed) ...

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Database operations
  getCategories: async (): Promise<Category[]> => {
    return await ipcRenderer.invoke('get-categories');
  },
  getProducts: async (): Promise<Product[]> => {
    return await ipcRenderer.invoke('get-products');
  },
  getProductsByCategory: async (categoryId: number): Promise<Product[]> => {
    return await ipcRenderer.invoke('get-products-by-category', categoryId);
  },
  createProduct: async (productData: Omit<Product, 'id'>): Promise<{ success: boolean, product: Product }> => {
    return await ipcRenderer.invoke('create-product', productData);
  },
  updateProduct: async (productId: number, productData: Omit<Product, 'id'>): Promise<{ success: boolean, product: Product }> => {
    return await ipcRenderer.invoke('update-product', productId, productData);
  },
  createOrder: async (orderData: CreateOrderData): Promise<{ orderId: number }> => {
    return await ipcRenderer.invoke('create-order', orderData);
  },
  getOrders: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-orders');
  },
  getOrderDetails: async (orderId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-order-details', orderId);
  },
  updateOrderStatus: async (orderId: number, status: OrderStatus): Promise<{ success: boolean, changes: number }> => {
    return await ipcRenderer.invoke('update-order-status', orderId, status);
  },

  // === NUEVA ARQUITECTURA DE PRODUCTOS ===
  
  // UnidadMedida operations
  getUnidadesMedida: async (): Promise<ProductosNuevos.UnidadMedida[]> => {
    return await ipcRenderer.invoke('productos:getUnidadesMedida');
  },
  getUnidadMedida: async (id: number): Promise<ProductosNuevos.UnidadMedida> => {
    return await ipcRenderer.invoke('productos:getUnidadMedida', id);
  },
  createUnidadMedida: async (data: Partial<ProductosNuevos.UnidadMedida>): Promise<ProductosNuevos.UnidadMedida> => {
    return await ipcRenderer.invoke('productos:createUnidadMedida', data);
  },
  updateUnidadMedida: async (id: number, data: Partial<ProductosNuevos.UnidadMedida>): Promise<ProductosNuevos.UnidadMedida> => {
    return await ipcRenderer.invoke('productos:updateUnidadMedida', id, data);
  },
  deleteUnidadMedida: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteUnidadMedida', id);
  },

  // ProductoBase operations
  getProductosBase: async (): Promise<ProductosNuevos.ProductoBase[]> => {
    return await ipcRenderer.invoke('productos:getProductosBase');
  },
  getProductoBase: async (id: number): Promise<ProductosNuevos.ProductoBase> => {
    return await ipcRenderer.invoke('productos:getProductoBase', id);
  },
  createProductoBase: async (data: Partial<ProductosNuevos.ProductoBase>): Promise<ProductosNuevos.ProductoBase> => {
    return await ipcRenderer.invoke('productos:createProductoBase', data);
  },
  updateProductoBase: async (id: number, data: Partial<ProductosNuevos.ProductoBase>): Promise<ProductosNuevos.ProductoBase> => {
    return await ipcRenderer.invoke('productos:updateProductoBase', id, data);
  },
  deleteProductoBase: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteProductoBase', id);
  },

  // Ingrediente (Nuevo) operations
  getIngredientesNuevo: async (): Promise<ProductosNuevos.Ingrediente[]> => {
    return await ipcRenderer.invoke('productos:getIngredientesNuevo');
  },
  getIngredienteNuevo: async (id: number): Promise<ProductosNuevos.Ingrediente> => {
    return await ipcRenderer.invoke('productos:getIngredienteNuevo', id);
  },
  createIngredienteNuevo: async (data: Partial<ProductosNuevos.Ingrediente>): Promise<ProductosNuevos.Ingrediente> => {
    return await ipcRenderer.invoke('productos:createIngredienteNuevo', data);
  },
  updateIngredienteNuevo: async (id: number, data: Partial<ProductosNuevos.Ingrediente>): Promise<ProductosNuevos.Ingrediente> => {
    return await ipcRenderer.invoke('productos:updateIngredienteNuevo', id, data);
  },
  deleteIngredienteNuevo: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteIngredienteNuevo', id);
  },

  // ProductoVariacion operations
  getProductosVariaciones: async (): Promise<ProductosNuevos.ProductoVariacion[]> => {
    return await ipcRenderer.invoke('productos:getProductosVariaciones');
  },
  getProductoVariacion: async (id: number): Promise<ProductosNuevos.ProductoVariacion> => {
    return await ipcRenderer.invoke('productos:getProductoVariacion', id);
  },
  getProductosVariacionesByProductoBase: async (productoBaseId: number): Promise<ProductosNuevos.ProductoVariacion[]> => {
    return await ipcRenderer.invoke('productos:getProductosVariacionesByProductoBase', productoBaseId);
  },
  createProductoVariacion: async (data: Partial<ProductosNuevos.ProductoVariacion>): Promise<ProductosNuevos.ProductoVariacion> => {
    return await ipcRenderer.invoke('productos:createProductoVariacion', data);
  },
  updateProductoVariacion: async (id: number, data: Partial<ProductosNuevos.ProductoVariacion>): Promise<ProductosNuevos.ProductoVariacion> => {
    return await ipcRenderer.invoke('productos:updateProductoVariacion', id, data);
  },
  deleteProductoVariacion: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteProductoVariacion', id);
  },

  // Receta (Nueva) operations
  getRecetasNueva: async (): Promise<ProductosNuevos.Receta[]> => {
    return await ipcRenderer.invoke('productos:getRecetasNueva');
  },
  getRecetaNueva: async (id: number): Promise<ProductosNuevos.Receta> => {
    return await ipcRenderer.invoke('productos:getRecetaNueva', id);
  },
  createRecetaNueva: async (data: Partial<ProductosNuevos.Receta>): Promise<ProductosNuevos.Receta> => {
    return await ipcRenderer.invoke('productos:createRecetaNueva', data);
  },
  updateRecetaNueva: async (id: number, data: Partial<ProductosNuevos.Receta>): Promise<ProductosNuevos.Receta> => {
    return await ipcRenderer.invoke('productos:updateRecetaNueva', id, data);
  },
  deleteRecetaNueva: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteRecetaNueva', id);
  },

  // RecetaItem (Nueva) operations
  getRecetaItemsNueva: async (recetaId: number): Promise<ProductosNuevos.RecetaItem[]> => {
    return await ipcRenderer.invoke('productos:getRecetaItemsNueva', recetaId);
  },
  getRecetaItemNueva: async (id: number): Promise<ProductosNuevos.RecetaItem> => {
    return await ipcRenderer.invoke('productos:getRecetaItemNueva', id);
  },
  createRecetaItemNueva: async (data: Partial<ProductosNuevos.RecetaItem>): Promise<ProductosNuevos.RecetaItem> => {
    return await ipcRenderer.invoke('productos:createRecetaItemNueva', data);
  },
  updateRecetaItemNueva: async (id: number, data: Partial<ProductosNuevos.RecetaItem>): Promise<ProductosNuevos.RecetaItem> => {
    return await ipcRenderer.invoke('productos:updateRecetaItemNueva', id, data);
  },
  deleteRecetaItemNueva: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteRecetaItemNueva', id);
  },

  // ProductoPresentacion operations
  getProductosPresentaciones: async (): Promise<ProductosNuevos.ProductoPresentacion[]> => {
    return await ipcRenderer.invoke('productos:getProductosPresentaciones');
  },
  getProductoPresentacion: async (id: number): Promise<ProductosNuevos.ProductoPresentacion> => {
    return await ipcRenderer.invoke('productos:getProductoPresentacion', id);
  },
  getProductosPresentacionesByProductoBase: async (productoBaseId: number): Promise<ProductosNuevos.ProductoPresentacion[]> => {
    return await ipcRenderer.invoke('productos:getProductosPresentacionesByProductoBase', productoBaseId);
  },
  createProductoPresentacion: async (data: Partial<ProductosNuevos.ProductoPresentacion>): Promise<ProductosNuevos.ProductoPresentacion> => {
    return await ipcRenderer.invoke('productos:createProductoPresentacion', data);
  },
  updateProductoPresentacion: async (id: number, data: Partial<ProductosNuevos.ProductoPresentacion>): Promise<ProductosNuevos.ProductoPresentacion> => {
    return await ipcRenderer.invoke('productos:updateProductoPresentacion', id, data);
  },
  deleteProductoPresentacion: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteProductoPresentacion', id);
  },

  // Combo (Nuevo) operations
  getCombosNuevo: async (): Promise<ProductosNuevos.Combo[]> => {
    return await ipcRenderer.invoke('productos:getCombosNuevo');
  },
  getComboNuevo: async (id: number): Promise<ProductosNuevos.Combo> => {
    return await ipcRenderer.invoke('productos:getComboNuevo', id);
  },
  createComboNuevo: async (data: Partial<ProductosNuevos.Combo>): Promise<ProductosNuevos.Combo> => {
    return await ipcRenderer.invoke('productos:createComboNuevo', data);
  },
  updateComboNuevo: async (id: number, data: Partial<ProductosNuevos.Combo>): Promise<ProductosNuevos.Combo> => {
    return await ipcRenderer.invoke('productos:updateComboNuevo', id, data);
  },
  deleteComboNuevo: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteComboNuevo', id);
  },

  // ComboItem (Nuevo) operations
  getComboItemsNuevo: async (comboId: number): Promise<ProductosNuevos.ComboItem[]> => {
    return await ipcRenderer.invoke('productos:getComboItemsNuevo', comboId);
  },
  getComboItemNuevo: async (id: number): Promise<ProductosNuevos.ComboItem> => {
    return await ipcRenderer.invoke('productos:getComboItemNuevo', id);
  },
  createComboItemNuevo: async (data: Partial<ProductosNuevos.ComboItem>): Promise<ProductosNuevos.ComboItem> => {
    return await ipcRenderer.invoke('productos:createComboItemNuevo', data);
  },
  updateComboItemNuevo: async (id: number, data: Partial<ProductosNuevos.ComboItem>): Promise<ProductosNuevos.ComboItem> => {
    return await ipcRenderer.invoke('productos:updateComboItemNuevo', id, data);
  },
  deleteComboItemNuevo: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteComboItemNuevo', id);
  },

  // Observacion (Nueva) operations
  getObservacionesNueva: async (): Promise<ProductosNuevos.Observacion[]> => {
    return await ipcRenderer.invoke('productos:getObservacionesNueva');
  },
  getObservacionNueva: async (id: number): Promise<ProductosNuevos.Observacion> => {
    return await ipcRenderer.invoke('productos:getObservacionNueva', id);
  },
  createObservacionNueva: async (data: Partial<ProductosNuevos.Observacion>): Promise<ProductosNuevos.Observacion> => {
    return await ipcRenderer.invoke('productos:createObservacionNueva', data);
  },
  updateObservacionNueva: async (id: number, data: Partial<ProductosNuevos.Observacion>): Promise<ProductosNuevos.Observacion> => {
    return await ipcRenderer.invoke('productos:updateObservacionNueva', id, data);
  },
  deleteObservacionNueva: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deleteObservacionNueva', id);
  },

  // PrecioVenta (Nuevo) operations
  getPreciosVentaNuevo: async (): Promise<ProductosNuevos.PrecioVenta[]> => {
    return await ipcRenderer.invoke('productos:getPreciosVentaNuevo');
  },
  getPrecioVentaNuevo: async (id: number): Promise<ProductosNuevos.PrecioVenta> => {
    return await ipcRenderer.invoke('productos:getPrecioVentaNuevo', id);
  },
  createPrecioVentaNuevo: async (data: Partial<ProductosNuevos.PrecioVenta>): Promise<ProductosNuevos.PrecioVenta> => {
    return await ipcRenderer.invoke('productos:createPrecioVentaNuevo', data);
  },
  updatePrecioVentaNuevo: async (id: number, data: Partial<ProductosNuevos.PrecioVenta>): Promise<ProductosNuevos.PrecioVenta> => {
    return await ipcRenderer.invoke('productos:updatePrecioVentaNuevo', id, data);
  },
  deletePrecioVentaNuevo: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('productos:deletePrecioVentaNuevo', id);
  },

  // === LEGACY METHODS (for compatibility during migration) ===
  // TODO: Add legacy methods as needed during migration phase
});
