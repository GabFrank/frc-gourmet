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
exports.ComboItem = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../base.entity");
/**
 * Entity representing a combo item
 */
let ComboItem = class ComboItem extends base_entity_1.BaseModel {
};
__decorate([
    (0, typeorm_1.Column)({ name: 'combo_id' }),
    __metadata("design:type", Number)
], ComboItem.prototype, "comboId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Combo', 'items'),
    (0, typeorm_1.JoinColumn)({ name: 'combo_id' }),
    __metadata("design:type", Function)
], ComboItem.prototype, "combo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'presentacion_id' }),
    __metadata("design:type", Number)
], ComboItem.prototype, "presentacionId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)('Presentacion', 'comboItems'),
    (0, typeorm_1.JoinColumn)({ name: 'presentacion_id' }),
    __metadata("design:type", Function)
], ComboItem.prototype, "presentacion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 1 }),
    __metadata("design:type", Number)
], ComboItem.prototype, "cantidad", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], ComboItem.prototype, "activo", void 0);
ComboItem = __decorate([
    (0, typeorm_1.Entity)('producto_combo_items')
], ComboItem);
exports.ComboItem = ComboItem;
//# sourceMappingURL=combo-item.entity.js.map