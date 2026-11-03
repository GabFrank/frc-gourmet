# Auditoría del diff (#325/#240) — eje Convenciones de UI / comportamiento del diálogo

Alcance: `src/app/pages/facturacion/facturas/facturar-dialog/facturar-dialog.component.{ts,html,scss}`.
Ruta TS abreviada: `facturar-dialog.component.ts` = TS, `.html` = HTML.

## Hallazgos que introduce este diff

### 1. ALTA — Se puede editar la descripción de los renglones sintéticos (envío / recargo) y el servidor los rechaza
- `HTML:113` (`descripcion` sólo `[readonly]="resumido"`), hint en `HTML:91-93` ("Solo se puede cambiar la descripción").
- `electron/utils/factura-venta.utils.ts` (`validarFacturaContraVenta`): los renglones sin `ventaItem` se emparejan con los sintéticos por **descripción exacta** (`l.descripcion === desc`). Si el usuario cambia "SERVICIO DE DELIVERY" o "RECARGO", el servidor responde «El renglón … no corresponde a la venta».
- Escenario: venta con delivery, usuario "corrige" el texto del renglón de envío, emite, falla (el snackbar sí muestra el mensaje, pero la UI invitó a hacerlo).
- Propuesta: `[readonly]="resumido || (vinculadaVenta && !item.value.ventaItemId)"` (sin funciones: es una expresión sobre el control, o precomputar un flag `soloLectura` en el FormGroup como se hizo con `ivaLabel`), y ajustar el hint: "Solo se puede cambiar la descripción de los ítems; envío y recargo son fijos".

### 2. MEDIA — El toggle Resumido sigue activo mientras carga o tras un error de la propuesta
- `HTML:85`, `TS:374-395`.
- Escenario A (carga): el usuario activa Resumido antes de que llegue la propuesta. `onResumidoChange` hace backup de `[]`, crea CONSUMISION por 0 y `resumido=true`. Cuando llega la propuesta, `cargarPropuesta` (`TS:152-178`) hace `clear()` y carga los renglones reales con `resumido===true`: la UI queda en modo "Resumido" (hint de CONSUMISION, descuento oculto, todo readonly) mostrando renglones detallados; el payload sale detallado + descuento del cobro. Al apagar Resumido se restauran 0 renglones y se agrega uno en blanco sin `ventaItemId` (queda un renglón vacío con venta vinculada).
- Escenario B (error): con `errorPropuesta` el toggle funciona y arma una CONSUMISION por 0; el botón sigue bloqueado, pero la pantalla muestra controles vivos sin sentido.
- Propuesta: `[disabled]="cargandoPropuesta || !!errorPropuesta"` en el `mat-slide-toggle` (y/o ocultar la zona de renglones mientras `cargandoPropuesta`).

### 3. MEDIA — Sin reintento ni contexto cuando falla la propuesta
- `HTML:90`, `TS:171-173`.
- Escenario: timeout/red caída en modo cliente → texto rojo y botón "Emitir" deshabilitado sin más explicación; la única salida es Cancelar y volver a abrir el cobro. Se pierde lo tipeado (RUC, cliente, número manual).
- Propuesta: botón "Reintentar" (`type="button"`, llama a `cargarPropuesta`) junto al mensaje, `role="alert"` en el `<p>` de error, y un texto que explique por qué no se puede emitir ("No se puede emitir sin calcular la factura de la venta"). Mientras carga, mostrar `mat-progress-bar`/spinner en lugar de sólo texto gris (`HTML:89`).

### 4. BAJA — `ivaLabel` es estado duplicado y queda desfasado en la factura manual
- `TS:350` (control nuevo en cada renglón), `HTML:126`.
- En modo manual el `ivaTipo` cambia por el select o por `onProductoSelected` pero `ivaLabel` queda con el valor inicial (10%). No afecta el payload (no se lee), pero queda un control huérfano que viaja en `getRawValue()` del backup de Resumido. Es inocuo hoy; si alguien lo muestra en manual mostraría un dato falso.
- Propuesta: `<mat-select formControlName="ivaTipo" [disabled]>`/o un pipe puro para la etiqueta, o documentar que sólo vale con venta.

### 5. BAJA — Campos bloqueados sin señal visual
- `HTML:118,122,126,147` usan `readonly` pero Angular Material no los estiliza distinto: parecen editables, el usuario hace foco y nada pasa.
- Propuesta: clase `.solo-lectura` en `scss` con `opacity`/`cursor: default` usando variables de tema (p. ej. `var(--text-secondary)`); es lo que ya hace el modo Resumido (mismo defecto preexistente).

### 6. BAJA — `data.items` quedó sin uso
- `TS:123` y `cobrar-venta-dialog.component.ts:1601` siguen pasando/chequeando `items`, pero el diálogo ya no los lee. Si algún día se abre con `items` y sin `venta`, se pierde el precargado en silencio (hoy no ocurre: el cobro siempre manda `venta`).
- Propuesta: quitar `items` del `data` y de la condición de `ngOnInit`, o mantener la rama de fallback.

## Puntos revisados sin problema (con justificación)

- **Emisión durante carga/error:** el botón está deshabilitado con `cargandoPropuesta || !!errorPropuesta` (`HTML:165`) y `facturar()` corta igual en `TS:493`. El botón vive en `mat-dialog-actions`, fuera del `<form>`, y el form no tiene `(ngSubmit)` ni `keydown`: Enter en un input no puede emitir. Durante la carga `itemsArray` está vacío, así que tampoco hay payload posible. OK. (Falta feedback: ver #3.)
- **Controles editables con venta:** autocomplete de producto (`HTML:99`), select de IVA (`HTML:128`), borrar y agregar renglón (`HTML:136,141`) están ocultos con `vinculadaVenta`; cantidad, precio y descuento están `readonly`. Sólo queda editable la descripción (ver #1 para los sintéticos). Otros inputs (cliente, RUC, punto de expedición, plantilla, condición) no entran en la validación contra la venta.
- **`[readonly]` en `input type=number`:** en Chromium/Electron un input `readonly` no responde a flechas ↑↓, rueda del mouse ni spinners (el stepping no aplica a campos inmutables). No hace falta `disabled`; además `disabled` sacaría el control de `form.value` (que usan `recalc` y el payload). OK.
- **Resumido ida y vuelta con venta:** el backup usa `getRawValue()` con `ventaItemId`, `productoId` e `ivaTipo`; al restaurar `addItem(it)` reconstruye `ivaLabel` desde `ivaTipo`; el descuento se restaura de `descuentoBackup` (`TS:379-393`). El servidor acepta el Resumido (un renglón sin `ventaItem`, total igual al de la venta). OK, salvo el caso de #2.
- **Factura manual:** sin `data` (`list-facturas.component.ts:87`) `vinculadaVenta=false`, `addItem()` inicial, autocomplete, select de IVA, agregar/quitar y descuento editables igual que antes; `recalc` ahora usa `calcularTotalesFactura` (misma cuenta que el servidor, incluye redondeo y prorrateo del descuento: el total en pantalla ya coincide con lo que se guarda). OK.
- **PDF (`buildContext`, `TS:439-`)**: toma `gravada10/5`, `exenta`, `iva10/5`, `descuento` y `total` de `factura` devuelta por `create-factura`, que hace `findOne` tras guardar los totales del servidor (`facturacion.handler.ts` ~L400-433). `Number(...) || 0` cubre decimales como string de Postgres. Los renglones impresos salen del form, que para venta coincide con lo validado. OK.
- **Convenciones:** sin funciones/getters nuevos en el template (`ivaLabel()` es privado y se usa en TS); `| number:'1.0-2'` intacto; el SCSS usa `var(--text-secondary)` y `var(--error-color)` (sin hex); textos en español; strings a base en mayúscula (`descripcion` se pasa a `toUpperCase` en el payload; las descripciones de la propuesta ya vienen en mayúscula del servidor). No hay confirmaciones nuevas. `console.error` + `mensajeDeError` correcto.

## Preexistente (no introducido por el diff)

- **MEDIA — Enter dentro del form dispara el primer botón "submit" implícito.** `HTML:136` y `HTML:141` son `mat-icon-button`/`mat-stroked-button` sin `type="button"` dentro del `<form>`. En factura manual con ≥2 renglones, Enter en cualquier input hace click implícito en el botón de borrar del primer renglón y lo elimina. Con venta esos botones ya no existen, así que el diff lo reduce a manual. Propuesta: `type="button"` en ambos.
- **BAJA — Resumido hace readonly de descripción/cant/precio sin señal visual** (mismo caso que #5).
- **BAJA — `limpiarCliente` tiene dos doc-comments apilados** (`TS:313-320`), ruido sin efecto.
- **BAJA — Si la impresión falla tras emitir**, el catch de `facturar()` muestra "Error al emitir" aunque la factura ya se guardó (la `imprimir` tiene su propio try, pero conviene verificarlo): fuera del alcance del diff.
