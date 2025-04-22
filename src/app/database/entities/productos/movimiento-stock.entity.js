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
exports.MovimientoStock = exports.TipoReferencia = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Tipos de referencia para movimientos de stock
 */
var TipoReferencia;
(function (TipoReferencia) {
    TipoReferencia["VENTA"] = "VENTA";
    TipoReferencia["COMPRA"] = "COMPRA";
    TipoReferencia["AJUSTE"] = "AJUSTE";
    TipoReferencia["TRANSFERENCIA"] = "TRANSFERENCIA";
    TipoReferencia["DESCARTE"] = "DESCARTE";
})(TipoReferencia = exports.TipoReferencia || (exports.TipoReferencia = {}));
/**
 * Entity representing stock movements for products and ingredients
 */
let MovimientoStock = class MovimientoStock extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_id', nullable: true }),
    __metadata("design:type", Number)
], MovimientoStock.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Producto', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", Function)
], MovimientoStock.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ingrediente_id', nullable: true }),
    __metadata("design:type", Number)
], MovimientoStock.prototype, "ingredienteId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Ingrediente', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_id' }),
    __metadata("design:type", Function)
], MovimientoStock.prototype, "ingrediente", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'tipo_medida',
        type: 'varchar'
    }),
    __metadata("design:type", String)
], MovimientoStock.prototype, "tipoMedida", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'cantidad_actual',
        type: 'decimal',
        precision: 10,
        scale: 2,
        default: 0
    }),
    __metadata("design:type", Number)
], MovimientoStock.prototype, "cantidadActual", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'referencia',
        type: 'int',
        nullable: true
    }),
    __metadata("design:type", Number)
], MovimientoStock.prototype, "referencia", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        name: 'tipo_referencia',
        enum: TipoReferencia,
        default: TipoReferencia.AJUSTE
    }),
    __metadata("design:type", String)
], MovimientoStock.prototype, "tipoReferencia", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], MovimientoStock.prototype, "activo", void 0);
MovimientoStock = __decorate([
    (0, typeorm_1.Entity)('producto_movimientos_stock')
], MovimientoStock);
exports.MovimientoStock = MovimientoStock;
//# sourceMappingURL=movimiento-stock.entity.js.map