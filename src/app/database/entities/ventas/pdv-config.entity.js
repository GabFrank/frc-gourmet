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
exports.PdvConfig = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const pdv_grupo_categoria_entity_1 = require("./pdv-grupo-categoria.entity");
let PdvConfig = class PdvConfig extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ nullable: false, default: 0 }),
    __metadata("design:type", Number)
], PdvConfig.prototype, "cantidad_mesas", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], PdvConfig.prototype, "pdvGrupoCategoriaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => pdv_grupo_categoria_entity_1.PdvGrupoCategoria, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'pdvGrupoCategoriaId' }),
    __metadata("design:type", pdv_grupo_categoria_entity_1.PdvGrupoCategoria)
], PdvConfig.prototype, "pdvGrupoCategoria", void 0);
PdvConfig = __decorate([
    (0, typeorm_1.Entity)('pdv_config')
], PdvConfig);
exports.PdvConfig = PdvConfig;
//# sourceMappingURL=pdv-config.entity.js.map