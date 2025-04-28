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
exports.PdvGrupoCategoria = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const pdv_categoria_entity_1 = require("./pdv-categoria.entity");
let PdvGrupoCategoria = class PdvGrupoCategoria extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ nullable: false }),
    __metadata("design:type", String)
], PdvGrupoCategoria.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], PdvGrupoCategoria.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => pdv_categoria_entity_1.PdvCategoria, (categoria) => categoria.grupoCategoria),
    __metadata("design:type", Array)
], PdvGrupoCategoria.prototype, "categorias", void 0);
PdvGrupoCategoria = __decorate([
    (0, typeorm_1.Entity)('pdv_grupo_categoria')
], PdvGrupoCategoria);
exports.PdvGrupoCategoria = PdvGrupoCategoria;
//# sourceMappingURL=pdv-grupo-categoria.entity.js.map