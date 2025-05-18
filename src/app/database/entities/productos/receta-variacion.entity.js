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
exports.RecetaVariacion = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a variation of a recipe
 */
let RecetaVariacion = class RecetaVariacion extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], RecetaVariacion.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], RecetaVariacion.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], RecetaVariacion.prototype, "principal", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], RecetaVariacion.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receta_id' }),
    __metadata("design:type", Number)
], RecetaVariacion.prototype, "recetaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Receta', 'variaciones', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'receta_id' }),
    __metadata("design:type", Function)
], RecetaVariacion.prototype, "receta", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], RecetaVariacion.prototype, "costo", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('RecetaVariacionItem', 'variacion'),
    __metadata("design:type", Array)
], RecetaVariacion.prototype, "items", void 0);
RecetaVariacion = __decorate([
    (0, typeorm_1.Entity)('producto_receta_variaciones')
], RecetaVariacion);
exports.RecetaVariacion = RecetaVariacion;
//# sourceMappingURL=receta-variacion.entity.js.map