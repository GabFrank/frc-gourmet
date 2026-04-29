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
// Import new financial entities
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
// Import productos entities
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
  validateCredentials: (data: { nickname: string, password: string }) => Promise<any>;
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
  getTiposPrecio: () => Promise<TipoPrecio[]>;
  getTipoPrecio: (tipoPrecioId: number) => Promise<TipoPrecio>;
  createTipoPrecio: (tipoPrecioData: any) => Promise<TipoPrecio>;
  updateTipoPrecio: (tipoPrecioId: number, tipoPrecioData: any) => Promise<any>;
  deleteTipoPrecio: (tipoPrecioId: number) => Promise<any>;
  // MonedaBillete methods
  getMonedasBilletes: () => Promise<MonedaBillete[]>;
  getMonedaBillete: (monedaBilleteId: number) => Promise<MonedaBillete>;
  createMonedaBillete: (monedaBilleteData: Partial<MonedaBillete>) => Promise<MonedaBillete>;
  updateMonedaBillete: (monedaBilleteId: number, monedaBilleteData: Partial<MonedaBillete>) => Promise<any>;
  deleteMonedaBillete: (monedaBilleteId: number) => Promise<any>;
  // Conteo methods
  getConteos: () => Promise<Conteo[]>;
  getConteo: (conteoId: number) => Promise<Conteo>;
  createConteo: (conteoData: Partial<Conteo>) => Promise<Conteo>;
  updateConteo: (conteoId: number, conteoData: Partial<Conteo>) => Promise<any>;
  deleteConteo: (conteoId: number) => Promise<any>;
  // ConteoDetalle methods
  getConteoDetalles: (conteoId: number) => Promise<ConteoDetalle[]>;
  getConteoDetalle: (conteoDetalleId: number) => Promise<ConteoDetalle>;
  createConteoDetalle: (conteoDetalleData: Partial<ConteoDetalle>) => Promise<ConteoDetalle>;
  updateConteoDetalle: (conteoDetalleId: number, conteoDetalleData: Partial<ConteoDetalle>) => Promise<any>;
  deleteConteoDetalle: (conteoDetalleId: number) => Promise<any>;
  // Dispositivo methods
  getDispositivos: () => Promise<Dispositivo[]>;
  getDispositivo: (dispositivoId: number) => Promise<Dispositivo>;
  createDispositivo: (dispositivoData: Partial<Dispositivo>) => Promise<Dispositivo>;
  updateDispositivo: (dispositivoId: number, dispositivoData: Partial<Dispositivo>) => Promise<any>;
  deleteDispositivo: (dispositivoId: number) => Promise<any>;
  // Caja methods
  getCajas: () => Promise<Caja[]>;
  getCaja: (cajaId: number) => Promise<Caja>;
  getCajaAbiertaByUsuario: (usuarioId: number) => Promise<Caja>;
  createCaja: (cajaData: Partial<Caja>) => Promise<Caja>;
  updateCaja: (cajaId: number, cajaData: Partial<Caja>) => Promise<any>;
  deleteCaja: (cajaId: number) => Promise<any>;
  getCajaByDispositivo: (dispositivoId: number) => Promise<Caja[]>;
  // CajaMoneda methods
  getCajasMonedas: () => Promise<CajaMoneda[]>;
  getCajaMoneda: (cajaMonedaId: number) => Promise<CajaMoneda>;
  createCajaMoneda: (cajaMonedaData: Partial<CajaMoneda>) => Promise<CajaMoneda>;
  updateCajaMoneda: (cajaMonedaId: number, cajaMonedaData: Partial<CajaMoneda>) => Promise<any>;
  deleteCajaMoneda: (cajaMonedaId: number) => Promise<any>;
  saveCajasMonedas: (updates: any[]) => Promise<any>;
  // MonedaCambio methods
  getMonedasCambio: () => Promise<MonedaCambio[]>;
  getMonedasCambioByMonedaOrigen: (monedaOrigenId: number) => Promise<MonedaCambio[]>;
  getMonedaCambio: (monedaCambioId: number) => Promise<MonedaCambio>;
  createMonedaCambio: (monedaCambioData: Partial<MonedaCambio>) => Promise<MonedaCambio>;
  updateMonedaCambio: (monedaCambioId: number, monedaCambioData: Partial<MonedaCambio>) => Promise<any>;
  deleteMonedaCambio: (monedaCambioId: number) => Promise<any>;
  getMonedaCambioByMonedaPrincipal: () => Promise<MonedaCambio>;
  getValorEnMonedaPrincipal: (monedaId: number, valor: number) => Promise<number>;
  // Proveedor methods
  getProveedores: () => Promise<Proveedor[]>;
  getProveedor: (proveedorId: number) => Promise<Proveedor>;
  createProveedor: (proveedorData: Partial<Proveedor>) => Promise<Proveedor>;
  updateProveedor: (proveedorId: number, proveedorData: Partial<Proveedor>) => Promise<any>;
  deleteProveedor: (proveedorId: number) => Promise<any>;
  // Compra methods
  getCompras: () => Promise<Compra[]>;
  getCompra: (compraId: number) => Promise<Compra>;
  createCompra: (compraData: Partial<Compra>) => Promise<Compra>;
  updateCompra: (compraId: number, compraData: Partial<Compra>) => Promise<any>;
  deleteCompra: (compraId: number) => Promise<any>;
  // Add CompraDetalle operations
  getCompraDetalles: (compraId: number) => Promise<CompraDetalle[]>;
  getCompraDetalle: (compraDetalleId: number) => Promise<CompraDetalle>;
  createCompraDetalle: (compraDetalleData: Partial<CompraDetalle>) => Promise<CompraDetalle>;
  updateCompraDetalle: (compraDetalleId: number, compraDetalleData: Partial<CompraDetalle>) => Promise<any>;
  deleteCompraDetalle: (compraDetalleId: number) => Promise<any>;
  // Add Pago operations
  getPagos: () => Promise<Pago[]>;
  getPago: (pagoId: number) => Promise<Pago>;
  getPagosByCompra: (compraId: number) => Promise<Pago[]>;
  createPago: (pagoData: Partial<Pago>) => Promise<Pago>;
  updatePago: (pagoId: number, pagoData: Partial<Pago>) => Promise<any>;
  deletePago: (pagoId: number) => Promise<any>;
  // Add PagoDetalle operations
  getPagoDetalles: (pagoId: number) => Promise<PagoDetalle[]>;
  getPagoDetalle: (pagoDetalleId: number) => Promise<PagoDetalle>;
  createPagoDetalle: (pagoDetalleData: Partial<PagoDetalle>) => Promise<PagoDetalle>;
  updatePagoDetalle: (pagoDetalleId: number, pagoDetalleData: Partial<PagoDetalle>) => Promise<any>;
  deletePagoDetalle: (pagoDetalleId: number) => Promise<any>;
  // Add ProveedorProducto operations
  getProveedorProductos: () => Promise<ProveedorProducto[]>;
  getProveedorProductosByProveedor: (proveedorId: number) => Promise<ProveedorProducto[]>;
  getProveedorProducto: (proveedorProductoId: number) => Promise<ProveedorProducto>;
  createProveedorProducto: (proveedorProductoData: Partial<ProveedorProducto>) => Promise<ProveedorProducto>;
  updateProveedorProducto: (proveedorProductoId: number, proveedorProductoData: Partial<ProveedorProducto>) => Promise<any>;
  deleteProveedorProducto: (proveedorProductoId: number) => Promise<any>;
  // Add FormasPago operations
  getFormasPago: () => Promise<FormasPago[]>;
  getFormaPago: (formaPagoId: number) => Promise<FormasPago>;
  createFormaPago: (formaPagoData: Partial<FormasPago>) => Promise<FormasPago>;
  updateFormaPago: (formaPagoId: number, formaPagoData: Partial<FormasPago>) => Promise<any>;
  deleteFormaPago: (formaPagoId: number) => Promise<any>;
 // PrecioDelivery operations
  getPreciosDelivery: () => Promise<PrecioDelivery[]>;
  getPrecioDelivery: (precioDeliveryId: number) => Promise<PrecioDelivery>;
  createPrecioDelivery: (precioDeliveryData: Partial<PrecioDelivery>) => Promise<PrecioDelivery>;
  updatePrecioDelivery: (precioDeliveryId: number, precioDeliveryData: Partial<PrecioDelivery>) => Promise<any>;
  deletePrecioDelivery: (precioDeliveryId: number) => Promise<any>;
  // Delivery operations
  getDeliveries: () => Promise<Delivery[]>;
  getDeliveriesByEstado: (estado: DeliveryEstado) => Promise<Delivery[]>;
  getDelivery: (deliveryId: number) => Promise<Delivery>;
  createDelivery: (deliveryData: Partial<Delivery>) => Promise<Delivery>;
  updateDelivery: (deliveryId: number, deliveryData: Partial<Delivery>) => Promise<any>;
  deleteDelivery: (deliveryId: number) => Promise<any>;
  getDeliveriesByCaja: (cajaId: number, filtros?: any) => Promise<{ data: any[], total: number }>;
  buscarClientePorTelefono: (telefono: string) => Promise<any>;
  buscarClientesPorTelefono: (telefono: string) => Promise<any[]>;
  crearClienteRapido: (data: { telefono: string; nombre?: string; direccion?: string }) => Promise<any>;
  cerrarVentasAbiertasMesa: (mesaId: number, estado: string) => Promise<number>;
  // Venta operations
  getVentas: () => Promise<Venta[]>;
  getVentasByDateRange: (desde: string, hasta: string, filtros?: any) => Promise<{ data: Venta[], total: number }>;
  getVentasByEstado: (estado: VentaEstado) => Promise<Venta[]>;
  getVentasByCaja: (cajaId: number) => Promise<Venta[]>;
  getResumenCaja: (cajaId: number) => Promise<any>;
  getVentasTotalByCaja: (cajaId: number) => Promise<any[]>;
  getVenta: (ventaId: number) => Promise<Venta>;
  createVenta: (ventaData: Partial<Venta>) => Promise<Venta>;
  updateVenta: (ventaId: number, ventaData: Partial<Venta>) => Promise<any>;
  deleteVenta: (ventaId: number) => Promise<any>;
  // VentaItem operations
  getVentaItems: (ventaId: number) => Promise<VentaItem[]>;
  getVentaItem: (ventaItemId: number) => Promise<VentaItem>;
  createVentaItem: (ventaItemData: Partial<VentaItem>) => Promise<VentaItem>;
  updateVentaItem: (ventaItemId: number, ventaItemData: Partial<VentaItem>) => Promise<any>;
  deleteVentaItem: (ventaItemId: number) => Promise<any>;
  // VentaItemObservacion
  getObservacionesByVentaItem: (ventaItemId: number) => Promise<any[]>;
  createVentaItemObservacion: (data: any) => Promise<any>;
  deleteVentaItemObservacion: (id: number) => Promise<boolean>;
  // VentaItemAdicional
  getVentaItemAdicionales: (ventaItemId: number) => Promise<any[]>;
  createVentaItemAdicional: (data: any) => Promise<any>;
  deleteVentaItemAdicional: (id: number) => Promise<boolean>;
  // VentaItemIngredienteModificacion
  getVentaItemIngredienteModificaciones: (ventaItemId: number) => Promise<any[]>;
  createVentaItemIngredienteModificacion: (data: any) => Promise<any>;
  deleteVentaItemIngredienteModificacion: (id: number) => Promise<boolean>;
  // VentaItemSabor (multi-sabor / variaciones)
  createVentaItemSabor: (data: any) => Promise<any>;
  getVentaItemSabores: (ventaItemId: number) => Promise<any[]>;
  deleteVentaItemSaboresByItem: (ventaItemId: number) => Promise<any>;
  // Comanda (tarjetas de cuenta individual)
  getComandas: () => Promise<any[]>;
  getComandasActivas: () => Promise<any[]>;
  getComandasByMesa: (mesaId: number) => Promise<any[]>;
  getComanda: (id: number) => Promise<any>;
  createComanda: (data: any) => Promise<any>;
  updateComanda: (id: number, data: any) => Promise<any>;
  deleteComanda: (id: number) => Promise<boolean>;
  getComandasDisponibles: () => Promise<any[]>;
  getComandasOcupadas: () => Promise<any[]>;
  getComandasBySector: (sectorId: number) => Promise<any[]>;
  abrirComanda: (comandaId: number, data: { mesaId?: number, sectorId?: number, observacion?: string }) => Promise<any>;
  cerrarComanda: (comandaId: number) => Promise<any>;
  createBatchComandas: (batchData: any[]) => Promise<any[]>;
  getComandaWithVenta: (comandaId: number) => Promise<any>;
  // PDV Grupo Categoria
  getPdvGrupoCategorias: () => Promise<PdvGrupoCategoria[]>;
  getPdvGrupoCategoria: (id: number) => Promise<PdvGrupoCategoria>;
  createPdvGrupoCategoria: (data: Partial<PdvGrupoCategoria>) => Promise<PdvGrupoCategoria>;
  updatePdvGrupoCategoria: (id: number, data: Partial<PdvGrupoCategoria>) => Promise<PdvGrupoCategoria>;
  deletePdvGrupoCategoria: (id: number) => Promise<PdvGrupoCategoria>;
  // PDV Categoria
  getPdvCategorias: () => Promise<PdvCategoria[]>;
  getPdvCategoriasByGrupo: (grupoId: number) => Promise<PdvCategoria[]>;
  getPdvCategoria: (id: number) => Promise<PdvCategoria>;
  createPdvCategoria: (data: Partial<PdvCategoria>) => Promise<PdvCategoria>;
  updatePdvCategoria: (id: number, data: Partial<PdvCategoria>) => Promise<PdvCategoria>;
  deletePdvCategoria: (id: number) => Promise<PdvCategoria>;
  // PDV Categoria Item
  getPdvCategoriaItems: () => Promise<PdvCategoriaItem[]>;
  getPdvCategoriaItemsByCategoria: (categoriaId: number) => Promise<PdvCategoriaItem[]>;
  getPdvCategoriaItem: (id: number) => Promise<PdvCategoriaItem>;
  createPdvCategoriaItem: (data: Partial<PdvCategoriaItem>) => Promise<PdvCategoriaItem>;
  updatePdvCategoriaItem: (id: number, data: Partial<PdvCategoriaItem>) => Promise<PdvCategoriaItem>;
  deletePdvCategoriaItem: (id: number) => Promise<PdvCategoriaItem>;
  // PDV Item Producto
  getPdvItemProductos: () => Promise<PdvItemProducto[]>;
  getPdvItemProductosByItem: (itemId: number) => Promise<PdvItemProducto[]>;
  getPdvItemProducto: (id: number) => Promise<PdvItemProducto>;
  createPdvItemProducto: (data: Partial<PdvItemProducto>) => Promise<PdvItemProducto>;
  updatePdvItemProducto: (id: number, data: Partial<PdvItemProducto>) => Promise<PdvItemProducto>;
  deletePdvItemProducto: (id: number) => Promise<PdvItemProducto>;
  // PDV Config
  getPdvConfig: () => Promise<PdvConfig>;
  createPdvConfig: (data: Partial<PdvConfig>) => Promise<PdvConfig>;
  updatePdvConfig: (id: number, data: Partial<PdvConfig>) => Promise<PdvConfig>;

  // PdvMesa methods
  getPdvMesas: () => Promise<PdvMesa[]>;
  getPdvMesasActivas: () => Promise<PdvMesa[]>;
  getPdvMesasDisponibles: () => Promise<PdvMesa[]>;
  getPdvMesasBySector: (sectorId: number) => Promise<PdvMesa[]>;
  getPdvMesa: (id: number) => Promise<PdvMesa>;
  createPdvMesa: (data: Partial<PdvMesa>) => Promise<PdvMesa>;
  createBatchPdvMesas: (batchData: Partial<PdvMesa>[]) => Promise<PdvMesa[]>;
  updatePdvMesa: (id: number, data: Partial<PdvMesa>) => Promise<PdvMesa>;
  deletePdvMesa: (id: number) => Promise<boolean>;

  // Sector methods
  getSectores: () => Promise<Sector[]>;
  getSectoresActivos: () => Promise<Sector[]>;
  getSector: (id: number) => Promise<Sector>;
  createSector: (data: Partial<Sector>) => Promise<Sector>;
  updateSector: (id: number, data: Partial<Sector>) => Promise<Sector>;
  deleteSector: (id: number) => Promise<boolean>;

  // Observacion methods
  getObservaciones: () => Promise<Observacion[]>;
  searchObservaciones: (search: string) => Promise<Observacion[]>;
  getObservacion: (id: number) => Promise<Observacion>;
  createObservacion: (data: Partial<Observacion>) => Promise<Observacion>;
  updateObservacion: (id: number, data: Partial<Observacion>) => Promise<any>;
  deleteObservacion: (id: number) => Promise<any>;
  getObservacionesByProducto: (productoId: number) => Promise<ProductoObservacion[]>;
  createProductoObservacion: (data: Partial<ProductoObservacion>) => Promise<ProductoObservacion>;
  deleteProductoObservacion: (id: number) => Promise<any>;

  // Combo methods
  getComboByProducto: (productoId: number) => Promise<any>;
  createCombo: (data: any) => Promise<any>;
  updateCombo: (id: number, data: any) => Promise<any>;
  deleteCombo: (id: number) => Promise<any>;
  getComboProductos: (comboId: number) => Promise<any[]>;
  createComboProducto: (data: any) => Promise<any>;
  updateComboProducto: (id: number, data: any) => Promise<any>;
  deleteComboProducto: (id: number) => Promise<any>;

  // Adicional methods (Nueva Arquitectura)
  getAdicionales: () => Promise<Adicional[]>;
  getAdicionalesWithFilters: (filters: {
    search?: string;
    activo?: boolean | null;
    categoria?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<{items: Adicional[], total: number, page: number, pageSize: number}>;
  getAdicional: (adicionalId: number) => Promise<Adicional>;
  getAdicionalWithReceta: (adicionalId: number) => Promise<Adicional>;
  createAdicional: (data: Partial<Adicional>) => Promise<Adicional>;
  updateAdicional: (id: number, data: Partial<Adicional>) => Promise<any>;
  deleteAdicional: (id: number) => Promise<any>;

  // ✅ NUEVOS MÉTODOS: Para gestión de recetas de adicionales
  createRecetaForAdicional: (adicionalId: number, recetaData: any) => Promise<Receta>;
  updateRecetaForAdicional: (adicionalId: number, recetaData: any) => Promise<any>;
  deleteRecetaForAdicional: (adicionalId: number) => Promise<any>;

  // RecetaAdicionalVinculacion methods (Nueva Arquitectura)
  getRecetaAdicionalVinculaciones: (recetaId: number) => Promise<RecetaAdicionalVinculacion[]>;
  getRecetaAdicionalVinculacion: (vinculacionId: number) => Promise<RecetaAdicionalVinculacion>;
  createRecetaAdicionalVinculacion: (data: Partial<RecetaAdicionalVinculacion>) => Promise<RecetaAdicionalVinculacion>;
  updateRecetaAdicionalVinculacion: (id: number, data: Partial<RecetaAdicionalVinculacion>) => Promise<any>;
  deleteRecetaAdicionalVinculacion: (id: number) => Promise<any>;

  // RecetaIngredienteIntercambiable methods
  getRecetaIngredientesIntercambiables: (recetaIngredienteId: number) => Promise<RecetaIngredienteIntercambiable[]>;
  createRecetaIngredienteIntercambiable: (data: Partial<RecetaIngredienteIntercambiable>) => Promise<RecetaIngredienteIntercambiable>;
  updateRecetaIngredienteIntercambiable: (id: number, data: Partial<RecetaIngredienteIntercambiable>) => Promise<any>;
  deleteRecetaIngredienteIntercambiable: (id: number) => Promise<any>;

  // --- Productos Repository Methods ---

  // Familia methods
  getFamilias: () => Promise<Familia[]>;
  getFamilia: (familiaId: number) => Promise<Familia>;
  createFamilia: (familiaData: any) => Promise<Familia>;
  updateFamilia: (familiaId: number, familiaData: any) => Promise<any>;
  deleteFamilia: (familiaId: number) => Promise<any>;
  // Subfamilia methods
  getSubfamilias: () => Promise<Subfamilia[]>;
  getSubfamiliasByFamilia: (familiaId: number) => Promise<Subfamilia[]>;
  getSubfamilia: (subfamiliaId: number) => Promise<Subfamilia>;
  createSubfamilia: (subfamiliaData: any) => Promise<Subfamilia>;
  updateSubfamilia: (subfamiliaId: number, subfamiliaData: any) => Promise<any>;
  deleteSubfamilia: (subfamiliaId: number) => Promise<any>;
  // Producto methods
  getProductos: () => Promise<Producto[]>;
  getProductosWithFilters: (filters: {
    search?: string;
    tipo?: string;
    activo?: string;
    esVendible?: string;
    esComprable?: string;
    controlaStock?: string;
    esIngrediente?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<{items: Producto[], total: number}>;
  getProducto: (productoId: number) => Promise<Producto>;
  createProducto: (productoData: any) => Promise<Producto>;
  updateProducto: (productoId: number, productoData: any) => Promise<any>;
  deleteProducto: (productoId: number) => Promise<any>;
  // Presentacion methods
  getPresentaciones: () => Promise<Presentacion[]>;
  getPresentacionesByProducto: (productoId: number, page?: number, pageSize?: number, filtroActivo?: string) => Promise<any>;
  getPresentacion: (presentacionId: number) => Promise<any>;
  createPresentacion: (presentacionData: any) => Promise<Presentacion>;
  updatePresentacion: (presentacionId: number, presentacionData: any) => Promise<any>;
  deletePresentacion: (presentacionId: number) => Promise<any>;
  setPresentacionPrincipal: (presentacionId: number) => Promise<any>;
  togglePresentacionActivo: (presentacionId: number) => Promise<any>;
  // CodigoBarra methods
  createCodigoBarra: (codigoBarraData: any) => Promise<CodigoBarra>;
  updateCodigoBarra: (codigoBarraId: number, codigoBarraData: any) => Promise<any>;
  deleteCodigoBarra: (codigoBarraId: number) => Promise<any>;
  getCodigosBarraByPresentacion: (presentacionId: number) => Promise<CodigoBarra[]>;
  searchProductosByCodigo: (codigo: string) => Promise<any>;
  // PrecioVenta methods
  getPreciosVenta: () => Promise<PrecioVenta[]>;
  getPreciosVentaByPresentacion: (presentacionId: number, activo: boolean | null) => Promise<PrecioVenta[]>;
  getPreciosVentaByReceta: (recetaId: number, activo: boolean | null) => Promise<PrecioVenta[]>;
  getPreciosVentaByProducto: (productoId: number, activo: boolean | null) => Promise<PrecioVenta[]>;
  createPrecioVenta: (precioVentaData: any) => Promise<PrecioVenta>;
  updatePrecioVenta: (precioVentaId: number, precioVentaData: any) => Promise<any>;
  deletePrecioVenta: (precioVentaId: number) => Promise<any>;
  // PrecioCosto methods
  getPreciosCosto: () => Promise<PrecioCosto[]>;
  getPreciosCostoByProducto: (productoId: number) => Promise<PrecioCosto[]>;
  createPrecioCosto: (precioCostoData: any) => Promise<PrecioCosto>;
  updatePrecioCosto: (precioCostoId: number, precioCostoData: any) => Promise<any>;
  deletePrecioCosto: (precioCostoId: number) => Promise<any>;
  // Receta methods
  getRecetas: () => Promise<Receta[]>;
  getRecetasWithFilters: (filters: {
    search?: string;
    activo?: boolean | null;
    page?: number;
    pageSize?: number;
  }) => Promise<{items: Receta[], total: number, page: number, pageSize: number}>;
  checkRecetaDependencies: (recetaId: number) => Promise<{
    receta: { id: number; nombre: string };
    productosVinculados: Array<{ id: number; nombre: string; tipo: string; activo: boolean }>;
  }>;
  getReceta: (recetaId: number) => Promise<Receta>;
  createReceta: (recetaData: any) => Promise<Receta>;
  updateReceta: (recetaId: number, recetaData: any) => Promise<any>;
  deleteReceta: (recetaId: number) => Promise<any>;
  // Receta additional methods
  getRecetasByEstado: (activo: boolean | null) => Promise<Receta[]>;
  searchRecetasByNombre: (nombre: string) => Promise<Receta[]>;
  getRecetasWithIngredientes: () => Promise<Receta[]>;
  calcularCostoReceta: (recetaId: number) => Promise<number>;
  actualizarCostoReceta: (recetaId: number) => Promise<any>;

  // ✅ NUEVOS MÉTODOS PARA ARQUITECTURA CON VARIACIONES
  // Sabor methods
  getSaboresByProducto: (productoId: number) => Promise<any[]>;
  createSabor: (saborData: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    productoId: number;
  }) => Promise<{ sabor: any; receta: any; mensaje: string }>;
  updateSabor: (saborId: number, saborData: Partial<any>) => Promise<any>;
  deleteSabor: (saborId: number) => Promise<{ success: boolean; mensaje: string }>;
  getSaboresEstadisticas: (productoId: number) => Promise<{
    totalSabores: number;
    saboresActivos: number;
    totalRecetas: number;
    totalVariaciones: number;
  }>;

  // RecetaPresentacion methods
  getVariacionesByProducto: (productoId: number) => Promise<any[]>;
  getVariacionesByProductoAndPresentacion: (productoId: number, presentacionId: number) => Promise<any[]>;
  getVariacionesByReceta: (recetaId: number) => Promise<any[]>;
  createRecetaPresentacion: (variacionData: {
    recetaId: number;
    presentacionId: number;
    saborId: number;
    nombre_generado?: string;
    sku?: string;
    precio_ajuste?: number;
  }) => Promise<any>;
  updateRecetaPresentacion: (variacionId: number, variacionData: Partial<any>) => Promise<any>;
  deleteRecetaPresentacion: (variacionId: number) => Promise<{ success: boolean; mensaje: string }>;
  bulkUpdateVariaciones: (updates: Array<{
    variacionId: number;
    precio_ajuste?: number;
    activo?: boolean;
  }>) => Promise<{ success: boolean; actualizadas: number }>;
  recalcularCostoVariacion: (variacionId: number) => Promise<{
    success: boolean;
    costoAnterior: number;
    costoNuevo: number;
    mensaje: string;
  }>;
  generateVariacionesFaltantes: (productoId: number) => Promise<{
    success: boolean;
    variacionesGeneradas: number;
    variaciones: any[];
  }>;
  // RecetaIngrediente methods
  getRecetaIngredientes: (recetaId: number) => Promise<RecetaIngrediente[]>;
  createRecetaIngrediente: (recetaIngredienteData: any) => Promise<RecetaIngrediente>;
  updateRecetaIngrediente: (recetaIngredienteId: number, recetaIngredienteData: any) => Promise<any>;
  deleteRecetaIngrediente: (recetaIngredienteId: number) => Promise<any>;
  deleteRecetaIngredienteMultiplesVariaciones: (data: {
    recetaIngredienteId: number;
    eliminarDeOtrasVariaciones: boolean;
  }) => Promise<any>;
  // RecetaIngrediente additional methods
  getRecetaIngredientesActivos: (recetaId: number) => Promise<RecetaIngrediente[]>;
  calcularCostoIngrediente: (recetaIngredienteId: number) => Promise<number>;
  validarStockIngrediente: (recetaIngredienteId: number) => Promise<boolean>;
  // Stock Movimiento methods
  getStockMovimientos: () => Promise<StockMovimiento[]>;
  getStockMovimientosByProducto: (productoId: number) => Promise<StockMovimiento[]>;
  createStockMovimiento: (stockMovimientoData: any) => Promise<StockMovimiento>;
  updateStockMovimiento: (stockMovimientoId: number, stockMovimientoData: any) => Promise<any>;
  deleteStockMovimiento: (stockMovimientoId: number) => Promise<any>;
  procesarStockVenta: (ventaId: number) => Promise<any>;
  revertirStockVenta: (ventaId: number) => Promise<any>;
  // Additional helper methods
  searchProductosByNombre: (nombre: string) => Promise<Producto[]>;
  getProductosByTipo: (tipo: string) => Promise<Producto[]>;
  getProductosWithStock: () => Promise<Producto[]>;
  // Conversion Moneda methods
  getConversionesMoneda: () => Promise<ConversionMoneda[]>;
  createConversionMoneda: (conversionData: any) => Promise<ConversionMoneda>;
  updateConversionMoneda: (conversionId: number, conversionData: any) => Promise<any>;
  deleteConversionMoneda: (conversionId: number) => Promise<any>;
  // Configuracion Monetaria methods
  getConfiguracionMonetaria: () => Promise<ConfiguracionMonetaria>;
  createConfiguracionMonetaria: (configData: any) => Promise<ConfiguracionMonetaria>;
  updateConfiguracionMonetaria: (configId: number, configData: any) => Promise<any>;
  // ✅ NUEVO: Métodos para gestión de costos de recetas
  recalculateRecipeCost: (recetaId: number) => Promise<{ success: boolean; costoCalculado: number }>;
  recalculateAllRecipeCosts: () => Promise<any[]>;
  getPreciosCostoReceta: (recetaId: number) => Promise<PrecioCosto[]>;
  // Sabor methods
  getSabores: () => Promise<string[]>;
  createOrUpdateSabor: (saborData: any) => Promise<{ success: boolean, message: string }>;
  getSaborDetails: (categoria: string) => Promise<any>;

  // ✅ NUEVO: Endpoint para el asistente de ingredientes
  getRecetasIdsPorVariacionIds: (variacionIds: number[]) => Promise<{ [variacionId: number]: number }>;

  // PdvAtajoGrupo
  getPdvAtajoGrupos: () => Promise<any[]>;
  getPdvAtajoGrupo: (id: number) => Promise<any>;
  createPdvAtajoGrupo: (data: any) => Promise<any>;
  updatePdvAtajoGrupo: (id: number, data: any) => Promise<any>;
  deletePdvAtajoGrupo: (id: number) => Promise<any>;
  reorderPdvAtajoGrupos: (orderedIds: number[]) => Promise<any>;
  // PdvAtajoItem
  getPdvAtajoItems: () => Promise<any[]>;
  getPdvAtajoItem: (id: number) => Promise<any>;
  getPdvAtajoItemsByGrupo: (grupoId: number) => Promise<any[]>;
  createPdvAtajoItem: (data: any) => Promise<any>;
  updatePdvAtajoItem: (id: number, data: any) => Promise<any>;
  deletePdvAtajoItem: (id: number) => Promise<any>;
  // PdvAtajoGrupoItem (join)
  assignAtajoItemToGrupo: (grupoId: number, itemId: number, posicion: number) => Promise<any>;
  removeAtajoItemFromGrupo: (grupoId: number, itemId: number) => Promise<any>;
  reorderAtajoItemsInGrupo: (grupoId: number, orderedItemIds: number[]) => Promise<any>;
  // PdvAtajoItemProducto (join)
  getPdvAtajoItemProductos: (atajoItemId: number) => Promise<any[]>;
  assignProductoToAtajoItem: (atajoItemId: number, productoId: number, data?: any) => Promise<any>;
  removeProductoFromAtajoItem: (id: number) => Promise<any>;
  reorderProductosInAtajoItem: (atajoItemId: number, orderedIds: number[]) => Promise<any>;

  // Caja Mayor
  getCajasMayor: () => Promise<any[]>;
  getCajaMayor: (id: number) => Promise<any>;
  createCajaMayor: (data: any) => Promise<any>;
  updateCajaMayor: (id: number, data: any) => Promise<any>;
  cerrarCajaMayor: (id: number) => Promise<any>;
  getCajaMayorSaldos: (cajaMayorId: number) => Promise<any[]>;
  recalcularSaldos: (cajaMayorId: number) => Promise<any>;
  getCajaMayorMovimientos: (cajaMayorId: number, filtros?: any) => Promise<any>;
  createCajaMayorMovimiento: (data: any) => Promise<any>;
  anularCajaMayorMovimiento: (id: number, motivo: string) => Promise<any>;
  getGastoCategorias: () => Promise<any[]>;
  getGastoCategoria: (id: number) => Promise<any>;
  createGastoCategoria: (data: any) => Promise<any>;
  updateGastoCategoria: (id: number, data: any) => Promise<any>;
  deleteGastoCategoria: (id: number) => Promise<any>;
  getGastos: (filtros?: any) => Promise<any[]>;
  getGasto: (id: number) => Promise<any>;
  createGasto: (data: any) => Promise<any>;
  anularGasto: (id: number, motivo: string) => Promise<any>;
  editGasto: (gastoId: number, data: any) => Promise<any>;
  editCajaMayorMovimiento: (movId: number, data: any) => Promise<any>;
  getGastosProgramados: () => Promise<any[]>;
  getRetirosCaja: (filtros?: any) => Promise<any[]>;
  getRetiroCaja: (id: number) => Promise<any>;
  createRetiroCaja: (data: any) => Promise<any>;
  ingresarRetiroCaja: (retiroId: number, cajaMayorId: number) => Promise<any>;

  // Banking - CuentasBancarias
  getCuentasBancarias: () => Promise<any[]>;
  getCuentaBancaria: (id: number) => Promise<any>;
  createCuentaBancaria: (data: any) => Promise<any>;
  updateCuentaBancaria: (id: number, data: any) => Promise<any>;
  deleteCuentaBancaria: (id: number) => Promise<any>;

  // Banking - MaquinasPos
  getMaquinasPos: () => Promise<any[]>;
  getMaquinaPos: (id: number) => Promise<any>;
  createMaquinaPos: (data: any) => Promise<any>;
  updateMaquinaPos: (id: number, data: any) => Promise<any>;
  deleteMaquinaPos: (id: number) => Promise<any>;

  // Banking - AcreditacionesPos
  getAcreditacionesPos: (filtros?: any) => Promise<any>;
  getAcreditacionPos: (id: number) => Promise<any>;
  createAcreditacionPos: (data: any) => Promise<any>;
  procesarAcreditacionesAuto: () => Promise<any>;
  verificarAcreditacionPos: (id: number, montoAcreditado: number) => Promise<any>;
  getAcreditacionesPendientes: () => Promise<any[]>;
  acreditarTransferenciaBancaria: (payload: any) => Promise<any>;

  // Compra Categorias (Fase 3)
  getCompraCategorias: () => Promise<any[]>;
  createCompraCategoria: (data: any) => Promise<any>;
  updateCompraCategoria: (id: number, data: any) => Promise<any>;
  deleteCompraCategoria: (id: number) => Promise<any>;

  // Compra Cuotas
  getCompraCuotas: (compraId: number) => Promise<any[]>;
  setCompraCuotas: (compraId: number, cuotas: any[]) => Promise<any[]>;
  pagarCompraCuota: (payload: any) => Promise<any>;

  // Cuentas Por Pagar
  getCuentasPorPagar: (filtros?: any) => Promise<any>;
  getCuentaPorPagar: (id: number) => Promise<any>;
  createCuentaPorPagar: (data: any) => Promise<any>;
  updateCuentaPorPagar: (id: number, data: any) => Promise<any>;
  cancelarCuentaPorPagar: (id: number) => Promise<any>;
  getCuentaPorPagarCuotas: (cppId: number) => Promise<any[]>;
  pagarCppCuota: (payload: any) => Promise<any>;

  // Dashboard Shortcuts
  getDashboardShortcuts: (dashboardKey?: string) => Promise<any[]>;
  createDashboardShortcut: (data: any) => Promise<any>;
  updateDashboardShortcut: (id: number, data: any) => Promise<any>;
  deleteDashboardShortcut: (id: number) => Promise<any>;

  // Fase 4: Entradas Varias
  getEntradaVariaCategorias: () => Promise<any[]>;
  getEntradaVariaCategoria: (id: number) => Promise<any>;
  createEntradaVariaCategoria: (data: any) => Promise<any>;
  updateEntradaVariaCategoria: (id: number, data: any) => Promise<any>;
  deleteEntradaVariaCategoria: (id: number) => Promise<any>;
  getEntradasVarias: (filtros?: any) => Promise<any>;
  getEntradaVaria: (id: number) => Promise<any>;
  createEntradaVaria: (data: any) => Promise<any>;
  anularEntradaVaria: (id: number, motivo: string) => Promise<any>;

  // Fase 4: Operaciones Financieras
  getOperacionFinancieraCategorias: () => Promise<any[]>;
  getOperacionFinancieraCategoria: (id: number) => Promise<any>;
  createOperacionFinancieraCategoria: (data: any) => Promise<any>;
  updateOperacionFinancieraCategoria: (id: number, data: any) => Promise<any>;
  deleteOperacionFinancieraCategoria: (id: number) => Promise<any>;
  getOperacionesFinancieras: (filtros?: any) => Promise<any>;
  getOperacionFinanciera: (id: number) => Promise<any>;
  createOperacionFinanciera: (data: any) => Promise<any>;
  anularOperacionFinanciera: (id: number, motivo: string) => Promise<any>;

  // Movimientos bancarios (historico unificado + manuales)
  getMovimientosCuentaBancaria: (cuentaBancariaId: number, filtros?: any) => Promise<any>;
  createMovimientoBancario: (data: any) => Promise<any>;

  // Fase 4: Chequeras + Cheques
  getChequeras: () => Promise<any[]>;
  getChequera: (id: number) => Promise<any>;
  createChequera: (data: any) => Promise<any>;
  updateChequera: (id: number, data: any) => Promise<any>;
  deleteChequera: (id: number) => Promise<any>;
  getCheques: (filtros?: any) => Promise<any>;
  getCheque: (id: number) => Promise<any>;
  emitirCheque: (data: any) => Promise<any>;
  cobrarCheque: (id: number, data?: any) => Promise<any>;
  anularCheque: (id: number, motivo: string) => Promise<any>;

  // RRHH - Permisos
  getPermissions: (modulo?: string) => Promise<any[]>;
  getAllPermissions: () => Promise<any[]>;
  createPermission: (data: any) => Promise<any>;
  updatePermission: (id: number, data: any) => Promise<any>;
  deletePermission: (id: number) => Promise<any>;
  getRolePermissions: (roleId: number) => Promise<any[]>;
  setRolePermissions: (roleId: number, permissionIds: number[]) => Promise<any>;
  getPermissionsByUser: (userId: number) => Promise<any[]>;
  seedPermissions: () => Promise<any>;

  // RRHH - Configuracion
  getConfiguracionesRrhh: () => Promise<any[]>;
  getConfiguracionRrhh: (clave: string) => Promise<any>;
  createConfiguracionRrhh: (data: any) => Promise<any>;
  updateConfiguracionRrhh: (id: number, data: any) => Promise<any>;
  deleteConfiguracionRrhh: (id: number) => Promise<any>;
  seedConfiguracionRrhh: () => Promise<any>;

  // RRHH - Cargos
  getCargos: () => Promise<any[]>;
  getCargo: (id: number) => Promise<any>;
  createCargo: (data: any) => Promise<any>;
  updateCargo: (id: number, data: any) => Promise<any>;
  deleteCargo: (id: number) => Promise<any>;

  // RRHH - Funcionarios
  getFuncionarios: (filtros?: any) => Promise<any[]>;
  getFuncionario: (id: number) => Promise<any>;
  createFuncionario: (data: any) => Promise<any>;
  updateFuncionario: (id: number, data: any) => Promise<any>;
  cambiarCargoFuncionario: (id: number, data: any) => Promise<any>;
  cambiarSalarioFuncionario: (id: number, data: any) => Promise<any>;
  egresarFuncionario: (id: number, data: any) => Promise<any>;
  getHistoricoCargos: (funcionarioId: number) => Promise<any[]>;
  getHistoricoSalarios: (funcionarioId: number) => Promise<any[]>;

  // RRHH - Documentos
  getFuncionarioDocumentos: (funcionarioId: number) => Promise<any[]>;
  uploadFuncionarioDocumento: (payload: any) => Promise<any>;
  deleteFuncionarioDocumento: (id: number) => Promise<any>;
  getFuncionarioDocumentoBase64: (id: number) => Promise<any>;
  updateFuncionarioDocumento: (id: number, data: any) => Promise<any>;

  // RRHH - Turnos
  getTurnos: () => Promise<any[]>;
  getTurno: (id: number) => Promise<any>;
  createTurno: (data: any) => Promise<any>;
  updateTurno: (id: number, data: any) => Promise<any>;
  deleteTurno: (id: number) => Promise<any>;
  asignarTurnoFuncionario: (data: any) => Promise<any>;
  getFuncionarioTurnos: (funcionarioId: number) => Promise<any[]>;

  // RRHH - Asistencias
  getAsistencias: (filtros?: any) => Promise<any[]>;
  getAsistencia: (id: number) => Promise<any>;
  createAsistencia: (data: any) => Promise<any>;
  updateAsistencia: (id: number, data: any) => Promise<any>;
  justificarAsistencia: (id: number, data: any) => Promise<any>;
  marcarAsistenciaMasiva: (payload: any) => Promise<any>;

  // RRHH - Penalizaciones
  getPenalizaciones: (filtros?: any) => Promise<any[]>;
  createPenalizacion: (data: any) => Promise<any>;
  anularPenalizacion: (id: number) => Promise<any>;

  // RRHH - Feriados
  getFeriados: (anio?: number) => Promise<any[]>;
  createFeriado: (data: any) => Promise<any>;
  updateFeriado: (id: number, data: any) => Promise<any>;
  deleteFeriado: (id: number) => Promise<any>;

  // RRHH - Horas extra
  getHorasExtra: (filtros?: any) => Promise<any[]>;
  createHoraExtra: (data: any) => Promise<any>;
  anularHoraExtra: (id: number) => Promise<any>;

  // RRHH - Vales + Motivos
  getMotivosVale: () => Promise<any[]>;
  createMotivoVale: (data: any) => Promise<any>;
  updateMotivoVale: (id: number, data: any) => Promise<any>;
  deleteMotivoVale: (id: number) => Promise<any>;
  getVales: (filtros?: any) => Promise<any[]>;
  getValesPendientesDescuento: (funcionarioId: number) => Promise<any[]>;
  createVale: (data: any) => Promise<any>;
  confirmarVale: (id: number, payload: any) => Promise<any>;
  anularVale: (id: number, motivo: string) => Promise<any>;
  marcarValeDescontado: (id: number, liquidacionId: number) => Promise<any>;

  // RRHH - Liquidacion conceptos
  getLiquidacionConceptos: () => Promise<any[]>;
  seedLiquidacionConceptos: () => Promise<any>;
  updateLiquidacionConcepto: (id: number, data: any) => Promise<any>;

  // RRHH - Liquidaciones de sueldo
  getLiquidacionesSueldo: (filtros?: any) => Promise<any[]>;
  getLiquidacionSueldo: (id: number) => Promise<any>;
  generarLiquidacionBorrador: (payload: any) => Promise<any>;
  agregarItemLiquidacion: (liquidacionId: number, data: any) => Promise<any>;
  eliminarItemLiquidacion: (itemId: number) => Promise<any>;
  aprobarLiquidacionSueldo: (id: number) => Promise<any>;
  volverBorradorLiquidacionSueldo: (id: number) => Promise<any>;
  pagarLiquidacionSueldo: (id: number, payload: any) => Promise<any>;
  anularLiquidacionSueldo: (id: number, motivo: string) => Promise<any>;

  // RRHH - Bonos
  getBonos: (filtros?: any) => Promise<any[]>;
  createBono: (data: any) => Promise<any>;
  anularBono: (id: number) => Promise<any>;

  // RRHH - Aguinaldos
  getAguinaldos: (filtros?: any) => Promise<any[]>;
  calcularAguinaldosAnio: (anio: number) => Promise<any>;
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

  validateCredentials(data: { nickname: string, password: string }): Observable<any> {
    return from(this.api.validateCredentials(data));
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

  getMonedaBillete(monedaBilleteId: number): Observable<MonedaBillete> {
    return from(this.api.getMonedaBillete(monedaBilleteId));
  }

  createMonedaBillete(monedaBilleteData: Partial<MonedaBillete>): Observable<MonedaBillete> {
    return from(this.api.createMonedaBillete(monedaBilleteData));
  }

  updateMonedaBillete(monedaBilleteId: number, monedaBilleteData: Partial<MonedaBillete>): Observable<any> {
    return from(this.api.updateMonedaBillete(monedaBilleteId, monedaBilleteData));
  }

  deleteMonedaBillete(monedaBilleteId: number): Observable<any> {
    return from(this.api.deleteMonedaBillete(monedaBilleteId));
  }

  // Conteo methods
  getConteos(): Observable<Conteo[]> {
    return from(this.api.getConteos());
  }

  getConteo(conteoId: number): Observable<Conteo> {
    return from(this.api.getConteo(conteoId));
  }

  createConteo(conteoData: Partial<Conteo>): Observable<Conteo> {
    return from(this.api.createConteo(conteoData));
  }

  updateConteo(conteoId: number, conteoData: Partial<Conteo>): Observable<any> {
    return from(this.api.updateConteo(conteoId, conteoData));
  }

  deleteConteo(conteoId: number): Observable<any> {
    return from(this.api.deleteConteo(conteoId));
  }

  // ConteoDetalle methods
  getConteoDetalles(conteoId: number): Observable<ConteoDetalle[]> {
    return from(this.api.getConteoDetalles(conteoId));
  }

  getConteoDetalle(conteoDetalleId: number): Observable<ConteoDetalle> {
    return from(this.api.getConteoDetalle(conteoDetalleId));
  }

  createConteoDetalle(conteoDetalleData: Partial<ConteoDetalle>): Observable<ConteoDetalle> {
    return from(this.api.createConteoDetalle(conteoDetalleData));
  }

  updateConteoDetalle(conteoDetalleId: number, conteoDetalleData: Partial<ConteoDetalle>): Observable<any> {
    return from(this.api.updateConteoDetalle(conteoDetalleId, conteoDetalleData));
  }

  deleteConteoDetalle(conteoDetalleId: number): Observable<any> {
    return from(this.api.deleteConteoDetalle(conteoDetalleId));
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

  updateDispositivo(dispositivoId: number, dispositivoData: Partial<Dispositivo>): Observable<any> {
    return from(this.api.updateDispositivo(dispositivoId, dispositivoData));
  }

  deleteDispositivo(dispositivoId: number): Observable<any> {
    return from(this.api.deleteDispositivo(dispositivoId));
  }

  // Caja methods
  getCajas(): Observable<Caja[]> {
    return from(this.api.getCajas());
  }

  getCajaAbiertaByUsuario(usuarioId: number): Observable<Caja> {
    return from(this.api.getCajaAbiertaByUsuario(usuarioId));
  }

  getCaja(cajaId: number): Observable<Caja> {
    return from(this.api.getCaja(cajaId));
  }

  createCaja(cajaData: Partial<Caja>): Observable<Caja> {
    return from(this.api.createCaja(cajaData));
  }

  updateCaja(cajaId: number, cajaData: Partial<Caja>): Observable<any> {
    return from(this.api.updateCaja(cajaId, cajaData));
  }

  deleteCaja(cajaId: number): Observable<any> {
    return from(this.api.deleteCaja(cajaId));
  }

  getCajaByDispositivo(dispositivoId: number): Observable<Caja[]> {
    return from(this.api.getCajaByDispositivo(dispositivoId));
  }

  // CajaMoneda methods
  getCajasMonedas(): Observable<CajaMoneda[]> {
    return from(this.api.getCajasMonedas());
  }

  getCajaMoneda(cajaMonedaId: number): Observable<CajaMoneda> {
    return from(this.api.getCajaMoneda(cajaMonedaId));
  }

  createCajaMoneda(cajaMonedaData: Partial<CajaMoneda>): Observable<CajaMoneda> {
    return from(this.api.createCajaMoneda(cajaMonedaData));
  }

  updateCajaMoneda(cajaMonedaId: number, cajaMonedaData: Partial<CajaMoneda>): Observable<any> {
    return from(this.api.updateCajaMoneda(cajaMonedaId, cajaMonedaData));
  }

  deleteCajaMoneda(cajaMonedaId: number): Observable<any> {
    return from(this.api.deleteCajaMoneda(cajaMonedaId));
  }

  saveCajasMonedas(updates: any[]): Observable<any> {
    return from(this.api.saveCajasMonedas(updates));
  }

  // MonedaCambio methods
  getMonedasCambio(): Observable<MonedaCambio[]> {
    return from(this.api.getMonedasCambio());
  }

  getMonedasCambioByMonedaOrigen(monedaOrigenId: number): Observable<MonedaCambio[]> {
    return from(this.api.getMonedasCambioByMonedaOrigen(monedaOrigenId));
  }

  getMonedaCambio(monedaCambioId: number): Observable<MonedaCambio> {
    return from(this.api.getMonedaCambio(monedaCambioId));
  }

  getValorEnMonedaPrincipal(monedaId: number, valor: number): Observable<number> {
    return from(this.api.getValorEnMonedaPrincipal(monedaId, valor));
  }

  createMonedaCambio(monedaCambioData: Partial<MonedaCambio>): Observable<MonedaCambio> {
    return from(this.api.createMonedaCambio(monedaCambioData));
  }

  updateMonedaCambio(monedaCambioId: number, monedaCambioData: Partial<MonedaCambio>): Observable<any> {
    return from(this.api.updateMonedaCambio(monedaCambioId, monedaCambioData));
  }

  deleteMonedaCambio(monedaCambioId: number): Observable<any> {
    return from(this.api.deleteMonedaCambio(monedaCambioId));
  }

  getMonedaCambioByMonedaPrincipal(): Observable<MonedaCambio> {
    return from(this.api.getMonedaCambioByMonedaPrincipal());
  }

  // Proveedor methods
  getProveedores(): Observable<Proveedor[]> {
    return from(this.api.getProveedores());
  }

  getProveedor(proveedorId: number): Observable<Proveedor> {
    return from(this.api.getProveedor(proveedorId));
  }

  createProveedor(proveedorData: Partial<Proveedor>): Observable<Proveedor> {
    return from(this.api.createProveedor(proveedorData));
  }

  updateProveedor(proveedorId: number, proveedorData: Partial<Proveedor>): Observable<any> {
    return from(this.api.updateProveedor(proveedorId, proveedorData));
  }

  deleteProveedor(proveedorId: number): Observable<any> {
    return from(this.api.deleteProveedor(proveedorId));
  }

  // New method to search providers by text
  searchProveedoresByText(searchText: string): Observable<Proveedor[]> {
    // Since we don't have a dedicated API endpoint, we'll use the getProveedores method
    // and filter the results on the client side
    return this.getProveedores().pipe(
      map(proveedores => {
        const query = searchText.toLowerCase();
        return proveedores.filter(p =>
          p.nombre.toLowerCase().includes(query) ||
          (p.ruc && p.ruc.toLowerCase().includes(query))
        ).slice(0, 10); // Limit to 10 results
      })
    );
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

  updateCompra(compraId: number, compraData: Partial<Compra>): Observable<any> {
    return from(this.api.updateCompra(compraId, compraData));
  }

  deleteCompra(compraId: number): Observable<any> {
    return from(this.api.deleteCompra(compraId));
  }

  // CompraDetalle methods
  getCompraDetalles(compraId: number): Observable<CompraDetalle[]> {
    return from(this.api.getCompraDetalles(compraId));
  }

  getCompraDetalle(compraDetalleId: number): Observable<CompraDetalle> {
    return from(this.api.getCompraDetalle(compraDetalleId));
  }

  createCompraDetalle(compraDetalleData: Partial<CompraDetalle>): Observable<CompraDetalle> {
    return from(this.api.createCompraDetalle(compraDetalleData));
  }

  updateCompraDetalle(compraDetalleId: number, compraDetalleData: Partial<CompraDetalle>): Observable<any> {
    return from(this.api.updateCompraDetalle(compraDetalleId, compraDetalleData));
  }

  deleteCompraDetalle(compraDetalleId: number): Observable<any> {
    return from(this.api.deleteCompraDetalle(compraDetalleId));
  }

  // Pago methods
  getPagos(): Observable<Pago[]> {
    return from(this.api.getPagos());
  }

  getPago(pagoId: number): Observable<Pago> {
    return from(this.api.getPago(pagoId));
  }

  getPagosByCompra(compraId: number): Observable<Pago[]> {
    return from(this.api.getPagosByCompra(compraId));
  }

  createPago(pagoData: Partial<Pago>): Observable<Pago> {
    return from(this.api.createPago(pagoData));
  }

  updatePago(pagoId: number, pagoData: Partial<Pago>): Observable<any> {
    return from(this.api.updatePago(pagoId, pagoData));
  }

  deletePago(pagoId: number): Observable<any> {
    return from(this.api.deletePago(pagoId));
  }

  // PagoDetalle methods
  getPagoDetalles(pagoId: number): Observable<PagoDetalle[]> {
    return from(this.api.getPagoDetalles(pagoId));
  }

  getPagoDetalle(pagoDetalleId: number): Observable<PagoDetalle> {
    return from(this.api.getPagoDetalle(pagoDetalleId));
  }

  createPagoDetalle(pagoDetalleData: Partial<PagoDetalle>): Observable<PagoDetalle> {
    return from(this.api.createPagoDetalle(pagoDetalleData));
  }

  updatePagoDetalle(pagoDetalleId: number, pagoDetalleData: Partial<PagoDetalle>): Observable<any> {
    return from(this.api.updatePagoDetalle(pagoDetalleId, pagoDetalleData));
  }

  deletePagoDetalle(pagoDetalleId: number): Observable<any> {
    return from(this.api.deletePagoDetalle(pagoDetalleId));
  }

  // ProveedorProducto methods
  getProveedorProductos(): Observable<ProveedorProducto[]> {
    return from(this.api.getProveedorProductos());
  }

  getProveedorProductosByProveedor(proveedorId: number): Observable<ProveedorProducto[]> {
    return from(this.api.getProveedorProductosByProveedor(proveedorId));
  }

  getProveedorProducto(proveedorProductoId: number): Observable<ProveedorProducto> {
    return from(this.api.getProveedorProducto(proveedorProductoId));
  }

  createProveedorProducto(proveedorProductoData: Partial<ProveedorProducto>): Observable<ProveedorProducto> {
    return from(this.api.createProveedorProducto(proveedorProductoData));
  }

  updateProveedorProducto(proveedorProductoId: number, proveedorProductoData: Partial<ProveedorProducto>): Observable<any> {
    return from(this.api.updateProveedorProducto(proveedorProductoId, proveedorProductoData));
  }

  deleteProveedorProducto(proveedorProductoId: number): Observable<any> {
    return from(this.api.deleteProveedorProducto(proveedorProductoId));
  }

  // FormasPago methods
  getFormasPago(): Observable<FormasPago[]> {
    return from(this.api.getFormasPago());
  }

  getFormaPago(formaPagoId: number): Observable<FormasPago> {
    return from(this.api.getFormaPago(formaPagoId));
  }

  createFormaPago(formaPagoData: Partial<FormasPago>): Observable<FormasPago> {
    return from(this.api.createFormaPago(formaPagoData));
  }

  updateFormaPago(formaPagoId: number, formaPagoData: Partial<FormasPago>): Observable<any> {
    return from(this.api.updateFormaPago(formaPagoId, formaPagoData));
  }

  deleteFormaPago(formaPagoId: number): Observable<any> {
    return from(this.api.deleteFormaPago(formaPagoId));
  }

  // Method to update the order of multiple FormasPago entries at once
  updateFormasPagoOrder(updates: { id: number, orden: number }[]): Observable<any> {
    // This is a temporary solution - ideally create a batch update endpoint in the API
    // For now, we'll chain all the update operations using Promise.all
    const updatePromises = updates.map(update =>
      this.api.updateFormaPago(update.id, { orden: update.orden })
    );

    return from(Promise.all(updatePromises));
  }

  // PrecioDelivery methods
  getPreciosDelivery(): Observable<PrecioDelivery[]> {
    return from(this.api.getPreciosDelivery());
  }

  getPrecioDelivery(precioDeliveryId: number): Observable<PrecioDelivery> {
    return from(this.api.getPrecioDelivery(precioDeliveryId));
  }

  createPrecioDelivery(precioDeliveryData: Partial<PrecioDelivery>): Observable<PrecioDelivery> {
    return from(this.api.createPrecioDelivery(precioDeliveryData));
  }

  updatePrecioDelivery(precioDeliveryId: number, precioDeliveryData: Partial<PrecioDelivery>): Observable<any> {
    return from(this.api.updatePrecioDelivery(precioDeliveryId, precioDeliveryData));
  }

  deletePrecioDelivery(precioDeliveryId: number): Observable<any> {
    return from(this.api.deletePrecioDelivery(precioDeliveryId));
  }

  // Delivery methods
  getDeliveries(): Observable<Delivery[]> {
    return from(this.api.getDeliveries());
  }

  getDeliveriesByEstado(estado: DeliveryEstado): Observable<Delivery[]> {
    return from(this.api.getDeliveriesByEstado(estado));
  }

  getDelivery(deliveryId: number): Observable<Delivery> {
    return from(this.api.getDelivery(deliveryId));
  }

  createDelivery(deliveryData: Partial<Delivery>): Observable<Delivery> {
    return from(this.api.createDelivery(deliveryData));
  }

  updateDelivery(deliveryId: number, deliveryData: Partial<Delivery>): Observable<any> {
    return from(this.api.updateDelivery(deliveryId, deliveryData));
  }

  deleteDelivery(deliveryId: number): Observable<any> {
    return from(this.api.deleteDelivery(deliveryId));
  }

  getDeliveriesByCaja(cajaId: number, filtros?: any): Observable<{ data: any[], total: number }> {
    return from(this.api.getDeliveriesByCaja(cajaId, filtros));
  }

  buscarClientePorTelefono(telefono: string): Observable<any> {
    return from(this.api.buscarClientePorTelefono(telefono));
  }

  buscarClientesPorTelefono(telefono: string): Observable<any[]> {
    return from(this.api.buscarClientesPorTelefono(telefono));
  }

  crearClienteRapido(data: { telefono: string; nombre?: string; direccion?: string }): Observable<any> {
    return from(this.api.crearClienteRapido(data));
  }

  cerrarVentasAbiertasMesa(mesaId: number, estado: string): Observable<number> {
    return from(this.api.cerrarVentasAbiertasMesa(mesaId, estado));
  }

  // Venta methods
  getVentas(): Observable<Venta[]> {
    return from(this.api.getVentas());
  }

  getVentasByDateRange(desde: string, hasta: string, filtros?: any): Observable<{ data: Venta[], total: number }> {
    return from(this.api.getVentasByDateRange(desde, hasta, filtros));
  }

  getVentasByEstado(estado: VentaEstado): Observable<Venta[]> {
    return from(this.api.getVentasByEstado(estado));
  }

  getVentasByCaja(cajaId: number): Observable<Venta[]> {
    return from(this.api.getVentasByCaja(cajaId));
  }

  getResumenCaja(cajaId: number): Observable<any> {
    return from(this.api.getResumenCaja(cajaId));
  }

  getVentasTotalByCaja(cajaId: number): Observable<any[]> {
    return from(this.api.getVentasTotalByCaja(cajaId));
  }

  getVenta(ventaId: number): Observable<Venta> {
    return from(this.api.getVenta(ventaId));
  }

  createVenta(ventaData: Partial<Venta>): Observable<Venta> {
    return from(this.api.createVenta(ventaData));
  }

  updateVenta(ventaId: number, ventaData: Partial<Venta>): Observable<any> {
    return from(this.api.updateVenta(ventaId, ventaData));
  }

  deleteVenta(ventaId: number): Observable<any> {
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

  updateVentaItem(ventaItemId: number, ventaItemData: Partial<VentaItem>): Observable<any> {
    return from(this.api.updateVentaItem(ventaItemId, ventaItemData));
  }

  deleteVentaItem(ventaItemId: number): Observable<boolean> {
    return from(this.api.deleteVentaItem(ventaItemId));
  }

  // VentaItemObservacion
  getObservacionesByVentaItem(ventaItemId: number): Observable<any[]> {
    return from(this.api.getObservacionesByVentaItem(ventaItemId));
  }

  createVentaItemObservacion(data: any): Observable<any> {
    return from(this.api.createVentaItemObservacion(data));
  }

  deleteVentaItemObservacion(id: number): Observable<boolean> {
    return from(this.api.deleteVentaItemObservacion(id));
  }

  // VentaItemAdicional
  getVentaItemAdicionales(ventaItemId: number): Observable<any[]> {
    return from(this.api.getVentaItemAdicionales(ventaItemId));
  }

  createVentaItemAdicional(data: any): Observable<any> {
    return from(this.api.createVentaItemAdicional(data));
  }

  deleteVentaItemAdicional(id: number): Observable<boolean> {
    return from(this.api.deleteVentaItemAdicional(id));
  }

  // VentaItemIngredienteModificacion
  getVentaItemIngredienteModificaciones(ventaItemId: number): Observable<any[]> {
    return from(this.api.getVentaItemIngredienteModificaciones(ventaItemId));
  }

  createVentaItemIngredienteModificacion(data: any): Observable<any> {
    return from(this.api.createVentaItemIngredienteModificacion(data));
  }

  // VentaItemSabor (multi-sabor / variaciones)
  createVentaItemSabor(data: any): Observable<any> {
    return from(this.api.createVentaItemSabor(data));
  }

  getVentaItemSabores(ventaItemId: number): Observable<any[]> {
    return from(this.api.getVentaItemSabores(ventaItemId));
  }

  deleteVentaItemSaboresByItem(ventaItemId: number): Observable<any> {
    return from(this.api.deleteVentaItemSaboresByItem(ventaItemId));
  }

  deleteVentaItemIngredienteModificacion(id: number): Observable<boolean> {
    return from(this.api.deleteVentaItemIngredienteModificacion(id));
  }

  // Comanda (tarjetas de cuenta individual)
  getComandas(): Observable<any[]> {
    return from(this.api.getComandas());
  }

  getComandasActivas(): Observable<any[]> {
    return from(this.api.getComandasActivas());
  }

  getComandasByMesa(mesaId: number): Observable<any[]> {
    return from(this.api.getComandasByMesa(mesaId));
  }

  getComanda(id: number): Observable<any> {
    return from(this.api.getComanda(id));
  }

  createComanda(data: any): Observable<any> {
    return from(this.api.createComanda(data));
  }

  updateComanda(id: number, data: any): Observable<any> {
    return from(this.api.updateComanda(id, data));
  }

  deleteComanda(id: number): Observable<boolean> {
    return from(this.api.deleteComanda(id));
  }

  getComandasDisponibles(): Observable<any[]> {
    return from(this.api.getComandasDisponibles());
  }

  getComandasOcupadas(): Observable<any[]> {
    return from(this.api.getComandasOcupadas());
  }

  getComandasBySector(sectorId: number): Observable<any[]> {
    return from(this.api.getComandasBySector(sectorId));
  }

  abrirComanda(comandaId: number, data: { mesaId?: number, sectorId?: number, observacion?: string }): Observable<any> {
    return from(this.api.abrirComanda(comandaId, data));
  }

  cerrarComanda(comandaId: number): Observable<any> {
    return from(this.api.cerrarComanda(comandaId));
  }

  createBatchComandas(batchData: any[]): Observable<any[]> {
    return from(this.api.createBatchComandas(batchData));
  }

  getComandaWithVenta(comandaId: number): Observable<any> {
    return from(this.api.getComandaWithVenta(comandaId));
  }

  // PDV Grupo Categoria
  getPdvGrupoCategorias(): Observable<PdvGrupoCategoria[]> {
    return from(this.api.getPdvGrupoCategorias());
  }

  getPdvGrupoCategoria(id: number): Observable<PdvGrupoCategoria> {
    return from(this.api.getPdvGrupoCategoria(id));
  }

  createPdvGrupoCategoria(data: Partial<PdvGrupoCategoria>): Observable<PdvGrupoCategoria> {
    return from(this.api.createPdvGrupoCategoria(data));
  }

  updatePdvGrupoCategoria(id: number, data: Partial<PdvGrupoCategoria>): Observable<PdvGrupoCategoria> {
    return from(this.api.updatePdvGrupoCategoria(id, data));
  }

  deletePdvGrupoCategoria(id: number): Observable<PdvGrupoCategoria> {
    return from(this.api.deletePdvGrupoCategoria(id));
  }

  // PDV Categoria
  getPdvCategorias(): Observable<PdvCategoria[]> {
    return from(this.api.getPdvCategorias());
  }

  getPdvCategoriasByGrupo(grupoId: number): Observable<PdvCategoria[]> {
    return from(this.api.getPdvCategoriasByGrupo(grupoId));
  }

  getPdvCategoria(id: number): Observable<PdvCategoria> {
    return from(this.api.getPdvCategoria(id));
  }

  createPdvCategoria(data: Partial<PdvCategoria>): Observable<PdvCategoria> {
    return from(this.api.createPdvCategoria(data));
  }

  updatePdvCategoria(id: number, data: Partial<PdvCategoria>): Observable<PdvCategoria> {
    return from(this.api.updatePdvCategoria(id, data));
  }

  deletePdvCategoria(id: number): Observable<PdvCategoria> {
    return from(this.api.deletePdvCategoria(id));
  }

  // PDV Categoria Item
  getPdvCategoriaItems(): Observable<PdvCategoriaItem[]> {
    return from(this.api.getPdvCategoriaItems());
  }

  getPdvCategoriaItemsByCategoria(categoriaId: number): Observable<PdvCategoriaItem[]> {
    return from(this.api.getPdvCategoriaItemsByCategoria(categoriaId));
  }

  getPdvCategoriaItem(id: number): Observable<PdvCategoriaItem> {
    return from(this.api.getPdvCategoriaItem(id));
  }

  createPdvCategoriaItem(data: Partial<PdvCategoriaItem>): Observable<PdvCategoriaItem> {
    return from(this.api.createPdvCategoriaItem(data));
  }

  updatePdvCategoriaItem(id: number, data: Partial<PdvCategoriaItem>): Observable<PdvCategoriaItem> {
    return from(this.api.updatePdvCategoriaItem(id, data));
  }

  deletePdvCategoriaItem(id: number): Observable<PdvCategoriaItem> {
    return from(this.api.deletePdvCategoriaItem(id));
  }

  // PDV Item Producto
  getPdvItemProductos(): Observable<PdvItemProducto[]> {
    return from(this.api.getPdvItemProductos());
  }

  getPdvItemProductosByItem(itemId: number): Observable<PdvItemProducto[]> {
    return from(this.api.getPdvItemProductosByItem(itemId));
  }

  getPdvItemProducto(id: number): Observable<PdvItemProducto> {
    return from(this.api.getPdvItemProducto(id));
  }

  createPdvItemProducto(data: Partial<PdvItemProducto>): Observable<PdvItemProducto> {
    return from(this.api.createPdvItemProducto(data));
  }

  updatePdvItemProducto(id: number, data: Partial<PdvItemProducto>): Observable<PdvItemProducto> {
    return from(this.api.updatePdvItemProducto(id, data));
  }

  deletePdvItemProducto(id: number): Observable<PdvItemProducto> {
    return from(this.api.deletePdvItemProducto(id));
  }

  // PDV Config
  getPdvConfig(): Observable<PdvConfig> {
    return from(this.api.getPdvConfig());
  }

  createPdvConfig(data: Partial<PdvConfig>): Observable<PdvConfig> {
    return from(this.api.createPdvConfig(data));
  }

  updatePdvConfig(id: number, data: Partial<PdvConfig>): Observable<PdvConfig> {
    return from(this.api.updatePdvConfig(id, data));
  }

  // PdvMesa methods
  getPdvMesas(): Observable<PdvMesa[]> {
    return from(this.api.getPdvMesas());
  }

  getPdvMesasActivas(): Observable<PdvMesa[]> {
    return from(this.api.getPdvMesasActivas());
  }

  getPdvMesasDisponibles(): Observable<PdvMesa[]> {
    return from(this.api.getPdvMesasDisponibles());
  }

  getPdvMesasBySector(sectorId: number): Observable<PdvMesa[]> {
    return from(this.api.getPdvMesasBySector(sectorId));
  }

  getPdvMesa(id: number): Observable<PdvMesa> {
    return from(this.api.getPdvMesa(id));
  }

  createPdvMesa(data: Partial<PdvMesa>): Observable<PdvMesa> {
    return from(this.api.createPdvMesa(data));
  }

  createBatchPdvMesas(batchData: Partial<PdvMesa>[]): Observable<PdvMesa[]> {
    return from(this.api.createBatchPdvMesas(batchData));
  }

  updatePdvMesa(id: number, data: Partial<PdvMesa>): Observable<PdvMesa> {
    return from(this.api.updatePdvMesa(id, data));
  }

  deletePdvMesa(id: number): Observable<boolean> {
    return from(this.api.deletePdvMesa(id));
  }

  // Sector methods
  getSectores(): Observable<Sector[]> {
    return from(this.api.getSectores());
  }

  getSectoresActivos(): Observable<Sector[]> {
    return from(this.api.getSectoresActivos());
  }

  getSector(id: number): Observable<Sector> {
    return from(this.api.getSector(id));
  }

  createSector(data: Partial<Sector>): Observable<Sector> {
    return from(this.api.createSector(data));
  }

  updateSector(id: number, data: Partial<Sector>): Observable<Sector> {
    return from(this.api.updateSector(id, data));
  }

  deleteSector(id: number): Observable<boolean> {
    return from(this.api.deleteSector(id));
  }

  // Observacion methods
  getObservaciones(): Observable<Observacion[]> {
    return from(this.api.getObservaciones());
  }

  searchObservaciones(search: string): Observable<Observacion[]> {
    return from(this.api.searchObservaciones(search));
  }

  getObservacion(id: number): Observable<Observacion> {
    return from(this.api.getObservacion(id));
  }

  createObservacion(data: Partial<Observacion>): Observable<Observacion> {
    return from(this.api.createObservacion(data));
  }

  updateObservacion(id: number, data: Partial<Observacion>): Observable<any> {
    return from(this.api.updateObservacion(id, data));
  }

  deleteObservacion(id: number): Observable<any> {
    return from(this.api.deleteObservacion(id));
  }

  getObservacionesByProducto(productoId: number): Observable<ProductoObservacion[]> {
    return from(this.api.getObservacionesByProducto(productoId));
  }

  createProductoObservacion(data: Partial<ProductoObservacion>): Observable<ProductoObservacion> {
    return from(this.api.createProductoObservacion(data));
  }

  deleteProductoObservacion(id: number): Observable<any> {
    return from(this.api.deleteProductoObservacion(id));
  }

  // Combo methods
  getComboByProducto(productoId: number): Observable<any> {
    return from(this.api.getComboByProducto(productoId));
  }

  createCombo(data: any): Observable<any> {
    return from(this.api.createCombo(data));
  }

  updateCombo(id: number, data: any): Observable<any> {
    return from(this.api.updateCombo(id, data));
  }

  deleteCombo(id: number): Observable<any> {
    return from(this.api.deleteCombo(id));
  }

  getComboProductos(comboId: number): Observable<any[]> {
    return from(this.api.getComboProductos(comboId));
  }

  createComboProducto(data: any): Observable<any> {
    return from(this.api.createComboProducto(data));
  }

  updateComboProducto(id: number, data: any): Observable<any> {
    return from(this.api.updateComboProducto(id, data));
  }

  deleteComboProducto(id: number): Observable<any> {
    return from(this.api.deleteComboProducto(id));
  }

  // Adicional methods (Nueva Arquitectura)
  getAdicionales(): Observable<Adicional[]> {
    return from(this.api.getAdicionales());
  }

  getAdicionalesWithFilters(filters: {
    search?: string;
    activo?: boolean | null;
    categoria?: string;
    page?: number;
    pageSize?: number;
  }): Observable<{items: Adicional[], total: number, page: number, pageSize: number}> {
    return from(this.api.getAdicionalesWithFilters(filters));
  }

  getAdicional(adicionalId: number): Observable<Adicional> {
    return from(this.api.getAdicional(adicionalId));
  }

  createAdicional(data: Partial<Adicional>): Observable<Adicional> {
    return from(this.api.createAdicional(data));
  }

  updateAdicional(id: number, data: Partial<Adicional>): Observable<any> {
    return from(this.api.updateAdicional(id, data));
  }

  deleteAdicional(id: number): Observable<any> {
    return from(this.api.deleteAdicional(id));
  }

  // ✅ NUEVOS MÉTODOS: Para gestión de recetas de adicionales
  getAdicionalWithReceta(adicionalId: number): Observable<Adicional> {
    return from(this.api.getAdicionalWithReceta(adicionalId));
  }

  createRecetaForAdicional(adicionalId: number, recetaData: any): Observable<Receta> {
    return from(this.api.createRecetaForAdicional(adicionalId, recetaData));
  }

  updateRecetaForAdicional(adicionalId: number, recetaData: any): Observable<any> {
    return from(this.api.updateRecetaForAdicional(adicionalId, recetaData));
  }

  deleteRecetaForAdicional(adicionalId: number): Observable<any> {
    return from(this.api.deleteRecetaForAdicional(adicionalId));
  }

  // RecetaAdicionalVinculacion methods (Nueva Arquitectura)
  getRecetaAdicionalVinculaciones(recetaId: number): Observable<RecetaAdicionalVinculacion[]> {
    return from(this.api.getRecetaAdicionalVinculaciones(recetaId));
  }

  getRecetaAdicionalVinculacion(vinculacionId: number): Observable<RecetaAdicionalVinculacion> {
    return from(this.api.getRecetaAdicionalVinculacion(vinculacionId));
  }

  createRecetaAdicionalVinculacion(data: Partial<RecetaAdicionalVinculacion>): Observable<RecetaAdicionalVinculacion> {
    return from(this.api.createRecetaAdicionalVinculacion(data));
  }

  updateRecetaAdicionalVinculacion(id: number, data: Partial<RecetaAdicionalVinculacion>): Observable<any> {
    return from(this.api.updateRecetaAdicionalVinculacion(id, data));
  }

  deleteRecetaAdicionalVinculacion(id: number): Observable<any> {
    return from(this.api.deleteRecetaAdicionalVinculacion(id));
  }

  // RecetaIngredienteIntercambiable methods
  getRecetaIngredientesIntercambiables(recetaIngredienteId: number): Observable<RecetaIngredienteIntercambiable[]> {
    return from(this.api.getRecetaIngredientesIntercambiables(recetaIngredienteId));
  }

  createRecetaIngredienteIntercambiable(data: Partial<RecetaIngredienteIntercambiable>): Observable<RecetaIngredienteIntercambiable> {
    return from(this.api.createRecetaIngredienteIntercambiable(data));
  }

  updateRecetaIngredienteIntercambiable(id: number, data: Partial<RecetaIngredienteIntercambiable>): Observable<any> {
    return from(this.api.updateRecetaIngredienteIntercambiable(id, data));
  }

  deleteRecetaIngredienteIntercambiable(id: number): Observable<any> {
    return from(this.api.deleteRecetaIngredienteIntercambiable(id));
  }

  // === productoS REPOSITORY METHODS ===

  // Familia methods
  getFamilias(): Observable<Familia[]> {
    return from(this.api.getFamilias());
  }

  getFamilia(familiaId: number): Observable<Familia> {
    return from(this.api.getFamilia(familiaId));
  }

  createFamilia(familiaData: Partial<Familia>): Observable<Familia> {
    return from(this.api.createFamilia(familiaData));
  }

  updateFamilia(familiaId: number, familiaData: Partial<Familia>): Observable<any> {
    return from(this.api.updateFamilia(familiaId, familiaData));
  }

  deleteFamilia(familiaId: number): Observable<any> {
    return from(this.api.deleteFamilia(familiaId));
  }

  // Subfamilia methods
  getSubfamilias(): Observable<Subfamilia[]> {
    return from(this.api.getSubfamilias());
  }

  getSubfamiliasByFamilia(familiaId: number): Observable<Subfamilia[]> {
    return from(this.api.getSubfamiliasByFamilia(familiaId));
  }

  getSubfamilia(subfamiliaId: number): Observable<Subfamilia> {
    return from(this.api.getSubfamilia(subfamiliaId));
  }

  createSubfamilia(subfamiliaData: Partial<Subfamilia>): Observable<Subfamilia> {
    return from(this.api.createSubfamilia(subfamiliaData));
  }

  updateSubfamilia(subfamiliaId: number, subfamiliaData: Partial<Subfamilia>): Observable<any> {
    return from(this.api.updateSubfamilia(subfamiliaId, subfamiliaData));
  }

  deleteSubfamilia(subfamiliaId: number): Observable<any> {
    return from(this.api.deleteSubfamilia(subfamiliaId));
  }

  // producto methods
  getProductos(): Observable<Producto[]> {
    return from(this.api.getProductos());
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
    return from(this.api.getProductosWithFilters(filters));
  }

  getProducto(productoId: number): Observable<Producto> {
    return from(this.api.getProducto(productoId));
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

  // Presentacion methods
  getPresentaciones(): Observable<Presentacion[]> {
    return from(this.api.getPresentaciones());
  }

  getPresentacionesByProducto(productoId: number, page = 0, pageSize = 10, filtroActivo = 'activos'): Observable<any> {
    return from(this.api.getPresentacionesByProducto(productoId, page, pageSize, filtroActivo));
  }

  getPresentacion(presentacionId: number): Observable<any> {
    return from(this.api.getPresentacion(presentacionId));
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

  setPresentacionPrincipal(presentacionId: number): Observable<any> {
    return from(this.api.setPresentacionPrincipal(presentacionId));
  }

  togglePresentacionActivo(presentacionId: number): Observable<any> {
    return from(this.api.togglePresentacionActivo(presentacionId));
  }

  // CodigoBarra methods
  createCodigoBarra(codigoBarraData: Partial<CodigoBarra>): Observable<CodigoBarra> {
    return from(this.api.createCodigoBarra(codigoBarraData));
  }

  updateCodigoBarra(codigoBarraId: number, codigoBarraData: Partial<CodigoBarra>): Observable<any> {
    return from(this.api.updateCodigoBarra(codigoBarraId, codigoBarraData));
  }

  deleteCodigoBarra(codigoBarraId: number): Observable<any> {
    return from(this.api.deleteCodigoBarra(codigoBarraId));
  }

  getCodigosBarraByPresentacion(presentacionId: number): Observable<CodigoBarra[]> {
    return from(this.api.getCodigosBarraByPresentacion(presentacionId));
  }

  searchProductosByCodigo(codigo: string): Observable<any> {
    return from(this.api.searchProductosByCodigo(codigo));
  }

  // PrecioVenta methods
  getPreciosVenta(): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVenta());
  }

  getPreciosVentaByPresentacion(presentacionId: number, activo: boolean | null): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByPresentacion(presentacionId, activo));
  }

  getPreciosVentaByReceta(recetaId: number, activo: boolean | null): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByReceta(recetaId, activo));
  }

  getPreciosVentaByProducto(productoId: number, activo: boolean | null): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByProducto(productoId, activo));
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

  // PrecioCosto methods
  getPreciosCosto(): Observable<PrecioCosto[]> {
    return from(this.api.getPreciosCosto());
  }

  getPreciosCostoByProducto(productoId: number): Observable<PrecioCosto[]> {
    return from(this.api.getPreciosCostoByProducto(productoId));
  }

  createPrecioCosto(precioCostoData: Partial<PrecioCosto>): Observable<PrecioCosto> {
    return from(this.api.createPrecioCosto(precioCostoData));
  }

  updatePrecioCosto(precioCostoId: number, precioCostoData: Partial<PrecioCosto>): Observable<any> {
    return from(this.api.updatePrecioCosto(precioCostoId, precioCostoData));
  }

  deletePrecioCosto(precioCostoId: number): Observable<any> {
    return from(this.api.deletePrecioCosto(precioCostoId));
  }

  // Receta methods
  getRecetas(): Observable<Receta[]> {
    return from(this.api.getRecetas());
  }

  getRecetasWithFilters(filters: {
    search?: string;
    activo?: boolean | null;
    page?: number;
    pageSize?: number;
  }): Observable<{items: Receta[], total: number, page: number, pageSize: number}> {
    return from(this.api.getRecetasWithFilters(filters));
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

  checkRecetaDependencies(recetaId: number): Observable<{
    receta: { id: number; nombre: string };
    productosVinculados: Array<{ id: number; nombre: string; tipo: string; activo: boolean }>;
  }> {
    return from(this.api.checkRecetaDependencies(recetaId));
  }

  deleteReceta(recetaId: number): Observable<any> {
    return from(this.api.deleteReceta(recetaId));
  }

  // Receta additional methods
  getRecetasByEstado(activo: boolean | null): Observable<Receta[]> {
    return from(this.api.getRecetasByEstado(activo));
  }

  searchRecetasByNombre(nombre: string): Observable<Receta[]> {
    return from(this.api.searchRecetasByNombre(nombre));
  }

  getRecetasWithIngredientes(): Observable<Receta[]> {
    return from(this.api.getRecetasWithIngredientes());
  }

  calcularCostoReceta(recetaId: number): Observable<number> {
    return from(this.api.calcularCostoReceta(recetaId));
  }

  actualizarCostoReceta(recetaId: number): Observable<any> {
    return from(this.api.actualizarCostoReceta(recetaId));
  }

  // RecetaIngrediente methods
  getRecetaIngredientes(recetaId: number): Observable<RecetaIngrediente[]> {
    return from(this.api.getRecetaIngredientes(recetaId));
  }

  createRecetaIngrediente(recetaIngredienteData: Partial<RecetaIngrediente>): Observable<RecetaIngrediente> {
    return from(this.api.createRecetaIngrediente(recetaIngredienteData));
  }

  updateRecetaIngrediente(recetaIngredienteId: number, recetaIngredienteData: Partial<RecetaIngrediente>): Observable<any> {
    return from(this.api.updateRecetaIngrediente(recetaIngredienteId, recetaIngredienteData));
  }

  deleteRecetaIngrediente(recetaIngredienteId: number): Observable<any> {
    return from(this.api.deleteRecetaIngrediente(recetaIngredienteId));
  }

  deleteRecetaIngredienteMultiplesVariaciones(data: {
    recetaIngredienteId: number;
    eliminarDeOtrasVariaciones: boolean;
  }): Observable<any> {
    return from(this.api.deleteRecetaIngredienteMultiplesVariaciones(data));
  }

  // RecetaIngrediente additional methods
  getRecetaIngredientesActivos(recetaId: number): Observable<RecetaIngrediente[]> {
    return from(this.api.getRecetaIngredientesActivos(recetaId));
  }

  calcularCostoIngrediente(recetaIngredienteId: number): Observable<number> {
    return from(this.api.calcularCostoIngrediente(recetaIngredienteId));
  }

  validarStockIngrediente(recetaIngredienteId: number): Observable<boolean> {
    return from(this.api.validarStockIngrediente(recetaIngredienteId));
  }

  // ✅ NUEVOS MÉTODOS PARA ARQUITECTURA CON VARIACIONES

  // Sabor methods
  getSaboresByProducto(productoId: number): Observable<any[]> {
    return from(this.api.getSaboresByProducto(productoId));
  }

  createSabor(saborData: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    productoId: number;
  }): Observable<{ sabor: any; receta: any; mensaje: string }> {
    return from(this.api.createSabor(saborData));
  }

  updateSabor(saborId: number, saborData: Partial<any>): Observable<any> {
    return from(this.api.updateSabor(saborId, saborData));
  }

  deleteSabor(saborId: number): Observable<{ success: boolean; mensaje: string }> {
    return from(this.api.deleteSabor(saborId));
  }

  getSaboresEstadisticas(productoId: number): Observable<{
    totalSabores: number;
    saboresActivos: number;
    totalRecetas: number;
    totalVariaciones: number;
  }> {
    return from(this.api.getSaboresEstadisticas(productoId));
  }

  // RecetaPresentacion methods
  getVariacionesByProducto(productoId: number): Observable<any[]> {
    return from(this.api.getVariacionesByProducto(productoId));
  }

  getVariacionesByProductoAndPresentacion(productoId: number, presentacionId: number): Observable<any[]> {
    return from(this.api.getVariacionesByProductoAndPresentacion(productoId, presentacionId));
  }

  getVariacionesByReceta(recetaId: number): Observable<any[]> {
    return from(this.api.getVariacionesByReceta(recetaId));
  }

  createRecetaPresentacion(variacionData: {
    recetaId: number;
    presentacionId: number;
    saborId: number;
    nombre_generado?: string;
    sku?: string;
    precio_ajuste?: number;
  }): Observable<any> {
    return from(this.api.createRecetaPresentacion(variacionData));
  }

  updateRecetaPresentacion(variacionId: number, variacionData: Partial<any>): Observable<any> {
    return from(this.api.updateRecetaPresentacion(variacionId, variacionData));
  }

  deleteRecetaPresentacion(variacionId: number): Observable<{ success: boolean; mensaje: string }> {
    return from(this.api.deleteRecetaPresentacion(variacionId));
  }

  // bulkUpdateVariaciones(updates: Array<{ variacionId: number; precio_ajuste?: number; activo?: boolean; }>): Observable<{ success: boolean; actualizadas: number }> {
  //   return from(this.api.bulkUpdateVariaciones(updates));
  // }

  bulkUpdateVariaciones(updates: Array<{
    variacionId: number;
    precio_ajuste?: number;
    activo?: boolean;
  }>): Observable<{ success: boolean; actualizadas: number }> {
    return from(this.api.bulkUpdateVariaciones(updates));
  }

  recalcularCostoVariacion(variacionId: number): Observable<{
    success: boolean;
    costoAnterior: number;
    costoNuevo: number;
    mensaje: string;
  }> {
    return from(this.api.recalcularCostoVariacion(variacionId));
  }

  generateVariacionesFaltantes(productoId: number): Observable<{
    success: boolean;
    variacionesGeneradas: number;
    variaciones: any[];
  }> {
    return from(this.api.generateVariacionesFaltantes(productoId));
  }

  // Stock Movimiento methods
  getStockMovimientos(): Observable<StockMovimiento[]> {
    return from(this.api.getStockMovimientos());
  }

  getStockMovimientosByProducto(productoId: number): Observable<StockMovimiento[]> {
    return from(this.api.getStockMovimientosByProducto(productoId));
  }

  createStockMovimiento(stockMovimientoData: Partial<StockMovimiento>): Observable<StockMovimiento> {
    return from(this.api.createStockMovimiento(stockMovimientoData));
  }

  updateStockMovimiento(stockMovimientoId: number, stockMovimientoData: Partial<StockMovimiento>): Observable<any> {
    return from(this.api.updateStockMovimiento(stockMovimientoId, stockMovimientoData));
  }

  deleteStockMovimiento(stockMovimientoId: number): Observable<any> {
    return from(this.api.deleteStockMovimiento(stockMovimientoId));
  }

  procesarStockVenta(ventaId: number): Observable<any> {
    return from(this.api.procesarStockVenta(ventaId));
  }

  revertirStockVenta(ventaId: number): Observable<any> {
    return from(this.api.revertirStockVenta(ventaId));
  }

  // Additional helper methods
  searchProductosByNombre(nombre: string): Observable<Producto[]> {
    return from(this.api.searchProductosByNombre(nombre));
  }

  getProductosByTipo(tipo: string): Observable<Producto[]> {
    return from(this.api.getProductosByTipo(tipo));
  }

  getProductosWithStock(): Observable<Producto[]> {
    return from(this.api.getProductosWithStock());
  }

  // Conversion Moneda methods
  getConversionesMoneda(): Observable<ConversionMoneda[]> {
    return from(this.api.getConversionesMoneda());
  }

  createConversionMoneda(conversionData: Partial<ConversionMoneda>): Observable<ConversionMoneda> {
    return from(this.api.createConversionMoneda(conversionData));
  }

  updateConversionMoneda(conversionId: number, conversionData: Partial<ConversionMoneda>): Observable<any> {
    return from(this.api.updateConversionMoneda(conversionId, conversionData));
  }

  deleteConversionMoneda(conversionId: number): Observable<any> {
    return from(this.api.deleteConversionMoneda(conversionId));
  }

  // Configuracion Monetaria methods
  getConfiguracionMonetaria(): Observable<ConfiguracionMonetaria> {
    return from(this.api.getConfiguracionMonetaria());
  }

  createConfiguracionMonetaria(configData: Partial<ConfiguracionMonetaria>): Observable<ConfiguracionMonetaria> {
    return from(this.api.createConfiguracionMonetaria(configData));
  }

  updateConfiguracionMonetaria(configId: number, configData: Partial<ConfiguracionMonetaria>): Observable<any> {
    return from(this.api.updateConfiguracionMonetaria(configId, configData));
  }

  // TipoPrecio methods
  getTiposPrecio(): Observable<TipoPrecio[]> {
    return from(this.api.getTiposPrecio());
  }

  getTipoPrecio(tipoPrecioId: number): Observable<TipoPrecio> {
    return from(this.api.getTipoPrecio(tipoPrecioId));
  }

  createTipoPrecio(tipoPrecioData: Partial<TipoPrecio>): Observable<TipoPrecio> {
    return from(this.api.createTipoPrecio(tipoPrecioData));
  }

  updateTipoPrecio(tipoPrecioId: number, tipoPrecioData: Partial<TipoPrecio>): Observable<any> {
    return from(this.api.updateTipoPrecio(tipoPrecioId, tipoPrecioData));
  }

  deleteTipoPrecio(tipoPrecioId: number): Observable<any> {
    return from(this.api.deleteTipoPrecio(tipoPrecioId));
  }

  recalculateAllRecipeCosts(): Observable<any[]> {
    return from(this.api.recalculateAllRecipeCosts());
  }

  recalculateRecipeCost(recetaId: number): Observable<any> {
    return from(this.api.recalculateRecipeCost(recetaId));
  }

  // Sabor methods
  getSabores(): Observable<string[]> {
    return from(this.api.getSabores());
  }

  createOrUpdateSabor(saborData: any): Observable<{ success: boolean, message: string }> {
    return from(this.api.createOrUpdateSabor(saborData));
  }

  getSaborDetails(categoria: string): Observable<any> {
    return from(this.api.getSaborDetails(categoria));
  }

  // ✅ NUEVO: Método para obtener un mapeo de variacionId -> recetaId
  getRecetasIdsPorVariacionIds(variacionIds: number[]): Observable<{ [variacionId: number]: number }> {
    return from(this.api.getRecetasIdsPorVariacionIds(variacionIds));
  }

  // =============================================
  // PdvAtajoGrupo
  // =============================================
  getPdvAtajoGrupos(): Observable<any[]> {
    return from(this.api.getPdvAtajoGrupos());
  }
  getPdvAtajoGrupo(id: number): Observable<any> {
    return from(this.api.getPdvAtajoGrupo(id));
  }
  createPdvAtajoGrupo(data: any): Observable<any> {
    return from(this.api.createPdvAtajoGrupo(data));
  }
  updatePdvAtajoGrupo(id: number, data: any): Observable<any> {
    return from(this.api.updatePdvAtajoGrupo(id, data));
  }
  deletePdvAtajoGrupo(id: number): Observable<any> {
    return from(this.api.deletePdvAtajoGrupo(id));
  }
  reorderPdvAtajoGrupos(orderedIds: number[]): Observable<any> {
    return from(this.api.reorderPdvAtajoGrupos(orderedIds));
  }

  // =============================================
  // PdvAtajoItem
  // =============================================
  getPdvAtajoItems(): Observable<any[]> {
    return from(this.api.getPdvAtajoItems());
  }
  getPdvAtajoItem(id: number): Observable<any> {
    return from(this.api.getPdvAtajoItem(id));
  }
  getPdvAtajoItemsByGrupo(grupoId: number): Observable<any[]> {
    return from(this.api.getPdvAtajoItemsByGrupo(grupoId));
  }
  createPdvAtajoItem(data: any): Observable<any> {
    return from(this.api.createPdvAtajoItem(data));
  }
  updatePdvAtajoItem(id: number, data: any): Observable<any> {
    return from(this.api.updatePdvAtajoItem(id, data));
  }
  deletePdvAtajoItem(id: number): Observable<any> {
    return from(this.api.deletePdvAtajoItem(id));
  }

  // =============================================
  // PdvAtajoGrupoItem (join)
  // =============================================
  assignAtajoItemToGrupo(grupoId: number, itemId: number, posicion: number): Observable<any> {
    return from(this.api.assignAtajoItemToGrupo(grupoId, itemId, posicion));
  }
  removeAtajoItemFromGrupo(grupoId: number, itemId: number): Observable<any> {
    return from(this.api.removeAtajoItemFromGrupo(grupoId, itemId));
  }
  reorderAtajoItemsInGrupo(grupoId: number, orderedItemIds: number[]): Observable<any> {
    return from(this.api.reorderAtajoItemsInGrupo(grupoId, orderedItemIds));
  }

  // =============================================
  // PdvAtajoItemProducto (join)
  // =============================================
  getPdvAtajoItemProductos(atajoItemId: number): Observable<any[]> {
    return from(this.api.getPdvAtajoItemProductos(atajoItemId));
  }
  assignProductoToAtajoItem(atajoItemId: number, productoId: number, data?: any): Observable<any> {
    return from(this.api.assignProductoToAtajoItem(atajoItemId, productoId, data));
  }
  removeProductoFromAtajoItem(id: number): Observable<any> {
    return from(this.api.removeProductoFromAtajoItem(id));
  }
  reorderProductosInAtajoItem(atajoItemId: number, orderedIds: number[]): Observable<any> {
    return from(this.api.reorderProductosInAtajoItem(atajoItemId, orderedIds));
  }

  // =============================================
  // Caja Mayor
  // =============================================
  getCajasMayor(): Observable<any[]> {
    return from(this.api.getCajasMayor());
  }
  getCajaMayor(id: number): Observable<any> {
    return from(this.api.getCajaMayor(id));
  }
  createCajaMayor(data: any): Observable<any> {
    return from(this.api.createCajaMayor(data));
  }
  updateCajaMayor(id: number, data: any): Observable<any> {
    return from(this.api.updateCajaMayor(id, data));
  }
  cerrarCajaMayor(id: number): Observable<any> {
    return from(this.api.cerrarCajaMayor(id));
  }

  // Caja Mayor Saldos
  getCajaMayorSaldos(cajaMayorId: number): Observable<any[]> {
    return from(this.api.getCajaMayorSaldos(cajaMayorId));
  }
  recalcularSaldos(cajaMayorId: number): Observable<any> {
    return from(this.api.recalcularSaldos(cajaMayorId));
  }

  // Caja Mayor Movimientos
  getCajaMayorMovimientos(cajaMayorId: number, filtros?: any): Observable<any> {
    return from(this.api.getCajaMayorMovimientos(cajaMayorId, filtros));
  }
  createCajaMayorMovimiento(data: any): Observable<any> {
    return from(this.api.createCajaMayorMovimiento(data));
  }
  anularCajaMayorMovimiento(id: number, motivo: string): Observable<any> {
    return from(this.api.anularCajaMayorMovimiento(id, motivo));
  }

  // Gasto Categorias
  getGastoCategorias(): Observable<any[]> {
    return from(this.api.getGastoCategorias());
  }
  getGastoCategoria(id: number): Observable<any> {
    return from(this.api.getGastoCategoria(id));
  }
  createGastoCategoria(data: any): Observable<any> {
    return from(this.api.createGastoCategoria(data));
  }
  updateGastoCategoria(id: number, data: any): Observable<any> {
    return from(this.api.updateGastoCategoria(id, data));
  }
  deleteGastoCategoria(id: number): Observable<any> {
    return from(this.api.deleteGastoCategoria(id));
  }

  // Gastos
  getGastos(filtros?: any): Observable<any[]> {
    return from(this.api.getGastos(filtros));
  }
  getGasto(id: number): Observable<any> {
    return from(this.api.getGasto(id));
  }
  createGasto(data: any): Observable<any> {
    return from(this.api.createGasto(data));
  }
  anularGasto(id: number, motivo: string): Observable<any> {
    return from(this.api.anularGasto(id, motivo));
  }
  editGasto(gastoId: number, data: any): Observable<any> {
    return from(this.api.editGasto(gastoId, data));
  }
  editCajaMayorMovimiento(movId: number, data: any): Observable<any> {
    return from(this.api.editCajaMayorMovimiento(movId, data));
  }
  getGastosProgramados(): Observable<any[]> {
    return from(this.api.getGastosProgramados());
  }

  // Retiros de Caja
  getRetirosCaja(filtros?: any): Observable<any[]> {
    return from(this.api.getRetirosCaja(filtros));
  }
  getRetiroCaja(id: number): Observable<any> {
    return from(this.api.getRetiroCaja(id));
  }
  createRetiroCaja(data: any): Observable<any> {
    return from(this.api.createRetiroCaja(data));
  }
  ingresarRetiroCaja(retiroId: number, cajaMayorId: number): Observable<any> {
    return from(this.api.ingresarRetiroCaja(retiroId, cajaMayorId));
  }

  // ===================== BANKING =====================
  getCuentasBancarias(): Observable<any[]> {
    return from(this.api.getCuentasBancarias());
  }
  getCuentaBancaria(id: number): Observable<any> {
    return from(this.api.getCuentaBancaria(id));
  }
  createCuentaBancaria(data: any): Observable<any> {
    return from(this.api.createCuentaBancaria(data));
  }
  updateCuentaBancaria(id: number, data: any): Observable<any> {
    return from(this.api.updateCuentaBancaria(id, data));
  }
  deleteCuentaBancaria(id: number): Observable<any> {
    return from(this.api.deleteCuentaBancaria(id));
  }

  getMaquinasPos(): Observable<any[]> {
    return from(this.api.getMaquinasPos());
  }
  getMaquinaPos(id: number): Observable<any> {
    return from(this.api.getMaquinaPos(id));
  }
  createMaquinaPos(data: any): Observable<any> {
    return from(this.api.createMaquinaPos(data));
  }
  updateMaquinaPos(id: number, data: any): Observable<any> {
    return from(this.api.updateMaquinaPos(id, data));
  }
  deleteMaquinaPos(id: number): Observable<any> {
    return from(this.api.deleteMaquinaPos(id));
  }

  getAcreditacionesPos(filtros?: any): Observable<any> {
    return from(this.api.getAcreditacionesPos(filtros));
  }
  getAcreditacionPos(id: number): Observable<any> {
    return from(this.api.getAcreditacionPos(id));
  }
  createAcreditacionPos(data: any): Observable<any> {
    return from(this.api.createAcreditacionPos(data));
  }
  procesarAcreditacionesAuto(): Observable<any> {
    return from(this.api.procesarAcreditacionesAuto());
  }
  verificarAcreditacionPos(id: number, montoAcreditado: number): Observable<any> {
    return from(this.api.verificarAcreditacionPos(id, montoAcreditado));
  }
  getAcreditacionesPendientes(): Observable<any[]> {
    return from(this.api.getAcreditacionesPendientes());
  }
  acreditarTransferenciaBancaria(payload: any): Observable<any> {
    return from(this.api.acreditarTransferenciaBancaria(payload));
  }

  // ===================== CUENTAS POR PAGAR (FASE 3) =====================
  getCompraCategorias(): Observable<any[]> {
    return from(this.api.getCompraCategorias());
  }
  createCompraCategoria(data: any): Observable<any> {
    return from(this.api.createCompraCategoria(data));
  }
  updateCompraCategoria(id: number, data: any): Observable<any> {
    return from(this.api.updateCompraCategoria(id, data));
  }
  deleteCompraCategoria(id: number): Observable<any> {
    return from(this.api.deleteCompraCategoria(id));
  }

  getCompraCuotas(compraId: number): Observable<any[]> {
    return from(this.api.getCompraCuotas(compraId));
  }
  setCompraCuotas(compraId: number, cuotas: any[]): Observable<any[]> {
    return from(this.api.setCompraCuotas(compraId, cuotas));
  }
  pagarCompraCuota(payload: any): Observable<any> {
    return from(this.api.pagarCompraCuota(payload));
  }

  getCuentasPorPagar(filtros?: any): Observable<any> {
    return from(this.api.getCuentasPorPagar(filtros));
  }
  getCuentaPorPagar(id: number): Observable<any> {
    return from(this.api.getCuentaPorPagar(id));
  }
  createCuentaPorPagar(data: any): Observable<any> {
    return from(this.api.createCuentaPorPagar(data));
  }
  updateCuentaPorPagar(id: number, data: any): Observable<any> {
    return from(this.api.updateCuentaPorPagar(id, data));
  }
  cancelarCuentaPorPagar(id: number): Observable<any> {
    return from(this.api.cancelarCuentaPorPagar(id));
  }
  getCuentaPorPagarCuotas(cppId: number): Observable<any[]> {
    return from(this.api.getCuentaPorPagarCuotas(cppId));
  }
  pagarCppCuota(payload: any): Observable<any> {
    return from(this.api.pagarCppCuota(payload));
  }

  // ===================== DASHBOARD SHORTCUTS =====================
  getDashboardShortcuts(dashboardKey?: string): Observable<any[]> {
    return from(this.api.getDashboardShortcuts(dashboardKey));
  }
  createDashboardShortcut(data: any): Observable<any> {
    return from(this.api.createDashboardShortcut(data));
  }
  updateDashboardShortcut(id: number, data: any): Observable<any> {
    return from(this.api.updateDashboardShortcut(id, data));
  }
  deleteDashboardShortcut(id: number): Observable<any> {
    return from(this.api.deleteDashboardShortcut(id));
  }

  // ===================== FASE 4: ENTRADAS VARIAS =====================
  getEntradaVariaCategorias(): Observable<any[]> {
    return from(this.api.getEntradaVariaCategorias());
  }
  getEntradaVariaCategoria(id: number): Observable<any> {
    return from(this.api.getEntradaVariaCategoria(id));
  }
  createEntradaVariaCategoria(data: any): Observable<any> {
    return from(this.api.createEntradaVariaCategoria(data));
  }
  updateEntradaVariaCategoria(id: number, data: any): Observable<any> {
    return from(this.api.updateEntradaVariaCategoria(id, data));
  }
  deleteEntradaVariaCategoria(id: number): Observable<any> {
    return from(this.api.deleteEntradaVariaCategoria(id));
  }
  getEntradasVarias(filtros?: any): Observable<any> {
    return from(this.api.getEntradasVarias(filtros));
  }
  getEntradaVaria(id: number): Observable<any> {
    return from(this.api.getEntradaVaria(id));
  }
  createEntradaVaria(data: any): Observable<any> {
    return from(this.api.createEntradaVaria(data));
  }
  anularEntradaVaria(id: number, motivo: string): Observable<any> {
    return from(this.api.anularEntradaVaria(id, motivo));
  }

  // ===================== FASE 4: OPERACIONES FINANCIERAS =====================
  getOperacionFinancieraCategorias(): Observable<any[]> {
    return from(this.api.getOperacionFinancieraCategorias());
  }
  getOperacionFinancieraCategoria(id: number): Observable<any> {
    return from(this.api.getOperacionFinancieraCategoria(id));
  }
  createOperacionFinancieraCategoria(data: any): Observable<any> {
    return from(this.api.createOperacionFinancieraCategoria(data));
  }
  updateOperacionFinancieraCategoria(id: number, data: any): Observable<any> {
    return from(this.api.updateOperacionFinancieraCategoria(id, data));
  }
  deleteOperacionFinancieraCategoria(id: number): Observable<any> {
    return from(this.api.deleteOperacionFinancieraCategoria(id));
  }
  getOperacionesFinancieras(filtros?: any): Observable<any> {
    return from(this.api.getOperacionesFinancieras(filtros));
  }
  getOperacionFinanciera(id: number): Observable<any> {
    return from(this.api.getOperacionFinanciera(id));
  }
  createOperacionFinanciera(data: any): Observable<any> {
    return from(this.api.createOperacionFinanciera(data));
  }
  anularOperacionFinanciera(id: number, motivo: string): Observable<any> {
    return from(this.api.anularOperacionFinanciera(id, motivo));
  }

  // ===================== MOVIMIENTOS CUENTA BANCARIA =====================
  getMovimientosCuentaBancaria(cuentaBancariaId: number, filtros?: any): Observable<any> {
    return from(this.api.getMovimientosCuentaBancaria(cuentaBancariaId, filtros));
  }
  createMovimientoBancario(data: any): Observable<any> {
    return from(this.api.createMovimientoBancario(data));
  }

  // ===================== FASE 4: CHEQUERAS + CHEQUES =====================
  getChequeras(): Observable<any[]> {
    return from(this.api.getChequeras());
  }
  getChequera(id: number): Observable<any> {
    return from(this.api.getChequera(id));
  }
  createChequera(data: any): Observable<any> {
    return from(this.api.createChequera(data));
  }
  updateChequera(id: number, data: any): Observable<any> {
    return from(this.api.updateChequera(id, data));
  }
  deleteChequera(id: number): Observable<any> {
    return from(this.api.deleteChequera(id));
  }
  getCheques(filtros?: any): Observable<any> {
    return from(this.api.getCheques(filtros));
  }
  getCheque(id: number): Observable<any> {
    return from(this.api.getCheque(id));
  }
  emitirCheque(data: any): Observable<any> {
    return from(this.api.emitirCheque(data));
  }
  cobrarCheque(id: number, data?: any): Observable<any> {
    return from(this.api.cobrarCheque(id, data));
  }
  anularCheque(id: number, motivo: string): Observable<any> {
    return from(this.api.anularCheque(id, motivo));
  }

  // ===================== RRHH: PERMISOS =====================
  getPermissions(modulo?: string): Observable<any[]> {
    return from(this.api.getPermissions(modulo));
  }
  getAllPermissions(): Observable<any[]> {
    return from(this.api.getAllPermissions());
  }
  createPermission(data: any): Observable<any> {
    return from(this.api.createPermission(data));
  }
  updatePermission(id: number, data: any): Observable<any> {
    return from(this.api.updatePermission(id, data));
  }
  deletePermission(id: number): Observable<any> {
    return from(this.api.deletePermission(id));
  }
  getRolePermissions(roleId: number): Observable<any[]> {
    return from(this.api.getRolePermissions(roleId));
  }
  setRolePermissions(roleId: number, permissionIds: number[]): Observable<any> {
    return from(this.api.setRolePermissions(roleId, permissionIds));
  }
  getPermissionsByUser(userId: number): Observable<any[]> {
    return from(this.api.getPermissionsByUser(userId));
  }
  seedPermissions(): Observable<any> {
    return from(this.api.seedPermissions());
  }

  // ===================== RRHH: CONFIGURACION =====================
  getConfiguracionesRrhh(): Observable<any[]> {
    return from(this.api.getConfiguracionesRrhh());
  }
  getConfiguracionRrhh(clave: string): Observable<any> {
    return from(this.api.getConfiguracionRrhh(clave));
  }
  createConfiguracionRrhh(data: any): Observable<any> {
    return from(this.api.createConfiguracionRrhh(data));
  }
  updateConfiguracionRrhh(id: number, data: any): Observable<any> {
    return from(this.api.updateConfiguracionRrhh(id, data));
  }
  deleteConfiguracionRrhh(id: number): Observable<any> {
    return from(this.api.deleteConfiguracionRrhh(id));
  }
  seedConfiguracionRrhh(): Observable<any> {
    return from(this.api.seedConfiguracionRrhh());
  }

  // ===================== RRHH: CARGOS =====================
  getCargos(): Observable<any[]> {
    return from(this.api.getCargos());
  }
  getCargo(id: number): Observable<any> {
    return from(this.api.getCargo(id));
  }
  createCargo(data: any): Observable<any> {
    return from(this.api.createCargo(data));
  }
  updateCargo(id: number, data: any): Observable<any> {
    return from(this.api.updateCargo(id, data));
  }
  deleteCargo(id: number): Observable<any> {
    return from(this.api.deleteCargo(id));
  }

  // ===================== RRHH: FUNCIONARIOS =====================
  getFuncionarios(filtros?: any): Observable<any[]> {
    return from(this.api.getFuncionarios(filtros));
  }
  getFuncionario(id: number): Observable<any> {
    return from(this.api.getFuncionario(id));
  }
  createFuncionario(data: any): Observable<any> {
    return from(this.api.createFuncionario(data));
  }
  updateFuncionario(id: number, data: any): Observable<any> {
    return from(this.api.updateFuncionario(id, data));
  }
  cambiarCargoFuncionario(id: number, data: any): Observable<any> {
    return from(this.api.cambiarCargoFuncionario(id, data));
  }
  cambiarSalarioFuncionario(id: number, data: any): Observable<any> {
    return from(this.api.cambiarSalarioFuncionario(id, data));
  }
  egresarFuncionario(id: number, data: any): Observable<any> {
    return from(this.api.egresarFuncionario(id, data));
  }
  getHistoricoCargos(funcionarioId: number): Observable<any[]> {
    return from(this.api.getHistoricoCargos(funcionarioId));
  }
  getHistoricoSalarios(funcionarioId: number): Observable<any[]> {
    return from(this.api.getHistoricoSalarios(funcionarioId));
  }

  // ===================== RRHH: DOCUMENTOS =====================
  getFuncionarioDocumentos(funcionarioId: number): Observable<any[]> {
    return from(this.api.getFuncionarioDocumentos(funcionarioId));
  }
  uploadFuncionarioDocumento(payload: any): Observable<any> {
    return from(this.api.uploadFuncionarioDocumento(payload));
  }
  deleteFuncionarioDocumento(id: number): Observable<any> {
    return from(this.api.deleteFuncionarioDocumento(id));
  }
  getFuncionarioDocumentoBase64(id: number): Observable<any> {
    return from(this.api.getFuncionarioDocumentoBase64(id));
  }
  updateFuncionarioDocumento(id: number, data: any): Observable<any> {
    return from(this.api.updateFuncionarioDocumento(id, data));
  }

  // ===================== RRHH: TURNOS =====================
  getTurnos(): Observable<any[]> {
    return from(this.api.getTurnos());
  }
  getTurno(id: number): Observable<any> {
    return from(this.api.getTurno(id));
  }
  createTurno(data: any): Observable<any> {
    return from(this.api.createTurno(data));
  }
  updateTurno(id: number, data: any): Observable<any> {
    return from(this.api.updateTurno(id, data));
  }
  deleteTurno(id: number): Observable<any> {
    return from(this.api.deleteTurno(id));
  }
  asignarTurnoFuncionario(data: any): Observable<any> {
    return from(this.api.asignarTurnoFuncionario(data));
  }
  getFuncionarioTurnos(funcionarioId: number): Observable<any[]> {
    return from(this.api.getFuncionarioTurnos(funcionarioId));
  }

  // ===================== RRHH: ASISTENCIAS =====================
  getAsistencias(filtros?: any): Observable<any[]> {
    return from(this.api.getAsistencias(filtros));
  }
  getAsistencia(id: number): Observable<any> {
    return from(this.api.getAsistencia(id));
  }
  createAsistencia(data: any): Observable<any> {
    return from(this.api.createAsistencia(data));
  }
  updateAsistencia(id: number, data: any): Observable<any> {
    return from(this.api.updateAsistencia(id, data));
  }
  justificarAsistencia(id: number, data: any): Observable<any> {
    return from(this.api.justificarAsistencia(id, data));
  }
  marcarAsistenciaMasiva(payload: any): Observable<any> {
    return from(this.api.marcarAsistenciaMasiva(payload));
  }

  // ===================== RRHH: PENALIZACIONES =====================
  getPenalizaciones(filtros?: any): Observable<any[]> {
    return from(this.api.getPenalizaciones(filtros));
  }
  createPenalizacion(data: any): Observable<any> {
    return from(this.api.createPenalizacion(data));
  }
  anularPenalizacion(id: number): Observable<any> {
    return from(this.api.anularPenalizacion(id));
  }

  // ===================== RRHH: FERIADOS =====================
  getFeriados(anio?: number): Observable<any[]> {
    return from(this.api.getFeriados(anio));
  }
  createFeriado(data: any): Observable<any> {
    return from(this.api.createFeriado(data));
  }
  updateFeriado(id: number, data: any): Observable<any> {
    return from(this.api.updateFeriado(id, data));
  }
  deleteFeriado(id: number): Observable<any> {
    return from(this.api.deleteFeriado(id));
  }

  // ===================== RRHH: HORAS EXTRA =====================
  getHorasExtra(filtros?: any): Observable<any[]> {
    return from(this.api.getHorasExtra(filtros));
  }
  createHoraExtra(data: any): Observable<any> {
    return from(this.api.createHoraExtra(data));
  }
  anularHoraExtra(id: number): Observable<any> {
    return from(this.api.anularHoraExtra(id));
  }

  // ===================== RRHH: VALES =====================
  getMotivosVale(): Observable<any[]> {
    return from(this.api.getMotivosVale());
  }
  createMotivoVale(data: any): Observable<any> {
    return from(this.api.createMotivoVale(data));
  }
  updateMotivoVale(id: number, data: any): Observable<any> {
    return from(this.api.updateMotivoVale(id, data));
  }
  deleteMotivoVale(id: number): Observable<any> {
    return from(this.api.deleteMotivoVale(id));
  }
  getVales(filtros?: any): Observable<any[]> {
    return from(this.api.getVales(filtros));
  }
  getValesPendientesDescuento(funcionarioId: number): Observable<any[]> {
    return from(this.api.getValesPendientesDescuento(funcionarioId));
  }
  createVale(data: any): Observable<any> {
    return from(this.api.createVale(data));
  }
  confirmarVale(id: number, payload: any): Observable<any> {
    return from(this.api.confirmarVale(id, payload));
  }
  anularVale(id: number, motivo: string): Observable<any> {
    return from(this.api.anularVale(id, motivo));
  }
  marcarValeDescontado(id: number, liquidacionId: number): Observable<any> {
    return from(this.api.marcarValeDescontado(id, liquidacionId));
  }

  // ===================== RRHH: LIQUIDACION CONCEPTOS =====================
  getLiquidacionConceptos(): Observable<any[]> {
    return from(this.api.getLiquidacionConceptos());
  }
  seedLiquidacionConceptos(): Observable<any> {
    return from(this.api.seedLiquidacionConceptos());
  }
  updateLiquidacionConcepto(id: number, data: any): Observable<any> {
    return from(this.api.updateLiquidacionConcepto(id, data));
  }

  // ===================== RRHH: LIQUIDACIONES SUELDO =====================
  getLiquidacionesSueldo(filtros?: any): Observable<any[]> {
    return from(this.api.getLiquidacionesSueldo(filtros));
  }
  getLiquidacionSueldo(id: number): Observable<any> {
    return from(this.api.getLiquidacionSueldo(id));
  }
  generarLiquidacionBorrador(payload: any): Observable<any> {
    return from(this.api.generarLiquidacionBorrador(payload));
  }
  agregarItemLiquidacion(liquidacionId: number, data: any): Observable<any> {
    return from(this.api.agregarItemLiquidacion(liquidacionId, data));
  }
  eliminarItemLiquidacion(itemId: number): Observable<any> {
    return from(this.api.eliminarItemLiquidacion(itemId));
  }
  aprobarLiquidacionSueldo(id: number): Observable<any> {
    return from(this.api.aprobarLiquidacionSueldo(id));
  }
  volverBorradorLiquidacionSueldo(id: number): Observable<any> {
    return from(this.api.volverBorradorLiquidacionSueldo(id));
  }
  pagarLiquidacionSueldo(id: number, payload: any): Observable<any> {
    return from(this.api.pagarLiquidacionSueldo(id, payload));
  }
  anularLiquidacionSueldo(id: number, motivo: string): Observable<any> {
    return from(this.api.anularLiquidacionSueldo(id, motivo));
  }

  // ===================== RRHH: BONOS =====================
  getBonos(filtros?: any): Observable<any[]> {
    return from(this.api.getBonos(filtros));
  }
  createBono(data: any): Observable<any> {
    return from(this.api.createBono(data));
  }
  anularBono(id: number): Observable<any> {
    return from(this.api.anularBono(id));
  }

  // ===================== RRHH: AGUINALDOS =====================
  getAguinaldos(filtros?: any): Observable<any[]> {
    return from(this.api.getAguinaldos(filtros));
  }
  calcularAguinaldosAnio(anio: number): Observable<any> {
    return from(this.api.calcularAguinaldosAnio(anio));
  }

}
