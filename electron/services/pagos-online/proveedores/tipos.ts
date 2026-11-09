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
  /** El mismo intento como entero único (`pedido.id * 100 + intento`), para quien lo exige (Bancard). */
  procesoNumerico: number;
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
  | { tipo: 'FORMULARIO'; sesionId: string; procesoId: string; script: string; expiraEn: Date | null; crudo: any }
  /**
   * El storefront dibuja un QR (y el «copia e cola») con `qr.payload` y consulta hasta que se pague
   * (IC Pay / Pix). `datos` se guarda en el pedido (`pago_datos_json`) para mostrarlo de nuevo y
   * para verificar el cobro.
   */
  | { tipo: 'QR'; sesionId: string; qr: DatosQr; expiraEn: Date | null; datos: Record<string, any>; crudo: any };

/** Lo que el cliente ve para pagar con un QR (no es secreto: es lo mismo que muestra la pantalla). */
export interface DatosQr {
  /** Cadena EMV del QR (Pix «copia e cola»). */
  payload: string;
  /** Lo que paga el cliente en la moneda del proveedor (p. ej. R$ 5,64). */
  moneda: string;
  monto: string;
  /** Vencimiento del QR (ISO). */
  expiraEn: string | null;
}

/** Lo mínimo del pedido que necesita el proveedor para consultar o devolver. */
export interface CobroGuardado {
  sesionId: string;
  referencia: string;
  monto: number;
  pagoId?: string | null;
  /** Vencimiento propio de la sesión (para quien no informa sesiones vencidas). */
  expiraEn?: Date | null;
  /** «Ahora» del servicio (inyectable en tests). */
  ahora?: Date;
  /** `pago_datos_json` del intento (lo que devolvió `iniciar` en `datos`). */
  datos?: Record<string, any> | null;
}

/**
 * Un dato de configuración del proveedor. La pantalla de la tienda los dibuja y el servidor los
 * valida a partir de esta lista: sumar un proveedor no toca la pantalla.
 * - Los NO secretos van a `tienda_online_config.pago_config_json`.
 * - Los secretos (`secreto: true`) van al almacén seguro y nunca vuelven a la pantalla.
 */
export interface CampoProveedor {
  clave: string;
  etiqueta: string;
  secreto?: boolean;
  requerido?: boolean;
  /** Para elegir entre valores fijos (p. ej. entorno de prueba o producción). */
  opciones?: { valor: string; etiqueta: string }[];
  /** Expresión regular que tiene que cumplir (fuente, sin barras). */
  patron?: string;
  maxLength?: number;
  ayuda?: string;
  /** Valor si no se cargó nada (solo no secretos). */
  porDefecto?: string;
}

export interface ProveedorPagoOnline<C = any> {
  /** = `MetodoPagoOnline` y `pedidos_online.pago_proveedor`. */
  id: string;
  /** Para los textos: «devolvelo en Bancard». */
  nombre: string;
  /** Lo que ve el cliente en el checkout: «Tarjeta — Bancard», «Pix (Brasil)». */
  etiqueta: string;
  /** Con qué paga el cliente (para el ícono y la ayuda del checkout). */
  medio: 'TARJETA' | 'PIX';
  /** Forma de pago del cobro anticipado en la venta (`formas_pago.nombre`). */
  formaPago: string;
  /** Hosts desde los que el storefront acepta redirigir o cargar el script del proveedor. */
  hosts: string[];
  /** Cómo paga el cliente: lo redirigimos, el formulario del proveedor va en nuestra página, o un QR. */
  modo: 'REDIRECCION' | 'FORMULARIO' | 'QR';
  /** URL del script del formulario (solo `FORMULARIO`), según el entorno de las credenciales. */
  scriptUrl?(creds: C): string;
  /**
   * Datos que pide la pantalla de config. Vacío = el proveedor tiene su propio bloque (uPay, de
   * antes de que existiera esta lista, sigue con sus columnas `upay_*`).
   */
  campos: CampoProveedor[];
  /** Credenciales completas, o null si falta algo (el pago online no se ofrece). */
  credenciales(ds: DataSource, cfg: TiendaOnlineConfig | null): Promise<C | null>;
  iniciar(creds: C, input: CobroInput, ctx: ContextoProveedor): Promise<InicioCobro>;
  /** Pregunta al proveedor y traduce. Lanza `ProveedorError` si no se pudo saber (sigue pendiente). */
  consultar(creds: C, cobro: CobroGuardado, ctx: ContextoProveedor): Promise<{ resultado: ResultadoPago; crudo: any }>;
  probarConexion(creds: C, ctx: ContextoProveedor): Promise<{ ok: boolean; error?: string; detalle?: string }>;
  /** Devuelve por API (si el proveedor lo permite). */
  devolver?(creds: C, cobro: CobroGuardado, ctx: ContextoProveedor): Promise<{ ok: boolean; detalle: string; crudo?: any }>;
  /**
   * Aviso que el proveedor manda a `/pub/pagos/<id>/aviso` (webhook). Verifica la firma y dice de
   * qué cobro es y qué significa. Lanza `ProveedorError` si la firma no es válida.
   */
  procesarAviso?(creds: C, body: any, buscar: (sesionId: string) => Promise<CobroGuardado | null>):
    Promise<{ sesionId: string; resultado: ResultadoPago; crudo: any; respuesta: any }>;
  /** Datos para cargar en el portal del proveedor (p. ej. la URL de confirmación). */
  datosPortal?(urlPublica: string): { etiqueta: string; valor: string }[];
}
