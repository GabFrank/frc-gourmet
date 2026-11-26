/**
 * Tienda F9: envío del código de ingreso por WhatsApp con dos proveedores (Meta oficial o el
 * número del local por Evolution API). Sin red: `fetch` simulado.
 *
 *  [1] qué proveedor sale (el elegido si está cargado; si no, el otro; ninguno = no hay ingreso)
 *  [2] Evolution: URL, encabezado apikey, número con 595, texto con el comercio, sin redirecciones
 *  [3] la clave nunca aparece en el detalle de un error
 *  [4] un error de envío NO cae al otro proveedor (sería mandar dos códigos)
 *  [5] Meta sigue igual
 *
 * Uso: npm run test:whatsapp-proveedores
 */
import {
  numeroWhatsapp, otpWhatsappDisponible, proveedorWhatsappActivo, sendWhatsappOtp,
  setWhatsappFetch, setWhatsappOverrides, whatsappConfigurado,
} from '../electron/utils/whatsapp-sender';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

for (const k of ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'EVOLUTION_URL', 'EVOLUTION_INSTANCIA', 'EVOLUTION_API_KEY', 'WHATSAPP_PROVEEDOR', 'FRC_OTP_DEV']) delete process.env[k];
// Los logs de error del sender no ensucian la salida del test.
const errOriginal = console.error;

const META = { token: 'tok-meta', phoneNumberId: '123456' };
const EVO = { evolutionUrl: 'https://evo.local/', evolutionInstancia: 'frc gourmet', evolutionApiKey: 'CLAVE-SECRETA-123' };

type Llamada = { url: string; init: any };
let llamadas: Llamada[] = [];
function responder(status: number, body = '{}', lanzar?: string) {
  llamadas = [];
  setWhatsappFetch(async (url, init) => {
    llamadas.push({ url, init });
    if (lanzar) throw new Error(lanzar);
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  });
}

async function main() {
  console.log('\n[1] Proveedor activo');
  setWhatsappOverrides({});
  ok(proveedorWhatsappActivo() === null && !whatsappConfigurado() && !otpWhatsappDisponible(), '1: sin nada cargado no hay ingreso por WhatsApp');
  setWhatsappOverrides({ ...META });
  ok(proveedorWhatsappActivo() === 'META', '1: sólo Meta → Meta (también sin elegir)');
  setWhatsappOverrides({ ...EVO });
  ok(proveedorWhatsappActivo() === 'EVOLUTION', '1: elegido Meta pero sólo hay Evolution → Evolution');
  setWhatsappOverrides({ ...META, ...EVO, proveedor: 'EVOLUTION' });
  ok(proveedorWhatsappActivo() === 'EVOLUTION', '1: los dos cargados → el elegido (Evolution)');
  setWhatsappOverrides({ ...META, ...EVO, proveedor: 'META' });
  ok(proveedorWhatsappActivo() === 'META', '1: los dos cargados → el elegido (Meta)');
  setWhatsappOverrides({ ...META, evolutionUrl: 'https://evo.local', evolutionInstancia: 'x', proveedor: 'EVOLUTION' });
  ok(proveedorWhatsappActivo() === 'META', '1: Evolution sin clave no cuenta como configurado');

  console.log('\n[2] Evolution');
  setWhatsappOverrides({ ...EVO, proveedor: 'EVOLUTION', nombreComercio: 'DON FRANCO' });
  responder(201, '{"key":{"id":"x"}}');
  const r2 = await sendWhatsappOtp('0981 123-456', '482913');
  const ll = llamadas[0];
  const body = ll ? JSON.parse(ll.init.body) : {};
  ok(r2.ok && r2.provider === 'evolution', '2: envío correcto', r2);
  ok(ll?.url === 'https://evo.local/message/sendText/frc%20gourmet', '2: URL sin barra doble y con la instancia codificada', ll?.url);
  ok(ll?.init?.headers?.apikey === 'CLAVE-SECRETA-123' && ll.init.method === 'POST' && ll.init.redirect === 'manual',
    '2: clave en el encabezado apikey, POST y sin seguir redirecciones', ll?.init && { h: Object.keys(ll.init.headers), r: ll.init.redirect });
  ok(body.number === '595981123456', '2: número local 0981… → 595981…', body.number);
  ok(/482913/.test(body.text) && /DON FRANCO/.test(body.text) && body.textMessage?.text === body.text,
    '2: el texto lleva el código y el comercio (formato nuevo y viejo de Evolution)', body.text);
  ok(numeroWhatsapp('981123456') === '595981123456' && numeroWhatsapp('595981123456') === '595981123456' && numeroWhatsapp('+54 9 11 5555 1234') === '5491155551234',
    '2: normalización del número (sólo al enviar)');

  console.log('\n[3] La clave no se filtra');
  console.error = () => undefined;
  responder(401, '{"message":"apikey CLAVE-SECRETA-123 invalida"}');
  const r3 = await sendWhatsappOtp('0981123456', '111111');
  ok(!r3.ok && r3.provider === 'evolution' && /401/.test(r3.detail || '') && !(r3.detail || '').includes('CLAVE-SECRETA-123'),
    '3: error HTTP sin la clave en el detalle', r3);
  responder(0, '', 'connect ECONNREFUSED https://evo.local?apikey=CLAVE-SECRETA-123');
  const r3b = await sendWhatsappOtp('0981123456', '111111');
  ok(!r3b.ok && !(r3b.detail || '').includes('CLAVE-SECRETA-123'), '3: error de red sin la clave', r3b);

  console.log('\n[4] Sin doble envío');
  setWhatsappOverrides({ ...META, ...EVO, proveedor: 'EVOLUTION' });
  responder(500, '{"message":"instancia desconectada"}');
  const r4 = await sendWhatsappOtp('0981123456', '222222');
  ok(!r4.ok && llamadas.length === 1 && llamadas[0].url.startsWith('https://evo.local'),
    '4: si Evolution falla no se reintenta por Meta (un solo intento)', { r4, n: llamadas.length });
  ok(/instancia desconectada/.test(r4.detail || ''), '4: el motivo llega al botón «Probar envío»', r4.detail);
  console.error = errOriginal;

  console.log('\n[5] Meta');
  setWhatsappOverrides({ ...META, ...EVO, proveedor: 'META' });
  responder(200, '{"messages":[{"id":"wamid"}]}');
  const r5 = await sendWhatsappOtp('595981123456', '333333');
  ok(r5.ok && r5.provider === 'whatsapp-cloud' && llamadas[0]?.url === 'https://graph.facebook.com/v20.0/123456/messages'
    && llamadas[0].init.headers.Authorization === 'Bearer tok-meta', '5: Meta usa la API oficial con su token', { r5, url: llamadas[0]?.url });

  setWhatsappFetch(null);
  setWhatsappOverrides({});
  console.log(`\n[whatsapp] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[whatsapp] FATAL:', e); process.exit(1); });
