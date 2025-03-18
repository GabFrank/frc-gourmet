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
exports.Cliente = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const persona_entity_1 = require("./persona.entity");
const tipo_cliente_entity_1 = require("./tipo-cliente.entity");
/**
 * Entity representing a client with business-related attributes
 */
let Cliente = class Cliente extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)(() => persona_entity_1.Persona),
    (0, typeorm_1.JoinColumn)({ name: 'persona_id' }),
    __metadata("design:type", persona_entity_1.Persona)
], Cliente.prototype, "persona", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Cliente.prototype, "ruc", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Cliente.prototype, "razon_social", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Cliente.prototype, "tributa", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => tipo_cliente_entity_1.TipoCliente),
    (0, typeorm_1.JoinColumn)({ name: 'tipo_cliente_id' }),
    __metadata("design:type", tipo_cliente_entity_1.TipoCliente)
], Cliente.prototype, "tipo_cliente", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Cliente.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Cliente.prototype, "credito", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'float', default: 0 }),
    __metadata("design:type", Number)
], Cliente.prototype, "limite_credito", void 0);
Cliente = __decorate([
    (0, typeorm_1.Entity)('clientes')
], Cliente);
exports.Cliente = Cliente;
//# sourceMappingURL=cliente.entity.js.map