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
exports.RecetaItem = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a recipe item/ingredient
 */
let RecetaItem = class RecetaItem extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'receta_id' }),
    __metadata("design:type", Number)
], RecetaItem.prototype, "recetaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Receta', 'items', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'receta_id' }),
    __metadata("design:type", Function)
], RecetaItem.prototype, "receta", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ingrediente_id' }),
    __metadata("design:type", Number)
], RecetaItem.prototype, "ingredienteId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Ingrediente', 'recetaItems', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_id' }),
    __metadata("design:type", Function)
], RecetaItem.prototype, "ingrediente", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], RecetaItem.prototype, "cantidad", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], RecetaItem.prototype, "activo", void 0);
RecetaItem = __decorate([
    (0, typeorm_1.Entity)('producto_receta_items')
], RecetaItem);
exports.RecetaItem = RecetaItem;
//# sourceMappingURL=receta-item.entity.js.map