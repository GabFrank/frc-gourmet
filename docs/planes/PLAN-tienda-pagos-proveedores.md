# PLAN tienda online — pago online con proveedores intercambiables (Bancard primero)

Rama: `bot/ceo-frc-gourmet/feat-tienda-pagos-proveedores`, sale de la de F9. Nada se mergea sin el
OK del propietario. Como toca cobro, **antes del merge hay que cobrar de verdad** contra el entorno
de prueba del proveedor (y uno real chico antes de lanzar).

## Estado (2026-11-06)

Fases 1 a 4 hechas en la rama (commits `7ad6256d`, `4aef556f`, `77f799c4`), con simulador de
Bancard. Falta: probar contra el staging de Bancard con las claves de prueba, cobrar de verdad, y
la certificación de Bancard para producción.

## Por qué

uPay se bajó (noviembre 2026: el BCP intervino Ueno y congeló sus cuentas). El propietario no quiere
lanzar la tienda sin pago online. Hoy el pago está escrito para uPay: cambiar de proveedor, o sumar
otro, obliga a tocar unos 20 archivos. El objetivo es que sumar un proveedor sea **escribir un
módulo y cargar sus credenciales**, sin tocar el resto.

Primer proveedor nuevo: **Bancard vPOS** (tarjetas de todos los bancos y la billetera Zimple; la
procesadora con más comercios del país). Pagopar o dLocal quedan como siguientes candidatos: el
contrato del módulo tiene que poder con los dos.

## Qué ya es genérico y queda igual

- `pedidos_online.pago_*` (sesión, url, intento, idempotencia, `pago_proveedor`, id, monto).
- `EstadoPagoOnline` y todo el ciclo: PENDIENTE → PAGADO / FALLIDO / EXPIRADO, pago tardío →
  REEMBOLSO_PENDIENTE, la decisión del pago al cancelar (DEVOLVER / YA_DEVUELTO / NO_ENTRO /
  NO_SE_DEVUELVE), la cola DEVOLVER, los avisos al personal, `pagos_online_eventos`.
- `ResultadoPago` (`interpretar-pago.ts`): PAGADO / FALLIDO / EXPIRADO / PENDIENTE / INCONSISTENTE.
  Cada proveedor traduce su respuesta a esto; la regla «PAGADO solo si monto, moneda y referencia
  coinciden» se mantiene para todos.
- El job (`tickPagosOnline`), la materialización solo con PAGADO, `pagoModalidad = ONLINE`.

## Qué está atado a uPay

| Dónde | Qué |
|---|---|
| `pagos-online.service.ts` | arma `UpayConfig`, llama a `UpayCheckoutProvider`, textos «en uPay» |
| `tienda_online_config` | `upay_base_url`, `upay_merchant_id`, `upay_merchant_nombre` |
| `tienda-secrets.util.ts` | `getUpayApiKey` / `setUpayApiKey` |
| `tienda-ingreso.utils.ts`, `pedidos-online-config.handler.ts` | «¿hay pago online?», validación de credenciales, «Probar conexión» |
| `MetodoPagoOnline.UPAY` | se usa como «pagó online» en el checkout, la materialización y las pantallas |
| `FORMA_PAGO_UPAY = 'UPAY ONLINE'` | forma de pago del cobro anticipado de la venta |
| storefront | `esUrlCheckoutUpay`, redirección a la página de uPay, textos |
| PdV | «DEVOLVER PAGO EN UPAY», «REF. UPAY», diálogo de decisión del pago |

## Diseño

### 1. El contrato del proveedor (`electron/services/pagos-online/proveedores/`)

```ts
interface ProveedorPagoOnline {
  id: 'UPAY' | 'BANCARD' | …;          // = MetodoPagoOnline y pedidos_online.pago_proveedor
  nombre: string;                      // «Bancard», para textos («devolvelo en Bancard»)
  formaPago: string;                   // forma de pago del cobro en la venta: 'BANCARD ONLINE'
  credenciales(ds): Promise<Creds|null>;   // null = no está configurado
  iniciar(p, ctx): Promise<Inicio>;        // crea el cobro del intento
  consultar(p, creds): Promise<ResultadoPago>;
  procesarAviso?(body, creds): Promise<AvisoProveedor>;  // webhook firmado (Bancard)
  devolver?(p, creds): Promise<'DEVUELTO'|'NO_SE_PUDO'>; // anular por API, si existe
  probarConexion(creds): Promise<{ ok: boolean; error?: string }>;
}
type Inicio =
  | { tipo: 'REDIRECCION'; url: string; sesionId: string; expiraEn?: Date }       // uPay, Pagopar
  | { tipo: 'FORMULARIO'; procesoId: string; script: string; sesionId: string };  // Bancard
```

Un registro (`proveedores/index.ts`) los lista. El servicio pide «el proveedor del pedido»
(`p.pagoProveedor`) para consultar, avisar o devolver, y «el proveedor activo» para cobrar pedidos
nuevos. Así **un pedido viejo se sigue leyendo con su proveedor** aunque el local cambie de
proveedor.

### 2. El núcleo

`pagos-online.service.ts` queda solo con la lógica común: reclamo del intento, reutilización de la
sesión vigente, aplicar el resultado (sin cambios), pago tardío, avisos, job. Los textos dicen el
nombre del proveedor del pedido («hay que devolver ₲ X en Bancard»).

«Pagó online» deja de ser `metodoPago === 'UPAY'` y pasa a ser `pagoModalidad === 'ONLINE'` (con
un helper `esPagoOnline(p)` para los pedidos viejos que no tengan la modalidad).

### 3. Datos (migración aditiva, sin tocar lo que hay)

- `tienda_online_config.pago_proveedor` varchar(20): el proveedor activo. Vacío y con uPay
  cargado = UPAY (lo de hoy, para no cambiar instalaciones existentes).
- `tienda_online_config.pago_config_json` text: datos **no secretos** por proveedor
  (`{ BANCARD: { publicKey, entorno: 'PRUEBA'|'PRODUCCION', … } }`). Las columnas `upay_*`
  quedan (no se borra nada); uPay las sigue leyendo.
- Secretos en el almacén seguro, una cuenta por proveedor (`tienda-pago-bancard-private-key`).
- Forma de pago `BANCARD ONLINE` sembrada inactiva, como `UPAY ONLINE`.

### 4. Bancard vPOS (API 0.3, según la doc «eCommerce Single Buy» y librerías públicas)

- **Cobro:** `POST {base}/vpos/api/0.3/single_buy` con `public_key` y
  `operation { token: md5(privada + shop_process_id + monto + 'PYG'), shop_process_id, amount
  '50000.00', currency 'PYG', description, return_url, cancel_url }` → `process_id`.
  `shop_process_id` es un entero único por intento (secuencia propia, no el número de pedido).
- **Pantalla de pago:** el storefront carga `bancard-checkout-4.0.0.js` desde el host de Bancard y
  arma el formulario con `Bancard.Checkout.createForm(contenedor, process_id)` en
  `/tienda/pago/<numero>`. Solo se acepta el script del host de Bancard que mande el servidor.
- **Confirmación:** Bancard hace `POST` a nuestra URL de confirmación
  (`/pub/pagos/bancard/confirmacion`) con
  `token = md5(privada + shop_process_id + 'confirm' + monto + 'PYG')`. Se verifica el token en
  tiempo constante, monto y moneda contra el pedido, `response = 'S'` y `response_code = '00'`.
  Responde `{status:'success'}`. **Además** el job consulta `single_buy/confirmations`
  (`md5(privada + shop_process_id + 'get_confirmation')`) por si el aviso no llega: nunca depende
  de un solo camino.
- **Devolución:** `single_buy/rollback` (`md5(privada + shop_process_id + 'rollback' + '0.00')`).
  Bancard solo anula antes del cierre del lote; después hay que hacerlo desde su portal.
- **Entornos:** prueba `https://vpos.infonet.com.py:8888`, producción `https://vpos.infonet.com.py`.

### 5. Devolución automática (opcional, propuesta)

Si el proveedor sabe devolver, «Hay que devolverlo» intenta anular por API después del commit:
sale bien → DEVUELTO (con evento); sale mal o no se puede → REEMBOLSO_PENDIENTE como hoy, con el
motivo en el aviso. Se enciende con un interruptor por tienda, apagado por defecto.

### 6. Pantallas

- Config de la tienda: «Pago online» con selector de proveedor y los campos de cada uno, «Probar
  conexión» del elegido, la URL de confirmación para copiar al portal de Bancard.
- PdV y bandeja: «REF. BANCARD …», «DEVOLVER PAGO EN BANCARD», diálogo del pago con el nombre del
  proveedor del pedido. Las dos pantallas a la vez (regla F10).
- Storefront: «Pagar con tarjeta» igual; la página de pago muestra el formulario de Bancard o
  redirige, según el proveedor.

## Fases (commit y push al cerrar cada una)

1. **Contrato y uPay como proveedor.** Sin cambio de conducta: `test:pedidos-online-pago` (45)
   y el resto pasan igual.
2. **Config multi-proveedor.** Migración, secretos, pantalla de config, «pagó online» genérico,
   textos con el nombre del proveedor.
3. **Bancard vPOS.** Módulo, ruta de confirmación, consulta de respaldo, página de pago del
   storefront, simulador de Bancard para tests (`test:pagos-bancard`, SQLite y Postgres).
4. **Devolución automática** (si se aprueba §5).
5. **Cierre:** auditoría con agentes, batería completa, AOT, Chrome contra el simulador, manual de
   pruebas, skill y docs.

## Tests

- Los de uPay existentes, sin tocarlos más que para el nombre del proveedor.
- Bancard con simulador: token de cobro bien armado; confirmación con token falso → rechazada y sin
  cambios; monto o moneda distintos → INCONSISTENTE; confirmación repetida → idempotente; aviso que
  llega con el pedido cancelado → pago tardío a devolver; aviso perdido → la consulta del job lo
  confirma; `response = 'N'` → FALLIDO y reintento; rollback ok / rechazado.
- Proveedor cambiado con pedidos en curso: los viejos se consultan con su proveedor.

## Riesgos

- La documentación oficial de Bancard se entrega con el contrato; el plan se basa en la versión
  «Single Buy v1.22» que reflejan librerías públicas. Hay que validarla con las credenciales de
  prueba antes del merge.
- La confirmación necesita una URL pública (hoy el túnel de `app.frc-gourmet.com`) registrada en el
  portal de Bancard.
- Bancard certifica la integración antes de pasar a producción (suele pedir ver pagos aprobados,
  rechazados y anulados en su entorno de prueba).

## Qué necesita el propietario

1. Contrato de comercio electrónico con Bancard (vPOS) y las **claves de prueba** (pública y privada).
2. Registrar en el portal de Bancard la URL de confirmación que muestra la pantalla de config.
3. Decidir si se activa la devolución automática (§5).
