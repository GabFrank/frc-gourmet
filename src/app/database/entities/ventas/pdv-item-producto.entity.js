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
exports.PdvItemProducto = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const producto_entity_1 = require("../productos/producto.entity");
let PdvItemProducto = class PdvItemProducto extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], PdvItemProducto.prototype, "nombre_alternativo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], PdvItemProducto.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], PdvItemProducto.prototype, "categoriaItemId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: false }),
    __metadata("design:type", Number)
], PdvItemProducto.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('PdvCategoriaItem', 'productos', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'categoriaItemId' }),
    __metadata("design:type", Object)
], PdvItemProducto.prototype, "categoriaItem", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => producto_entity_1.Producto, { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'productoId' }),
    __metadata("design:type", producto_entity_1.Producto)
], PdvItemProducto.prototype, "producto", void 0);
PdvItemProducto = __decorate([
    (0, typeorm_1.Entity)('pdv_item_producto')
], PdvItemProducto);
exports.PdvItemProducto = PdvItemProducto;
//# sourceMappingURL=pdv-item-producto.entity.js.map