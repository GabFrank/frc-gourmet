# Storefront — Web app de pedidos online

PWA de marca (Angular 15 standalone) donde el cliente final ve la carta, arma el
carrito, se loguea por OTP (WhatsApp) y hace pedidos (retiro / delivery). Consume
**únicamente** la superficie pública `POST /pub/rpc` del server FRC Gourmet
(`mode=server`), nunca `/api/rpc`. Ver `.claude/skills/frc-gourmet-expert/domains/pedidos-online.md`.

## Correr en dev

1. En el desktop FRC Gourmet: activar **modo Servidor** (Sistema → Modo de operación).
   El Fastify queda escuchando (default `:7070`).
2. Servir el storefront:
   ```bash
   npx ng serve storefront   # http://localhost:4202
   ```
3. Apuntar el storefront al server (una vez, en la consola del navegador):
   ```js
   localStorage.frc_storefront_server_url = 'http://localhost:7070'
   ```
   (Si el server sirve la PWA en el mismo origen, no hace falta.)

## Requisitos para ver productos

En el desktop, marcá algunos productos como **disponibles online**
(`producto.disponibleOnline = true`) — el endpoint `menu.get` sólo publica esos.
El precio usa el `TipoPrecio` "ONLINE" si existe; si no, el precio principal.

## OTP en dev

Sin credenciales de WhatsApp Cloud API (`WHATSAPP_CLOUD_TOKEN`), el código OTP se
**loguea en la consola del server** (proveedor `dev-log`). El login lo avisa.

## Build y serving desde el server (producción)

```bash
npm run build:storefront           # = ng build storefront --base-href /tienda/
```

El server (`mode=server`) sirve `dist/storefront` en **`/tienda/`** si el bundle
existe (junto a la PWA mobile que va en `/`). Por eso el build usa
`--base-href /tienda/`. Con el server levantado, la web del cliente queda en
`http://<host>:7070/tienda/` (o el dominio del túnel: `https://tudominio/tienda/`).

> En dev con `ng serve` (`:4202`) el base-href es `/` — sólo para desarrollo.

## Pendiente

- Pago online (Fase 5), tracking en vivo (Fase 6), QR de mesa (Fase 7).
- Refresh token de cliente (hoy access token de 30 min).
- Pantalla de config de tienda (`TiendaOnlineConfig`: horarios, prep-time, branding).
