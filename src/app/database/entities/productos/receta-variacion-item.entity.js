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
exports.RecetaVariacionItem = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing an ingredient in a recipe variation
 */
let RecetaVariacionItem = class RecetaVariacionItem extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'variacion_id' }),
    __metadata("design:type", Number)
], RecetaVariacionItem.prototype, "variacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('RecetaVariacion', 'items', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'variacion_id' }),
    __metadata("design:type", Function)
], RecetaVariacionItem.prototype, "variacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ingrediente_id' }),
    __metadata("design:type", Number)
], RecetaVariacionItem.prototype, "ingredienteId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Ingrediente', 'variacionItems'),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_id' }),
    __metadata("design:type", Function)
], RecetaVariacionItem.prototype, "ingrediente", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], RecetaVariacionItem.prototype, "porcentajeAprovechamiento", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], RecetaVariacionItem.prototype, "cantidad", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], RecetaVariacionItem.prototype, "activo", void 0);
RecetaVariacionItem = __decorate([
    (0, typeorm_1.Entity)('producto_receta_variacion_items')
], RecetaVariacionItem);
exports.RecetaVariacionItem = RecetaVariacionItem;
//# sourceMappingURL=receta-variacion-item.entity.js.map