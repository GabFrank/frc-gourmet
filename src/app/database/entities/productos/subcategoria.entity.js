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
exports.Subcategoria = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const categoria_entity_1 = require("./categoria.entity");
const producto_entity_1 = require("./producto.entity");
/**
 * Entity representing a product subcategory
 */
let Subcategoria = class Subcategoria extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Subcategoria.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Subcategoria.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Subcategoria.prototype, "posicion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Subcategoria.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'categoria_id' }),
    __metadata("design:type", Number)
], Subcategoria.prototype, "categoriaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => categoria_entity_1.Categoria),
    (0, typeorm_1.JoinColumn)({ name: 'categoria_id' }),
    __metadata("design:type", categoria_entity_1.Categoria)
], Subcategoria.prototype, "categoria", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => producto_entity_1.Producto, producto => producto.subcategoria),
    __metadata("design:type", Array)
], Subcategoria.prototype, "productos", void 0);
Subcategoria = __decorate([
    (0, typeorm_1.Entity)('subcategorias')
], Subcategoria);
exports.Subcategoria = Subcategoria;
//# sourceMappingURL=subcategoria.entity.js.map