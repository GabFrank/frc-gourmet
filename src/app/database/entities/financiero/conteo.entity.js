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
exports.Conteo = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a money count operation
 */
let Conteo = class Conteo extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Conteo.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Conteo.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], Conteo.prototype, "fecha", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Conteo.prototype, "observaciones", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('ConteoDetalle', 'conteo', { cascade: true }),
    __metadata("design:type", Array)
], Conteo.prototype, "detalles", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Caja', 'conteoApertura'),
    __metadata("design:type", Object)
], Conteo.prototype, "cajaApertura", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Caja', 'conteoCierre'),
    __metadata("design:type", Object)
], Conteo.prototype, "cajaCierre", void 0);
Conteo = __decorate([
    (0, typeorm_1.Entity)('conteos')
], Conteo);
exports.Conteo = Conteo;
//# sourceMappingURL=conteo.entity.js.map