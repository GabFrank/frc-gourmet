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
exports.Pago = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const caja_entity_1 = require("../financiero/caja.entity");
const estado_enum_1 = require("./estado.enum");
const compra_entity_1 = require("./compra.entity");
/**
 * Entity representing a payment to suppliers
 */
let Pago = class Pago extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({
        type: 'text',
        enum: estado_enum_1.PagoEstado,
        default: estado_enum_1.PagoEstado.ABIERTO
    }),
    __metadata("design:type", String)
], Pago.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Pago.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => caja_entity_1.Caja),
    (0, typeorm_1.JoinColumn)({ name: 'caja_id' }),
    __metadata("design:type", caja_entity_1.Caja)
], Pago.prototype, "caja", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('PagoDetalle', 'pago'),
    __metadata("design:type", Array)
], Pago.prototype, "detalles", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => compra_entity_1.Compra, compra => compra.pago),
    __metadata("design:type", Array)
], Pago.prototype, "compras", void 0);
Pago = __decorate([
    (0, typeorm_1.Entity)('pagos')
], Pago);
exports.Pago = Pago;
//# sourceMappingURL=pago.entity.js.map