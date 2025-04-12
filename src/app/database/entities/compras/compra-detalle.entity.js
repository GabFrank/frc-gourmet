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
exports.CompraDetalle = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const ingrediente_entity_1 = require("../productos/ingrediente.entity");
const presentacion_entity_1 = require("../productos/presentacion.entity");
const producto_entity_1 = require("../productos/producto.entity");
/**
 * Entity representing purchase details
 */
let CompraDetalle = class CompraDetalle extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], CompraDetalle.prototype, "cantidad", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], CompraDetalle.prototype, "valor", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], CompraDetalle.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], CompraDetalle.prototype, "tipo_medida", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Compra', 'detalles', {
        createForeignKeyConstraints: false
    }),
    (0, typeorm_1.JoinColumn)({ name: 'compra_id' }),
    __metadata("design:type", Function)
], CompraDetalle.prototype, "compra", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => producto_entity_1.Producto, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", producto_entity_1.Producto)
], CompraDetalle.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => ingrediente_entity_1.Ingrediente, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_id' }),
    __metadata("design:type", ingrediente_entity_1.Ingrediente)
], CompraDetalle.prototype, "ingrediente", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => presentacion_entity_1.Presentacion, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_id' }),
    __metadata("design:type", presentacion_entity_1.Presentacion)
], CompraDetalle.prototype, "presentacion", void 0);
CompraDetalle = __decorate([
    (0, typeorm_1.Entity)('compras_detalles')
], CompraDetalle);
exports.CompraDetalle = CompraDetalle;
//# sourceMappingURL=compra-detalle.entity.js.map