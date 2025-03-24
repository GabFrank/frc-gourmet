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
exports.Codigo = exports.TipoCodigo = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Tipo de código para la presentación de un producto
 */
var TipoCodigo;
(function (TipoCodigo) {
    TipoCodigo["BARRA"] = "BARRA";
    TipoCodigo["QR"] = "QR";
    TipoCodigo["MANUAL"] = "MANUAL";
})(TipoCodigo || (exports.TipoCodigo = TipoCodigo = {}));
/**
 * Entity representing a product code
 */
let Codigo = class Codigo extends base_entity_1.BaseModel {
};
exports.Codigo = Codigo;
__decorate([
    (0, typeorm_1.Column)({ name: 'presentacion_id' }),
    __metadata("design:type", Number)
], Codigo.prototype, "presentacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Presentacion', 'codigos'),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_id' }),
    __metadata("design:type", Function)
], Codigo.prototype, "presentacion", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Codigo.prototype, "codigo", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        name: 'tipo_codigo',
        enum: TipoCodigo,
        default: TipoCodigo.MANUAL
    }),
    __metadata("design:type", String)
], Codigo.prototype, "tipoCodigo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Codigo.prototype, "principal", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Codigo.prototype, "activo", void 0);
exports.Codigo = Codigo = __decorate([
    (0, typeorm_1.Entity)('producto_codigos')
], Codigo);
//# sourceMappingURL=codigo.entity.js.map