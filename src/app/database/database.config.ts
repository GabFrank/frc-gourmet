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
import { Categoria } from './entities/productos/categoria.entity';
import { Subcategoria } from './entities/productos/subcategoria.entity';
import { Producto } from './entities/productos/producto.entity';
import { ProductoImage } from './entities/productos/producto-image.entity';
import { Presentacion } from './entities/productos/presentacion.entity';
import { Codigo } from './entities/productos/codigo.entity';
import { PrecioVenta } from './entities/productos/precio-venta.entity';
import { Moneda } from './entities/financiero/moneda.entity';
import { TipoPrecio } from './entities/financiero/tipo-precio.entity';
import { Sabor } from './entities/productos/sabor.entity';
import { PresentacionSabor } from './entities/productos/presentacion-sabor.entity';
import { Ingrediente } from './entities/productos/ingrediente.entity';
import { Receta } from './entities/productos/receta.entity';
import { RecetaItem } from './entities/productos/receta-item.entity';
import { RecetaVariacion } from './entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from './entities/productos/receta-variacion-item.entity';
import { Combo } from './entities/productos/combo.entity';
import { ComboItem } from './entities/productos/combo-item.entity';
import { IntercambioIngrediente } from './entities/productos/intercambio-ingrediente.entity';

// Import new financial entities
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
      // Entity classes
      Printer,
      Persona,
      Usuario,
      Role,
      UsuarioRole,
      TipoCliente,
      Cliente,
      LoginSession,
      Categoria,
      Subcategoria,
      Producto,
      ProductoImage,
      // Product entities
      Presentacion,
      Codigo,
      PrecioVenta,
      Moneda,
      TipoPrecio,
      // New entities
      Sabor,
      PresentacionSabor,
      Ingrediente,
      Receta,
      RecetaItem,
      RecetaVariacion,
      RecetaVariacionItem,
      Combo,
      ComboItem,
      IntercambioIngrediente,
      // New financial entities
      MonedaBillete,
      Dispositivo,
      Conteo,
      ConteoDetalle,
      Caja,
      CajaMoneda,
      MonedaCambio,
      // Compras entities
      Proveedor,
      Pago,
      PagoDetalle,
      Compra,
      CompraDetalle,
      ProveedorProducto,
      FormasPago
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
