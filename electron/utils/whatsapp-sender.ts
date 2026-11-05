/**
 * Envío de OTP por WhatsApp — Fase 2 pedidos online.
 *
 * Detrás de una interfaz para no acoplar el flujo de auth a un proveedor.
 * Config por variables de entorno (se definen al desplegar):
 *   WHATSAPP_CLOUD_TOKEN       — token de WhatsApp Cloud API (Meta)
 *   WHATSAPP_PHONE_NUMBER_ID   — id del número emisor
 *   WHATSAPP_OTP_TEMPLATE      — nombre de la plantilla aprobada (default 'otp_codigo')
 *   WHATSAPP_OTP_LANG          — locale de la plantilla (default 'es')
 *   WHATSAPP_OTP_BOTON         — '1' si la plantilla es de Autenticación con botón «Copiar código»
 *
 * Desde F3 los valores cargados en «Config Tienda Online» (BD + token en keytar) tienen
 * prioridad sobre las variables de entorno: el handler de config los deja en memoria con
 * `setWhatsappOverrides` al arrancar y en cada guardado, para no hacer async este módulo.
 *
 * Si faltan las credenciales, el envío NO está disponible. Solo con
 * `FRC_OTP_DEV=1` y la app sin empaquetar (desarrollo/tests) se usa un
 * **fallback de desarrollo** que loguea el código. En producción nunca: antes
 * el fallback devolvía el código al cliente y cualquiera entraba con cualquier
 * teléfono (PLAN-tienda-online C1).
 * Reemplazar/extender con Twilio/360dialog agregando otro `SenderImpl`.
 */

export interface OtpSendResult {
  ok: boolean;
  provider: 'whatsapp-cloud' | 'evolution' | 'dev-log' | 'ninguno';
  detail?: string;
}

export interface WhatsappOverrides {
  token?: string | null;
  phoneNumberId?: string | null;
  plantilla?: string | null;
  idioma?: string | null;
  // F9: proveedor elegido y Evolution API (el número de FRC). Los datos de Evolution son los de
  // «Configuración de Notificaciones» (los carga `tienda-ingreso.utils`); no se duplican.
  proveedor?: 'META' | 'EVOLUTION' | null;
  evolutionUrl?: string | null;
  evolutionInstancia?: string | null;
  evolutionApiKey?: string | null;
  /** Nombre del comercio, para el texto del código por Evolution. */
  nombreComercio?: string | null;
}

/** `fetch` inyectable (tests sin red). */
type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
let fetchImpl: FetchLike = (url, init) => fetch(url, init) as any;
export function setWhatsappFetch(f: FetchLike | null): void { fetchImpl = f || ((url, init) => fetch(url, init) as any); }

let overrides: WhatsappOverrides = {};

/** Valores cargados desde la app (prioridad sobre las variables de entorno). */
export function setWhatsappOverrides(o: WhatsappOverrides): void {
  overrides = { ...o };
}

function credenciales(): { token: string; phoneId: string; template: string; lang: string; boton: boolean } {
  return {
    // La plantilla cargada en la pantalla es de categoría Autenticación (lo pide la ayuda de
    // la pantalla), que exige el código también en el botón «Copiar código». Las instalaciones
    // que solo usan variables de entorno siguen mandando solo el cuerpo, salvo WHATSAPP_OTP_BOTON=1.
    boton: overrides.plantilla ? true : process.env['WHATSAPP_OTP_BOTON'] === '1',
    token: overrides.token || process.env['WHATSAPP_CLOUD_TOKEN'] || '',
    phoneId: overrides.phoneNumberId || process.env['WHATSAPP_PHONE_NUMBER_ID'] || '',
    template: overrides.plantilla || process.env['WHATSAPP_OTP_TEMPLATE'] || 'otp_codigo',
    lang: overrides.idioma || process.env['WHATSAPP_OTP_LANG'] || 'es',
  };
}

function metaConfigurado(): boolean {
  const c = credenciales();
  return !!(c.token && c.phoneId);
}

function evolution(): { url: string; instancia: string; apiKey: string } {
  return {
    url: String(overrides.evolutionUrl || process.env['EVOLUTION_URL'] || '').replace(/\/+$/, ''),
    instancia: overrides.evolutionInstancia || process.env['EVOLUTION_INSTANCIA'] || '',
    apiKey: overrides.evolutionApiKey || process.env['EVOLUTION_API_KEY'] || '',
  };
}

export function evolutionConfigurado(): boolean {
  const e = evolution();
  return !!(e.url && e.instancia && e.apiKey);
}

/**
 * Proveedor con el que sale el código: el elegido si está cargado; si no, el otro (F9).
 * null = ninguno configurado.
 */
export function proveedorWhatsappActivo(): 'META' | 'EVOLUTION' | null {
  const elegido = (overrides.proveedor || process.env['WHATSAPP_PROVEEDOR'] || 'META').toUpperCase();
  const orden = elegido === 'EVOLUTION' ? ['EVOLUTION', 'META'] : ['META', 'EVOLUTION'];
  for (const p of orden) {
    if (p === 'META' && metaConfigurado()) return 'META';
    if (p === 'EVOLUTION' && evolutionConfigurado()) return 'EVOLUTION';
  }
  return null;
}

function isConfigured(): boolean {
  return proveedorWhatsappActivo() !== null;
}

/** Hay credenciales reales de WhatsApp Cloud (Meta), sin contar el fallback de desarrollo. */
export function whatsappCloudConfigurado(): boolean {
  return metaConfigurado();
}

/** Hay algún proveedor real (Meta o Evolution) para mandar el código. */
export function whatsappConfigurado(): boolean {
  return isConfigured();
}

function appEmpaquetada(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    // F5 (auditoría M-auth1): falla CERRADO. Dentro de Electron sin un `app` legible se toma
    // como empaquetada; solo fuera de Electron (tests con node) cuenta como desarrollo.
    if (typeof app?.isPackaged === 'boolean') return app.isPackaged;
    return !!process.versions?.electron;
  } catch {
    return !!process.versions?.electron;
  }
}

/** Fallback de desarrollo: solo con FRC_OTP_DEV=1 y la app sin empaquetar. */
export function otpDevPermitido(): boolean {
  return process.env['FRC_OTP_DEV'] === '1' && !appEmpaquetada();
}

/** Hay un canal real (o el de desarrollo permitido) para mandar el código. */
export function otpWhatsappDisponible(): boolean {
  return isConfigured() || otpDevPermitido();
}

/** Envía el código OTP al teléfono (formato E.164 sin '+', solo dígitos). */
export async function sendWhatsappOtp(telefono: string, codigo: string): Promise<OtpSendResult> {
  if (!isConfigured()) {
    if (!otpDevPermitido()) {
      return { ok: false, provider: 'ninguno', detail: 'whatsapp no configurado' };
    }
    // Fallback de desarrollo: no hay credenciales de WhatsApp todavía.
    console.log(`[whatsapp-otp][DEV] Código para ${telefono}: ${codigo} (configurar WHATSAPP_CLOUD_TOKEN para envío real).`);
    return { ok: true, provider: 'dev-log', detail: 'sin credenciales; código logueado' };
  }

  if (proveedorWhatsappActivo() === 'EVOLUTION') return enviarPorEvolution(telefono, codigo);

  const { token, phoneId, template, lang, boton } = credenciales();

  try {
    const res = await fetchImpl(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          // En una plantilla de Autenticación el código va en el cuerpo y también en el
          // botón «Copiar código» (index 0); mandarlo a una plantilla sin botón la rechaza Meta.
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: codigo }],
            },
            ...(boton
              ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] }]
              : []),
          ],
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[whatsapp-otp] envío falló (${res.status}): ${body}`);
      // El mensaje de Meta (sin el token) sirve para el botón «Probar envío».
      let motivo = '';
      try {
        motivo = String(JSON.parse(body)?.error?.message || '').slice(0, 200);
      } catch {
        motivo = '';
      }
      return { ok: false, provider: 'whatsapp-cloud', detail: `HTTP ${res.status}${motivo ? ': ' + motivo : ''}` };
    }
    return { ok: true, provider: 'whatsapp-cloud' };
  } catch (e: any) {
    console.error('[whatsapp-otp] error de red:', e?.message || e);
    return { ok: false, provider: 'whatsapp-cloud', detail: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * F9: envío por Evolution API (el número de WhatsApp de FRC). Texto plano, sin plantilla:
 * `POST {url}/message/sendText/{instancia}` con la API key en el header `apikey`. Se mandan los
 * dos formatos del cuerpo (v2: `text`; v1: `textMessage.text`): cada versión ignora el otro.
 * La API key nunca va en el detalle del error.
 */
async function enviarPorEvolution(telefono: string, codigo: string): Promise<OtpSendResult> {
  const { url, instancia, apiKey } = evolution();
  const comercio = String(overrides.nombreComercio || '').trim();
  const texto = `Tu código para ingresar${comercio ? ` a ${comercio}` : ''} es ${codigo}. Vence en 10 minutos. No lo compartas con nadie.`;
  try {
    const res = await fetchImpl(`${url}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      // Sin seguir redirecciones: la URL la carga un admin y no se va a otro destino.
      redirect: 'manual',
      body: JSON.stringify({ number: numeroWhatsapp(telefono), text: texto, textMessage: { text: texto } }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).split(apiKey).join('***');
      console.error(`[whatsapp-otp] Evolution falló (${res.status}): ${body.slice(0, 300)}`);
      let motivo = '';
      try {
        const j = JSON.parse(body);
        motivo = String(j?.response?.message || j?.message || j?.error || '').slice(0, 200);
      } catch { motivo = ''; }
      return { ok: false, provider: 'evolution', detail: `HTTP ${res.status}${motivo ? ': ' + motivo : ''}` };
    }
    return { ok: true, provider: 'evolution' };
  } catch (e: any) {
    const msg = String(e?.message || e).split(apiKey).join('***');
    console.error('[whatsapp-otp] Evolution, error de red:', msg);
    return { ok: false, provider: 'evolution', detail: msg.slice(0, 200) };
  }
}

/**
 * Destino en el formato que pide WhatsApp: dígitos con código de país, sin «+». Un número de
 * Paraguay escrito local (0981…, 981…) se completa con 595. Sólo para el envío: la cuenta se
 * guarda como la escribió el cliente (cambiarla duplicaría cuentas).
 */
export function numeroWhatsapp(telefono: string): string {
  const d = String(telefono || '').replace(/\D/g, '');
  if (/^09\d{8}$/.test(d)) return '595' + d.slice(1);
  if (/^9\d{8}$/.test(d)) return '595' + d;
  return d;
}
