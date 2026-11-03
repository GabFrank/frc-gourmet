# Facturación legal (SET / SIFEN Paraguay)

> Subsistema de **emisión de facturas fiscales** disparado desde el cobro del PdV. Modelo tributario paraguayo (SET). Soporta tres modelos de facturación: **PRE_IMPRESO**, **AUTO_IMPRESO** (térmica u A4) y **ELECTRONICA** (SIFEN — estructura lista, emisión electrónica aún stub). Introducido 2026-06-28 (`274d458`, `1d43331`).

## El cliente se guarda al facturar (2026-08)

Antes el receptor se guardaba **desnormalizado** dentro de `Factura`
(`nombreCliente`, `ruc`, `direccion`, `email`) y `create-factura` **nunca tocaba
`Cliente`**: si el cajero no usaba "Buscar cliente", la factura quedaba anónima y
el RUC se retipeaba en cada emisión. El teléfono ni siquiera se persistía —
`Factura` no tiene esa columna.

- El formulario pide el **RUC primero** y la razón social después. Al salir del
  campo (`blur`) busca el cliente y autocompleta el resto. Es un lookup exacto, no
  un autocomplete que filtra tecla a tecla.
- Si se corrige el RUC después de un match, **se corta el vínculo**: si no, la
  factura quedaría pegada al cliente equivocado y el backend ni intentaría
  resolver el nuevo, porque ve que ya trae `cliente`.
- **`create-factura` resuelve el cliente ANTES de abrir su transacción.** Adentro
  va la numeración atómica del timbrado: un fallo del upsert ahí dentro haría
  rollback de la factura entera, y en Postgres una excepción aborta el bloque
  completo. Si el upsert falla, se loguea y **la factura se emite igual**.
- Si el cliente ya existe, **sólo se completan los campos vacíos**. Un tipeo
  apurado en el PdV no puede degradar un cliente curado desde Clientes.

Helpers: `electron/utils/cliente-ruc.utils.ts`
(`normalizarRuc`, `buscarClientePorRuc`, `resolverOCrearClientePorRuc`).
Handler de lookup: `get-cliente-por-ruc` (lectura, sin permiso, como el resto de
los `get-*`). Test: `npm run test:factura-cliente`.


## Modelo de datos (`src/app/database/entities/facturacion/`)

| Entity | Tabla | Rol |
|---|---|---|
| `Timbrado` | `timbrados` | Autorización de la SET (número, RUC/razón social, `isElectronico`, `csc`/`cscId` para QR KuDE, `fechaInicio/Fin`, `tipoDocumento` def `'FACTURA'`) |
| `TimbradoDetalle` | `timbrado_detalles` | **Motor de numeración**: rango por punto de expedición. `establecimiento` (`'001'`), `puntoExpedicion` (`'001'`), `rangoDesde/Hasta`, **`numeroActual`** (próximo nº), FK `dispositivo?` (caja opcional) |
| `Factura` | `facturas` | Comprobante emitido |
| `FacturaItem` | `factura_items` | Renglón (FK a `ventaItem?`/`producto?`, `ivaTipo` int 0/5/10) |
| `FacturaPlantilla` | `factura_plantillas` | Diseño visual (ver Plantillas) |
| `FacturacionConfig` | `facturacion_config` | Singleton id=1 con la config global |

**Enums** (`factura.entity.ts`): `TipoFacturacion {PRE_IMPRESO, AUTO_IMPRESO, ELECTRONICA}`, `CondicionVenta {CONTADO, CREDITO}`, `EstadoFactura {EMITIDA, ANULADA}`. `FacturaPlantilla`: `TipoPlantilla {PRE_IMPRESO, AUTO_IMPRESO_TERMICA, AUTO_IMPRESO_A4}`.

**Campos clave de `Factura`:** `numeroFactura` (int secuencial) + `numeroCompleto` (str `'001-001-0000123'`); receptor **denormalizado** (`nombreCliente`, `ruc`, `direccion`, `email` — el `cliente` FK es opcional para anónimos); subtotales por tasa IVA Paraguay: `gravada10`, `gravada5`, `exenta`, `iva10`, `iva5`, `descuento`, `total`; `cdc?` (Código de Control SIFEN, fase futura); `estado` + `motivoAnulacion`/`fechaAnulacion`.

**Migrations:** `1782519234187-AddFacturacion.ts` (5 tablas + índices) y `1782519876542-AddFacturacionConfig.ts`. Driver-aware, idempotentes. Registradas en `database.config.ts`.

## Handler (`electron/handlers/facturacion.handler.ts`)

`registerFacturacionHandlers(dataSource, getCurrentUser)`, registrado en `register-all-handlers.ts`. El frontend llama por **`window.api.callIpc(canal, ...)`** genérico (no hay wrappers dedicados en preload). Canales: CRUD de `timbrado` / `timbrado-detalle` / `factura-plantilla`; `get-facturas` (filtros estado/tipo/fecha/ruc/limit); `get-factura-propuesta-venta` (ventaId); `create-factura`; `anular-factura` (id, motivo); `get/save-facturacion-config`.

- **`delete-timbrado` bloquea** si el timbrado ya tiene facturas emitidas.
- Al marcar una plantilla `predeterminada` se desmarcan las otras del mismo tipo.

## La factura de una venta (#325, #240 — 2026-11)

**La factura sale por lo mismo que cobra la caja, y el servidor lo verifica.** Antes el
diálogo precargaba `precioVentaUnitario` y dejaba afuera adicionales, descuento del ítem,
envío y ajustes del cobro (caso real: cobro ₲ 112.000, factura ₲ 102.000), y
`create-factura` guardaba lo que le mandaran.

**Fuente única.** `electron/utils/factura-venta.utils.ts` arma la **propuesta** desde la
venta (`calcularFacturaDeVenta`); el canal `get-factura-propuesta-venta` (pide
`FACTURACION_EMITIR`, devuelve sólo montos, descripciones e ids) la entrega al diálogo, y
`create-factura` la usa para validar. Los totales de cualquier factura salen de
`calcularTotalesFactura` (`src/app/shared/utils/factura-totales.util.ts`), la misma función
en el diálogo y en el servidor. El precio por unidad de un ítem es `precioUnitarioNetoItem` /
`computeNetoBrutoItem` de `venta-total.utils.ts` (la misma del cobro).

**Reglas (decididas por Gabriel, 2026-11-02):**

| Concepto | En la factura |
|---|---|
| Ítem ACTIVO | Un renglón: `base + precioAdicionales − descuentoUnitario` por unidad; descripción con presentación, `ensambladoDescripcion` (sabores) y nombres de los adicionales activos |
| Envío (`ventas.costo_delivery`) | Renglón `SERVICIO DE DELIVERY`, IVA 10 |
| Aumento del cobro (`PagoDetalle` AUMENTO) | Renglón `RECARGO`, IVA 10 |
| Descuento del cobro (`PagoDetalle` DESCUENTO) | Campo `descuento`, **repartido entre gravada 10, gravada 5 y exenta** proporcional a cada base; el residuo de redondeo va a la base mayor |
| Bases e IVA | `gravada10/gravada5/exenta` se guardan **netas** del descuento; `iva10 = round(g10/11)`, `iva5 = round(g5/21)`; todo a entero |
| Facturas por venta | **Una sola EMITIDA**; para rehacerla, anular. Se mantiene aunque existan dividir cuenta y cobro parcial |
| Cuándo | En cualquier momento del cobro: se valida contra lo cargado en ese instante. Si después se carga un descuento, se anula y se rehace |

Invariante (test): `propuesta.total == getEstadoCobroVentaInternal.deudaBruta − descuentoGlobal + aumentoGlobal`.

**`create-factura`, en orden:**
1. `ensurePermission('FACTURACION_EMITIR')`.
2. Cliente por RUC, **antes** de la transacción (no se pierde una factura por un cliente que no se pudo guardar). Corre aun si después la factura se rechaza.
3. **Validación sin escribir nada.** En Postgres, dentro de la transacción después de `FOR UPDATE` de la venta y del `TimbradoDetalle` (query builder **sin joins**, #258). En SQLite, **antes** de abrir la transacción y bajo `withFacturaLock` (candado de proceso): con una sola conexión, un rollback por rechazo de negocio dentro de una transacción intercalada se llevaba escrituras de otro handler.
   - Con venta: no hay otra EMITIDA; renglones de la venta ACTIVOS, sin repetir, con cantidad/precio/IVA de la propuesta (la descripción es editable); envío y recargo reconocidos por monto e IVA; descuento = el del cobro; total = propuesta (±₲1). O **Resumido**: un único renglón, cantidad 1, IVA 10, descuento 0, por el total.
   - Sin venta (manual): ningún renglón con `ventaItem`.
   - Siempre: al menos un renglón; `numeroManual` entero, dentro del rango y no usado en ese punto de expedición.
4. **Escrituras con lista blanca.** La factura se arma sólo con venta/cliente/plantilla/moneda/tipo/condición/receptor; `estado = EMITIDA` y `fecha` los fija el servidor. Un `id` en el payload pisaba una factura o un renglón existente y `estado: 'ANULADA'` anulaba sin `FACTURACION_ANULAR`. Con venta se guardan los montos de la propuesta. Totales, IVA y `total` de cada renglón: `calcularTotalesFactura`. Moneda principal si hay venta.
5. Numeración: `numeroCompleto = establecimiento-puntoExpedicion-padStart(n,7)` y `numeroActual = max(numeroActual, n+1)`.

**Por qué los dos candados.** En SQLite `withFacturaLock` es lo único que serializa: sin él, dos emisiones simultáneas sacaban el mismo número (pasaba en develop). En Postgres el candado de proceso no alcanza entre dos nodos: lo hacen los `FOR UPDATE`. Con el mismo punto de expedición, el lock del timbrado ya serializa; el de la venta importa cuando se factura sin timbrado. Los dos se prueban desde **dos procesos** en `test:locks-pg` [G] (en un mismo proceso el candado tapa la falta de cualquiera).

> Permiso: `create-factura` y `get-factura-propuesta-venta` exigen **`FACTURACION_EMITIR`** (en `SEED_PERMISOS`).

> El modo cliente factura igual que el servidor: `RepositoryIpcService` en todos los modos y el preload enruta `callIpc` por `/api/rpc`. `RepositoryHttpService` es un esqueleto histórico que no se usa.

## Flujo de emisión desde el PdV

1. `cobrar-venta-dialog` → botón **"Factura"** (siempre habilitado) abre `FacturarDialogComponent` (`facturas/facturar-dialog/`) con `{venta, items, cliente, total}`.
2. `prefillFromData()`: con venta pide `get-factura-propuesta-venta` y precarga sus renglones y el descuento (`vinculadaVenta = true`). Mientras carga o si falla (con «Reintentar») no se puede emitir ni usar Resumido. Con venta, cantidad, precio, IVA, descuento y renglones **no se editan**; la descripción sí, salvo en envío y recargo. Sin venta (factura manual desde *Facturas*) el diálogo es libre como antes.
3. `loadRefs()` carga en paralelo timbrado-detalles, plantillas, **Empresa** (emisor) y config; filtra plantillas al `tipoFacturacion` del sistema; preselecciona plantilla y punto de expedición.
4. **Vínculo de producto por ítem** (sólo factura manual): autocomplete `searchProductosByNombre` completa descripción/precio/IVA.
5. `recalc()` usa `calcularTotalesFactura` (la misma cuenta que el servidor; IVA incluido, sobre la base neta).
6. Toggle **Resumido**: colapsa todo en un único ítem `'CONSUMISION'` (IVA 10, cant 1) por el total; al desactivar restaura ítems (backup en memoria). (`b4f43ae`)
7. `facturar()` valida, llama `create-factura`, muestra `Factura {numeroCompleto} emitida`, imprime si la plantilla tiene `config` (**con los totales que devolvió el servidor**), y cierra devolviendo `{factura}`. Los rechazos del servidor se muestran con `mensajeDeError`.

**Validaciones antes de emitir:** `timbradoDetalleId`, `nombreCliente` (razón social) y `ruc` son `required` (`49e08e3`); el rango del número se valida en el handler.

## Plantillas e impresión (`plantillas/plantilla-render.util.ts`)

Diseñador visual en `plantillas/designer/`. La plantilla guarda `config` como **JSON** (elementos con coordenadas en mm, tipo, binding de variable, columnas de tabla), `anchoMm/altoMm`, y `backgroundImageUrl?` (hoja pre-impresa escaneada para alinear — no se imprime en PRE_IMPRESO).

Motor **pdfmake**: `buildDocDefinition()` posiciona elementos por `absolutePosition` mm→pt (`MM_TO_PT ≈ 2.83465`); tipos text/variable/line/box/image/itemsTable/itemColumn.

- **Facturas legales siempre A4 vertical**: `forceA4 = tipo !== AUTO_IMPRESO_TERMICA` fuerza 210×297 portrait (`6cddb25`); las térmicas 80mm conservan el tamaño de rollo.
- **Total en letras**: `montoEnLetras(total, 'PYG')` (`shared/utils/monto-letras.util`).
- **Impresión**: `pdfMake.createPdf(dd).open()` abre el PDF en el visor de Chromium (preview + orientación correcta + **un solo diálogo**). No usar `pdfMake.print()` ni iframe oculto — reflowaban a vertical/Letter con orientación equivocada (`54db6c4`/`4d8b9b6`).

## Gotchas (bugs corregidos, no repetir)

- En el PDF real (no el preview) los textos salían en minúscula y el "total en letras" vacío → uppercase al imprimir + `montoEnLetras()` real (`3112d88`).
- Un nodo `text` con `absolutePosition` en pdfmake **ignora su `width`** y alinea contra el ancho de página → envolver cada celda de la tabla de items en `columns` de ancho fijo (`da0c43f`). Misma causa dejaba la columna ID vacía (faltaba `id` en el contexto) y el teléfono del cliente sin mapear.
- El área de items es un **contenedor** (alto total + nº de filas); la altura de fila se deriva = área/filas (`e33712f`), para caer sobre los renglones de la hoja pre-impresa.

**Archivos clave:** `entities/facturacion/*.entity.ts`, `electron/handlers/facturacion.handler.ts`, `pages/facturacion/facturas/facturar-dialog/`, `pages/facturacion/config/facturacion-config.component.ts`, `pages/facturacion/plantillas/plantilla-render.util.ts`, `services/menu-tree.ts` (menú Facturación).
