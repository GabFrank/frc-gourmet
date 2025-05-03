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
exports.Venta = exports.VentaEstado = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const cliente_entity_1 = require("../personas/cliente.entity");
const forma_pago_entity_1 = require("../compras/forma-pago.entity");
const caja_entity_1 = require("../financiero/caja.entity");
const pago_entity_1 = require("../compras/pago.entity");
const delivery_entity_1 = require("./delivery.entity");
/**
 * Enum for sale states
 */
var VentaEstado;
(function (VentaEstado) {
    VentaEstado["ABIERTA"] = "ABIERTA";
    VentaEstado["CONCLUIDA"] = "CONCLUIDA";
    VentaEstado["CANCELADA"] = "CANCELADA";
})(VentaEstado = exports.VentaEstado || (exports.VentaEstado = {}));
/**
 * Entity representing a sale
 */
let Venta = class Venta extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)(() => cliente_entity_1.Cliente),
    (0, typeorm_1.JoinColumn)({ name: 'cliente_id' }),
    __metadata("design:type", cliente_entity_1.Cliente)
], Venta.prototype, "cliente", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        enum: VentaEstado,
        default: VentaEstado.ABIERTA
    }),
    __metadata("design:type", String)
], Venta.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], Venta.prototype, "nombre_cliente", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => forma_pago_entity_1.FormasPago),
    (0, typeorm_1.JoinColumn)({ name: 'forma_pago_id' }),
    __metadata("design:type", forma_pago_entity_1.FormasPago)
], Venta.prototype, "formaPago", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => caja_entity_1.Caja),
    (0, typeorm_1.JoinColumn)({ name: 'caja_id' }),
    __metadata("design:type", caja_entity_1.Caja)
], Venta.prototype, "caja", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => pago_entity_1.Pago, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'pago_id' }),
    __metadata("design:type", pago_entity_1.Pago)
], Venta.prototype, "pago", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => delivery_entity_1.Delivery, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'delivery_id' }),
    __metadata("design:type", delivery_entity_1.Delivery)
], Venta.prototype, "delivery", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('PdvMesa', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'mesa_id' }),
    __metadata("design:type", Function)
], Venta.prototype, "mesa", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('VentaItem', 'venta'),
    __metadata("design:type", Array)
], Venta.prototype, "items", void 0);
Venta = __decorate([
    (0, typeorm_1.Entity)('ventas')
], Venta);
exports.Venta = Venta;
//# sourceMappingURL=venta.entity.js.map