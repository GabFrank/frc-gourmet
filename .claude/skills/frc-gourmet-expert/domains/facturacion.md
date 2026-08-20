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

`registerFacturacionHandlers(dataSource, getCurrentUser)`, registrado en `register-all-handlers.ts`. El frontend llama por **`window.api.callIpc(canal, ...)`** genérico (no hay wrappers dedicados en preload). Canales: CRUD de `timbrado` / `timbrado-detalle` / `factura-plantilla`; `get-facturas` (filtros estado/tipo/fecha/ruc/limit); `create-factura`; `anular-factura` (id, motivo); `get/save-facturacion-config`.

- **`delete-timbrado` bloquea** si el timbrado ya tiene facturas emitidas.
- Al marcar una plantilla `predeterminada` se desmarcan las otras del mismo tipo.

**Numeración atómica** (`create-factura`): dentro de una **transacción** lee el `TimbradoDetalle`, acepta `numeroManual` (en pre-impreso la hoja física ya trae número), valida `rangoDesde ≤ n ≤ rangoHasta`, arma `numeroCompleto = establecimiento-puntoExpedicion-padStart(n,7)`, y avanza el contador con `Math.max(numeroActual, numero+1)` (nunca retrocede).

> Permiso: `create-factura` exige **`FACTURACION_EMITIR`** (en `SEED_PERMISOS`).

## Flujo de emisión desde el PdV

1. `cobrar-venta-dialog` → botón **"Factura"** abre `FacturarDialogComponent` (`facturas/facturar-dialog/`) con `{venta, items, cliente, total}`.
2. `prefillFromData()` mapea cada `VentaItem` → ítem de factura (descripción en MAYÚSCULA, `ivaTipo = producto.iva ?? 10`, guarda `productoId`/`ventaItemId`).
3. `loadRefs()` carga en paralelo timbrado-detalles, plantillas, **Empresa** (emisor) y config; filtra plantillas al `tipoFacturacion` del sistema; preselecciona plantilla y punto de expedición.
4. **Vínculo de producto por ítem**: autocomplete `searchProductosByNombre` completa descripción/precio/IVA.
5. `recalc()` — **IVA incluido**: `iva10 = round(gravada10/11)`, `iva5 = round(gravada5/21)`.
6. Toggle **Resumido**: colapsa todo en un único ítem `'CONSUMISION'` (IVA 10, cant 1) por el total; al desactivar restaura ítems (backup en memoria). (`b4f43ae`)
7. `facturar()` valida, llama `create-factura`, muestra `Factura {numeroCompleto} emitida`, imprime si la plantilla tiene `config`, y cierra devolviendo `{factura}`.

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
