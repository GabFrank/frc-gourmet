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
exports.ConteoDetalle = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing the details of a money count
 */
let ConteoDetalle = class ConteoDetalle extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)('Conteo', 'detalles', { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'conteo_id' }),
    __metadata("design:type", Object)
], ConteoDetalle.prototype, "conteo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('MonedaBillete', 'conteoDetalles', { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_billete_id' }),
    __metadata("design:type", Object)
], ConteoDetalle.prototype, "monedaBillete", void 0);
__decorate([
    (0, typeorm_1.Column)('int'),
    __metadata("design:type", Number)
], ConteoDetalle.prototype, "cantidad", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ConteoDetalle.prototype, "activo", void 0);
ConteoDetalle = __decorate([
    (0, typeorm_1.Entity)('conteos_detalles')
], ConteoDetalle);
exports.ConteoDetalle = ConteoDetalle;
//# sourceMappingURL=conteo-detalle.entity.js.map