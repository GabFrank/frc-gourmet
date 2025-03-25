import { Injectable } from '@angular/core';
import { Observable, from, BehaviorSubject } from 'rxjs';
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
import { Categoria } from './entities/productos/categoria.entity';
import { Producto } from './entities/productos/producto.entity';
import { Subcategoria } from './entities/productos/subcategoria.entity';
import { ProductoImage } from './entities/productos/producto-image.entity';
import { Presentacion } from './entities/productos/presentacion.entity';
import { Codigo } from './entities/productos/codigo.entity';
import { Moneda } from './entities/financiero/moneda.entity';
import { PrecioVenta } from './entities/productos/precio-venta.entity';
import { Sabor } from './entities/productos/sabor.entity';
import { PresentacionSabor } from './entities/productos/presentacion-sabor.entity';
import { Receta } from './entities/productos/receta.entity';
import { RecetaItem } from './entities/productos/receta-item.entity';
import { Ingrediente } from './entities/productos/ingrediente.entity';

export interface LoginResult {
  success: boolean;
  usuario?: Usuario;
  token?: string;
  message?: string;
  sessionId?: number;
}

// Define an interface for the electron API
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
  // Categoria operations
  getCategorias: () => Promise<Categoria[]>;
  getCategoria: (categoriaId: number) => Promise<Categoria>;
  createCategoria: (categoriaData: any) => Promise<Categoria>;
  updateCategoria: (categoriaId: number, categoriaData: any) => Promise<any>;
  deleteCategoria: (categoriaId: number) => Promise<any>;
  // Subcategoria operations
  getSubcategorias: () => Promise<Subcategoria[]>;
  getSubcategoria: (subcategoriaId: number) => Promise<Subcategoria>;
  getSubcategoriasByCategoria: (categoriaId: number) => Promise<Subcategoria[]>;
  createSubcategoria: (subcategoriaData: any) => Promise<Subcategoria>;
  updateSubcategoria: (subcategoriaId: number, subcategoriaData: any) => Promise<any>;
  deleteSubcategoria: (subcategoriaId: number) => Promise<any>;
  // Producto operations
  getProductos: () => Promise<Producto[]>;
  getProducto: (productoId: number) => Promise<Producto>;
  getProductosBySubcategoria: (subcategoriaId: number) => Promise<Producto[]>;
  createProducto: (productoData: any) => Promise<Producto>;
  updateProducto: (productoId: number, productoData: any) => Promise<any>;
  deleteProducto: (productoId: number) => Promise<any>;
  saveProductoImage: (base64Data: string, fileName: string) => Promise<{ imageUrl: string }>;
  deleteProductoImage: (imageUrl: string) => Promise<boolean>;
  // Product Image methods
  getProductImages: (productoId: number) => Promise<ProductoImage[]>;
  createProductImage: (imageData: Partial<ProductoImage>) => Promise<ProductoImage>;
  updateProductImage: (imageId: number, imageData: Partial<ProductoImage>) => Promise<ProductoImage>;
  deleteProductImage: (imageId: number) => Promise<boolean>;
  // Presentacion methods
  getPresentaciones: () => Promise<Presentacion[]>;
  getPresentacion: (presentacionId: number) => Promise<Presentacion>;
  getPresentacionesByProducto: (productoId: number) => Promise<Presentacion[]>;
  createPresentacion: (presentacionData: any) => Promise<Presentacion>;
  updatePresentacion: (presentacionId: number, presentacionData: any) => Promise<any>;
  deletePresentacion: (presentacionId: number) => Promise<any>;
  // Codigo methods
  getCodigos: () => Promise<Codigo[]>;
  getCodigo: (codigoId: number) => Promise<Codigo>;
  getCodigosByPresentacion: (presentacionId: number) => Promise<Codigo[]>;
  createCodigo: (codigoData: any) => Promise<Codigo>;
  updateCodigo: (codigoId: number, codigoData: any) => Promise<any>;
  deleteCodigo: (codigoId: number) => Promise<any>;
  // Moneda methods
  getMonedas: () => Promise<Moneda[]>;
  getMoneda: (monedaId: number) => Promise<Moneda>;
  createMoneda: (monedaData: any) => Promise<Moneda>;
  updateMoneda: (monedaId: number, monedaData: any) => Promise<any>;
  deleteMoneda: (monedaId: number) => Promise<any>;
  // PrecioVenta methods
  getPreciosVenta: () => Promise<PrecioVenta[]>;
  getPrecioVenta: (precioVentaId: number) => Promise<PrecioVenta>;
  getPreciosVentaByPresentacion: (presentacionId: number) => Promise<PrecioVenta[]>;
  createPrecioVenta: (precioVentaData: any) => Promise<PrecioVenta>;
  updatePrecioVenta: (precioVentaId: number, precioVentaData: any) => Promise<any>;
  deletePrecioVenta: (precioVentaId: number) => Promise<any>;
  // Sabor methods
  getSabores: () => Promise<Sabor[]>;
  getSabor: (saborId: number) => Promise<Sabor>;
  createSabor: (saborData: any) => Promise<Sabor>;
  updateSabor: (saborId: number, saborData: any) => Promise<any>;
  deleteSabor: (saborId: number) => Promise<any>;
  // PresentacionSabor methods
  getPresentacionSaboresByPresentacion: (presentacionId: number) => Promise<PresentacionSabor[]>;
  getPresentacionSabor: (presentacionSaborId: number) => Promise<PresentacionSabor>;
  createPresentacionSabor: (presentacionSaborData: any) => Promise<PresentacionSabor>;
  updatePresentacionSabor: (presentacionSaborId: number, presentacionSaborData: any) => Promise<any>;
  deletePresentacionSabor: (presentacionSaborId: number) => Promise<any>;
  // Receta methods
  getRecetas: () => Promise<Receta[]>;
  getReceta: (recetaId: number) => Promise<Receta>;
  createReceta: (recetaData: any) => Promise<Receta>;
  updateReceta: (recetaId: number, recetaData: any) => Promise<any>;
  deleteReceta: (recetaId: number) => Promise<any>;
  // RecetaItem methods
  getRecetaItems: (recetaId: number) => Promise<RecetaItem[]>;
  getRecetaItem: (recetaItemId: number) => Promise<RecetaItem>;
  createRecetaItem: (recetaItemData: any) => Promise<RecetaItem>;
  updateRecetaItem: (recetaItemId: number, recetaItemData: any) => Promise<any>;
  deleteRecetaItem: (recetaItemId: number) => Promise<any>;
  // Ingrediente methods
  getIngredientes: () => Promise<Ingrediente[]>;
  getIngrediente: (ingredienteId: number) => Promise<Ingrediente>;
  createIngrediente: (ingredienteData: any) => Promise<Ingrediente>;
  updateIngrediente: (ingredienteId: number, ingredienteData: any) => Promise<any>;
  deleteIngrediente: (ingredienteId: number) => Promise<any>;
}

/**
 * Service to interact with the database through Electron IPC
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

    // Check for stored user on init
    this.loadCurrentUser();
  }

  // Method to load the current user from localStorage
  private async loadCurrentUser(): Promise<void> {
    try {
      const usuario = await this.api.getCurrentUser();
      this.currentUserSubject.next(usuario);
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
    return from(this.api.login(loginData));
  }

  logout(sessionId: number): Observable<boolean> {
    return from(this.api.logout(sessionId));
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

  // Categoria methods
  getCategorias(): Observable<Categoria[]> {
    return from(this.api.getCategorias());
  }

  getCategoria(categoriaId: number): Observable<Categoria> {
    return from(this.api.getCategoria(categoriaId));
  }

  createCategoria(categoriaData: Partial<Categoria>): Observable<Categoria> {
    return from(this.api.createCategoria(categoriaData));
  }

  updateCategoria(categoriaId: number, categoriaData: Partial<Categoria>): Observable<any> {
    return from(this.api.updateCategoria(categoriaId, categoriaData));
  }

  deleteCategoria(categoriaId: number): Observable<any> {
    return from(this.api.deleteCategoria(categoriaId));
  }

  // Subcategoria methods
  getSubcategorias(): Observable<Subcategoria[]> {
    return from(this.api.getSubcategorias());
  }

  getSubcategoria(subcategoriaId: number): Observable<Subcategoria> {
    return from(this.api.getSubcategoria(subcategoriaId));
  }

  getSubcategoriasByCategoria(categoriaId: number): Observable<Subcategoria[]> {
    return from(this.api.getSubcategoriasByCategoria(categoriaId));
  }

  createSubcategoria(subcategoriaData: Partial<Subcategoria>): Observable<Subcategoria> {
    return from(this.api.createSubcategoria(subcategoriaData));
  }

  updateSubcategoria(subcategoriaId: number, subcategoriaData: Partial<Subcategoria>): Observable<any> {
    return from(this.api.updateSubcategoria(subcategoriaId, subcategoriaData));
  }

  deleteSubcategoria(subcategoriaId: number): Observable<any> {
    return from(this.api.deleteSubcategoria(subcategoriaId));
  }

  // Producto methods
  getProductos(): Observable<Producto[]> {
    return from(this.api.getProductos());
  }

  getProducto(productoId: number): Observable<Producto> {
    return from(this.api.getProducto(productoId));
  }

  getProductosBySubcategoria(subcategoriaId: number): Observable<Producto[]> {
    return from(this.api.getProductosBySubcategoria(subcategoriaId));
  }

  createProducto(productoData: Partial<Producto>): Observable<Producto> {
    return from(this.api.createProducto(productoData));
  }

  updateProducto(productoId: number, productoData: Partial<Producto>): Observable<any> {
    return from(this.api.updateProducto(productoId, productoData));
  }

  deleteProducto(productoId: number): Observable<any> {
    return from(this.api.deleteProducto(productoId));
  }

  saveProductoImage(base64Data: string, fileName: string): Observable<{ imageUrl: string }> {
    console.log(`Saving product image with filename: ${fileName}`);
    return from(this.api.saveProductoImage(base64Data, fileName)
      .then(result => {
        console.log('Image saved successfully:', result);

        // Ensure the URL uses the app:// protocol for correct loading in renderer
        if (result.imageUrl && !result.imageUrl.startsWith('app://')) {
          result.imageUrl = `app://${result.imageUrl.replace(/\\/g, '/')}`;
          console.log('Adjusted image URL:', result.imageUrl);
        }

        return result;
      })
      .catch(error => {
        console.error('Error saving product image:', error);
        throw error;
      })
    );
  }

  deleteProductoImage(imageUrl: string): Observable<boolean> {
    return from(this.api.deleteProductoImage(imageUrl));
  }

  // New methods for product images
  getProductImages(productoId: number): Observable<ProductoImage[]> {
    return from(this.api.getProductImages(productoId));
  }

  createProductImage(imageData: Partial<ProductoImage>): Observable<ProductoImage> {
    return from(this.api.createProductImage(imageData));
  }

  updateProductImage(imageId: number, imageData: Partial<ProductoImage>): Observable<ProductoImage> {
    return from(this.api.updateProductImage(imageId, imageData));
  }

  deleteProductImage(imageId: number): Observable<boolean> {
    return from(this.api.deleteProductImage(imageId));
  }

  // Presentacion methods
  getPresentaciones(): Observable<Presentacion[]> {
    return from(this.api.getPresentaciones());
  }

  getPresentacion(presentacionId: number): Observable<Presentacion> {
    return from(this.api.getPresentacion(presentacionId));
  }

  getPresentacionesByProducto(productoId: number): Observable<Presentacion[]> {
    return from(this.api.getPresentacionesByProducto(productoId));
  }

  createPresentacion(presentacionData: Partial<Presentacion>): Observable<Presentacion> {
    return from(this.api.createPresentacion(presentacionData));
  }

  updatePresentacion(presentacionId: number, presentacionData: Partial<Presentacion>): Observable<any> {
    return from(this.api.updatePresentacion(presentacionId, presentacionData));
  }

  deletePresentacion(presentacionId: number): Observable<any> {
    return from(this.api.deletePresentacion(presentacionId));
  }

  // Codigo methods
  getCodigos(): Observable<Codigo[]> {
    return from(this.api.getCodigos());
  }

  getCodigo(codigoId: number): Observable<Codigo> {
    return from(this.api.getCodigo(codigoId));
  }

  getCodigosByPresentacion(presentacionId: number): Observable<Codigo[]> {
    return from(this.api.getCodigosByPresentacion(presentacionId));
  }

  createCodigo(codigoData: Partial<Codigo>): Observable<Codigo> {
    return from(this.api.createCodigo(codigoData));
  }

  updateCodigo(codigoId: number, codigoData: Partial<Codigo>): Observable<any> {
    return from(this.api.updateCodigo(codigoId, codigoData));
  }

  deleteCodigo(codigoId: number): Observable<any> {
    return from(this.api.deleteCodigo(codigoId));
  }

  // Moneda methods
  getMonedas(): Observable<Moneda[]> {
    return from(this.api.getMonedas());
  }

  getMoneda(monedaId: number): Observable<Moneda> {
    return from(this.api.getMoneda(monedaId));
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

  // PrecioVenta methods
  getPreciosVenta(): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVenta());
  }

  getPrecioVenta(precioVentaId: number): Observable<PrecioVenta> {
    return from(this.api.getPrecioVenta(precioVentaId));
  }

  getPreciosVentaByPresentacion(presentacionId: number): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByPresentacion(presentacionId));
  }

  createPrecioVenta(precioVentaData: Partial<PrecioVenta>): Observable<PrecioVenta> {
    return from(this.api.createPrecioVenta(precioVentaData));
  }

  updatePrecioVenta(precioVentaId: number, precioVentaData: Partial<PrecioVenta>): Observable<any> {
    return from(this.api.updatePrecioVenta(precioVentaId, precioVentaData));
  }

  deletePrecioVenta(precioVentaId: number): Observable<any> {
    return from(this.api.deletePrecioVenta(precioVentaId));
  }

  // Sabor methods
  getSabores(): Observable<Sabor[]> {
    return from(this.api.getSabores());
  }

  getSabor(saborId: number): Observable<Sabor> {
    return from(this.api.getSabor(saborId));
  }

  createSabor(saborData: Partial<Sabor>): Observable<Sabor> {
    return from(this.api.createSabor(saborData));
  }

  updateSabor(saborId: number, saborData: Partial<Sabor>): Observable<any> {
    return from(this.api.updateSabor(saborId, saborData));
  }

  deleteSabor(saborId: number): Observable<any> {
    return from(this.api.deleteSabor(saborId));
  }

  // PresentacionSabor methods
  getPresentacionSabores(presentacionId: number): Observable<PresentacionSabor[]> {
    return from(this.api.getPresentacionSaboresByPresentacion(presentacionId));
  }

  getPresentacionSabor(presentacionSaborId: number): Observable<PresentacionSabor> {
    return from(this.api.getPresentacionSabor(presentacionSaborId));
  }

  createPresentacionSabor(presentacionSaborData: Partial<PresentacionSabor>): Observable<PresentacionSabor> {
    return from(this.api.createPresentacionSabor(presentacionSaborData));
  }

  updatePresentacionSabor(presentacionSaborId: number, presentacionSaborData: Partial<PresentacionSabor>): Observable<any> {
    return from(this.api.updatePresentacionSabor(presentacionSaborId, presentacionSaborData));
  }

  deletePresentacionSabor(presentacionSaborId: number): Observable<any> {
    return from(this.api.deletePresentacionSabor(presentacionSaborId));
  }

  // Receta methods
  getRecetas(): Observable<Receta[]> {
    return from(this.api.getRecetas());
  }

  getReceta(recetaId: number): Observable<Receta> {
    return from(this.api.getReceta(recetaId));
  }

  createReceta(recetaData: Partial<Receta>): Observable<Receta> {
    return from(this.api.createReceta(recetaData));
  }

  updateReceta(recetaId: number, recetaData: Partial<Receta>): Observable<any> {
    return from(this.api.updateReceta(recetaId, recetaData));
  }

  deleteReceta(recetaId: number): Observable<any> {
    return from(this.api.deleteReceta(recetaId));
  }

  // RecetaItem methods
  getRecetaItems(recetaId: number): Observable<RecetaItem[]> {
    return from(this.api.getRecetaItems(recetaId));
  }

  getRecetaItem(recetaItemId: number): Observable<RecetaItem> {
    return from(this.api.getRecetaItem(recetaItemId));
  }

  createRecetaItem(recetaItemData: Partial<RecetaItem>): Observable<RecetaItem> {
    return from(this.api.createRecetaItem(recetaItemData));
  }

  updateRecetaItem(recetaItemId: number, recetaItemData: Partial<RecetaItem>): Observable<any> {
    return from(this.api.updateRecetaItem(recetaItemId, recetaItemData));
  }

  deleteRecetaItem(recetaItemId: number): Observable<any> {
    return from(this.api.deleteRecetaItem(recetaItemId));
  }

  // Ingrediente methods
  getIngredientes(): Observable<Ingrediente[]> {
    return from(this.api.getIngredientes());
  }

  getIngrediente(ingredienteId: number): Observable<Ingrediente> {
    return from(this.api.getIngrediente(ingredienteId));
  }

  createIngrediente(ingredienteData: Partial<Ingrediente>): Observable<Ingrediente> {
    return from(this.api.createIngrediente(ingredienteData));
  }

  updateIngrediente(ingredienteId: number, ingredienteData: Partial<Ingrediente>): Observable<any> {
    return from(this.api.updateIngrediente(ingredienteId, ingredienteData));
  }

  deleteIngrediente(ingredienteId: number): Observable<any> {
    return from(this.api.deleteIngrediente(ingredienteId));
  }
}
