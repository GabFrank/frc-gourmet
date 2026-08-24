# TODO — mejoras-pedido-online

Hallazgos de la auditoría del 2026-08-24 (doc `pedidos-online.md` vs código real en `develop`
@ `269072f`). **Las correcciones de documentación ya están aplicadas**; lo de abajo es código
que hay que arreglar. Nada de esto rompe producción hoy: son features a medio terminar.

Detalle y evidencia en `.claude/skills/frc-gourmet-expert/domains/pedidos-online.md`
→ sección «Huecos conocidos».

## Bloqueantes del flujo (el pedido llega pero no fluye a la operación)

- [x] **1. PICKUP/DELIVERY no se materializan en `Venta`.** `materializarPedidoOnlineEnVenta`
      exige `mesaId` (`electron/handlers/ventas.handler.ts:157`). Para pedidos web el cajero
      retipea la venta entera. Decidir: generalizar el puente (venta sin mesa, contra la caja
      abierta) o cargar el pedido en el carrito del PdV.
- [x] **2. `vincular-venta-pedido-online` es código muerto.** Cableado hasta
      `src/app/database/repository.service.ts:526` y `preload.ts:2345`, ningún componente lo
      llama. Se resuelve solo si se resuelve el punto 1. Además falta la impl HTTP
      (`repository-http.service.ts:1097` tira "no implementado" en `mode=client`).
- [x] **3. DELIVERY online no crea un `Delivery`.** `PedidoOnline.deliveryId` no se escribe
      nunca. El módulo delivery (PR #263) y pedidos online se ignoran mutuamente: los pedidos
      web no entran al tablero, no asignan repartidor ni imprimen ticket.

## Envío

- [x] **4. El costo de envío siempre queda en 0.** El checkout fuerza `costoEnvio = 0` y muestra
      «A coordinar» (`projects/storefront/src/app/pages/checkout/checkout.page.ts:127`), nunca
      manda `zonaDeliveryId`, y **ningún handler muta `pedido.costoEnvio` después de crearlo**
      — la promesa de «se confirma cuando la tienda acepta» no tiene implementación.
      Las `ZonaDelivery` están vivas en backend (CRUD admin, op `zonas.get`, tarifa y mínimo en
      `crear-pedido-online:377-390`) y muertas en el storefront. Decidir: reactivar zonas en el
      checkout, o dejar «a coordinar» y agregar el handler que setea el costo al aceptar.

## Ciclo de vida y comunicación

- [ ] **5. El cliente no puede cancelar.** `EstadoPedidoOnline.CANCELADO`: 0 usos en todo el
      repo. No hay op pública ni handler.
- [x] **6. Cero notificación al cliente.** Cambiar el estado en la bandeja no avisa a nadie; el
      storefront tiene que preguntar con `pedido.estado`. Hay infra de WhatsApp sin usar acá
      (Cloud para OTP, Evolution para interno).

## Deuda menor

- [ ] **7. `MetodoPagoOnline.BANCARD/UPAY/PAGOPAR` y `CanalPedidoOnline.WHATSAPP`: 0 usos.**
      Declarados sin implementación. O se implementan o se sacan del enum.
- [x] **8. Rechazar no revierte la venta.** `rechazar-pedido-online`
      (`pedidos-online-admin.handler.ts:134`) acepta un ACEPTADO que ya tiene `ventaId` y no
      toca la `Venta`.
- [ ] **9. `siguienteNumero` es `count()+1`** con un retry que se traga *cualquier* error 6
      veces (`pedidos-online-pedidos.handler.ts:436-444`), no solo la colisión de único.


---

## Estado al cerrar la rama `mejoras-pedido-online`

**Cerrados** (1, 2, 3, 4, 6, 8) más varios que no estaban en esta lista: el gate
de cocina para delivery, los permisos propios, el account takeover de
`auth.perfil.update`, el `email_verified` que fallaba abierto, y el test rojo que
`develop` arrastraba desde julio.

**Siguen abiertos:**

- **5 · El cliente no puede cancelar.** `EstadoPedidoOnline.CANCELADO` sigue con
  0 usos. Se decidió salir sin esto: la primera quincena se cubre con el teléfono
  del local, y no toca dinero ni stock mientras el pedido no se materializó.
- **7 · `BANCARD`/`UPAY`/`PAGOPAR` y `CanalPedidoOnline.WHATSAPP`** siguen
  declarados sin implementación. El pago es efectivo contra entrega y es una
  decisión cerrada — habría que sacarlos del enum.
- **9 · `siguienteNumero` reintenta ante cualquier error**, no sólo la colisión
  de único.

**Nuevos, de las auditorías del diff:**

- El **aviso por WhatsApp** al cliente quedó explícitamente para la iteración
  siguiente.
- **Curación de la carta**: publicar sigue siendo un toggle por producto y las
  categorías del storefront son las `Familia`/`Subfamilia` del stock. Es lo que
  más pesa para que la tienda no se vea mal el día uno.
- **Borrar un vértice suelto** en el diseñador de zonas: hoy sólo hay deshacer el
  último y borrar todo.
- **Polígono que se cruza a sí mismo**: no se detecta ni se avisa. Con la regla
  par-impar queda una zona muerta que el dueño no puede ver en el mapa.
- **Índices** en `pedidos_online.cuenta_cliente_id`, único en
  `cuentas_cliente.email`, filtrar `presentacion.activo` en el menú.
- **Accesibilidad del storefront**: cero `alt`, dos `aria-label`.
- **Nominatim sin identificar** (`checkout.page.ts`): política de 1 req/s y
  bloqueo por IP.
