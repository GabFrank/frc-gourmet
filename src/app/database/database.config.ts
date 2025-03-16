import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import * as electron from 'electron';

// Import all entities
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Printer } from './entities/printer.entity';
import { Persona } from './entities/personas/persona.entity';
import { Usuario } from './entities/personas/usuario.entity';
import { Role } from './entities/personas/role.entity';
import { UsuarioRole } from './entities/personas/usuario-role.entity';
import { TipoCliente } from './entities/personas/tipo-cliente.entity';
import { Cliente } from './entities/personas/cliente.entity';
import { LoginSession } from './entities/auth/login-session.entity';

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
      Category,
      Product,
      Order,
      OrderItem,
      Printer,
      Persona,
      Usuario,
      Role,
      UsuarioRole,
      TipoCliente,
      Cliente,
      LoginSession
    ],
    synchronize: true, // Automatically creates tables in development
    logging: process.env['NODE_ENV'] === 'development',
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