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
exports.Proveedor = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const persona_entity_1 = require("../personas/persona.entity");
/**
 * Entity representing a supplier (proveedor)
 */
let Proveedor = class Proveedor extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Proveedor.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Proveedor.prototype, "razon_social", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Proveedor.prototype, "ruc", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Proveedor.prototype, "telefono", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Proveedor.prototype, "direccion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Proveedor.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => persona_entity_1.Persona, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'persona_id' }),
    __metadata("design:type", persona_entity_1.Persona)
], Proveedor.prototype, "persona", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('Compra', 'proveedor'),
    __metadata("design:type", Array)
], Proveedor.prototype, "compras", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('ProveedorProducto', 'proveedor'),
    __metadata("design:type", Array)
], Proveedor.prototype, "proveedorProductos", void 0);
Proveedor = __decorate([
    (0, typeorm_1.Entity)('proveedores')
], Proveedor);
exports.Proveedor = Proveedor;
//# sourceMappingURL=proveedor.entity.js.map