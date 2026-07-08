# Importación de facturas con OCR + IA

Módulo que digitaliza facturas físicas (foto/PDF), extrae los datos vía **OpenAI GPT-4o vision** y crea una **Compra borrador** vinculada con productos+presentaciones existentes, aprendiendo aliases para acelerar las próximas cargas del mismo proveedor.

## TL;DR del flujo

```
Usuario sube foto/PDF
  → main process: render PDF → PNG via pdfjs-dist + @napi-rs/canvas (si aplica)
  → fetch a OpenAI Vision con prompt + imagen base64
  → JSON validado (proveedor + items + telefono + total)
  → matching: alias exacto → fuzzy Levenshtein → top-N candidatos
  → tab "Revisar factura" (componente dedicado, no dialog)
  → usuario valida cada item, crea inline lo que falta
  → confirmar → Compra borrador (estado ABIERTO) + upserta aliases
  → tab create-edit-compra abierto para finalizar (genera stock, CPP)
```

**IA es asistente, no automatización.** Nunca finaliza la compra; el usuario hace eso desde el flow normal.

## Stack y decisiones fijas

- **OpenAI GPT-4o vision** vía `/v1/chat/completions` (1 llamada, `response_format: json_object`, `temperature: 0`, `detail: 'high'`, timeout 45s). Modelo configurable a `gpt-4o-mini`.
- **PDFs**: render a PNG primera página con `pdfjs-dist` (legacy/v3, CJS) + `@napi-rs/canvas` (NAPI v3 estable, sin recompilar nativos en Electron). El PNG se persiste como `<archivo>.render.png` al lado del PDF — sirve de inspección manual si falla. OpenAI Chat Completions vision NO acepta PDFs, solo imágenes.
- **Imágenes**: `<5MB` (rechaza si excede). Tipos aceptados: jpg/jpeg/png/webp. Base64 directo.
- **Storage permanente** en `userData/factura-imports/<timestamp>-<uuid>.<ext>`. Servido vía `app://factura-imports/`.
- **API key**: se guarda en el **keychain del SO vía `keytar`** (service `com.frcgourmet.app`, account `openai-api-key`); con fallback a JSON plaintext si keytar no está disponible. `modelo`/`habilitado` van en `app-settings.json` (helpers `readAppSettings`/`updateAppSettings`). Existe migración automática de un legacy `userData/ia-config.json` (mueve la key a keytar y borra el archivo). Pantalla **Sistema → Configurar IA** con probador de conexión y selector de modelo.
- **Prompt configurable**: el prompt OCR tiene una **base semilla en código** + **adiciones del usuario** persistidas en BD (`ia_prompt_config`, singleton id=1), más un flujo de **sugerencias** con aprobación humana (`ia_prompt_sugerencias`). Ver sección "Prompt configurable".
- **Fuzzy matching**: Levenshtein casero (`electron/utils/ocr-matcher.utils.ts`). Sin deps npm.

## Entidades

**Las 5 tablas (`documentos_compra_importados`, `ocr_aliases_proveedor`, `ocr_aliases_producto`, `ia_prompt_config`, `ia_prompt_sugerencias`) se crean en la migración Baseline** (`1778378410416-Baseline.ts` / `1778380893207-BaselinePostgres.ts`), no en una migración dedicada. `synchronize: false` — no hay auto-DDL.

### `DocumentoCompraImportado` (`documentos_compra_importados`)

Fuente: `src/app/database/entities/compras/documento-compra-importado.entity.ts`

| Campo | Tipo | Notas |
|---|---|---|
| `archivoUrl` | varchar(500) | `app://factura-imports/<file>` |
| `archivoNombre` | varchar(255) | nombre original |
| `archivoTipo` | text (enum `DocumentoCompraImportadoTipo`) | `PDF` \| `IMAGE` |
| `estado` | text (enum) default `PENDIENTE` | `PENDIENTE / PROCESANDO / REQUIERE_REVISION / CONFIRMADO / ERROR / DESCARTADO` |
| `jsonCrudo` | text | raw GPT-4o (para reprocesar) |
| `jsonValidado` | text | JSON post-validación (`factura`) |
| `intentos` | int default 0 | contador (incrementa cada reprocess) |
| `errorMensaje` | text | warnings concatenados (`\|`) o error |
| `tokensPrompt` / `tokensCompletion` | int nullable | para costo |
| `modeloUsado` | varchar(50) | modelo devuelto por la API (ej `gpt-4o-2024-08-06`) |
| `promptVersion` | int nullable | versión del `IaPromptConfig` usada (trazabilidad) |
| `compra` | FK Compra (nullable, `compra_id`, sin FK constraint) | llenado al confirmar |

Índice: solo `estado`. (El enum `DocumentoCompraImportadoTipo` vive en el mismo `documento-compra-importado-estado.enum.ts`.)

### `OcrAliasProveedor` (`ocr_aliases_proveedor`)

Aprende qué texto OCR mapea a qué proveedor. Match exacto (RUC o texto normalizado).

| Campo | Tipo | Notas |
|---|---|---|
| `textoOcr` | varchar(500) | UPPERCASE, trim, espacios colapsados |
| `rucOcr` | varchar(50) nullable | clave secundaria, más fiable |
| `proveedor` | FK Proveedor | |
| `vecesUsado` | int default 1 | |

Unique: `(textoOcr, proveedor_id)`. Índice: `rucOcr`.

### `OcrAliasProducto` (`ocr_aliases_producto`)

Mismo concepto pero por **(proveedor + texto OCR)**. Un mismo `POLLO 1KG` puede ser distinto producto según proveedor.

| Campo | Tipo | Notas |
|---|---|---|
| `textoOcr` | varchar(500) | UPPERCASE normalizado |
| `proveedor` | FK Proveedor | parte de la clave |
| `producto` | FK Producto | |
| `presentacion` | FK Presentacion (nullable) | |
| `vecesUsado` | int default 1 | |

Unique: `(proveedor_id, textoOcr, producto_id)`. Índice: `(proveedor_id, textoOcr)`.

### `IaPromptConfig` (`ia_prompt_config`)

Singleton (id=1) con el prompt del OCR. Fuente: `src/app/database/entities/ia/ia-prompt-config.entity.ts`.

| Campo | Tipo | Notas |
|---|---|---|
| `promptBase` | text | semilla desde código (`FACTURA_PROMPT_BASE`); se re-sincroniza si cambió el hash del seed entre versiones |
| `promptAdicionesJson` | text default `[]` | JSON array de bullets del usuario |
| `version` | int default 1 | incrementa cada cambio de base o adiciones; se persiste por documento en `promptVersion` |
| `baseSeedHash` | varchar(64) nullable | sha256 del seed para detectar cambios |

Helpers: `electron/utils/ia-prompt.utils.ts` (`ensureIaPromptConfig`, `parseAdiciones`, `loadEffectivePrompt`, `setAdiciones`). El prompt efectivo = base + adiciones (las adiciones nunca sobrescriben la base; en conflicto gana la base).

### `IaPromptSugerencia` (`ia_prompt_sugerencias`)

Sugerencias de mejora al prompt, con aprobación humana. Fuente: `src/app/database/entities/ia/ia-prompt-sugerencia.entity.ts`.

| Campo | Tipo | Notas |
|---|---|---|
| `texto` | text | la sugerencia |
| `estado` | text (enum `IaPromptSugerenciaEstado`) default `PENDIENTE` | `PENDIENTE / APROBADA / RECHAZADA` |
| `motivo` | varchar(255) nullable | razón (opcional, p.ej. al rechazar) |
| `origen` | varchar(30) default `USUARIO` | UPPERCASE |
| `documentoOrigen` | FK DocumentoCompraImportado (nullable) | doc que motivó la sugerencia |

Índice: `estado`. Al **aprobar**, el `texto` se appendea a `IaPromptConfig.promptAdiciones` (bump de versión). Nunca se aplica sin aprobación.

### Cambios en entidades existentes

- **`Producto.subfamilia`** ahora **nullable** (productos parciales creados desde import OCR pueden no estar clasificados).
- **`Producto.iva`** nuevo campo `int default 10` (valores válidos `0/5/10`). Pensado para futura facturación electrónica SIFEN.
- **`Producto.registroCompleto`** nuevo campo `boolean default true`. Productos creados desde import OCR arrancan en `false`. UI muestra chip naranja "Parcial" en list-productos + filtro "Solo parciales".

## Handler: `electron/handlers/factura-import.handler.ts`

El handler recibe `(dataSource, getCurrentUser)`. Casi todos los canales de escritura exigen permiso `COMPRAS_IMPORTAR_FACTURA` vía `ensurePermission(...)` (incluye `ia-config-set` y las mutaciones de prompt/sugerencias). Los de lectura (`*-get`, `*-list`, `*-match`, `ia-config-test`, `ia-prompt-effective`) no chequean permiso.

| Canal IPC | Payload | Respuesta | Notas |
|---|---|---|---|
| `ia-config-get` | — | `{ openaiApiKey: '***' \| '', modelo, habilitado }` | API key enmascarada al renderer |
| `ia-config-get-raw` | — | objeto completo (con key real) | uso interno |
| `ia-config-set` | `Partial<IaConfig>` | `{ success, config }` | requiere permiso; si llega `'***'` no sobrescribe la key |
| `ia-config-test` | — | `{ success, message, latencyMs, modelo? }` | GET a `/v1/models` |
| `ia-prompt-get` | — | `{ id, promptBase, promptBaseSeed, adiciones, version }` | config de prompt actual |
| `ia-prompt-set-adiciones` | `{ adiciones: string[] }` | `{ success, version, adiciones }` | requiere permiso; reemplaza adiciones (máx 50) |
| `ia-prompt-effective` | — | `{ text, version, lengthChars }` | prompt compuesto base + adiciones |
| `ia-prompt-sugerencia-list` | `{ estado? }` | `IaPromptSugerencia[]` | con `documentoOrigen` |
| `ia-prompt-sugerencia-create` | `{ texto, motivo?, documentoOrigenId?, origen? }` | `{ success, id }` | |
| `ia-prompt-sugerencia-aprobar` | `{ id }` | `{ success, error? }` | requiere permiso; appendea texto a adiciones |
| `ia-prompt-sugerencia-rechazar` | `{ id, motivo? }` | `{ success }` | requiere permiso |
| `ia-prompt-sugerencia-delete` | `{ id }` | `{ success }` | requiere permiso |
| `factura-import-pick-file` | — | `{ canceled, filePath, fileType }` | `dialog.showOpenDialog` |
| `factura-import-process` | `{ filePath }` | `{ success, documentoId, warnings?, error? }` | requiere permiso; copia archivo, render PDF→PNG, llama OpenAI con prompt efectivo, valida, persiste |
| `factura-import-reprocess` | `{ documentoId }` | `{ success, warnings?, error? }` | requiere permiso; reusa el archivo, vuelve a llamar IA |
| `factura-import-get` | `{ documentoId }` | `DocumentoCompraImportado` | con relación `compra` |
| `factura-import-list` | `{ page?, pageSize?, estado? }` | `{ items, total, page, pageSize }` | paginado (pageSize máx 100, default 20) |
| `factura-import-descartar` | `{ documentoId }` | `{ success }` | requiere permiso; estado → DESCARTADO |
| `factura-import-match` | `{ documentoId }` | `MatchResult \| { error }` | corre matching contra proveedores/productos/aliases |
| `factura-import-confirm` | `{ documentoId, datosCompra, itemsVinculados, aliasProveedor }` | `{ success, compraId, error? }` | requiere permiso; transacción: crea Compra ABIERTO + upserta aliases |

## Flow del confirm (transacción)

`datosCompra` que envía el renderer: `{ numeroNota, fechaCompra, tipoBoleta, monedaId, credito }` (`credito` hoy hardcodeado a `false` desde `RevisarFacturaComponent`). `aliasProveedor`: `{ textoOcr, rucOcr, proveedorId }`.

```
queryRunner.transaction(qr =>
  0. Si el documento ya está CONFIRMADO → throw (idempotencia)
  1. Compra estado=ABIERTO, isRecepcionMercaderia=false, con
     numeroNota (UPPER), tipoBoleta, fechaCompra (parseLocalDate, default hoy),
     credito, plazoDias, proveedor={id}, moneda={id}, total=0
  2. Por cada item NO omitido + con productoId+presentacionId: CompraDetalle
     (calcula factor desde presentacion.cantidad → cantidadUnidadBase, subtotal,
      costoUnitarioPresentacion). Suma total y lo actualiza en la Compra.
  3. Upsert OcrAliasProveedor (normalizeText(textoOcr), proveedor_id) → vecesUsado++ o create
  4. Upsert OcrAliasProducto (proveedor_id, normalizeText(descripcionOcr), producto_id) por cada item válido
  5. DocumentoCompraImportado.estado = CONFIRMADO + compra = compraNueva
)
```

`normalizeText` = trim + UPPERCASE + colapsa espacios (`electron/utils/factura-import.utils.ts`).

**No ejecuta `finalizar-compra`** — el usuario lo hace después en `create-edit-compra` (ahí se aplica costo promedio, se mueve stock, se crea CPP).

## Engine de matching (`electron/utils/ocr-matcher.utils.ts`)

### Proveedor

1. Si `rucOcr` presente → buscar `Proveedor.ruc = rucOcr` exacto. Hit → **ALTA**.
2. Sino → `OcrAliasProveedor.rucOcr = rucOcr`. Hit → ALTA.
3. Sino → `OcrAliasProveedor.textoOcr = UPPER(textoOcr)`. Hit → ALTA.
4. Sino → fuzzy contra `Proveedor.nombre` activos:
   - score ≥0.85 → **MEDIA**, top sugerencia.
   - score 0.6-0.85 → MEDIA sin auto-vinculo.
   - top-5 candidatos siempre incluidos en respuesta.
5. Sin candidatos → **NINGUNA**.

### Producto (por línea)

1. Si `codigoProveedor` parece GTIN (8-14 dígitos) → buscar `CodigoBarra.codigo` exacto. Hit → ALTA, vincula Producto+Presentacion del código.
2. Buscar `OcrAliasProducto` con `(proveedor_id, UPPER(descripcion))`:
   - Hit con `vecesUsado >= 2` → **ALTA**, auto-vincular.
   - Hit con `vecesUsado == 1` → **MEDIA**, sugerir.
3. Sin alias → fuzzy contra `Producto.nombre` activos + `esComprable=true`:
   - score ≥0.85 → MEDIA + top sugerencia (presentación principal).
   - score 0.5-0.85 → MEDIA sin match auto.
   - top-5 candidatos siempre.

## UX: tab `RevisarFacturaComponent`

Path: `src/app/pages/compras/revisar-factura/`

**Es tab, no dialog** (tiene preview opcional + 3 secciones grandes + tabla; un MatDialog quedaba apretado).

### Header sticky con 3 botones

- **Ver factura** → abre `VerFacturaDialogComponent` 90vw×90vh con PNG ampliado.
- **Cancelar** → `tabsService.removeTabById(this.tabId)`. Doc queda en `REQUIERE_REVISION` para reabrir desde lista.
- **Confirmar y crear borrador** → llama `factura-import-confirm`, abre `create-edit-compra` con la compra borrador, cierra el tab.

### Sección Proveedor

- Muestra OCR + RUC + Tel (si OCR los devolvió).
- Chip estado: `Auto-vinculado` (verde, ALTA) / `Sugerencia` (amarillo, MEDIA) / `Sin coincidencia` (naranja, NINGUNA) / `Validado` (verde, una vez que el usuario tocó el dropdown).
- `<mat-select>` con `(selectionChange)` que marca `proveedorValidado = true`.
- Botón **+ Crear nuevo** abre `CrearProveedorInlineDialogComponent` pre-cargado con `nombre + ruc + telefono` del OCR.

### Sección Datos del documento

`numeroNota`, `fecha`, `tipo` (LEGAL/COMUN/OTRO/SIN_COMPROBANTE), `moneda` (auto-elige GUARANI default).

**Total detectado** (del OCR) y **Total ajustado** (recalculado en cliente sumando `cantidad × costoUnitario` de items NO omitidos). Badge naranja con cantidad de omitidos. Color amarillo si difiere del detectado.

### Sección Ítems (tabla)

Orden de columnas: **Estado | Producto | Descripción OCR | Presentación | Cant. | P. Unit. | Subtotal | Acciones**.

`table-layout: fixed`, anchos fijos (Estado 120, Prod 320, Desc auto min 240, Pres 200, Cant 70, Precio 110, Sub 120, Acc 48).

Por fila:
- Chip de confianza (mismo sistema que proveedor + extra label "Producto nuevo" para los creados inline).
- `<mat-select>` Producto con `(selectionChange)` → `onProductoChange()` carga presentaciones, auto-selecciona principal, marca chip "Validado".
- Botón **+** abre `CrearProductoInlineDialogComponent` con `descripcionOcr`, `codigoProveedorOcr`, `ivaOcr`. **Importante**: el producto creado se prepende a `vm.candidatos` ANTES de setear `selectedProductoId`, vía `setTimeout(0)`, para que mat-select tenga la `<mat-option>` cuando reciba el valor — sino emite `null` por race con DOM.
- Input precio editable con `(ngModelChange)="onCostoChange()"` recalcula total ajustado en vivo.
- Botón omitir (mat-icon `remove_circle_outline` ↔ `replay`); fila tachada vía `.row-omitida { text-decoration: line-through; opacity: 0.5 }`.

### Validaciones al confirmar

```ts
sinVincular = items.filter(v => !v.omitir && (!v.selectedProductoId || !v.selectedPresentacionId))
if (sinVincular.length > 0) → snackbar bloqueante
if (todos omitidos) → snackbar "no hay items para crear borrador"
```

## Crear inline: dialogs MatDialog (siguen siendo dialogs)

### `CrearProveedorInlineDialogComponent`

Form: `nombre` (UPPERCASE), `ruc`, `telefono`. Acepta `MAT_DIALOG_DATA = { nombre, ruc, telefono }` para pre-cargar del OCR. Llama `repo.createProveedor()`.

### `CrearProductoInlineDialogComponent`

Path: `src/app/pages/compras/importar-factura-dialog/crear-producto-inline-dialog.component.ts`.

Form: `nombre`, `tipo` (RETAIL / RETAIL_INGREDIENTE), **`iva`** (10/5/0), `unidadBase`, `codigoBarra` (visible solo si OCR detectó GTIN), presentación principal (`nombre + cantidad`), toggles `esVendible` y `controlaStock`.

Pre-carga del OCR vía `inferirPresentacion()` (`src/app/shared/utils/producto-inference.util.ts`) — regex sobre la descripción extrae unidad y cantidad ("MALBEC 750 ML" → unidad `MILILITRO`, cantidad `750`, nombre `750 ML`). Si `codigoProveedor` parece GTIN (8-14 dígitos) lo prefilla.

**Crea con `registroCompleto=false` y subfamilia null** — productos parciales que el usuario completa después desde gestionar-producto. Si hay GTIN, registra `CodigoBarra` automáticamente.

## Pantalla `IaConfigComponent`

Path: `src/app/pages/configuracion/ia-config/` (standalone). Sidenav **Sistema → Configurar IA** (entrada protegida por `*appHasPermission="'SISTEMA_CONFIGURAR_IA'"`). Organizada en tabs:

**Tab Conexión:**
- API Key (password con toggle ojo).
- Selector modelo: `gpt-4o` ("recomendado", ~USD 0.01/factura) / `gpt-4o-mini` ("más económico", ~USD 0.002/factura).
- Toggle habilitado.
- Botón **Probar conexión** → snackbar verde con latencia o rojo con error. Si la key cambió, la guarda antes de probar (`guardarSilencioso`).

**Tab Prompt:**
- Muestra el `promptBase` (colapsable) y la lista de **adiciones** del usuario (agregar/quitar, persiste vía `ia-prompt-set-adiciones`).
- Indicador de versión y longitud del prompt efectivo (`ia-prompt-effective`).

**Tab Sugerencias:**
- Lista de `IaPromptSugerencia` con acciones crear / aprobar (confirm dialog → appendea a adiciones) / rechazar / eliminar.

API key se devuelve enmascarada al renderer (`'***'`); el handler `ia-config-set` ignora el `'***'` para no sobrescribir la real.

## Pantalla `ListFacturaImportsComponent`

Path: `src/app/pages/compras/list-factura-imports/`. Sidenav **Compras → Importaciones IA**.

Tabla paginada con columnas: archivo (con ícono PDF/IMG), fecha, estado (chip color), modelo IA usado, tokens prompt/completion + costo USD calculado, compra vinculada (link), acciones (mat-menu + more_vert).

Acciones: **Revisar** (abre `RevisarFacturaComponent` como tab), **Reprocesar IA** (re-llama OpenAI sobre el mismo archivo), **Ver compra vinculada** (si `compra_id`), **Descartar**.

Filtro por estado con botón **Filtrar** explícito (no live).

Botón **+ Nueva importación** dispara el flow completo: pickFile → process → abrir tab de revisión.

## Configuración IA: storage

- **API key**: en el keychain del SO vía `keytar` (service `com.frcgourmet.app`, account `openai-api-key`). Fallback a JSON plaintext si keytar no carga.
- **`modelo` / `habilitado`**: en `userData/app-settings.json` (bajo la clave `ia`), vía `readAppSettings`/`updateAppSettings`.
- **Legacy**: si existe `userData/ia-config.json` (formato `{ openaiApiKey, modelo, habilitado }`), `readIaConfig` lo migra automáticamente (key → keytar, modelo/habilitado → app-settings) y lo borra.

Helpers en `electron/utils/ia-config.utils.ts`: `readIaConfig`, `writeIaConfig`, `getFacturaImportsDir`, `DEFAULT_IA_CONFIG` (`{ openaiApiKey: '', modelo: 'gpt-4o', habilitado: false }`).

## Permisos

Definidos en `permissions.handler.ts` SEED_PERMISOS (y `COMPRAS_IMPORTAR_FACTURA` también en `seed-system.ts`):
- `COMPRAS_IMPORTAR_FACTURA` (módulo COMPRAS) — "Importar facturas de compra con OCR + IA"
- `SISTEMA_CONFIGURAR_IA` (módulo SISTEMA) — "Configurar credenciales y parametros de IA (OCR de facturas)"

**Sí se chequean**: la entrada de sidenav "Importaciones IA" usa `*appHasPermission="'COMPRAS_IMPORTAR_FACTURA'"` y "Configurar IA" usa `*appHasPermission="'SISTEMA_CONFIGURAR_IA'"`. Además el handler exige `COMPRAS_IMPORTAR_FACTURA` (vía `ensurePermission`) en todas las mutaciones del módulo, incluido `ia-config-set` y las de prompt/sugerencias.

## Prompt configurable y prompt del sistema

El prompt enviado a OpenAI es **efectivo = base + adiciones del usuario** (`buildEffectivePrompt`):
- **Base** (`electron/utils/factura-import.utils.ts:FACTURA_PROMPT_BASE`, alias compat `FACTURA_PROMPT`): semilla inmutable en código.
- **Adiciones**: bullets que el usuario agrega desde Configurar IA → tab Prompt, persistidos en `ia_prompt_config`. Se appendean bajo "Reglas adicionales del usuario" con la advertencia de que en conflicto **gana la base**.

`process`/`reprocess` cargan el prompt efectivo (`loadEffectivePrompt`) y guardan su `version` en `documento.promptVersion`.

Reglas críticas del prompt base:

1. **Proveedor = EMISOR/VENDEDOR/REMITENTE.** NUNCA cliente/receptor (etiquetas "Cliente:", "Facturado a:", "Señores:" se ignoran).
2. Esquema JSON estricto: `proveedor: { nombre, ruc, razonSocial, telefono }`, `documento: { numeroNota, fecha YYYY-MM-DD, tipo (LEGAL/COMUN/OTRO/SIN_COMPROBANTE), moneda (PYG/USD/BRL), totalDocumento, ivaTotal, descuentoTotal, timbrado }`, `items: [{ descripcion, cantidad, precioUnitario, subtotal, iva, codigoProveedor, unidadMedidaOcr, presentacionInferida }]`.
3. **`unidadMedidaOcr`**: la columna U.M. de la factura, literal (o null).
4. **`presentacionInferida`**: estructura pack/unitaria que la IA infiere (`tipo: UNITARIA|PACK`, `cantidadPaquete`, `contenidoUnitario {valor, unidad}`, `nombreProductoLimpio`, `nombrePresentacion`). Default fuerte: todo producto es UNIDAD salvo evidencia. Detecta notaciones de pack ("16X70CC", "(18U)", "CAJA X N").
5. Descripción de productos en MAYÚSCULAS; fecha YYYY-MM-DD; moneda default PYG.
6. IVA en porcentaje (0/5/10); si no hay timbrado → tipo COMUN.
7. Devuelve UN objeto JSON, sin markdown ni arrays envolventes.

## Validación post-OpenAI

`validateFacturaJson()` (devuelve `{ ok, result: { factura, warnings } }` o `{ ok: false, error }`):
- `proveedor.nombre` string no vacío
- `documento.totalDocumento` number > 0
- `items` array no vacío, cada item con descripcion+cantidad+precioUnitario válidos (subtotal se rellena si falta)
- Normaliza `descripcion` (UPPER); `unidadMedidaOcr` y `presentacionInferida` son **tolerantes**: si faltan o vienen con shape viejo, default null sin rechazar
- Tolerancia 5% entre `Σ items.subtotal vs totalDocumento` → warning blando, no rechaza
- RUC normalizado (solo alfanuméricos y guiones)

## Bugs conocidos / aprendizajes históricos

| Bug | Causa | Fix |
|---|---|---|
| Producto creado inline no se podía seleccionar | mat-select con `[ngModel]` apuntando a id que no estaba en `<mat-option>` → emite null | Prepender producto creado a `vm.candidatos` + `setTimeout(0)` antes de setear `selectedProductoId` |
| Presentación queda vacía aunque el producto sí | `loadPresentaciones` leía `res.items` pero handler devuelve `{ data, ... }` | Leer `res.data` con fallback |
| Presentación creada inline nunca se guardaba | Handler `create-presentacion` esperaba `productoId` plano, dialog mandaba `producto: { id }` | Handler ahora acepta ambos |
| `create-codigo-barra` mismo issue | idem | idem |
| GPT-4o detectaba al CLIENTE como proveedor | prompt era ambiguo | Prompt explícito con regla EMISOR ≠ CLIENTE + ubicaciones típicas en factura paraguaya |
| `subfamilia` requerida bloqueaba productos parciales | FK NOT NULL en entity | Cambiada a nullable, sin seed placeholder |
| Validación al guardar bloqueaba con falso "falta vincular" | item con producto pero sin presentación contaba como sin vincular | Auto-selección de presentación principal al cargar items |

## Funciones / componentes a reutilizar (NO duplicar)

- `electron/utils/image-handler.utils.ts` — patrón de save/delete archivos en userData.
- `electron/utils/backup-utils.ts` — patrón JSON de config.
- `electron/utils/seed-system.ts` — agregar permisos al seed.
- `electron/handlers/compras.handler.ts:create-compra-borrador` — referencia para crear Compra ABIERTO.
- `compras.handler.ts:upsertProveedorProducto` — se llama automáticamente al **finalizar** la compra (no en este módulo).
- `ConfirmationDialogComponent` — para descartar.
- `TabsService.openTab(...)` y `removeTabById(...)`.
- `inferirPresentacion()` (`src/app/shared/utils/producto-inference.util.ts`) — heurística unidad+cantidad. Mirror exacto del lado Electron en `factura-import.utils.ts`.

## Costo estimado por factura

Hardcoded en UI (Sistema → Configurar IA):
- `gpt-4o`: ~USD 0.01 por factura (factura típica 1-2 páginas, 1500 prompt + 200 completion tokens)
- `gpt-4o-mini`: ~USD 0.002 por factura

Lista de Importaciones IA muestra el costo real por documento basado en tokens reportados por la API.

## Verificación end-to-end manual

1. Sistema → Configurar IA → API key + Probar conexión → snackbar verde.
2. Compras → Importar con IA → pickFile (PDF o JPG) → spinner ~10-30s.
3. Tab "Revisar factura #N" se abre.
4. Validar proveedor (auto-vinculado o crear nuevo con datos pre-cargados).
5. Vincular cada ítem; crear inline los que no existen (con IVA y presentación pre-cargados del OCR); omitir basura.
6. **Total ajustado** baja en vivo según omitidos / cambios de precio.
7. Confirmar → tab `create-edit-compra` con la compra borrador.
8. Finalizar la compra normal → genera `stock_movimiento` (tipo COMPRA), `proveedores_productos` con último costo, `cuentas_por_pagar` (1 cuota si crédito).
9. **Importar la misma factura otra vez** → ítems aparecen como ALTA (vecesUsado >= 2 ya), proveedor también ALTA por RUC.
10. Importar otra factura del mismo proveedor con productos parcialmente nuevos → unos auto, otros con candidatos fuzzy.

## Archivos críticos del módulo

```
electron/handlers/factura-import.handler.ts       (todos los IPC: ia-config, ia-prompt, sugerencias, factura-import)
electron/utils/factura-import.utils.ts            (prompt base, validación, fetch OpenAI, render PDF, copyArchivo, inferirPresentacion)
electron/utils/ia-prompt.utils.ts                 (prompt config: ensure/load/setAdiciones, buildEffectivePrompt)
electron/utils/ocr-matcher.utils.ts               (Levenshtein, buildMatchResult)
electron/utils/ia-config.utils.ts                 (keytar + app-settings, migración legacy, getFacturaImportsDir)

src/app/database/entities/compras/
  documento-compra-importado.entity.ts
  documento-compra-importado-estado.enum.ts        (estado + tipo enums)
  ocr-alias-proveedor.entity.ts
  ocr-alias-producto.entity.ts
src/app/database/entities/ia/
  ia-prompt-config.entity.ts
  ia-prompt-sugerencia.entity.ts                    (incluye enum IaPromptSugerenciaEstado)

src/app/database/migrations/1778378410416-Baseline.ts        (crea las 5 tablas; Postgres en 1778380893207-BaselinePostgres.ts)

src/app/services/factura-import.service.ts        (Observable wrapper de todos los canales)
src/app/shared/utils/producto-inference.util.ts   (mirror Angular de inferirPresentacion)

src/app/pages/configuracion/ia-config/             (componente standalone, tabs Conexión/Prompt/Sugerencias)
src/app/pages/compras/revisar-factura/             (tab principal + ver-factura-dialog)
src/app/pages/compras/importar-factura-dialog/     (crear-proveedor + crear-producto inline dialogs)
src/app/pages/compras/list-factura-imports/        (lista paginada con reprocesar/descartar)

main.ts                                            (protocolo app://factura-imports/, registro handler)
preload.ts                                         (expone los canales vía contextBridge.exposeInMainWorld('api', ...) → window.api)
```
