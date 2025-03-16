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
exports.Persona = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const documento_tipo_enum_1 = require("./documento-tipo.enum");
const persona_tipo_enum_1 = require("./persona-tipo.enum");
/**
 * Entity representing a person (either individual or company)
 */
let Persona = class Persona extends base_entity_1.BaseModel {
};
exports.Persona = Persona;
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Persona.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Persona.prototype, "telefono", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Persona.prototype, "direccion", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'text',
        enum: documento_tipo_enum_1.DocumentoTipo,
        default: documento_tipo_enum_1.DocumentoTipo.CI
    }),
    __metadata("design:type", String)
], Persona.prototype, "tipoDocumento", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Persona.prototype, "documento", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'text',
        enum: persona_tipo_enum_1.PersonaTipo,
        default: persona_tipo_enum_1.PersonaTipo.FISICA
    }),
    __metadata("design:type", String)
], Persona.prototype, "tipoPersona", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Persona.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Persona.prototype, "imageUrl", void 0);
exports.Persona = Persona = __decorate([
    (0, typeorm_1.Entity)('personas')
], Persona);
//# sourceMappingURL=persona.entity.js.map