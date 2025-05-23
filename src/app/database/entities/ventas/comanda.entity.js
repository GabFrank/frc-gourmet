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
exports.Comanda = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const pdv_mesa_entity_1 = require("./pdv-mesa.entity");
/**
 * Entity representing an order
 */
let Comanda = class Comanda extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Comanda.prototype, "codigo", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => pdv_mesa_entity_1.PdvMesa),
    (0, typeorm_1.JoinColumn)({ name: 'pdv_mesa_id' }),
    __metadata("design:type", pdv_mesa_entity_1.PdvMesa)
], Comanda.prototype, "pdv_mesa", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Comanda.prototype, "activo", void 0);
Comanda = __decorate([
    (0, typeorm_1.Entity)('comandas')
], Comanda);
exports.Comanda = Comanda;
//# sourceMappingURL=comanda.entity.js.map