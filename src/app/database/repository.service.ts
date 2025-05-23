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
import { TipoPrecio } from './entities/financiero/tipo-precio.entity';
import { RecetaVariacion } from './entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from './entities/productos/receta-variacion-item.entity';
import { MovimientoStock, TipoReferencia } from './entities/productos/movimiento-stock.entity';
// Import our new entities
import { Observacion } from './entities/productos/observacion.entity';
import { ObservacionProducto } from './entities/productos/observacion-producto.entity';
import { ObservacionProductoVentaItem } from './entities/productos/observacion-producto-venta-item.entity';
import { Adicional } from './entities/productos/adicional.entity';
import { ProductoAdicional } from './entities/productos/producto-adicional.entity';
import { ProductoAdicionalVentaItem } from './entities/productos/producto-adicional-venta-item.entity';
import { CostoPorProducto } from './entities/productos/costo-por-producto.entity';
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
  // PrecioVenta methods
  getPreciosVenta: () => Promise<PrecioVenta[]>;
  getPrecioVenta: (precioVentaId: number, active: boolean) => Promise<PrecioVenta>;
  getPreciosVentaByPresentacion: (presentacionId: number, active: boolean) => Promise<PrecioVenta[]>;
  getPreciosVentaByPresentacionSabor: (presentacionSaborId: number, active: boolean) => Promise<PrecioVenta[]>;
  getPreciosVentaByTipoPrecio: (tipoPrecioId: number, active: boolean) => Promise<PrecioVenta[]>;
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
  searchIngredientesByDescripcion: (searchText: string) => Promise<Ingrediente[]>;

  // RecetaVariacion methods
  getRecetaVariaciones: (recetaId: number) => Promise<RecetaVariacion[]>;
  getRecetaVariacion: (variacionId: number) => Promise<RecetaVariacion>;
  createRecetaVariacion: (variacionData: Partial<RecetaVariacion>) => Promise<RecetaVariacion>;
  updateRecetaVariacion: (variacionId: number, variacionData: Partial<RecetaVariacion>) => Promise<any>;
  deleteRecetaVariacion: (variacionId: number) => Promise<any>;
  searchRecetasByNombre: (searchText: string) => Promise<Receta[]>;
  getRecetaVariacionCosto: (variacionId: number) => Promise<number>;

  // RecetaVariacionItem methods
  getRecetaVariacionItems: (variacionId: number) => Promise<RecetaVariacionItem[]>;
  getRecetaVariacionItem: (variacionItemId: number) => Promise<RecetaVariacionItem>;
  createRecetaVariacionItem: (variacionItemData: Partial<RecetaVariacionItem>) => Promise<RecetaVariacionItem>;
  updateRecetaVariacionItem: (variacionItemId: number, variacionItemData: Partial<RecetaVariacionItem>) => Promise<any>;
  deleteRecetaVariacionItem: (variacionItemId: number) => Promise<any>;
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
  // MovimientoStock methods
  getMovimientosStock: () => Promise<MovimientoStock[]>;
  getMovimientoStock: (movimientoStockId: number) => Promise<MovimientoStock>;
  getMovimientosStockByProducto: (productoId: number) => Promise<MovimientoStock[]>;
  getMovimientosStockByIngrediente: (ingredienteId: number) => Promise<MovimientoStock[]>;
  getMovimientosStockByTipoReferencia: (tipoReferencia: TipoReferencia) => Promise<MovimientoStock[]>;
  getCurrentStockByProducto: (productoId: number) => Promise<MovimientoStock>;
  getCurrentStockByIngrediente: (ingredienteId: number) => Promise<MovimientoStock>;
  createMovimientoStock: (movimientoStockData: any) => Promise<MovimientoStock>;
  updateMovimientoStock: (movimientoStockId: number, movimientoStockData: any) => Promise<any>;
  deleteMovimientoStock: (movimientoStockId: number) => Promise<any>;
  getMovimientosStockByReferenciaAndTipo: (referencia: number, tipoReferencia: TipoReferencia) => Promise<MovimientoStock[]>;
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
  // Venta operations
  getVentas: () => Promise<Venta[]>;
  getVentasByEstado: (estado: VentaEstado) => Promise<Venta[]>;
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
  updatePdvMesa: (id: number, data: Partial<PdvMesa>) => Promise<PdvMesa>;
  deletePdvMesa: (id: number) => Promise<boolean>;
  
  // Sector methods
  getSectores: () => Promise<Sector[]>;
  getSectoresActivos: () => Promise<Sector[]>;
  getSector: (id: number) => Promise<Sector>;
  createSector: (data: Partial<Sector>) => Promise<Sector>;
  updateSector: (id: number, data: Partial<Sector>) => Promise<Sector>;
  deleteSector: (id: number) => Promise<boolean>;
  
  // Reserva methods
  // ... existing methods ...
  
  // Producto search operations
  searchProductos: (params: { searchTerm: string, page: number, pageSize: number, exactMatch?: boolean }) => 
    Promise<{ items: Producto[], total: number, exactMatch?: boolean }>;
  searchProductosByCode: (code: string) => Promise<{ product: Producto, presentacion: Presentacion } | null>;
  
  // Observacion methods
  getObservaciones: () => Promise<Observacion[]>;
  getObservacion: (id: number) => Promise<Observacion>;
  createObservacion: (data: Partial<Observacion>) => Promise<Observacion>;
  updateObservacion: (id: number, data: Partial<Observacion>) => Promise<Observacion>;
  deleteObservacion: (id: number) => Promise<boolean>;
  searchObservaciones: (searchTerm: string, page: number, pageSize: number) => Promise<Observacion[]>;
  
  // ObservacionProducto methods
  getObservacionesProductos: () => Promise<ObservacionProducto[]>;
  getObservacionesProductosByProducto: (productoId: number) => Promise<ObservacionProducto[]>;
  getObservacionProducto: (id: number) => Promise<ObservacionProducto>;
  createObservacionProducto: (data: Partial<ObservacionProducto>) => Promise<{ success: boolean, data?: ObservacionProducto, error?: string, message?: string }>;
  updateObservacionProducto: (id: number, data: Partial<ObservacionProducto>) => Promise<ObservacionProducto>;
  deleteObservacionProducto: (id: number) => Promise<boolean>;
  
  // ObservacionProductoVentaItem methods
  getObservacionesProductosVentasItems: (ventaItemId: number) => Promise<ObservacionProductoVentaItem[]>;
  getObservacionProductoVentaItem: (id: number) => Promise<ObservacionProductoVentaItem>;
  createObservacionProductoVentaItem: (data: Partial<ObservacionProductoVentaItem>) => Promise<ObservacionProductoVentaItem>;
  updateObservacionProductoVentaItem: (id: number, data: Partial<ObservacionProductoVentaItem>) => Promise<ObservacionProductoVentaItem>;
  deleteObservacionProductoVentaItem: (id: number) => Promise<boolean>;
  
  // Adicional methods
  getAdicionales: () => Promise<Adicional[]>;
  getAdicional: (id: number) => Promise<Adicional>;
  getAdicionalesFiltered: (filters: {
    nombre?: string;
    ingredienteId?: number;
    recetaId?: number;
    monedaId?: number;
    activo?: boolean;
    pageIndex?: number;
    pageSize?: number;
  }) => Promise<{items: Adicional[], total: number}>;
  createAdicional: (data: Partial<Adicional>) => Promise<Adicional>;
  updateAdicional: (id: number, data: Partial<Adicional>) => Promise<any>;
  deleteAdicional: (id: number) => Promise<boolean>;
  
  // ProductoAdicional methods
  getProductosAdicionales: () => Promise<ProductoAdicional[]>;
  getProductosAdicionalesByProducto: (productoId: number) => Promise<ProductoAdicional[]>;
  getProductosAdicionalesByPresentacion: (presentacionId: number) => Promise<ProductoAdicional[]>;
  getProductoAdicional: (id: number) => Promise<ProductoAdicional>;
  createProductoAdicional: (data: Partial<ProductoAdicional>) => Promise<{ success: boolean, data?: ProductoAdicional, error?: string, message?: string }>;
  updateProductoAdicional: (id: number, data: Partial<ProductoAdicional>) => Promise<ProductoAdicional>;
  deleteProductoAdicional: (id: number) => Promise<boolean>;
  
  // ProductoAdicionalVentaItem methods
  getProductosAdicionalesVentasItems: (ventaItemId: number) => Promise<ProductoAdicionalVentaItem[]>;
  getProductoAdicionalVentaItem: (id: number) => Promise<ProductoAdicionalVentaItem>;
  createProductoAdicionalVentaItem: (data: Partial<ProductoAdicionalVentaItem>) => Promise<ProductoAdicionalVentaItem>;
  updateProductoAdicionalVentaItem: (id: number, data: Partial<ProductoAdicionalVentaItem>) => Promise<ProductoAdicionalVentaItem>;
  deleteProductoAdicionalVentaItem: (id: number) => Promise<boolean>;
  
  // CostoPorProducto methods
  getCostosPorProducto: () => Promise<CostoPorProducto[]>;
  getCostosPorProductoByProducto: (productoId: number) => Promise<CostoPorProducto[]>;
  getCostoPorProducto: (id: number) => Promise<CostoPorProducto>;
  createCostoPorProducto: (data: Partial<CostoPorProducto>) => Promise<CostoPorProducto>;
  updateCostoPorProducto: (id: number, data: Partial<CostoPorProducto>) => Promise<CostoPorProducto>;
  deleteCostoPorProducto: (id: number) => Promise<CostoPorProducto>;
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
    return from(this.api.saveProductoImage(base64Data, fileName)
      .then(result => {
        // Ensure the URL uses the app:// protocol for correct loading in renderer
        if (result.imageUrl && !result.imageUrl.startsWith('app://')) {
          result.imageUrl = `app://${result.imageUrl.replace(/\\/g, '/')}`;
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

  /**
   * Delete a presentation - this should be updated in the backend 
   * to handle cascade deletion of related entities:
   * - PreciosVenta
   * - Codigos
   * - PresentacionSabores
   * - ProductoAdicionales
   * 
   * Backend implementation should delete all child records first, then delete the presentation
   */
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

  // PrecioVenta methods
  getPreciosVenta(): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVenta());
  }

  getPrecioVenta(precioVentaId: number, active = true): Observable<PrecioVenta> {
    return from(this.api.getPrecioVenta(precioVentaId, active));
  }

  getPreciosVentaByPresentacion(presentacionId: number, active = true): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByPresentacion(presentacionId, active));
  }

  getPreciosVentaByPresentacionSabor(presentacionSaborId: number, active = true): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByPresentacionSabor(presentacionSaborId, active));
  }

  getPreciosVentaByTipoPrecio(tipoPrecioId: number, active = true): Observable<PrecioVenta[]> {
    return from(this.api.getPreciosVentaByTipoPrecio(tipoPrecioId, active));
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

  searchIngredientesByDescripcion(searchText: string): Observable<Ingrediente[]> {
    return from(this.api.searchIngredientesByDescripcion(searchText));
  }

  // RecetaVariacion methods
  getRecetaVariaciones(recetaId: number): Observable<RecetaVariacion[]> {
    return from(this.api.getRecetaVariaciones(recetaId));
  }

  getRecetaVariacion(variacionId: number): Observable<RecetaVariacion> {
    return from(this.api.getRecetaVariacion(variacionId));
  }

  createRecetaVariacion(variacionData: Partial<RecetaVariacion>): Observable<RecetaVariacion> {
    return from(this.api.createRecetaVariacion(variacionData));
  }

  updateRecetaVariacion(variacionId: number, variacionData: Partial<RecetaVariacion>): Observable<any> {
    return from(this.api.updateRecetaVariacion(variacionId, variacionData));
  }

  deleteRecetaVariacion(variacionId: number): Observable<any> {
    return from(this.api.deleteRecetaVariacion(variacionId));
  }

  getRecetaVariacionCosto(variacionId: number): Observable<number> {
    return from(this.api.getRecetaVariacionCosto(variacionId));
  }

  // RecetaVariacionItem methods
  getRecetaVariacionItems(variacionId: number): Observable<RecetaVariacionItem[]> {
    return from(this.api.getRecetaVariacionItems(variacionId));
  }

  getRecetaVariacionItem(variacionItemId: number): Observable<RecetaVariacionItem> {
    return from(this.api.getRecetaVariacionItem(variacionItemId));
  }

  createRecetaVariacionItem(variacionItemData: Partial<RecetaVariacionItem>): Observable<RecetaVariacionItem> {
    return from(this.api.createRecetaVariacionItem(variacionItemData));
  }

  updateRecetaVariacionItem(variacionItemId: number, variacionItemData: Partial<RecetaVariacionItem>): Observable<any> {
    return from(this.api.updateRecetaVariacionItem(variacionItemId, variacionItemData));
  }

  deleteRecetaVariacionItem(variacionItemId: number): Observable<any> {
    return from(this.api.deleteRecetaVariacionItem(variacionItemId));
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

  // MovimientoStock methods
  getMovimientosStock(): Observable<MovimientoStock[]> {
    return from(this.api.getMovimientosStock());
  }

  getMovimientoStock(movimientoStockId: number): Observable<MovimientoStock> {
    return from(this.api.getMovimientoStock(movimientoStockId));
  }

  getMovimientosStockByProducto(productoId: number): Observable<MovimientoStock[]> {
    return from(this.api.getMovimientosStockByProducto(productoId));
  }

  getMovimientosStockByIngrediente(ingredienteId: number): Observable<MovimientoStock[]> {
    return from(this.api.getMovimientosStockByIngrediente(ingredienteId));
  }

  getMovimientosStockByTipoReferencia(tipoReferencia: TipoReferencia): Observable<MovimientoStock[]> {
    return from(this.api.getMovimientosStockByTipoReferencia(tipoReferencia));
  }

  getCurrentStockByProducto(productoId: number): Observable<MovimientoStock> {
    return from(this.api.getCurrentStockByProducto(productoId));
  }

  getCurrentStockByIngrediente(ingredienteId: number): Observable<MovimientoStock> {
    return from(this.api.getCurrentStockByIngrediente(ingredienteId));
  }

  createMovimientoStock(movimientoStockData: any): Observable<MovimientoStock> {
    return from(this.api.createMovimientoStock(movimientoStockData));
  }

  updateMovimientoStock(movimientoStockId: number, movimientoStockData: any): Observable<any> {
    return from(this.api.updateMovimientoStock(movimientoStockId, movimientoStockData));
  }

  deleteMovimientoStock(movimientoStockId: number): Observable<any> {
    return from(this.api.deleteMovimientoStock(movimientoStockId));
  }

  getMovimientosStockByReferenciaAndTipo(referencia: number, tipoReferencia: TipoReferencia): Observable<MovimientoStock[]> {
    return from(this.api.getMovimientosStockByReferenciaAndTipo(referencia, tipoReferencia));
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

  // Venta methods
  getVentas(): Observable<Venta[]> {
    return from(this.api.getVentas());
  }

  getVentasByEstado(estado: VentaEstado): Observable<Venta[]> {
    return from(this.api.getVentasByEstado(estado));
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
  
  // Between the existing producto methods, add these new search methods
  
  searchProductos(params: { searchTerm: string, page: number, pageSize: number, exactMatch?: boolean }): 
    Observable<{ items: Producto[], total: number, exactMatch?: boolean }> {
    return from(this.api.searchProductos(params));
  }
  
  searchProductosByCode(code: string): Observable<{ product: Producto, presentacion: Presentacion } | null> {
    return from(this.api.searchProductosByCode(code));
  }
  
  // Observacion methods
  getObservaciones(): Observable<Observacion[]> {
    return from(this.api.getObservaciones());
  }

  getObservacion(id: number): Observable<Observacion> {
    return from(this.api.getObservacion(id));
  }

  createObservacion(data: Partial<Observacion>): Observable<Observacion> {
    return from(this.api.createObservacion(data));
  }

  updateObservacion(id: number, data: Partial<Observacion>): Observable<Observacion> {
    return from(this.api.updateObservacion(id, data));
  }

  deleteObservacion(id: number): Observable<boolean> {
    return from(this.api.deleteObservacion(id));
  }

  searchObservaciones(searchTerm: string, page: number, pageSize: number): Observable<Observacion[]> {
    return from(this.api.searchObservaciones(searchTerm, page, pageSize));
  }

  // ObservacionProducto methods
  getObservacionesProductos(): Observable<ObservacionProducto[]> {
    return from(this.api.getObservacionesProductos());
  }

  getObservacionesProductosByProducto(productoId: number): Observable<ObservacionProducto[]> {
    return from(this.api.getObservacionesProductosByProducto(productoId));
  }

  getObservacionProducto(id: number): Observable<ObservacionProducto> {
    return from(this.api.getObservacionProducto(id));
  }

  createObservacionProducto(data: Partial<ObservacionProducto>): Observable<{ success: boolean, data?: ObservacionProducto, error?: string, message?: string }> {
    return from(this.api.createObservacionProducto(data));
  }

  updateObservacionProducto(id: number, data: Partial<ObservacionProducto>): Observable<ObservacionProducto> {
    return from(this.api.updateObservacionProducto(id, data));
  }

  deleteObservacionProducto(id: number): Observable<boolean> {
    return from(this.api.deleteObservacionProducto(id));
  }

  // ObservacionProductoVentaItem methods
  getObservacionesProductosVentasItems(ventaItemId: number): Observable<ObservacionProductoVentaItem[]> {
    return from(this.api.getObservacionesProductosVentasItems(ventaItemId));
  }

  getObservacionProductoVentaItem(id: number): Observable<ObservacionProductoVentaItem> {
    return from(this.api.getObservacionProductoVentaItem(id));
  }

  createObservacionProductoVentaItem(data: Partial<ObservacionProductoVentaItem>): Observable<ObservacionProductoVentaItem> {
    return from(this.api.createObservacionProductoVentaItem(data));
  }

  updateObservacionProductoVentaItem(id: number, data: Partial<ObservacionProductoVentaItem>): Observable<ObservacionProductoVentaItem> {
    return from(this.api.updateObservacionProductoVentaItem(id, data));
  }

  deleteObservacionProductoVentaItem(id: number): Observable<boolean> {
    return from(this.api.deleteObservacionProductoVentaItem(id));
  }

  // Adicional methods
  getAdicionales(): Observable<Adicional[]> {
    return from(this.api.getAdicionales());
  }

  getAdicional(id: number): Observable<Adicional> {
    return from(this.api.getAdicional(id));
  }

  getAdicionalesFiltered(filters: {
    nombre?: string;
    ingredienteId?: number;
    recetaId?: number;
    monedaId?: number;
    activo?: boolean;
    pageIndex?: number;
    pageSize?: number;
  }): Observable<{items: Adicional[], total: number}> {
    return from(this.api.getAdicionalesFiltered(filters));
  }

  createAdicional(data: Partial<Adicional>): Observable<Adicional> {
    return from(this.api.createAdicional(data));
  }

  updateAdicional(id: number, data: Partial<Adicional>): Observable<any> {
    return from(this.api.updateAdicional(id, data));
  }

  deleteAdicional(id: number): Observable<boolean> {
    return from(this.api.deleteAdicional(id));
  }

  // ProductoAdicional methods
  getProductosAdicionales(): Observable<ProductoAdicional[]> {
    return from(this.api.getProductosAdicionales());
  }

  getProductosAdicionalesByProducto(productoId: number): Observable<ProductoAdicional[]> {
    return from(this.api.getProductosAdicionalesByProducto(productoId));
  }

  getProductosAdicionalesByPresentacion(presentacionId: number): Observable<ProductoAdicional[]> {
    return from(this.api.getProductosAdicionalesByPresentacion(presentacionId));
  }

  getProductoAdicional(id: number): Observable<ProductoAdicional> {
    return from(this.api.getProductoAdicional(id));
  }

  // add error handling like in createObservacionProducto 
  createProductoAdicional(data: Partial<ProductoAdicional>): Observable<{ success: boolean, data?: ProductoAdicional, error?: string, message?: string }> {
    return from(this.api.createProductoAdicional(data));
  }

  updateProductoAdicional(id: number, data: Partial<ProductoAdicional>): Observable<ProductoAdicional> {
    return from(this.api.updateProductoAdicional(id, data));
  }

  deleteProductoAdicional(id: number): Observable<boolean> {
    return from(this.api.deleteProductoAdicional(id));
  }

  // ProductoAdicionalVentaItem methods
  getProductosAdicionalesVentasItems(ventaItemId: number): Observable<ProductoAdicionalVentaItem[]> {
    return from(this.api.getProductosAdicionalesVentasItems(ventaItemId));
  }

  getProductoAdicionalVentaItem(id: number): Observable<ProductoAdicionalVentaItem> {
    return from(this.api.getProductoAdicionalVentaItem(id));
  }

  createProductoAdicionalVentaItem(data: Partial<ProductoAdicionalVentaItem>): Observable<ProductoAdicionalVentaItem> {
    return from(this.api.createProductoAdicionalVentaItem(data));
  }

  updateProductoAdicionalVentaItem(id: number, data: Partial<ProductoAdicionalVentaItem>): Observable<ProductoAdicionalVentaItem> {
    return from(this.api.updateProductoAdicionalVentaItem(id, data));
  }

  deleteProductoAdicionalVentaItem(id: number): Observable<boolean> {
    return from(this.api.deleteProductoAdicionalVentaItem(id));
  }

  /**
   * Search ingredientes by name
   * @param query The search string
   * @returns Observable with filtered list of ingredientes
   */
  searchIngredientes(query: string): Observable<Ingrediente[]> {
    // Assuming api is an instance of ElectronService or similar
    // that handles the database operations
    return from(this.api.searchIngredientesByDescripcion(query));
  }

  /**
   * Search recetas by name
   * @param query The search string
   * @returns Observable with filtered list of recetas
   */
  searchRecetas(query: string): Observable<Receta[]> {
    // Assuming api is an instance of ElectronService or similar
    // that handles the database operations
    return from(this.api.searchRecetasByNombre(query));
  }

  // CostoPorProducto methods
  getCostosPorProducto(): Observable<CostoPorProducto[]> {
    return from(this.api.getCostosPorProducto());
  }
  
  getCostosPorProductoByProducto(productoId: number): Observable<CostoPorProducto[]> {
    return from(this.api.getCostosPorProductoByProducto(productoId));
  }
  
  getCostoPorProducto(id: number): Observable<CostoPorProducto> {
    return from(this.api.getCostoPorProducto(id));
  }
  
  createCostoPorProducto(data: Partial<CostoPorProducto>): Observable<CostoPorProducto> {
    return from(this.api.createCostoPorProducto(data));
  }
  
  updateCostoPorProducto(id: number, data: Partial<CostoPorProducto>): Observable<CostoPorProducto> {
    return from(this.api.updateCostoPorProducto(id, data));
  }
  
  deleteCostoPorProducto(id: number): Observable<CostoPorProducto> {
    return from(this.api.deleteCostoPorProducto(id));
  }
}
