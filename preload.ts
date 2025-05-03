// Preload script that will be executed before rendering the application
import { contextBridge, ipcRenderer } from 'electron';
import { ProductoImage } from './src/app/database/entities/productos/producto-image.entity';
import { EstadoVentaItem } from './src/app/database/entities/ventas/venta-item.entity';

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

// Add these interfaces for the missing operations
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

// Define interfaces for the new financial entities
interface MonedaBillete {
  id?: number;
  moneda: Moneda | number;
  valor: number;
  activo: boolean;
  image_path?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Conteo {
  id?: number;
  activo: boolean;
  detalles?: ConteoDetalle[];
  createdAt?: Date;
  updatedAt?: Date;
}

interface ConteoDetalle {
  id?: number;
  conteo: Conteo | number;
  monedaBillete: MonedaBillete | number;
  cantidad: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Dispositivo {
  id?: number;
  nombre: string;
  mac?: string;
  isVenta: boolean;
  isCaja: boolean;
  isTouch: boolean;
  isMobile: boolean;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

type CajaEstado = 'ABIERTO' | 'CERRADO' | 'CANCELADO';

interface Caja {
  id?: number;
  dispositivo: Dispositivo | number;
  fechaApertura: Date;
  fechaCierre?: Date;
  conteoApertura: Conteo | number;
  conteoCierre?: Conteo | number;
  estado: CajaEstado;
  activo: boolean;
  revisado: boolean;
  revisadoPor?: Usuario | number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RecetaVariacionItem {
  id?: number;
  recetaVariacionId: number;
  ingredienteId: number;
  cantidad: number;
  modificado: boolean;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CajaMoneda {
  id?: number;
  moneda: Moneda | number;
  predeterminado: boolean;
  activo: boolean;
  orden?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Add the Proveedor interface after other interfaces
interface Proveedor {
  id?: number;
  nombre: string;
  razon_social?: string | null;
  ruc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  activo: boolean;
  persona?: Persona | null;
  persona_id?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// Compra interfaces
type CompraEstado = 'ABIERTO' | 'PAGADO' | 'CANCELADO';

// Adding FormasPago interface
interface FormasPago {
  id?: number;
  nombre: string;
  activo: boolean;
  movimentaCaja: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Updating Compra interface with new fields
interface Compra {
  id?: number;
  estado: CompraEstado;
  isRecepcionMercaderia: boolean;
  activo: boolean;
  numeroNota?: string;
  tipoBoleta?: 'LEGAL' | 'COMUN' | 'OTRO';
  fechaCompra?: Date;
  credito: boolean;
  plazoDias?: number;
  proveedor?: Proveedor;
  pago?: Pago;
  moneda: Moneda;
  formaPago?: FormasPago;
  detalles?: CompraDetalle[];
  createdAt?: Date;
  updatedAt?: Date;
}

interface CompraDetalle {
  id?: number;
  cantidad: number;
  valor: number;
  activo: boolean;
  compra: Compra | number;
  producto?: Producto;
  ingrediente?: Ingrediente;
  presentacion?: Presentacion;
  createdAt?: Date;
  updatedAt?: Date;
}

type PagoEstado = 'ABIERTO' | 'COMPLETADO' | 'CANCELADO';

interface Pago {
  id?: number;
  estado: PagoEstado;
  activo: boolean;
  caja: Caja;
  detalles?: PagoDetalle[];
  compras?: Compra[];
  createdAt?: Date;
  updatedAt?: Date;
}

interface PagoDetalle {
  id?: number;
  valor: number;
  activo: boolean;
  pago: Pago | number;
  moneda: Moneda;
  createdAt?: Date;
  updatedAt?: Date;
}

// ProveedorProducto interface
interface ProveedorProducto {
  id?: number;
  activo: boolean;
  proveedor: Proveedor | number;
  producto?: Producto;
  ingrediente?: Ingrediente;
  compra?: Compra;
  createdAt?: Date;
  updatedAt?: Date;
}

// MovimientoStock interfaces
type TipoReferencia = 'VENTA' | 'COMPRA' | 'AJUSTE' | 'TRANSFERENCIA' | 'DESCARTE';

interface MovimientoStock {
  id?: number;
  productoId?: number;
  producto?: Producto;
  ingredienteId?: number;
  ingrediente?: Ingrediente;
  tipoMedida: string;
  cantidadActual: number;
  referencia?: number;
  tipoReferencia: TipoReferencia;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Add interfaces for ventas entities
type DeliveryEstado = 'ABIERTO' | 'PARA_ENTREGA' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO';

interface PrecioDelivery {
  id?: number;
  descripcion: string;
  valor: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Delivery {
  id?: number;
  precioDelivery: PrecioDelivery;
  telefono?: string;
  direccion?: string;
  cliente: Cliente;
  estado: DeliveryEstado;
  fechaAbierto: Date;
  fechaParaEntrega?: Date;
  fechaEnCamino?: Date;
  fechaEntregado?: Date;
  entregadoPor?: Usuario;
  createdAt?: Date;
  updatedAt?: Date;
}

type VentaEstado = 'ABIERTA' | 'CONCLUIDA' | 'CANCELADA';

interface Venta {
  id?: number;
  nombreCliente?: string;
  cliente: Cliente;
  estado: VentaEstado;
  formaPago: FormasPago;
  caja: Caja;
  pago?: Pago;
  delivery?: Delivery;
  items?: VentaItem[];
  createdAt?: Date;
  updatedAt?: Date;
  mesa?: PdvMesa;
}

interface VentaItem {
  id?: number;
  venta: Venta;
  tipoMedida: 'UNIDAD' | 'PAQUETE' | 'GRAMO' | 'LITRO';
  precioCostoTotal: number;
  precioVentaTotal: number;
  precioVentaPresentacion: PrecioVenta;
  producto: Producto;
  presentacion: Presentacion;
  cantidad: number;
  descuento: number;
  createdAt?: Date;
  updatedAt?: Date;
  estado: EstadoVentaItem;
  canceladoPor?: Usuario;
  horaCancelado?: Date;
  modificado?: boolean;
  modificadoPor?: Usuario;
  horaModificacion?: Date;
  nuevaVersionVentaItem?: VentaItem;
}

// iterface for PdvGrupoCategoria
interface PdvGrupoCategoria {
  id?: number;
  nombre: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// iterface for PdvCategoria
interface PdvCategoria {
  id?: number;
  nombre: string;
  activo: boolean;
  grupoCategoria: PdvGrupoCategoria;
}

// iterface for PdvCategoriaItem
interface PdvCategoriaItem {
  id?: number;
  nombre: string;
  activo: boolean;
  categoria: PdvCategoria;
}

// iterface for PdvItemProducto
interface PdvItemProducto {
  id?: number;
  nombre_alternativo: string;
  activo: boolean;
  categoriaItem: PdvCategoriaItem;
}

// Add after other PDV interfaces (around line 565)
interface PdvConfig {
  id?: number;
  cantidad_mesas: number;
  pdvGrupoCategoria?: PdvGrupoCategoria;
  pdvGrupoCategoriaId?: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// New Reserva interface
interface Reserva {
  id?: number;
  cliente?: Cliente;
  nombre_cliente: string;
  numero_cliente: string;
  fecha_hora_reserva: Date;
  cantidad_personas: number;
  motivo?: string;
  observacion?: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// New PdvMesa interface
interface PdvMesa {
  id?: number;
  numero: number;
  cantidad_personas?: number;
  activo: boolean;
  reservado: boolean;
  reserva?: Reserva;
  createdAt?: Date;
  updatedAt?: Date;
  venta?: Venta;
}

// New Comanda interface
interface Comanda {
  id?: number;
  codigo: string;
  pdv_mesa: PdvMesa;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// New Sector interface
interface Sector {
  id?: number;
  nombre: string;
  activo: boolean;
  mesas?: PdvMesa[];
  createdAt?: Date;
  updatedAt?: Date;
}

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

  // Persona operations
  getPersonas: async (): Promise<Persona[]> => {
    return await ipcRenderer.invoke('get-personas');
  },
  getPersona: async (personaId: number): Promise<Persona> => {
    return await ipcRenderer.invoke('get-persona', personaId);
  },
  createPersona: async (personaData: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>, currentUserId?: number): Promise<Persona> => {
    return await ipcRenderer.invoke('create-persona', personaData, currentUserId);
  },
  updatePersona: async (personaId: number, personaData: Partial<Persona>, currentUserId?: number): Promise<{ success: boolean, persona: Persona }> => {
    return await ipcRenderer.invoke('update-persona', personaId, personaData, currentUserId);
  },
  deletePersona: async (personaId: number, currentUserId?: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('delete-persona', personaId, currentUserId);
  },

  // Auth operations
  login: async (loginData: { nickname: string, password: string, deviceInfo: DeviceInfo }): Promise<LoginResult> => {
    return await ipcRenderer.invoke('login', loginData);
  },
  logout: async (sessionId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('logout', sessionId);
  },
  updateSessionActivity: async (sessionId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('updateSessionActivity', sessionId);
  },
  getLoginSessions: async (usuarioId: number): Promise<LoginSession[]> => {
    return await ipcRenderer.invoke('getLoginSessions', usuarioId);
  },
  getCurrentUser: async (): Promise<Usuario | null> => {
    return await ipcRenderer.invoke('getCurrentUser');
  },
  setCurrentUser: async (usuario: Usuario | null): Promise<void> => {
    return await ipcRenderer.invoke('setCurrentUser', usuario);
  },

  // Printer operations
  getPrinters: async (): Promise<PrinterConfig[]> => {
    return await ipcRenderer.invoke('get-printers');
  },
  addPrinter: async (printer: PrinterConfig): Promise<{ success: boolean, printer: PrinterConfig }> => {
    return await ipcRenderer.invoke('add-printer', printer);
  },
  updatePrinter: async (printerId: number, printer: PrinterConfig): Promise<{ success: boolean, printer: PrinterConfig }> => {
    return await ipcRenderer.invoke('update-printer', printerId, printer);
  },
  deletePrinter: async (printerId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('delete-printer', printerId);
  },
  printReceipt: async (orderId: number, printerId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('print-receipt', orderId, printerId);
  },
  printTestPage: async (printerId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('print-test-page', printerId);
  },

  // Usuario operations
  getUsuarios: async (): Promise<Usuario[]> => {
    return await ipcRenderer.invoke('get-usuarios');
  },
  getUsuario: async (usuarioId: number): Promise<Usuario> => {
    return await ipcRenderer.invoke('get-usuario', usuarioId);
  },
  createUsuario: async (usuarioData: Omit<Usuario, 'id' | 'createdAt' | 'updatedAt'>): Promise<Usuario> => {
    return await ipcRenderer.invoke('create-usuario', usuarioData);
  },
  updateUsuario: async (usuarioId: number, usuarioData: Partial<Usuario>): Promise<{ success: boolean, usuario: Usuario }> => {
    return await ipcRenderer.invoke('update-usuario', usuarioId, usuarioData);
  },
  deleteUsuario: async (usuarioId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('delete-usuario', usuarioId);
  },
  getUsuariosPaginated: async (page: number, pageSize: number, filters?: { nickname?: string; nombrePersona?: string; activo?: string | boolean }): Promise<{ items: Usuario[], total: number }> => {
    console.log('Preload.ts sending filters:', JSON.stringify(filters));
    return await ipcRenderer.invoke('get-usuarios-paginated', page, pageSize, filters);
  },

  // Role operations
  getRoles: async (): Promise<Role[]> => {
    return await ipcRenderer.invoke('get-roles');
  },
  getRole: async (roleId: number): Promise<Role> => {
    return await ipcRenderer.invoke('get-role', roleId);
  },
  createRole: async (roleData: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Promise<Role> => {
    return await ipcRenderer.invoke('create-role', roleData);
  },
  updateRole: async (roleId: number, roleData: Partial<Role>): Promise<{ success: boolean, role: Role }> => {
    return await ipcRenderer.invoke('update-role', roleId, roleData);
  },
  deleteRole: async (roleId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('delete-role', roleId);
  },

  // UsuarioRole operations
  getUsuarioRoles: async (usuarioId: number): Promise<UsuarioRole[]> => {
    return await ipcRenderer.invoke('get-usuario-roles', usuarioId);
  },
  assignRoleToUsuario: async (usuarioId: number, roleId: number): Promise<{ success: boolean, usuarioRole: UsuarioRole }> => {
    return await ipcRenderer.invoke('assign-role-to-usuario', usuarioId, roleId);
  },
  removeRoleFromUsuario: async (usuarioRoleId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('remove-role-from-usuario', usuarioRoleId);
  },

  // TipoCliente operations
  getTipoClientes: async (): Promise<TipoCliente[]> => {
    return await ipcRenderer.invoke('get-tipo-clientes');
  },
  getTipoCliente: async (tipoClienteId: number): Promise<TipoCliente> => {
    return await ipcRenderer.invoke('get-tipo-cliente', tipoClienteId);
  },
  createTipoCliente: async (tipoClienteData: Omit<TipoCliente, 'id' | 'createdAt' | 'updatedAt'>): Promise<TipoCliente> => {
    return await ipcRenderer.invoke('create-tipo-cliente', tipoClienteData);
  },
  updateTipoCliente: async (tipoClienteId: number, tipoClienteData: Partial<TipoCliente>): Promise<{ success: boolean, tipoCliente: TipoCliente }> => {
    return await ipcRenderer.invoke('update-tipo-cliente', tipoClienteId, tipoClienteData);
  },
  deleteTipoCliente: async (tipoClienteId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('delete-tipo-cliente', tipoClienteId);
  },

  // Cliente operations
  getClientes: async (): Promise<Cliente[]> => {
    return await ipcRenderer.invoke('get-clientes');
  },
  getCliente: async (clienteId: number): Promise<Cliente> => {
    return await ipcRenderer.invoke('get-cliente', clienteId);
  },
  createCliente: async (clienteData: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>): Promise<Cliente> => {
    return await ipcRenderer.invoke('create-cliente', clienteData);
  },
  updateCliente: async (clienteId: number, clienteData: Partial<Cliente>): Promise<{ success: boolean, cliente: Cliente }> => {
    return await ipcRenderer.invoke('update-cliente', clienteId, clienteData);
  },
  deleteCliente: async (clienteId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('delete-cliente', clienteId);
  },

  // Profile image operations
  saveProfileImage: async (base64Data: string, fileName: string): Promise<{ success: boolean, imageUrl: string }> => {
    return await ipcRenderer.invoke('save-profile-image', { base64Data, fileName });
  },
  deleteProfileImage: async (imageUrl: string): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('delete-profile-image', imageUrl);
  },

  // Utility functions
  on: (channel: string, callback: (data: any) => void): void => {
    // Deliberately strip event as it includes `sender`
    ipcRenderer.on(channel, (_event: any, data: any) => callback(data));
  },

  // Categoria operations
  getCategorias: async (): Promise<Categoria[]> => {
    return await ipcRenderer.invoke('getCategorias');
  },
  getCategoria: async (categoriaId: number): Promise<Categoria> => {
    return await ipcRenderer.invoke('getCategoria', categoriaId);
  },
  createCategoria: async (categoriaData: Omit<Categoria, 'id' | 'createdAt' | 'updatedAt'>): Promise<Categoria> => {
    return await ipcRenderer.invoke('createCategoria', categoriaData);
  },
  updateCategoria: async (categoriaId: number, categoriaData: Partial<Categoria>): Promise<{ success: boolean, categoria: Categoria }> => {
    return await ipcRenderer.invoke('updateCategoria', categoriaId, categoriaData);
  },
  deleteCategoria: async (categoriaId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteCategoria', categoriaId);
  },

  // Subcategoria operations
  getSubcategorias: async (): Promise<Subcategoria[]> => {
    return await ipcRenderer.invoke('getSubcategorias');
  },
  getSubcategoria: async (subcategoriaId: number): Promise<Subcategoria> => {
    return await ipcRenderer.invoke('getSubcategoria', subcategoriaId);
  },
  getSubcategoriasByCategoria: async (categoriaId: number): Promise<Subcategoria[]> => {
    return await ipcRenderer.invoke('getSubcategoriasByCategoria', categoriaId);
  },
  createSubcategoria: async (subcategoriaData: Omit<Subcategoria, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subcategoria> => {
    return await ipcRenderer.invoke('createSubcategoria', subcategoriaData);
  },
  updateSubcategoria: async (subcategoriaId: number, subcategoriaData: Partial<Subcategoria>): Promise<{ success: boolean, subcategoria: Subcategoria }> => {
    return await ipcRenderer.invoke('updateSubcategoria', subcategoriaId, subcategoriaData);
  },
  deleteSubcategoria: async (subcategoriaId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteSubcategoria', subcategoriaId);
  },

  // Producto operations
  getProductos: async (): Promise<Producto[]> => {
    return await ipcRenderer.invoke('getProductos');
  },
  getProducto: async (productoId: number): Promise<Producto> => {
    return await ipcRenderer.invoke('getProducto', productoId);
  },
  getProductosBySubcategoria: async (subcategoriaId: number): Promise<Producto[]> => {
    return await ipcRenderer.invoke('getProductosBySubcategoria', subcategoriaId);
  },
  createProducto: async (productoData: Omit<Producto, 'id' | 'createdAt' | 'updatedAt'>): Promise<Producto> => {
    return await ipcRenderer.invoke('createProducto', productoData);
  },
  updateProducto: async (productoId: number, productoData: Partial<Producto>): Promise<{ success: boolean, producto: Producto }> => {
    return await ipcRenderer.invoke('updateProducto', productoId, productoData);
  },
  deleteProducto: async (productoId: number): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteProducto', productoId);
  },
  saveProductoImage: async (base64Data: string, fileName: string): Promise<{ success: boolean, imageUrl: string }> => {
    return await ipcRenderer.invoke('saveProductoImage', { base64Data, fileName });
  },
  deleteProductoImage: async (imageUrl: string): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteProductoImage', imageUrl);
  },

  // Product Image methods
  getProductImages: async (productoId: number): Promise<ProductoImage[]> => {
    return await ipcRenderer.invoke('getProductImages', productoId);
  },

  createProductImage: async (imageData: Partial<ProductoImage>): Promise<ProductoImage> => {
    return await ipcRenderer.invoke('createProductImage', imageData);
  },

  updateProductImage: async (imageId: number, imageData: Partial<ProductoImage>): Promise<ProductoImage> => {
    return await ipcRenderer.invoke('updateProductImage', imageId, imageData);
  },

  deleteProductImage: async (imageId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteProductImage', imageId);
  },

  // Presentacion methods
  getPresentaciones: async (): Promise<Presentacion[]> => {
    return await ipcRenderer.invoke('getPresentaciones');
  },

  getPresentacion: async (presentacionId: number): Promise<Presentacion> => {
    return await ipcRenderer.invoke('getPresentacion', presentacionId);
  },

  getPresentacionesByProducto: async (productoId: number): Promise<Presentacion[]> => {
    return await ipcRenderer.invoke('getPresentacionesByProducto', productoId);
  },

  createPresentacion: async (presentacionData: Partial<Presentacion>): Promise<Presentacion> => {
    return await ipcRenderer.invoke('createPresentacion', presentacionData);
  },

  updatePresentacion: async (presentacionId: number, presentacionData: Partial<Presentacion>): Promise<Presentacion> => {
    return await ipcRenderer.invoke('updatePresentacion', presentacionId, presentacionData);
  },

  deletePresentacion: async (presentacionId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deletePresentacion', presentacionId);
  },

  // Codigo methods
  getCodigos: async (): Promise<Codigo[]> => {
    return await ipcRenderer.invoke('getCodigos');
  },

  getCodigo: async (codigoId: number): Promise<Codigo> => {
    return await ipcRenderer.invoke('getCodigo', codigoId);
  },

  getCodigosByPresentacion: async (presentacionId: number): Promise<Codigo[]> => {
    return await ipcRenderer.invoke('getCodigosByPresentacion', presentacionId);
  },

  createCodigo: async (codigoData: Partial<Codigo>): Promise<Codigo> => {
    return await ipcRenderer.invoke('createCodigo', codigoData);
  },

  updateCodigo: async (codigoId: number, codigoData: Partial<Codigo>): Promise<Codigo> => {
    return await ipcRenderer.invoke('updateCodigo', codigoId, codigoData);
  },

  deleteCodigo: async (codigoId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteCodigo', codigoId);
  },

  // Moneda methods
  getMonedas: async (): Promise<Moneda[]> => {
    return await ipcRenderer.invoke('getMonedas');
  },

  getMoneda: async (monedaId: number): Promise<Moneda> => {
    return await ipcRenderer.invoke('getMoneda', monedaId);
  },

  createMoneda: async (monedaData: Partial<Moneda>): Promise<Moneda> => {
    return await ipcRenderer.invoke('createMoneda', monedaData);
  },

  updateMoneda: async (monedaId: number, monedaData: Partial<Moneda>): Promise<Moneda> => {
    return await ipcRenderer.invoke('updateMoneda', monedaId, monedaData);
  },

  deleteMoneda: async (monedaId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteMoneda', monedaId);
  },

  // TipoPrecio methods
  getTipoPrecios: async (): Promise<TipoPrecio[]> => {
    return await ipcRenderer.invoke('getTipoPrecios');
  },

  getTipoPrecio: async (tipoPrecioId: number): Promise<TipoPrecio> => {
    return await ipcRenderer.invoke('getTipoPrecio', tipoPrecioId);
  },

  createTipoPrecio: async (tipoPrecioData: Partial<TipoPrecio>): Promise<TipoPrecio> => {
    return await ipcRenderer.invoke('createTipoPrecio', tipoPrecioData);
  },

  updateTipoPrecio: async (tipoPrecioId: number, tipoPrecioData: Partial<TipoPrecio>): Promise<TipoPrecio> => {
    return await ipcRenderer.invoke('updateTipoPrecio', tipoPrecioId, tipoPrecioData);
  },

  deleteTipoPrecio: async (tipoPrecioId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteTipoPrecio', tipoPrecioId);
  },

  // PrecioVenta methods
  getPreciosVenta: async (active: boolean): Promise<PrecioVenta[]> => {
    return await ipcRenderer.invoke('getPreciosVenta', active);
  },

  getPrecioVenta: async (precioVentaId: number, active: boolean): Promise<PrecioVenta> => {
    return await ipcRenderer.invoke('getPrecioVenta', precioVentaId, active);
  },

  getPreciosVentaByPresentacion: async (presentacionId: number, active: boolean): Promise<PrecioVenta[]> => {
    return await ipcRenderer.invoke('getPreciosVentaByPresentacion', presentacionId, active);
  },

  getPreciosVentaByPresentacionSabor: async (presentacionSaborId: number, active: boolean): Promise<PrecioVenta[]> => {
    return await ipcRenderer.invoke('getPreciosVentaByPresentacionSabor', presentacionSaborId, active);
  },

  createPrecioVenta: async (precioVentaData: Partial<PrecioVenta>): Promise<PrecioVenta> => {
    return await ipcRenderer.invoke('createPrecioVenta', precioVentaData);
  },

  updatePrecioVenta: async (precioVentaId: number, precioVentaData: Partial<PrecioVenta>): Promise<PrecioVenta> => {
    return await ipcRenderer.invoke('updatePrecioVenta', precioVentaId, precioVentaData);
  },

  deletePrecioVenta: async (precioVentaId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deletePrecioVenta', precioVentaId);
  },

  // Sabor methods
  getSabores: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('getSabores');
  },

  getSabor: async (saborId: number): Promise<any> => {
    return await ipcRenderer.invoke('getSabor', saborId);
  },

  createSabor: async (saborData: any): Promise<any> => {
    return await ipcRenderer.invoke('createSabor', saborData);
  },

  updateSabor: async (saborId: number, saborData: any): Promise<any> => {
    return await ipcRenderer.invoke('updateSabor', saborId, saborData);
  },

  deleteSabor: async (saborId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteSabor', saborId);
  },

  // PresentacionSabor methods
  getPresentacionSaboresByPresentacion: async (presentacionId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getPresentacionSaboresByPresentacion', presentacionId);
  },

  getPresentacionSabor: async (presentacionSaborId: number): Promise<any> => {
    return await ipcRenderer.invoke('getPresentacionSabor', presentacionSaborId);
  },

  createPresentacionSabor: async (presentacionSaborData: any): Promise<any> => {
    return await ipcRenderer.invoke('createPresentacionSabor', presentacionSaborData);
  },

  updatePresentacionSabor: async (presentacionSaborId: number, presentacionSaborData: any): Promise<any> => {
    return await ipcRenderer.invoke('updatePresentacionSabor', presentacionSaborId, presentacionSaborData);
  },

  deletePresentacionSabor: async (presentacionSaborId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deletePresentacionSabor', presentacionSaborId);
  },

  // Receta methods
  getRecetas: async () => {
    return await ipcRenderer.invoke('getRecetas');
  },
  getReceta: async (recetaId: number) => {
    return await ipcRenderer.invoke('getReceta', recetaId);
  },
  createReceta: async (recetaData: any) => {
    return await ipcRenderer.invoke('createReceta', recetaData);
  },
  updateReceta: async (recetaId: number, recetaData: any) => {
    return await ipcRenderer.invoke('updateReceta', recetaId, recetaData);
  },
  deleteReceta: async (recetaId: number) => {
    return await ipcRenderer.invoke('deleteReceta', recetaId);
  },

  // RecetaItem methods
  getRecetaItems: async (recetaId: number) => {
    return await ipcRenderer.invoke('getRecetaItems', recetaId);
  },
  getRecetaItem: async (recetaItemId: number) => {
    return await ipcRenderer.invoke('getRecetaItem', recetaItemId);
  },
  createRecetaItem: async (recetaItemData: any) => {
    return await ipcRenderer.invoke('createRecetaItem', recetaItemData);
  },
  updateRecetaItem: async (recetaItemId: number, recetaItemData: any) => {
    return await ipcRenderer.invoke('updateRecetaItem', recetaItemId, recetaItemData);
  },
  deleteRecetaItem: async (recetaItemId: number) => {
    return await ipcRenderer.invoke('deleteRecetaItem', recetaItemId);
  },

  // Ingrediente methods
  getIngredientes: async () => {
    return await ipcRenderer.invoke('getIngredientes');
  },
  getIngrediente: async (ingredienteId: number) => {
    return await ipcRenderer.invoke('getIngrediente', ingredienteId);
  },
  createIngrediente: async (ingredienteData: any) => {
    return await ipcRenderer.invoke('createIngrediente', ingredienteData);
  },
  updateIngrediente: async (ingredienteId: number, ingredienteData: any) => {
    return await ipcRenderer.invoke('updateIngrediente', ingredienteId, ingredienteData);
  },
  deleteIngrediente: async (ingredienteId: number) => {
    return await ipcRenderer.invoke('deleteIngrediente', ingredienteId);
  },
  searchIngredientesByDescripcion: async (searchText: string) => {
    return await ipcRenderer.invoke('searchIngredientesByDescripcion', searchText);
  },

  // RecetaVariacion methods
  getRecetaVariaciones: async (recetaId: number) => {
    return await ipcRenderer.invoke('getRecetaVariaciones', recetaId);
  },
  getRecetaVariacion: async (variacionId: number) => {
    return await ipcRenderer.invoke('getRecetaVariacion', variacionId);
  },
  createRecetaVariacion: async (variacionData: any) => {
    return await ipcRenderer.invoke('createRecetaVariacion', variacionData);
  },
  updateRecetaVariacion: async (variacionId: number, variacionData: any) => {
    return await ipcRenderer.invoke('updateRecetaVariacion', variacionId, variacionData);
  },
  deleteRecetaVariacion: async (variacionId: number) => {
    return await ipcRenderer.invoke('deleteRecetaVariacion', variacionId);
  },

  // RecetaVariacionItem methods
  getRecetaVariacionItems: async (variacionId: number) => {
    return await ipcRenderer.invoke('getRecetaVariacionItems', variacionId);
  },
  getRecetaVariacionItem: async (variacionItemId: number) => {
    return await ipcRenderer.invoke('getRecetaVariacionItem', variacionItemId);
  },
  createRecetaVariacionItem: async (variacionItemData: any) => {
    return await ipcRenderer.invoke('createRecetaVariacionItem', variacionItemData);
  },
  updateRecetaVariacionItem: async (variacionItemId: number, variacionItemData: any) => {
    return await ipcRenderer.invoke('updateRecetaVariacionItem', variacionItemId, variacionItemData);
  },
  deleteRecetaVariacionItem: async (variacionItemId: number) => {
    return await ipcRenderer.invoke('deleteRecetaVariacionItem', variacionItemId);
  },

  // MonedaBillete methods
  getMonedasBilletes: async () => {
    return await ipcRenderer.invoke('get-monedas-billetes');
  },
  getMonedaBillete: async (monedaBilleteId: number) => {
    return await ipcRenderer.invoke('get-moneda-billete', monedaBilleteId);
  },
  createMonedaBillete: async (monedaBilleteData: any) => {
    return await ipcRenderer.invoke('create-moneda-billete', monedaBilleteData);
  },
  updateMonedaBillete: async (monedaBilleteId: number, monedaBilleteData: any) => {
    return await ipcRenderer.invoke('update-moneda-billete', monedaBilleteId, monedaBilleteData);
  },
  deleteMonedaBillete: async (monedaBilleteId: number) => {
    return await ipcRenderer.invoke('delete-moneda-billete', monedaBilleteId);
  },

  // Conteo methods
  getConteos: async () => {
    return await ipcRenderer.invoke('get-conteos');
  },
  getConteo: async (conteoId: number) => {
    return await ipcRenderer.invoke('get-conteo', conteoId);
  },
  createConteo: async (conteoData: any) => {
    return await ipcRenderer.invoke('create-conteo', conteoData);
  },
  updateConteo: async (conteoId: number, conteoData: any) => {
    return await ipcRenderer.invoke('update-conteo', conteoId, conteoData);
  },
  deleteConteo: async (conteoId: number) => {
    return await ipcRenderer.invoke('delete-conteo', conteoId);
  },

  // ConteoDetalle methods
  getConteoDetalles: async (conteoId: number) => {
    return await ipcRenderer.invoke('get-conteo-detalles', conteoId);
  },
  getConteoDetalle: async (conteoDetalleId: number) => {
    return await ipcRenderer.invoke('get-conteo-detalle', conteoDetalleId);
  },
  createConteoDetalle: async (conteoDetalleData: any) => {
    return await ipcRenderer.invoke('create-conteo-detalle', conteoDetalleData);
  },
  updateConteoDetalle: async (conteoDetalleId: number, conteoDetalleData: any) => {
    return await ipcRenderer.invoke('update-conteo-detalle', conteoDetalleId, conteoDetalleData);
  },
  deleteConteoDetalle: async (conteoDetalleId: number) => {
    return await ipcRenderer.invoke('delete-conteo-detalle', conteoDetalleId);
  },

  // Dispositivo methods
  getDispositivos: async () => {
    return await ipcRenderer.invoke('get-dispositivos');
  },
  getDispositivo: async (dispositivoId: number) => {
    return await ipcRenderer.invoke('get-dispositivo', dispositivoId);
  },
  createDispositivo: async (dispositivoData: any) => {
    return await ipcRenderer.invoke('create-dispositivo', dispositivoData);
  },
  updateDispositivo: async (dispositivoId: number, dispositivoData: any) => {
    return await ipcRenderer.invoke('update-dispositivo', dispositivoId, dispositivoData);
  },
  deleteDispositivo: async (dispositivoId: number) => {
    return await ipcRenderer.invoke('delete-dispositivo', dispositivoId);
  },

  // Caja methods
  getCajas: async () => {
    return await ipcRenderer.invoke('get-cajas');
  },
  getCaja: async (cajaId: number) => {
    return await ipcRenderer.invoke('get-caja', cajaId);
  },
  getCajaByDispositivo: async (dispositivoId: number) => {
    return await ipcRenderer.invoke('get-caja-by-dispositivo', dispositivoId);
  },
  createCaja: async (cajaData: any) => {
    return await ipcRenderer.invoke('create-caja', cajaData);
  },
  updateCaja: async (cajaId: number, cajaData: any) => {
    return await ipcRenderer.invoke('update-caja', cajaId, cajaData);
  },
  deleteCaja: async (cajaId: number) => {
    return await ipcRenderer.invoke('delete-caja', cajaId);
  },
  getCajaAbiertaByUsuario: async () => {
    return await ipcRenderer.invoke('get-caja-abierta-by-usuario');
  },

  // CajaMoneda methods
  getCajasMonedas: () => ipcRenderer.invoke('get-cajas-monedas'),
  getCajaMoneda: (cajaMonedaId: number) => ipcRenderer.invoke('get-caja-moneda', cajaMonedaId),
  createCajaMoneda: (cajaMonedaData: Partial<CajaMoneda>) => ipcRenderer.invoke('create-caja-moneda', cajaMonedaData),
  updateCajaMoneda: (cajaMonedaId: number, cajaMonedaData: Partial<CajaMoneda>) => ipcRenderer.invoke('update-caja-moneda', cajaMonedaId, cajaMonedaData),
  deleteCajaMoneda: (cajaMonedaId: number) => ipcRenderer.invoke('delete-caja-moneda', cajaMonedaId),
  saveCajasMonedas: (updates: any[]) => ipcRenderer.invoke('save-cajas-monedas', updates),

  // MonedaCambio methods
  getMonedasCambio: async () => {
    return await ipcRenderer.invoke('get-monedas-cambio');
  },
  getMonedasCambioByMonedaOrigen: async (monedaOrigenId: number) => {
    return await ipcRenderer.invoke('get-monedas-cambio-by-moneda-origen', monedaOrigenId);
  },
  getMonedaCambio: async (monedaCambioId: number) => {
    return await ipcRenderer.invoke('get-moneda-cambio', monedaCambioId);
  },
  createMonedaCambio: async (monedaCambioData: any) => {
    return await ipcRenderer.invoke('create-moneda-cambio', monedaCambioData);
  },
  updateMonedaCambio: async (monedaCambioId: number, monedaCambioData: any) => {
    return await ipcRenderer.invoke('update-moneda-cambio', monedaCambioId, monedaCambioData);
  },
  deleteMonedaCambio: async (monedaCambioId: number) => {
    return await ipcRenderer.invoke('delete-moneda-cambio', monedaCambioId);
  },

  // Proveedor methods
  getProveedores: async () => {
    return await ipcRenderer.invoke('getProveedores');
  },
  getProveedor: async (proveedorId: number) => {
    return await ipcRenderer.invoke('getProveedor', proveedorId);
  },
  createProveedor: async (proveedorData: Partial<Proveedor>) => {
    return await ipcRenderer.invoke('createProveedor', proveedorData);
  },
  updateProveedor: async (proveedorId: number, proveedorData: Partial<Proveedor>) => {
    return await ipcRenderer.invoke('updateProveedor', proveedorId, proveedorData);
  },
  deleteProveedor: async (proveedorId: number) => {
    return await ipcRenderer.invoke('deleteProveedor', proveedorId);
  },

  // Compra methods
  getCompras: async () => {
    return await ipcRenderer.invoke('getCompras');
  },
  getCompra: async (compraId: number) => {
    return await ipcRenderer.invoke('getCompra', compraId);
  },
  createCompra: async (compraData: any) => {
    return await ipcRenderer.invoke('createCompra', compraData);
  },
  updateCompra: async (compraId: number, compraData: any) => {
    return await ipcRenderer.invoke('updateCompra', compraId, compraData);
  },
  deleteCompra: async (compraId: number) => {
    return await ipcRenderer.invoke('deleteCompra', compraId);
  },

  // CompraDetalle methods
  getCompraDetalles: async (compraId: number) => {
    return await ipcRenderer.invoke('getCompraDetalles', compraId);
  },
  createCompraDetalle: async (detalleData: any) => {
    return await ipcRenderer.invoke('createCompraDetalle', detalleData);
  },
  updateCompraDetalle: async (detalleId: number, detalleData: any) => {
    return await ipcRenderer.invoke('updateCompraDetalle', detalleId, detalleData);
  },
  deleteCompraDetalle: async (detalleId: number) => {
    return await ipcRenderer.invoke('deleteCompraDetalle', detalleId);
  },

  // Pago methods
  getPagos: async () => {
    return await ipcRenderer.invoke('getPagos');
  },
  getPago: async (pagoId: number) => {
    return await ipcRenderer.invoke('getPago', pagoId);
  },
  createPago: async (pagoData: any) => {
    return await ipcRenderer.invoke('createPago', pagoData);
  },
  updatePago: async (pagoId: number, pagoData: any) => {
    return await ipcRenderer.invoke('updatePago', pagoId, pagoData);
  },
  deletePago: async (pagoId: number) => {
    return await ipcRenderer.invoke('deletePago', pagoId);
  },

  // PagoDetalle methods
  getPagoDetalles: async (pagoId: number) => {
    return await ipcRenderer.invoke('getPagoDetalles', pagoId);
  },
  createPagoDetalle: async (detalleData: any) => {
    return await ipcRenderer.invoke('createPagoDetalle', detalleData);
  },
  updatePagoDetalle: async (detalleId: number, detalleData: any) => {
    return await ipcRenderer.invoke('updatePagoDetalle', detalleId, detalleData);
  },
  deletePagoDetalle: async (detalleId: number) => {
    return await ipcRenderer.invoke('deletePagoDetalle', detalleId);
  },

  // ProveedorProducto methods
  getProveedorProductos: async (proveedorId: number) => {
    return await ipcRenderer.invoke('getProveedorProductos', proveedorId);
  },
  getProveedorProducto: async (proveedorProductoId: number) => {
    return await ipcRenderer.invoke('getProveedorProducto', proveedorProductoId);
  },
  createProveedorProducto: async (proveedorProductoData: any) => {
    return await ipcRenderer.invoke('createProveedorProducto', proveedorProductoData);
  },
  updateProveedorProducto: async (proveedorProductoId: number, proveedorProductoData: any) => {
    return await ipcRenderer.invoke('updateProveedorProducto', proveedorProductoId, proveedorProductoData);
  },
  deleteProveedorProducto: async (proveedorProductoId: number) => {
    return await ipcRenderer.invoke('deleteProveedorProducto', proveedorProductoId);
  },

  // System information
  getSystemMacAddress: () => ipcRenderer.invoke('get-system-mac-address'),

  // FormasPago methods
  getFormasPago: async (): Promise<FormasPago[]> => {
    return await ipcRenderer.invoke('getFormasPago');
  },
  getFormaPago: async (formaPagoId: number): Promise<FormasPago> => {
    return await ipcRenderer.invoke('getFormaPago', formaPagoId);
  },
  createFormaPago: async (formaPagoData: Partial<FormasPago>): Promise<FormasPago> => {
    return await ipcRenderer.invoke('createFormaPago', formaPagoData);
  },
  updateFormaPago: async (formaPagoId: number, formaPagoData: Partial<FormasPago>): Promise<FormasPago> => {
    return await ipcRenderer.invoke('updateFormaPago', formaPagoId, formaPagoData);
  },
  deleteFormaPago: async (formaPagoId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteFormaPago', formaPagoId);
  },
  updateFormasPagoOrder: async (updates: { id: number, orden: number }[]) => {
    return await ipcRenderer.invoke('updateFormasPagoOrder', updates);
  },

  // MovimientoStock methods
  getMovimientosStock: async (): Promise<MovimientoStock[]> => {
    return await ipcRenderer.invoke('getMovimientosStock');
  },
  getMovimientoStock: async (movimientoStockId: number): Promise<MovimientoStock> => {
    return await ipcRenderer.invoke('getMovimientoStock', movimientoStockId);
  },
  getMovimientosStockByProducto: async (productoId: number): Promise<MovimientoStock[]> => {
    return await ipcRenderer.invoke('getMovimientosStockByProducto', productoId);
  },
  getMovimientosStockByIngrediente: async (ingredienteId: number): Promise<MovimientoStock[]> => {
    return await ipcRenderer.invoke('getMovimientosStockByIngrediente', ingredienteId);
  },
  getMovimientosStockByTipoReferencia: async (tipoReferencia: TipoReferencia): Promise<MovimientoStock[]> => {
    return await ipcRenderer.invoke('getMovimientosStockByTipoReferencia', tipoReferencia);
  },
  getMovimientosStockByReferenciaAndTipo: async (referencia: number, tipoReferencia: TipoReferencia): Promise<MovimientoStock[]> => {
    return await ipcRenderer.invoke('getMovimientosStockByReferenciaAndTipo', referencia, tipoReferencia);
  },
  getCurrentStockByProducto: async (productoId: number): Promise<MovimientoStock> => {
    return await ipcRenderer.invoke('getCurrentStockByProducto', productoId);
  },
  getCurrentStockByIngrediente: async (ingredienteId: number): Promise<MovimientoStock> => {
    return await ipcRenderer.invoke('getCurrentStockByIngrediente', ingredienteId);
  },
  createMovimientoStock: async (movimientoStockData: Partial<MovimientoStock>): Promise<MovimientoStock> => {
    return await ipcRenderer.invoke('createMovimientoStock', movimientoStockData);
  },
  updateMovimientoStock: async (movimientoStockId: number, movimientoStockData: Partial<MovimientoStock>): Promise<MovimientoStock> => {
    return await ipcRenderer.invoke('updateMovimientoStock', movimientoStockId, movimientoStockData);
  },
  deleteMovimientoStock: async (movimientoStockId: number): Promise<{ success: boolean, deactivated: boolean }> => {
    return await ipcRenderer.invoke('deleteMovimientoStock', movimientoStockId);
  },

  // PrecioDelivery methods
  getPreciosDelivery: async (): Promise<PrecioDelivery[]> => {
    return await ipcRenderer.invoke('getPreciosDelivery');
  },
  getPrecioDelivery: async (precioDeliveryId: number): Promise<PrecioDelivery> => {
    return await ipcRenderer.invoke('getPrecioDelivery', precioDeliveryId);
  },
  createPrecioDelivery: async (precioDeliveryData: Partial<PrecioDelivery>): Promise<PrecioDelivery> => {
    return await ipcRenderer.invoke('createPrecioDelivery', precioDeliveryData);
  },
  updatePrecioDelivery: async (precioDeliveryId: number, precioDeliveryData: Partial<PrecioDelivery>): Promise<any> => {
    return await ipcRenderer.invoke('updatePrecioDelivery', precioDeliveryId, precioDeliveryData);
  },
  deletePrecioDelivery: async (precioDeliveryId: number): Promise<any> => {
    return await ipcRenderer.invoke('deletePrecioDelivery', precioDeliveryId);
  },

  // Delivery methods
  getDeliveries: async (): Promise<Delivery[]> => {
    return await ipcRenderer.invoke('getDeliveries');
  },
  getDeliveriesByEstado: async (estado: DeliveryEstado): Promise<Delivery[]> => {
    return await ipcRenderer.invoke('getDeliveriesByEstado', estado);
  },
  getDelivery: async (deliveryId: number): Promise<Delivery> => {
    return await ipcRenderer.invoke('getDelivery', deliveryId);
  },
  createDelivery: async (deliveryData: Partial<Delivery>): Promise<Delivery> => {
    return await ipcRenderer.invoke('createDelivery', deliveryData);
  },
  updateDelivery: async (deliveryId: number, deliveryData: Partial<Delivery>): Promise<any> => {
    return await ipcRenderer.invoke('updateDelivery', deliveryId, deliveryData);
  },
  deleteDelivery: async (deliveryId: number): Promise<any> => {
    return await ipcRenderer.invoke('deleteDelivery', deliveryId);
  },

  // Venta methods
  getVentas: async (): Promise<Venta[]> => {
    return await ipcRenderer.invoke('getVentas');
  },
  getVentasByEstado: async (estado: VentaEstado): Promise<Venta[]> => {
    return await ipcRenderer.invoke('getVentasByEstado', estado);
  },
  getVenta: async (ventaId: number): Promise<Venta> => {
    return await ipcRenderer.invoke('getVenta', ventaId);
  },
  createVenta: async (ventaData: Partial<Venta>): Promise<Venta> => {
    return await ipcRenderer.invoke('createVenta', ventaData);
  },
  updateVenta: async (ventaId: number, ventaData: Partial<Venta>): Promise<any> => {
    return await ipcRenderer.invoke('updateVenta', ventaId, ventaData);
  },
  deleteVenta: async (ventaId: number): Promise<any> => {
    return await ipcRenderer.invoke('deleteVenta', ventaId);
  },

  // VentaItem methods
  getVentaItems: async (ventaId: number): Promise<VentaItem[]> => {
    return await ipcRenderer.invoke('getVentaItems', ventaId);
  },
  getVentaItem: async (ventaItemId: number): Promise<VentaItem> => {
    return await ipcRenderer.invoke('getVentaItem', ventaItemId);
  },
  createVentaItem: async (ventaItemData: Partial<VentaItem>): Promise<VentaItem> => {
    return await ipcRenderer.invoke('createVentaItem', ventaItemData);
  },
  updateVentaItem: async (ventaItemId: number, ventaItemData: Partial<VentaItem>): Promise<any> => {
    return await ipcRenderer.invoke('updateVentaItem', ventaItemId, ventaItemData);
  },
  deleteVentaItem: async (ventaItemId: number): Promise<any> => {
    return await ipcRenderer.invoke('deleteVentaItem', ventaItemId);
  },

  // PdvGrupoCategoria methods
  getPdvGrupoCategorias: async (): Promise<PdvGrupoCategoria[]> => {
    return await ipcRenderer.invoke('getPdvGrupoCategorias');
  },
  getPdvGrupoCategoria: async (grupoCategoriaId: number): Promise<PdvGrupoCategoria> => {
    return await ipcRenderer.invoke('getPdvGrupoCategoria', grupoCategoriaId);
  },
  createPdvGrupoCategoria: async (grupoCategoriaData: Partial<PdvGrupoCategoria>): Promise<PdvGrupoCategoria> => {
    return await ipcRenderer.invoke('createPdvGrupoCategoria', grupoCategoriaData);
  },
  updatePdvGrupoCategoria: async (grupoCategoriaId: number, grupoCategoriaData: Partial<PdvGrupoCategoria>): Promise<any> => {
    return await ipcRenderer.invoke('updatePdvGrupoCategoria', grupoCategoriaId, grupoCategoriaData);
  },
  deletePdvGrupoCategoria: async (grupoCategoriaId: number): Promise<any> => {
    return await ipcRenderer.invoke('deletePdvGrupoCategoria', grupoCategoriaId);
  },

  // PdvCategoria methods
  getPdvCategorias: async (): Promise<PdvCategoria[]> => {
    return await ipcRenderer.invoke('getPdvCategorias');
  },
  getPdvCategoria: async (categoriaId: number): Promise<PdvCategoria> => {
    return await ipcRenderer.invoke('getPdvCategoria', categoriaId);
  },
  createPdvCategoria: async (categoriaData: Partial<PdvCategoria>): Promise<PdvCategoria> => {
    return await ipcRenderer.invoke('createPdvCategoria', categoriaData);
  },
  updatePdvCategoria: async (categoriaId: number, categoriaData: Partial<PdvCategoria>): Promise<any> => {
    return await ipcRenderer.invoke('updatePdvCategoria', categoriaId, categoriaData);
  },
  deletePdvCategoria: async (categoriaId: number): Promise<any> => {
    return await ipcRenderer.invoke('deletePdvCategoria', categoriaId);
  },

  // PdvCategoriaItem methods
  getPdvCategoriaItems: async (categoriaId: number): Promise<PdvCategoriaItem[]> => {
    return await ipcRenderer.invoke('getPdvCategoriaItems', categoriaId);
  },
  getPdvCategoriaItem: async (categoriaItemId: number): Promise<PdvCategoriaItem> => {
    return await ipcRenderer.invoke('getPdvCategoriaItem', categoriaItemId);
  },
  createPdvCategoriaItem: async (categoriaItemData: Partial<PdvCategoriaItem>): Promise<PdvCategoriaItem> => {
    return await ipcRenderer.invoke('createPdvCategoriaItem', categoriaItemData);
  },
  updatePdvCategoriaItem: async (categoriaItemId: number, categoriaItemData: Partial<PdvCategoriaItem>): Promise<any> => {
    return await ipcRenderer.invoke('updatePdvCategoriaItem', categoriaItemId, categoriaItemData);
  },
  deletePdvCategoriaItem: async (categoriaItemId: number): Promise<any> => {
    return await ipcRenderer.invoke('deletePdvCategoriaItem', categoriaItemId);
  },

  //PdvItemProducto methods
  getPdvItemProductos: async (itemProductoId: number): Promise<PdvItemProducto[]> => {
    return await ipcRenderer.invoke('getPdvItemProductos', itemProductoId);
  },
  getPdvItemProducto: async (itemProductoId: number): Promise<PdvItemProducto> => {
    return await ipcRenderer.invoke('getPdvItemProducto', itemProductoId);
  },
  createPdvItemProducto: async (itemProductoData: Partial<PdvItemProducto>): Promise<PdvItemProducto> => {
    return await ipcRenderer.invoke('createPdvItemProducto', itemProductoData);
  },
  updatePdvItemProducto: async (itemProductoId: number, itemProductoData: Partial<PdvItemProducto>): Promise<any> => {
    return await ipcRenderer.invoke('updatePdvItemProducto', itemProductoId, itemProductoData);
  },  
  deletePdvItemProducto: async (itemProductoId: number): Promise<any> => {
    return await ipcRenderer.invoke('deletePdvItemProducto', itemProductoId);
  },

  // PDV Config methods
  getPdvConfig: () => ipcRenderer.invoke('getPdvConfig'),
  createPdvConfig: (data: Partial<PdvConfig>) => ipcRenderer.invoke('createPdvConfig', data),
  updatePdvConfig: (id: number, data: Partial<PdvConfig>) => ipcRenderer.invoke('updatePdvConfig', id, data),

  // Reserva methods
  getReservas: async (): Promise<Reserva[]> => {
    return await ipcRenderer.invoke('getReservas');
  },
  getReservasActivas: async (): Promise<Reserva[]> => {
    return await ipcRenderer.invoke('getReservasActivas');
  },
  getReserva: async (id: number): Promise<Reserva> => {
    return await ipcRenderer.invoke('getReserva', id);
  },
  createReserva: async (data: Partial<Reserva>): Promise<Reserva> => {
    return await ipcRenderer.invoke('createReserva', data);
  },
  updateReserva: async (id: number, data: Partial<Reserva>): Promise<Reserva> => {
    return await ipcRenderer.invoke('updateReserva', id, data);
  },
  deleteReserva: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteReserva', id);
  },

  // PdvMesa methods
  getPdvMesas: async (): Promise<PdvMesa[]> => {
    return await ipcRenderer.invoke('getPdvMesas');
  },
  getPdvMesasActivas: async (): Promise<PdvMesa[]> => {
    return await ipcRenderer.invoke('getPdvMesasActivas');
  },
  getPdvMesasDisponibles: async (): Promise<PdvMesa[]> => {
    return await ipcRenderer.invoke('getPdvMesasDisponibles');
  },
  getPdvMesasBySector: async (sectorId: number): Promise<PdvMesa[]> => {
    return await ipcRenderer.invoke('getPdvMesasBySector', sectorId);
  },
  getPdvMesa: async (id: number): Promise<PdvMesa> => {
    return await ipcRenderer.invoke('getPdvMesa', id);
  },
  createPdvMesa: async (data: Partial<PdvMesa>): Promise<PdvMesa> => {
    return await ipcRenderer.invoke('createPdvMesa', data);
  },
  updatePdvMesa: async (id: number, data: Partial<PdvMesa>): Promise<PdvMesa> => {
    return await ipcRenderer.invoke('updatePdvMesa', id, data);
  },
  deletePdvMesa: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deletePdvMesa', id);
  },

  // Sector methods
  getSectores: async (): Promise<Sector[]> => {
    return await ipcRenderer.invoke('getSectores');
  },
  getSectoresActivos: async (): Promise<Sector[]> => {
    return await ipcRenderer.invoke('getSectoresActivos');
  },
  getSector: async (id: number): Promise<Sector> => {
    return await ipcRenderer.invoke('getSector', id);
  },
  createSector: async (data: Partial<Sector>): Promise<Sector> => {
    return await ipcRenderer.invoke('createSector', data);
  },
  updateSector: async (id: number, data: Partial<Sector>): Promise<Sector> => {
    return await ipcRenderer.invoke('updateSector', id, data);
  },
  deleteSector: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteSector', id);
  },

  // Comanda methods
  getComandas: async (): Promise<Comanda[]> => {
    return await ipcRenderer.invoke('getComandas');
  },
  getComandasActivas: async (): Promise<Comanda[]> => {
    return await ipcRenderer.invoke('getComandasActivas');
  },
  getComandasByMesa: async (mesaId: number): Promise<Comanda[]> => {
    return await ipcRenderer.invoke('getComandasByMesa', mesaId);
  },
  getComanda: async (id: number): Promise<Comanda> => {
    return await ipcRenderer.invoke('getComanda', id);
  },
  createComanda: async (data: Partial<Comanda>): Promise<Comanda> => {
    return await ipcRenderer.invoke('createComanda', data);
  },
  updateComanda: async (id: number, data: Partial<Comanda>): Promise<Comanda> => {
    return await ipcRenderer.invoke('updateComanda', id, data);
  },
  deleteComanda: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteComanda', id);
  }
});
