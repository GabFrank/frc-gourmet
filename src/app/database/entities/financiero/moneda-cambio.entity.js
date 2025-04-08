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
exports.MonedaCambio = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const moneda_entity_1 = require("./moneda.entity");
/**
 * Entity representing an exchange rate between two currencies
 */
let MonedaCambio = class MonedaCambio extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)(() => moneda_entity_1.Moneda, { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_origen_id' }),
    __metadata("design:type", moneda_entity_1.Moneda)
], MonedaCambio.prototype, "monedaOrigen", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => moneda_entity_1.Moneda, { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_destino_id' }),
    __metadata("design:type", moneda_entity_1.Moneda)
], MonedaCambio.prototype, "monedaDestino", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 12, scale: 4 }),
    __metadata("design:type", Number)
], MonedaCambio.prototype, "compraOficial", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 12, scale: 4 }),
    __metadata("design:type", Number)
], MonedaCambio.prototype, "ventaOficial", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 12, scale: 4 }),
    __metadata("design:type", Number)
], MonedaCambio.prototype, "compraLocal", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 12, scale: 4 }),
    __metadata("design:type", Number)
], MonedaCambio.prototype, "ventaLocal", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], MonedaCambio.prototype, "activo", void 0);
MonedaCambio = __decorate([
    (0, typeorm_1.Entity)('monedas_cambio')
], MonedaCambio);
exports.MonedaCambio = MonedaCambio;
//# sourceMappingURL=moneda-cambio.entity.js.map