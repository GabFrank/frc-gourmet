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
exports.MonedaBillete = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a specific denomination of currency (bill or coin)
 */
let MonedaBillete = class MonedaBillete extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)('Moneda'),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", Function)
], MonedaBillete.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.Column)('decimal', { precision: 12, scale: 2 }),
    __metadata("design:type", Number)
], MonedaBillete.prototype, "valor", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], MonedaBillete.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], MonedaBillete.prototype, "image_path", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('ConteoDetalle', 'monedaBillete'),
    __metadata("design:type", Array)
], MonedaBillete.prototype, "conteoDetalles", void 0);
MonedaBillete = __decorate([
    (0, typeorm_1.Entity)('monedas_billetes')
], MonedaBillete);
exports.MonedaBillete = MonedaBillete;
//# sourceMappingURL=moneda-billete.entity.js.map