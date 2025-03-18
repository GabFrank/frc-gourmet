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
exports.Printer = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("./base.entity");
let Printer = class Printer extends base_entity_1.BaseModel {
};
exports.Printer = Printer;
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Printer.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Printer.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'connection_type' }),
    __metadata("design:type", String)
], Printer.prototype, "connectionType", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Printer.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Printer.prototype, "port", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Printer.prototype, "dpi", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Printer.prototype, "width", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'character_set', nullable: true }),
    __metadata("design:type", String)
], Printer.prototype, "characterSet", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_default', default: false }),
    __metadata("design:type", Boolean)
], Printer.prototype, "isDefault", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, type: 'text' }),
    __metadata("design:type", String)
], Printer.prototype, "options", void 0);
exports.Printer = Printer = __decorate([
    (0, typeorm_1.Entity)('printers')
], Printer);
//# sourceMappingURL=printer.entity.js.map