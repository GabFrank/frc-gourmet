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
exports.PdvCategoria = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
let PdvCategoria = class PdvCategoria extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ nullable: false }),
    __metadata("design:type", String)
], PdvCategoria.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], PdvCategoria.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], PdvCategoria.prototype, "grupoCategoriId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('PdvGrupoCategoria', 'categorias'),
    (0, typeorm_1.JoinColumn)({ name: 'grupoCategoriId' }),
    __metadata("design:type", Function)
], PdvCategoria.prototype, "grupoCategoria", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('PdvCategoriaItem', 'categoria'),
    __metadata("design:type", Array)
], PdvCategoria.prototype, "items", void 0);
PdvCategoria = __decorate([
    (0, typeorm_1.Entity)('pdv_categoria')
], PdvCategoria);
exports.PdvCategoria = PdvCategoria;
//# sourceMappingURL=pdv-categoria.entity.js.map