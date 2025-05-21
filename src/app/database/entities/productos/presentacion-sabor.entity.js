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
exports.PresentacionSabor = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a product presentation with flavor
 */
let PresentacionSabor = class PresentacionSabor extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'presentacion_id' }),
    __metadata("design:type", Number)
], PresentacionSabor.prototype, "presentacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Presentacion', 'presentacionesSabores', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_id' }),
    __metadata("design:type", Function)
], PresentacionSabor.prototype, "presentacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sabor_id' }),
    __metadata("design:type", Number)
], PresentacionSabor.prototype, "saborId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Sabor', 'presentacionesSabores', { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'sabor_id' }),
    __metadata("design:type", Function)
], PresentacionSabor.prototype, "sabor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receta_id', nullable: true }),
    __metadata("design:type", Number)
], PresentacionSabor.prototype, "recetaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Receta', { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'receta_id' }),
    __metadata("design:type", Function)
], PresentacionSabor.prototype, "receta", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variacion_id', nullable: true }),
    __metadata("design:type", Number)
], PresentacionSabor.prototype, "variacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('RecetaVariacion', { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'variacion_id' }),
    __metadata("design:type", Function)
], PresentacionSabor.prototype, "variacion", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('PrecioVenta', 'presentacionSabor', { onDelete: 'CASCADE' }),
    __metadata("design:type", Array)
], PresentacionSabor.prototype, "preciosVenta", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], PresentacionSabor.prototype, "activo", void 0);
PresentacionSabor = __decorate([
    (0, typeorm_1.Entity)('producto_presentaciones_sabores')
], PresentacionSabor);
exports.PresentacionSabor = PresentacionSabor;
//# sourceMappingURL=presentacion-sabor.entity.js.map