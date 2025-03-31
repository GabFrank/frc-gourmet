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
exports.TipoPrecio = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const usuario_entity_1 = require("../personas/usuario.entity");
/**
 * Entity representing a price type (e.g. retail, wholesale, special discount)
 */
let TipoPrecio = class TipoPrecio extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ length: 100 }),
    __metadata("design:type", String)
], TipoPrecio.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], TipoPrecio.prototype, "autorizacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'autorizado_por', nullable: true }),
    __metadata("design:type", Number)
], TipoPrecio.prototype, "autorizadoPorId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => usuario_entity_1.Usuario, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'autorizado_por' }),
    __metadata("design:type", usuario_entity_1.Usuario)
], TipoPrecio.prototype, "autorizadoPor", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], TipoPrecio.prototype, "activo", void 0);
TipoPrecio = __decorate([
    (0, typeorm_1.Entity)('financiero_tipo_precio')
], TipoPrecio);
exports.TipoPrecio = TipoPrecio;
//# sourceMappingURL=tipo-precio.entity.js.map