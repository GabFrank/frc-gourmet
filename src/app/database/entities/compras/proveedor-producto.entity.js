"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProveedorProducto = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const ingrediente_entity_1 = require("../productos/ingrediente.entity");
const producto_entity_1 = require("../productos/producto.entity");
/**
 * Entity representing the relationship between suppliers and products/ingredients
 */
let ProveedorProducto = class ProveedorProducto extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ProveedorProducto.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Proveedor', 'proveedorProductos', {
        createForeignKeyConstraints: false
    }),
    (0, typeorm_1.JoinColumn)({ name: 'proveedor_id' }),
    __metadata("design:type", Function)
], ProveedorProducto.prototype, "proveedor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => producto_entity_1.Producto, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", producto_entity_1.Producto)
], ProveedorProducto.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ingrediente_entity_1.Ingrediente, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_id' }),
    __metadata("design:type", ingrediente_entity_1.Ingrediente)
], ProveedorProducto.prototype, "ingrediente", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Compra', '', {
        nullable: true,
        createForeignKeyConstraints: false
    }),
    (0, typeorm_1.JoinColumn)({ name: 'compra_id' }),
    __metadata("design:type", Function)
], ProveedorProducto.prototype, "compra", void 0);
ProveedorProducto = __decorate([
    (0, typeorm_1.Entity)('proveedores_productos')
], ProveedorProducto);
exports.ProveedorProducto = ProveedorProducto;
//# sourceMappingURL=proveedor-producto.entity.js.map