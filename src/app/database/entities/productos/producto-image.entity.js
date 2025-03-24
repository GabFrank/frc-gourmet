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
exports.ProductoImage = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const producto_entity_1 = require("./producto.entity");
/**
 * Entity representing a product image
 */
let ProductoImage = class ProductoImage extends base_entity_1.BaseModel {
};
exports.ProductoImage = ProductoImage;
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ProductoImage.prototype, "imageUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], ProductoImage.prototype, "isMain", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'orden', default: 0 }),
    __metadata("design:type", Number)
], ProductoImage.prototype, "orden", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_id' }),
    __metadata("design:type", Number)
], ProductoImage.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => producto_entity_1.Producto, producto => producto.images),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", producto_entity_1.Producto)
], ProductoImage.prototype, "producto", void 0);
exports.ProductoImage = ProductoImage = __decorate([
    (0, typeorm_1.Entity)('producto_images')
], ProductoImage);
//# sourceMappingURL=producto-image.entity.js.map