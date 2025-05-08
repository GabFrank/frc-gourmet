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
exports.ProductoAdicionalVentaItem = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a relationship between product additional and sale item
 */
let ProductoAdicionalVentaItem = class ProductoAdicionalVentaItem extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_adicional_id' }),
    __metadata("design:type", Number)
], ProductoAdicionalVentaItem.prototype, "productoAdicionalId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('ProductoAdicional'),
    (0, typeorm_1.JoinColumn)({ name: 'producto_adicional_id' }),
    __metadata("design:type", Function)
], ProductoAdicionalVentaItem.prototype, "productoAdicional", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'venta_item_id' }),
    __metadata("design:type", Number)
], ProductoAdicionalVentaItem.prototype, "ventaItemId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('VentaItem'),
    (0, typeorm_1.JoinColumn)({ name: 'venta_item_id' }),
    __metadata("design:type", Function)
], ProductoAdicionalVentaItem.prototype, "ventaItem", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], ProductoAdicionalVentaItem.prototype, "cantidad", void 0);
ProductoAdicionalVentaItem = __decorate([
    (0, typeorm_1.Entity)('productos_adicionales_ventas_items')
], ProductoAdicionalVentaItem);
exports.ProductoAdicionalVentaItem = ProductoAdicionalVentaItem;
//# sourceMappingURL=producto-adicional-venta-item.entity.js.map