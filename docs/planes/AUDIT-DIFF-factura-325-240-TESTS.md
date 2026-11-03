# Auditoría: poder discriminante de los tests (#325 + #240)

Método: se aplicó cada mutación a producción, se corrió `npm run -s test:factura-venta` (baseline: 51 asserts, 0 fallos, ~12 s) y se revirtió con `git checkout -- <archivo>`. Además se corrieron 9 sondas con un script temporal (ya borrado) sobre el código sin mutar. El árbol quedó igual que al empezar.

## Resultado de las mutaciones

| # | Mutación | Archivo:línea | ¿Detectada? |
|---|---|---|---|
| M1 | residuo de redondeo siempre a la base 10 | factura-totales.util.ts:83 | NO (en todos los fixtures la base 10 es la mayor) |
| M2 | descuento sólo contra gravada 10 | factura-totales.util.ts:78 | SÍ (A, D) |
| M3 | no filtrar `PagoDetalle` inactivos | factura-venta.utils.ts:189 | SÍ (el fixture A tiene un descuento anulado de 99.999) |
| M4 | `TOL_MONTO = 1000` | factura-venta.utils.ts:227 | NO |
| M5 | tolerancia de precio 500 y de cantidad 0,9 | factura-venta.utils.ts:295-296 | NO |
| M6 | sin comparar la cantidad de un ítem | factura-venta.utils.ts:295 | NO |
| M7 | renglón sintético sin chequear IVA | factura-venta.utils.ts:310 | NO |
| M8 | renglón sintético sin chequear precio | factura-venta.utils.ts:309 | NO |
| M9 | renglón sintético sin chequear descripción | factura-venta.utils.ts:307 | NO |
| M10 | ítem sin chequear IVA | factura-venta.utils.ts:297 | SÍ |
| M11 | sin chequear el descuento en el detallado | factura-venta.utils.ts:315 | SÍ (un solo assert, F) |
| M12 | no recalcular `FacturaItem.total` | facturacion.handler.ts:437 | SÍ (un solo assert, D) |
| M13/M14 | `exenta` / `gravada5` guardadas desde el payload | facturacion.handler.ts:~391-393 | NO |
| M15 | `descuento` guardado desde el payload | facturacion.handler.ts:~397 | NO |
| M16 | `iva5` guardado desde el payload | facturacion.handler.ts:~396 | SÍ (D) |
| M17 | no rechazar `ventaItem` en factura sin venta | facturacion.handler.ts:~372 | SÍ |
| M18 | `otra` EMITIDA sin filtrar por estado | facturacion.handler.ts:~358 | SÍ (E) |
| M19 | envío con IVA 5 | factura-venta.utils.ts:115 | SÍ |
| M20 | resumido con `sinVinculo.length >= 1` | factura-venta.utils.ts:273 | NO |
| M21 | `ivaTipo ?? 10` → sin default | factura-venta.utils.ts:104 | NO |
| M22 | descuento sin tope al bruto | factura-totales.util.ts:70 | SÍ (K) |
| M23 | descuento negativo permitido | factura-totales.util.ts:70 | NO |
| M24 | adicionales inactivos en la descripción | factura-venta.utils.ts:170 | NO (sólo cambia la descripción) |
| M25 | recargo restado | factura-venta.utils.ts:193 | SÍ |

## Sondas sobre el código sin mutar (huecos de producción que los tests no ven)

- P1: resumido con `descuento: 7000` y renglón por total + 7000 se acepta y se guarda `descuento = 7000`. El doc de `validarFacturaContraVenta` dice "sin descuento", pero la rama resumida (línea 275) nunca lo valida.
- P2: resumido con IVA 0 por el total completo se acepta y se guarda `exenta = 170000`, `iva10 = 0`. El resumido no compara la tasa de IVA, así que se puede evadir el IVA de una venta gravada.
- P8: una venta sin ítems acepta una factura con `items: []` y total 0.
- P7: `descuento = -1` no se rechaza. Se acota a 0 y lo cubre `TOL_MONTO`; es inocuo.
- Bien cubiertos: P5 (1×150.000 en vez de 2×75.000, lo rechaza el chequeo por renglón), P6 (precio +0,4), P9 (renglón extra en 0) y P10 (`ventaId` plano).

## Hallazgos priorizados

### ALTA

1. **El resumido no valida IVA ni descuento (P1, P2, M20).** factura-venta.utils.ts:273-275 y 322.
   - Fixture: [G] sólo prueba el resumido feliz (IVA 10, descuento 0) y uno "por menos".
   - Tests a agregar en [G]:
     - `rechaza(emitir(resumido(total+7000, descuento=7000)), /descuento|resumido/)`
     - `rechaza(emitir(resumido(total, iva=0)), /IVA/)`
     - un resumido válido donde la venta mezcla tasas.
   - Fix de producción asociado: en la rama resumida exigir `descuento === 0` e `ivaTipo === 10` (o la tasa decidida).
   - Aserción adicional: leer la fila guardada y comprobar `exenta === 0`, `descuento === 0`.

2. **Los renglones sintéticos (envío y recargo) nunca se mutan en [F] (M7, M8, M9).** test-factura-venta-e2e.ts:223-256.
   - Fixture: `vB` tiene `costoDelivery = 0` y no tiene `AUMENTO`, así que `sinteticas` está vacío. El único caso sintético ("VARIOS") se rechaza igual porque no hay con qué emparejarlo.
   - Tests a agregar: sobre una venta con envío y recargo (como A), un caso por mutación. Cada uno debe dar `/no corresponde a la venta/`:
     - descripción `DELIVERY` en vez de `SERVICIO DE DELIVERY`
     - precio del envío 1.000 en vez de 10.000, compensado en otro renglón
     - IVA 5 en el envío
     - envío duplicado
     - envío omitido (cae por total)
   - Hoy eso no existe: ni una sola mutación del emparejamiento sintético hace fallar la suite.

3. **Los campos de la factura guardados no se afirman contra el payload (M13, M14, M15).** test-factura-venta-e2e.ts:199-208.
   - D manda `gravada10:1, gravada5:1, exenta:1, iva10:1, iva5:1, total:1`, pero sólo afirma `total`, `gravada10`, `iva10` e `iva5`.
   - Asserts a agregar en D, después de `emitir`: `gravada5 === 5737`, `exenta === 7649`, `descuento === 9000`.
   - Además mandar `descuento` distinto en el payload de H (hoy no se afirma `f.descuento`), y asegurar `gravada10 + gravada5 + exenta === total` sobre la fila guardada. Se puede leer con `R(Factura).findOneBy` para no depender de la relación.

### MEDIA

4. **Ninguna tolerancia tiene un test de borde (M4, M5, M6).** factura-venta.utils.ts:227, 295-296.
   - Todos los rechazos de F usan deltas enormes.
   - Casos a agregar:
     - total +1 se acepta (tolerancia legítima del redondeo) y total +2 se rechaza (hoy `TOL_MONTO` puede subir a 1000 sin romper nada)
     - precio +0,5 con cantidad 1 se rechaza
     - cantidad 1 × 150.000 en lugar de 2 × 75.000 (mismo total) se rechaza: es la única forma de matar M6, porque la comparación de cantidad es redundante con el total salvo en esta compensación
     - descuento ±1 se acepta y ±2 se rechaza
   - M5 y M6 son redundantes con el chequeo de total salvo en esos casos de compensación.

5. **El residuo siempre cae en la base 10 en los fixtures (M1).** factura-totales.util.ts:80-85.
   - Falta un caso donde la base mayor sea la de 5% o la exenta, y otro con empate.
   - Test en K: `calcularTotalesFactura([{1,10,ivaTipo:10}, {1,20,ivaTipo:5}, {1,20,ivaTipo:0}], 1)`. Verificar que `gravada10+gravada5+exenta === total` y qué base recibe el residuo.
   - Propiedad a agregar: `∀ descuento ∈ [0, bruto]` con un barrido o un generador pequeño, la suma de bases netas es igual al total y el IVA sale de la base neta.

6. **Faltan casos de borde del servidor (P8, M21).**
   - Venta sin ítems con `items: []`: decidir y afirmar el resultado (hoy emite una factura en 0).
   - Producto con `iva` nulo: en la propuesta cae en 10, y hoy ningún fixture lo ejerce.
   - Un ítem de venta con `precioVentaUnitario` 0 y sin adicionales (producto regalado), que no debe romper el emparejamiento.

7. **El diálogo no tiene spec (facturar-dialog.component.ts).**
   - Existen specs Karma de otros diálogos, por ejemplo `create-caja-dialog.component.spec.ts`, así que la infraestructura está.
   - Conviene un spec chico con `RepositoryService` mockeado (`getFacturaPropuestaVenta`). Casos:
     - `cargarPropuesta` llena los renglones, el descuento y los totales, y activa `vinculadaVenta`
     - con error del servidor, `errorPropuesta` queda seteado y `facturar()` retorna sin llamar a `createFactura`
     - `onResumidoChange(true)` deja un único renglón `CONSUMISION` sin `ventaItemId` y `descuento = 0`; alternar de vuelta restaura los renglones
     - `facturar()` arma el payload con `ventaItem.id` y las descripciones sintéticas intactas
   - Riesgo concreto no cubierto: la descripción de los renglones sintéticos es editable en el diálogo (`readonly` sólo en resumido, líneas 113-114 del HTML) y el servidor la exige exacta. Si el cajero renombra "SERVICIO DE DELIVERY", `create-factura` lo rechaza con "no corresponde a la venta".
   - Hoy ese contrato diálogo-servidor lo cubre sólo `payloadDe` del e2e, que reimplementa a mano lo que arma `facturar()`. Si el diálogo cambia el payload, el e2e no se entera.

### BAJA

8. **El rechazo antes de numerar puede ser una falsa garantía (F, test-factura-venta-e2e.ts:254).**
   - En SQLite el rollback de la transacción deja `numeroActual` igual aunque la validación se mueva después de numerar, así que "ningún rechazo consumió número" no distingue el orden. Es inocuo.
   - Para que discrimine, comparar `numeroActual` y llamar a un segundo `emitir` válido después de cada rechazo, esperando el número siguiente sin saltos.

9. **Adicional inactivo en la descripción (M24).** Sólo afecta el texto. Agregar en A un `VentaItemAdicional` con `activo: false` y afirmar que no aparece.

10. **Duplicados y mensajes.** En F, `caso()` ejecuta `emitir` dos veces cuando falla (línea 237) y, si la primera pasa por error, ya emitió y la segunda da "ya tiene la factura". Eso confunde el diagnóstico: M10 dio 5 fallos en cascada. Convendría que cada caso use su propia venta, o capturar el resultado una sola vez.

11. **Fixture A tiene siempre base 10 mayor, y un solo descuento global.** Agregar una segunda venta con el descuento repartido entre exenta y 5% solamente, y otra con descuento 0 más aumento, para detectar errores de reparto que se compensan.

## [G] Postgres
No se pudo correr (instrucción). Por lectura, el único punto sin cobertura es que G2 usa una venta con envío pero sin comprobar la fila resultante (`total`, `exenta`, `gravada10`); sería barato agregar `SELECT total, gravada10, iva10` sobre `f1` para detectar que los `decimal` como string no se concatenan en la persistencia.
