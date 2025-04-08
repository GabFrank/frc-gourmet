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
exports.Caja = exports.CajaEstado = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const usuario_entity_1 = require("../personas/usuario.entity");
/**
 * Enumeration for cash register states
 */
var CajaEstado;
(function (CajaEstado) {
    CajaEstado["ABIERTO"] = "ABIERTO";
    CajaEstado["CERRADO"] = "CERRADO";
    CajaEstado["CANCELADO"] = "CANCELADO";
})(CajaEstado = exports.CajaEstado || (exports.CajaEstado = {}));
/**
 * Entity representing a cash register
 */
let Caja = class Caja extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)('Dispositivo', 'cajas', { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'dispositivo_id' }),
    __metadata("design:type", Object)
], Caja.prototype, "dispositivo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime', name: 'fecha_apertura' }),
    __metadata("design:type", Date)
], Caja.prototype, "fechaApertura", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime', name: 'fecha_cierre', nullable: true }),
    __metadata("design:type", Date)
], Caja.prototype, "fechaCierre", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Conteo', 'cajaApertura', { nullable: false, cascade: true }),
    (0, typeorm_1.JoinColumn)({ name: 'conteo_apertura_id' }),
    __metadata("design:type", Object)
], Caja.prototype, "conteoApertura", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Conteo', 'cajaCierre', { nullable: true, cascade: true }),
    (0, typeorm_1.JoinColumn)({ name: 'conteo_cierre_id' }),
    __metadata("design:type", Object)
], Caja.prototype, "conteoCierre", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        enum: CajaEstado,
        default: CajaEstado.ABIERTO
    }),
    __metadata("design:type", String)
], Caja.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Caja.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Caja.prototype, "revisado", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => usuario_entity_1.Usuario, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'revisado_por' }),
    __metadata("design:type", usuario_entity_1.Usuario)
], Caja.prototype, "revisadoPor", void 0);
Caja = __decorate([
    (0, typeorm_1.Entity)('cajas')
], Caja);
exports.Caja = Caja;
//# sourceMappingURL=caja.entity.js.map