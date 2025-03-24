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
exports.Presentacion = exports.TipoMedida = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Tipo de medida para la presentación de un producto
 */
var TipoMedida;
(function (TipoMedida) {
    TipoMedida["UNIDAD"] = "UNIDAD";
    TipoMedida["PAQUETE"] = "PAQUETE";
    TipoMedida["GRAMO"] = "GRAMO";
    TipoMedida["LITRO"] = "LITRO";
})(TipoMedida || (exports.TipoMedida = TipoMedida = {}));
/**
 * Entity representing a product presentation
 */
let Presentacion = class Presentacion extends base_entity_1.BaseModel {
};
exports.Presentacion = Presentacion;
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_id' }),
    __metadata("design:type", Number)
], Presentacion.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Producto', 'presentaciones'),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", Function)
], Presentacion.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Presentacion.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        name: 'tipo_medida',
        enum: TipoMedida,
        default: TipoMedida.UNIDAD
    }),
    __metadata("design:type", String)
], Presentacion.prototype, "tipoMedida", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 1 }),
    __metadata("design:type", Number)
], Presentacion.prototype, "cantidad", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Presentacion.prototype, "principal", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Presentacion.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('Codigo', 'presentacion'),
    __metadata("design:type", Array)
], Presentacion.prototype, "codigos", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('PrecioVenta', 'presentacion'),
    __metadata("design:type", Array)
], Presentacion.prototype, "preciosVenta", void 0);
exports.Presentacion = Presentacion = __decorate([
    (0, typeorm_1.Entity)('producto_presentaciones')
], Presentacion);
//# sourceMappingURL=presentacion.entity.js.map