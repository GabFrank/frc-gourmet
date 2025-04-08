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
exports.CajaMoneda = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const moneda_entity_1 = require("./moneda.entity");
/**
 * Entity representing which currencies are enabled for cash register operations
 * This determines which currencies will appear in conteo forms
 */
let CajaMoneda = class CajaMoneda extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)(() => moneda_entity_1.Moneda, { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", moneda_entity_1.Moneda)
], CajaMoneda.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], CajaMoneda.prototype, "predeterminado", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], CajaMoneda.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { length: 10, nullable: true }),
    __metadata("design:type", String)
], CajaMoneda.prototype, "orden", void 0);
CajaMoneda = __decorate([
    (0, typeorm_1.Entity)('cajas_monedas')
], CajaMoneda);
exports.CajaMoneda = CajaMoneda;
//# sourceMappingURL=caja-moneda.entity.js.map