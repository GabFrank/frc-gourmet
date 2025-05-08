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
const printer_entity_1 = require("./entities/printer.entity");
const persona_entity_1 = require("./entities/personas/persona.entity");
const usuario_entity_1 = require("./entities/personas/usuario.entity");
const role_entity_1 = require("./entities/personas/role.entity");
const usuario_role_entity_1 = require("./entities/personas/usuario-role.entity");
const tipo_cliente_entity_1 = require("./entities/personas/tipo-cliente.entity");
const cliente_entity_1 = require("./entities/personas/cliente.entity");
const login_session_entity_1 = require("./entities/auth/login-session.entity");
const categoria_entity_1 = require("./entities/productos/categoria.entity");
const subcategoria_entity_1 = require("./entities/productos/subcategoria.entity");
const producto_entity_1 = require("./entities/productos/producto.entity");
const producto_image_entity_1 = require("./entities/productos/producto-image.entity");
const presentacion_entity_1 = require("./entities/productos/presentacion.entity");
const codigo_entity_1 = require("./entities/productos/codigo.entity");
const precio_venta_entity_1 = require("./entities/productos/precio-venta.entity");
const moneda_entity_1 = require("./entities/financiero/moneda.entity");
const tipo_precio_entity_1 = require("./entities/financiero/tipo-precio.entity");
const sabor_entity_1 = require("./entities/productos/sabor.entity");
const presentacion_sabor_entity_1 = require("./entities/productos/presentacion-sabor.entity");
const ingrediente_entity_1 = require("./entities/productos/ingrediente.entity");
const receta_entity_1 = require("./entities/productos/receta.entity");
const receta_item_entity_1 = require("./entities/productos/receta-item.entity");
const receta_variacion_entity_1 = require("./entities/productos/receta-variacion.entity");
const receta_variacion_item_entity_1 = require("./entities/productos/receta-variacion-item.entity");
const combo_entity_1 = require("./entities/productos/combo.entity");
const combo_item_entity_1 = require("./entities/productos/combo-item.entity");
const intercambio_ingrediente_entity_1 = require("./entities/productos/intercambio-ingrediente.entity");
// Import the new entities
const observacion_entity_1 = require("./entities/productos/observacion.entity");
const observacion_producto_entity_1 = require("./entities/productos/observacion-producto.entity");
const observacion_producto_venta_item_entity_1 = require("./entities/productos/observacion-producto-venta-item.entity");
const adicional_entity_1 = require("./entities/productos/adicional.entity");
const producto_adicional_entity_1 = require("./entities/productos/producto-adicional.entity");
const producto_adicional_venta_item_entity_1 = require("./entities/productos/producto-adicional-venta-item.entity");
// Import new financial entities
const moneda_billete_entity_1 = require("./entities/financiero/moneda-billete.entity");
const dispositivo_entity_1 = require("./entities/financiero/dispositivo.entity");
const conteo_entity_1 = require("./entities/financiero/conteo.entity");
const conteo_detalle_entity_1 = require("./entities/financiero/conteo-detalle.entity");
const caja_entity_1 = require("./entities/financiero/caja.entity");
const caja_moneda_entity_1 = require("./entities/financiero/caja-moneda.entity");
const moneda_cambio_entity_1 = require("./entities/financiero/moneda-cambio.entity");
// Import compras entities
const proveedor_entity_1 = require("./entities/compras/proveedor.entity");
const pago_entity_1 = require("./entities/compras/pago.entity");
const pago_detalle_entity_1 = require("./entities/compras/pago-detalle.entity");
const compra_entity_1 = require("./entities/compras/compra.entity");
const compra_detalle_entity_1 = require("./entities/compras/compra-detalle.entity");
const proveedor_producto_entity_1 = require("./entities/compras/proveedor-producto.entity");
const forma_pago_entity_1 = require("./entities/compras/forma-pago.entity");
const movimiento_stock_entity_1 = require("./entities/productos/movimiento-stock.entity");
// Import new migration
const _1624098765432_AddColumnsToConteo_1 = require("./migrations/1624098765432-AddColumnsToConteo");
// Import new PDV entities
const precio_delivery_entity_1 = require("./entities/ventas/precio-delivery.entity");
const delivery_entity_1 = require("./entities/ventas/delivery.entity");
const venta_entity_1 = require("./entities/ventas/venta.entity");
const venta_item_entity_1 = require("./entities/ventas/venta-item.entity");
const pdv_grupo_categoria_entity_1 = require("./entities/ventas/pdv-grupo-categoria.entity");
const pdv_categoria_entity_1 = require("./entities/ventas/pdv-categoria.entity");
const pdv_categoria_item_entity_1 = require("./entities/ventas/pdv-categoria-item.entity");
const pdv_item_producto_entity_1 = require("./entities/ventas/pdv-item-producto.entity");
const pdv_config_entity_1 = require("./entities/ventas/pdv-config.entity");
// Import new entities for Mesas, Reservas, and Comandas
const pdv_mesa_entity_1 = require("./entities/ventas/pdv-mesa.entity");
const reserva_entity_1 = require("./entities/ventas/reserva.entity");
const comanda_entity_1 = require("./entities/ventas/comanda.entity");
const sector_entity_1 = require("./entities/ventas/sector.entity");
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
            printer_entity_1.Printer,
            persona_entity_1.Persona,
            usuario_entity_1.Usuario,
            role_entity_1.Role,
            usuario_role_entity_1.UsuarioRole,
            tipo_cliente_entity_1.TipoCliente,
            cliente_entity_1.Cliente,
            login_session_entity_1.LoginSession,
            categoria_entity_1.Categoria,
            subcategoria_entity_1.Subcategoria,
            producto_entity_1.Producto,
            producto_image_entity_1.ProductoImage,
            // Product entities
            presentacion_entity_1.Presentacion,
            codigo_entity_1.Codigo,
            precio_venta_entity_1.PrecioVenta,
            moneda_entity_1.Moneda,
            tipo_precio_entity_1.TipoPrecio,
            // New entities
            sabor_entity_1.Sabor,
            presentacion_sabor_entity_1.PresentacionSabor,
            ingrediente_entity_1.Ingrediente,
            receta_entity_1.Receta,
            receta_item_entity_1.RecetaItem,
            receta_variacion_entity_1.RecetaVariacion,
            receta_variacion_item_entity_1.RecetaVariacionItem,
            combo_entity_1.Combo,
            combo_item_entity_1.ComboItem,
            intercambio_ingrediente_entity_1.IntercambioIngrediente,
            // New observation and additional entities
            observacion_entity_1.Observacion,
            observacion_producto_entity_1.ObservacionProducto,
            observacion_producto_venta_item_entity_1.ObservacionProductoVentaItem,
            adicional_entity_1.Adicional,
            producto_adicional_entity_1.ProductoAdicional,
            producto_adicional_venta_item_entity_1.ProductoAdicionalVentaItem,
            // New financial entities
            moneda_billete_entity_1.MonedaBillete,
            dispositivo_entity_1.Dispositivo,
            conteo_entity_1.Conteo,
            conteo_detalle_entity_1.ConteoDetalle,
            caja_entity_1.Caja,
            caja_moneda_entity_1.CajaMoneda,
            moneda_cambio_entity_1.MonedaCambio,
            // Compras entities
            proveedor_entity_1.Proveedor,
            pago_entity_1.Pago,
            pago_detalle_entity_1.PagoDetalle,
            compra_entity_1.Compra,
            compra_detalle_entity_1.CompraDetalle,
            proveedor_producto_entity_1.ProveedorProducto,
            forma_pago_entity_1.FormasPago,
            movimiento_stock_entity_1.MovimientoStock,
            // Ventas entities
            precio_delivery_entity_1.PrecioDelivery,
            delivery_entity_1.Delivery,
            venta_entity_1.Venta,
            venta_item_entity_1.VentaItem,
            // PDV entities
            pdv_grupo_categoria_entity_1.PdvGrupoCategoria,
            pdv_categoria_entity_1.PdvCategoria,
            pdv_categoria_item_entity_1.PdvCategoriaItem,
            pdv_item_producto_entity_1.PdvItemProducto,
            pdv_config_entity_1.PdvConfig,
            // Mesa, Reserva, and Comanda entities
            pdv_mesa_entity_1.PdvMesa,
            reserva_entity_1.Reserva,
            comanda_entity_1.Comanda,
            sector_entity_1.Sector
        ],
        synchronize: true,
        logging: process.env['NODE_ENV'] === 'development',
        migrations: [
            // ... other migrations
            _1624098765432_AddColumnsToConteo_1.AddColumnsToConteo1624098765432
        ],
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