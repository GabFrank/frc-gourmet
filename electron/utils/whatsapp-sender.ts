/**
 * Envío de OTP por WhatsApp — Fase 2 pedidos online.
 *
 * Detrás de una interfaz para no acoplar el flujo de auth a un proveedor.
 * Config por variables de entorno (se definen al desplegar):
 *   WHATSAPP_CLOUD_TOKEN       — token de WhatsApp Cloud API (Meta)
 *   WHATSAPP_PHONE_NUMBER_ID   — id del número emisor
 *   WHATSAPP_OTP_TEMPLATE      — nombre de la plantilla aprobada (default 'otp_codigo')
 *   WHATSAPP_OTP_LANG          — locale de la plantilla (default 'es')
 *
 * Si faltan las credenciales, cae a un **fallback de desarrollo** que loguea el
 * código (para poder probar el flujo end-to-end sin cuenta de Meta todavía).
 * Reemplazar/extender con Twilio/360dialog agregando otro `SenderImpl`.
 */

export interface OtpSendResult {
  ok: boolean;
  provider: 'whatsapp-cloud' | 'dev-log';
  detail?: string;
}

function isConfigured(): boolean {
  return !!(process.env['WHATSAPP_CLOUD_TOKEN'] && process.env['WHATSAPP_PHONE_NUMBER_ID']);
}

/** Envía el código OTP al teléfono (formato E.164 sin '+', solo dígitos). */
export async function sendWhatsappOtp(telefono: string, codigo: string): Promise<OtpSendResult> {
  if (!isConfigured()) {
    // Fallback de desarrollo: no hay credenciales de WhatsApp todavía.
    console.log(`[whatsapp-otp][DEV] Código para ${telefono}: ${codigo} (configurar WHATSAPP_CLOUD_TOKEN para envío real).`);
    return { ok: true, provider: 'dev-log', detail: 'sin credenciales; código logueado' };
  }

  const token = process.env['WHATSAPP_CLOUD_TOKEN']!;
  const phoneId = process.env['WHATSAPP_PHONE_NUMBER_ID']!;
  const template = process.env['WHATSAPP_OTP_TEMPLATE'] || 'otp_codigo';
  const lang = process.env['WHATSAPP_OTP_LANG'] || 'es';

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: codigo }],
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[whatsapp-otp] envío falló (${res.status}): ${body}`);
      return { ok: false, provider: 'whatsapp-cloud', detail: `HTTP ${res.status}` };
    }
    return { ok: true, provider: 'whatsapp-cloud' };
  } catch (e: any) {
    console.error('[whatsapp-otp] error de red:', e?.message || e);
    return { ok: false, provider: 'whatsapp-cloud', detail: String(e?.message || e) };
  }
}
