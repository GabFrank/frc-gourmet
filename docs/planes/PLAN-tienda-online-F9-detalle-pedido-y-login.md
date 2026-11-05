# PLAN — Tienda online F9: detalle del pedido y login real por WhatsApp

Rama `bot/ceo-frc-gourmet/feat-tienda-online-f9`, encima de F8. Pedido del propietario (05/11) y
trabajo autónomo autorizado ("escribí todo el código y las pruebas posibles").

## Decisiones del propietario (05/11)
1. **WhatsApp: los dos proveedores, elegible.** Se agrega **Evolution API** (el número de FRC) al
   envío actual por **Meta Cloud**. En la config se elige cuál; si el elegido no está cargado, se
   usa el otro. Google ya verifica de verdad (tokeninfo + `aud`), sólo falta cargar el Client ID.
2. **Apple: no por ahora.**
3. **Modificar** = el pedido se cancela y sus productos vuelven al carrito, **sólo mientras espera
   confirmación** (RECIBIDO, sin venta ni comanda): ahí se cancela al instante.
4. **Cancelar: siempre es una solicitud** que el local aprueba o rechaza desde la bandeja
   (la excepción es la del punto 3).

## A. Detalle del pedido (tienda)
- Página `/pedido/:numero` (desde «Mis pedidos», cada tarjeta): estado (chip + pasos de F6b),
  ítems con su personalización, entrega (dirección / retiro / mesa), pago elegido (F8), notas,
  totales, fecha y número (copiar). Se actualiza sola mientras está en curso.
- Acciones según el estado (las calcula el **servidor**, `acciones` en la respuesta):
  - **Solicitar cancelación** (en curso, sin solicitud pendiente): con motivo opcional.
  - **Modificar** (sólo RECIBIDO y sin venta): cancela al instante y carga los ítems en el carrito.
  - **Repetir pedido** (siempre): carga los ítems en el carrito contra la carta vigente (el carrito
    revalida precios y quita lo que ya no se vende).
  - **Compartir por WhatsApp**: `wa.me/?text=…` con el detalle (sin datos internos).
  - **Llamar / escribir al local** (si la config tiene teléfono) y **seguir el pedido**.
- Invitado de mesa: entra por su token de seguimiento (como «Mis pedidos»); puede ver, repetir y
  compartir; cancelar/modificar sólo con cuenta (o con su token de seguimiento).
- Servidor: ops públicas `pedido.detalle`, `pedido.cancelacion.solicitar`, `pedido.modificar`,
  dueño = la cuenta del pedido (o el token de seguimiento). Migración aditiva en `pedidos_online`:
  `cancelacion_solicitada_en`, `cancelacion_motivo`, `cancelacion_respuesta`.
- Bandeja: aviso «El cliente pidió cancelar: …» con **Aprobar** (= el rechazo/cancelación existente,
  con su reversa de venta, permisos y reembolso de uPay) y **Rechazar solicitud** (con motivo, el
  cliente lo ve). `PEDIDOS_ONLINE_GESTIONAR`.

## B. Login real por WhatsApp (Evolution API)
- Proveedor en la config: `whatsapp_proveedor` = META | EVOLUTION; Evolution: URL base, instancia
  (columnas) y API key (almacén seguro, como el token de Meta; nunca vuelve al cliente).
- Envío Evolution: `POST {url}/message/sendText/{instancia}` con `apikey`, texto «Tu código para
  ingresar a {comercio} es 123456. Vence en 10 minutos. No lo compartas.».
- «Probar envío» para los dos; estado de cada proveedor en la pantalla.
- Fallback: si el elegido no está configurado, el otro; si ninguno, como hoy (sin login por código).

## Tests
- `test:pedidos-online-detalle` (SQLite + Postgres): acciones por estado; dueño (otra cuenta no ve
  ni actúa); solicitud → bandeja aprueba (venta revertida) / rechaza (cliente ve respuesta);
  modificar sólo RECIBIDO sin venta (carrera con aceptar: el update condicionado gana uno solo);
  solicitud repetida; pedido terminado sin acciones.
- `test:whatsapp-proveedores`: Evolution y Meta con `fetch` simulado (URL, headers, cuerpo, sin
  filtrar la API key en errores), elección y fallback, «Probar envío».
- Storefront: función pura del texto a compartir y de las acciones; verificación en Chrome.
