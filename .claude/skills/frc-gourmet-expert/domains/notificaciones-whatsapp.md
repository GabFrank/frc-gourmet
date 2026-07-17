# Dominio: Notificaciones (Email / WhatsApp) y envío del cierre de caja

Infraestructura transversal de notificaciones por **email (SMTP)** y **WhatsApp (Evolution API)**, más el feature de **enviar el resumen de cierre de caja por WhatsApp** (PR #172).

## Infraestructura de notificaciones

Migración base: `1782606189440-AddNotificaciones`. Entities en `entities/notificaciones/`:

- **`EventoNotificacion`** (`codigo`, `canal: EMAIL | WHATSAPP | AMBOS`, `activo`) — catálogo de eventos disparables.
- **`ReceptorNotificacion`** (`nombre`, contacto) — a quién se le manda.
- **`SuscripcionNotificacion`** (`evento` ↔ `receptor`, `canal`, `activo`) — qué receptor recibe qué evento y por qué canal.
- **`ConfiguracionNotificacion`** — switch global + config SMTP/Evolution (URL, instancia).
- **`LogNotificacion`** — log de cada envío (dedupe por clave).

**Servicio** (`electron/services/notificacion.service.ts`):

- `dispatchEvento(eventoCodigo, payload)` — despacha un evento a **todos sus receptores suscriptos**: valida el switch global, que el evento esté `activo`, matchea canal evento↔suscripción, deduplica por `claveDedupe` y registra en `LogNotificacion`.
- `enviarDirecto({ canal, destino, eventoCodigo, ... })` — envío directo **sin** validar suscripciones (lo usa, p. ej., el reset de password).
- `buildSmtpConfig()` / `buildEvolutionConfig()` — arman la config desde `ConfiguracionNotificacion`.

**Secretos:** la **apikey de Evolution** y la password SMTP **NO** van en la BD — se guardan en **keytar** (`electron/utils/notificaciones-secrets.util.ts`: `getEvolutionApiKey()` / `getSmtpPassword()`).

**Cliente WhatsApp** (`electron/services/whatsapp.service.ts`, "puro": recibe config + apikey ya resueltos, usa http/https nativo):

- `sendWhatsappText(cfg, apikey, numberOrJid, text)` → `POST {baseUrl}/message/sendText/{instance}` (header `apikey`).
- `sendWhatsappMedia(cfg, apikey, numberOrJid, base64, { fileName?, caption?, mimetype? })` → `POST {baseUrl}/message/sendMedia/{instance}` (`mediatype: 'image'`, default `image/png`).

**Config UI:** módulo *Notificaciones* (`configuracion/notificaciones/configuracion-notificaciones.component.ts`) — URL + instancia de Evolution y la apikey (que va a keytar).

## Envío del cierre de caja por WhatsApp (PR #172)

Al **cerrar una caja PdV** — hook en `financiero.handler.ts` `update-caja`, cubre **desktop y PWA** — si `PdvConfig.whatsappCierreCajaActivo` y hay `PdvConfig.whatsappCierreCajaDestino`, se envía una imagen (o 2) con el resumen del cierre.

- **Render de la imagen:** `electron/utils/resumen-caja-imagen.util.ts` (`generarResumenCajaImagenes`) — arma un HTML self-contained (datos de `resumen-caja.utils.ts`; config en la migración `AddWhatsappCierreCajaConfig`), lo renderiza con una **`BrowserWindow` offscreen** (Chromium ya embebido en Electron), `capturePage → toPNG → base64`. Devuelve 1 o 2 imágenes base64. `buildResumenCajaCaption` arma el texto.
- **"Total de ventas"** es un **agrupador**: fila head + una fila por moneda + fila total **"Total en Gs"** = suma de cada moneda × su cotización `compraLocal` más reciente. La moneda principal se elige por el flag `principal` (fallback GUARANI/PYG) y cotiza en 1 (PR #178).
- **Config en el diálogo de PdV:** `pdv-config-dialog` sección "Cierre de caja" → `whatsappCierreCajaActivo` (checkbox) + `whatsappCierreCajaDestino` (input).
- **Destino:** número internacional **o** JID de grupo (`…@g.us`, obtenible con `GET /group/fetchAllGroups/{instance}`). Se normaliza con `normalizeWhatsappNumber`.

### Handler de test/manual + botón "Reenviar"

`enviar-resumen-cierre-whatsapp` (IPC + `/api/rpc`), params `{ cajaId?, forzar?, destino? }`, permiso **`FINANCIERO_CAJA_GESTIONAR`**:

- Sin `cajaId` → usa la última caja CERRADA.
- `forzar: true` → ignora el flag `whatsappCierreCajaActivo` (para test).
- `destino` → override del destino configurado.
- Devuelve `{ ok, cajaId, imagenes, enviados, errores[], omitido? }`. Es **no bloqueante** en el cierre real: si falla el render o el envío, el cierre de la caja **no** se aborta.

En `list-cajas` hay el botón **"Reenviar resumen por WhatsApp"** (`reenviarResumenWhatsapp(caja)`) que llama a este handler.

> **Gotchas:** la apikey de Evolution vive en keytar, no en la BD — si `buildEvolutionConfig()` no tiene URL/instancia **o** falta la apikey, el envío se **omite** silenciosamente (con `result.omitido`), no lanza. El render offscreen depende del Chromium de Electron: no está disponible en un contexto sin `BrowserWindow` (p. ej., un server headless puro).
