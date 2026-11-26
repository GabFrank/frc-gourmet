# Prueba final de la tienda online — sesión del 11/11/2026

Prueba de punta a punta antes del lanzamiento (jueves 12/11), **contra la copia**
`frc_gourmet_tienda_prueba`, con la punta de la cadena de ramas de la tienda ya actualizada con
`develop`. Los casos y su resultado esperado están en
[`TESTING-CHECKLIST-PEDIDOS-ONLINE.md`](TESTING-CHECKLIST-PEDIDOS-ONLINE.md) (§ entre paréntesis);
esta guía da el **orden** y la tabla para anotar.

Regla: lo que toca cobro, factura o PdV se prueba **cobrando y facturando de verdad** en la copia.

## 0 · Antes de empezar

| Qué | Cómo |
|---|---|
| Servidor | Espejo en `:8000` desde la punta de `feat-tienda-avisos-cliente`, contra la copia. Tienda: `http://localhost:8000/tienda/` (celular: la IP de la Mac en el wifi). Admin y PdV: `http://localhost:8000/admin/` |
| Caja | Abrir una caja en el PdV de la copia |
| Token de Meta | El temporal dura ~24 h. **Sin token, «Ingresar» muestra solo email y Google**: la pestaña «Teléfono» aparece únicamente si el servidor puede mandar el código. Si no está, o no llegan códigos ni avisos, cargar uno nuevo (Meta → WhatsApp → Configuración de la API → «Generar token») |
| Avisos | Config Tienda Online: avisos prendidos, teléfono de prueba = el tuyo (§19) |
| Cliente a cuenta | Un cliente con crédito y límite, vinculado a tu cuenta web (§14) |
| Zonas | Al menos una zona dibujada (§0.2) |

**No se puede probar:** pago online en guaraníes (dinelco), porque no hay claves. Se prueba
cuando lleguen. Sin ellas, se lanza con efectivo, POS o transferencia al recibir, Pix, USDT y a
cuenta.

## Orden

| Bloque | Casos | § |
|---|---|---|
| A · Ingreso | Código por WhatsApp; Google (en `localhost`); teléfono de contacto de una cuenta Google | 20, 12 |
| B · Retiro con pago al recibir | Pedido → bandeja → aceptar → cocina e impresora → cobrar y **facturar** → listo → entregado. Con la casilla de avisos | 1, 19.2 |
| C · Delivery | Mapa y zonas, envío cotizado → aceptar → repartidor → en camino → cobrar y **facturar** → entregado. Avisos | 2, 19.3 |
| D · Pix | QR, recarga sin orden nueva, pagado, vencido | 16 |
| E · USDT | Un pago por vez; pagado; el siguiente después | 17 |
| F · A cuenta | Checkout con disponible; no alcanza; aceptar crea la deuda; entregar sin cobrar | 15 |
| G · A cuenta editada | Agregar, quitar, cantidad, descuento, envío, tope, a cero; con cobros, bloqueo; facturar | 18 |
| H · Cancelaciones | Antes y después de aceptar; Pix pagado → devolver; avisos de cancelación | 4, 10, 19.4–19.7 |
| I · Cierre | Cerrar la caja: sin ventas abiertas colgadas; los pedidos en los reportes del día | 1.10 |
| J · Seguridad | Pedido de otra cuenta no visible; enlace de seguimiento sin datos sensibles | 6 |

## Registro

| Caso | OK / Falla | Nota (número de pedido, qué se vio) |
|---|---|---|
| A | Parcial | Código por WhatsApp en modo dev (FRC_OTP_DEV, sin token de Meta en la estación); Google real no probado |
| B | OK | 25/11 copia `donfranco_piloto`: PO-000002 → venta 8114 (caja 178, a nombre de SISTEMA_ONLINE) → cobro efectivo + factura 001-001-0008478 → CONCLUIDA → Listo → Entregado |
| C | No probado en UI | La copia no tiene zonas dibujadas; cubierto por test:zona-delivery y test:zonas-poligono |
| D | Tests | Sin proveedor Pix en la estación; cubierto por test:pagos-online 73/73 (aviso y job a nombre de Sistema / Online: test:usuario-efectivo) |
| E | Tests | Ídem D (USDT) |
| F | Pendiente | Probar en el local con un cliente a cuenta real |
| G | Tests | test:all sin fallas nuevas |
| H | OK | PO-000003 aceptado → «Cancelar delivery» en el PdV → pedido CANCELADO y venta 8115 CANCELADA |
| I | Parcial | Sin ventas online abiertas colgadas en la caja 178; el cierre físico no se hizo en la copia |
| J | Tests | test:tienda-seguridad 40/40 |

## Al terminar

- Apagar los avisos en la copia (Config Tienda Online) y, si se cambió, volver la cuenta de IC a BRL.
- Lo que falló se anota acá con el número de pedido. Se corrige en la rama, no en la copia.
