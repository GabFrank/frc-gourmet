// ====================================================================
// TODO: MIGRATION TO NEW PRODUCT ARCHITECTURE PENDING
// Product methods have been moved to ProductosRepository
// Many legacy product methods below should now use ProductosRepository
// ====================================================================

import { Injectable } from '@angular/core';
import { Observable, from, BehaviorSubject, map } from 'rxjs';
import { Printer } from './entities/printer.entity';
import { Persona } from './entities/personas/persona.entity';
import { DocumentoTipo } from './entities/personas/documento-tipo.enum';
import { PersonaTipo } from './entities/personas/persona-tipo.enum';
import { Usuario } from './entities/personas/usuario.entity';
import { Role } from './entities/personas/role.entity';
import { UsuarioRole } from './entities/personas/usuario-role.entity';
import { TipoCliente } from './entities/personas/tipo-cliente.entity';
import { Cliente } from './entities/personas/cliente.entity';
import { LoginSession } from './entities/auth/login-session.entity';
import { DeviceInfo } from '../services/auth.service';

// Import financial entities
import { Moneda } from './entities/financiero/moneda.entity';
import { TipoPrecio } from './entities/financiero/tipo-precio.entity';

// TEMPORARY TYPE STUBS FOR MIGRATION
// TODO: Remove these once migration to new architecture is complete
type Categoria = any;
type MonedaBillete = any;
type MonedaCambio = any;
type Conteo = any;
type ConteoDetalle = any;
type Dispositivo = any;
type Caja = any;
type CajaEstado = any;
type CajaMoneda = any;
type Proveedor = any;
type Compra = any;
type CompraDetalle = any;
type Pago = any;
type PagoDetalle = any;
type ProveedorProducto = any;
type FormasPago = any;
type PrecioDelivery = any;
type Delivery = any;
type DeliveryEstado = any;
type Venta = any;
type VentaEstado = any;
type VentaItem = any;
type PdvGrupoCategoria = any;
type PdvCategoria = any;
type PdvCategoriaItem = any;
type PdvItemProducto = any;
type PdvConfig = any;
type PdvMesa = any;
type Sector = any;
type Reserva = any;

export interface LoginResult {
  success: boolean;
  usuario?: Usuario;
  token?: string;
  message?: string;
  sessionId?: number;
}

// Define an interface for the electron API (non-product methods only)
interface ElectronAPI {
  // Persona operations
  getPersonas: () => Promise<Persona[]>;
  getPersona: (personaId: number) => Promise<Persona>;
  createPersona: (personaData: any, currentUserId?: number) => Promise<Persona>;
  updatePersona: (personaId: number, personaData: any, currentUserId?: number) => Promise<any>;
  deletePersona: (personaId: number, currentUserId?: number) => Promise<any>;
  
  // Usuario operations
  getUsuarios: () => Promise<Usuario[]>;
  getUsuario: (usuarioId: number) => Promise<Usuario>;
  createUsuario: (usuarioData: any) => Promise<Usuario>;
  updateUsuario: (usuarioId: number, usuarioData: any) => Promise<any>;
  deleteUsuario: (usuarioId: number) => Promise<any>;
  
  // Role operations
  getRoles: () => Promise<Role[]>;
  getRole: (roleId: number) => Promise<Role>;
  createRole: (roleData: any) => Promise<Role>;
  updateRole: (roleId: number, roleData: any) => Promise<any>;
  deleteRole: (roleId: number) => Promise<any>;
  
  // Usuario-Role operations
  getUsuarioRoles: (usuarioId: number) => Promise<UsuarioRole[]>;
  assignRoleToUsuario: (usuarioId: number, roleId: number) => Promise<any>;
  removeRoleFromUsuario: (usuarioRoleId: number) => Promise<any>;
  
  // TipoCliente operations
  getTipoClientes: () => Promise<TipoCliente[]>;
  getTipoCliente: (tipoClienteId: number) => Promise<TipoCliente>;
  createTipoCliente: (tipoClienteData: any) => Promise<TipoCliente>;
  updateTipoCliente: (tipoClienteId: number, tipoClienteData: any) => Promise<any>;
  deleteTipoCliente: (tipoClienteId: number) => Promise<any>;
  
  // Cliente operations
  getClientes: () => Promise<Cliente[]>;
  getCliente: (clienteId: number) => Promise<Cliente>;
  createCliente: (clienteData: any) => Promise<Cliente>;
  updateCliente: (clienteId: number, clienteData: any) => Promise<any>;
  deleteCliente: (clienteId: number) => Promise<any>;
  
  // Printer operations
  getPrinters: () => Promise<any[]>;
  addPrinter: (printer: any) => Promise<any>;
  updatePrinter: (printerId: number, printer: any) => Promise<any>;
  deletePrinter: (printerId: number) => Promise<any>;
  printReceipt: (orderId: number, printerId: number) => Promise<any>;
  printTestPage: (printerId: number) => Promise<any>;
  on: (channel: string, callback: (data: any) => void) => void;
  
  getCurrentUser: () => Promise<Usuario | null>;
  setCurrentUser: (usuario: Usuario | null) => void;
  getUsuariosPaginated: (page: number, pageSize: number, filters?: { nickname?: string; nombrePersona?: string; activo?: string | boolean }) => Promise<{items: Usuario[], total: number}>;
  
  // Auth operations
  login: (loginData: {nickname: string, password: string, deviceInfo: DeviceInfo}) => Promise<LoginResult>;
  logout: (sessionId: number) => Promise<boolean>;
  updateSessionActivity: (sessionId: number) => Promise<boolean>;
  getLoginSessions: (usuarioId: number) => Promise<LoginSession[]>;
  
  // Profile image operations
  saveProfileImage: (base64Data: string, fileName: string) => Promise<{ imageUrl: string }>;
  deleteProfileImage: (imageUrl: string) => Promise<boolean>;
  
  // Moneda methods
  getMonedas: () => Promise<Moneda[]>;
  getMoneda: (monedaId: number) => Promise<Moneda>;
  getMonedaPrincipal: () => Promise<Moneda>;
  createMoneda: (monedaData: any) => Promise<Moneda>;
  updateMoneda: (monedaId: number, monedaData: any) => Promise<any>;
  deleteMoneda: (monedaId: number) => Promise<any>;
  
  // MonedaBillete methods
  getMonedasBilletes: () => Promise<MonedaBillete[]>;
  getMonedaBillete: (billeteId: number) => Promise<MonedaBillete>;
  getMonedasBilletesByMoneda: (monedaId: number) => Promise<MonedaBillete[]>;
  createMonedaBillete: (billeteData: any) => Promise<MonedaBillete>;
  updateMonedaBillete: (billeteId: number, billeteData: any) => Promise<MonedaBillete>;
  deleteMonedaBillete: (billeteId: number) => Promise<boolean>;
  
  // TipoPrecio methods
  getTipoPrecios: () => Promise<TipoPrecio[]>;
  getTipoPrecio: (tipoPrecioId: number) => Promise<TipoPrecio>;
  createTipoPrecio: (tipoPrecioData: any) => Promise<TipoPrecio>;
  updateTipoPrecio: (tipoPrecioId: number, tipoPrecioData: any) => Promise<TipoPrecio>;
  deleteTipoPrecio: (tipoPrecioId: number) => Promise<boolean>;
  
  // pago methods
  getPagos: () => Promise<Pago[]>;
  getPago: (pagoId: number) => Promise<Pago>;
  createPago: (pagoData: any) => Promise<Pago>;
  updatePago: (pagoId: number, pagoData: any) => Promise<Pago>;
  deletePago: (pagoId: number) => Promise<boolean>;
  
  // PDV GrupoCategoria methods
  getPdvGrupoCategorias: () => Promise<PdvGrupoCategoria[]>;
  getPdvGrupoCategoria: (grupoId: number) => Promise<PdvGrupoCategoria>;
  createPdvGrupoCategoria: (grupoData: any) => Promise<PdvGrupoCategoria>;
  updatePdvGrupoCategoria: (grupoId: number, grupoData: any) => Promise<PdvGrupoCategoria>;
  deletePdvGrupoCategoria: (grupoId: number) => Promise<boolean>;
  
  // PDV Categoria methods
  getPdvCategorias: () => Promise<PdvCategoria[]>;
  getPdvCategoria: (categoriaId: number) => Promise<PdvCategoria>;
  getPdvCategoriasByGrupo: (grupoId: number) => Promise<PdvCategoria[]>;
  createPdvCategoria: (categoriaData: any) => Promise<PdvCategoria>;
  updatePdvCategoria: (categoriaId: number, categoriaData: any) => Promise<PdvCategoria>;
  deletePdvCategoria: (categoriaId: number) => Promise<boolean>;
  
  // PDV CategoriaItem methods
  getPdvCategoriaItems: () => Promise<PdvCategoriaItem[]>;
  getPdvCategoriaItem: (itemId: number) => Promise<PdvCategoriaItem>;
  getPdvCategoriaItemsByCategoria: (categoriaId: number) => Promise<PdvCategoriaItem[]>;
  createPdvCategoriaItem: (itemData: any) => Promise<PdvCategoriaItem>;
  updatePdvCategoriaItem: (itemId: number, itemData: any) => Promise<PdvCategoriaItem>;
  deletePdvCategoriaItem: (itemId: number) => Promise<boolean>;
  
  // PDV ItemProducto methods
  getPdvItemProductos: () => Promise<PdvItemProducto[]>;
  getPdvItemProducto: (itemProductoId: number) => Promise<PdvItemProducto>;
  getPdvItemProductosByItem: (itemId: number) => Promise<PdvItemProducto[]>;
  createPdvItemProducto: (itemProductoData: any) => Promise<PdvItemProducto>;
  updatePdvItemProducto: (itemProductoId: number, itemProductoData: any) => Promise<PdvItemProducto>;
  deletePdvItemProducto: (itemProductoId: number) => Promise<boolean>;
  
  // PDV Mesa methods
  getPdvMesas: () => Promise<PdvMesa[]>;
  getPdvMesa: (mesaId: number) => Promise<PdvMesa>;
  getPdvMesasBySector: (sectorId: number) => Promise<PdvMesa[]>;
  createPdvMesa: (mesaData: any) => Promise<PdvMesa>;
  updatePdvMesa: (mesaId: number, mesaData: any) => Promise<PdvMesa>;
  deletePdvMesa: (mesaId: number) => Promise<boolean>;
  
  // Other missing methods for PDV functionality
  getCajasMonedas: () => Promise<CajaMoneda[]>;
  saveCajasMonedas: (cajasMonedas: CajaMoneda[]) => Promise<boolean>;
  getMonedasCambio: () => Promise<MonedaCambio[]>;
  getMonedasCambioByMonedaOrigen: (monedaOrigenId: number) => Promise<MonedaCambio[]>;
  createMonedaCambio: (cambioData: any) => Promise<MonedaCambio>;
  updateMonedaCambio: (cambioId: number, cambioData: any) => Promise<MonedaCambio>;
  deleteMonedaCambio: (cambioId: number) => Promise<boolean>;
  
  // Dispositivo methods
  getDispositivos: () => Promise<Dispositivo[]>;
  getDispositivo: (dispositivoId: number) => Promise<Dispositivo>;
  createDispositivo: (dispositivoData: any) => Promise<Dispositivo>;
  updateDispositivo: (dispositivoId: number, dispositivoData: any) => Promise<Dispositivo>;
  deleteDispositivo: (dispositivoId: number) => Promise<boolean>;
  
  // Caja methods
  getCajas: () => Promise<Caja[]>;
  getCaja: (cajaId: number) => Promise<Caja>;
  getCajaAbiertaByUsuario: (usuarioId: number) => Promise<Caja | null>;
  createCaja: (cajaData: any) => Promise<Caja>;
  updateCaja: (cajaId: number, cajaData: any) => Promise<Caja>;
  deleteCaja: (cajaId: number) => Promise<boolean>;
  
  // Venta methods
  getVentas: () => Promise<Venta[]>;
  getVenta: (ventaId: number) => Promise<Venta>;
  createVenta: (ventaData: any) => Promise<Venta>;
  updateVenta: (ventaId: number, ventaData: any) => Promise<Venta>;
  deleteVenta: (ventaId: number) => Promise<boolean>;
  
  // VentaItem methods
  getVentaItems: (ventaId: number) => Promise<VentaItem[]>;
  getVentaItem: (ventaItemId: number) => Promise<VentaItem>;
  createVentaItem: (ventaItemData: any) => Promise<VentaItem>;
  updateVentaItem: (ventaItemId: number, ventaItemData: any) => Promise<VentaItem>;
  deleteVentaItem: (ventaItemId: number) => Promise<boolean>;
  
  // Formas de Pago methods
  getFormasPago: () => Promise<FormasPago[]>;
  
  // FormasPago CRUD methods
  getFormaPago: (formaPagoId: number) => Promise<FormasPago>;
  createFormaPago: (formaPagoData: any) => Promise<FormasPago>;
  updateFormaPago: (formaPagoId: number, formaPagoData: any) => Promise<FormasPago>;
  deleteFormaPago: (formaPagoId: number) => Promise<boolean>;
  updateFormasPagoOrder: (updates: any[]) => Promise<boolean>;
  
  // Pago Detalle methods
  getPagoDetalles: (pagoId: number) => Promise<PagoDetalle[]>;
  createPagoDetalle: (detalleData: any) => Promise<PagoDetalle>;
  updatePagoDetalle: (detalleId: number, detalleData: any) => Promise<PagoDetalle>;
  deletePagoDetalle: (detalleId: number) => Promise<boolean>;
  
  // Compra methods
  getCompras: () => Promise<Compra[]>;
  getCompra: (compraId: number) => Promise<Compra>;
  createCompra: (compraData: any) => Promise<Compra>;
  updateCompra: (compraId: number, compraData: any) => Promise<Compra>;
  deleteCompra: (compraId: number) => Promise<boolean>;

  // MovimientoStock methods
  getMovimientosStock: () => Promise<any[]>;
  getMovimientoStock: (movimientoId: number) => Promise<any>;
  getMovimientosStockByProducto: (productoId: number) => Promise<any[]>;
  getMovimientosStockByIngrediente: (ingredienteId: number) => Promise<any[]>;
  getMovimientosStockByTipoReferencia: (tipoReferencia: string) => Promise<any[]>;
  createMovimientoStock: (movimientoData: any) => Promise<any>;
  updateMovimientoStock: (movimientoId: number, movimientoData: any) => Promise<any>;
  deleteMovimientoStock: (movimientoId: number) => Promise<boolean>;
}

/**
 * Service to interact with the database through Electron IPC
 * Note: Product-related methods have been moved to ProductosRepository
 */
@Injectable({
  providedIn: 'root'
})
export class RepositoryService {
  private api: ElectronAPI;
  private currentUserSubject = new BehaviorSubject<Usuario | null>(null);

  constructor() {
    // Use type assertion to cast window.api to our interface
    this.api = (window as any).api as ElectronAPI;

    // Check for stored user on init and set up periodic refresh
    this.loadCurrentUser();
    
    // Set up a periodic refresh to ensure current user state stays in sync
    setInterval(() => this.loadCurrentUser(), 60000); // Refresh every minute
  }

  // Method to load the current user from main process
  private async loadCurrentUser(): Promise<void> {
    try {
      const usuario = await this.api.getCurrentUser();
      if (usuario) {
        this.currentUserSubject.next(usuario);
      } else if (this.currentUserSubject.value) {
        this.currentUserSubject.next(null);
      }
    } catch (error) {
      console.error('Error loading current user:', error);
      this.currentUserSubject.next(null);
    }
  }

  // Get the current user
  getCurrentUser(): Observable<Usuario | null> {
    return this.currentUserSubject.asObservable();
  }

  // Get current user ID
  getCurrentUserId(): number | undefined {
    return this.currentUserSubject.value?.id;
  }

  // Set the current user
  setCurrentUser(usuario: Usuario | null): void {
    this.currentUserSubject.next(usuario);
    this.api.setCurrentUser(usuario);
  }

  // Persona methods
  getPersonas(): Observable<Persona[]> {
    return from(this.api.getPersonas());
  }

  getPersona(personaId: number): Observable<Persona> {
    return from(this.api.getPersona(personaId));
  }

  createPersona(personaData: Partial<Persona>): Observable<Persona> {
    const currentUserId = this.getCurrentUserId();
    return from(this.api.createPersona(personaData, currentUserId));
  }

  updatePersona(personaId: number, personaData: Partial<Persona>): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return from(this.api.updatePersona(personaId, personaData, currentUserId));
  }

  deletePersona(personaId: number): Observable<any> {
    const currentUserId = this.getCurrentUserId();
    return from(this.api.deletePersona(personaId, currentUserId));
  }

  // Usuario methods
  getUsuarios(): Observable<Usuario[]> {
    return from(this.api.getUsuarios());
  }

  getUsuario(usuarioId: number): Observable<Usuario> {
    return from(this.api.getUsuario(usuarioId));
  }

  createUsuario(usuarioData: Partial<Usuario>): Observable<Usuario> {
    return from(this.api.createUsuario(usuarioData));
  }

  updateUsuario(usuarioId: number, usuarioData: Partial<Usuario>): Observable<any> {
    return from(this.api.updateUsuario(usuarioId, usuarioData));
  }

  deleteUsuario(usuarioId: number): Observable<any> {
    return from(this.api.deleteUsuario(usuarioId));
  }

  // Role methods
  getRoles(): Observable<Role[]> {
    return from(this.api.getRoles());
  }

  getRole(roleId: number): Observable<Role> {
    return from(this.api.getRole(roleId));
  }

  createRole(roleData: Partial<Role>): Observable<Role> {
    return from(this.api.createRole(roleData));
  }

  updateRole(roleId: number, roleData: Partial<Role>): Observable<any> {
    return from(this.api.updateRole(roleId, roleData));
  }

  deleteRole(roleId: number): Observable<any> {
    return from(this.api.deleteRole(roleId));
  }

  // Usuario-Role methods
  getUsuarioRoles(usuarioId: number): Observable<UsuarioRole[]> {
    return from(this.api.getUsuarioRoles(usuarioId));
  }

  assignRoleToUsuario(usuarioId: number, roleId: number): Observable<any> {
    return from(this.api.assignRoleToUsuario(usuarioId, roleId));
  }

  removeRoleFromUsuario(usuarioRoleId: number): Observable<any> {
    return from(this.api.removeRoleFromUsuario(usuarioRoleId));
  }

  // TipoCliente methods
  getTipoClientes(): Observable<TipoCliente[]> {
    return from(this.api.getTipoClientes());
  }

  getTipoCliente(tipoClienteId: number): Observable<TipoCliente> {
    return from(this.api.getTipoCliente(tipoClienteId));
  }

  createTipoCliente(tipoClienteData: Partial<TipoCliente>): Observable<TipoCliente> {
    return from(this.api.createTipoCliente(tipoClienteData));
  }

  updateTipoCliente(tipoClienteId: number, tipoClienteData: Partial<TipoCliente>): Observable<any> {
    return from(this.api.updateTipoCliente(tipoClienteId, tipoClienteData));
  }

  deleteTipoCliente(tipoClienteId: number): Observable<any> {
    return from(this.api.deleteTipoCliente(tipoClienteId));
  }

  // Cliente methods
  getClientes(): Observable<Cliente[]> {
    return from(this.api.getClientes());
  }

  getCliente(clienteId: number): Observable<Cliente> {
    return from(this.api.getCliente(clienteId));
  }

  createCliente(clienteData: Partial<Cliente>): Observable<Cliente> {
    return from(this.api.createCliente(clienteData));
  }

  updateCliente(clienteId: number, clienteData: Partial<Cliente>): Observable<any> {
    return from(this.api.updateCliente(clienteId, clienteData));
  }

  deleteCliente(clienteId: number): Observable<any> {
    return from(this.api.deleteCliente(clienteId));
  }

  // Printer methods
  getPrinters(): Observable<any[]> {
    return from(this.api.getPrinters());
  }

  addPrinter(printer: any): Observable<any> {
    return from(this.api.addPrinter(printer));
  }

  updatePrinter(printerId: number, printer: any): Observable<any> {
    return from(this.api.updatePrinter(printerId, printer));
  }

  deletePrinter(printerId: number): Observable<any> {
    return from(this.api.deletePrinter(printerId));
  }

  printReceipt(orderId: number, printerId: number): Observable<any> {
    return from(this.api.printReceipt(orderId, printerId));
  }

  printTestPage(printerId: number): Observable<any> {
    return from(this.api.printTestPage(printerId));
  }

  getUsuariosPaginated(page: number, pageSize: number, filters?: { nickname?: string; nombrePersona?: string; activo?: string | boolean }): Observable<{items: Usuario[], total: number}> {
    return from(this.api.getUsuariosPaginated(page, pageSize, filters));
  }

  // Auth methods
  login(loginData: {nickname: string, password: string, deviceInfo: DeviceInfo}): Observable<LoginResult> {
    return from(this.api.login(loginData)).pipe(
      map(result => {
        if (result.success && result.usuario) {
          this.currentUserSubject.next(result.usuario);
        }
        return result;
      })
    );
  }

  logout(sessionId: number): Observable<boolean> {
    return from(this.api.logout(sessionId)).pipe(
      map(result => {
        if (result) {
          this.currentUserSubject.next(null);
        }
        return result;
      })
    );
  }

  updateSessionActivity(sessionId: number): Observable<boolean> {
    return from(this.api.updateSessionActivity(sessionId));
  }

  getLoginSessions(usuarioId: number): Observable<LoginSession[]> {
    return from(this.api.getLoginSessions(usuarioId));
  }

  /**
   * Upload an image and return the URL
   * @param formData FormData containing the image file
   * @returns Observable with the uploaded image URL
   */
  uploadImage(formData: FormData): Observable<{ imageUrl: string }> {
    return new Observable<{ imageUrl: string }>(observer => {
      try {
        // Get the file from the FormData
        const file = formData.get('file') as File;

        if (!file) {
          observer.error(new Error('No file found in the form data'));
          return;
        }

        // Generate a unique filename with original extension
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const fileName = `profile_${Date.now()}_${Math.floor(Math.random() * 10000)}.${fileExtension}`;

        // Read the file as a data URL/base64
        const reader = new FileReader();

        reader.onload = async () => {
          try {
            // Get base64 data
            const base64Data = reader.result as string;

            // Save via Electron API
            const result = await this.api.saveProfileImage(base64Data, fileName);

            // Return the result
            observer.next(result);
            observer.complete();
          } catch (error) {
            console.error('Error saving profile image:', error);
            observer.error(error);
          }
        };

        reader.onerror = () => {
          observer.error(new Error('Error reading file'));
        };

        // Read the file as a data URL
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error in uploadImage:', error);
        observer.error(error);
      }
    });
  }

  /**
   * Delete a profile image
   * @param imageUrl URL of the image to delete
   * @returns Observable with the deletion result
   */
  deleteProfileImage(imageUrl: string): Observable<boolean> {
    return from(this.api.deleteProfileImage(imageUrl));
  }

  // Moneda methods
  getMonedas(): Observable<Moneda[]> {
    return from(this.api.getMonedas());
  }

  getMoneda(monedaId: number): Observable<Moneda> {
    return from(this.api.getMoneda(monedaId));
  }

  getMonedaPrincipal(): Observable<Moneda> {
    return from(this.api.getMonedaPrincipal());
  }

  createMoneda(monedaData: Partial<Moneda>): Observable<Moneda> {
    return from(this.api.createMoneda(monedaData));
  }

  updateMoneda(monedaId: number, monedaData: Partial<Moneda>): Observable<any> {
    return from(this.api.updateMoneda(monedaId, monedaData));
  }

  deleteMoneda(monedaId: number): Observable<any> {
    return from(this.api.deleteMoneda(monedaId));
  }

  // MonedaBillete methods
  getMonedasBilletes(): Observable<MonedaBillete[]> {
    return from(this.api.getMonedasBilletes());
  }

  getMonedaBillete(billeteId: number): Observable<MonedaBillete> {
    return from(this.api.getMonedaBillete(billeteId));
  }

  getMonedasBilletesByMoneda(monedaId: number): Observable<MonedaBillete[]> {
    return from(this.api.getMonedasBilletesByMoneda(monedaId));
  }

  createMonedaBillete(billeteData: Partial<MonedaBillete>): Observable<MonedaBillete> {
    return from(this.api.createMonedaBillete(billeteData));
  }

  updateMonedaBillete(billeteId: number, billeteData: Partial<MonedaBillete>): Observable<MonedaBillete> {
    return from(this.api.updateMonedaBillete(billeteId, billeteData));
  }

  deleteMonedaBillete(billeteId: number): Observable<boolean> {
    return from(this.api.deleteMonedaBillete(billeteId));
  }

  // TipoPrecio methods
  getTipoPrecios(): Observable<TipoPrecio[]> {
    return from(this.api.getTipoPrecios());
  }

  getTipoPrecio(tipoPrecioId: number): Observable<TipoPrecio> {
    return from(this.api.getTipoPrecio(tipoPrecioId));
  }

  createTipoPrecio(tipoPrecioData: Partial<TipoPrecio>): Observable<TipoPrecio> {
    return from(this.api.createTipoPrecio(tipoPrecioData));
  }

  updateTipoPrecio(tipoPrecioId: number, tipoPrecioData: Partial<TipoPrecio>): Observable<TipoPrecio> {
    return from(this.api.updateTipoPrecio(tipoPrecioId, tipoPrecioData));
  }

  deleteTipoPrecio(tipoPrecioId: number): Observable<boolean> {
    return from(this.api.deleteTipoPrecio(tipoPrecioId));
  }

  // pago methods
  getPagos(): Observable<Pago[]> {
    return from(this.api.getPagos());
  }

  getPago(pagoId: number): Observable<Pago> {
    return from(this.api.getPago(pagoId));
  }

  createPago(pagoData: Partial<Pago>): Observable<Pago> {
    return from(this.api.createPago(pagoData));
  }

  updatePago(pagoId: number, pagoData: Partial<Pago>): Observable<Pago> {
    return from(this.api.updatePago(pagoId, pagoData));
  }

  deletePago(pagoId: number): Observable<boolean> {
    return from(this.api.deletePago(pagoId));
  }

  // PDV GrupoCategoria methods
  getPdvGrupoCategorias(): Observable<PdvGrupoCategoria[]> {
    return from(this.api.getPdvGrupoCategorias());
  }

  getPdvGrupoCategoria(grupoId: number): Observable<PdvGrupoCategoria> {
    return from(this.api.getPdvGrupoCategoria(grupoId));
  }

  createPdvGrupoCategoria(grupoData: Partial<PdvGrupoCategoria>): Observable<PdvGrupoCategoria> {
    return from(this.api.createPdvGrupoCategoria(grupoData));
  }

  updatePdvGrupoCategoria(grupoId: number, grupoData: Partial<PdvGrupoCategoria>): Observable<PdvGrupoCategoria> {
    return from(this.api.updatePdvGrupoCategoria(grupoId, grupoData));
  }

  deletePdvGrupoCategoria(grupoId: number): Observable<boolean> {
    return from(this.api.deletePdvGrupoCategoria(grupoId));
  }

  // PDV Categoria methods
  getPdvCategorias(): Observable<PdvCategoria[]> {
    return from(this.api.getPdvCategorias());
  }

  getPdvCategoria(categoriaId: number): Observable<PdvCategoria> {
    return from(this.api.getPdvCategoria(categoriaId));
  }

  getPdvCategoriasByGrupo(grupoId: number): Observable<PdvCategoria[]> {
    return from(this.api.getPdvCategoriasByGrupo(grupoId));
  }

  createPdvCategoria(categoriaData: Partial<PdvCategoria>): Observable<PdvCategoria> {
    return from(this.api.createPdvCategoria(categoriaData));
  }

  updatePdvCategoria(categoriaId: number, categoriaData: Partial<PdvCategoria>): Observable<PdvCategoria> {
    return from(this.api.updatePdvCategoria(categoriaId, categoriaData));
  }

  deletePdvCategoria(categoriaId: number): Observable<boolean> {
    return from(this.api.deletePdvCategoria(categoriaId));
  }

  // PDV CategoriaItem methods
  getPdvCategoriaItems(): Observable<PdvCategoriaItem[]> {
    return from(this.api.getPdvCategoriaItems());
  }

  getPdvCategoriaItem(itemId: number): Observable<PdvCategoriaItem> {
    return from(this.api.getPdvCategoriaItem(itemId));
  }

  getPdvCategoriaItemsByCategoria(categoriaId: number): Observable<PdvCategoriaItem[]> {
    return from(this.api.getPdvCategoriaItemsByCategoria(categoriaId));
  }

  createPdvCategoriaItem(itemData: Partial<PdvCategoriaItem>): Observable<PdvCategoriaItem> {
    return from(this.api.createPdvCategoriaItem(itemData));
  }

  updatePdvCategoriaItem(itemId: number, itemData: Partial<PdvCategoriaItem>): Observable<PdvCategoriaItem> {
    return from(this.api.updatePdvCategoriaItem(itemId, itemData));
  }

  deletePdvCategoriaItem(itemId: number): Observable<boolean> {
    return from(this.api.deletePdvCategoriaItem(itemId));
  }

  // PDV ItemProducto methods
  getPdvItemProductos(): Observable<PdvItemProducto[]> {
    return from(this.api.getPdvItemProductos());
  }

  getPdvItemProducto(itemProductoId: number): Observable<PdvItemProducto> {
    return from(this.api.getPdvItemProducto(itemProductoId));
  }

  getPdvItemProductosByItem(itemId: number): Observable<PdvItemProducto[]> {
    return from(this.api.getPdvItemProductosByItem(itemId));
  }

  createPdvItemProducto(itemProductoData: Partial<PdvItemProducto>): Observable<PdvItemProducto> {
    return from(this.api.createPdvItemProducto(itemProductoData));
  }

  updatePdvItemProducto(itemProductoId: number, itemProductoData: Partial<PdvItemProducto>): Observable<PdvItemProducto> {
    return from(this.api.updatePdvItemProducto(itemProductoId, itemProductoData));
  }

  deletePdvItemProducto(itemProductoId: number): Observable<boolean> {
    return from(this.api.deletePdvItemProducto(itemProductoId));
  }

  // PDV Mesa methods
  getPdvMesas(): Observable<PdvMesa[]> {
    return from(this.api.getPdvMesas());
  }

  getPdvMesa(mesaId: number): Observable<PdvMesa> {
    return from(this.api.getPdvMesa(mesaId));
  }

  getPdvMesasBySector(sectorId: number): Observable<PdvMesa[]> {
    return from(this.api.getPdvMesasBySector(sectorId));
  }

  createPdvMesa(mesaData: Partial<PdvMesa>): Observable<PdvMesa> {
    return from(this.api.createPdvMesa(mesaData));
  }

  updatePdvMesa(mesaId: number, mesaData: Partial<PdvMesa>): Observable<PdvMesa> {
    return from(this.api.updatePdvMesa(mesaId, mesaData));
  }

  deletePdvMesa(mesaId: number): Observable<boolean> {
    return from(this.api.deletePdvMesa(mesaId));
  }

  // Other missing methods for PDV functionality
  getCajasMonedas(): Observable<CajaMoneda[]> {
    return from(this.api.getCajasMonedas());
  }

  saveCajasMonedas(cajasMonedas: CajaMoneda[]): Observable<boolean> {
    return from(this.api.saveCajasMonedas(cajasMonedas));
  }

  getMonedasCambio(): Observable<MonedaCambio[]> {
    return from(this.api.getMonedasCambio());
  }

  getMonedasCambioByMonedaOrigen(monedaOrigenId: number): Observable<MonedaCambio[]> {
    return from(this.api.getMonedasCambioByMonedaOrigen(monedaOrigenId));
  }

  createMonedaCambio(cambioData: Partial<MonedaCambio>): Observable<MonedaCambio> {
    return from(this.api.createMonedaCambio(cambioData));
  }

  updateMonedaCambio(cambioId: number, cambioData: Partial<MonedaCambio>): Observable<MonedaCambio> {
    return from(this.api.updateMonedaCambio(cambioId, cambioData));
  }

  deleteMonedaCambio(cambioId: number): Observable<boolean> {
    return from(this.api.deleteMonedaCambio(cambioId));
  }

  // Dispositivo methods
  getDispositivos(): Observable<Dispositivo[]> {
    return from(this.api.getDispositivos());
  }

  getDispositivo(dispositivoId: number): Observable<Dispositivo> {
    return from(this.api.getDispositivo(dispositivoId));
  }

  createDispositivo(dispositivoData: Partial<Dispositivo>): Observable<Dispositivo> {
    return from(this.api.createDispositivo(dispositivoData));
  }

  updateDispositivo(dispositivoId: number, dispositivoData: Partial<Dispositivo>): Observable<Dispositivo> {
    return from(this.api.updateDispositivo(dispositivoId, dispositivoData));
  }

  deleteDispositivo(dispositivoId: number): Observable<boolean> {
    return from(this.api.deleteDispositivo(dispositivoId));
  }

  // Caja methods
  getCajas(): Observable<Caja[]> {
    return from(this.api.getCajas());
  }

  getCaja(cajaId: number): Observable<Caja> {
    return from(this.api.getCaja(cajaId));
  }

  getCajaAbiertaByUsuario(usuarioId: number): Observable<Caja | null> {
    return from(this.api.getCajaAbiertaByUsuario(usuarioId));
  }

  createCaja(cajaData: Partial<Caja>): Observable<Caja> {
    return from(this.api.createCaja(cajaData));
  }

  updateCaja(cajaId: number, cajaData: Partial<Caja>): Observable<Caja> {
    return from(this.api.updateCaja(cajaId, cajaData));
  }

  deleteCaja(cajaId: number): Observable<boolean> {
    return from(this.api.deleteCaja(cajaId));
  }

  // Venta methods
  getVentas(): Observable<Venta[]> {
    return from(this.api.getVentas());
  }

  getVenta(ventaId: number): Observable<Venta> {
    return from(this.api.getVenta(ventaId));
  }

  createVenta(ventaData: Partial<Venta>): Observable<Venta> {
    return from(this.api.createVenta(ventaData));
  }

  updateVenta(ventaId: number, ventaData: Partial<Venta>): Observable<Venta> {
    return from(this.api.updateVenta(ventaId, ventaData));
  }

  deleteVenta(ventaId: number): Observable<boolean> {
    return from(this.api.deleteVenta(ventaId));
  }

  // VentaItem methods
  getVentaItems(ventaId: number): Observable<VentaItem[]> {
    return from(this.api.getVentaItems(ventaId));
  }

  getVentaItem(ventaItemId: number): Observable<VentaItem> {
    return from(this.api.getVentaItem(ventaItemId));
  }

  createVentaItem(ventaItemData: Partial<VentaItem>): Observable<VentaItem> {
    return from(this.api.createVentaItem(ventaItemData));
  }

  updateVentaItem(ventaItemId: number, ventaItemData: Partial<VentaItem>): Observable<VentaItem> {
    return from(this.api.updateVentaItem(ventaItemId, ventaItemData));
  }

  deleteVentaItem(ventaItemId: number): Observable<boolean> {
    return from(this.api.deleteVentaItem(ventaItemId));
  }

  // Formas de Pago methods
  getFormasPago(): Observable<FormasPago[]> {
    return from(this.api.getFormasPago());
  }

  // FormasPago CRUD methods
  getFormaPago(formaPagoId: number): Observable<FormasPago> {
    return from(this.api.getFormaPago(formaPagoId));
  }

  createFormaPago(formaPagoData: Partial<FormasPago>): Observable<FormasPago> {
    return from(this.api.createFormaPago(formaPagoData));
  }

  updateFormaPago(formaPagoId: number, formaPagoData: Partial<FormasPago>): Observable<FormasPago> {
    return from(this.api.updateFormaPago(formaPagoId, formaPagoData));
  }

  deleteFormaPago(formaPagoId: number): Observable<boolean> {
    return from(this.api.deleteFormaPago(formaPagoId));
  }

  updateFormasPagoOrder(updates: any[]): Observable<boolean> {
    return from(this.api.updateFormasPagoOrder(updates));
  }

  // Pago Detalle methods
  getPagoDetalles(pagoId: number): Observable<PagoDetalle[]> {
    return from(this.api.getPagoDetalles(pagoId));
  }

  createPagoDetalle(detalleData: Partial<PagoDetalle>): Observable<PagoDetalle> {
    return from(this.api.createPagoDetalle(detalleData));
  }

  updatePagoDetalle(detalleId: number, detalleData: Partial<PagoDetalle>): Observable<PagoDetalle> {
    return from(this.api.updatePagoDetalle(detalleId, detalleData));
  }

  deletePagoDetalle(detalleId: number): Observable<boolean> {
    return from(this.api.deletePagoDetalle(detalleId));
  }

  // Compra methods
  getCompras(): Observable<Compra[]> {
    return from(this.api.getCompras());
  }

  getCompra(compraId: number): Observable<Compra> {
    return from(this.api.getCompra(compraId));
  }

  createCompra(compraData: Partial<Compra>): Observable<Compra> {
    return from(this.api.createCompra(compraData));
  }

  updateCompra(compraId: number, compraData: Partial<Compra>): Observable<Compra> {
    return from(this.api.updateCompra(compraId, compraData));
  }

  deleteCompra(compraId: number): Observable<boolean> {
    return from(this.api.deleteCompra(compraId));
  }

  // MovimientoStock methods
  getMovimientosStock(): Observable<any[]> {
    return from(this.api.getMovimientosStock());
  }

  getMovimientoStock(movimientoId: number): Observable<any> {
    return from(this.api.getMovimientoStock(movimientoId));
  }

  getMovimientosStockByProducto(productoId: number): Observable<any[]> {
    return from(this.api.getMovimientosStockByProducto(productoId));
  }

  getMovimientosStockByIngrediente(ingredienteId: number): Observable<any[]> {
    return from(this.api.getMovimientosStockByIngrediente(ingredienteId));
  }

  getMovimientosStockByTipoReferencia(tipoReferencia: string): Observable<any[]> {
    return from(this.api.getMovimientosStockByTipoReferencia(tipoReferencia));
  }

  createMovimientoStock(movimientoData: any): Observable<any> {
    return from(this.api.createMovimientoStock(movimientoData));
  }

  updateMovimientoStock(movimientoId: number, movimientoData: any): Observable<any> {
    return from(this.api.updateMovimientoStock(movimientoId, movimientoData));
  }

  deleteMovimientoStock(movimientoId: number): Observable<boolean> {
    return from(this.api.deleteMovimientoStock(movimientoId));
  }
} 