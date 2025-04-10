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
exports.UsuarioRole = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
const usuario_entity_1 = require("./usuario.entity");
const role_entity_1 = require("./role.entity");
/**
 * Entity representing the many-to-many relationship between users and roles
 */
let UsuarioRole = class UsuarioRole extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.ManyToOne)(() => usuario_entity_1.Usuario),
    (0, typeorm_1.JoinColumn)({ name: 'usuario_id' }),
    __metadata("design:type", usuario_entity_1.Usuario)
], UsuarioRole.prototype, "usuario", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => role_entity_1.Role),
    (0, typeorm_1.JoinColumn)({ name: 'role_id' }),
    __metadata("design:type", role_entity_1.Role)
], UsuarioRole.prototype, "role", void 0);
UsuarioRole = __decorate([
    (0, typeorm_1.Entity)('usuario_roles')
], UsuarioRole);
exports.UsuarioRole = UsuarioRole;
//# sourceMappingURL=usuario-role.entity.js.map