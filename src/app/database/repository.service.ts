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
  
  // TODO: Add non-product methods here as needed
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
} 