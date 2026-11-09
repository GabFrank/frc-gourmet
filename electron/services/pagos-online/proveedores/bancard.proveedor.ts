/**
 * Bancard vPOS como proveedor (PLAN-tienda-pagos-proveedores §4).
 *
 * El cobro no redirige: Bancard devuelve un `process_id` y el storefront arma el formulario de la
 * tarjeta en su página con el script de Bancard. El resultado llega por DOS caminos, y cualquiera
 * alcanza: el aviso firmado que Bancard manda a `/pub/pagos/bancard/aviso` y la consulta
 * (`single_buy/confirmations`) que hace el job. Bancard permite anular (`rollback`) antes del
 * cierre del lote: eso es la devolución automática.
 */
import { DataSource } from 'typeorm';
import { FORMA_PAGO_BANCARD } from '../../../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { TiendaOnlineConfig } from '../../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { valoresCompletos } from './config-proveedor';
import { BANCARD_SCRIPT, BancardConfig, BancardVposClient, baseBancard, clavesError } from './bancard-vpos.client';
import { interpretarConfirmacionBancard } from './interpretar-bancard';
import { ProveedorError, ProveedorPagoOnline } from './tipos';

export const PROVEEDOR_BANCARD = 'BANCARD';

/** Bancard todavía no tiene el pago de ese proceso (nadie pagó aún, o el cliente abandonó). */
const NO_ENCONTRADO = /PaymentNotFound|BuyNotFound|NotFound/i;
/** Ya estaba anulado: para la devolución es lo mismo que anularlo ahora. */
const YA_ANULADO = /AlreadyRollback|AlreadyRolledBack|Rollbacked/i;
/** Claves rechazadas por Bancard. */
const CREDENCIALES = /InvalidPublicKey|InvalidToken|Unauthorized/i;

/** Una sesión de Bancard sin pago, vencida hace más de esto, se da por vencida. */
const GRACIA_VENCIMIENTO_MS = 30 * 60_000;

function spidDe(sesionId: string): number {
  const n = Number(sesionId);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ProveedorError('bancard_error', `proceso inválido: ${sesionId}`);
  return n;
}

const proveedor: ProveedorPagoOnline<BancardConfig> = {
  id: PROVEEDOR_BANCARD,
  nombre: 'Bancard',
  etiqueta: 'Tarjeta — Bancard',
  medio: 'TARJETA',
  formaPago: FORMA_PAGO_BANCARD,
  hosts: ['vpos.infonet.com.py'],
  modo: 'FORMULARIO',
  scriptUrl: (creds) => baseBancard(creds) + BANCARD_SCRIPT,
  campos: [
    {
      clave: 'entorno', etiqueta: 'Entorno', requerido: true, porDefecto: 'PRUEBA',
      opciones: [{ valor: 'PRUEBA', etiqueta: 'Prueba (staging)' }, { valor: 'PRODUCCION', etiqueta: 'Producción' }],
      ayuda: 'Bancard habilita producción después de certificar la integración en prueba.',
    },
    {
      clave: 'publicKey', etiqueta: 'Clave pública', requerido: true, patron: '[A-Za-z0-9._-]{8,128}', maxLength: 128,
      ayuda: 'Portal de Comercios de Bancard › vPOS › claves del entorno elegido.',
    },
    { clave: 'privateKey', etiqueta: 'Clave privada', secreto: true, requerido: true, patron: '[A-Za-z0-9._-]{8,256}', maxLength: 256 },
  ],

  async credenciales(_ds: DataSource, cfg: TiendaOnlineConfig | null) {
    const v = await valoresCompletos(cfg, proveedor);
    if (!v) return null;
    return { publicKey: v['publicKey'], privateKey: v['privateKey'], entorno: v['entorno'] === 'PRODUCCION' ? 'PRODUCCION' : 'PRUEBA' };
  },

  async iniciar(creds, input, ctx) {
    const spid = input.procesoNumerico;
    const r = await new BancardVposClient(creds, ctx.fetch).cobro({
      spid,
      monto: input.monto,
      // Bancard muestra la descripción en su formulario: corta y sin datos del cliente.
      descripcion: input.descripcion.slice(0, 20),
      returnUrl: input.urlVuelta + '?r=ok',
      cancelUrl: input.urlVuelta + '?r=cancelado',
    });
    const claves = clavesError(r.body).join(',');
    if (r.status === 401 || r.status === 403 || CREDENCIALES.test(claves)) {
      throw new ProveedorError('bancard_credenciales', `Bancard rechazó las claves (${claves || r.status})`, r.status);
    }
    if (r.status < 200 || r.status >= 300 || r.body?.status !== 'success' || !r.body?.process_id) {
      throw new ProveedorError('bancard_error', `Bancard no creó el cobro (HTTP ${r.status}${claves ? ' · ' + claves : ''})`, r.status);
    }
    return {
      tipo: 'FORMULARIO',
      sesionId: String(spid),
      procesoId: String(r.body.process_id),
      script: baseBancard(creds) + BANCARD_SCRIPT,
      expiraEn: null,
      crudo: r.raw,
    };
  },

  async consultar(creds, cobro, ctx) {
    const spid = spidDe(cobro.sesionId);
    const r = await new BancardVposClient(creds, ctx.fetch).consulta(spid);
    const crudo = { status: r.status, body: r.body ?? r.raw };
    const claves = clavesError(r.body).join(',');
    if (r.status === 401 || r.status === 403 || CREDENCIALES.test(claves)) {
      throw Object.assign(new ProveedorError('bancard_credenciales', `Bancard rechazó las claves (${claves || r.status})`, r.status), { crudo });
    }
    if (r.body?.status === 'success' && r.body?.confirmation) {
      const { token: _t, ...sinToken } = r.body.confirmation;
      return {
        resultado: interpretarConfirmacionBancard(r.body.confirmation, { privateKey: creds.privateKey, spid, monto: cobro.monto }),
        crudo: { status: r.status, body: { ...r.body, confirmation: sinToken } },
      };
    }
    if (NO_ENCONTRADO.test(claves)) {
      // Bancard no informa sesiones vencidas: sin pago y pasado nuestro vencimiento, se da por vencida.
      const ahora = (cobro.ahora ?? new Date()).getTime();
      const vencida = cobro.expiraEn && ahora > new Date(cobro.expiraEn).getTime() + GRACIA_VENCIMIENTO_MS;
      return {
        resultado: vencida ? { tipo: 'EXPIRADO', detalle: 'sin pago en Bancard y la sesión venció' } : { tipo: 'PENDIENTE', detalle: 'Bancard todavía no tiene el pago' },
        crudo,
      };
    }
    throw Object.assign(new ProveedorError('bancard_error', `Bancard respondió HTTP ${r.status}${claves ? ' · ' + claves : ''}`, r.status), { crudo });
  },

  async procesarAviso(creds, body, buscar) {
    const op = body?.operation;
    const spid = Number(op?.shop_process_id);
    if (!op || !Number.isSafeInteger(spid) || spid <= 0) throw new ProveedorError('bancard_aviso_invalido', 'aviso sin shop_process_id');
    const cobro = await buscar(String(spid));
    if (!cobro) throw new ProveedorError('bancard_aviso_desconocido', `proceso ${spid} sin pedido`);
    const resultado = interpretarConfirmacionBancard(op, { privateKey: creds.privateKey, spid, monto: cobro.monto, exigirFirma: true });
    // Un aviso con firma inválida no es de Bancard: no se aplica y se responde error.
    if (resultado.tipo === 'INCONSISTENTE' && /token/.test(resultado.detalle)) {
      throw new ProveedorError('bancard_aviso_firma', resultado.detalle);
    }
    // Lo que se guarda en el historial va SIN el token: con él, cualquiera que lea la tabla podría
    // armar un aviso «aprobado» para el mismo cobro (el token no cubre la respuesta).
    const { token: _t, ...sinToken } = op;
    return { sesionId: String(spid), resultado, crudo: { operation: sinToken }, respuesta: { status: 'success' } };
  },

  async devolver(creds, cobro, ctx) {
    const spid = spidDe(cobro.sesionId);
    const r = await new BancardVposClient(creds, ctx.fetch).anulacion(spid);
    const claves = clavesError(r.body).join(',');
    if ((r.status >= 200 && r.status < 300 && r.body?.status === 'success') || YA_ANULADO.test(claves)) {
      return { ok: true, detalle: YA_ANULADO.test(claves) ? 'ya estaba anulado en Bancard' : 'anulado en Bancard', crudo: r.body ?? r.raw };
    }
    return { ok: false, detalle: `Bancard no lo anuló (${claves || 'HTTP ' + r.status})`, crudo: r.body ?? r.raw };
  },

  async probarConexion(creds, ctx) {
    // Consulta un proceso que no existe: «no encontrado» = las claves sirven.
    try {
      const r = await new BancardVposClient(creds, ctx.fetch).consulta(1);
      const claves = clavesError(r.body).join(',');
      if (r.status === 401 || r.status === 403 || CREDENCIALES.test(claves)) return { ok: false, error: 'bancard_credenciales', detalle: claves || undefined };
      if (NO_ENCONTRADO.test(claves) || r.body?.status === 'success') return { ok: true };
      return { ok: false, error: 'bancard_error', detalle: claves || `HTTP ${r.status}` };
    } catch (e: any) {
      return { ok: false, error: 'bancard_sin_conexion', detalle: e?.message || String(e) };
    }
  },

  datosPortal(urlPublica: string) {
    return [{ etiqueta: 'URL de confirmación (cargala en el portal de Bancard)', valor: `${urlPublica}/pub/pagos/bancard/aviso` }];
  },
};

export const bancardProveedor = proveedor;
