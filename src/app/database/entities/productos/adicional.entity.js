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
exports.Adicional = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing an additional item for products
 */
let Adicional = class Adicional extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Adicional.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ingrediente_id', nullable: true }),
    __metadata("design:type", Number)
], Adicional.prototype, "ingredienteId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Ingrediente', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_id' }),
    __metadata("design:type", Function)
], Adicional.prototype, "ingrediente", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receta_id', nullable: true }),
    __metadata("design:type", Number)
], Adicional.prototype, "recetaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Receta', { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'receta_id' }),
    __metadata("design:type", Function)
], Adicional.prototype, "receta", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'precio_venta_unitario', type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], Adicional.prototype, "precioVentaUnitario", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cantidad_default', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Adicional.prototype, "cantidadDefault", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'moneda_id', nullable: true }),
    __metadata("design:type", Number)
], Adicional.prototype, "monedaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Moneda', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", Function)
], Adicional.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Adicional.prototype, "activo", void 0);
Adicional = __decorate([
    (0, typeorm_1.Entity)('adicionales')
], Adicional);
exports.Adicional = Adicional;
//# sourceMappingURL=adicional.entity.js.map