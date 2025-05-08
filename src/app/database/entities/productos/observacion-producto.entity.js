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
exports.ObservacionProducto = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a product observation relationship
 */
let ObservacionProducto = class ObservacionProducto extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'producto_id' }),
    __metadata("design:type", Number)
], ObservacionProducto.prototype, "productoId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Producto', 'observacionesProductos'),
    (0, typeorm_1.JoinColumn)({ name: 'producto_id' }),
    __metadata("design:type", Function)
], ObservacionProducto.prototype, "producto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'observacion_id' }),
    __metadata("design:type", Number)
], ObservacionProducto.prototype, "observacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Observacion'),
    (0, typeorm_1.JoinColumn)({ name: 'observacion_id' }),
    __metadata("design:type", Function)
], ObservacionProducto.prototype, "observacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], ObservacionProducto.prototype, "obligatorio", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cantidad_default', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], ObservacionProducto.prototype, "cantidadDefault", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ObservacionProducto.prototype, "activo", void 0);
ObservacionProducto = __decorate([
    (0, typeorm_1.Entity)('observaciones_productos')
], ObservacionProducto);
exports.ObservacionProducto = ObservacionProducto;
//# sourceMappingURL=observacion-producto.entity.js.map