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
exports.Sabor = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a product flavor
 */
let Sabor = class Sabor extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Sabor.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Sabor.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Sabor.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('PresentacionSabor', 'sabor'),
    __metadata("design:type", Array)
], Sabor.prototype, "presentacionesSabores", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('IntercambioIngrediente', 'sabor'),
    __metadata("design:type", Array)
], Sabor.prototype, "intercambioIngredientes", void 0);
Sabor = __decorate([
    (0, typeorm_1.Entity)('producto_sabores')
], Sabor);
exports.Sabor = Sabor;
//# sourceMappingURL=sabor.entity.js.map