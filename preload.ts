// Preload script that will be executed before rendering the application
import { contextBridge, ipcRenderer } from 'electron';
import { EstadoVentaItem } from './src/app/database/entities/ventas/venta-item.entity';

// =====================================================================
// F4: invokeRouter — sustituye ipcRenderer.invoke en mode === 'client'.
//
// En modo standalone/server: pasa directo al ipcRenderer.invoke local.
// En modo cliente: hace fetch contra el server HTTP (POST /api/rpc),
// con auto-refresh del JWT al recibir 401, y especial-casing para
// los channels de auth (login/logout) que van a /api/auth/*.
//
// Channel allowlist `ALWAYS_LOCAL_CHANNELS`: handlers que siempre van
// por IPC aunque estemos en cliente (impresoras locales, file dialogs,
// system info — operaciones que el cliente debe ejecutar en su propia
// maquina, no en el server).
// =====================================================================

const APP_MODE = (process.env['FRC_APP_MODE'] as 'standalone' | 'server' | 'client') || 'standalone';
const SERVER_URL = process.env['FRC_SERVER_URL'] || '';
// F5 paso 3: deviceId del cliente, set por main.ts via app-settings.json.
// Se inyecta en /api/auth/login + /api/auth/refresh asi el server lo firma
// en el JWT y los handlers de creacion lo persisten. Null si la wizard aun
// no lo configuro — el server lo dejara null (columna nullable).
const CLIENT_DEVICE_ID: number | null = (() => {
  const raw = process.env['FRC_DEVICE_ID'];
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

// IMPORTANTE: guardar la referencia original ANTES de monkey-patchear
// (sino: invokeRouter -> ipcRenderer.invoke (== invokeRouter) -> recursion infinita)
const _originalInvoke = ipcRenderer.invoke.bind(ipcRenderer);

const ALWAYS_LOCAL_CHANNELS = new Set<string>([
  // Impresoras / hardware local del cliente
  'print-receipt',
  'print-test-page',
  'get-printers',
  // User session local (no JWT — el current-user se setea local tras login)
  'getCurrentUser',
  'setCurrentUser',
  // Config local (cambian el modo del cliente, no del server)
  'app-mode-get',
  'app-mode-save',
  'app-mode-test-server',
  'db-config-get',
  'db-config-save',
  'db-config-test-connection',
  'db-config-restart-app',
  // Backup local
  'backup-list',
  'backup-create',
  'backup-restore',
  // Logs locales
  'log-error',
]);

let accessToken: string | null = null;
let refreshToken: string | null = null;

async function httpFetch(path: string, body: any, withAuth = true): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const url = `${SERVER_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err: any = new Error(`HTTP ${res.status}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function refreshAccessIfPossible(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    // F5 paso 3: reenvio deviceId para que el JWT nuevo lo siga llevando.
    const body: any = { refreshToken };
    if (CLIENT_DEVICE_ID != null) body.deviceId = CLIENT_DEVICE_ID;
    const data = await httpFetch('/api/auth/refresh', body, false);
    accessToken = data.accessToken;
    refreshToken = data.refreshToken || refreshToken;
    return true;
  } catch {
    accessToken = null;
    refreshToken = null;
    return false;
  }
}

async function invokeRouter(channel: string, ...args: any[]): Promise<any> {
  // Local channels o cualquier modo no-cliente → IPC directo (referencia
  // original, no la reemplazada — sino recursion infinita)
  if (APP_MODE !== 'client' || ALWAYS_LOCAL_CHANNELS.has(channel)) {
    return _originalInvoke(channel, ...args);
  }

  // Login special case
  if (channel === 'login') {
    const loginData = { ...(args[0] || {}) };
    // F5 paso 3: agregar deviceId al body si el cliente lo tiene configurado.
    if (CLIENT_DEVICE_ID != null && loginData.deviceId == null) {
      loginData.deviceId = CLIENT_DEVICE_ID;
    }
    const data = await httpFetch('/api/auth/login', loginData, false);
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    // El renderer espera el shape de la IPC (success/usuario/token/sessionId/message)
    return {
      success: data.success,
      usuario: data.usuario,
      token: data.accessToken,
      sessionId: data.sessionId,
      message: 'Inicio de sesion exitoso',
    };
  }
  // Logout special case
  if (channel === 'logout' || channel === 'logout-session') {
    try { await httpFetch('/api/auth/logout', { refreshToken }, false); } catch {}
    accessToken = null;
    refreshToken = null;
    return true;
  }

  // RPC genérico
  const doRpc = async () => httpFetch('/api/rpc', { method: channel, params: args }, true);
  try {
    const data = await doRpc();
    return data.result;
  } catch (err: any) {
    if (err?.status === 401 && refreshToken) {
      const ok = await refreshAccessIfPossible();
      if (ok) {
        const data = await doRpc();
        return data.result;
      }
    }
    throw err;
  }
}

// Replace ipcRenderer.invoke con invokeRouter en cliente, transparente al resto.
if (APP_MODE === 'client') {
  console.log(`[preload] mode=client → invokeRouter via HTTP @ ${SERVER_URL}`);
  (ipcRenderer as any).invoke = invokeRouter;
} else {
  console.log(`[preload] mode=${APP_MODE} → IPC directo`);
}

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

// Productos interfaces - Updated to match new structure
interface Familia {
  id?: number;
  nombre: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Subfamilia {
  id?: number;
  nombre: string;
  familia: Familia;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Adicional {
  id?: number;
  nombre: string;
  precioBase: number;
  activo: boolean;
  categoria?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RecetaAdicionalVinculacion {
  id?: number;
  precioAdicional: number;
  cantidad: number;
  unidad: string;
  unidadOriginal?: string;
  activo: boolean;
  receta: Receta;
  adicional: Adicional;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RecetaIngredienteIntercambiable {
  id?: number;
  recetaIngrediente: RecetaIngrediente;
  ingredienteOpcion: Producto;
  costoExtra?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Observacion {
  id?: number;
  descripcion: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProductoObservacion {
  id?: number;
  producto: Producto;
  observacion: Observacion;
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

interface producto {
  id?: number;
  nombre: string;
  tipo: 'RETAIL' | 'ELABORADO' | 'INGREDIENTE' | 'COMBO' | 'BASE';
  unidadBase?: string;
  subfamilia: Subfamilia;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Keep Producto for compatibility with existing interfaces
interface Producto {
  id?: number;
  nombre: string;
  tipo: 'RETAIL' | 'ELABORADO' | 'INGREDIENTE' | 'COMBO' | 'BASE';
  unidadBase?: string;
  subfamilia: Subfamilia;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Presentacion interface - Updated
interface Presentacion {
  id?: number;
  nombre: string;
  cantidad: number;
  unidad: string;
  producto: Producto;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Codigo Barra interface - Updated
interface CodigoBarra {
  id?: number;
  codigo: string;
  presentacion: Presentacion;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

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
  nombre: string;
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

// Additional Productos interfaces
interface PrecioCosto {
  id?: number;
  fuente: 'COMPRA' | 'MANUAL' | 'AJUSTE_RECETA';
  valor: number;
  fecha: Date;
  producto?: Producto;
  receta?: Receta;
  moneda: Moneda;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RecetaIngrediente {
  id?: number;
  cantidad: number;
  unidad: string;
  esExtra: boolean;
  esOpcional: boolean;
  esCambiable: boolean;
  costoExtra?: number;
  receta: Receta;
  ingrediente: Producto;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface StockMovimiento {
  id?: number;
  cantidad: number;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'TRANSFERENCIA';
  referencia?: number;
  tipoReferencia: 'VENTA' | 'COMPRA' | 'PRODUCCION' | 'AJUSTE' | 'TRANSFERENCIA';
  observaciones?: string;
  fecha: Date;
  producto: Producto;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ConversionMoneda {
  id?: number;
  fechaInicio: Date;
  fechaFin?: Date;
  factor: number;
  monedaOrigen: Moneda;
  monedaDestino: Moneda;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ConfiguracionMonetaria {
  id?: number;
  monedaPrincipal: Moneda;
  precisonDecimales: number;
  simboloMoneda: string;
  posicionSimbolo: 'ANTES' | 'DESPUES';
  separadorMiles: string;
  separadorDecimales: string;
  redondeoVentas: 'SIN_REDONDEO' | 'REDONDEAR_5' | 'REDONDEAR_10';
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Receta interface
interface Receta {
  id?: number;
  nombre: string;
  descripcion?: string;
  costoCalculado?: number;
  rendimiento?: number;
  unidadRendimiento?: string;
  unidadRendimientoOriginal?: string;
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
  precioCostoUnitario: number;
  precioVentaUnitario: number;
  precioVentaPresentacion: PrecioVenta;
  producto: Producto;
  presentacion: Presentacion;
  cantidad: number;
  descuentoUnitario: number;
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

// Comanda interface (tarjeta de cuenta individual)
interface Comanda {
  id?: number;
  codigo: string;
  numero: number;
  estado: string;
  descripcion?: string;
  observacion?: string;
  pdv_mesa?: PdvMesa;
  sector?: Sector;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  venta?: Venta;
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

// Add interfaces for new entities
interface Observacion {
  id?: number;
  nombre: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ObservacionProducto {
  id?: number;
  productoId: number;
  producto?: Producto;
  observacionId: number;
  observacion?: Observacion;
  obligatorio: boolean;
  cantidadDefault?: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ObservacionProductoVentaItem {
  id?: number;
  observacionProductoId: number;
  observacionProducto?: ObservacionProducto;
  ventaItemId: number;
  ventaItem?: VentaItem;
  cantidad: number;
  createdAt?: Date;
  updatedAt?: Date;
}



interface ProductoAdicional {
  id?: number;
  productoId: number;
  producto?: Producto;
  presentacionId: number;
  presentacion?: Presentacion;
  adicionalId: number;
  adicional?: Adicional;
  cantidadDefault?: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProductoAdicionalVentaItem {
  id?: number;
  productoAdicionalId: number;
  productoAdicional?: ProductoAdicional;
  ventaItemId: number;
  ventaItem?: VentaItem;
  cantidad: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ProductoAdicionalVentaItem interface
interface ProductoAdicionalVentaItem {
  id?: number;
  productoAdicionalId: number;
  productoAdicional?: ProductoAdicional;
  ventaItemId: number;
  ventaItem?: VentaItem;
  cantidad: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// CostoPorProducto interface
interface CostoPorProducto {
  id?: number;
  productoId: number;
  producto?: Producto;
  // origenCosto: OrigenCosto;
  monedaId: number;
  moneda?: Moneda;
  valor: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Observacion interface
interface Observacion {
  id?: number;
  nombre: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ObservacionProducto interface
interface ObservacionProducto {
  id?: number;
  productoId: number;
  producto?: Producto;
  observacionId: number;
  observacion?: Observacion;
  obligatorio: boolean;
  cantidadDefault?: number;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // F2/F4: app-mode resolver para que el RepositoryService factory decida
  // entre IpcService (standalone/server) y HttpService (cliente).
  // Esto NO va por IPC porque tiene que ser sincrónico (factory de Angular DI
  // se ejecuta en boot). Se resuelve en preload via env vars que main.ts
  // setea antes que el renderer cargue.
  getAppMode: (): 'standalone' | 'server' | 'client' => {
    const mode = process.env['FRC_APP_MODE'];
    if (mode === 'client' || mode === 'server') return mode;
    return 'standalone';
  },
  // F4: URL del server cuando mode === 'client'. Para que el HttpService
  // sepa contra dónde apuntar.
  getServerUrl: (): string | null => {
    return process.env['FRC_SERVER_URL'] || null;
  },
  // F5 paso 3: deviceId configurado en este PC (snapshot del boot). El
  // wizard de modo lo guarda en app-settings.json y main.ts lo expone.
  getDeviceId: (): number | null => {
    const raw = process.env['FRC_DEVICE_ID'];
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  },

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
  validateCredentials: async (data: { nickname: string, password: string }): Promise<any> => {
    return await ipcRenderer.invoke('validate-credentials', data);
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

  // === Generic files API (sirve cualquier carpeta `userData/<X>/`) ===
  saveFile: async (input: { carpeta: string; base64: string; fileName: string; generateThumbnails?: boolean }): Promise<any> => {
    return await ipcRenderer.invoke('save-file', input);
  },
  deleteFile: async (url: string): Promise<{ ok: boolean }> => {
    return await ipcRenderer.invoke('delete-file', { url });
  },
  readFileBase64: async (url: string): Promise<{ base64: string; mimeType: string }> => {
    return await ipcRenderer.invoke('read-file-base64', { url });
  },
  openFileWithSystem: async (url: string): Promise<{ ok: boolean; error?: string }> => {
    return await ipcRenderer.invoke('open-file-with-system', { url });
  },

  // === Adjuntos polimorficos ===
  getAdjuntos: async (params: { entidadTipo: string; entidadId: number }): Promise<any[]> => {
    return await ipcRenderer.invoke('get-adjuntos', params);
  },
  createAdjunto: async (data: { entidadTipo: string; entidadId: number; tipo?: string; archivoUrl: string; nombreArchivo: string; mimeType?: string; tamanoBytes?: number; observacion?: string }): Promise<any> => {
    return await ipcRenderer.invoke('create-adjunto', data);
  },
  updateAdjunto: async (id: number, data: { tipo?: string; observacion?: string }): Promise<any> => {
    return await ipcRenderer.invoke('update-adjunto', id, data);
  },
  deleteAdjunto: async (id: number): Promise<{ success: boolean; message?: string }> => {
    return await ipcRenderer.invoke('delete-adjunto', id);
  },

  // Utility functions
  on: (channel: string, callback: (data: any) => void): void => {
    // Deliberately strip event as it includes `sender`
    ipcRenderer.on(channel, (_event: any, data: any) => callback(data));
  },

  // Moneda methods
  getMonedas: async (): Promise<Moneda[]> => {
    return await ipcRenderer.invoke('get-monedas');
  },
  getMoneda: async (monedaId: number): Promise<Moneda> => {
    return await ipcRenderer.invoke('get-moneda', monedaId);
  },
  getMonedaPrincipal: async (): Promise<Moneda> => {
    return await ipcRenderer.invoke('get-moneda-principal');
  },
  createMoneda: async (monedaData: any): Promise<Moneda> => {
    return await ipcRenderer.invoke('create-moneda', monedaData);
  },
  updateMoneda: async (monedaId: number, monedaData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-moneda', monedaId, monedaData);
  },
  deleteMoneda: async (monedaId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-moneda', monedaId);
  },
  // TipoPrecio methods
  getTiposPrecio: async (): Promise<TipoPrecio[]> => {
    return await ipcRenderer.invoke('get-tipo-precios');
  },
  getTipoPrecio: async (tipoPrecioId: number): Promise<TipoPrecio> => {
    return await ipcRenderer.invoke('get-tipo-precio', tipoPrecioId);
  },
  createTipoPrecio: async (tipoPrecioData: any): Promise<TipoPrecio> => {
    return await ipcRenderer.invoke('create-tipo-precio', tipoPrecioData);
  },
  updateTipoPrecio: async (tipoPrecioId: number, tipoPrecioData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-tipo-precio', tipoPrecioId, tipoPrecioData);
  },
  deleteTipoPrecio: async (tipoPrecioId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-tipo-precio', tipoPrecioId);
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
  getMonedaCambioByMonedaPrincipal: async () => {
    return await ipcRenderer.invoke('get-moneda-cambio-by-moneda-principal');
  },
  getValorEnMonedaPrincipal: async (monedaId: number, valor: number) => {
    return await ipcRenderer.invoke('get-valor-en-moneda-principal', monedaId, valor);
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

  // Compra workflow (borrador, finalizar, anular)
  getComprasPaginado: async (params: any) => {
    return await ipcRenderer.invoke('get-compras-paginado', params);
  },
  createCompraBorrador: async (data: any) => {
    return await ipcRenderer.invoke('create-compra-borrador', data);
  },
  updateCompraBorrador: async (id: number, data: any) => {
    return await ipcRenderer.invoke('update-compra-borrador', id, data);
  },
  finalizarCompra: async (id: number, payload: any) => {
    return await ipcRenderer.invoke('finalizar-compra', id, payload);
  },
  anularCompra: async (id: number, motivo: string) => {
    return await ipcRenderer.invoke('anular-compra', id, motivo);
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
  getProveedorProductosPaginado: async (params: any) => {
    return await ipcRenderer.invoke('getProveedorProductosPaginado', params);
  },
  getUltimasComprasProducto: async (params: any) => {
    return await ipcRenderer.invoke('getUltimasComprasProducto', params);
  },
  getUltimoCostoProducto: async (params: any) => {
    return await ipcRenderer.invoke('getUltimoCostoProducto', params);
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
  getDeliveriesByCaja: async (cajaId: number, filtros?: any): Promise<{ data: any[], total: number }> => {
    return await ipcRenderer.invoke('getDeliveriesByCaja', cajaId, filtros);
  },
  buscarClientePorTelefono: async (telefono: string): Promise<any> => {
    return await ipcRenderer.invoke('buscar-cliente-por-telefono', telefono);
  },
  buscarClientesPorTelefono: async (telefono: string): Promise<any[]> => {
    return await ipcRenderer.invoke('buscar-clientes-por-telefono', telefono);
  },
  crearClienteRapido: async (data: { telefono: string; nombre?: string; direccion?: string }): Promise<any> => {
    return await ipcRenderer.invoke('crear-cliente-rapido', data);
  },

  // Cerrar ventas abiertas de una mesa
  cerrarVentasAbiertasMesa: async (mesaId: number, estado: string): Promise<number> => {
    return await ipcRenderer.invoke('cerrarVentasAbiertasMesa', mesaId, estado);
  },

  // Venta methods
  getVentas: async (): Promise<Venta[]> => {
    return await ipcRenderer.invoke('getVentas');
  },
  getVentasByDateRange: async (desde: string, hasta: string, filtros?: any): Promise<Venta[]> => {
    return await ipcRenderer.invoke('getVentasByDateRange', desde, hasta, filtros);
  },
  getVentasByCaja: async (cajaId: number): Promise<Venta[]> => {
    return await ipcRenderer.invoke('getVentasByCaja', cajaId);
  },
  getResumenCaja: async (cajaId: number): Promise<any> => {
    return await ipcRenderer.invoke('getResumenCaja', cajaId);
  },
  getVentasTotalByCaja: async (cajaId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getVentasTotalByCaja', cajaId);
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

  // VentaItemObservacion methods
  getObservacionesByVentaItem: async (ventaItemId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getObservacionesByVentaItem', ventaItemId);
  },
  createVentaItemObservacion: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createVentaItemObservacion', data);
  },
  deleteVentaItemObservacion: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteVentaItemObservacion', id);
  },

  // VentaItemAdicional methods
  getVentaItemAdicionales: async (ventaItemId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getVentaItemAdicionales', ventaItemId);
  },
  createVentaItemAdicional: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createVentaItemAdicional', data);
  },
  deleteVentaItemAdicional: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteVentaItemAdicional', id);
  },

  // VentaItemIngredienteModificacion methods
  getVentaItemIngredienteModificaciones: async (ventaItemId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getVentaItemIngredienteModificaciones', ventaItemId);
  },
  createVentaItemIngredienteModificacion: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createVentaItemIngredienteModificacion', data);
  },
  deleteVentaItemIngredienteModificacion: async (id: number): Promise<boolean> => {
    return await ipcRenderer.invoke('deleteVentaItemIngredienteModificacion', id);
  },

  // VentaItemSabor methods (multi-sabor / variaciones)
  createVentaItemSabor: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createVentaItemSabor', data);
  },
  getVentaItemSabores: async (ventaItemId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getVentaItemSabores', ventaItemId);
  },
  deleteVentaItemSaboresByItem: async (ventaItemId: number): Promise<any> => {
    return await ipcRenderer.invoke('deleteVentaItemSaboresByItem', ventaItemId);
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
  getPdvCategoriasByGrupo: async (grupoId: number): Promise<PdvCategoria[]> => {
    return await ipcRenderer.invoke('getPdvCategoriasByGrupo', grupoId);
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
  getPdvCategoriaItemsByCategoria: async (categoriaId: number): Promise<PdvCategoriaItem[]> => {
    return await ipcRenderer.invoke('getPdvCategoriaItemsByCategoria', categoriaId);
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
  createBatchPdvMesas: async (batchData: Partial<PdvMesa>[]): Promise<PdvMesa[]> => {
    return await ipcRenderer.invoke('createBatchPdvMesas', batchData);
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

  // Comanda methods (tarjetas de cuenta individual)
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
  },
  getComandasDisponibles: async (): Promise<Comanda[]> => {
    return await ipcRenderer.invoke('getComandasDisponibles');
  },
  getComandasOcupadas: async (): Promise<Comanda[]> => {
    return await ipcRenderer.invoke('getComandasOcupadas');
  },
  getComandasBySector: async (sectorId: number): Promise<Comanda[]> => {
    return await ipcRenderer.invoke('getComandasBySector', sectorId);
  },
  abrirComanda: async (comandaId: number, data: { mesaId?: number, sectorId?: number, observacion?: string }): Promise<Comanda> => {
    return await ipcRenderer.invoke('abrirComanda', comandaId, data);
  },
  cerrarComanda: async (comandaId: number): Promise<Comanda> => {
    return await ipcRenderer.invoke('cerrarComanda', comandaId);
  },
  createBatchComandas: async (batchData: any[]): Promise<Comanda[]> => {
    return await ipcRenderer.invoke('createBatchComandas', batchData);
  },
  getComandaWithVenta: async (comandaId: number): Promise<Comanda | null> => {
    return await ipcRenderer.invoke('getComandaWithVenta', comandaId);
  },

  // New search methods
  searchIngredientes: async (query: string) => {
    return await ipcRenderer.invoke('searchIngredientes', query);
  },
  searchRecetas: async (query: string) => {
    return await ipcRenderer.invoke('searchRecetas', query);
  },

  // CostoPorProducto methods
  getCostosPorProducto: () => ipcRenderer.invoke('getCostosPorProducto'),
  getCostosPorProductoByProducto: (productoId: number) => ipcRenderer.invoke('getCostosPorProductoByProducto', productoId),
  getCostoPorProducto: (id: number) => ipcRenderer.invoke('getCostoPorProducto', id),
  createCostoPorProducto: (data: any) => ipcRenderer.invoke('createCostoPorProducto', data),
  updateCostoPorProducto: (id: number, data: any) => ipcRenderer.invoke('updateCostoPorProducto', id, data),
  deleteCostoPorProducto: (id: number) => ipcRenderer.invoke('deleteCostoPorProducto', id),

  // Observacion methods
  getObservaciones: async (): Promise<Observacion[]> => {
    return await ipcRenderer.invoke('getObservaciones');
  },
  searchObservaciones: async (search: string): Promise<Observacion[]> => {
    return await ipcRenderer.invoke('searchObservaciones', search);
  },
  getObservacion: async (id: number): Promise<Observacion> => {
    return await ipcRenderer.invoke('getObservacion', id);
  },
  createObservacion: async (data: Partial<Observacion>): Promise<Observacion> => {
    return await ipcRenderer.invoke('createObservacion', data);
  },
  updateObservacion: async (id: number, data: Partial<Observacion>): Promise<any> => {
    return await ipcRenderer.invoke('updateObservacion', id, data);
  },
  deleteObservacion: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('deleteObservacion', id);
  },
  getObservacionesByProducto: async (productoId: number): Promise<ProductoObservacion[]> => {
    return await ipcRenderer.invoke('get-observaciones-by-producto', productoId);
  },
  createProductoObservacion: async (data: Partial<ProductoObservacion>): Promise<ProductoObservacion> => {
    return await ipcRenderer.invoke('create-producto-observacion', data);
  },
  deleteProductoObservacion: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-producto-observacion', id);
  },

  // Combo methods
  getComboByProducto: async (productoId: number): Promise<any> => {
    return await ipcRenderer.invoke('getComboByProducto', productoId);
  },
  createCombo: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createCombo', data);
  },
  updateCombo: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('updateCombo', id, data);
  },
  deleteCombo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('deleteCombo', id);
  },
  getComboProductos: async (comboId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getComboProductos', comboId);
  },
  createComboProducto: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createComboProducto', data);
  },
  updateComboProducto: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('updateComboProducto', id, data);
  },
  deleteComboProducto: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('deleteComboProducto', id);
  },

  // Adicional methods (Nueva Arquitectura)
  getAdicionales: async (): Promise<Adicional[]> => {
    return await ipcRenderer.invoke('get-adicionales');
  },
  getAdicionalesWithFilters: async (filters: {
    search?: string;
    activo?: boolean | null;
    categoria?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{items: Adicional[], total: number, page: number, pageSize: number}> => {
    return await ipcRenderer.invoke('get-adicionales-with-filters', filters);
  },
  getAdicional: async (adicionalId: number): Promise<Adicional> => {
    return await ipcRenderer.invoke('get-adicional', adicionalId);
  },
  createAdicional: async (data: Partial<Adicional>): Promise<Adicional> => {
    return await ipcRenderer.invoke('create-adicional', data);
  },
  updateAdicional: async (id: number, data: Partial<Adicional>): Promise<any> => {
    return await ipcRenderer.invoke('update-adicional', id, data);
  },
  deleteAdicional: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-adicional', id);
  },

  // RecetaAdicionalVinculacion methods (Nueva Arquitectura)
  getRecetaAdicionalVinculaciones: async (recetaId: number): Promise<RecetaAdicionalVinculacion[]> => {
    return await ipcRenderer.invoke('get-receta-adicional-vinculaciones', recetaId);
  },
  getRecetaAdicionalVinculacion: async (vinculacionId: number): Promise<RecetaAdicionalVinculacion> => {
    return await ipcRenderer.invoke('get-receta-adicional-vinculacion', vinculacionId);
  },
  createRecetaAdicionalVinculacion: async (data: Partial<RecetaAdicionalVinculacion>): Promise<RecetaAdicionalVinculacion> => {
    return await ipcRenderer.invoke('create-receta-adicional-vinculacion', data);
  },
  updateRecetaAdicionalVinculacion: async (id: number, data: Partial<RecetaAdicionalVinculacion>): Promise<any> => {
    return await ipcRenderer.invoke('update-receta-adicional-vinculacion', id, data);
  },
  deleteRecetaAdicionalVinculacion: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-receta-adicional-vinculacion', id);
  },

  // RecetaIngredienteIntercambiable methods
  getRecetaIngredientesIntercambiables: async (recetaIngredienteId: number): Promise<RecetaIngredienteIntercambiable[]> => {
    return await ipcRenderer.invoke('get-receta-ingredientes-intercambiables', recetaIngredienteId);
  },
  createRecetaIngredienteIntercambiable: async (data: Partial<RecetaIngredienteIntercambiable>): Promise<RecetaIngredienteIntercambiable> => {
    return await ipcRenderer.invoke('create-receta-ingrediente-intercambiable', data);
  },
  updateRecetaIngredienteIntercambiable: async (id: number, data: Partial<RecetaIngredienteIntercambiable>): Promise<any> => {
    return await ipcRenderer.invoke('update-receta-ingrediente-intercambiable', id, data);
  },
  deleteRecetaIngredienteIntercambiable: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-receta-ingrediente-intercambiable', id);
  },

  // === PRODUCTOS METHODS ===

  // Familia methods
  getFamilias: async (): Promise<Familia[]> => {
    return await ipcRenderer.invoke('get-familias');
  },
  getFamilia: async (familiaId: number): Promise<Familia> => {
    return await ipcRenderer.invoke('get-familia', familiaId);
  },
  createFamilia: async (familiaData: any): Promise<Familia> => {
    return await ipcRenderer.invoke('create-familia', familiaData);
  },
  updateFamilia: async (familiaId: number, familiaData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-familia', familiaId, familiaData);
  },
  deleteFamilia: async (familiaId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-familia', familiaId);
  },

  // Subfamilia methods
  getSubfamilias: async (): Promise<Subfamilia[]> => {
    return await ipcRenderer.invoke('get-subfamilias');
  },
  getSubfamiliasByFamilia: async (familiaId: number): Promise<Subfamilia[]> => {
    return await ipcRenderer.invoke('get-subfamilias-by-familia', familiaId);
  },
  getSubfamilia: async (subfamiliaId: number): Promise<Subfamilia> => {
    return await ipcRenderer.invoke('get-subfamilia', subfamiliaId);
  },
  createSubfamilia: async (subfamiliaData: any): Promise<Subfamilia> => {
    return await ipcRenderer.invoke('create-subfamilia', subfamiliaData);
  },
  updateSubfamilia: async (subfamiliaId: number, subfamiliaData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-subfamilia', subfamiliaId, subfamiliaData);
  },
  deleteSubfamilia: async (subfamiliaId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-subfamilia', subfamiliaId);
  },

  // Producto methods
  getProductos: async (): Promise<Producto[]> => {
    return await ipcRenderer.invoke('get-productos');
  },
  getProductosWithFilters: async (filters: {
    search?: string;
    tipo?: string;
    activo?: string;
    esVendible?: string;
    esComprable?: string;
    controlaStock?: string;
    esIngrediente?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{items: Producto[], total: number}> => {
    return await ipcRenderer.invoke('get-productos-with-filters', filters);
  },
  getProducto: async (productoId: number): Promise<Producto> => {
    return await ipcRenderer.invoke('get-producto', productoId);
  },
  createProducto: async (productoData: any): Promise<Producto> => {
    return await ipcRenderer.invoke('create-producto', productoData);
  },
  updateProducto: async (productoId: number, productoData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-producto', productoId, productoData);
  },
  deleteProducto: async (productoId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-producto', productoId);
  },

  // Presentacion methods
  getPresentaciones: async (): Promise<Presentacion[]> => {
    return await ipcRenderer.invoke('get-presentaciones');
  },
  getPresentacionesByProducto: async (productoId: number, page = 0, pageSize = 10, filtroActivo = 'activos'): Promise<any> => {
    return await ipcRenderer.invoke('get-presentaciones-by-producto', productoId, page, pageSize, filtroActivo);
  },
  getPresentacion: async (presentacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('get-presentacion', presentacionId);
  },
  createPresentacion: async (presentacionData: any): Promise<Presentacion> => {
    return await ipcRenderer.invoke('create-presentacion', presentacionData);
  },
  updatePresentacion: async (presentacionId: number, presentacionData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-presentacion', presentacionId, presentacionData);
  },
  deletePresentacion: async (presentacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-presentacion', presentacionId);
  },
  setPresentacionPrincipal: async (presentacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('set-presentacion-principal', presentacionId);
  },
  togglePresentacionActivo: async (presentacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('toggle-presentacion-activo', presentacionId);
  },

  // CodigoBarra methods
  createCodigoBarra: async (codigoBarraData: any): Promise<CodigoBarra> => {
    return await ipcRenderer.invoke('create-codigo-barra', codigoBarraData);
  },
  updateCodigoBarra: async (codigoBarraId: number, codigoBarraData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-codigo-barra', codigoBarraId, codigoBarraData);
  },
  deleteCodigoBarra: async (codigoBarraId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-codigo-barra', codigoBarraId);
  },
  getCodigosBarraByPresentacion: async (presentacionId: number): Promise<CodigoBarra[]> => {
    return await ipcRenderer.invoke('get-codigos-barra-by-presentacion', presentacionId);
  },
  searchProductosByCodigo: async (codigo: string): Promise<any> => {
    return await ipcRenderer.invoke('search-productos-by-codigo', codigo);
  },

  // PrecioVenta methods
  getPreciosVenta: async (): Promise<PrecioVenta[]> => {
    return await ipcRenderer.invoke('get-precios-venta');
  },
  getPreciosVentaByPresentacion: async (presentacionId: number, activo: boolean): Promise<PrecioVenta[]> => {
    return await ipcRenderer.invoke('get-precios-venta-by-presentacion', presentacionId, activo);
  },
  getPreciosVentaByReceta: async (recetaId: number, activo: boolean): Promise<PrecioVenta[]> => {
    return await ipcRenderer.invoke('get-precios-venta-by-receta', recetaId, activo);
  },
  getPreciosVentaByProducto: async (productoId: number, activo: boolean): Promise<PrecioVenta[]> => {
    return await ipcRenderer.invoke('get-precios-venta-by-producto', productoId, activo);
  },
  createPrecioVenta: async (precioVentaData: any): Promise<PrecioVenta> => {
    return await ipcRenderer.invoke('create-precio-venta', precioVentaData);
  },
  updatePrecioVenta: async (precioVentaId: number, precioVentaData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-precio-venta', precioVentaId, precioVentaData);
  },
  deletePrecioVenta: async (precioVentaId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-precio-venta', precioVentaId);
  },

  // PrecioCosto methods
  getPreciosCosto: async (): Promise<PrecioCosto[]> => {
    return await ipcRenderer.invoke('get-precios-costo');
  },
  getPreciosCostoByProducto: async (productoId: number): Promise<PrecioCosto[]> => {
    return await ipcRenderer.invoke('get-precios-costo-by-producto', productoId);
  },
  createPrecioCosto: async (precioCostoData: any): Promise<PrecioCosto> => {
    return await ipcRenderer.invoke('create-precio-costo', precioCostoData);
  },
  updatePrecioCosto: async (precioCostoId: number, precioCostoData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-precio-costo', precioCostoId, precioCostoData);
  },
  deletePrecioCosto: async (precioCostoId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-precio-costo', precioCostoId);
  },

  // Receta methods
  getRecetas: async (): Promise<Receta[]> => {
    return await ipcRenderer.invoke('get-recetas');
  },
  getRecetasWithFilters: async (filters: {
    search?: string;
    activo?: boolean | null;
    page?: number;
    pageSize?: number;
  }): Promise<{items: Receta[], total: number, page: number, pageSize: number}> => {
    return await ipcRenderer.invoke('get-recetas-with-filters', filters);
  },
  getReceta: async (recetaId: number): Promise<Receta> => {
    return await ipcRenderer.invoke('get-receta', recetaId);
  },
  createReceta: async (recetaData: any): Promise<Receta> => {
    return await ipcRenderer.invoke('create-receta', recetaData);
  },
  updateReceta: async (recetaId: number, recetaData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-receta', recetaId, recetaData);
  },
  checkRecetaDependencies: async (recetaId: number): Promise<{
    receta: { id: number; nombre: string };
    productosVinculados: Array<{ id: number; nombre: string; tipo: string; activo: boolean }>;
  }> => {
    return await ipcRenderer.invoke('check-receta-dependencies', recetaId);
  },
  deleteReceta: async (recetaId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-receta', recetaId);
  },

  // Receta additional methods
  getRecetasByEstado: async (activo: boolean | null): Promise<Receta[]> => {
    return await ipcRenderer.invoke('get-recetas-by-estado', activo);
  },
  searchRecetasByNombre: async (nombre: string): Promise<Receta[]> => {
    return await ipcRenderer.invoke('search-recetas-by-nombre', nombre);
  },
  getRecetasWithIngredientes: async (): Promise<Receta[]> => {
    return await ipcRenderer.invoke('get-recetas-with-ingredientes');
  },
  calcularCostoReceta: async (recetaId: number): Promise<number> => {
    return await ipcRenderer.invoke('calcular-costo-receta', recetaId);
  },
  actualizarCostoReceta: async (recetaId: number): Promise<any> => {
    return await ipcRenderer.invoke('actualizar-costo-receta', recetaId);
  },

  // RecetaIngrediente methods
  getRecetaIngredientes: async (recetaId: number): Promise<RecetaIngrediente[]> => {
    return await ipcRenderer.invoke('get-receta-ingredientes', recetaId);
  },
  createRecetaIngrediente: async (recetaIngredienteData: any): Promise<RecetaIngrediente> => {
    return await ipcRenderer.invoke('create-receta-ingrediente', recetaIngredienteData);
  },
  updateRecetaIngrediente: async (recetaIngredienteId: number, recetaIngredienteData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-receta-ingrediente', recetaIngredienteId, recetaIngredienteData);
  },
  deleteRecetaIngrediente: async (recetaIngredienteId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-receta-ingrediente', recetaIngredienteId);
  },
  deleteRecetaIngredienteMultiplesVariaciones: async (data: {
    recetaIngredienteId: number;
    eliminarDeOtrasVariaciones: boolean;
  }): Promise<any> => {
    return await ipcRenderer.invoke('delete-receta-ingrediente-multiples-variaciones', data);
  },

  // RecetaIngrediente additional methods
  getRecetaIngredientesActivos: async (recetaId: number): Promise<RecetaIngrediente[]> => {
    return await ipcRenderer.invoke('get-receta-ingredientes-activos', recetaId);
  },
  calcularCostoIngrediente: async (recetaIngredienteId: number): Promise<number> => {
    return await ipcRenderer.invoke('calcular-costo-ingrediente', recetaIngredienteId);
  },
  validarStockIngrediente: async (recetaIngredienteId: number): Promise<boolean> => {
    return await ipcRenderer.invoke('validar-stock-ingrediente', recetaIngredienteId);
  },
  recalculateAllRecipeCosts: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('recalculate-all-recipe-costs');
  },
  recalculateRecipeCost: async (recetaId: number): Promise<any> => {
    return await ipcRenderer.invoke('recalculate-recipe-cost', recetaId);
  },
  // StockMovimiento methods
  getStockMovimientos: async (): Promise<StockMovimiento[]> => {
    return await ipcRenderer.invoke('get-stock-movimientos');
  },
  getStockMovimientosByProducto: async (productoId: number): Promise<StockMovimiento[]> => {
    return await ipcRenderer.invoke('get-stock-movimientos-by-producto', productoId);
  },
  createStockMovimiento: async (stockMovimientoData: any): Promise<StockMovimiento> => {
    return await ipcRenderer.invoke('create-stock-movimiento', stockMovimientoData);
  },
  updateStockMovimiento: async (stockMovimientoId: number, stockMovimientoData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-stock-movimiento', stockMovimientoId, stockMovimientoData);
  },
  deleteStockMovimiento: async (stockMovimientoId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-stock-movimiento', stockMovimientoId);
  },
  procesarStockVenta: async (ventaId: number): Promise<any> => {
    return await ipcRenderer.invoke('procesarStockVenta', ventaId);
  },
  revertirStockVenta: async (ventaId: number): Promise<any> => {
    return await ipcRenderer.invoke('revertirStockVenta', ventaId);
  },

  // Additional helper methods
  searchProductosByNombre: async (nombre: string, mode: 'venta' | 'compra' = 'venta'): Promise<Producto[]> => {
    return await ipcRenderer.invoke('search-productos-by-nombre', nombre, mode);
  },
  getProductosByTipo: async (tipo: string): Promise<Producto[]> => {
    return await ipcRenderer.invoke('get-productos-by-tipo', tipo);
  },
  getProductosWithStock: async (): Promise<Producto[]> => {
    return await ipcRenderer.invoke('get-productos-with-stock');
  },

  // Conversion Moneda methods
  getConversionesMoneda: async (): Promise<ConversionMoneda[]> => {
    return await ipcRenderer.invoke('get-conversiones-moneda');
  },
  createConversionMoneda: async (conversionData: any): Promise<ConversionMoneda> => {
    return await ipcRenderer.invoke('create-conversion-moneda', conversionData);
  },
  updateConversionMoneda: async (conversionId: number, conversionData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-conversion-moneda', conversionId, conversionData);
  },
  deleteConversionMoneda: async (conversionId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-conversion-moneda', conversionId);
  },

  // Configuracion Monetaria methods
  getConfiguracionMonetaria: async (): Promise<ConfiguracionMonetaria> => {
    return await ipcRenderer.invoke('get-configuracion-monetaria');
  },
  createConfiguracionMonetaria: async (configData: any): Promise<ConfiguracionMonetaria> => {
    return await ipcRenderer.invoke('create-configuracion-monetaria', configData);
  },
  updateConfiguracionMonetaria: async (configId: number, configData: any): Promise<any> => {
    return await ipcRenderer.invoke('update-configuracion-monetaria', configId, configData);
  },

  // Sabor methods
  getSabores: async (): Promise<string[]> => {
    return await ipcRenderer.invoke('get-sabores');
  },
  createOrUpdateSabor: async (saborData: any): Promise<{ success: boolean, message: string }> => {
    return await ipcRenderer.invoke('create-or-update-sabor', saborData);
  },
  getSaborDetails: async (categoria: string): Promise<any> => {
    return await ipcRenderer.invoke('get-sabor-details', categoria);
  },

  // ✅ Nuevos métodos para Arquitectura con Variaciones
  // Sabores por producto
  getSaboresByProducto: async (productoId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-sabores-by-producto', productoId);
  },
  createSabor: async (saborData: { nombre: string; categoria: string; descripcion?: string; productoId: number; }): Promise<any> => {
    return await ipcRenderer.invoke('create-sabor', saborData);
  },
  updateSabor: async (saborId: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-sabor', saborId, data);
  },
  deleteSabor: async (saborId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-sabor', saborId);
  },
  getSaboresEstadisticas: async (productoId: number): Promise<any> => {
    return await ipcRenderer.invoke('get-sabores-estadisticas', productoId);
  },

  // Variaciones (RecetaPresentacion)
  getVariacionesByProducto: async (productoId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-variaciones-by-producto', productoId);
  },
  getVariacionesByProductoAndPresentacion: async (productoId: number, presentacionId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-variaciones-by-producto-and-presentacion', productoId, presentacionId);
  },
  getVariacionesByReceta: async (recetaId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-variaciones-by-receta', recetaId);
  },
  createRecetaPresentacion: async (variacionData: any): Promise<any> => {
    return await ipcRenderer.invoke('create-receta-presentacion', variacionData);
  },
  updateRecetaPresentacion: async (variacionId: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-receta-presentacion', variacionId, data);
  },
  deleteRecetaPresentacion: async (variacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-receta-presentacion', variacionId);
  },
  bulkUpdateVariaciones: async (updates: Array<{ variacionId: number; precio_ajuste?: number; activo?: boolean; }>): Promise<any> => {
    return await ipcRenderer.invoke('bulk-update-variaciones', updates);
  },
  recalcularCostoVariacion: async (variacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('recalcular-costo-variacion', variacionId);
  },
  generateVariacionesFaltantes: async (productoId: number): Promise<any> => {
    return await ipcRenderer.invoke('generate-variaciones-faltantes', productoId);
  },

  // ✅ NUEVO: Método para el asistente de ingredientes
  getRecetasIdsPorVariacionIds: async (variacionIds: number[]): Promise<{ [variacionId: number]: number }> => {
    return await ipcRenderer.invoke('get-recetas-ids-por-variacion-ids', variacionIds);
  },

  // =============================================
  // PdvAtajoGrupo
  // =============================================
  getPdvAtajoGrupos: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('getPdvAtajoGrupos');
  },
  getPdvAtajoGrupo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('getPdvAtajoGrupo', id);
  },
  createPdvAtajoGrupo: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createPdvAtajoGrupo', data);
  },
  updatePdvAtajoGrupo: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('updatePdvAtajoGrupo', id, data);
  },
  deletePdvAtajoGrupo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('deletePdvAtajoGrupo', id);
  },
  reorderPdvAtajoGrupos: async (orderedIds: number[]): Promise<any> => {
    return await ipcRenderer.invoke('reorderPdvAtajoGrupos', orderedIds);
  },

  // =============================================
  // PdvAtajoItem
  // =============================================
  getPdvAtajoItems: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('getPdvAtajoItems');
  },
  getPdvAtajoItem: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('getPdvAtajoItem', id);
  },
  getPdvAtajoItemsByGrupo: async (grupoId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getPdvAtajoItemsByGrupo', grupoId);
  },
  createPdvAtajoItem: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('createPdvAtajoItem', data);
  },
  updatePdvAtajoItem: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('updatePdvAtajoItem', id, data);
  },
  deletePdvAtajoItem: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('deletePdvAtajoItem', id);
  },

  // =============================================
  // PdvAtajoGrupoItem (join table)
  // =============================================
  assignAtajoItemToGrupo: async (grupoId: number, itemId: number, posicion: number): Promise<any> => {
    return await ipcRenderer.invoke('assignAtajoItemToGrupo', grupoId, itemId, posicion);
  },
  removeAtajoItemFromGrupo: async (grupoId: number, itemId: number): Promise<any> => {
    return await ipcRenderer.invoke('removeAtajoItemFromGrupo', grupoId, itemId);
  },
  reorderAtajoItemsInGrupo: async (grupoId: number, orderedItemIds: number[]): Promise<any> => {
    return await ipcRenderer.invoke('reorderAtajoItemsInGrupo', grupoId, orderedItemIds);
  },

  // =============================================
  // PdvAtajoItemProducto (join table)
  // =============================================
  getPdvAtajoItemProductos: async (atajoItemId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('getPdvAtajoItemProductos', atajoItemId);
  },
  assignProductoToAtajoItem: async (atajoItemId: number, productoId: number, data?: any): Promise<any> => {
    return await ipcRenderer.invoke('assignProductoToAtajoItem', atajoItemId, productoId, data);
  },
  removeProductoFromAtajoItem: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('removeProductoFromAtajoItem', id);
  },
  reorderProductosInAtajoItem: async (atajoItemId: number, orderedIds: number[]): Promise<any> => {
    return await ipcRenderer.invoke('reorderProductosInAtajoItem', atajoItemId, orderedIds);
  },

  // =============================================
  // Caja Mayor
  // =============================================
  getCajasMayor: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-cajas-mayor');
  },
  getCajaMayor: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-caja-mayor', id);
  },
  createCajaMayor: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-caja-mayor', data);
  },
  updateCajaMayor: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-caja-mayor', id, data);
  },
  cerrarCajaMayor: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('cerrar-caja-mayor', id);
  },

  // Caja Mayor Saldos
  getCajaMayorSaldos: async (cajaMayorId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-caja-mayor-saldos', cajaMayorId);
  },
  recalcularSaldos: async (cajaMayorId: number): Promise<any> => {
    return await ipcRenderer.invoke('recalcular-saldos', cajaMayorId);
  },

  // Caja Mayor Movimientos
  getCajaMayorMovimientos: async (cajaMayorId: number, filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-caja-mayor-movimientos', cajaMayorId, filtros);
  },
  createCajaMayorMovimiento: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-caja-mayor-movimiento', data);
  },
  anularCajaMayorMovimiento: async (id: number, motivo: string): Promise<any> => {
    return await ipcRenderer.invoke('anular-caja-mayor-movimiento', id, motivo);
  },

  // Configuracion Caja Mayor
  getCajaMayorConfiguracion: async (cajaMayorId: number): Promise<any> => {
    return await ipcRenderer.invoke('get-caja-mayor-configuracion', cajaMayorId);
  },
  saveCajaMayorConfiguracion: async (
    cajaMayorId: number,
    data: {
      formaPagoIds: number[];
      cuentaBancariaIds: number[];
      mostrarCuentasPorPagar?: boolean;
      mostrarCuentasPorCobrar?: boolean;
    }
  ): Promise<any> => {
    return await ipcRenderer.invoke('save-caja-mayor-configuracion', cajaMayorId, data);
  },
  getCuentaBancariaResumen: async (cuentaBancariaId: number): Promise<any> => {
    return await ipcRenderer.invoke('get-cuenta-bancaria-resumen', cuentaBancariaId);
  },
  getCuentasBancariasResumenes: async (ids: number[]): Promise<any[]> => {
    return await ipcRenderer.invoke('get-cuentas-bancarias-resumenes', ids);
  },
  getCajaMayorCppResumen: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-caja-mayor-cpp-resumen');
  },
  getCajaMayorCpcResumen: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-caja-mayor-cpc-resumen');
  },

  // Gasto Categorias
  getGastoCategorias: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-gasto-categorias');
  },
  getGastoCategoria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-gasto-categoria', id);
  },
  createGastoCategoria: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-gasto-categoria', data);
  },
  updateGastoCategoria: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-gasto-categoria', id, data);
  },
  deleteGastoCategoria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-gasto-categoria', id);
  },

  // Gastos
  getGastos: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-gastos', filtros);
  },
  getGasto: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-gasto', id);
  },
  createGasto: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-gasto', data);
  },
  anularGasto: async (id: number, motivo: string): Promise<any> => {
    return await ipcRenderer.invoke('anular-gasto', id, motivo);
  },
  editGasto: async (gastoId: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('edit-gasto', gastoId, data);
  },
  editCajaMayorMovimiento: async (movId: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('edit-caja-mayor-movimiento', movId, data);
  },
  getGastosProgramados: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-gastos-programados');
  },

  // Retiros de Caja
  getRetirosCaja: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-retiros-caja', filtros);
  },
  getRetiroCaja: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-retiro-caja', id);
  },
  createRetiroCaja: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-retiro-caja', data);
  },
  ingresarRetiroCaja: async (retiroId: number, cajaMayorId: number): Promise<any> => {
    return await ipcRenderer.invoke('ingresar-retiro-caja', retiroId, cajaMayorId);
  },

  // Banking - Cuentas Bancarias
  getCuentasBancarias: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-cuentas-bancarias');
  },
  getCuentaBancaria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-cuenta-bancaria', id);
  },
  createCuentaBancaria: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-cuenta-bancaria', data);
  },
  updateCuentaBancaria: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-cuenta-bancaria', id, data);
  },
  deleteCuentaBancaria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-cuenta-bancaria', id);
  },

  // Banking - Maquinas POS
  getMaquinasPos: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-maquinas-pos');
  },
  getMaquinaPos: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-maquina-pos', id);
  },
  createMaquinaPos: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-maquina-pos', data);
  },
  updateMaquinaPos: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-maquina-pos', id, data);
  },
  deleteMaquinaPos: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-maquina-pos', id);
  },

  // Banking - Acreditaciones POS
  getAcreditacionesPos: async (filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-acreditaciones-pos', filtros);
  },
  getAcreditacionPos: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-acreditacion-pos', id);
  },
  createAcreditacionPos: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-acreditacion-pos', data);
  },
  procesarAcreditacionesAuto: async (): Promise<any> => {
    return await ipcRenderer.invoke('procesar-acreditaciones-auto');
  },
  verificarAcreditacionPos: async (id: number, montoAcreditado: number): Promise<any> => {
    return await ipcRenderer.invoke('verificar-acreditacion-pos', id, montoAcreditado);
  },
  getAcreditacionesPendientes: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-acreditaciones-pendientes');
  },
  acreditarTransferenciaBancaria: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('acreditar-transferencia-bancaria', payload);
  },

  // Movimientos bancarios (historico unificado + manuales)
  getMovimientosCuentaBancaria: async (cuentaBancariaId: number, filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-movimientos-cuenta-bancaria', cuentaBancariaId, filtros);
  },
  createMovimientoBancario: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-movimiento-bancario', data);
  },

  // Compra Categorias
  getCompraCategorias: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-compra-categorias');
  },
  createCompraCategoria: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-compra-categoria', data);
  },
  updateCompraCategoria: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-compra-categoria', id, data);
  },
  deleteCompraCategoria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-compra-categoria', id);
  },

  // Compra Cuotas
  getCompraCuotas: async (compraId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-compra-cuotas', compraId);
  },
  setCompraCuotas: async (compraId: number, cuotas: any[]): Promise<any[]> => {
    return await ipcRenderer.invoke('set-compra-cuotas', compraId, cuotas);
  },
  pagarCompraCuota: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('pagar-compra-cuota', payload);
  },

  // Cuentas Por Pagar
  getCuentasPorPagar: async (filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-cuentas-por-pagar', filtros);
  },
  getCuentaPorPagar: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-cuenta-por-pagar', id);
  },
  createCuentaPorPagar: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-cuenta-por-pagar', data);
  },
  updateCuentaPorPagar: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-cuenta-por-pagar', id, data);
  },
  cancelarCuentaPorPagar: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('cancelar-cuenta-por-pagar', id);
  },
  getCuentaPorPagarCuotas: async (cppId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-cuenta-por-pagar-cuotas', cppId);
  },
  pagarCppCuota: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('pagar-cpp-cuota', payload);
  },
  pagarCuotasComprasLote: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('pagar-cuotas-compras-lote', payload);
  },
  getCuotasPendientesCompras: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-cuotas-pendientes-compras', filtros);
  },
  cancelarCppCuota: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('cancelar-cpp-cuota', payload);
  },

  // Dashboard Shortcuts
  getDashboardShortcuts: async (dashboardKey?: string): Promise<any[]> => {
    return await ipcRenderer.invoke('get-dashboard-shortcuts', dashboardKey);
  },
  createDashboardShortcut: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-dashboard-shortcut', data);
  },
  updateDashboardShortcut: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-dashboard-shortcut', id, data);
  },
  deleteDashboardShortcut: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-dashboard-shortcut', id);
  },

  // =============================================
  // Fase 4: Entradas Varias
  // =============================================
  getEntradaVariaCategorias: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-entrada-varia-categorias');
  },
  getEntradaVariaCategoria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-entrada-varia-categoria', id);
  },
  createEntradaVariaCategoria: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-entrada-varia-categoria', data);
  },
  updateEntradaVariaCategoria: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-entrada-varia-categoria', id, data);
  },
  deleteEntradaVariaCategoria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-entrada-varia-categoria', id);
  },
  getEntradasVarias: async (filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-entradas-varias', filtros);
  },
  getEntradaVaria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-entrada-varia', id);
  },
  createEntradaVaria: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-entrada-varia', data);
  },
  anularEntradaVaria: async (id: number, motivo: string): Promise<any> => {
    return await ipcRenderer.invoke('anular-entrada-varia', id, motivo);
  },

  // =============================================
  // Fase 4: Operaciones Financieras
  // =============================================
  getOperacionFinancieraCategorias: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-operacion-financiera-categorias');
  },
  getOperacionFinancieraCategoria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-operacion-financiera-categoria', id);
  },
  createOperacionFinancieraCategoria: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-operacion-financiera-categoria', data);
  },
  updateOperacionFinancieraCategoria: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-operacion-financiera-categoria', id, data);
  },
  deleteOperacionFinancieraCategoria: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-operacion-financiera-categoria', id);
  },
  getOperacionesFinancieras: async (filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-operaciones-financieras', filtros);
  },
  getOperacionFinanciera: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-operacion-financiera', id);
  },
  createOperacionFinanciera: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-operacion-financiera', data);
  },
  anularOperacionFinanciera: async (id: number, motivo: string): Promise<any> => {
    return await ipcRenderer.invoke('anular-operacion-financiera', id, motivo);
  },

  // =============================================
  // Fase 4: Chequeras + Cheques
  // =============================================
  getChequeras: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-chequeras');
  },
  getChequera: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-chequera', id);
  },
  createChequera: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-chequera', data);
  },
  updateChequera: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-chequera', id, data);
  },
  deleteChequera: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-chequera', id);
  },
  getCheques: async (filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-cheques', filtros);
  },
  getCheque: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-cheque', id);
  },
  emitirCheque: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('emitir-cheque', data);
  },
  cobrarCheque: async (id: number, data?: any): Promise<any> => {
    return await ipcRenderer.invoke('cobrar-cheque', id, data);
  },
  anularCheque: async (id: number, motivo: string): Promise<any> => {
    return await ipcRenderer.invoke('anular-cheque', id, motivo);
  },

  // =============================================
  // RRHH - Permisos
  // =============================================
  getPermissions: async (modulo?: string): Promise<any[]> => {
    return await ipcRenderer.invoke('get-permissions', modulo);
  },
  getAllPermissions: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-all-permissions');
  },
  createPermission: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-permission', data);
  },
  updatePermission: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-permission', id, data);
  },
  deletePermission: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-permission', id);
  },
  getRolePermissions: async (roleId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-role-permissions', roleId);
  },
  setRolePermissions: async (roleId: number, permissionIds: number[]): Promise<any> => {
    return await ipcRenderer.invoke('set-role-permissions', roleId, permissionIds);
  },
  getPermissionsByUser: async (userId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-permissions-by-user', userId);
  },
  seedPermissions: async (): Promise<any> => {
    return await ipcRenderer.invoke('seed-permissions');
  },

  // =============================================
  // RRHH - Configuracion
  // =============================================
  getConfiguracionesRrhh: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-configuraciones-rrhh');
  },
  getConfiguracionRrhh: async (clave: string): Promise<any> => {
    return await ipcRenderer.invoke('get-configuracion-rrhh', clave);
  },
  createConfiguracionRrhh: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-configuracion-rrhh', data);
  },
  updateConfiguracionRrhh: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-configuracion-rrhh', id, data);
  },
  deleteConfiguracionRrhh: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-configuracion-rrhh', id);
  },
  seedConfiguracionRrhh: async (): Promise<any> => {
    return await ipcRenderer.invoke('seed-configuracion-rrhh');
  },

  // =============================================
  // RRHH - Cargos
  // =============================================
  getCargos: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-cargos');
  },
  getCargo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-cargo', id);
  },
  createCargo: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-cargo', data);
  },
  updateCargo: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-cargo', id, data);
  },
  deleteCargo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-cargo', id);
  },

  // =============================================
  // RRHH - Funcionarios
  // =============================================
  getFuncionarios: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-funcionarios', filtros);
  },
  getFuncionario: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-funcionario', id);
  },
  createFuncionario: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-funcionario', data);
  },
  updateFuncionario: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-funcionario', id, data);
  },
  cambiarCargoFuncionario: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('cambiar-cargo-funcionario', id, data);
  },
  cambiarSalarioFuncionario: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('cambiar-salario-funcionario', id, data);
  },
  egresarFuncionario: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('egresar-funcionario', id, data);
  },
  getHistoricoCargos: async (funcionarioId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-historico-cargos', funcionarioId);
  },
  getHistoricoSalarios: async (funcionarioId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-historico-salarios', funcionarioId);
  },

  // =============================================
  // RRHH - Documentos del funcionario
  // =============================================
  getFuncionarioDocumentos: async (funcionarioId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-funcionario-documentos', funcionarioId);
  },
  uploadFuncionarioDocumento: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('upload-funcionario-documento', payload);
  },
  deleteFuncionarioDocumento: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-funcionario-documento', id);
  },
  getFuncionarioDocumentoBase64: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-funcionario-documento-base64', id);
  },
  updateFuncionarioDocumento: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-funcionario-documento', id, data);
  },

  // =============================================
  // RRHH - Turnos
  // =============================================
  getTurnos: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-turnos');
  },
  getTurno: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-turno', id);
  },
  createTurno: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-turno', data);
  },
  updateTurno: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-turno', id, data);
  },
  deleteTurno: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-turno', id);
  },
  asignarTurnoFuncionario: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('asignar-turno-funcionario', data);
  },
  cerrarFuncionarioTurno: async (id: number, fechaHasta?: Date): Promise<any> => {
    return await ipcRenderer.invoke('cerrar-funcionario-turno', id, fechaHasta);
  },
  updateFuncionarioTurno: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-funcionario-turno', id, data);
  },
  getFuncionarioTurnos: async (funcionarioId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-funcionario-turnos', funcionarioId);
  },

  // =============================================
  // RRHH - Asistencias
  // =============================================
  getAsistencias: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-asistencias', filtros);
  },
  getAsistencia: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-asistencia', id);
  },
  createAsistencia: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-asistencia', data);
  },
  updateAsistencia: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-asistencia', id, data);
  },
  justificarAsistencia: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('justificar-asistencia', id, data);
  },
  marcarAsistenciaMasiva: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('marcar-asistencia-masiva', payload);
  },

  // =============================================
  // RRHH - Penalizaciones
  // =============================================
  getPenalizaciones: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-penalizaciones', filtros);
  },
  createPenalizacion: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-penalizacion', data);
  },
  updatePenalizacion: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-penalizacion', data);
  },
  anularPenalizacion: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('anular-penalizacion', id);
  },

  // =============================================
  // RRHH - Feriados
  // =============================================
  getFeriados: async (anio?: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-feriados', anio);
  },
  createFeriado: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-feriado', data);
  },
  updateFeriado: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-feriado', id, data);
  },
  deleteFeriado: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-feriado', id);
  },

  // =============================================
  // RRHH - Horas extra
  // =============================================
  getHorasExtra: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-horas-extra', filtros);
  },
  createHoraExtra: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-hora-extra', data);
  },
  anularHoraExtra: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('anular-hora-extra', id);
  },

  // =============================================
  // RRHH - Vales + Motivos
  // =============================================
  getMotivosVale: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-motivos-vale');
  },
  createMotivoVale: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-motivo-vale', data);
  },
  updateMotivoVale: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-motivo-vale', id, data);
  },
  deleteMotivoVale: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-motivo-vale', id);
  },
  getVales: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-vales', filtros);
  },
  getValesPendientesDescuento: async (funcionarioId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-vales-pendientes-descuento', funcionarioId);
  },
  createVale: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-vale', data);
  },
  confirmarVale: async (id: number, payload: any): Promise<any> => {
    return await ipcRenderer.invoke('confirmar-vale', id, payload);
  },
  anularVale: async (id: number, motivo: string): Promise<any> => {
    return await ipcRenderer.invoke('anular-vale', id, motivo);
  },
  marcarValeDescontado: async (id: number, liquidacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('marcar-vale-descontado', id, liquidacionId);
  },

  // =============================================
  // RRHH - Liquidacion conceptos
  // =============================================
  getLiquidacionConceptos: async (): Promise<any[]> => {
    return await ipcRenderer.invoke('get-liquidacion-conceptos');
  },
  seedLiquidacionConceptos: async (): Promise<any> => {
    return await ipcRenderer.invoke('seed-liquidacion-conceptos');
  },
  updateLiquidacionConcepto: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-liquidacion-concepto', id, data);
  },

  // =============================================
  // RRHH - Liquidaciones de sueldo
  // =============================================
  getLiquidacionesSueldo: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-liquidaciones-sueldo', filtros);
  },
  getLiquidacionSueldo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-liquidacion-sueldo', id);
  },
  generarLiquidacionBorrador: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('generar-liquidacion-borrador', payload);
  },
  agregarItemLiquidacion: async (liquidacionId: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('agregar-item-liquidacion', liquidacionId, data);
  },
  eliminarItemLiquidacion: async (itemId: number): Promise<any> => {
    return await ipcRenderer.invoke('eliminar-item-liquidacion', itemId);
  },
  aprobarLiquidacionSueldo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('aprobar-liquidacion-sueldo', id);
  },
  volverBorradorLiquidacionSueldo: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('volver-borrador-liquidacion-sueldo', id);
  },
  pagarLiquidacionSueldo: async (id: number, payload: any): Promise<any> => {
    return await ipcRenderer.invoke('pagar-liquidacion-sueldo', id, payload);
  },
  anularLiquidacionSueldo: async (id: number, motivo: string): Promise<any> => {
    return await ipcRenderer.invoke('anular-liquidacion-sueldo', id, motivo);
  },

  // =============================================
  // RRHH - Bonos
  // =============================================
  getBonos: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-bonos', filtros);
  },
  createBono: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-bono', data);
  },
  anularBono: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('anular-bono', id);
  },

  // =============================================
  // RRHH - Aguinaldos
  // =============================================
  getAguinaldos: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-aguinaldos', filtros);
  },
  calcularAguinaldosAnio: async (anio: number): Promise<any> => {
    return await ipcRenderer.invoke('calcular-aguinaldos-anio', anio);
  },

  // =============================================
  // RRHH - Vacaciones
  // =============================================
  getVacaciones: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-vacaciones', filtros);
  },
  getVacacion: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-vacacion', id);
  },
  generarVacacionesFuncionario: async (funcionarioId: number): Promise<any> => {
    return await ipcRenderer.invoke('generar-vacaciones-funcionario', funcionarioId);
  },
  programarVacacionPeriodo: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('programar-vacacion-periodo', payload);
  },
  marcarPeriodoGozado: async (periodoId: number): Promise<any> => {
    return await ipcRenderer.invoke('marcar-periodo-gozado', periodoId);
  },
  cancelarVacacionPeriodo: async (periodoId: number): Promise<any> => {
    return await ipcRenderer.invoke('cancelar-vacacion-periodo', periodoId);
  },

  // =============================================
  // RRHH - Liquidacion final
  // =============================================
  getLiquidacionesFinal: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-liquidaciones-final', filtros);
  },
  getLiquidacionFinal: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-liquidacion-final', id);
  },
  generarLiquidacionFinal: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('generar-liquidacion-final', payload);
  },
  aprobarLiquidacionFinal: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('aprobar-liquidacion-final', id);
  },
  pagarLiquidacionFinal: async (id: number, payload: any): Promise<any> => {
    return await ipcRenderer.invoke('pagar-liquidacion-final', id, payload);
  },

  // =============================================
  // Comisiones - Reglas
  // =============================================
  getReglasComision: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-reglas-comision', filtros);
  },
  getReglaComision: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-regla-comision', id);
  },
  createReglaComision: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-regla-comision', data);
  },
  updateReglaComision: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-regla-comision', id, data);
  },
  deleteReglaComision: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-regla-comision', id);
  },
  getFuncionariosRegla: async (reglaId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-funcionarios-regla', reglaId);
  },
  asignarFuncionarioRegla: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('asignar-funcionario-regla', data);
  },
  desasignarFuncionarioRegla: async (asignacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('desasignar-funcionario-regla', asignacionId);
  },

  // =============================================
  // Comisiones - Liquidaciones
  // =============================================
  getLiquidacionesComision: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-liquidaciones-comision', filtros);
  },
  getLiquidacionComision: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-liquidacion-comision', id);
  },
  generarLiquidacionComision: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('generar-liquidacion-comision', payload);
  },
  generarLiquidacionesComisionMes: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('generar-liquidaciones-comision-mes', periodo);
  },
  aprobarLiquidacionComision: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('aprobar-liquidacion-comision', id);
  },
  agregarItemManualLiquidacionComision: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('agregar-item-manual-liquidacion-comision', payload);
  },
  eliminarItemLiquidacionComision: async (itemId: number): Promise<any> => {
    return await ipcRenderer.invoke('eliminar-item-liquidacion-comision', itemId);
  },
  anularLiquidacionComision: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('anular-liquidacion-comision', id);
  },

  // =============================================
  // Comisiones - Equipos
  // =============================================
  getEquiposComision: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-equipos-comision', filtros);
  },
  getEquipoComision: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-equipo-comision', id);
  },
  createEquipoComision: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-equipo-comision', data);
  },
  updateEquipoComision: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-equipo-comision', id, data);
  },
  deleteEquipoComision: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('delete-equipo-comision', id);
  },
  agregarMiembroEquipo: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('agregar-miembro-equipo', payload);
  },
  eliminarMiembroEquipo: async (miembroId: number): Promise<any> => {
    return await ipcRenderer.invoke('eliminar-miembro-equipo', miembroId);
  },
  actualizarPorcentajeMiembro: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('actualizar-porcentaje-miembro', payload);
  },
  asignarReglaEquipo: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('asignar-regla-equipo', payload);
  },
  desasignarReglaEquipo: async (asignacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('desasignar-regla-equipo', asignacionId);
  },
  evaluarEquipoPeriodo: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('evaluar-equipo-periodo', payload);
  },

  // === Cuentas por Cobrar (Fase 7) ===
  getCuentasPorCobrar: async (filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-cuentas-por-cobrar', filtros);
  },
  getCuentaPorCobrar: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('get-cuenta-por-cobrar', id);
  },
  createCuentaPorCobrar: async (data: any): Promise<any> => {
    return await ipcRenderer.invoke('create-cuenta-por-cobrar', data);
  },
  updateCuentaPorCobrar: async (id: number, data: any): Promise<any> => {
    return await ipcRenderer.invoke('update-cuenta-por-cobrar', id, data);
  },
  cancelarCuentaPorCobrar: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('cancelar-cuenta-por-cobrar', payload);
  },
  getCuentaPorCobrarCuotas: async (cpcId: number): Promise<any[]> => {
    return await ipcRenderer.invoke('get-cuenta-por-cobrar-cuotas', cpcId);
  },
  cobrarCpcCuota: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('cobrar-cpc-cuota', payload);
  },
  anularCobroCpcCuota: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('anular-cobro-cpc-cuota', payload);
  },
  recalcularSaldoCliente: async (clienteId: number): Promise<any> => {
    return await ipcRenderer.invoke('recalcular-saldo-cliente', clienteId);
  },

  // === Movimientos Cliente (Fase 7) ===
  getMovimientosCliente: async (clienteId: number, filtros?: any): Promise<any> => {
    return await ipcRenderer.invoke('get-movimientos-cliente', clienteId, filtros);
  },
  getSaldoCliente: async (clienteId: number): Promise<any> => {
    return await ipcRenderer.invoke('get-saldo-cliente', clienteId);
  },

  // === Notificaciones RRHH (Fase 8) ===
  getNotificacionesRrhh: async (filtros?: any): Promise<any[]> => {
    return await ipcRenderer.invoke('get-notificaciones-rrhh', filtros);
  },
  marcarNotificacionLeida: async (id: number): Promise<any> => {
    return await ipcRenderer.invoke('marcar-notificacion-leida', id);
  },
  marcarTodasNotificacionesLeidas: async (usuarioId?: number): Promise<any> => {
    return await ipcRenderer.invoke('marcar-todas-notificaciones-leidas', usuarioId);
  },
  generarNotificacionesRrhh: async (): Promise<any> => {
    return await ipcRenderer.invoke('generar-notificaciones-rrhh');
  },
  countNotificacionesNoLeidas: async (usuarioId?: number): Promise<any> => {
    return await ipcRenderer.invoke('count-notificaciones-no-leidas', usuarioId);
  },

  // === Dashboard RRHH (Fase 8) ===
  getDashboardRrhhKpis: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('get-dashboard-rrhh-kpis', periodo);
  },

  // === Dashboards por dominio ===
  getDashboardVentasKpis: async (rango: string = 'week'): Promise<any> => {
    return await ipcRenderer.invoke('get-dashboard-ventas-kpis', rango);
  },
  getDashboardComprasKpis: async (): Promise<any> => {
    return await ipcRenderer.invoke('get-dashboard-compras-kpis');
  },
  getDashboardProductosKpis: async (): Promise<any> => {
    return await ipcRenderer.invoke('get-dashboard-productos-kpis');
  },
  getDashboardFinancieroKpis: async (): Promise<any> => {
    return await ipcRenderer.invoke('get-dashboard-financiero-kpis');
  },
  getDashboardCajaMayorKpis: async (): Promise<any> => {
    return await ipcRenderer.invoke('get-dashboard-caja-mayor-kpis');
  },

  // === Reportes RRHH (Fase 8) ===
  getReporteLiquidacionesMesData: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('get-reporte-liquidaciones-mes-data', periodo);
  },
  exportReporteLiquidacionesMesExcel: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-liquidaciones-mes-excel', periodo);
  },
  exportReporteLiquidacionesMesPdf: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-liquidaciones-mes-pdf', periodo);
  },
  getReporteAsistenciaMesData: async (periodo: string, funcionarioId?: number): Promise<any> => {
    return await ipcRenderer.invoke('get-reporte-asistencia-mes-data', periodo, funcionarioId);
  },
  exportReporteAsistenciaMesExcel: async (periodo: string, funcionarioId?: number): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-asistencia-mes-excel', periodo, funcionarioId);
  },
  getReporteValesMesData: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('get-reporte-vales-mes-data', periodo);
  },
  exportReporteValesMesExcel: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-vales-mes-excel', periodo);
  },
  getReportePrestamosActivosData: async (): Promise<any> => {
    return await ipcRenderer.invoke('get-reporte-prestamos-activos-data');
  },
  exportReportePrestamosActivosExcel: async (): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-prestamos-activos-excel');
  },
  getReporteComisionesMesData: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('get-reporte-comisiones-mes-data', periodo);
  },
  exportReporteComisionesMesExcel: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-comisiones-mes-excel', periodo);
  },
  exportReciboLiquidacionPdf: async (liquidacionId: number): Promise<any> => {
    return await ipcRenderer.invoke('export-recibo-liquidacion-pdf', liquidacionId);
  },
  getReporteAguinaldoAnualData: async (anio: number): Promise<any> => {
    return await ipcRenderer.invoke('get-reporte-aguinaldo-anual-data', anio);
  },
  exportReporteAguinaldoAnualExcel: async (anio: number): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-aguinaldo-anual-excel', anio);
  },
  exportReporteAguinaldoAnualPdf: async (anio: number): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-aguinaldo-anual-pdf', anio);
  },
  getReporteResumenIpsData: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('get-reporte-resumen-ips-data', periodo);
  },
  exportReporteResumenIpsExcel: async (periodo: string): Promise<any> => {
    return await ipcRenderer.invoke('export-reporte-resumen-ips-excel', periodo);
  },

  // ================== BACKUP & RESTORE ==================
  backupGetInfo: async (): Promise<any> => {
    return await ipcRenderer.invoke('backup-get-info');
  },
  backupCreate: async (opts: { includeImages?: boolean; customDir?: string; notes?: string }): Promise<any> => {
    return await ipcRenderer.invoke('backup-create', opts);
  },
  backupCreateAndExport: async (opts: { includeImages?: boolean; notes?: string }): Promise<any> => {
    return await ipcRenderer.invoke('backup-create-and-export', opts);
  },
  backupList: async (): Promise<any> => {
    return await ipcRenderer.invoke('backup-list');
  },
  backupDelete: async (fullPath: string): Promise<any> => {
    return await ipcRenderer.invoke('backup-delete', fullPath);
  },
  backupPickRestoreFile: async (): Promise<any> => {
    return await ipcRenderer.invoke('backup-pick-restore-file');
  },
  backupPickFolder: async (): Promise<any> => {
    return await ipcRenderer.invoke('backup-pick-folder');
  },
  backupRestore: async (opts: { filePath: string }): Promise<any> => {
    return await ipcRenderer.invoke('backup-restore', opts);
  },
  backupConfigGet: async (): Promise<any> => {
    return await ipcRenderer.invoke('backup-config-get');
  },
  backupConfigSet: async (partial: any): Promise<any> => {
    return await ipcRenderer.invoke('backup-config-set', partial);
  },
  backupTriggerAutoNow: async (): Promise<any> => {
    return await ipcRenderer.invoke('backup-trigger-auto-now');
  },
  backupDbReset: async (opts: { confirmation: string }): Promise<any> => {
    return await ipcRenderer.invoke('backup-db-reset', opts);
  },
  backupClearImages: async (opts: { confirmation: string }): Promise<any> => {
    return await ipcRenderer.invoke('backup-clear-images', opts);
  },

  // ================== DB CONFIG (F1) ==================
  dbConfigGet: async (): Promise<any> => {
    return await ipcRenderer.invoke('db-config-get');
  },
  dbConfigSave: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('db-config-save', payload);
  },
  dbConfigTestConnection: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('db-config-test-connection', payload);
  },
  dbConfigRestartApp: async (): Promise<any> => {
    return await ipcRenderer.invoke('db-config-restart-app');
  },

  // ================== APP MODE (F4.2) ==================
  appModeGet: async (): Promise<any> => {
    return await ipcRenderer.invoke('app-mode-get');
  },
  appModeSave: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('app-mode-save', payload);
  },
  appModeTestServer: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('app-mode-test-server', payload);
  },

  // ================== IA CONFIG ==================
  iaConfigGet: async (): Promise<any> => {
    return await ipcRenderer.invoke('ia-config-get');
  },
  iaConfigSet: async (partial: any): Promise<any> => {
    return await ipcRenderer.invoke('ia-config-set', partial);
  },
  iaConfigTest: async (): Promise<any> => {
    return await ipcRenderer.invoke('ia-config-test');
  },

  // ================== IA PROMPT CONFIG ==================
  iaPromptGet: async (): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-get');
  },
  iaPromptSetAdiciones: async (payload: { adiciones: string[] }): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-set-adiciones', payload);
  },
  iaPromptEffective: async (): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-effective');
  },
  iaPromptSugerenciaList: async (payload: { estado?: string } = {}): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-sugerencia-list', payload);
  },
  iaPromptSugerenciaCreate: async (payload: { texto: string; motivo?: string; documentoOrigenId?: number; origen?: string }): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-sugerencia-create', payload);
  },
  iaPromptSugerenciaAprobar: async (payload: { id: number }): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-sugerencia-aprobar', payload);
  },
  iaPromptSugerenciaRechazar: async (payload: { id: number; motivo?: string }): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-sugerencia-rechazar', payload);
  },
  iaPromptSugerenciaDelete: async (payload: { id: number }): Promise<any> => {
    return await ipcRenderer.invoke('ia-prompt-sugerencia-delete', payload);
  },

  // ================== FACTURA IMPORT (OCR + IA) ==================
  facturaImportPickFile: async (): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-pick-file');
  },
  facturaImportProcess: async (payload: { filePath: string }): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-process', payload);
  },
  facturaImportReprocess: async (payload: { documentoId: number }): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-reprocess', payload);
  },
  facturaImportGet: async (payload: { documentoId: number }): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-get', payload);
  },
  facturaImportList: async (payload: { page?: number; pageSize?: number; estado?: string }): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-list', payload);
  },
  facturaImportDescartar: async (payload: { documentoId: number }): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-descartar', payload);
  },
  facturaImportMatch: async (payload: { documentoId: number }): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-match', payload);
  },
  facturaImportConfirm: async (payload: any): Promise<any> => {
    return await ipcRenderer.invoke('factura-import-confirm', payload);
  },

  // Auto-updater (electron-updater)
  autoUpdateGetConfig: async (): Promise<any> => {
    return await ipcRenderer.invoke('auto-update:get-config');
  },
  autoUpdateSetChannel: async (channel: 'stable' | 'beta' | 'alpha'): Promise<any> => {
    return await ipcRenderer.invoke('auto-update:set-channel', channel);
  },
  autoUpdateSetAutoCheck: async (enabled: boolean): Promise<any> => {
    return await ipcRenderer.invoke('auto-update:set-auto-check', enabled);
  },
  autoUpdateCheckNow: async (): Promise<any> => {
    return await ipcRenderer.invoke('auto-update:check-now');
  },
  autoUpdateQuitAndInstall: async (): Promise<any> => {
    return await ipcRenderer.invoke('auto-update:quit-and-install');
  },
  autoUpdateOnStatus: (handler: (status: string, payload: any) => void): (() => void) => {
    const listener = (_event: any, data: { status: string; payload: any }) => handler(data.status, data.payload);
    ipcRenderer.on('auto-update:status', listener);
    return () => ipcRenderer.removeListener('auto-update:status', listener);
  },

});
