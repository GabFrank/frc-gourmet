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
exports.ProductoAdicional = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const presentacion_entity_1 = require("./presentacion.entity");
/**
 * Entity representing a relationship between product and additional item
 */
let ProductoAdicional = class ProductoAdicional extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_id' }),
    __metadata("design:type", Number)
], ProductoAdicional.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Producto', 'productosAdicionales'),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", Function)
], ProductoAdicional.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'presentacion_id' }),
    __metadata("design:type", Number)
], ProductoAdicional.prototype, "presentacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Presentacion', 'productoAdicionales'),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_id' }),
    __metadata("design:type", presentacion_entity_1.Presentacion)
], ProductoAdicional.prototype, "presentacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'adicional_id' }),
    __metadata("design:type", Number)
], ProductoAdicional.prototype, "adicionalId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Adicional'),
    (0, typeorm_1.JoinColumn)({ name: 'adicional_id' }),
    __metadata("design:type", Function)
], ProductoAdicional.prototype, "adicional", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cantidad_default', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], ProductoAdicional.prototype, "cantidadDefault", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ProductoAdicional.prototype, "activo", void 0);
ProductoAdicional = __decorate([
    (0, typeorm_1.Entity)('productos_adicionales')
], ProductoAdicional);
exports.ProductoAdicional = ProductoAdicional;
//# sourceMappingURL=producto-adicional.entity.js.map