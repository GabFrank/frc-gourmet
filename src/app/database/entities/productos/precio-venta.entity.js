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
exports.PrecioVenta = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const moneda_entity_1 = require("../financiero/moneda.entity");
const tipo_precio_entity_1 = require("../financiero/tipo-precio.entity");
/**
 * Entity representing a product sale price
 */
let PrecioVenta = class PrecioVenta extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'presentacion_id', nullable: true }),
    __metadata("design:type", Number)
], PrecioVenta.prototype, "presentacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Presentacion', 'preciosVenta', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_id' }),
    __metadata("design:type", Function)
], PrecioVenta.prototype, "presentacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'presentacion_sabor_id', nullable: true }),
    __metadata("design:type", Number)
], PrecioVenta.prototype, "presentacionSaborId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('PresentacionSabor', 'preciosVenta', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_sabor_id' }),
    __metadata("design:type", Function)
], PrecioVenta.prototype, "presentacionSabor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'combo_id', nullable: true }),
    __metadata("design:type", Number)
], PrecioVenta.prototype, "comboId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Combo', 'preciosVenta', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'combo_id' }),
    __metadata("design:type", Function)
], PrecioVenta.prototype, "combo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'moneda_id' }),
    __metadata("design:type", Number)
], PrecioVenta.prototype, "monedaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Moneda'),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", moneda_entity_1.Moneda)
], PrecioVenta.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'tipo_precio_id', nullable: true }),
    __metadata("design:type", Number)
], PrecioVenta.prototype, "tipoPrecioId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => tipo_precio_entity_1.TipoPrecio, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'tipo_precio_id' }),
    __metadata("design:type", tipo_precio_entity_1.TipoPrecio)
], PrecioVenta.prototype, "tipoPrecio", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], PrecioVenta.prototype, "valor", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], PrecioVenta.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], PrecioVenta.prototype, "principal", void 0);
PrecioVenta = __decorate([
    (0, typeorm_1.Entity)('producto_precios_venta')
], PrecioVenta);
exports.PrecioVenta = PrecioVenta;
//# sourceMappingURL=precio-venta.entity.js.map