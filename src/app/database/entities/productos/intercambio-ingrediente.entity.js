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
exports.IntercambioIngrediente = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing an ingredient swap
 */
let IntercambioIngrediente = class IntercambioIngrediente extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_id' }),
    __metadata("design:type", Number)
], IntercambioIngrediente.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Producto', 'intercambioIngredientes'),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", Function)
], IntercambioIngrediente.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sabor_id', nullable: true }),
    __metadata("design:type", Number)
], IntercambioIngrediente.prototype, "saborId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Sabor', 'intercambioIngredientes', { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'sabor_id' }),
    __metadata("design:type", Function)
], IntercambioIngrediente.prototype, "sabor", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ingrediente_original_id' }),
    __metadata("design:type", Number)
], IntercambioIngrediente.prototype, "ingredienteOriginalId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Ingrediente', 'intercambiosOrigen'),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_original_id' }),
    __metadata("design:type", Function)
], IntercambioIngrediente.prototype, "ingredienteOriginal", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ingrediente_reemplazo_id' }),
    __metadata("design:type", Number)
], IntercambioIngrediente.prototype, "ingredienteReemplazoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Ingrediente', 'intercambiosReemplazo'),
    (0, typeorm_1.JoinColumn)({ name: 'ingrediente_reemplazo_id' }),
    __metadata("design:type", Function)
], IntercambioIngrediente.prototype, "ingredienteReemplazo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'costo_adicional', type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], IntercambioIngrediente.prototype, "costoAdicional", void 0);
IntercambioIngrediente = __decorate([
    (0, typeorm_1.Entity)('producto_intercambio_ingredientes')
], IntercambioIngrediente);
exports.IntercambioIngrediente = IntercambioIngrediente;
//# sourceMappingURL=intercambio-ingrediente.entity.js.map