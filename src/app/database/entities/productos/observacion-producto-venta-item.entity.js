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
exports.ObservacionProductoVentaItem = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a relationship between product observation and sale item
 */
let ObservacionProductoVentaItem = class ObservacionProductoVentaItem extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'observacion_producto_id' }),
    __metadata("design:type", Number)
], ObservacionProductoVentaItem.prototype, "observacionProductoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('ObservacionProducto'),
    (0, typeorm_1.JoinColumn)({ name: 'observacion_producto_id' }),
    __metadata("design:type", Function)
], ObservacionProductoVentaItem.prototype, "observacionProducto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'venta_item_id' }),
    __metadata("design:type", Number)
], ObservacionProductoVentaItem.prototype, "ventaItemId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('VentaItem'),
    (0, typeorm_1.JoinColumn)({ name: 'venta_item_id' }),
    __metadata("design:type", Function)
], ObservacionProductoVentaItem.prototype, "ventaItem", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], ObservacionProductoVentaItem.prototype, "cantidad", void 0);
ObservacionProductoVentaItem = __decorate([
    (0, typeorm_1.Entity)('observaciones_productos_ventas_items')
], ObservacionProductoVentaItem);
exports.ObservacionProductoVentaItem = ObservacionProductoVentaItem;
//# sourceMappingURL=observacion-producto-venta-item.entity.js.map