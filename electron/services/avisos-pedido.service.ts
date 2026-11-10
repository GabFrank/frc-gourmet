/**
 * Avisos del pedido al cliente por WhatsApp (docs/planes/PLAN-tienda-avisos-whatsapp.md, fase 1).
 *
 * **Encolado por estado, no por puerta.** El pedido cambia de estado desde muchos lados (bandeja,
 * PdV, delivery, el job de pagos). En vez de encolar en cada uno, el tick mira el estado YA
 * GUARDADO de los pedidos que se movieron hace poco y encola un aviso por (pedido, evento) —
 * índice único: nunca sale dos veces—. Lo que se revierte no se ve, así que no hace falta encolar
 * dentro de cada transacción. Si un pedido pasa por dos estados entre dos ticks, sale solo el
 * último (el plan ya descartaba el aviso viejo).
 *
 * Reglas (auditoría 07/11):
 * - Solo con la casilla del checkout (`avisos_consentimiento_en`) y a un **teléfono verificado**
 *   (el de ingreso por código). Una cuenta de Google con teléfono de contacto sin verificar no
 *   recibe avisos hasta que se verifique (fase 2).
 * - Fuera de la app instalada (copias, `npm start`, servidor espejo, tests) salen **solo al
 *   teléfono de prueba**: la copia de la base tiene teléfonos reales de clientes.
 * - Tope por número (10 por hora, 30 por día). Caduca a las 2 h. Reintentos con espera creciente,
 *   máximo 5. Un número sin WhatsApp queda FALLIDO sin reintentar.
 * - Interruptor de la tienda apagado: no se encola, y lo pendiente se descarta.
 * - Sin teléfonos completos ni textos en los logs.
 */
import { DataSource } from 'typeorm';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PedidoOnlineAviso } from '../../src/app/database/entities/pedidos-online/pedido-online-aviso.entity';
import { TiendaOnlineConfig } from '../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { EstadoPagoOnline, EstadoPedidoOnline, TipoPedidoOnline, esMetodoPagoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { appInstalada, enviarAvisoWhatsapp, nombreComercioWhatsapp, numeroWhatsapp } from '../utils/whatsapp-sender';
import { urlPublicaTienda } from './pagos-online/pagos-online.service';

export type EventoAviso = 'ACEPTADO' | 'LISTO' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO';

const VENTANA_MS = 3 * 3600_000;
const CADUCA_MS = 2 * 3600_000;
const MAX_INTENTOS = 5;
const TOPE_HORA = 10;
const TOPE_DIA = 30;
const ENVIANDO_HUERFANO_MS = 5 * 60_000;
const PURGA_MS = 30 * 24 * 3600_000;

/** Qué aviso corresponde al estado actual del pedido (null = ninguno). */
export function eventoDe(p: Pick<PedidoOnline, 'estado' | 'tipoPedido' | 'estadoPago' | 'metodoPago'>): EventoAviso | null {
  if (p.tipoPedido === TipoPedidoOnline.MESA_QR) return null;
  switch (p.estado) {
    case EstadoPedidoOnline.ACEPTADO:
    case EstadoPedidoOnline.EN_PREPARACION:
      return 'ACEPTADO';
    case EstadoPedidoOnline.LISTO:
      // En delivery «listo» es interno: el aviso es «en camino».
      return p.tipoPedido === TipoPedidoOnline.PICKUP ? 'LISTO' : null;
    case EstadoPedidoOnline.EN_CAMINO:
      return 'EN_CAMINO';
    case EstadoPedidoOnline.ENTREGADO:
      return 'ENTREGADO';
    case EstadoPedidoOnline.RECHAZADO:
    case EstadoPedidoOnline.CANCELADO: {
      // Un pago online que nunca se cobró (venció, se rechazó): el cliente lo vio en la página de
      // pago y el pedido nunca entró al local; no se avisa.
      const sinCobro = [EstadoPagoOnline.PENDIENTE, EstadoPagoOnline.FALLIDO, EstadoPagoOnline.EXPIRADO, null, undefined];
      if (esMetodoPagoOnline(p.metodoPago as any) && sinCobro.includes(p.estadoPago as any)) return null;
      return 'CANCELADO';
    }
    default:
      return null;
  }
}

/** Texto del aviso (Evolution). Con Meta, cada evento es una plantilla con estos parámetros. */
export function textoAviso(evento: EventoAviso, p: Pick<PedidoOnline, 'numero' | 'estadoPago'>, comercio: string, base?: string): string {
  const quien = comercio || 'Tu pedido';
  const n = p.numero;
  let t: string;
  switch (evento) {
    case 'ACEPTADO': t = `${quien}: recibimos tu pedido ${n} y ya lo estamos preparando.`; break;
    case 'LISTO': t = `${quien}: tu pedido ${n} está listo para retirar.`; break;
    case 'EN_CAMINO': t = `${quien}: tu pedido ${n} salió y va en camino. El repartidor puede llamarte a este número.`; break;
    case 'ENTREGADO': t = `${quien}: tu pedido ${n} fue entregado. ¡Gracias!`; break;
    case 'CANCELADO': {
      const devuelve = [EstadoPagoOnline.REEMBOLSO_PENDIENTE, EstadoPagoOnline.DEVOLVIENDO, EstadoPagoOnline.DEVUELTO].includes(p.estadoPago as any);
      t = `${quien}: tu pedido ${n} fue cancelado.${devuelve ? ' Te devolvemos el pago.' : ''}`;
      break;
    }
  }
  const url = `${base ?? urlPublicaTienda()}/tienda/pedido/${encodeURIComponent(n)}`;
  return `${t} ${url}`;
}

let instaladaEnPruebas: boolean | null = null;
/** Solo tests: simula la app instalada (producción) o no. */
export function fijarAppInstaladaEnPruebas(v: boolean | null): void {
  instaladaEnPruebas = v;
}
const instalada = () => (instaladaEnPruebas ?? appInstalada());

const enmascarar = (t: string) => (t.length > 4 ? `…${t.slice(-4)}` : '…');

async function config(ds: DataSource): Promise<TiendaOnlineConfig | null> {
  return (await ds.getRepository(TiendaOnlineConfig).find({ order: { id: 'ASC' } as any, take: 1 }))[0] ?? null;
}

/** Encola los avisos de los pedidos que cambiaron hace poco. Devuelve cuántos encoló. */
export async function encolarAvisos(ds: DataSource, ahora = new Date()): Promise<number> {
  const repo = ds.getRepository(PedidoOnline);
  const pedidos = await repo.createQueryBuilder('p')
    .leftJoinAndSelect('p.cuentaCliente', 'c')
    .where('p.avisos_consentimiento_en IS NOT NULL')
    .andWhere('p.updated_at > :desde', { desde: new Date(ahora.getTime() - VENTANA_MS) })
    .andWhere('p.tipo_pedido <> :mesa', { mesa: TipoPedidoOnline.MESA_QR })
    .getMany();
  const avisos = ds.getRepository(PedidoOnlineAviso);
  const pg = ds.options.type === 'postgres';
  let n = 0;
  for (const p of pedidos) {
    const evento = eventoDe(p);
    const c: any = p.cuentaCliente;
    if (!evento || !c?.telefono || !c?.telefonoVerificado) continue;
    if (await avisos.count({ where: { pedidoOnlineId: p.id, evento } })) continue;
    const tel = numeroWhatsapp(String(c.telefono));
    const r = await ds.query(
      `INSERT ${pg ? '' : 'OR IGNORE '}INTO "pedido_online_avisos" ("pedido_online_id", "evento", "telefono", "estado", "intentos") VALUES (${pg ? '$1, $2, $3' : '?, ?, ?'}, 'PENDIENTE', 0)${pg ? ' ON CONFLICT DO NOTHING' : ''}`,
      [p.id, evento, tel],
    );
    void r;
    n++;
    // Lo que quedó sin salir de un estado anterior ya no sirve.
    await avisos.createQueryBuilder().update(PedidoOnlineAviso)
      .set({ estado: 'DESCARTADO', error: 'el pedido ya avanzó' } as any)
      .where('pedido_online_id = :id AND evento <> :ev AND estado = :pen', { id: p.id, ev: evento, pen: 'PENDIENTE' })
      .execute();
  }
  return n;
}

export interface ResultadoEnvio { enviados: number; fallidos: number; descartados: number }

/** Manda los avisos pendientes. */
export async function enviarAvisosPendientes(ds: DataSource, ahora = new Date()): Promise<ResultadoEnvio> {
  const res: ResultadoEnvio = { enviados: 0, fallidos: 0, descartados: 0 };
  const repo = ds.getRepository(PedidoOnlineAviso);
  const cfg = await config(ds);
  const marcar = async (id: number, cambios: Partial<PedidoOnlineAviso>) => repo.update({ id }, cambios as any);

  // Un ENVIANDO de un proceso que se cayó vuelve a la cola.
  await repo.createQueryBuilder().update(PedidoOnlineAviso).set({ estado: 'PENDIENTE' } as any)
    .where('estado = :e AND updated_at < :t', { e: 'ENVIANDO', t: new Date(ahora.getTime() - ENVIANDO_HUERFANO_MS) }).execute();

  const pendientes = await repo.createQueryBuilder('a')
    .where('a.estado = :e', { e: 'PENDIENTE' })
    .andWhere('(a.proximo_intento IS NULL OR a.proximo_intento <= :ahora)', { ahora })
    .orderBy('a.id', 'ASC').take(20).getMany();
  const prueba = numeroWhatsapp(String(cfg?.avisosTelefonoPrueba || process.env['FRC_AVISOS_TELEFONO_PRUEBA'] || ''));
  const comercio = String(cfg?.nombreComercio || nombreComercioWhatsapp() || '').trim();
  for (const a of pendientes) {
    const descartar = async (motivo: string) => { await marcar(a.id, { estado: 'DESCARTADO', error: motivo }); res.descartados++; };
    if (!cfg?.avisosWhatsapp) { await descartar('avisos apagados'); continue; }
    if (ahora.getTime() - new Date(a.createdAt).getTime() > CADUCA_MS) { await descartar('caducó (llegaría tarde)'); continue; }
    if (!instalada() && (!prueba || a.telefono !== prueba)) { await descartar('fuera de producción: solo sale al teléfono de prueba'); continue; }
    const p = await ds.getRepository(PedidoOnline).findOne({ where: { id: a.pedidoOnlineId } });
    if (!p || eventoDe(p) !== a.evento) { await descartar('el pedido ya avanzó'); continue; }
    const enviadosDesde = (ms: number) => repo.createQueryBuilder('x')
      .where('x.telefono = :t AND x.estado = :e AND x.enviado_en > :d', { t: a.telefono, e: 'ENVIADO', d: new Date(ahora.getTime() - ms) }).getCount();
    if ((await enviadosDesde(3600_000)) >= TOPE_HORA || (await enviadosDesde(24 * 3600_000)) >= TOPE_DIA) { await descartar('tope de avisos del número'); continue; }

    const claim = await repo.createQueryBuilder().update(PedidoOnlineAviso).set({ estado: 'ENVIANDO' } as any)
      .where('id = :id AND estado = :e', { id: a.id, e: 'PENDIENTE' }).execute();
    if (!claim.affected) continue;
    const r = await enviarAvisoWhatsapp(a.telefono, textoAviso(a.evento as EventoAviso, p, comercio));
    const intentos = (a.intentos || 0) + 1;
    if (r.ok) {
      await marcar(a.id, { estado: 'ENVIADO', enviadoEn: ahora, intentos, error: null });
      res.enviados++;
    } else if (r.detail === 'meta_sin_plantillas' || r.detail === 'sin_proveedor') {
      await marcar(a.id, { estado: 'DESCARTADO', intentos, error: r.detail === 'sin_proveedor' ? 'sin proveedor de WhatsApp' : 'Meta: faltan las plantillas de avisos' });
      res.descartados++;
    } else if (/exists"?\s*:\s*false|not.*whatsapp|no existe/i.test(r.detail || '') || intentos >= MAX_INTENTOS) {
      await marcar(a.id, { estado: 'FALLIDO', intentos, error: String(r.detail || 'error').slice(0, 255) });
      res.fallidos++;
      console.warn(`[avisos] pedido ${a.pedidoOnlineId} ${a.evento} a ${enmascarar(a.telefono)}: falló (${String(r.detail || '').slice(0, 80)})`);
    } else {
      await marcar(a.id, { estado: 'PENDIENTE', intentos, error: String(r.detail || 'error').slice(0, 255), proximoIntento: new Date(ahora.getTime() + 30_000 * 2 ** intentos) });
    }
  }
  return res;
}

/** Un ciclo: encolar, mandar y purgar lo viejo. */
export async function tickAvisosPedidos(ds: DataSource, ahora = new Date()): Promise<{ encolados: number } & ResultadoEnvio> {
  const cfg = await config(ds);
  const encolados = cfg?.avisosWhatsapp ? await encolarAvisos(ds, ahora) : 0;
  const envio = await enviarAvisosPendientes(ds, ahora);
  await ds.getRepository(PedidoOnlineAviso).createQueryBuilder().delete()
    .where('created_at < :t', { t: new Date(ahora.getTime() - PURGA_MS) }).execute();
  return { encolados, ...envio };
}

let timer: NodeJS.Timeout | null = null;
/** Arranca el job (solo en el servidor). */
export function iniciarJobAvisosPedidos(ds: DataSource): void {
  if (timer) return;
  let corriendo = false;
  const correr = async () => {
    if (corriendo || !ds.isInitialized) return;
    corriendo = true;
    try {
      await tickAvisosPedidos(ds);
    } catch (e: any) {
      console.warn('[avisos] job:', e?.message || e);
    } finally {
      corriendo = false;
    }
  };
  setTimeout(correr, 8_000);
  timer = setInterval(correr, 15_000);
}
export function detenerJobAvisosPedidos(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
