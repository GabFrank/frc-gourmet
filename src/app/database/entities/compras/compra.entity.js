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
exports.Compra = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const moneda_entity_1 = require("../financiero/moneda.entity");
const estado_enum_1 = require("./estado.enum");
/**
 * Entity representing a purchase from suppliers
 */
let Compra = class Compra extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({
        type: 'text',
        enum: estado_enum_1.CompraEstado,
        default: estado_enum_1.CompraEstado.ABIERTO
    }),
    __metadata("design:type", String)
], Compra.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], Compra.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_recepcion_mercaderia' }),
    __metadata("design:type", Boolean)
], Compra.prototype, "isRecepcionMercaderia", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Compra.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Proveedor', 'compras', {
        nullable: true,
        createForeignKeyConstraints: false
    }),
    (0, typeorm_1.JoinColumn)({ name: 'proveedor_id' }),
    __metadata("design:type", Function)
], Compra.prototype, "proveedor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Pago', 'compras', {
        nullable: true,
        createForeignKeyConstraints: false
    }),
    (0, typeorm_1.JoinColumn)({ name: 'pago_id' }),
    __metadata("design:type", Function)
], Compra.prototype, "pago", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => moneda_entity_1.Moneda),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", moneda_entity_1.Moneda)
], Compra.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('CompraDetalle', 'compra'),
    __metadata("design:type", Array)
], Compra.prototype, "detalles", void 0);
Compra = __decorate([
    (0, typeorm_1.Entity)('compras')
], Compra);
exports.Compra = Compra;
//# sourceMappingURL=compra.entity.js.map