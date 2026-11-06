/**
 * Contrato de un proveedor de pago online de la tienda (PLAN-tienda-pagos-proveedores §1).
 *
 * Cada proveedor (uPay, Bancard, …) es un módulo que sabe cobrar, consultar y probar la conexión,
 * y opcionalmente recibir el aviso firmado del proveedor y devolver por API. Todo lo demás —estados
 * del pago, pago tardío, cola DEVOLVER, avisos, registro de eventos— es común y vive en
 * `pagos-online.service.ts`. Sumar un proveedor es escribir uno de estos y registrarlo en `index.ts`.
 */
import { DataSource } from 'typeorm';
import { TiendaOnlineConfig } from '../../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { ResultadoPago } from '../interpretar-pago';

export type FetchLike = (url: string, init?: any) => Promise<{ status: number; text(): Promise<string> }>;

/** Lo que el servicio le pasa al proveedor en cada llamada (inyectable en tests). */
export interface ContextoProveedor {
  fetch: FetchLike;
}

/** Error con un código que se devuelve tal cual al llamador (`upay_credenciales`, `bancard_error`…). */
export class ProveedorError extends Error {
  constructor(public codigo: string, message: string, public status?: number) {
    super(message);
  }
}

export interface ItemCobro {
  name: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
}

export interface CobroInput {
  /** Identifica el intento ante el proveedor: `<numero>-<intento>`. */
  referencia: string;
  idempotencyKey: string;
  /** Guaraníes enteros. */
  monto: number;
  /** Página de vuelta del storefront (`…/tienda/pago/<numero>`), sin parámetros. */
  urlVuelta: string;
  descripcion: string;
  items: ItemCobro[];
}

/** Cómo sigue el cliente después de crear el cobro. */
export type InicioCobro =
  /** El storefront redirige a la página del proveedor (uPay, Pagopar…). */
  | { tipo: 'REDIRECCION'; sesionId: string; url: string; expiraEn: Date | null; crudo: any }
  /** El storefront arma el formulario del proveedor en su página con su script (Bancard). */
  | { tipo: 'FORMULARIO'; sesionId: string; procesoId: string; script: string; expiraEn: Date | null; crudo: any };

/** Lo mínimo del pedido que necesita el proveedor para consultar o devolver. */
export interface CobroGuardado {
  sesionId: string;
  referencia: string;
  monto: number;
  pagoId?: string | null;
}

export interface ProveedorPagoOnline<C = any> {
  /** = `MetodoPagoOnline` y `pedidos_online.pago_proveedor`. */
  id: string;
  /** Para los textos: «devolvelo en Bancard». */
  nombre: string;
  /** Forma de pago del cobro anticipado en la venta (`formas_pago.nombre`). */
  formaPago: string;
  /** Hosts desde los que el storefront acepta redirigir o cargar el script del proveedor. */
  hosts: string[];
  /** Credenciales completas, o null si falta algo (el pago online no se ofrece). */
  credenciales(ds: DataSource, cfg: TiendaOnlineConfig | null): Promise<C | null>;
  iniciar(creds: C, input: CobroInput, ctx: ContextoProveedor): Promise<InicioCobro>;
  /** Pregunta al proveedor y traduce. Lanza `ProveedorError` si no se pudo saber (sigue pendiente). */
  consultar(creds: C, cobro: CobroGuardado, ctx: ContextoProveedor): Promise<{ resultado: ResultadoPago; crudo: any }>;
  probarConexion(creds: C, ctx: ContextoProveedor): Promise<{ ok: boolean; error?: string; detalle?: string }>;
  /** Devuelve por API (si el proveedor lo permite). */
  devolver?(creds: C, cobro: CobroGuardado, ctx: ContextoProveedor): Promise<{ ok: boolean; detalle: string; crudo?: any }>;
}
