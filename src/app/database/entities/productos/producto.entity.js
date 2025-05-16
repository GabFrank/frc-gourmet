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
exports.Producto = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const receta_variacion_entity_1 = require("./receta-variacion.entity");
/**
 * Entity representing a product
 */
let Producto = class Producto extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Producto.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, name: 'nombre_alternativo' }),
    __metadata("design:type", String)
], Producto.prototype, "nombreAlternativo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 10 }),
    __metadata("design:type", Number)
], Producto.prototype, "iva", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_pesable' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "isPesable", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_combo' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "isCombo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_compuesto' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "isCompuesto", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_ingrediente' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "isIngrediente", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'is_promocion' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "isPromocion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true, name: 'is_vendible' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "isVendible", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'has_vencimiento' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "hasVencimiento", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'has_stock' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "hasStock", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'has_variaciones' }),
    __metadata("design:type", Boolean)
], Producto.prototype, "hasVariaciones", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, type: 'text' }),
    __metadata("design:type", String)
], Producto.prototype, "observacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Producto.prototype, "imageUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, name: 'alertar_vencimiento_dias' }),
    __metadata("design:type", Number)
], Producto.prototype, "alertarVencimientoDias", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Producto.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'subcategoria_id' }),
    __metadata("design:type", Number)
], Producto.prototype, "subcategoriaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Subcategoria', 'productos'),
    (0, typeorm_1.JoinColumn)({ name: 'subcategoria_id' }),
    __metadata("design:type", Function)
], Producto.prototype, "subcategoria", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('RecetaVariacion', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'receta_variacion_id' }),
    __metadata("design:type", receta_variacion_entity_1.RecetaVariacion)
], Producto.prototype, "recetaVariacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receta_variacion_id', nullable: true }),
    __metadata("design:type", Number)
], Producto.prototype, "recetaVariacionId", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('ProductoImage', 'producto'),
    __metadata("design:type", Array)
], Producto.prototype, "images", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('Presentacion', 'producto'),
    __metadata("design:type", Array)
], Producto.prototype, "presentaciones", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('IntercambioIngrediente', 'producto'),
    __metadata("design:type", Array)
], Producto.prototype, "intercambioIngredientes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('ObservacionProducto', 'producto'),
    __metadata("design:type", Array)
], Producto.prototype, "observacionesProductos", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('ProductoAdicional', 'producto'),
    __metadata("design:type", Array)
], Producto.prototype, "productosAdicionales", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('CostoPorProducto', 'producto'),
    __metadata("design:type", Array)
], Producto.prototype, "costos", void 0);
Producto = __decorate([
    (0, typeorm_1.Entity)('productos')
], Producto);
exports.Producto = Producto;
//# sourceMappingURL=producto.entity.js.map