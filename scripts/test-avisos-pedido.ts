/**
 * Avisos del pedido al cliente por WhatsApp (PLAN-tienda-avisos-whatsapp, fase 1).
 * Envío simulado (fetch de Evolution inyectado), sin red.
 *
 * Uso: npm run test:avisos-pedido   ·   TIENDA_PG=<base vacía> … (Postgres)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { PedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PedidoOnlineAviso } from '../src/app/database/entities/pedidos-online/pedido-online-aviso.entity';
import { CuentaCliente } from '../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import { TiendaOnlineConfig } from '../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { EstadoPagoOnline, EstadoPedidoOnline, TipoPedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.enums';
import { encolarAvisos, avisoDe, eventoDe, fijarAppInstaladaEnPruebas, fijarRefrescoCanalEnPruebas, textoAviso, tickAvisosPedidos } from '../electron/services/avisos-pedido.service';
import { setWhatsappFetch, setWhatsappOverrides } from '../electron/utils/whatsapp-sender';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra?: any) {
  if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const PRUEBA = '595982000111';
interface Envio { numero: string; texto: string; url?: string; plantilla?: any }
const envios: Envio[] = [];
let respuesta: { status: number; body: any } = { status: 201, body: { key: { id: 'x' } } };

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-avisos-pedido.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log(`[avisos-pedido] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  setWhatsappOverrides({ proveedor: 'EVOLUTION', evolutionUrl: 'https://evo.ejemplo', evolutionInstancia: 'frc', evolutionApiKey: 'k-secreta', nombreComercio: 'X' });
  setWhatsappFetch(async (_url: string, init: any) => {
    const b = JSON.parse(init.body);
    // Evolution manda { number, text }; Meta, { to, template }.
    envios.push({ numero: b.number ?? b.to, texto: b.text ?? '', url: _url, plantilla: b.template });
    return { ok: respuesta.status < 300, status: respuesta.status, text: async () => JSON.stringify(respuesta.body) };
  });
  fijarAppInstaladaEnPruebas(false);
  fijarRefrescoCanalEnPruebas(false);

  const cfgRepo = ds.getRepository(TiendaOnlineConfig);
  const cfg = (await cfgRepo.find({ take: 1 }))[0] || await cfgRepo.save(cfgRepo.create({ activa: true, permitePickup: true, permiteDelivery: true, prepTimeMinutos: 30 } as any) as any);
  await cfgRepo.update({ id: (cfg as any).id }, { nombreComercio: 'LA COCINA', avisosWhatsapp: false, avisosTelefonoPrueba: PRUEBA } as any);
  const cuentas = ds.getRepository(CuentaCliente);
  const cuenta = async (tel: string, verificado = true) => cuentas.save(cuentas.create({ telefono: tel, telefonoVerificado: verificado, nombre: 'CLIENTE', activo: true } as any) as any) as Promise<CuentaCliente>;
  const cPrueba = await cuenta(PRUEBA);
  const repo = ds.getRepository(PedidoOnline);
  const avisos = ds.getRepository(PedidoOnlineAviso);
  let seq = 0;
  const pedido = async (c: CuentaCliente | null, extra: any = {}) => repo.save(repo.create({
    numero: `PO-${String(++seq).padStart(6, '0')}`, tipoPedido: TipoPedidoOnline.PICKUP, estado: EstadoPedidoOnline.RECIBIDO,
    pagoModalidad: 'AL_RECIBIR', metodoPago: 'EFECTIVO', subtotal: 50000, costoEnvio: 0, total: 50000, items: [],
    cuentaCliente: c ? ({ id: c.id } as any) : null, avisosConsentimientoEn: new Date(), ...extra,
  } as any) as any) as Promise<PedidoOnline>;
  const estado = (p: PedidoOnline, e: EstadoPedidoOnline, extra: any = {}) => repo.update({ id: p.id }, { estado: e, ...extra } as any);
  const de = (p: PedidoOnline) => avisos.find({ where: { pedidoOnlineId: p.id }, order: { id: 'ASC' } });
  const tick = (ahora?: Date) => tickAvisosPedidos(ds, ahora);

  console.log('Qué aviso corresponde a cada estado');
  const ev = (estado: string, tipoPedido = 'PICKUP', estadoPago: any = null, metodoPago = 'EFECTIVO') => eventoDe({ estado, tipoPedido, estadoPago, metodoPago } as any);
  ok(ev('RECIBIDO') === null && ev('ACEPTADO') === 'ACEPTADO' && ev('EN_PREPARACION') === 'ACEPTADO', 'recibido no avisa; aceptado y en preparación avisan «aceptado»');
  ok(ev('LISTO') === 'LISTO' && ev('LISTO', 'DELIVERY') === null && ev('EN_CAMINO', 'DELIVERY') === 'EN_CAMINO', 'listo solo en retiro; en delivery, «en camino»');
  ok(ev('ENTREGADO') === 'ENTREGADO' && ev('ACEPTADO', 'MESA_QR') === null, 'entregado avisa; mesa nunca');
  ok(ev('CANCELADO', 'PICKUP', 'EXPIRADO', 'ICPAY') === null && ev('CANCELADO', 'PICKUP', 'REEMBOLSO_PENDIENTE', 'ICPAY') === 'CANCELADO' && ev('RECHAZADO') === 'CANCELADO',
    'un pago online que nunca se cobró no avisa la cancelación; uno cobrado y el efectivo sí');
  const t = textoAviso('CANCELADO', { numero: 'PO-1', estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any, 'LA COCINA', 'https://app.x');
  ok(/LA COCINA: tu pedido PO-1 fue cancelado\. Te devolvemos el pago\. https:\/\/app\.x\/tienda\/pedido\/PO-1$/.test(t), 'el texto lleva comercio, número, devolución y el enlace al pedido', t);

  console.log('Apagado / encendido');
  const p1 = await pedido(cPrueba);
  await estado(p1, EstadoPedidoOnline.ACEPTADO);
  await tick();
  ok((await de(p1)).length === 0 && envios.length === 0, 'con el interruptor apagado no se encola nada');
  await cfgRepo.update({ id: (cfg as any).id }, { avisosWhatsapp: true } as any);
  await tick();
  const a1 = await de(p1);
  ok(a1.length === 1 && a1[0].evento === 'ACEPTADO' && a1[0].estado === 'ENVIADO' && !!a1[0].enviadoEn, 'encendido: aceptado → un aviso, enviado', a1);
  ok(envios.length === 1 && envios[0].numero === PRUEBA && /LA COCINA: recibimos tu pedido PO-000001/.test(envios[0].texto), 'sale por Evolution al teléfono, con el texto del evento', envios[0]);
  await tick();
  await estado(p1, EstadoPedidoOnline.EN_PREPARACION);
  await tick();
  ok((await de(p1)).length === 1 && envios.length === 1, 'otro tick o pasar a «en preparación» no lo repite');
  await estado(p1, EstadoPedidoOnline.LISTO);
  await tick();
  ok((await de(p1)).map((a) => a.evento).join() === 'ACEPTADO,LISTO' && envios.length === 2 && /listo para retirar/.test(envios[1].texto), 'listo para retirar → su aviso');
  await estado(p1, EstadoPedidoOnline.ENTREGADO);
  await tick();
  ok(envios.length === 3 && /fue entregado\. ¡Gracias!/.test(envios[2].texto), 'entregado → «¡Gracias!»');

  console.log('Quién recibe');
  const sinConsent = await pedido(cPrueba, { avisosConsentimientoEn: null });
  await estado(sinConsent, EstadoPedidoOnline.ACEPTADO);
  const sinVerif = await pedido(await cuenta('595981777666', false));
  await estado(sinVerif, EstadoPedidoOnline.ACEPTADO);
  const invitado = await pedido(null);
  await estado(invitado, EstadoPedidoOnline.ACEPTADO);
  const mesa = await pedido(cPrueba, { tipoPedido: TipoPedidoOnline.MESA_QR });
  await estado(mesa, EstadoPedidoOnline.ACEPTADO);
  await tick();
  ok((await de(sinConsent)).length + (await de(sinVerif)).length + (await de(invitado)).length + (await de(mesa)).length === 0 && envios.length === 3,
    'sin la casilla, con teléfono sin verificar, invitado o mesa → nada');
  const otro = await pedido(await cuenta('595981555444'));
  await estado(otro, EstadoPedidoOnline.ACEPTADO);
  await tick();
  const ao = await de(otro);
  ok(ao[0]?.estado === 'DESCARTADO' && /solo sale al teléfono de prueba/.test(ao[0]?.error || '') && envios.length === 3, 'fuera de la app instalada, otro número no recibe (la copia tiene clientes reales)', ao);
  fijarAppInstaladaEnPruebas(true);
  const otro2 = await pedido(await cuenta('0981555333'));
  await estado(otro2, EstadoPedidoOnline.ACEPTADO);
  await tick();
  ok((await de(otro2))[0]?.estado === 'ENVIADO' && envios[envios.length - 1].numero === '595981555333', 'en la app instalada sí, al número normalizado (0981… → 595981…)');
  fijarAppInstaladaEnPruebas(false);

  console.log('Preferencia de la cuenta («Mi cuenta»)');
  fijarAppInstaladaEnPruebas(true);
  const conPref = await cuenta('595981222111');
  await cuentas.update({ id: conPref.id }, { avisosWhatsapp: true } as any);
  const pp1 = await pedido(conPref, { avisosConsentimientoEn: null });
  await estado(pp1, EstadoPedidoOnline.ACEPTADO);
  await tick();
  ok((await de(pp1))[0]?.estado === 'ENVIADO', 'con los avisos prendidos en la cuenta sale aunque ese checkout no tildara la casilla');
  const sinPref = await cuenta('595981222000');
  await cuentas.update({ id: sinPref.id }, { avisosWhatsapp: false } as any);
  const pp2 = await pedido(sinPref);
  await estado(pp2, EstadoPedidoOnline.ACEPTADO);
  await tick();
  ok((await de(pp2)).length === 0, 'apagados en la cuenta: no se encola aunque el pedido tenga la casilla');
  const tarde = await cuenta('595981222333');
  const pp3 = await pedido(tarde);
  await estado(pp3, EstadoPedidoOnline.ACEPTADO);
  await encolarAvisos(ds);
  await cuentas.update({ id: tarde.id }, { avisosWhatsapp: false } as any);
  const nPrev = envios.length;
  await tick();
  const ap3 = await de(pp3);
  ok(ap3[0]?.estado === 'DESCARTADO' && /apagó/.test(ap3[0]?.error || '') && envios.length === nPrev, 'apagarlos con un aviso pendiente lo descarta', ap3);
  fijarAppInstaladaEnPruebas(false);

  console.log('Cancelaciones');
  const pagadoOnline = await pedido(cPrueba, { metodoPago: 'ICPAY', pagoModalidad: 'ONLINE' });
  await estado(pagadoOnline, EstadoPedidoOnline.CANCELADO, { estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE });
  const vencido = await pedido(cPrueba, { metodoPago: 'ICPAY', pagoModalidad: 'ONLINE', estado: EstadoPedidoOnline.PENDIENTE_PAGO });
  await estado(vencido, EstadoPedidoOnline.CANCELADO, { estadoPago: EstadoPagoOnline.EXPIRADO });
  const n0 = envios.length;
  await tick();
  ok(envios.length === n0 + 1 && /cancelado\. Te devolvemos el pago/.test(envios[envios.length - 1].texto) && (await de(vencido)).length === 0,
    'cancelado con pago cobrado → «te devolvemos el pago»; un pago que venció sin cobrarse no avisa');

  console.log('Reintentos, fallas y caducidad');
  respuesta = { status: 500, body: { message: 'caído' } };
  const r1 = await pedido(cPrueba);
  await estado(r1, EstadoPedidoOnline.ACEPTADO);
  await tick();
  let ar = (await de(r1))[0];
  ok(ar.estado === 'PENDIENTE' && ar.intentos === 1 && !!ar.proximoIntento, 'Evolution caído → queda pendiente para reintentar', ar);
  await tick();
  ok((await de(r1))[0].intentos === 1, 'antes del próximo intento no se vuelve a mandar');
  for (let i = 0; i < 6; i++) await tick(new Date(Date.now() + 40 * 60_000 * 0 + (i + 1) * 20 * 60_000 / 4));
  ar = (await de(r1))[0];
  ok(ar.estado === 'FALLIDO' && ar.intentos === 5, 'a los 5 intentos queda FALLIDO', ar);
  respuesta = { status: 400, body: { response: { message: [{ exists: false, number: PRUEBA }] } } };
  const r2 = await pedido(cPrueba);
  await estado(r2, EstadoPedidoOnline.ACEPTADO);
  await tick();
  ok((await de(r2))[0].estado === 'FALLIDO' && (await de(r2))[0].intentos === 1, 'número sin WhatsApp → FALLIDO sin reintentar', await de(r2));
  respuesta = { status: 500, body: {} };
  const r3 = await pedido(cPrueba, { tipoPedido: TipoPedidoOnline.DELIVERY });
  await estado(r3, EstadoPedidoOnline.ACEPTADO);
  await tick();
  respuesta = { status: 201, body: {} };
  await estado(r3, EstadoPedidoOnline.EN_CAMINO);
  await tick(new Date(Date.now() + 5 * 60_000));
  const a3 = await de(r3);
  ok(a3.find((a) => a.evento === 'ACEPTADO')?.estado === 'DESCARTADO' && a3.find((a) => a.evento === 'EN_CAMINO')?.estado === 'ENVIADO', 'si el pedido avanzó, el aviso viejo se descarta y sale el nuevo', a3.map((a) => [a.evento, a.estado]));
  respuesta = { status: 500, body: {} };
  const r4 = await pedido(cPrueba);
  await estado(r4, EstadoPedidoOnline.ACEPTADO);
  await tick();
  respuesta = { status: 201, body: {} };
  await tick(new Date(Date.now() + 3 * 3600_000));
  ok((await de(r4))[0].estado === 'DESCARTADO' && /caducó/.test((await de(r4))[0].error || ''), 'un aviso que no salió en 2 h caduca (llegaría tarde)');

  console.log('Tope y proveedor');
  for (let i = 0; i < 4; i++) await avisos.save(avisos.create({ pedidoOnlineId: 90000 + i, evento: 'ACEPTADO', telefono: PRUEBA, estado: 'ENVIADO', intentos: 1 } as any));
  await avisos.createQueryBuilder().update(PedidoOnlineAviso).set({ estado: 'ENVIADO', enviadoEn: new Date() } as any).where('telefono = :t', { t: PRUEBA }).execute();
  const enviadosHora = await avisos.count({ where: { telefono: PRUEBA, estado: 'ENVIADO' } });
  const r5 = await pedido(cPrueba);
  await estado(r5, EstadoPedidoOnline.ACEPTADO);
  const n5 = envios.length;
  await tick();
  ok(enviadosHora >= 10 && (await de(r5))[0].estado === 'DESCARTADO' && /tope/.test((await de(r5))[0].error || '') && envios.length === n5, 'con 10 avisos en la última hora al mismo número, no sale otro', enviadosHora);
  await avisos.createQueryBuilder().update(PedidoOnlineAviso).set({ enviadoEn: new Date(Date.now() - 2 * 86400_000) } as any).where('telefono = :t', { t: PRUEBA }).execute();
  setWhatsappOverrides({ proveedor: 'META', token: 't-meta', phoneNumberId: '1' });
  respuesta = { status: 200, body: { messages: [{ id: 'wamid.x' }] } };
  const r6 = await pedido(cPrueba);
  await estado(r6, EstadoPedidoOnline.ACEPTADO);
  const n6 = envios.length;
  await tick();
  const m6 = envios[n6];
  const p6: string[] = (m6?.plantilla?.components?.[0]?.parameters || []).map((x: any) => x.text);
  ok((await de(r6))[0].estado === 'ENVIADO' && /graph\.facebook\.com\/v20\.0\/1\/messages/.test(m6?.url || '')
    && m6?.plantilla?.name === 'aviso_pedido_aceptado_v2' && m6?.plantilla?.language?.code === 'es'
    && p6[0] === 'LA COCINA' && p6[1] === r6.numero && String(p6[2] || '').endsWith(`/tienda/pedido/${r6.numero}`)
    && m6?.numero === PRUEBA, 'con Meta sale la plantilla del evento con comercio, número y enlace', m6?.plantilla);
  respuesta = { status: 400, body: { error: { code: 131030, message: 'Recipient phone number not in allowed list' } } };
  const r6b = await pedido(cPrueba);
  await estado(r6b, EstadoPedidoOnline.ACEPTADO);
  await tick();
  const a6b = (await de(r6b))[0];
  ok(a6b.estado === 'FALLIDO' && a6b.intentos === 1 && /#131030/.test(a6b.error || ''), 'Meta: un error que no se arregla reintentando (#131030) queda FALLIDO al primer intento', a6b.error);
  ok(!/t-meta/.test(a6b.error || ''), 'el token de Meta nunca va en el error guardado');
  respuesta = { status: 201, body: {} };
  const cDev = avisoDe('CANCELADO', { numero: 'PO-9', estadoPago: EstadoPagoOnline.DEVUELTO } as any, 'LA COCINA', 'https://t');
  const cSin = avisoDe('CANCELADO', { numero: 'PO-9', estadoPago: null } as any, '', 'https://t');
  ok(cDev.plantilla === 'CANCELADO_DEVOLUCION' && cSin.plantilla === 'CANCELADO' && cSin.parametros[0] === 'el local' && cSin.parametros[2] === 'https://t/tienda/pedido/PO-9',
    'cancelado con el pago devuelto usa la plantilla con devolución; sin comercio cargado dice «el local»');
  setWhatsappOverrides({ proveedor: 'EVOLUTION', evolutionUrl: 'https://evo.ejemplo', evolutionInstancia: 'frc', evolutionApiKey: 'k-secreta' });
  await cfgRepo.update({ id: (cfg as any).id }, { avisosWhatsapp: false } as any);
  const r7 = await pedido(cPrueba);
  await avisos.save(avisos.create({ pedidoOnlineId: r7.id, evento: 'ACEPTADO', telefono: PRUEBA, estado: 'PENDIENTE', intentos: 0 } as any));
  await tick();
  ok((await de(r7))[0].estado === 'DESCARTADO', 'apagar el interruptor descarta lo pendiente');
  let duplicado = false;
  try { await avisos.save(avisos.create({ pedidoOnlineId: r7.id, evento: 'ACEPTADO', telefono: PRUEBA, estado: 'PENDIENTE' } as any)); } catch { duplicado = true; }
  ok(duplicado, 'la base no admite dos avisos del mismo evento para un pedido');
  ok(!envios.some((e) => /k-secreta/.test(e.texto)), 'la API key nunca va en el texto');

  await ds.destroy();
  console.log(`\n[avisos-pedido] ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('[avisos-pedido] FATAL', e); process.exit(1); });
