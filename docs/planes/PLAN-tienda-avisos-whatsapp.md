# PLAN tienda online — avisos del pedido al cliente por WhatsApp

Rama: `bot/ceo-frc-gourmet/feat-tienda-avisos-whatsapp`, sale de `feat-tienda-pagos-proveedores`
(independiente de F8b). Nada se mergea sin el OK del propietario.

## Estado (2026-11-10)

Rama nueva `bot/ceo-frc-gourmet/feat-tienda-avisos-cliente`, sobre `feat-tienda-deuda-editada` (la
cadena). La rama vieja `feat-tienda-avisos-whatsapp` (solo el plan) queda sin usar.

**Fase 1 hecha:** migración `TiendaAvisosPedido` (cola `pedido_online_avisos` con único
(pedido, evento); `pedidos_online.avisos_consentimiento_en`; `tienda_online_config.avisos_whatsapp` y
`avisos_telefono_prueba`), `electron/services/avisos-pedido.service.ts` (tick cada 15 s en el
servidor), casilla de consentimiento en el checkout (sin marcar), bloque «Avisos al cliente por
WhatsApp» en Config Tienda Online. `test:avisos-pedido` 26/26 en SQLite y PG.

Cambios respecto del diseño, decididos al implementar:

- **Encolado por estado, no por puerta.** En vez de encolar dentro de cada transacción que mueve el
  pedido (bandeja, PdV, delivery, ventas, pagos: muchas puertas), el tick mira el estado ya guardado
  de los pedidos que cambiaron en las últimas 3 h y encola un aviso por (pedido, evento). Cubre
  todas las puertas sin tocarlas; lo que se revierte nunca se ve. Si un pedido pasa por dos estados
  entre dos ticks (15 s), sale solo el último.
- **Fuera de producción = fuera de la app instalada.** `npm start`, el servidor espejo y los tests
  mandan solo al teléfono de prueba; la app instalada manda a los clientes. No hace falta configurar
  nada en producción para esto. Riesgo que queda: una app INSTALADA apuntando a una copia restaurada
  con el interruptor prendido avisaría a clientes reales (apagar el interruptor al restaurar).
- **Cancelación sin motivo** en el texto (con Meta el motivo libre no puede ser variable): «fue
  cancelado» y, si el pago online se devuelve, «Te devolvemos el pago». Un pago online que nunca se
  cobró no avisa (el cliente lo vio en la página de pago).
- **Teléfono de Google sin verificar:** no recibe avisos (la casilla no aparece) hasta la
  verificación por código (fase 2).

Pendiente: fase 2 (Meta con plantillas; verificación del teléfono de contacto; «BAJA»; estado de
los avisos en el detalle del pedido de la bandeja; aviso «cancelación pedida no aceptada») y la
prueba real con Evolution al teléfono del personal.

## Por qué

El checkout ya le dice al cliente que va a recibir avisos de su pedido por WhatsApp, pero hoy no
se manda ninguno: el seguimiento es solo mirando la página. Evolution ya funciona para pruebas;
el definitivo es **Meta (WhatsApp Cloud API)**, que todavía está en revisión.

## Lo que ya existe

- `electron/utils/whatsapp-sender.ts`: el código de ingreso por Meta (plantilla) o Evolution
  (texto), elegido con `whatsapp_proveedor`. Fetch inyectable para tests.
- `pedido.telefonoCliente` (obligatorio desde F9) y `numeroWhatsapp()` para normalizarlo.
- Job del servidor (`iniciarJobPagosOnline`) como modelo de tick con `ahora` inyectable.

## Diseño

### 1. Qué se avisa (texto para Evolution; en Meta, una plantilla por aviso)

| Momento | Texto propuesto |
|---|---|
| Aceptado | «{comercio}: recibimos tu pedido {numero} y ya lo estamos preparando.» |
| Listo para retirar | «{comercio}: tu pedido {numero} está listo para retirar.» |
| En camino | «{comercio}: tu pedido {numero} salió y va en camino. El repartidor puede llamarte a este número.» |
| Entregado | «{comercio}: tu pedido {numero} fue entregado. ¡Gracias!» |
| Rechazado / cancelado | «{comercio}: tu pedido {numero} fue cancelado. {motivo}» + si estaba pagado online: «Te devolvemos el pago.» / según la decisión del pago |
| Cancelación pedida no aceptada | «{comercio}: tu pedido {numero} ya estaba en preparación y no se pudo cancelar.» |

Cada línea termina con el enlace al detalle del pedido (`/tienda/pedido/<numero>`).

### 2. Cola con reintentos (outbox)

- Tabla `pedido_online_avisos`: pedido, evento, teléfono, estado (PENDIENTE / ENVIADO / FALLIDO /
  DESCARTADO), intentos, próximo intento, error, enviado_en. **Único (pedido, evento)**: un mismo
  aviso no sale dos veces aunque dos pantallas muevan el pedido.
- Se encola **dentro de la misma transacción** que cambia el estado (acumulador en
  `sincronizarPedidosOnline` y en los handlers de la bandeja): si el cambio se revierte, el aviso
  también.
- Un tick en el servidor (cada 15 s) manda los pendientes. Reintentos con espera creciente,
  máximo 5. **Caduca**: un «en camino» que no salió en 2 horas se descarta (llegaría tarde y
  confunde).
- Si el pedido ya avanzó, el aviso viejo se descarta (no se manda «aceptado» si ya va en camino).

### 3. Proveedor

- Se generaliza `whatsapp-sender` con `enviarAvisoPedido(telefono, aviso)`: Evolution manda el
  texto; Meta manda la plantilla del evento con sus parámetros (`{{1}}` comercio, `{{2}}` número,
  `{{3}}` motivo) en categoría **Utilidad**.
- Config de la tienda: interruptor «Avisar al cliente por WhatsApp» (apagado por defecto), qué
  eventos, y para Meta el nombre de la plantilla de cada evento y el idioma. Botón «Mandar aviso de
  prueba» al teléfono que indique el personal.
- Sin proveedor configurado o con el interruptor apagado: no se encola nada.

### 4. Pantallas

- En el detalle del pedido (bandeja y diálogo de delivery): «Avisos: aceptado ✓ enviado 12:03 ·
  en camino ✗ falló (número inválido)». Solo lectura.

## Correcciones de la auditoría (07/11)

- **P0 — Teléfono sin verificar = spam a terceros.** Quien entra con Google carga un teléfono de
  contacto que nadie verificó: podría poner el de otra persona y el local le mandaría WhatsApps
  (Meta bloquea números del negocio por reportes). Solo se avisa a un **teléfono verificado**;
  tope de avisos por número por hora y por día.
- **P0 — La copia tiene teléfonos reales.** Fuera de producción todo es *fail-closed*: solo sale a
  una lista blanca (el teléfono de prueba). Al restaurar una copia se vacía la cola pendiente y no
  hereda credenciales.
- **Meta:**
  - Hace falta **consentimiento explícito** por pedido (casilla en el checkout, guardada con fecha).
    El texto informativo de hoy no alcanza. «BAJA» por WhatsApp da de baja.
  - Todo va con plantilla (el cliente nunca escribió primero, no hay ventana de 24 h).
  - El motivo libre no puede ser variable: cancelaciones con un catálogo corto de motivos y dos
    plantillas (con y sin devolución del pago, según el estado real del pago).
  - Categoría Utilidad sin frases promocionales: se saca «Te esperamos».
  - «Enviado» significa «aceptado por Meta» salvo que se lean sus webhooks de estado; un número
    que no tiene WhatsApp se marca FALLIDO sin reintentar.
- **Evolution es WhatsApp no oficial:** solo para pruebas, nunca a clientes reales.
- **Cola:** índice único (pedido, evento) con inserción idempotente; el tick reclama filas
  (PENDIENTE → ENVIANDO) antes de mandar y recupera las huérfanas; solo corre en el servidor. Se
  encola en cada transición real (`affected > 0`) de todas las puertas.
- Sin teléfonos completos ni textos en los logs; los avisos viejos se purgan.

## Decisiones del propietario (07/11)

- Textos aprobados tal cual, **y también aviso al entregar**: «{comercio}: tu pedido {numero} fue
  entregado. ¡Gracias!» (vigilar que Meta lo acepte como Utilidad).
- Clientes de Google: el teléfono de contacto **se verifica con un código** la primera vez.

## Lo que necesitaba el propietario

1. **Aprobar los textos** (o corregirlos). Con Meta, cada texto es una plantilla que hay que dar
   de alta en el Business Manager y esperar su aprobación; conviene pedirlas apenas estén los
   textos, en paralelo a la revisión de la cuenta.
2. **¿Aviso al entregar?** Propuesta: no.
3. **Clientes que entran con Google:** su teléfono de contacto no está verificado. ¿Se les pide
   confirmarlo con un código la primera vez (recomendado) o no reciben avisos?
4. Teléfono de prueba para Evolution: el personal (595982187492) — nunca un cliente real desde la
   copia.

## Fases

1. Cola, tick, encolado transaccional en todas las puertas, Evolution. Tests con envío simulado
   (SQLite y Postgres): un aviso por evento, no duplica, caduca, descarta lo viejo, reintenta.
2. Meta con plantillas, config y prueba de envío.
3. Cierre: auditoría, batería completa, AOT, Chrome, prueba real con Evolution al teléfono del
   personal, manual, skill y docs.

## Riesgos

- Meta: sin plantillas aprobadas no sale nada; el sistema tiene que fallar en silencio (log y
  estado FALLIDO) sin trabar el pedido.
- La copia de la base tiene teléfonos reales de clientes: **en la copia los avisos van solo al
  teléfono de prueba** (override obligatorio fuera de producción).
