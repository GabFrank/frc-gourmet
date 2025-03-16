// Export base entity first
export { BaseModel } from './base.entity';

// Export enums
export { DocumentoTipo } from './personas/documento-tipo.enum';
export { PersonaTipo } from './personas/persona-tipo.enum';

// Export basic entities
export { Category } from './category.entity';
export { Product } from './product.entity';
export { Order } from './order.entity';
export { OrderItem } from './order-item.entity';
export { Printer } from './printer.entity';

// Export persona-related entities in correct dependency order
export { Persona } from './personas/persona.entity';
export { Usuario } from './personas/usuario.entity';
export { Role } from './personas/role.entity';
export { UsuarioRole } from './personas/usuario-role.entity';
export { TipoCliente } from './personas/tipo-cliente.entity';
export { Cliente } from './personas/cliente.entity'; 