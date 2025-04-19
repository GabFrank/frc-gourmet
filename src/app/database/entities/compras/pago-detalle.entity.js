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
exports.PagoDetalle = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const moneda_entity_1 = require("../financiero/moneda.entity");
const forma_pago_entity_1 = require("./forma-pago.entity");
/**
 * Entity representing payment details for supplier payments
 */
let PagoDetalle = class PagoDetalle extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], PagoDetalle.prototype, "valor", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], PagoDetalle.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], PagoDetalle.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Pago', 'detalles', {
        createForeignKeyConstraints: false
    }),
    (0, typeorm_1.JoinColumn)({ name: 'pago_id' }),
    __metadata("design:type", Function)
], PagoDetalle.prototype, "pago", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => moneda_entity_1.Moneda),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", moneda_entity_1.Moneda)
], PagoDetalle.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => forma_pago_entity_1.FormasPago),
    (0, typeorm_1.JoinColumn)({ name: 'forma_pago_id' }),
    __metadata("design:type", forma_pago_entity_1.FormasPago)
], PagoDetalle.prototype, "formaPago", void 0);
PagoDetalle = __decorate([
    (0, typeorm_1.Entity)('pagos_detalles')
], PagoDetalle);
exports.PagoDetalle = PagoDetalle;
//# sourceMappingURL=pago-detalle.entity.js.map