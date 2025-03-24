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
exports.Moneda = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const precio_venta_entity_1 = require("../productos/precio-venta.entity");
/**
 * Entity representing a currency
 */
let Moneda = class Moneda extends base_entity_1.BaseModel {
};
exports.Moneda = Moneda;
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Moneda.prototype, "denominacion", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Moneda.prototype, "simbolo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Moneda.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Moneda.prototype, "principal", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => precio_venta_entity_1.PrecioVenta, precioVenta => precioVenta.moneda),
    __metadata("design:type", Array)
], Moneda.prototype, "preciosVenta", void 0);
exports.Moneda = Moneda = __decorate([
    (0, typeorm_1.Entity)('monedas')
], Moneda);
//# sourceMappingURL=moneda.entity.js.map