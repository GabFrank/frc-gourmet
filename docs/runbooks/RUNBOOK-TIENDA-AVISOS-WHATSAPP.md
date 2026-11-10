# Runbook — avisos del pedido al cliente por WhatsApp

Plan: `docs/planes/PLAN-tienda-avisos-whatsapp.md`. Código: `electron/services/avisos-pedido.service.ts`.

## Cómo funciona

- El cliente marca en el checkout «Quiero recibir por WhatsApp los avisos de este pedido» (solo se
  ofrece con el interruptor prendido y a cuentas con el teléfono verificado por código).
- Cada 15 s el servidor mira los pedidos que cambiaron en las últimas 3 h y encola un aviso por
  evento: ACEPTADO (también en preparación), LISTO (solo retiro), EN_CAMINO, ENTREGADO, CANCELADO.
  Mesa QR nunca. Un pago online que nunca se cobró no avisa la cancelación.
- Tabla `pedido_online_avisos`: PENDIENTE → ENVIANDO → ENVIADO, o FALLIDO / DESCARTADO con `error`.

## Configurar (Config Tienda Online → Avisos al cliente por WhatsApp)

- **Interruptor** apagado por defecto. Apagarlo descarta lo pendiente.
- **Canal:** el mismo que el código de ingreso («Enviar el código por»). Evolution manda texto. Meta
  necesita plantillas aprobadas (fase 2): hasta entonces los avisos quedan DESCARTADO «Meta: faltan
  las plantillas de avisos».
- **Teléfono de prueba:** fuera de la app instalada (`npm start`, servidor espejo, copias) los avisos
  van SOLO a ese número; los demás quedan DESCARTADO «fuera de producción».

## Qué significa cada error

| `error` | Qué pasó | Qué hacer |
|---|---|---|
| fuera de producción: solo sale al teléfono de prueba | no es la app instalada | nada (es el seguro de las copias) |
| el pedido ya avanzó | cambió de estado antes de que saliera | nada |
| caducó (llegaría tarde) | no salió en 2 h | revisar el canal |
| tope de avisos del número | 10 por hora o 30 por día al mismo número | nada |
| Meta: faltan las plantillas de avisos | canal Meta sin fase 2 | usar Evolution solo para pruebas |
| sin proveedor de WhatsApp | no hay canal configurado | configurar |
| `HTTP …` / `[{"exists":false…}]` | Evolution falló / número sin WhatsApp (FALLIDO, sin reintento) | revisar conexión o el número |

Reintentos: espera 1, 2, 4, 8 min; al quinto intento FALLIDO. Los avisos de más de 30 días se borran.

## Consultas útiles

```sql
SELECT a.id, p.numero, a.evento, a.estado, a.intentos, a.error, a.enviado_en
FROM pedido_online_avisos a JOIN pedidos_online p ON p.id = a.pedido_online_id
ORDER BY a.id DESC LIMIT 20;
```

## Riesgo conocido

Una app INSTALADA apuntando a una copia restaurada de producción, con el interruptor prendido,
avisaría a clientes reales: al restaurar una copia en una app instalada, apagar el interruptor.
