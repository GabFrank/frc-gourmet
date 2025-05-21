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
exports.Ingrediente = exports.TipoMedida = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Tipo de medida para los ingredientes
 */
var TipoMedida;
(function (TipoMedida) {
    TipoMedida["UNIDAD"] = "UNIDAD";
    TipoMedida["KILO"] = "KILO";
    TipoMedida["GRAMO"] = "GRAMO";
    TipoMedida["LITRO"] = "LITRO";
    TipoMedida["MILILITRO"] = "MILILITRO";
    TipoMedida["PAQUETE"] = "PAQUETE";
})(TipoMedida = exports.TipoMedida || (exports.TipoMedida = {}));
/**
 * Entity representing a product ingredient
 */
let Ingrediente = class Ingrediente extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Ingrediente.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        name: 'tipo_medida',
        enum: TipoMedida,
        default: TipoMedida.UNIDAD
    }),
    __metadata("design:type", String)
], Ingrediente.prototype, "tipoMedida", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Ingrediente.prototype, "costo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_produccion', default: false }),
    __metadata("design:type", Boolean)
], Ingrediente.prototype, "isProduccion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Ingrediente.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receta_id', nullable: true }),
    __metadata("design:type", Number)
], Ingrediente.prototype, "recetaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Receta', { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'receta_id' }),
    __metadata("design:type", Function)
], Ingrediente.prototype, "receta", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'variacion_id', nullable: true }),
    __metadata("design:type", Number)
], Ingrediente.prototype, "variacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('RecetaVariacion', { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'variacion_id' }),
    __metadata("design:type", Function)
], Ingrediente.prototype, "variacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'receta_cantidad', type: 'decimal', precision: 10, scale: 2, default: 0, nullable: true }),
    __metadata("design:type", Number)
], Ingrediente.prototype, "recetaCantidad", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'moneda_id', nullable: true }),
    __metadata("design:type", Number)
], Ingrediente.prototype, "monedaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Moneda', { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'moneda_id' }),
    __metadata("design:type", Function)
], Ingrediente.prototype, "moneda", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('RecetaItem', 'ingrediente'),
    __metadata("design:type", Array)
], Ingrediente.prototype, "recetaItems", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('RecetaVariacionItem', 'ingrediente'),
    __metadata("design:type", Array)
], Ingrediente.prototype, "variacionItems", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('IntercambioIngrediente', 'ingredienteOriginal'),
    __metadata("design:type", Array)
], Ingrediente.prototype, "intercambiosOrigen", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('IntercambioIngrediente', 'ingredienteReemplazo'),
    __metadata("design:type", Array)
], Ingrediente.prototype, "intercambiosReemplazo", void 0);
Ingrediente = __decorate([
    (0, typeorm_1.Entity)('producto_ingredientes')
], Ingrediente);
exports.Ingrediente = Ingrediente;
//# sourceMappingURL=ingrediente.entity.js.map