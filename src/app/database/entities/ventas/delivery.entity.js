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
exports.Delivery = exports.DeliveryEstado = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const cliente_entity_1 = require("../personas/cliente.entity");
const usuario_entity_1 = require("../personas/usuario.entity");
const precio_delivery_entity_1 = require("./precio-delivery.entity");
/**
 * Enum for delivery states
 */
var DeliveryEstado;
(function (DeliveryEstado) {
    DeliveryEstado["ABIERTO"] = "ABIERTO";
    DeliveryEstado["PARA_ENTREGA"] = "PARA_ENTREGA";
    DeliveryEstado["EN_CAMINO"] = "EN_CAMINO";
    DeliveryEstado["ENTREGADO"] = "ENTREGADO";
    DeliveryEstado["CANCELADO"] = "CANCELADO";
})(DeliveryEstado = exports.DeliveryEstado || (exports.DeliveryEstado = {}));
/**
 * Entity representing a delivery
 */
let Delivery = class Delivery extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)(() => precio_delivery_entity_1.PrecioDelivery),
    (0, typeorm_1.JoinColumn)({ name: 'precio_delivery_id' }),
    __metadata("design:type", precio_delivery_entity_1.PrecioDelivery)
], Delivery.prototype, "precioDelivery", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Delivery.prototype, "telefono", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Delivery.prototype, "direccion", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => cliente_entity_1.Cliente),
    (0, typeorm_1.JoinColumn)({ name: 'cliente_id' }),
    __metadata("design:type", cliente_entity_1.Cliente)
], Delivery.prototype, "cliente", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        enum: DeliveryEstado,
        default: DeliveryEstado.ABIERTO
    }),
    __metadata("design:type", String)
], Delivery.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fecha_abierto', type: 'datetime' }),
    __metadata("design:type", Date)
], Delivery.prototype, "fechaAbierto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fecha_para_entrega', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], Delivery.prototype, "fechaParaEntrega", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fecha_en_camino', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], Delivery.prototype, "fechaEnCamino", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fecha_entregado', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], Delivery.prototype, "fechaEntregado", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => usuario_entity_1.Usuario, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'entregado_por' }),
    __metadata("design:type", usuario_entity_1.Usuario)
], Delivery.prototype, "entregadoPor", void 0);
Delivery = __decorate([
    (0, typeorm_1.Entity)('deliveries')
], Delivery);
exports.Delivery = Delivery;
//# sourceMappingURL=delivery.entity.js.map