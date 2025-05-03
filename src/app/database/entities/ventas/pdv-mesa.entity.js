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
exports.PdvMesa = exports.PdvMesaEstado = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const reserva_entity_1 = require("./reserva.entity");
const sector_entity_1 = require("./sector.entity");
/**
 * Enum for table states
 */
var PdvMesaEstado;
(function (PdvMesaEstado) {
    PdvMesaEstado["DISPONIBLE"] = "DISPONIBLE";
    PdvMesaEstado["OCUPADO"] = "OCUPADO";
})(PdvMesaEstado = exports.PdvMesaEstado || (exports.PdvMesaEstado = {}));
/**
 * Entity representing a point of sale table
 */
let PdvMesa = class PdvMesa extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], PdvMesa.prototype, "numero", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 4, nullable: true }),
    __metadata("design:type", Number)
], PdvMesa.prototype, "cantidad_personas", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], PdvMesa.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], PdvMesa.prototype, "reservado", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        enum: PdvMesaEstado,
        default: PdvMesaEstado.DISPONIBLE
    }),
    __metadata("design:type", String)
], PdvMesa.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => reserva_entity_1.Reserva, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'reserva_id' }),
    __metadata("design:type", reserva_entity_1.Reserva)
], PdvMesa.prototype, "reserva", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => sector_entity_1.Sector, sector => sector.mesas, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'sector_id' }),
    __metadata("design:type", sector_entity_1.Sector)
], PdvMesa.prototype, "sector", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Venta', 'mesa', { nullable: true }),
    __metadata("design:type", Function)
], PdvMesa.prototype, "venta", void 0);
PdvMesa = __decorate([
    (0, typeorm_1.Entity)('pdv_mesas')
], PdvMesa);
exports.PdvMesa = PdvMesa;
//# sourceMappingURL=pdv-mesa.entity.js.map