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
exports.FormasPago = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing payment methods
 */
let FormasPago = class FormasPago extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], FormasPago.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], FormasPago.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'movimenta_caja', default: false }),
    __metadata("design:type", Boolean)
], FormasPago.prototype, "movimentaCaja", void 0);
FormasPago = __decorate([
    (0, typeorm_1.Entity)('formas_pago')
], FormasPago);
exports.FormasPago = FormasPago;
//# sourceMappingURL=forma-pago.entity.js.map