import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { RepositoryService, LoginResult } from './repository.service';
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
import { MonedaBillete } from './entities/financiero/moneda-billete.entity';
import { MonedaCambio } from './entities/financiero/moneda-cambio.entity';
import { Conteo } from './entities/financiero/conteo.entity';
import { ConteoDetalle } from './entities/financiero/conteo-detalle.entity';
import { Dispositivo } from './entities/financiero/dispositivo.entity';
import { Caja, CajaEstado } from './entities/financiero/caja.entity';
import { CajaMoneda } from './entities/financiero/caja-moneda.entity';
import { Proveedor } from './entities/compras/proveedor.entity';
import { Compra } from './entities/compras/compra.entity';
import { CompraDetalle } from './entities/compras/compra-detalle.entity';
import { Pago } from './entities/compras/pago.entity';
import { PagoDetalle } from './entities/compras/pago-detalle.entity';
import { ProveedorProducto } from './entities/compras/proveedor-producto.entity';
import { FormasPago } from './entities/compras/forma-pago.entity';
import { PrecioDelivery } from './entities/ventas/precio-delivery.entity';
import { Delivery, DeliveryEstado } from './entities/ventas/delivery.entity';
import { Venta, VentaEstado } from './entities/ventas/venta.entity';
import { VentaItem } from './entities/ventas/venta-item.entity';
import { PdvGrupoCategoria } from './entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from './entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from './entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from './entities/ventas/pdv-item-producto.entity';
import { PdvConfig } from './entities/ventas/pdv-config.entity';
import { PdvMesa } from './entities/ventas/pdv-mesa.entity';
import { Sector } from './entities/ventas/sector.entity';
import { Reserva } from './entities/ventas/reserva.entity';
import { Moneda } from './entities/financiero/moneda.entity';
import { TipoPrecio } from './entities/financiero/tipo-precio.entity';
import { Familia } from './entities/productos/familia.entity';
import { Subfamilia } from './entities/productos/subfamilia.entity';
import { Producto } from './entities/productos/producto.entity';
import { Presentacion } from './entities/productos/presentacion.entity';
import { CodigoBarra } from './entities/productos/codigo-barra.entity';
import { PrecioVenta } from './entities/productos/precio-venta.entity';
import { PrecioCosto } from './entities/productos/precio-costo.entity';
import { Receta } from './entities/productos/receta.entity';
import { RecetaIngrediente } from './entities/productos/receta-ingrediente.entity';
import { StockMovimiento } from './entities/productos/stock-movimiento.entity';
import { ConversionMoneda } from './entities/productos/conversion-moneda.entity';
import { ConfiguracionMonetaria } from './entities/productos/configuracion-monetaria.entity';
import { Observacion } from './entities/productos/observacion.entity';
import { ProductoObservacion } from './entities/productos/producto-observacion.entity';
import { Adicional } from './entities/productos/adicional.entity';
import { RecetaAdicionalVinculacion } from './entities/productos/receta-adicional-vinculacion.entity';
import { RecetaIngredienteIntercambiable } from './entities/productos/receta-ingrediente-intercambiable.entity';

/**
 * Skeleton de la implementación HTTP del repositorio. F4 (modo cliente) la
 * llenará: cada metodo hara `POST /api/rpc { method, params }` contra el
 * server. Por ahora cada stub tira `Error('not implemented')`.
 *
 * Auto-generada con `scripts/generate-repository-http-skeleton.py`.
 *
 * Cuando F4 reemplace los stubs, este archivo deja de ser auto-generado y
 * pasa a ser editado a mano (o reemplazado por una capa generica que
 * mappee todos los metodos a `dbRpc(method, params)` en una sola linea).
 */
@Injectable({
  providedIn: 'root'
})
export class RepositoryHttpService extends RepositoryService {
  constructor() {
    super();
  }

  getCurrentUser(): Observable<Usuario | null> {
    return throwError(() => new Error(`RepositoryHttpService.getCurrentUser() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCurrentUserId(): number | undefined {
    throw new Error(`RepositoryHttpService.getCurrentUserId() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`);
  }
  setCurrentUser(usuario: Usuario | null): void {
    throw new Error(`RepositoryHttpService.setCurrentUser() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`);
  }
  getPersonas(): Observable<Persona[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPersonas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPersona(personaId: number): Observable<Persona> {
    return throwError(() => new Error(`RepositoryHttpService.getPersona() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPersona(personaData: Partial<Persona>): Observable<Persona> {
    return throwError(() => new Error(`RepositoryHttpService.createPersona() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePersona(personaId: number, personaData: Partial<Persona>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePersona() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePersona(personaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePersona() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getUsuarios(): Observable<Usuario[]> {
    return throwError(() => new Error(`RepositoryHttpService.getUsuarios() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getUsuario(usuarioId: number): Observable<Usuario> {
    return throwError(() => new Error(`RepositoryHttpService.getUsuario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createUsuario(usuarioData: Partial<Usuario>): Observable<Usuario> {
    return throwError(() => new Error(`RepositoryHttpService.createUsuario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateUsuario(usuarioId: number, usuarioData: Partial<Usuario>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateUsuario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteUsuario(usuarioId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteUsuario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRoles(): Observable<Role[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRoles() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRole(roleId: number): Observable<Role> {
    return throwError(() => new Error(`RepositoryHttpService.getRole() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createRole(roleData: Partial<Role>): Observable<Role> {
    return throwError(() => new Error(`RepositoryHttpService.createRole() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateRole(roleId: number, roleData: Partial<Role>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateRole() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteRole(roleId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteRole() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getUsuarioRoles(usuarioId: number): Observable<UsuarioRole[]> {
    return throwError(() => new Error(`RepositoryHttpService.getUsuarioRoles() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  assignRoleToUsuario(usuarioId: number, roleId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.assignRoleToUsuario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  removeRoleFromUsuario(usuarioRoleId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.removeRoleFromUsuario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getTipoClientes(): Observable<TipoCliente[]> {
    return throwError(() => new Error(`RepositoryHttpService.getTipoClientes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getTipoCliente(tipoClienteId: number): Observable<TipoCliente> {
    return throwError(() => new Error(`RepositoryHttpService.getTipoCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createTipoCliente(tipoClienteData: Partial<TipoCliente>): Observable<TipoCliente> {
    return throwError(() => new Error(`RepositoryHttpService.createTipoCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateTipoCliente(tipoClienteId: number, tipoClienteData: Partial<TipoCliente>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateTipoCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteTipoCliente(tipoClienteId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteTipoCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getClientes(): Observable<Cliente[]> {
    return throwError(() => new Error(`RepositoryHttpService.getClientes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCliente(clienteId: number): Observable<Cliente> {
    return throwError(() => new Error(`RepositoryHttpService.getCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCliente(clienteData: Partial<Cliente>): Observable<Cliente> {
    return throwError(() => new Error(`RepositoryHttpService.createCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCliente(clienteId: number, clienteData: Partial<Cliente>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCliente(clienteId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPrinters(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPrinters() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  addPrinter(printer: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.addPrinter() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePrinter(printerId: number, printer: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePrinter() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePrinter(printerId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePrinter() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  printReceipt(orderId: number, printerId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.printReceipt() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  printTestPage(printerId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.printTestPage() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getUsuariosPaginated(page: number, pageSize: number, filters?: { nickname?: string; nombrePersona?: string; activo?: string | boolean }): Observable<{items: Usuario[], total: number}> {
    return throwError(() => new Error(`RepositoryHttpService.getUsuariosPaginated() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  login(loginData: {nickname: string, password: string, deviceInfo: DeviceInfo}): Observable<LoginResult> {
    return throwError(() => new Error(`RepositoryHttpService.login() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  validateCredentials(data: { nickname: string, password: string }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.validateCredentials() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  logout(sessionId: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.logout() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateSessionActivity(sessionId: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.updateSessionActivity() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLoginSessions(usuarioId: number): Observable<LoginSession[]> {
    return throwError(() => new Error(`RepositoryHttpService.getLoginSessions() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  uploadImage(formData: FormData): Observable<{ imageUrl: string }> {
    return throwError(() => new Error(`RepositoryHttpService.uploadImage() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteProfileImage(imageUrl: string): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deleteProfileImage() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  saveFile(input: { carpeta: string; base64: string; fileName: string; generateThumbnails?: boolean }): Observable<{ url: string; fileName: string; mimeType: string; tamanoBytes: number; thumbUrl?: string; mediumUrl?: string }> {
    return throwError(() => new Error(`RepositoryHttpService.saveFile() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteFile(url: string): Observable<{ ok: boolean }> {
    return throwError(() => new Error(`RepositoryHttpService.deleteFile() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  readFileBase64(url: string): Observable<{ base64: string; mimeType: string }> {
    return throwError(() => new Error(`RepositoryHttpService.readFileBase64() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  openFileWithSystem(url: string): Observable<{ ok: boolean; error?: string }> {
    return throwError(() => new Error(`RepositoryHttpService.openFileWithSystem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAdjuntos(params: { entidadTipo: string; entidadId: number }): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getAdjuntos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createAdjunto(data: { entidadTipo: string; entidadId: number; tipo?: string; archivoUrl: string; nombreArchivo: string; mimeType?: string; tamanoBytes?: number; observacion?: string }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createAdjunto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateAdjunto(id: number, data: { tipo?: string; observacion?: string }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateAdjunto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteAdjunto(id: number): Observable<{ success: boolean; message?: string }> {
    return throwError(() => new Error(`RepositoryHttpService.deleteAdjunto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedas(): Observable<Moneda[]> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMoneda(monedaId: number): Observable<Moneda> {
    return throwError(() => new Error(`RepositoryHttpService.getMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedaPrincipal(): Observable<Moneda> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedaPrincipal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createMoneda(monedaData: Partial<Moneda>): Observable<Moneda> {
    return throwError(() => new Error(`RepositoryHttpService.createMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateMoneda(monedaId: number, monedaData: Partial<Moneda>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteMoneda(monedaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedasBilletes(): Observable<MonedaBillete[]> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedasBilletes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedaBillete(monedaBilleteId: number): Observable<MonedaBillete> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedaBillete() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createMonedaBillete(monedaBilleteData: Partial<MonedaBillete>): Observable<MonedaBillete> {
    return throwError(() => new Error(`RepositoryHttpService.createMonedaBillete() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateMonedaBillete(monedaBilleteId: number, monedaBilleteData: Partial<MonedaBillete>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateMonedaBillete() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteMonedaBillete(monedaBilleteId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteMonedaBillete() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConteos(): Observable<Conteo[]> {
    return throwError(() => new Error(`RepositoryHttpService.getConteos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConteo(conteoId: number): Observable<Conteo> {
    return throwError(() => new Error(`RepositoryHttpService.getConteo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createConteo(conteoData: Partial<Conteo>): Observable<Conteo> {
    return throwError(() => new Error(`RepositoryHttpService.createConteo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateConteo(conteoId: number, conteoData: Partial<Conteo>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateConteo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteConteo(conteoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteConteo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConteoDetalles(conteoId: number): Observable<ConteoDetalle[]> {
    return throwError(() => new Error(`RepositoryHttpService.getConteoDetalles() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConteoDetalle(conteoDetalleId: number): Observable<ConteoDetalle> {
    return throwError(() => new Error(`RepositoryHttpService.getConteoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createConteoDetalle(conteoDetalleData: Partial<ConteoDetalle>): Observable<ConteoDetalle> {
    return throwError(() => new Error(`RepositoryHttpService.createConteoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateConteoDetalle(conteoDetalleId: number, conteoDetalleData: Partial<ConteoDetalle>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateConteoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteConteoDetalle(conteoDetalleId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteConteoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDispositivos(): Observable<Dispositivo[]> {
    return throwError(() => new Error(`RepositoryHttpService.getDispositivos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDispositivo(dispositivoId: number): Observable<Dispositivo> {
    return throwError(() => new Error(`RepositoryHttpService.getDispositivo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createDispositivo(dispositivoData: Partial<Dispositivo>): Observable<Dispositivo> {
    return throwError(() => new Error(`RepositoryHttpService.createDispositivo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateDispositivo(dispositivoId: number, dispositivoData: Partial<Dispositivo>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateDispositivo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteDispositivo(dispositivoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteDispositivo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajas(): Observable<Caja[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCajas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaAbiertaByUsuario(usuarioId: number): Observable<Caja> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaAbiertaByUsuario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCaja(cajaId: number): Observable<Caja> {
    return throwError(() => new Error(`RepositoryHttpService.getCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCaja(cajaData: Partial<Caja>): Observable<Caja> {
    return throwError(() => new Error(`RepositoryHttpService.createCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCaja(cajaId: number, cajaData: Partial<Caja>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCaja(cajaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaByDispositivo(dispositivoId: number): Observable<Caja[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaByDispositivo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajasMonedas(): Observable<CajaMoneda[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCajasMonedas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaMoneda(cajaMonedaId: number): Observable<CajaMoneda> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCajaMoneda(cajaMonedaData: Partial<CajaMoneda>): Observable<CajaMoneda> {
    return throwError(() => new Error(`RepositoryHttpService.createCajaMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCajaMoneda(cajaMonedaId: number, cajaMonedaData: Partial<CajaMoneda>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCajaMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCajaMoneda(cajaMonedaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCajaMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  saveCajasMonedas(updates: any[]): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.saveCajasMonedas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedasCambio(): Observable<MonedaCambio[]> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedasCambio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedasCambioByMonedaOrigen(monedaOrigenId: number): Observable<MonedaCambio[]> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedasCambioByMonedaOrigen() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedaCambio(monedaCambioId: number): Observable<MonedaCambio> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedaCambio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getValorEnMonedaPrincipal(monedaId: number, valor: number): Observable<number> {
    return throwError(() => new Error(`RepositoryHttpService.getValorEnMonedaPrincipal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createMonedaCambio(monedaCambioData: Partial<MonedaCambio>): Observable<MonedaCambio> {
    return throwError(() => new Error(`RepositoryHttpService.createMonedaCambio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateMonedaCambio(monedaCambioId: number, monedaCambioData: Partial<MonedaCambio>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateMonedaCambio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteMonedaCambio(monedaCambioId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteMonedaCambio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMonedaCambioByMonedaPrincipal(): Observable<MonedaCambio> {
    return throwError(() => new Error(`RepositoryHttpService.getMonedaCambioByMonedaPrincipal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProveedores(): Observable<Proveedor[]> {
    return throwError(() => new Error(`RepositoryHttpService.getProveedores() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProveedor(proveedorId: number): Observable<Proveedor> {
    return throwError(() => new Error(`RepositoryHttpService.getProveedor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createProveedor(proveedorData: Partial<Proveedor>): Observable<Proveedor> {
    return throwError(() => new Error(`RepositoryHttpService.createProveedor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateProveedor(proveedorId: number, proveedorData: Partial<Proveedor>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateProveedor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteProveedor(proveedorId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteProveedor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  searchProveedoresByText(searchText: string): Observable<Proveedor[]> {
    return throwError(() => new Error(`RepositoryHttpService.searchProveedoresByText() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCompras(): Observable<Compra[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCompras() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCompra(compraId: number): Observable<Compra> {
    return throwError(() => new Error(`RepositoryHttpService.getCompra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCompra(compraData: Partial<Compra>): Observable<Compra> {
    return throwError(() => new Error(`RepositoryHttpService.createCompra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCompra(compraId: number, compraData: Partial<Compra>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCompra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCompra(compraId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCompra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComprasPaginado(params: any): Observable<{ items: Compra[]; total: number; page: number; pageSize: number }> {
    return throwError(() => new Error(`RepositoryHttpService.getComprasPaginado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCompraBorrador(data: any): Observable<Compra> {
    return throwError(() => new Error(`RepositoryHttpService.createCompraBorrador() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCompraBorrador(id: number, data: any): Observable<Compra> {
    return throwError(() => new Error(`RepositoryHttpService.updateCompraBorrador() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  finalizarCompra(id: number, payload: any): Observable<Compra> {
    return throwError(() => new Error(`RepositoryHttpService.finalizarCompra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularCompra(id: number, motivo: string): Observable<{ success: boolean }> {
    return throwError(() => new Error(`RepositoryHttpService.anularCompra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCompraDetalles(compraId: number): Observable<CompraDetalle[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCompraDetalles() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCompraDetalle(compraDetalleId: number): Observable<CompraDetalle> {
    return throwError(() => new Error(`RepositoryHttpService.getCompraDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCompraDetalle(compraDetalleData: Partial<CompraDetalle>): Observable<CompraDetalle> {
    return throwError(() => new Error(`RepositoryHttpService.createCompraDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCompraDetalle(compraDetalleId: number, compraDetalleData: Partial<CompraDetalle>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCompraDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCompraDetalle(compraDetalleId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCompraDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPagos(): Observable<Pago[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPagos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPago(pagoId: number): Observable<Pago> {
    return throwError(() => new Error(`RepositoryHttpService.getPago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPagosByCompra(compraId: number): Observable<Pago[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPagosByCompra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPago(pagoData: Partial<Pago>): Observable<Pago> {
    return throwError(() => new Error(`RepositoryHttpService.createPago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePago(pagoId: number, pagoData: Partial<Pago>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePago(pagoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPagoDetalles(pagoId: number): Observable<PagoDetalle[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPagoDetalles() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPagoDetalle(pagoDetalleId: number): Observable<PagoDetalle> {
    return throwError(() => new Error(`RepositoryHttpService.getPagoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPagoDetalle(pagoDetalleData: Partial<PagoDetalle>): Observable<PagoDetalle> {
    return throwError(() => new Error(`RepositoryHttpService.createPagoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePagoDetalle(pagoDetalleId: number, pagoDetalleData: Partial<PagoDetalle>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePagoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePagoDetalle(pagoDetalleId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePagoDetalle() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProveedorProductos(): Observable<ProveedorProducto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getProveedorProductos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProveedorProductosByProveedor(proveedorId: number): Observable<ProveedorProducto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getProveedorProductosByProveedor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProveedorProducto(proveedorProductoId: number): Observable<ProveedorProducto> {
    return throwError(() => new Error(`RepositoryHttpService.getProveedorProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createProveedorProducto(proveedorProductoData: Partial<ProveedorProducto>): Observable<ProveedorProducto> {
    return throwError(() => new Error(`RepositoryHttpService.createProveedorProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateProveedorProducto(proveedorProductoId: number, proveedorProductoData: Partial<ProveedorProducto>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateProveedorProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteProveedorProducto(proveedorProductoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteProveedorProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProveedorProductosPaginado(params: { proveedorId: number; search?: string; page?: number; pageSize?: number }): Observable<{ items: any[]; total: number; page: number; pageSize: number }> {
    return throwError(() => new Error(`RepositoryHttpService.getProveedorProductosPaginado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getUltimasComprasProducto(params: { productoId: number; page?: number; pageSize?: number }): Observable<{ items: any[]; total: number; page: number; pageSize: number }> {
    return throwError(() => new Error(`RepositoryHttpService.getUltimasComprasProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getUltimoCostoProducto(params: { productoId: number; proveedorId?: number | null }): Observable<{ ultimoCosto: number | null; fuente: 'PROVEEDOR_PRODUCTO' | 'COMPRA_DETALLE' | null; fecha: string | Date | null }> {
    return throwError(() => new Error(`RepositoryHttpService.getUltimoCostoProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFormasPago(): Observable<FormasPago[]> {
    return throwError(() => new Error(`RepositoryHttpService.getFormasPago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFormaPago(formaPagoId: number): Observable<FormasPago> {
    return throwError(() => new Error(`RepositoryHttpService.getFormaPago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createFormaPago(formaPagoData: Partial<FormasPago>): Observable<FormasPago> {
    return throwError(() => new Error(`RepositoryHttpService.createFormaPago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateFormaPago(formaPagoId: number, formaPagoData: Partial<FormasPago>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateFormaPago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteFormaPago(formaPagoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteFormaPago() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateFormasPagoOrder(updates: { id: number, orden: number }[]): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateFormasPagoOrder() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPreciosDelivery(): Observable<PrecioDelivery[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPreciosDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPrecioDelivery(precioDeliveryId: number): Observable<PrecioDelivery> {
    return throwError(() => new Error(`RepositoryHttpService.getPrecioDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPrecioDelivery(precioDeliveryData: Partial<PrecioDelivery>): Observable<PrecioDelivery> {
    return throwError(() => new Error(`RepositoryHttpService.createPrecioDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePrecioDelivery(precioDeliveryId: number, precioDeliveryData: Partial<PrecioDelivery>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePrecioDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePrecioDelivery(precioDeliveryId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePrecioDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDeliveries(): Observable<Delivery[]> {
    return throwError(() => new Error(`RepositoryHttpService.getDeliveries() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDeliveriesByEstado(estado: DeliveryEstado): Observable<Delivery[]> {
    return throwError(() => new Error(`RepositoryHttpService.getDeliveriesByEstado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDelivery(deliveryId: number): Observable<Delivery> {
    return throwError(() => new Error(`RepositoryHttpService.getDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createDelivery(deliveryData: Partial<Delivery>): Observable<Delivery> {
    return throwError(() => new Error(`RepositoryHttpService.createDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateDelivery(deliveryId: number, deliveryData: Partial<Delivery>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteDelivery(deliveryId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteDelivery() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDeliveriesByCaja(cajaId: number, filtros?: any): Observable<{ data: any[], total: number }> {
    return throwError(() => new Error(`RepositoryHttpService.getDeliveriesByCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  buscarClientePorTelefono(telefono: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.buscarClientePorTelefono() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  buscarClientesPorTelefono(telefono: string): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.buscarClientesPorTelefono() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  crearClienteRapido(data: { telefono: string; nombre?: string; direccion?: string }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.crearClienteRapido() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cerrarVentasAbiertasMesa(mesaId: number, estado: string): Observable<number> {
    return throwError(() => new Error(`RepositoryHttpService.cerrarVentasAbiertasMesa() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentas(): Observable<Venta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentasByDateRange(desde: string, hasta: string, filtros?: any): Observable<{ data: Venta[], total: number }> {
    return throwError(() => new Error(`RepositoryHttpService.getVentasByDateRange() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentasByEstado(estado: VentaEstado): Observable<Venta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentasByEstado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentasByCaja(cajaId: number): Observable<Venta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentasByCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getResumenCaja(cajaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getResumenCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentasTotalByCaja(cajaId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentasTotalByCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVenta(ventaId: number): Observable<Venta> {
    return throwError(() => new Error(`RepositoryHttpService.getVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createVenta(ventaData: Partial<Venta>): Observable<Venta> {
    return throwError(() => new Error(`RepositoryHttpService.createVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateVenta(ventaId: number, ventaData: Partial<Venta>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteVenta(ventaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentaItems(ventaId: number): Observable<VentaItem[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentaItems() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentaItem(ventaItemId: number): Observable<VentaItem> {
    return throwError(() => new Error(`RepositoryHttpService.getVentaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createVentaItem(ventaItemData: Partial<VentaItem>): Observable<VentaItem> {
    return throwError(() => new Error(`RepositoryHttpService.createVentaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateVentaItem(ventaItemId: number, ventaItemData: Partial<VentaItem>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateVentaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteVentaItem(ventaItemId: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deleteVentaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getObservacionesByVentaItem(ventaItemId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getObservacionesByVentaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createVentaItemObservacion(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createVentaItemObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteVentaItemObservacion(id: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deleteVentaItemObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentaItemAdicionales(ventaItemId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentaItemAdicionales() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createVentaItemAdicional(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createVentaItemAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteVentaItemAdicional(id: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deleteVentaItemAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentaItemIngredienteModificaciones(ventaItemId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentaItemIngredienteModificaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createVentaItemIngredienteModificacion(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createVentaItemIngredienteModificacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createVentaItemSabor(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createVentaItemSabor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVentaItemSabores(ventaItemId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVentaItemSabores() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteVentaItemSaboresByItem(ventaItemId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteVentaItemSaboresByItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteVentaItemIngredienteModificacion(id: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deleteVentaItemIngredienteModificacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComandas(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getComandas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComandasActivas(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getComandasActivas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComandasByMesa(mesaId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getComandasByMesa() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComanda(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getComanda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createComanda(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createComanda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateComanda(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateComanda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteComanda(id: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deleteComanda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComandasDisponibles(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getComandasDisponibles() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComandasOcupadas(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getComandasOcupadas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComandasBySector(sectorId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getComandasBySector() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  abrirComanda(comandaId: number, data: { mesaId?: number, sectorId?: number, observacion?: string }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.abrirComanda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cerrarComanda(comandaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cerrarComanda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createBatchComandas(batchData: any[]): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.createBatchComandas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComandaWithVenta(comandaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getComandaWithVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvGrupoCategorias(): Observable<PdvGrupoCategoria[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvGrupoCategorias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvGrupoCategoria(id: number): Observable<PdvGrupoCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvGrupoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvGrupoCategoria(data: Partial<PdvGrupoCategoria>): Observable<PdvGrupoCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvGrupoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvGrupoCategoria(id: number, data: Partial<PdvGrupoCategoria>): Observable<PdvGrupoCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvGrupoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePdvGrupoCategoria(id: number): Observable<PdvGrupoCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.deletePdvGrupoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvCategorias(): Observable<PdvCategoria[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvCategorias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvCategoriasByGrupo(grupoId: number): Observable<PdvCategoria[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvCategoriasByGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvCategoria(id: number): Observable<PdvCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvCategoria(data: Partial<PdvCategoria>): Observable<PdvCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvCategoria(id: number, data: Partial<PdvCategoria>): Observable<PdvCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePdvCategoria(id: number): Observable<PdvCategoria> {
    return throwError(() => new Error(`RepositoryHttpService.deletePdvCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvCategoriaItems(): Observable<PdvCategoriaItem[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvCategoriaItems() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvCategoriaItemsByCategoria(categoriaId: number): Observable<PdvCategoriaItem[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvCategoriaItemsByCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvCategoriaItem(id: number): Observable<PdvCategoriaItem> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvCategoriaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvCategoriaItem(data: Partial<PdvCategoriaItem>): Observable<PdvCategoriaItem> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvCategoriaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvCategoriaItem(id: number, data: Partial<PdvCategoriaItem>): Observable<PdvCategoriaItem> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvCategoriaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePdvCategoriaItem(id: number): Observable<PdvCategoriaItem> {
    return throwError(() => new Error(`RepositoryHttpService.deletePdvCategoriaItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvItemProductos(): Observable<PdvItemProducto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvItemProductos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvItemProductosByItem(itemId: number): Observable<PdvItemProducto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvItemProductosByItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvItemProducto(id: number): Observable<PdvItemProducto> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvItemProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvItemProducto(data: Partial<PdvItemProducto>): Observable<PdvItemProducto> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvItemProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvItemProducto(id: number, data: Partial<PdvItemProducto>): Observable<PdvItemProducto> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvItemProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePdvItemProducto(id: number): Observable<PdvItemProducto> {
    return throwError(() => new Error(`RepositoryHttpService.deletePdvItemProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvConfig(): Observable<PdvConfig> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvConfig() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvConfig(data: Partial<PdvConfig>): Observable<PdvConfig> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvConfig() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvConfig(id: number, data: Partial<PdvConfig>): Observable<PdvConfig> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvConfig() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvMesas(): Observable<PdvMesa[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvMesas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvMesasActivas(): Observable<PdvMesa[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvMesasActivas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvMesasDisponibles(): Observable<PdvMesa[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvMesasDisponibles() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvMesasBySector(sectorId: number): Observable<PdvMesa[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvMesasBySector() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvMesa(id: number): Observable<PdvMesa> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvMesa() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvMesa(data: Partial<PdvMesa>): Observable<PdvMesa> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvMesa() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createBatchPdvMesas(batchData: Partial<PdvMesa>[]): Observable<PdvMesa[]> {
    return throwError(() => new Error(`RepositoryHttpService.createBatchPdvMesas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvMesa(id: number, data: Partial<PdvMesa>): Observable<PdvMesa> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvMesa() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePdvMesa(id: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deletePdvMesa() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSectores(): Observable<Sector[]> {
    return throwError(() => new Error(`RepositoryHttpService.getSectores() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSectoresActivos(): Observable<Sector[]> {
    return throwError(() => new Error(`RepositoryHttpService.getSectoresActivos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSector(id: number): Observable<Sector> {
    return throwError(() => new Error(`RepositoryHttpService.getSector() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createSector(data: Partial<Sector>): Observable<Sector> {
    return throwError(() => new Error(`RepositoryHttpService.createSector() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateSector(id: number, data: Partial<Sector>): Observable<Sector> {
    return throwError(() => new Error(`RepositoryHttpService.updateSector() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteSector(id: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.deleteSector() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getObservaciones(): Observable<Observacion[]> {
    return throwError(() => new Error(`RepositoryHttpService.getObservaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  searchObservaciones(search: string): Observable<Observacion[]> {
    return throwError(() => new Error(`RepositoryHttpService.searchObservaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getObservacion(id: number): Observable<Observacion> {
    return throwError(() => new Error(`RepositoryHttpService.getObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createObservacion(data: Partial<Observacion>): Observable<Observacion> {
    return throwError(() => new Error(`RepositoryHttpService.createObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateObservacion(id: number, data: Partial<Observacion>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteObservacion(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getObservacionesByProducto(productoId: number): Observable<ProductoObservacion[]> {
    return throwError(() => new Error(`RepositoryHttpService.getObservacionesByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createProductoObservacion(data: Partial<ProductoObservacion>): Observable<ProductoObservacion> {
    return throwError(() => new Error(`RepositoryHttpService.createProductoObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteProductoObservacion(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteProductoObservacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComboByProducto(productoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getComboByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCombo(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCombo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCombo(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCombo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCombo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCombo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getComboProductos(comboId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getComboProductos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createComboProducto(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createComboProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateComboProducto(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateComboProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteComboProducto(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteComboProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAdicionales(): Observable<Adicional[]> {
    return throwError(() => new Error(`RepositoryHttpService.getAdicionales() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAdicionalesWithFilters(filters: {
    search?: string;
    activo?: boolean | null;
    categoria?: string;
    page?: number;
    pageSize?: number;
  }): Observable<{items: Adicional[], total: number, page: number, pageSize: number}> {
    return throwError(() => new Error(`RepositoryHttpService.getAdicionalesWithFilters() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAdicional(adicionalId: number): Observable<Adicional> {
    return throwError(() => new Error(`RepositoryHttpService.getAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createAdicional(data: Partial<Adicional>): Observable<Adicional> {
    return throwError(() => new Error(`RepositoryHttpService.createAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateAdicional(id: number, data: Partial<Adicional>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteAdicional(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAdicionalWithReceta(adicionalId: number): Observable<Adicional> {
    return throwError(() => new Error(`RepositoryHttpService.getAdicionalWithReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createRecetaForAdicional(adicionalId: number, recetaData: any): Observable<Receta> {
    return throwError(() => new Error(`RepositoryHttpService.createRecetaForAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateRecetaForAdicional(adicionalId: number, recetaData: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateRecetaForAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteRecetaForAdicional(adicionalId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteRecetaForAdicional() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetaAdicionalVinculaciones(recetaId: number): Observable<RecetaAdicionalVinculacion[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetaAdicionalVinculaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetaAdicionalVinculacion(vinculacionId: number): Observable<RecetaAdicionalVinculacion> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetaAdicionalVinculacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createRecetaAdicionalVinculacion(data: Partial<RecetaAdicionalVinculacion>): Observable<RecetaAdicionalVinculacion> {
    return throwError(() => new Error(`RepositoryHttpService.createRecetaAdicionalVinculacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateRecetaAdicionalVinculacion(id: number, data: Partial<RecetaAdicionalVinculacion>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateRecetaAdicionalVinculacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteRecetaAdicionalVinculacion(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteRecetaAdicionalVinculacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetaIngredientesIntercambiables(recetaIngredienteId: number): Observable<RecetaIngredienteIntercambiable[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetaIngredientesIntercambiables() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createRecetaIngredienteIntercambiable(data: Partial<RecetaIngredienteIntercambiable>): Observable<RecetaIngredienteIntercambiable> {
    return throwError(() => new Error(`RepositoryHttpService.createRecetaIngredienteIntercambiable() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateRecetaIngredienteIntercambiable(id: number, data: Partial<RecetaIngredienteIntercambiable>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateRecetaIngredienteIntercambiable() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteRecetaIngredienteIntercambiable(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteRecetaIngredienteIntercambiable() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFamilias(): Observable<Familia[]> {
    return throwError(() => new Error(`RepositoryHttpService.getFamilias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFamilia(familiaId: number): Observable<Familia> {
    return throwError(() => new Error(`RepositoryHttpService.getFamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createFamilia(familiaData: Partial<Familia>): Observable<Familia> {
    return throwError(() => new Error(`RepositoryHttpService.createFamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateFamilia(familiaId: number, familiaData: Partial<Familia>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateFamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteFamilia(familiaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteFamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSubfamilias(): Observable<Subfamilia[]> {
    return throwError(() => new Error(`RepositoryHttpService.getSubfamilias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSubfamiliasByFamilia(familiaId: number): Observable<Subfamilia[]> {
    return throwError(() => new Error(`RepositoryHttpService.getSubfamiliasByFamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSubfamilia(subfamiliaId: number): Observable<Subfamilia> {
    return throwError(() => new Error(`RepositoryHttpService.getSubfamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createSubfamilia(subfamiliaData: Partial<Subfamilia>): Observable<Subfamilia> {
    return throwError(() => new Error(`RepositoryHttpService.createSubfamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateSubfamilia(subfamiliaId: number, subfamiliaData: Partial<Subfamilia>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateSubfamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteSubfamilia(subfamiliaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteSubfamilia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProductos(): Observable<Producto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getProductos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProductosWithFilters(filters: {
    search?: string;
    tipo?: string;
    activo?: string;
    esVendible?: string;
    esComprable?: string;
    controlaStock?: string;
    esIngrediente?: string;
    page?: number;
    pageSize?: number;
  }): Observable<{items: Producto[], total: number}> {
    return throwError(() => new Error(`RepositoryHttpService.getProductosWithFilters() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProducto(productoId: number): Observable<Producto> {
    return throwError(() => new Error(`RepositoryHttpService.getProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createProducto(productoData: Partial<Producto>): Observable<Producto> {
    return throwError(() => new Error(`RepositoryHttpService.createProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateProducto(productoId: number, productoData: Partial<Producto>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteProducto(productoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPresentaciones(): Observable<Presentacion[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPresentaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPresentacionesByProducto(productoId: number, page?: number, pageSize?: number, filtroActivo?: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getPresentacionesByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPresentacion(presentacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPresentacion(presentacionData: Partial<Presentacion>): Observable<Presentacion> {
    return throwError(() => new Error(`RepositoryHttpService.createPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePresentacion(presentacionId: number, presentacionData: Partial<Presentacion>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePresentacion(presentacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  setPresentacionPrincipal(presentacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.setPresentacionPrincipal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  togglePresentacionActivo(presentacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.togglePresentacionActivo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCodigoBarra(codigoBarraData: Partial<CodigoBarra>): Observable<CodigoBarra> {
    return throwError(() => new Error(`RepositoryHttpService.createCodigoBarra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCodigoBarra(codigoBarraId: number, codigoBarraData: Partial<CodigoBarra>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCodigoBarra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCodigoBarra(codigoBarraId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCodigoBarra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCodigosBarraByPresentacion(presentacionId: number): Observable<CodigoBarra[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCodigosBarraByPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  searchProductosByCodigo(codigo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.searchProductosByCodigo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPreciosVenta(): Observable<PrecioVenta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPreciosVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPreciosVentaByPresentacion(presentacionId: number, activo: boolean | null): Observable<PrecioVenta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPreciosVentaByPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPreciosVentaByReceta(recetaId: number, activo: boolean | null): Observable<PrecioVenta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPreciosVentaByReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPreciosVentaByProducto(productoId: number, activo: boolean | null): Observable<PrecioVenta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPreciosVentaByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPrecioVenta(precioVentaData: Partial<PrecioVenta>): Observable<PrecioVenta> {
    return throwError(() => new Error(`RepositoryHttpService.createPrecioVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePrecioVenta(precioVentaId: number, precioVentaData: Partial<PrecioVenta>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePrecioVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePrecioVenta(precioVentaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePrecioVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPreciosCosto(): Observable<PrecioCosto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPreciosCosto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPreciosCostoByProducto(productoId: number): Observable<PrecioCosto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPreciosCostoByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPrecioCosto(precioCostoData: Partial<PrecioCosto>): Observable<PrecioCosto> {
    return throwError(() => new Error(`RepositoryHttpService.createPrecioCosto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePrecioCosto(precioCostoId: number, precioCostoData: Partial<PrecioCosto>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePrecioCosto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePrecioCosto(precioCostoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePrecioCosto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetas(): Observable<Receta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetasWithFilters(filters: {
    search?: string;
    activo?: boolean | null;
    page?: number;
    pageSize?: number;
  }): Observable<{items: Receta[], total: number, page: number, pageSize: number}> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetasWithFilters() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReceta(recetaId: number): Observable<Receta> {
    return throwError(() => new Error(`RepositoryHttpService.getReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createReceta(recetaData: Partial<Receta>): Observable<Receta> {
    return throwError(() => new Error(`RepositoryHttpService.createReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateReceta(recetaId: number, recetaData: Partial<Receta>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  checkRecetaDependencies(recetaId: number): Observable<{
    receta: { id: number; nombre: string };
    productosVinculados: Array<{ id: number; nombre: string; tipo: string; activo: boolean }>;
  }> {
    return throwError(() => new Error(`RepositoryHttpService.checkRecetaDependencies() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteReceta(recetaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetasByEstado(activo: boolean | null): Observable<Receta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetasByEstado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  searchRecetasByNombre(nombre: string): Observable<Receta[]> {
    return throwError(() => new Error(`RepositoryHttpService.searchRecetasByNombre() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetasWithIngredientes(): Observable<Receta[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetasWithIngredientes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  calcularCostoReceta(recetaId: number): Observable<number> {
    return throwError(() => new Error(`RepositoryHttpService.calcularCostoReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  actualizarCostoReceta(recetaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.actualizarCostoReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetaIngredientes(recetaId: number): Observable<RecetaIngrediente[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetaIngredientes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createRecetaIngrediente(recetaIngredienteData: Partial<RecetaIngrediente>): Observable<RecetaIngrediente> {
    return throwError(() => new Error(`RepositoryHttpService.createRecetaIngrediente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateRecetaIngrediente(recetaIngredienteId: number, recetaIngredienteData: Partial<RecetaIngrediente>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateRecetaIngrediente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteRecetaIngrediente(recetaIngredienteId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteRecetaIngrediente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteRecetaIngredienteMultiplesVariaciones(data: {
    recetaIngredienteId: number;
    eliminarDeOtrasVariaciones: boolean;
  }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteRecetaIngredienteMultiplesVariaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetaIngredientesActivos(recetaId: number): Observable<RecetaIngrediente[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetaIngredientesActivos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  calcularCostoIngrediente(recetaIngredienteId: number): Observable<number> {
    return throwError(() => new Error(`RepositoryHttpService.calcularCostoIngrediente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  validarStockIngrediente(recetaIngredienteId: number): Observable<boolean> {
    return throwError(() => new Error(`RepositoryHttpService.validarStockIngrediente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSaboresByProducto(productoId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getSaboresByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createSabor(saborData: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    productoId: number;
    imageUrl?: string | null;
  }): Observable<{ sabor: any; receta: any; mensaje: string }> {
    return throwError(() => new Error(`RepositoryHttpService.createSabor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateSabor(saborId: number, saborData: Partial<any>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateSabor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteSabor(saborId: number): Observable<{ success: boolean; mensaje: string }> {
    return throwError(() => new Error(`RepositoryHttpService.deleteSabor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSaboresEstadisticas(productoId: number): Observable<{
    totalSabores: number;
    saboresActivos: number;
    totalRecetas: number;
    totalVariaciones: number;
  }> {
    return throwError(() => new Error(`RepositoryHttpService.getSaboresEstadisticas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVariacionesByProducto(productoId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVariacionesByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVariacionesByProductoAndPresentacion(productoId: number, presentacionId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVariacionesByProductoAndPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVariacionesByReceta(recetaId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVariacionesByReceta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createRecetaPresentacion(variacionData: {
    recetaId: number;
    presentacionId: number;
    saborId: number;
    nombre_generado?: string;
    sku?: string;
    precio_ajuste?: number;
  }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createRecetaPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateRecetaPresentacion(variacionId: number, variacionData: Partial<any>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateRecetaPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteRecetaPresentacion(variacionId: number): Observable<{ success: boolean; mensaje: string }> {
    return throwError(() => new Error(`RepositoryHttpService.deleteRecetaPresentacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  bulkUpdateVariaciones(updates: Array<{
    variacionId: number;
    precio_ajuste?: number;
    activo?: boolean;
  }>): Observable<{ success: boolean; actualizadas: number }> {
    return throwError(() => new Error(`RepositoryHttpService.bulkUpdateVariaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  recalcularCostoVariacion(variacionId: number): Observable<{
    success: boolean;
    costoAnterior: number;
    costoNuevo: number;
    mensaje: string;
  }> {
    return throwError(() => new Error(`RepositoryHttpService.recalcularCostoVariacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  generateVariacionesFaltantes(productoId: number): Observable<{
    success: boolean;
    variacionesGeneradas: number;
    variaciones: any[];
  }> {
    return throwError(() => new Error(`RepositoryHttpService.generateVariacionesFaltantes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getStockMovimientos(): Observable<StockMovimiento[]> {
    return throwError(() => new Error(`RepositoryHttpService.getStockMovimientos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getStockMovimientosByProducto(productoId: number): Observable<StockMovimiento[]> {
    return throwError(() => new Error(`RepositoryHttpService.getStockMovimientosByProducto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createStockMovimiento(stockMovimientoData: Partial<StockMovimiento>): Observable<StockMovimiento> {
    return throwError(() => new Error(`RepositoryHttpService.createStockMovimiento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateStockMovimiento(stockMovimientoId: number, stockMovimientoData: Partial<StockMovimiento>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateStockMovimiento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteStockMovimiento(stockMovimientoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteStockMovimiento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  procesarStockVenta(ventaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.procesarStockVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  revertirStockVenta(ventaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.revertirStockVenta() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  searchProductosByNombre(nombre: string, mode?: 'venta' | 'compra'): Observable<Producto[]> {
    return throwError(() => new Error(`RepositoryHttpService.searchProductosByNombre() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProductosByTipo(tipo: string): Observable<Producto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getProductosByTipo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getProductosWithStock(): Observable<Producto[]> {
    return throwError(() => new Error(`RepositoryHttpService.getProductosWithStock() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConversionesMoneda(): Observable<ConversionMoneda[]> {
    return throwError(() => new Error(`RepositoryHttpService.getConversionesMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createConversionMoneda(conversionData: Partial<ConversionMoneda>): Observable<ConversionMoneda> {
    return throwError(() => new Error(`RepositoryHttpService.createConversionMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateConversionMoneda(conversionId: number, conversionData: Partial<ConversionMoneda>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateConversionMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteConversionMoneda(conversionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteConversionMoneda() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConfiguracionMonetaria(): Observable<ConfiguracionMonetaria> {
    return throwError(() => new Error(`RepositoryHttpService.getConfiguracionMonetaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createConfiguracionMonetaria(configData: Partial<ConfiguracionMonetaria>): Observable<ConfiguracionMonetaria> {
    return throwError(() => new Error(`RepositoryHttpService.createConfiguracionMonetaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateConfiguracionMonetaria(configId: number, configData: Partial<ConfiguracionMonetaria>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateConfiguracionMonetaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getTiposPrecio(): Observable<TipoPrecio[]> {
    return throwError(() => new Error(`RepositoryHttpService.getTiposPrecio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getTipoPrecio(tipoPrecioId: number): Observable<TipoPrecio> {
    return throwError(() => new Error(`RepositoryHttpService.getTipoPrecio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createTipoPrecio(tipoPrecioData: Partial<TipoPrecio>): Observable<TipoPrecio> {
    return throwError(() => new Error(`RepositoryHttpService.createTipoPrecio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateTipoPrecio(tipoPrecioId: number, tipoPrecioData: Partial<TipoPrecio>): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateTipoPrecio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteTipoPrecio(tipoPrecioId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteTipoPrecio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  recalculateAllRecipeCosts(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.recalculateAllRecipeCosts() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  recalculateRecipeCost(recetaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.recalculateRecipeCost() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSabores(): Observable<string[]> {
    return throwError(() => new Error(`RepositoryHttpService.getSabores() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createOrUpdateSabor(saborData: any): Observable<{ success: boolean, message: string }> {
    return throwError(() => new Error(`RepositoryHttpService.createOrUpdateSabor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSaborDetails(categoria: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getSaborDetails() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRecetasIdsPorVariacionIds(variacionIds: number[]): Observable<{ [variacionId: number]: number }> {
    return throwError(() => new Error(`RepositoryHttpService.getRecetasIdsPorVariacionIds() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvAtajoGrupos(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvAtajoGrupos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvAtajoGrupo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvAtajoGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvAtajoGrupo(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvAtajoGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvAtajoGrupo(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvAtajoGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePdvAtajoGrupo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePdvAtajoGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  reorderPdvAtajoGrupos(orderedIds: number[]): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.reorderPdvAtajoGrupos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvAtajoItems(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvAtajoItems() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvAtajoItem(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvAtajoItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvAtajoItemsByGrupo(grupoId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvAtajoItemsByGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPdvAtajoItem(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createPdvAtajoItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePdvAtajoItem(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePdvAtajoItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePdvAtajoItem(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePdvAtajoItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  assignAtajoItemToGrupo(grupoId: number, itemId: number, posicion: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.assignAtajoItemToGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  removeAtajoItemFromGrupo(grupoId: number, itemId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.removeAtajoItemFromGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  reorderAtajoItemsInGrupo(grupoId: number, orderedItemIds: number[]): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.reorderAtajoItemsInGrupo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPdvAtajoItemProductos(atajoItemId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPdvAtajoItemProductos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  assignProductoToAtajoItem(atajoItemId: number, productoId: number, data?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.assignProductoToAtajoItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  removeProductoFromAtajoItem(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.removeProductoFromAtajoItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  reorderProductosInAtajoItem(atajoItemId: number, orderedIds: number[]): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.reorderProductosInAtajoItem() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajasMayor(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCajasMayor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaMayor(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaMayor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCajaMayor(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCajaMayor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCajaMayor(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCajaMayor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cerrarCajaMayor(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cerrarCajaMayor() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaMayorSaldos(cajaMayorId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaMayorSaldos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  recalcularSaldos(cajaMayorId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.recalcularSaldos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaMayorMovimientos(cajaMayorId: number, filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaMayorMovimientos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCajaMayorMovimiento(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCajaMayorMovimiento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularCajaMayorMovimiento(id: number, motivo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularCajaMayorMovimiento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaMayorConfiguracion(cajaMayorId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaMayorConfiguracion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  saveCajaMayorConfiguracion(cajaMayorId: number,
    data: {
      formaPagoIds: number[];
      cuentaBancariaIds: number[];
      mostrarCuentasPorPagar?: boolean;
      mostrarCuentasPorCobrar?: boolean;
    }): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.saveCajaMayorConfiguracion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentaBancariaResumen(cuentaBancariaId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentaBancariaResumen() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentasBancariasResumenes(ids: number[]): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentasBancariasResumenes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaMayorCppResumen(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaMayorCppResumen() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCajaMayorCpcResumen(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCajaMayorCpcResumen() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getGastoCategorias(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getGastoCategorias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getGastoCategoria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getGastoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createGastoCategoria(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createGastoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateGastoCategoria(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateGastoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteGastoCategoria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteGastoCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getGastos(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getGastos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getGasto(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getGasto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createGasto(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createGasto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularGasto(id: number, motivo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularGasto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  editGasto(gastoId: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.editGasto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  editCajaMayorMovimiento(movId: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.editCajaMayorMovimiento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getGastosProgramados(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getGastosProgramados() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRetirosCaja(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRetirosCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRetiroCaja(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getRetiroCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createRetiroCaja(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createRetiroCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  ingresarRetiroCaja(retiroId: number, cajaMayorId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.ingresarRetiroCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentasBancarias(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentasBancarias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentaBancaria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentaBancaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCuentaBancaria(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCuentaBancaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCuentaBancaria(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCuentaBancaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCuentaBancaria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCuentaBancaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMaquinasPos(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getMaquinasPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMaquinaPos(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getMaquinaPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createMaquinaPos(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createMaquinaPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateMaquinaPos(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateMaquinaPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteMaquinaPos(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteMaquinaPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAcreditacionesPos(filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getAcreditacionesPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAcreditacionPos(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getAcreditacionPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createAcreditacionPos(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createAcreditacionPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  procesarAcreditacionesAuto(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.procesarAcreditacionesAuto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  verificarAcreditacionPos(id: number, montoAcreditado: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.verificarAcreditacionPos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAcreditacionesPendientes(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getAcreditacionesPendientes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  acreditarTransferenciaBancaria(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.acreditarTransferenciaBancaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCompraCategorias(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCompraCategorias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCompraCategoria(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCompraCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCompraCategoria(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCompraCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCompraCategoria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCompraCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCompraCuotas(compraId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCompraCuotas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  setCompraCuotas(compraId: number, cuotas: any[]): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.setCompraCuotas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  pagarCompraCuota(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.pagarCompraCuota() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentasPorPagar(filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentasPorPagar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentaPorPagar(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentaPorPagar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCuentaPorPagar(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCuentaPorPagar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCuentaPorPagar(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCuentaPorPagar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cancelarCuentaPorPagar(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cancelarCuentaPorPagar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentaPorPagarCuotas(cppId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentaPorPagarCuotas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  pagarCppCuota(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.pagarCppCuota() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  pagarCuotasComprasLote(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.pagarCuotasComprasLote() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuotasPendientesCompras(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCuotasPendientesCompras() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cancelarCppCuota(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cancelarCppCuota() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDashboardShortcuts(dashboardKey?: string): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getDashboardShortcuts() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createDashboardShortcut(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createDashboardShortcut() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateDashboardShortcut(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateDashboardShortcut() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteDashboardShortcut(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteDashboardShortcut() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getEntradaVariaCategorias(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getEntradaVariaCategorias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getEntradaVariaCategoria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getEntradaVariaCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createEntradaVariaCategoria(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createEntradaVariaCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateEntradaVariaCategoria(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateEntradaVariaCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteEntradaVariaCategoria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteEntradaVariaCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getEntradasVarias(filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getEntradasVarias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getEntradaVaria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getEntradaVaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createEntradaVaria(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createEntradaVaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularEntradaVaria(id: number, motivo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularEntradaVaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getOperacionFinancieraCategorias(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getOperacionFinancieraCategorias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getOperacionFinancieraCategoria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getOperacionFinancieraCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createOperacionFinancieraCategoria(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createOperacionFinancieraCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateOperacionFinancieraCategoria(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateOperacionFinancieraCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteOperacionFinancieraCategoria(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteOperacionFinancieraCategoria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getOperacionesFinancieras(filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getOperacionesFinancieras() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getOperacionFinanciera(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getOperacionFinanciera() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createOperacionFinanciera(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createOperacionFinanciera() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularOperacionFinanciera(id: number, motivo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularOperacionFinanciera() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMovimientosCuentaBancaria(cuentaBancariaId: number, filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getMovimientosCuentaBancaria() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createMovimientoBancario(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createMovimientoBancario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getChequeras(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getChequeras() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getChequera(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getChequera() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createChequera(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createChequera() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateChequera(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateChequera() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteChequera(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteChequera() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCheques(filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCheques() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCheque(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCheque() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  emitirCheque(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.emitirCheque() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cobrarCheque(id: number, data?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cobrarCheque() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularCheque(id: number, motivo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularCheque() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPermissions(modulo?: string): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPermissions() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAllPermissions(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getAllPermissions() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPermission(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createPermission() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePermission(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePermission() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deletePermission(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deletePermission() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getRolePermissions(roleId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getRolePermissions() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  setRolePermissions(roleId: number, permissionIds: number[]): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.setRolePermissions() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPermissionsByUser(userId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPermissionsByUser() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  seedPermissions(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.seedPermissions() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConfiguracionesRrhh(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getConfiguracionesRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getConfiguracionRrhh(clave: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getConfiguracionRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createConfiguracionRrhh(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createConfiguracionRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateConfiguracionRrhh(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateConfiguracionRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteConfiguracionRrhh(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteConfiguracionRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  seedConfiguracionRrhh(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.seedConfiguracionRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCargos(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCargos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCargo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCargo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCargo(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCargo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCargo(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCargo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteCargo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteCargo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFuncionarios(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getFuncionarios() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFuncionario(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createFuncionario(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateFuncionario(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cambiarCargoFuncionario(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cambiarCargoFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cambiarSalarioFuncionario(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cambiarSalarioFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  egresarFuncionario(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.egresarFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getHistoricoCargos(funcionarioId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getHistoricoCargos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getHistoricoSalarios(funcionarioId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getHistoricoSalarios() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFuncionarioDocumentos(funcionarioId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getFuncionarioDocumentos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  uploadFuncionarioDocumento(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.uploadFuncionarioDocumento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteFuncionarioDocumento(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteFuncionarioDocumento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFuncionarioDocumentoBase64(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getFuncionarioDocumentoBase64() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateFuncionarioDocumento(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateFuncionarioDocumento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getTurnos(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getTurnos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getTurno(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getTurno() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createTurno(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createTurno() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateTurno(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateTurno() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteTurno(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteTurno() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  asignarTurnoFuncionario(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.asignarTurnoFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cerrarFuncionarioTurno(id: number, fechaHasta?: Date): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cerrarFuncionarioTurno() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateFuncionarioTurno(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateFuncionarioTurno() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFuncionarioTurnos(funcionarioId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getFuncionarioTurnos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAsistencias(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getAsistencias() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAsistencia(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getAsistencia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createAsistencia(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createAsistencia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateAsistencia(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateAsistencia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  justificarAsistencia(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.justificarAsistencia() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  marcarAsistenciaMasiva(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.marcarAsistenciaMasiva() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getPenalizaciones(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getPenalizaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createPenalizacion(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createPenalizacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updatePenalizacion(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updatePenalizacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularPenalizacion(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularPenalizacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFeriados(anio?: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getFeriados() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createFeriado(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createFeriado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateFeriado(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateFeriado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteFeriado(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteFeriado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getHorasExtra(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getHorasExtra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createHoraExtra(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createHoraExtra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularHoraExtra(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularHoraExtra() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMotivosVale(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getMotivosVale() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createMotivoVale(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createMotivoVale() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateMotivoVale(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateMotivoVale() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteMotivoVale(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteMotivoVale() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVales(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVales() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getValesPendientesDescuento(funcionarioId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getValesPendientesDescuento() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createVale(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createVale() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  confirmarVale(id: number, payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.confirmarVale() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularVale(id: number, motivo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularVale() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  marcarValeDescontado(id: number, liquidacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.marcarValeDescontado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLiquidacionConceptos(): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getLiquidacionConceptos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  seedLiquidacionConceptos(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.seedLiquidacionConceptos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateLiquidacionConcepto(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateLiquidacionConcepto() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLiquidacionesSueldo(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getLiquidacionesSueldo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLiquidacionSueldo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getLiquidacionSueldo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  generarLiquidacionBorrador(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.generarLiquidacionBorrador() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  agregarItemLiquidacion(liquidacionId: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.agregarItemLiquidacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  eliminarItemLiquidacion(itemId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.eliminarItemLiquidacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  aprobarLiquidacionSueldo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.aprobarLiquidacionSueldo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  volverBorradorLiquidacionSueldo(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.volverBorradorLiquidacionSueldo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  pagarLiquidacionSueldo(id: number, payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.pagarLiquidacionSueldo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularLiquidacionSueldo(id: number, motivo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularLiquidacionSueldo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getBonos(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getBonos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createBono(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createBono() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularBono(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularBono() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getAguinaldos(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getAguinaldos() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  calcularAguinaldosAnio(anio: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.calcularAguinaldosAnio() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVacaciones(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getVacaciones() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getVacacion(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getVacacion() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  generarVacacionesFuncionario(funcionarioId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.generarVacacionesFuncionario() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  programarVacacionPeriodo(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.programarVacacionPeriodo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  marcarPeriodoGozado(periodoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.marcarPeriodoGozado() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cancelarVacacionPeriodo(periodoId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cancelarVacacionPeriodo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLiquidacionesFinal(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getLiquidacionesFinal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLiquidacionFinal(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getLiquidacionFinal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  generarLiquidacionFinal(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.generarLiquidacionFinal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  aprobarLiquidacionFinal(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.aprobarLiquidacionFinal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  pagarLiquidacionFinal(id: number, payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.pagarLiquidacionFinal() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReglasComision(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getReglasComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReglaComision(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReglaComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createReglaComision(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createReglaComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateReglaComision(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateReglaComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteReglaComision(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteReglaComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getFuncionariosRegla(reglaId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getFuncionariosRegla() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  asignarFuncionarioRegla(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.asignarFuncionarioRegla() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  desasignarFuncionarioRegla(asignacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.desasignarFuncionarioRegla() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLiquidacionesComision(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getLiquidacionesComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getLiquidacionComision(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getLiquidacionComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  generarLiquidacionComision(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.generarLiquidacionComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  generarLiquidacionesComisionMes(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.generarLiquidacionesComisionMes() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  aprobarLiquidacionComision(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.aprobarLiquidacionComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  agregarItemManualLiquidacionComision(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.agregarItemManualLiquidacionComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  eliminarItemLiquidacionComision(itemId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.eliminarItemLiquidacionComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularLiquidacionComision(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularLiquidacionComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getEquiposComision(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getEquiposComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getEquipoComision(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getEquipoComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createEquipoComision(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createEquipoComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateEquipoComision(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateEquipoComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  deleteEquipoComision(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.deleteEquipoComision() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  agregarMiembroEquipo(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.agregarMiembroEquipo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  eliminarMiembroEquipo(miembroId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.eliminarMiembroEquipo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  actualizarPorcentajeMiembro(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.actualizarPorcentajeMiembro() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  asignarReglaEquipo(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.asignarReglaEquipo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  desasignarReglaEquipo(asignacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.desasignarReglaEquipo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  evaluarEquipoPeriodo(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.evaluarEquipoPeriodo() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentasPorCobrar(filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentasPorCobrar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentaPorCobrar(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentaPorCobrar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  createCuentaPorCobrar(data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.createCuentaPorCobrar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  updateCuentaPorCobrar(id: number, data: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.updateCuentaPorCobrar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cancelarCuentaPorCobrar(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cancelarCuentaPorCobrar() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getCuentaPorCobrarCuotas(cpcId: number): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getCuentaPorCobrarCuotas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  cobrarCpcCuota(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.cobrarCpcCuota() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  anularCobroCpcCuota(payload: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.anularCobroCpcCuota() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  recalcularSaldoCliente(clienteId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.recalcularSaldoCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getMovimientosCliente(clienteId: number, filtros?: any): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getMovimientosCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getSaldoCliente(clienteId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getSaldoCliente() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getNotificacionesRrhh(filtros?: any): Observable<any[]> {
    return throwError(() => new Error(`RepositoryHttpService.getNotificacionesRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  marcarNotificacionLeida(id: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.marcarNotificacionLeida() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  marcarTodasNotificacionesLeidas(usuarioId?: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.marcarTodasNotificacionesLeidas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  generarNotificacionesRrhh(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.generarNotificacionesRrhh() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  countNotificacionesNoLeidas(usuarioId?: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.countNotificacionesNoLeidas() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDashboardRrhhKpis(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getDashboardRrhhKpis() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDashboardVentasKpis(rango?: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getDashboardVentasKpis() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDashboardComprasKpis(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getDashboardComprasKpis() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDashboardProductosKpis(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getDashboardProductosKpis() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDashboardFinancieroKpis(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getDashboardFinancieroKpis() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getDashboardCajaMayorKpis(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getDashboardCajaMayorKpis() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReporteLiquidacionesMesData(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReporteLiquidacionesMesData() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteLiquidacionesMesExcel(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteLiquidacionesMesExcel() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteLiquidacionesMesPdf(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteLiquidacionesMesPdf() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReporteAsistenciaMesData(periodo: string, funcionarioId?: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReporteAsistenciaMesData() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteAsistenciaMesExcel(periodo: string, funcionarioId?: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteAsistenciaMesExcel() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReporteValesMesData(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReporteValesMesData() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteValesMesExcel(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteValesMesExcel() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReportePrestamosActivosData(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReportePrestamosActivosData() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReportePrestamosActivosExcel(): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReportePrestamosActivosExcel() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReporteComisionesMesData(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReporteComisionesMesData() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteComisionesMesExcel(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteComisionesMesExcel() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReciboLiquidacionPdf(liquidacionId: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReciboLiquidacionPdf() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReporteAguinaldoAnualData(anio: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReporteAguinaldoAnualData() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteAguinaldoAnualExcel(anio: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteAguinaldoAnualExcel() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteAguinaldoAnualPdf(anio: number): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteAguinaldoAnualPdf() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  getReporteResumenIpsData(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.getReporteResumenIpsData() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
  exportReporteResumenIpsExcel(periodo: string): Observable<any> {
    return throwError(() => new Error(`RepositoryHttpService.exportReporteResumenIpsExcel() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
  }
}
