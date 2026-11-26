/**
 * Registro de proveedores de pago online. Para sumar uno: escribir su módulo (ver `tipos.ts`) y
 * agregarlo a `PROVEEDORES`.
 */
import { ProveedorPagoOnline } from './tipos';
import { upayProveedor, PROVEEDOR_UPAY } from './upay.proveedor';
import { bancardProveedor } from './bancard.proveedor';
import { icpayProveedor } from './icpay.proveedor';

const PROVEEDORES: ProveedorPagoOnline[] = [upayProveedor, bancardProveedor, icpayProveedor];

export { PROVEEDOR_UPAY };

/** Proveedor por id, o null si no existe (un pedido de un proveedor dado de baja). */
export function proveedorPorId(id: string | null | undefined): ProveedorPagoOnline | null {
  const k = String(id || '').toUpperCase();
  return PROVEEDORES.find((p) => p.id === k) || null;
}

/** Proveedor de un pedido ya cobrado o en curso. Los anteriores a `pago_proveedor` son de uPay. */
export function proveedorDelPedido(p: { pagoProveedor?: string | null }): ProveedorPagoOnline | null {
  return proveedorPorId(p.pagoProveedor || PROVEEDOR_UPAY);
}

/** Nombre para los textos («devolvé en Bancard»). Sin proveedor conocido, un genérico. */
export function nombreProveedor(id: string | null | undefined): string {
  return proveedorPorId(id || PROVEEDOR_UPAY)?.nombre || 'el proveedor de pago';
}

export function listarProveedores(): ProveedorPagoOnline[] {
  return [...PROVEEDORES];
}
