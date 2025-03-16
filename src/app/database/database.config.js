"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDataSource = exports.getDataSourceOptions = void 0;
const typeorm_1 = require("typeorm");
const path = __importStar(require("path"));
// Import all entities
const category_entity_1 = require("./entities/category.entity");
const product_entity_1 = require("./entities/product.entity");
const order_entity_1 = require("./entities/order.entity");
const order_item_entity_1 = require("./entities/order-item.entity");
const printer_entity_1 = require("./entities/printer.entity");
const persona_entity_1 = require("./entities/personas/persona.entity");
const usuario_entity_1 = require("./entities/personas/usuario.entity");
const role_entity_1 = require("./entities/personas/role.entity");
const usuario_role_entity_1 = require("./entities/personas/usuario-role.entity");
const tipo_cliente_entity_1 = require("./entities/personas/tipo-cliente.entity");
const cliente_entity_1 = require("./entities/personas/cliente.entity");
const login_session_entity_1 = require("./entities/auth/login-session.entity");
/**
 * Get the configuration for TypeORM
 * @param userDataPath Path to store the database file
 * @returns DataSourceOptions for TypeORM configuration
 */
function getDataSourceOptions(userDataPath) {
    return {
        type: 'sqlite',
        database: path.join(userDataPath, 'frc-gourmet.db'),
        entities: [
            // Entity classes
            category_entity_1.Category,
            product_entity_1.Product,
            order_entity_1.Order,
            order_item_entity_1.OrderItem,
            printer_entity_1.Printer,
            persona_entity_1.Persona,
            usuario_entity_1.Usuario,
            role_entity_1.Role,
            usuario_role_entity_1.UsuarioRole,
            tipo_cliente_entity_1.TipoCliente,
            cliente_entity_1.Cliente,
            login_session_entity_1.LoginSession
        ],
        synchronize: true,
        logging: process.env['NODE_ENV'] === 'development',
    };
}
exports.getDataSourceOptions = getDataSourceOptions;
/**
 * Create a new TypeORM DataSource
 * @param userDataPath Path to store the database file
 * @returns Promise with DataSource
 */
function createDataSource(userDataPath) {
    const dataSource = new typeorm_1.DataSource(getDataSourceOptions(userDataPath));
    return dataSource.initialize();
}
exports.createDataSource = createDataSource;
//# sourceMappingURL=database.config.js.map