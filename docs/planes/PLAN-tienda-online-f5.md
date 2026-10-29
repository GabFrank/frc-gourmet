# PLAN tienda online — Fase 5: correcciones de la auditoría F1–F4

Origen: auditoría con otro modelo de `origin/develop...feat-tienda-online-f4` (29/10/2026):
2 críticos, 6 altos, ~20 medios. Base: rama F4 (PR #342). Nada se mergea hasta terminar el
módulo completo (decisión del propietario); la tienda sigue apagada en producción.

## Críticos y altos
1. **C1** — `materializarPedidoOnlineEnVenta` valida estado y pago, antes y dentro de la tx:
   ACEPTADO; RECIBIDO solo de mesa QR o con aceptación automática; con tarjeta, solo PAGADO.
2. **C2** — Aceptar exige caja abierta de quien acepta (`sin_caja`, sin cambiar el estado);
   transición atómica RECIBIDO→ACEPTADO; ACEPTADO sin venta no avanza a mano (`sin_venta`);
   «Enviar a cocina» para todo ACEPTADO sin venta; el job reintenta PAGADO+ACEPTADO sin venta.
3. **A-auth1** — OTP: intento reservado con UPDATE condicionado; consumo atómico.
4. **A-auth2** — Login: intento reservado antes de verificar; tope por cuenta; contraseña ≥ 8.
5. **A-pay1/A-pay2** — Job: filtro en SQL, orden por última consulta, EXPIRADO por
   `pagoExpiraEn` (no `updatedAt`), try/catch por pedido.
6. **A-pay3** — Reintento de pago: reclamo del intento con UPDATE condicionado.
7. **A-F2-2** — Adicional que no corresponde: error `adicional_invalido`.

## Medios elegidos
8. M-auth1 — modo dev de OTP falla cerrado dentro de Electron.
9. M-auth2/M-auth3 — topes por IPv6 /64; 10 códigos por IP por día, antes del tope global.
10. M-auth4 — Google cierra las sesiones de una cuenta con email sin verificar; `iss` y timeout.
11. M-auth5 — rotación de refresh atómica; reuso de un refresh rotado revoca todo.
12. M-pay2 — verificación de monto/moneda/referencia: monto y moneda se exigen en el PAGO
    (`amount {value, currency}`), sin fallback a la sesión; si el pago trae
    `merchant.seller.operationReferenceId`, tiene que ser el del intento; sin ninguna referencia
    (ni sesión ni pago) → INCONSISTENTE. Confirmar la forma
    real de la respuesta con las claves STG de uPay (hasta entonces el pago sigue apagado).
13. M-pay4 — rechazo y «a devolver» en la misma transacción.
14. M-pay5 — un pedido con error no corta el ciclo del job; `pagoId` repetido (índice único)
    se captura: no se da por pagado, se registra `pago_id_duplicado` y se avisa al personal.
15. M-pay1 — FALLIDO sin reintento: se cancela pasadas 2 h y vencida la sesión.
16. M-F2-5 — clave de idempotencia del checkout persistente (sessionStorage, atada al carrito).
17. M-F2-7 — sin caja del usuario, no se acepta (no cae en una caja ajena).
18. M-F2-8 — rechazo condicionado (no pisa una materialización concurrente).

Además: M-auth6 (tope de altas por IP). El resto de los medios y bajos: corregidos o con issue.

## Decisiones (evidencia «plan-decisiones»)
- Sin migración nueva. Interruptor: «Tienda activa» y «Ofrecer pago con tarjeta» apagados.
- Pedido pagado con aceptación automática sin caja: queda ACEPTADO+PAGADO y lo reintenta el job.

## Pruebas
- `test:tienda-seguridad`, `test:pedidos-online`, `test:pagos-online`,
  `test:pedido-online-materializacion`, `test:tienda-online-migracion` (SQLite y PG).
- E2E en la copia (tienda en claro, escritorio en oscuro) con datos de clientes de prueba;
  cobro y factura de la venta. `test:all` sin fallas nuevas; CI 4/4.

## Vuelta atrás
Revertir el PR F5 solo con la tienda apagada (F1–F4 no se mergean sin F5).
