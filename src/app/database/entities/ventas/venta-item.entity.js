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
exports.VentaItem = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const venta_entity_1 = require("./venta.entity");
const precio_venta_entity_1 = require("../productos/precio-venta.entity");
const producto_entity_1 = require("../productos/producto.entity");
const presentacion_entity_1 = require("../productos/presentacion.entity");
/**
 * Entity representing a sale item
 */
let VentaItem = class VentaItem extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)(() => venta_entity_1.Venta, venta => venta.items),
    (0, typeorm_1.JoinColumn)({ name: 'venta_id' }),
    __metadata("design:type", venta_entity_1.Venta)
], VentaItem.prototype, "venta", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        name: 'tipo_medida',
        enum: presentacion_entity_1.TipoMedida,
        default: presentacion_entity_1.TipoMedida.UNIDAD
    }),
    __metadata("design:type", String)
], VentaItem.prototype, "tipoMedida", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'precio_costo_total',
        type: 'decimal',
        precision: 10,
        scale: 2
    }),
    __metadata("design:type", Number)
], VentaItem.prototype, "precioCostoTotal", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'precio_venta_total',
        type: 'decimal',
        precision: 10,
        scale: 2
    }),
    __metadata("design:type", Number)
], VentaItem.prototype, "precioVentaTotal", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => precio_venta_entity_1.PrecioVenta),
    (0, typeorm_1.JoinColumn)({ name: 'precio_venta_presentacion_id' }),
    __metadata("design:type", precio_venta_entity_1.PrecioVenta)
], VentaItem.prototype, "precioVentaPresentacion", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => producto_entity_1.Producto),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", producto_entity_1.Producto)
], VentaItem.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => presentacion_entity_1.Presentacion),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_id' }),
    __metadata("design:type", presentacion_entity_1.Presentacion)
], VentaItem.prototype, "presentacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], VentaItem.prototype, "cantidad", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'decimal',
        precision: 10,
        scale: 2,
        default: 0
    }),
    __metadata("design:type", Number)
], VentaItem.prototype, "descuento", void 0);
VentaItem = __decorate([
    (0, typeorm_1.Entity)('venta_items')
], VentaItem);
exports.VentaItem = VentaItem;
//# sourceMappingURL=venta-item.entity.js.map