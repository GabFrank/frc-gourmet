# Auditoría B (correctitud técnica y riesgo) — PLAN #325 + #240

Verificado contra el código de `/Users/gabfranck/workspace/frc-gourmet-fix325`. Sin cambios de código.

## Respuestas directas

1. **Invariante de paridad: FALSA tal como está escrita.**
   - `getTotalesPorVenta` NO incluye el envío (`electron/utils/venta-total.utils.ts:45-103`; sólo suma `sqlTotalLineaItem` más ajustes). El plan ya suma `+ costoDelivery`, bien.
   - Pero `getEstadoCobroVentaInternal` (`ventas.handler.ts:4957-5000`) suma `d.valor` de DESCUENTO/AUMENTO SIN convertir moneda (L4989-4992). `getTotalesPorVenta` sí convierte (`venta-total.utils.ts:89`, `convertirAPrincipal`, con `toFixed(2)` en `moneda.utils.ts:80`). Divergen en cuanto un ajuste no está en moneda principal.
   - `getTotalesPorVenta` además trunca a 0 (L97-99) y `getEstadoCobro` no. Y los ajustes sólo existen si hay `venta.pago_id` (join L76).
2. Ver hallazgos A2, M1, M2.
3. Ver A1.
4-6: ver hallazgos.

## Hallazgos

### ALTA

**A1. D3 ("una EMITIDA por venta") tiene carrera en ambos drivers; el plan no dice cómo blindarla.**
- `create-factura` abre `dataSource.transaction` (`facturacion.handler.ts:316`) y lee el timbrado con `detalleRepo.findOne` SIN lock (L327). Hoy ya hay doble numeración posible en PG (dos emisiones simultáneas leen el mismo `numeroActual`). Un "SELECT count de EMITIDAS de la venta; si 0, insertar" tiene la misma ventana.
- SQLite (driver `sqlite3`, una sola conexión): dos `dataSource.transaction()` intercalados comparten la MISMA transacción física (ver `electron/utils/tx.utils.ts:4-20`; ya midieron que el ROLLBACK de una descarta los INSERT de la otra). Un check-then-insert entre `await`s no es atómico y un rechazo (throw → rollback) de la segunda emisión puede llevarse puesta la primera.
- Propuesta concreta (defensa en profundidad):
  1. **Índice único parcial** en migración nueva: `CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_venta_emitida ON facturas (venta_id) WHERE estado = 'EMITIDA' AND venta_id IS NOT NULL` (SQLite y PG soportan índices parciales; es lo único realmente atómico en ambos). La migración debe ser driver-aware y **tolerar duplicados históricos**: si ya hay venta con 2 EMITIDAS (el plan admite que hoy se puede), el `CREATE UNIQUE` falla y el arranque aborta. Pre-chequear; si hay duplicados, saltar el índice y loguear, o crearlo solo sobre `id >` del máximo actual no es posible → mejor dejar el guard de app + script D4 y crear el índice cuando no haya duplicados.
  2. Guard de aplicación dentro de la transacción: en PG `SELECT id FROM ventas WHERE id=$1 FOR UPDATE` (SQL a mano, como `delivery.handler.ts:152`; `findOne({lock})` con relaciones rompe en PG) y `SELECT ... FOR UPDATE` del `timbrado_detalles` (arregla de paso la doble numeración). En SQLite, un mutex de proceso (cola de promesas, patrón `withAperturaCajaLock`) que envuelva TODO el `create-factura`, porque el lock SQL no existe y la transacción es compartida.
  3. Mapear la violación del índice único a un mensaje claro ("la venta ya tiene factura N").
- Test: lanzar dos `create-factura` con `Promise.all` sobre la misma venta, en SQLite y PG, y exigir exactamente una EMITIDA y numeración sin saltos. El plan no lo tiene (ver A4).

**A2. Fase 3 depende de que "Factura" se pulse después de cargar el descuento; el botón no tiene esa garantía.**
- El botón Factura está siempre habilitado, sin condición (`cobrar-venta-dialog.component.html:415`); no espera al `Pago` ni a que se cobre. Los ajustes se persisten recién al cargarlos (`cobrar-venta-dialog.component.ts:1116-1140`, crea el `Pago` si no existe). Si el cajero factura primero y descuenta después, la propuesta (leída al abrir el diálogo) sale por más de lo cobrado y, con D3, queda trabada hasta anular. Con la validación servidor (Fase 2) el mismo problema aparece al revés: factura legítima emitida antes del ajuste.
- Propuesta: definir y testear el contrato. Opciones: (a) deshabilitar Factura hasta que `saldoPrincipal <= tolerancia` (cobro cuadrado) — coherente con el comentario de la L1586 ("acto post-cobro"); (b) permitir pre-cobro pero avisar "la factura no incluye ajustes aún no cargados". Elegir una y reflejarla en la checklist. Además, ¿qué pasa en venta a crédito (`cobrarCredito`)? Tampoco hay Pago/descuento garantizado; el plan no la menciona.

**A3. Cobro parcial por ítems y factura parcial quedan rechazados por diseño sin alternativa.**
- `getEstadoCobroVentaInternal` expone `items[].montoCubierto`; un cliente que paga parte de la cuenta y pide factura de lo suyo es un flujo legítimo del PdV (`cobroParcial`, `cobrar-venta-dialog.component.ts:1621`). Fase 2.4 exige `|total − esperado| ≤ 1` contra la venta ENTERA y D3 bloquea la segunda factura: resultado, no se puede facturar por partes ni emitir factura por el pagado hasta ahora. El plan lo manda a "issue aparte" sin medir cuántas veces ocurre. Propuesta: mínimo, que el mensaje de rechazo lo diga; mejor, validar "suma de EMITIDAS de la venta + esta ≤ total esperado + tol, sin repetir ventaItem" (alternativa de D3) en lugar de bloquear. Es más código pero evita rechazar un flujo existente. Decisión del dueño: pedirla explícitamente en D3.

### MEDIA

**M1. Prorrateo del descuento entre tasas de IVA y tolerancia ±1.**
- Cálculo: `iva10 = round(g10/11)` sobre bases ya con descuento prorrateado; cada redondeo agrega hasta 0,5 por tasa → hasta ±1 entre `iva10+iva5` y el IVA "exacto". No hay riesgo para el total (el total se arma de bases, no de IVA), pero la tolerancia ±1 Gs del total es suficiente solo si el total no se redondea por línea: con 10 líneas de precio unitario fraccionario (p. ej. `precioVentaUnitario = precioCalculado − totalAdicionales` con `totalAdicionales = Σ adicional×proporción`, `pdv.component.ts:2290`, proporciones 1/3) la suma de totales de línea a 2 decimales puede diferir de la suma exacta en varios centavos, pero no en ≥ 1 Gs; ok. Pero `FacturaItem.precio_unitario` es `scale 2` y `cantidad scale 3` (`factura-item.entity.ts`): `cantidad×precioUnitario` recalculado en servidor sobre valores redondeados a 2 decimales vs. la deuda calculada con valores sin redondear en `venta_items` (también `decimal`, ver scale) puede diferir. Definir una sola regla: ¿redondeo por línea o sobre el total? Exigir que `calcularFacturaDeVenta` y el recálculo usen exactamente el mismo `round`, y comparar contra el total de la venta con un único `Math.round` al final.
- Residuo "a la base mayor": con una sola tasa gravada no hay problema; con 3 bases (10/5/exenta) definir si la exenta recibe parte del descuento. El plan dice "entre las tasas de IVA"; ¿incluye exenta? Dejarlo explícito.
- Descuento mayor al bruto: `getTotalesPorVenta` trunca a 0, `getEstadoCobro` no → rechazo o factura negativa. Definir (clamp a 0 y rechazar total ≤ 0).
- Aumento: "aumento = descuento negativo no se imprime: se reparte en las líneas" es ambiguo; `Factura.descuento` no tiene validación de signo y la plantilla probablemente imprime solo positivos. Mejor: aumento como línea `AJUSTE POR REDONDEO` IVA 10 (o prorrateo en bases con la misma regla), y testearlo. Hoy el prorrateo del aumento no está en los tests.

**M2. Monedas con decimales (USD) y moneda propia de la factura.**
- `Factura` tiene `moneda` y `tipoCambio` (`factura.entity.ts:80-86`) pero el diálogo NUNCA las envía (`facturar-dialog...:470-495`), y el plan no las setea: la factura queda sin moneda. Propuesta: el servidor fija `moneda = principal` y `tipoCambio = 1` (o la moneda principal), y rechaza payload con moneda ajena.
- El ajuste global en el cobro actual siempre se guarda en moneda principal (`cobrar-venta-dialog.component.ts:1141`, `moneda: monedaPrincipal`). La conversión de `getTotalesPorVenta` solo importa para filas viejas/otros flujos. Consecuencia: el **test 5 (descuento en USD con cotización) prueba un caso que el cobro real no produce**, y en ese caso `getEstadoCobro` (sin conversión) y `getTotalesPorVenta` dan totales distintos → el test 7 fallaría por una divergencia ya existente, no por el plan. Propuesta: o se arregla la fuente (hacer que `getEstadoCobroVentaInternal` convierta, o hacer que ambas llamen a un único helper de ajustes), o se acota la invariante a "ajustes en moneda principal" y se documenta el hueco con un test que lo marque. No inventar una cuarta copia.
- Sin cotización: `convertirAPrincipal` devuelve `montoPrincipal: null` y `getTotalesPorVenta` cae al nominal (L90-92); en USD eso mete 50 (dólares) como 50 Gs. El plan lo asume "igual que getTotalesPorVenta"; para un documento fiscal es preferible rechazar con mensaje que emitir un monto inventado.

**M3. Qué rompe el cambio en flujos existentes.**
- **Modo Resumido**: el diálogo colapsa a una línea `CONSUMISION` sin `ventaItem` con `precioUnitario = this.total` (L370-378) y deja `descuento=0`. Hoy `this.total` = lo precargado; con la propuesta correcta ya incluye el descuento, así que pasa. Riesgo: el Resumido calcula el total desde `recalc()`, que usa `g10+g5+ex−descuento`; verificar que el `descuento` de la propuesta se pone en el form ANTES (si no, se duplica o se pierde). Test explícito: Resumido con descuento global y con envío.
- **Factura manual (list-facturas)**: sin `venta`, el servidor recalcula totales de línea y subtotales desde las líneas. Esto cambia el contrato: hoy el cliente podía mandar descuento y total; el servidor debe decidir qué hace con `factura.descuento` (¿se resta del total?). `recalc()` hace `total = Σ − descuento` y calcula el IVA sobre bruto SIN descuento (L395-401), mientras el plan prorratea. Hay dos fórmulas de IVA con descuento (diálogo manual vs. propuesta servidor); unificar en el util (que el diálogo manual use el mismo cálculo vía el servidor o replicarlo) o el IVA de las facturas manuales con descuento seguirá siendo sobre el bruto.
- **Delivery**: la línea `SERVICIO DE DELIVERY` sin `ventaItem` debe pasar la regla "ventaItem sin venta → rechazo" (no aplica, no tiene ventaItem), pero sí hay que garantizar que la validación no exija "todo ítem del payload trae ventaItem". Conviene que el servidor identifique la línea de envío por el monto, no por la descripción (el cajero puede editarla). Un envío cuyo `costoDelivery` cambia luego (hay `delivery-convertir-modo`, que usa `getEstadoCobroVentaInternal`) deja la factura desactualizada: es el mismo caso que A2.
- **Ítems agregados/cancelados después de abrir el diálogo**: el diálogo recibe `this.activeItems` (copia en memoria del cobro) pero la propuesta se lee del servidor; el servidor manda. Bien, pero el "ítem cancelado → rechazo" convierte una carrera inofensiva en error visible; el mensaje debe pedir reabrir el diálogo.
- **Modo `client`**: `createFactura` en `repository-http.service.ts:2672` lanza "no implementado en modo cliente". El plan agrega `getFacturaPropuestaVenta` a ese servicio; debe ser el mismo `throwError` (o implementarse por RPC junto con `createFactura`), si no, la Fase 3 deja el diálogo inutilizable de otra forma. Verificar el comportamiento actual del diálogo en client antes de prometer nada.
- **Estado de la venta**: venta anulada/cancelada con items ACTIVO; no hay chequeo de estado de venta en el plan. Agregar.

**M4. `precioAdicionales` incluye los adicionales de cada sabor (pregunta 1 del encargo): CIERTO, con un matiz.**
- `pdv.component.ts:2269-2290`: `totalAdicionales = Σ sabor.personalizacion.precioAdicionalTotal × sabor.proporcion`; `precioVentaUnitario = precioCalculado − totalAdicionales`; `precioAdicionales = totalAdicionales` → los adicionales de sabores están incluidos y prorrateados por proporción. El pedido online también (`ventas.handler.ts:431-475`). Matiz: `precioAdicionales` puede ser fraccionario (p. ej. 5000×0,333); la descripción que "lista los adicionales por sabor" no sumará a ese monto. No es un error, solo evitar que algún test compare descripción vs. monto. Y los `VentaItemIngredienteModificacion` no tienen precio: no afectan.

### BAJA

**B1. Canal `get-factura-propuesta-venta` sin `ensurePermission`.** Devuelve precios de venta, descuentos, costo de envío y nombres de producto de CUALQUIER `ventaId` a cualquier llamador de `/api/rpc` (default-allow, `electron/server/rpc-router.ts:33-`). No incluye costos ni datos de cliente si se arma sólo con los campos descritos. No es exfiltración grave (los `get-ventas`/`get-venta-items` ya lo exponen), pero este canal es la entrada del flujo de emisión: pedirle `FACTURACION_EMITIR` es gratis (el diálogo sólo lo usa quien factura) y alinea la lectura con la escritura. No lo pondría en `BLOCKED_CHANNELS`: es uso legítimo desde PWA/modo cliente. Asegurar que NO se devuelva `precioCostoUnitario` ni el margen. Validar `ventaId` como entero positivo.

**B2. Paridad SQLite/PG de tipos.** `decimal` llega como string en PG: el plan lo cubre con `Number()` (test 10). Añadir: en el SQL del util nuevo no mezclar `SUM(...)` sin `Number()` (el `getTotalesPorVenta` ya lo hace, L56-59); no comparar `pd.activo` con `= 1` (en PG es boolean; hoy se usa `AND pd.activo` correcto, copiar eso); `IN (${ids})` sólo con enteros validados (ya se hace). `estado = 'ACTIVO'` es varchar en ambos.

**B3. Fase 2.3 "el descuento global se toma de la propuesta, no del payload".** Contradice el caso Resumido (descuento=0 en payload). Aclarar que la comparación es sobre el TOTAL, y que el servidor guarda `descuento` y subtotales de su propia propuesta solo si las líneas del payload coinciden con las de la propuesta; si es Resumido (líneas ≠ propuesta pero total igual) guardar el desglose del payload recalculado con descuento 0 — hay dos caminos y deben estar descritos.

## Plan de tests (pregunta 5)

Apunta bien a los riesgos de cálculo (multiplicar adicional por cantidad, dos unidades, ítems múltiples, string decimal). Huecos:
- **Mutación que deja todo verde**: borrar el bloqueo D3 (guard de aplicación) y dejar sólo el test secuencial "segunda factura rechazada" → sigue verde con la carrera presente (A1). Falta test concurrente.
- **Mutación**: cambiar `Math.round(g/11)` por `Math.floor` → los tests con totales múltiplos de 11 (o con tolerancia ±1) siguen verdes. Usar bases como 10.005, 99.999, 75.000×2 y asertar exacto el IVA, no sólo "suma exacta".
- **Mutación**: quitar `Number()` en el util del servidor → test 10 lo ve sólo si se prueba la ruta CON BASE (PG real o un doble que devuelva strings), no sólo la pura. SQLite devuelve números; sin `FRC_TEST_PG` el test 10 es una prueba de la función pura únicamente.
- **Mutación**: que `create-factura` calcule contra la propuesta pero NO bloquee ítems de otra venta cuando la suma coincide casualmente → test 8 cubre "ítem de otra venta", ok.
- **Mutación**: hacer que la tolerancia sea `> 1000` o `Infinity` → ninguno de los tests listados lo detecta. Agregar test límite: total + 1 pasa, total + 2 rechaza.
- **Mutación**: que el servidor confíe en `total` del payload tras recalcular línea → test 9 lo ve. Bien.
- Faltan: Resumido con descuento+envío; aumento global; descuento > bruto; venta sin ítems activos; venta a crédito; cobro parcial; factura manual con descuento (IVA sobre bruto vs. neto); venta anulada; doble emisión concurrente; payload con `moneda` ajena; `numeroManual` + validación (sin cambios, pero cubrir que el rechazo por total NO avanza `numeroActual` — importante: el rechazo debe ocurrir ANTES de `detalle.numeroActual++`/save, L342-350, o en SQLite (sin rollback real si la transacción está intercalada) se pierde un número fiscal).
- El test 7 depende de que `getEstadoCobroVentaInternal` y `getTotalesPorVenta` coincidan; ver A (invariante falsa con moneda no principal).
- "Revertir el fix para ver rojo" es buena práctica; mantenerla.

## Orden crítico dentro de `create-factura`
Todas las validaciones nuevas deben ir ANTES de tocar el timbrado (L327-352). Un `throw` después de `detalleRepo.save(detalle)` consume el número; en PG hace rollback, en SQLite con la transacción compartida puede no hacerlo. Poner validación, recálculo y guard D3 primero; numeración al final, justo antes de `facturaRepo.save`.
