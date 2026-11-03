# Auditoría del diff #325/#240 — eje Correctitud del motor

Base: `git diff origin/develop...HEAD`. Verificado leyendo el código real (no se corrió `test:all` ni `check`).

## Hallazgos

### 1. MEDIA — Falso rechazo: editar la descripción del renglón de envío/recargo
`electron/utils/factura-venta.utils.ts:305-312`. El diálogo permite editar la descripción de cualquier renglón (plan: "Sí: descripción"), pero los renglones sintéticos se comparan por **descripción exacta** (`l.descripcion === desc`). Si el cajero cambia `SERVICIO DE DELIVERY` por `ENVIO` (o `RECARGO` por `REDONDEO`), el servidor responde «El renglón «ENVIO» no corresponde a la venta» y el cajero no entiende por qué (el campo se ve editable).
Propuesta: emparejar los sintéticos por tipo + monto + IVA (no por texto), y/o dejar la descripción de esos dos renglones como readonly en el diálogo. Hoy tampoco hay un test de este caso.

### 2. MEDIA — El modo Resumido acepta casi cualquier renglón único
`factura-venta.utils.ts:273,322`. `resumido = deVenta.length===0 && sinVinculo.length===1`; en esa rama se saltan la validación de descripción, IVA y descuento; sólo se exige `total == propuesta.total ±1`. Escenarios:
- Un renglón `ivaTipo: 0` (o 5) por el total de una venta 100% gravada al 10: pasa y la factura declara IVA 0 (subdeclaración fiscal). El plan dice "CONSUMISION IVA 10".
- Un renglón de ₲200.000 con `descuento: 100.000` para una venta de ₲100.000: pasa (el plan exige `descuento = 0` en Resumido y no se verifica; en la rama detallada sí se verifica).
- Descripción libre (`SERVICIOS PROFESIONALES`).
Propuesta: en Resumido exigir `descuento == 0`, `cantidad == 1`, `ivaTipo == 10`, descripción `CONSUMISION` (o al menos no vacía) y `precioUnitario == propuesta.total`. Dejar claro que Resumido pasa todo a IVA 10 aunque haya ítems exentos/5% (decisión de negocio ya existente, pero ahora validada por el servidor, así que conviene que Gabriel la confirme).

### 3. MEDIA — `...it` y `facturaRepo.create(factura)` aceptan campos arbitrarios del cliente (agujero #240 sin cerrar)
`facturacion.handler.ts:392` y `:437`. Se recalculan montos pero el resto del payload se persiste tal cual:
- `items[i].id = <id de un FacturaItem de OTRA factura>` → `save()` hace UPDATE de ese renglón y lo re-asigna a `factura: saved` (reescribe una factura emitida; el cálculo de totales no lo impide).
- `factura.id = <id existente>` → `save()` sobrescribe esa factura (incluye `estado`, `numeroCompleto`).
- `factura.estado = 'ANULADA'` o `factura.items` (OneToMany con cascade) permiten colar renglones por la relación cascada, sin pasar por la validación.
- `producto: {id: X}` arbitrario en el renglón; `numeroManual` sin unicidad (preexistente).
Propuesta: armar la entidad con whitelist explícita (timbradoDetalle, venta, cliente, plantilla, tipoFacturacion, condicionVenta, datos del receptor, fecha); para renglones `{descripcion, cantidad, precioUnitario, ivaTipo, total, producto?, ventaItem?}`; borrar `id`, `estado`, `items`, `motivoAnulacion`, `cdc`.

### 4. MEDIA — `create-factura({})` / sin renglones emite una factura vacía
`facturacion.handler.ts:343-390`. Con `data = {}` ya no hay TypeError pero tampoco ningún rechazo: `lineas=[]`, sin venta, sin `detalleId` → se guarda una `Factura` EMITIDA total 0, sin número. En la ruta con timbrado, se consume un número para una factura sin renglones.
Propuesta: rechazar `lineas.length === 0` (o total ≤ 0 salvo venta de total 0 explícita) antes de tocar la numeración.

### 5. BAJA/MEDIA — Upsert de cliente fuera de la transacción y antes de validar
`facturacion.handler.ts:326-344`. Se ejecuta antes de que el servidor sepa si la factura es válida. Una factura rechazada (total no coincide, venta ya facturada, etc.) igualmente crea `Persona`+`Cliente` (o completa dirección/teléfono/email de uno existente) con datos de una emisión que no existió. Además corre fuera de `withFacturaLock`; en SQLite (conexión única) puede intercalarse con la transacción de otra emisión, y dos emisiones concurrentes con el mismo RUC nuevo pueden duplicar el cliente (`buscar` + `crear` sin lock). Persona y Cliente tampoco van en una transacción (si falla el Cliente queda la Persona huérfana; preexistente).
Propuesta: mover el upsert dentro del lock **después** de la validación (try/catch con savepoint o, en PG, como paso posterior a la validación y fuera del bloque que numera); mínimo: ejecutarlo recién tras `validarFacturaContraVenta`.

### 6. BAJA — El servidor guarda los valores del cliente, no los de la propuesta (deriva de ±₲1)
`facturacion.handler.ts:390`, `factura-venta.utils.ts:295-327`. Tolerancias: precio ±0.01 por unidad, cantidad ±0.0005, descuento ±1 y total ±1. Después se guarda `calcularTotalesFactura(lineas_del_cliente, descuento_del_cliente)`. Un cliente puede dejar la factura hasta ₲1 por debajo/encima de lo cobrado (p. ej. `descuento = propuesta.descuento + 1` con un renglón +1). Un cliente legítimo no cae acá, pero el invariante "factura == caja" se garantiza sólo ±1.
Propuesta: con venta, persistir `precioUnitario/cantidad/ivaTipo/descuento` tomados de la propuesta (el payload sólo aporta descripción) y bajar la tolerancia a 0.

### 7. BAJA — No se exige que estén todos los renglones de la propuesta
`factura-venta.utils.ts:279-313`. Se valida cada renglón enviado, pero no que estén todos; sólo el chequeo de total lo cubre. Renglones con total ≤ ₲1 (ítem de precio 0, cortesía) o la tolerancia de 1 permiten omitirlos. Ítems a precio 0 también pueden omitirse sin error (caso legítimo, pero la factura no los lista). Propuesta: exigir que el conjunto de `ventaItemId` enviados == el de la propuesta (o declarar explícitamente que se aceptan omisiones de renglones en 0).

### 8. BAJA — `idVentaItemDe` y renglones "sin vínculo"
`factura-venta.utils.ts:237-240`. Acepta `ventaItem.id` **o** `ventaItemId`, pero la entidad sólo persiste `ventaItem` (no existe `ventaItemId`). Un renglón con `ventaItemId: 5` valida como ítem 5 y se guarda sin vínculo. Un `ventaItem: {id: "abc"}`/`-1`/`0` se clasifica como "sin vínculo", pasa por la rama de sintéticos (falla por descripción, bien) pero con `{id:"abc"}` en Resumido (único renglón) llega a `itemRepo.create({...it})` con el `ventaItem` basura (error de FK o de tipo, no silencioso, pero mal mensaje). Propuesta: normalizar `ventaItem` a `{id}` numérico tras validar; ignorar `ventaItemId`.

### 9. BAJA — Resumido: race con la carga de la propuesta
`facturar-dialog.component.ts:153-157, 372-395`. El toggle no se deshabilita mientras `cargandoPropuesta`. Si el cajero activa Resumido antes de que llegue la propuesta, `cargarPropuesta` hace `itemsArray.clear()` y repone los renglones detallados mientras `resumido === true` (UI en modo resumido con renglones detallados; el payload sigue siendo válido pero el estado es incoherente) y `itemsBackup` quedó vacío. Propuesta: `[disabled]="cargandoPropuesta || !!errorPropuesta"` en el toggle.

### 10. BAJA — Negativos / fraccionarios
- `precioUnitarioNetoItem` puede dar < 0 (descuento por unidad > precio+adicionales). El diálogo tiene `Validators.min(0)` en `precioUnitario` y bloquea emitir; la caja sí cobra. `calcularTotalesFactura` con una base negativa podría producir `gravada*` negativa. Propuesta: en `armarFacturaDesdeVenta` acotar a 0 o mostrar error claro.
- Ítems sin producto/descripción vacía (`descripcionItem` devuelve `''`): `Validators.required` bloquea emitir. Poner `'ITEM'` por defecto.
- `bruto = Math.round(Σ)` mientras la caja suma sin redondear: con adicionales fraccionarios (proporciones de sabor) la propuesta puede diferir ≤ ₲0.5 de `deudaBruta − desc + aum`; el test de paridad lo debe cubrir con valores fraccionarios.
- Un `-0` puede quedar en una base cuando `desc` supera `Σ` por redondeo (`Math.round(-0.4)`); inocuo, pero se serializa `0`.

### 11. BAJA — Venta sin ítems ACTIVOS pero con envío/recargo
`facturar-dialog.component.ts:~164`. Si no hay ítems el diálogo marca error aunque exista línea de envío/recargo. Caso marginal.

## Puntos revisados sin riesgo

- **Paridad con la caja.** `getEstadoCobroVentaInternal` suma `computeNetoBrutoItem` (ahora importado de `venta-total.utils`, una sola copia) de ítems ACTIVOS + `costoDelivery`; ajustes = Σ `valor` de `PagoDetalle` activos DESCUENTO/AUMENTO. `calcularFacturaDeVenta` hace exactamente lo mismo (mismas consultas, mismo `Number()`), así que `total = deudaBruta − desc + aum`. El diálogo de cobro (`calculateTotals`) usa subtotal − descuento ítem + `costoDelivery`: idéntico.
- **Cobro parcial por ítems / crédito.** La propuesta no depende de `montoCubierto` ni de la forma de pago (D5: cualquier momento), igual que `deudaBruta`. Crédito sin `Pago` → ajustes 0 en ambos lados. Los ajustes se guardan en moneda principal (verificado en `openAjusteDialog`).
- **Delivery convertido a retiro.** `delivery-convertir-modo` pone `costoDelivery = 0` en la venta y la propuesta lee el valor fresco; no queda línea de envío.
- **Aumento + descuento a la vez.** El aumento entra como renglón (parte del bruto) y el descuento se reparte sobre todo el bruto; `bruto − desc` = `deudaBruta + aum − desc`. Correcto.
- **Descuento mayor al total.** Se acota a `[0, bruto]` en `calcularTotalesFactura`; `propuesta.descuento` ya viene acotado y el servidor lo compara con el acotado. Total 0, bases 0. (La caja en ese caso queda con saldo negativo/vuelto; es un caso del cobro, no de la factura.)
- **Reparto y redondeo (`factura-totales.util.ts:56-101`).** Cada base neta = `round(b − d·b/S)`; el residuo (|residuo| ≤ ~1.5) va a la base mayor, que es ≥ S/3, por lo que no puede quedar negativa con líneas ≥ 0. `total = bruto − desc` y Σ bases == total por construcción (el residuo lo fuerza). IVA se calcula sobre bases netas: consistente. `iva10`/`iva5` redondeados individualmente, `totalIva = iva10 + iva5`.
- **Dos ítems idénticos / precio 0.** Se emparejan por `ventaItemId` (ids distintos), no por contenido; precio 0 pasa (`Validators.min(0)`, tolerancia 0.01). Duplicar el mismo id se rechaza (`vistos`).
- **Orden de rechazos vs. `numeroActual`.** Permiso → locks → existencia de factura previa → validación → recálculo → recién después la lectura/avance de `numeroActual`. Todo en una transacción, así que además hace rollback. Los únicos `throw` posteriores (rango del timbrado) también revierten.
- **`withFacturaLock`.** `finally { release() }` garantiza liberar aunque `fn` lance; `prev` nunca rechaza (se encadena `miTurno`, que sólo resuelve), el `.catch` es redundante pero inocuo. No hay reentrancia dentro de `fn`, por lo que no hay deadlock. Limitación: sólo serializa `create-factura` entre sí (en SQLite otros handlers que usan `transaction` comparten la conexión; es una limitación estructural ya documentada en `tx.utils.ts`).
- **Locks Postgres.** `FOR UPDATE` sin relaciones sobre `ventas` y `timbrado_detalles` antes de leer la factura previa y el `numeroActual`; correcto frente a emisiones concurrentes. TOCTOU residual: un descuento cargado en el cobro entre la validación y el commit no está bloqueado (D5 lo asume: "anular y rehacer").
- **Payload del diálogo vs. servidor.** `facturar()` arma explícitamente `{descripcion, cantidad, precioUnitario, ivaTipo, total, producto?, ventaItem?}`; `ivaLabel` es sólo un control del form y **no viaja** (ni entra en `calcularTotalesFactura`, que lee `cantidad/precioUnitario/ivaTipo`). `getRawValue()` en el backup de Resumido lo incluye pero `addItem(init)` lo reconstruye desde `ivaTipo`. `venta` sólo se manda si hay `prefillVentaId`. `gravada*/iva*/total` del payload son ignorados por el servidor.
- **Toggle Resumido ida y vuelta.** Backup con `getRawValue()` (conserva `ventaItemId`, descripción editada, productoId) y restauración del descuento: el payload detallado resultante es válido. El Resumido total sale de `recalc()` (entero) y coincide con `propuesta.total`.
