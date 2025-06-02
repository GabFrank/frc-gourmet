import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import * as electron from 'electron';

// Import all entities
import { Printer } from './entities/printer.entity';
import { Persona } from './entities/personas/persona.entity';
import { Usuario } from './entities/personas/usuario.entity';
import { Role } from './entities/personas/role.entity';
import { UsuarioRole } from './entities/personas/usuario-role.entity';
import { TipoCliente } from './entities/personas/tipo-cliente.entity';
import { Cliente } from './entities/personas/cliente.entity';
import { LoginSession } from './entities/auth/login-session.entity';

// OLD PRODUCT ENTITIES (commented temporarily until migration)
// import { Categoria } from './entities/productos/categoria.entity';
// import { Subcategoria } from './entities/productos/subcategoria.entity';
// import { Producto } from './entities/productos/producto.entity';
// import { ProductoImage } from './entities/productos/producto-image.entity';
// import { Presentacion } from './entities/productos/presentacion.entity';
// import { Codigo } from './entities/productos/codigo.entity';
// import { Sabor } from './entities/productos/sabor.entity';
// import { PresentacionSabor } from './entities/productos/presentacion-sabor.entity';
// import { Receta } from './entities/productos/receta.entity';
// import { RecetaItem } from './entities/productos/receta-item.entity';
// import { RecetaVariacion } from './entities/productos/receta-variacion.entity';
// import { RecetaVariacionItem } from './entities/productos/receta-variacion-item.entity';
// import { IntercambioIngrediente } from './entities/productos/intercambio-ingrediente.entity';
// import { MovimientoStock } from './entities/productos/movimiento-stock.entity';

// NEW PRODUCT ARCHITECTURE
// Core entities
import { ProductoBase } from './entities/productos/core/producto-base.entity';
import { UnidadMedida } from './entities/productos/core/unidad-medida.entity';
import { Ingrediente } from './entities/productos/core/ingrediente.entity';

// Variaciones
import { ProductoVariacion } from './entities/productos/variaciones/producto-variacion.entity';

// Recetas
import { Receta } from './entities/productos/recetas/receta.entity';
import { RecetaItem } from './entities/productos/recetas/receta-item.entity';

// Comercial
import { ProductoPresentacion } from './entities/productos/comercial/producto-presentacion.entity';
import { PrecioVenta } from './entities/productos/comercial/precio-venta.entity';
import { Combo } from './entities/productos/comercial/combo.entity';
import { ComboItem } from './entities/productos/comercial/combo-item.entity';

// Observaciones
import { Observacion } from './entities/productos/observaciones/observacion.entity';

// Legacy observation and additional entities (commented temporarily)
// import { ObservacionProducto } from './entities/productos/observacion-producto.entity';
// import { ObservacionProductoVentaItem } from './entities/productos/observacion-producto-venta-item.entity';
// import { GrupoObservacion } from './entities/productos/grupo-observacion.entity';
// import { GrupoObservacionDetalle } from './entities/productos/grupo-observacion-detalle.entity';
// import { Adicional } from './entities/productos/adicional.entity';
// import { ProductoAdicional } from './entities/productos/producto-adicional.entity';
// import { ProductoAdicionalVentaItem } from './entities/productos/producto-adicional-venta-item.entity';
// import { CostoPorProducto } from './entities/productos/costo-por-producto.entity';

// Import new financial entities
import { Moneda } from './entities/financiero/moneda.entity';
import { TipoPrecio } from './entities/financiero/tipo-precio.entity';
import { MonedaBillete } from './entities/financiero/moneda-billete.entity';
import { Dispositivo } from './entities/financiero/dispositivo.entity';
import { Conteo } from './entities/financiero/conteo.entity';
import { ConteoDetalle } from './entities/financiero/conteo-detalle.entity';
import { Caja } from './entities/financiero/caja.entity';
import { CajaMoneda } from './entities/financiero/caja-moneda.entity';
import { MonedaCambio } from './entities/financiero/moneda-cambio.entity';

// Import compras entities
import { Proveedor } from './entities/compras/proveedor.entity';
import { Pago } from './entities/compras/pago.entity';
import { PagoDetalle } from './entities/compras/pago-detalle.entity';
import { Compra } from './entities/compras/compra.entity';
import { CompraDetalle } from './entities/compras/compra-detalle.entity';
import { ProveedorProducto } from './entities/compras/proveedor-producto.entity';
import { FormasPago } from './entities/compras/forma-pago.entity';

// Import new migration
import { AddColumnsToConteo1624098765432 } from './migrations/1624098765432-AddColumnsToConteo';

// Import new PDV entities
import { PrecioDelivery } from './entities/ventas/precio-delivery.entity';
import { Delivery } from './entities/ventas/delivery.entity';
import { Venta } from './entities/ventas/venta.entity';
import { VentaItem } from './entities/ventas/venta-item.entity';
import { PdvGrupoCategoria } from './entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from './entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from './entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from './entities/ventas/pdv-item-producto.entity';
import { PdvConfig } from './entities/ventas/pdv-config.entity';
// Import new entities for Mesas, Reservas, and Comandas
import { PdvMesa } from './entities/ventas/pdv-mesa.entity';
import { Reserva } from './entities/ventas/reserva.entity';
import { Comanda } from './entities/ventas/comanda.entity';
import { Sector } from './entities/ventas/sector.entity';

/**
 * Get the configuration for TypeORM
 * @param userDataPath Path to store the database file
 * @returns DataSourceOptions for TypeORM configuration
 */
export function getDataSourceOptions(userDataPath: string): DataSourceOptions {
  return {
    type: 'sqlite',
    database: path.join(userDataPath, 'frc-gourmet.db'),
    entities: [
      // Base entities
      Printer,
      Persona,
      Usuario,
      Role,
      UsuarioRole,
      TipoCliente,
      Cliente,
      LoginSession,
      
      // Financial entities
      Moneda,
      TipoPrecio,
      MonedaBillete,
      Dispositivo,
      Conteo,
      ConteoDetalle,
      Caja,
      CajaMoneda,
      MonedaCambio,
      
      // OLD Product entities (commented temporarily until migration)
      // Categoria,
      // Subcategoria,
      // Producto,
      // ProductoImage,
      // Presentacion,
      // Codigo,
      // Sabor,
      // PresentacionSabor,
      // Receta,
      // RecetaItem,
      // RecetaVariacion,
      // RecetaVariacionItem,
      // IntercambioIngrediente,
      // MovimientoStock,
      
      // NEW Product Architecture
      // Core
      UnidadMedida,
      ProductoBase,
      Ingrediente,
      
      // Variaciones
      ProductoVariacion,
      
      // Recetas
      Receta,
      RecetaItem,
      
      // Comercial
      ProductoPresentacion,
      PrecioVenta,
      Combo,
      ComboItem,
      
      // Observaciones
      Observacion,
      
      // Legacy observation and additional entities (commented temporarily)
      // ObservacionProducto,
      // ObservacionProductoVentaItem,
      // GrupoObservacion,
      // GrupoObservacionDetalle,
      // Adicional,
      // ProductoAdicional,
      // ProductoAdicionalVentaItem,
      // CostoPorProducto,
      
      // Compras entities
      Proveedor,
      Pago,
      PagoDetalle,
      Compra,
      CompraDetalle,
      ProveedorProducto,
      FormasPago,
      
      // Ventas entities
      PrecioDelivery,
      Delivery,
      Venta,
      VentaItem,
      
      // PDV entities
      PdvGrupoCategoria,
      PdvCategoria,
      PdvCategoriaItem,
      PdvItemProducto,
      PdvConfig,
      
      // Mesa, Reserva, and Comanda entities
      PdvMesa,
      Reserva,
      Comanda,
      Sector
    ],
    synchronize: true, // Automatically creates tables in development
    logging: process.env['NODE_ENV'] === 'development',
    migrations: [
      // ... other migrations
      AddColumnsToConteo1624098765432
    ],
  };
}

/**
 * Create a new TypeORM DataSource
 * @param userDataPath Path to store the database file
 * @returns Promise with DataSource
 */
export function createDataSource(userDataPath: string): Promise<DataSource> {
  const dataSource = new DataSource(getDataSourceOptions(userDataPath));
  return dataSource.initialize();
}
