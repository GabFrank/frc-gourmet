// Preload script that will be executed before rendering the application
const { contextBridge, ipcRenderer } = require('electron');

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
}); 