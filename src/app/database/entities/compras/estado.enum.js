"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PagoEstado = exports.CompraEstado = void 0;
/**
 * Enum for compra states
 */
var CompraEstado;
(function (CompraEstado) {
    CompraEstado["ABIERTO"] = "ABIERTO";
    CompraEstado["ACTIVO"] = "ACTIVO";
    CompraEstado["FINALIZADO"] = "FINALIZADO";
    CompraEstado["CANCELADO"] = "CANCELADO";
})(CompraEstado = exports.CompraEstado || (exports.CompraEstado = {}));
/**
 * Enum for pago states
 */
var PagoEstado;
(function (PagoEstado) {
    PagoEstado["ABIERTO"] = "ABIERTO";
    PagoEstado["PAGO_PARCIAL"] = "PAGO_PARCIAL";
    PagoEstado["PAGADO"] = "PAGADO";
    PagoEstado["CANCELADO"] = "CANCELADO";
})(PagoEstado = exports.PagoEstado || (exports.PagoEstado = {}));
//# sourceMappingURL=estado.enum.js.map