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
exports.CostoPorProducto = exports.OrigenCosto = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const producto_entity_1 = require("./producto.entity");
const moneda_entity_1 = require("../financiero/moneda.entity");
/**
 * Origen del costo para un producto
 */
var OrigenCosto;
(function (OrigenCosto) {
    OrigenCosto["COMPRA"] = "COMPRA";
    OrigenCosto["MANUAL"] = "MANUAL";
})(OrigenCosto = exports.OrigenCosto || (exports.OrigenCosto = {}));
/**
 * Entity representing a product cost
 */
let CostoPorProducto = class CostoPorProducto extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_id' }),
    __metadata("design:type", Number)
], CostoPorProducto.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => producto_entity_1.Producto, producto => producto.costos, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", producto_entity_1.Producto)
], CostoPorProducto.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        name: 'origen_costo',
        enum: OrigenCosto,
        default: OrigenCosto.MANUAL
    }),
    __metadata("design:type", String)
], CostoPorProducto.prototype, "origenCosto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'moneda_id' }),
    __metadata("design:type", Number)
], CostoPorProducto.prototype, "monedaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => moneda_entity_1.Moneda, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", moneda_entity_1.Moneda)
], CostoPorProducto.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], CostoPorProducto.prototype, "valor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], CostoPorProducto.prototype, "principal", void 0);
CostoPorProducto = __decorate([
    (0, typeorm_1.Entity)('costos_por_producto')
], CostoPorProducto);
exports.CostoPorProducto = CostoPorProducto;
//# sourceMappingURL=costo-por-producto.entity.js.map