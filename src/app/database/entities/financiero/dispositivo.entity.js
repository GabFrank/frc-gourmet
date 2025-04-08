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
exports.Dispositivo = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a hardware device
 */
let Dispositivo = class Dispositivo extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Dispositivo.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Dispositivo.prototype, "mac", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_venta' }),
    __metadata("design:type", Boolean)
], Dispositivo.prototype, "isVenta", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_caja' }),
    __metadata("design:type", Boolean)
], Dispositivo.prototype, "isCaja", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_touch' }),
    __metadata("design:type", Boolean)
], Dispositivo.prototype, "isTouch", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_mobile' }),
    __metadata("design:type", Boolean)
], Dispositivo.prototype, "isMobile", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Dispositivo.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('Caja', 'dispositivo'),
    __metadata("design:type", Array)
], Dispositivo.prototype, "cajas", void 0);
Dispositivo = __decorate([
    (0, typeorm_1.Entity)('dispositivos')
], Dispositivo);
exports.Dispositivo = Dispositivo;
//# sourceMappingURL=dispositivo.entity.js.map