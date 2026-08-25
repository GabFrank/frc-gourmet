# Dominio: Ventas y Punto de Venta (PdV)

El módulo más visible y operativamente más usado. Ventas, mesas, comandas, delivery, atajos, multi-sabor, descuento de stock automático.


## Qué venta va a cocina (cambió el 2026-08-24)

Los hooks `crearComandaItemsSiCorresponde` y `autoPrintComandaIfNeeded`
(`ventas.handler.ts`) deciden si una venta genera `ComandaItem` — y sin
`ComandaItem` no hay KDS ni ruteo a la impresora del sector del producto.

El gate era `mesa || comanda`. Eso dejaba afuera **al delivery**: una venta creada
por `delivery-crear` no tiene mesa ni comanda, así que sus ítems **nunca se
imprimían en la impresora asignada al producto**. Lo único que salía era el ticket
único del reparto (`printDeliveryTicketInternal`, rol `TICKET_VENTA`), que es otra
cosa. Era un bug, no una limitación de diseño.

Hoy el gate es:

```ts
mesa || comanda || delivery || canalOrigen !== 'LOCAL'
```

O sea: **van a cocina mesa, comanda, delivery y los pedidos de la web; la única
que no va es la venta rápida de mostrador.** `ventas.canal_origen` es la columna
nueva (`LOCAL` por default, así que ninguna venta histórica cambia de
comportamiento) y además sirve para separar el canal en los reportes.

⚠️ Si tocás esos hooks, acordate de cargar las relaciones: el chequeo de
`venta.delivery?.id` da siempre falso si la consulta no la trae.


## Estado de la mesa: quién la ocupa y quién la libera (2026-08)

**El estado de la mesa lo maneja el backend, junto con la venta.** Antes el
frontend hacía una segunda llamada a `updatePdvMesa`, y ahí estaba el bug.

### El bug que se arregló

| Llamada | Permiso |
|---|---|
| `createVenta`, `createVentaItem` | `VENTAS_PDV` |
| `updatePdvMesa` (marcaba la mesa) | **`VENTAS_PDV_CONFIGURAR`** |

`VENTAS_PDV_CONFIGURAR` lo tiene **sólo GERENTE** en el seed de roles
(`seed-system.ts:480`). A un MOZO **y también a un CAJERO** la llamada le fallaba
con FORBIDDEN, el frontend se lo tragaba en un `console.error`, y el polling de 1
segundo pisaba el cambio optimista con el estado real. Síntoma: *"la mesa no se
marca como ocupada"*, sin ningún error visible.

El mismo permiso bloqueaba **liberar** la mesa al cobrar. Eso era la causa real
del bug que figuraba como *"Mesas colgadas en OCUPADO — posible race condition"*.

### Cómo funciona ahora

- **`createVenta` marca la mesa `OCUPADO` en su propia transacción**, bajo
  `withMesaLock` (el lock por mesa que ya usaba pedidos online para evitar dos
  ventas ABIERTAS sobre la misma mesa). Sólo para la venta de mesa **directa**:
  si la venta cuelga de una comanda, ocupar la mesa física lo decide
  `PdvConfig.ocuparMesaAlVincularComanda` (default `false`) y lo resuelve
  `abrirComanda`.
- **`set-pdv-mesa-estado(mesaId, estado)`** — handler operativo con `VENTAS_PDV`
  para ocupar y liberar. Al liberar valida que no queden ventas `ABIERTA` ni
  comandas `OCUPADO` (mismo criterio que `cerrarComanda`): liberar una mesa con
  trabajo vivo deja una mesa fantasma que otro cajero puede volver a ocupar.
- **`updatePdvMesa` no cambió**: sigue siendo el ABM (renombrar, cambiar de
  sector) con `VENTAS_PDV_CONFIGURAR`.
- El frontend (desktop y PWA) usa `setPdvMesaEstado` y **avisa con snackbar** si
  falla. La llamada que seguía a `createVenta` se eliminó: el backend ya lo hace.
- La migración `IndicesRucYReconciliarMesas` **libera las mesas que ya quedaron
  colgadas** en instalaciones existentes. Antes había que correr un `UPDATE` a
  mano, restaurante por restaurante.

> ⚠️ **Probarlo con un usuario MOZO, no con admin.** El bug sólo se manifiesta si
> el usuario NO tiene `VENTAS_PDV_CONFIGURAR`. Manual:
> `docs/testing/TESTING-CHECKLIST-PDV-MESA-CLIENTE.md`. Test:
> `npm run test:mesa-ocupacion`.


## El modelo mesa ↔ comanda (2026-08-22) — leer ANTES de tocar nada de mesas

### Una sola regla

```
mesa ocupada  ⟺  existe Venta ABIERTA con mesa_id = X y comanda_id IS NULL
```

**Las comandas quedan FUERA de la fórmula, a propósito.** El color de la mesa responde una sola pregunta — *¿tiene cuenta propia?* — y la dimensión *"¿hay comandas sentadas acá?"* la carga el **badge**, que ya existía.

| Color | Badge | Significa | Qué hace el cajero |
|---|---|---|---|
| 🟢 verde | — | vacía | — |
| 🟡 amarillo | N | sin cuenta de mesa, N comandas | **no le cobra a la mesa**; cobra por comanda |
| 🟠 naranja | — | cuenta de mesa | cobra la mesa |
| 🟠 naranja | N | cuenta de mesa **+** comandas | ⚠️ 2 cuentas o más |
| 🔵 azul | cualquiera | reservada — pisa a las demás | — |

⚠️ **No colapsar amarillo y naranja en "ocupada".** Derivar la ocupación incluyendo comandas destruye la distinción que necesita el cajero. Fue considerado y descartado explícitamente.

⚠️ El amarillo es **`#ffeb3b`, no `#ffc107`**: el ámbar se confunde con el naranja `#f4a536` a la distancia a la que se mira un plano de mesas. Verificado en pantalla. Y `.table-selected` usa borde y glow **blancos**, porque el amarillo pasó a ser un estado.

### Qué significa `Comanda.pdv_mesa`

**Ubicación, no ocupación.** Dice dónde está sentada la cuenta, para saber a dónde llevar la comida y por qué sector imprimir. No cambia el estado de la mesa.

Una comanda de barra o "para llevar" simplemente **no tiene mesa**. Si no hay nadie en la mesa, no se le pone mesa — ese es el caso que antes se resolvía mal con el flag.

⚠️ **`PdvConfig.ocuparMesaAlVincularComanda` está DEPRECADO** y ya no se lee. Producía el estado que ahora es una mentira: naranja sin cuenta de mesa. La columna no se dropeó.

### `pdv_mesas.estado` es un CACHE, no la verdad

Las consultas (`getPdvMesas`, `getPdvMesasBySector`, `getPdvMesa`, `getPdvMesasDisponibles`) devuelven el estado **derivado** vía `derivarEstadoMesas`. La columna se resincroniza con `sincronizarEstadoMesaEnTx` y en el arranque (`db-migrations-bootstrap`, las **dos** direcciones).

**Por qué:** era un flag manual que seis caminos mantenían a mano y un séptimo ignoraba. Cada bug de "mesa colgada en OCUPADO" fue un camino que se olvidó de actualizarlo — van tres. Si agregás un camino que abre o cierra la cuenta de una mesa, **no escribas `estado` a mano**: llamá a `sincronizarEstadoMesaEnTx`.

⚠️ El guard que impide liberar una mesa estaba **duplicado**: `set-pdv-mesa-estado` (manual) y `liberarMesaSiVaciaEnTx` (automático, el que corre casi siempre). Hoy hay una sola función. Sólo la **cuenta propia** bloquea; las comandas ya no.

### En el frontend, el color se ESTAMPA

La regla 4 prohíbe funciones y getters en templates, así que `estamparMesa()` calcula clase y tooltip y los deja en el objeto.

⚠️ **Hay SIETE caminos que escriben `mesas`** y todos tienen que estampar. El más traicionero: `refreshMesasSilent` saltea `.venta` de la mesa **seleccionada** a propósito, para no pisar datos en edición — sin estampar en los caminos optimistas, el color se congela justo en la mesa que el cajero está mirando.

Y se estampa desde **`mesa.venta`**, no desde `mesa.estado`: es la misma regla del backend, y además es lo que los caminos optimistas mantienen al día (cobrar pone `venta = null` sin tocar `estado`).

**Test:** `npm run test:mesa-estado` fija la matriz de 4 combinaciones × color × tooltip.

### Los tickets identifican mesa Y comanda

`buildEncabezadoUbicacion` (función pura, testeable sin hardware) imprime las dos referencias cuando existen las dos. Antes era un `if (mesa) / else if (comanda)`: **una comanda con mesa nunca imprimía su número**, así que dos cuentas en la misma mesa producían tickets idénticos. Y la pre-cuenta no imprimía la comanda nunca — `buildVentaTicketLines` ni siquiera cargaba la relación.

## Transferir una cuenta entre mesas y comandas (2026-08)

Canal único: **`transferir-venta-pdv`** en `ventas.handler.ts`. Una transacción, un `ensurePermission('VENTAS_PDV')`, y `withMesaLock` sobre las mesas involucradas (tomadas en orden ascendente de id, para que dos transferencias cruzadas no se abracen).

```ts
{ origen:  { tipo: 'MESA' | 'COMANDA', id },
  destino: { tipo: 'MESA' | 'COMANDA', id },
  alcance: 'COMPLETA' | 'ITEMS',
  itemIds?: number[] }        // obligatorio si alcance = 'ITEMS'
```

**Las 8 combinaciones** (mesa y comanda como origen y como destino, completa y por ítems) están cubiertas. Antes existían sólo mesa→mesa (completa y por ítems) y comanda→mesa completa, cada una como una secuencia de 5 a 8 llamadas IPC sueltas desde `pdv.component.ts`: si una fallaba a mitad, los ítems quedaban movidos y la mesa origen ocupada, sin forma de saberlo ni de deshacerlo.

**La venta rápida (mostrador) y el delivery quedan fuera** a propósito: no son contenedores del salón. El botón TRANSFERIR se renderizaba con una venta rápida activa pero `transferirMesa()` salía en el primer `if` sin avisar; ahora directamente no se renderiza (`*ngIf="!selectedComanda && !ventaRapidaActual"`).

### Reglas de dinero (son la parte delicada)

- **Sólo ítems**: nunca se mueve un ítem con `montoCubierto > 0.5`. El cobro parcial y el cliente se quedan en el origen. El frontend ya lo filtraba; ahora también lo valida el backend.
- **Completa a un contenedor SIN venta abierta** → *re-apunte*: la venta entera cambia de `mesa_id`/`comanda_id`. Cobros, `pago` y cliente viajan intactos porque nada se copia.
- **Completa a un contenedor que YA tiene cuenta abierta** → fusión de ítems, y **se rechaza si el origen tiene cobros parciales**. `Venta.pago` es un `ManyToOne` simple y el código viejo hacía `updateData.pago = ventaOrigen.pago` sin condición: **pisaba el pago del destino y dejaba la plata cobrada huérfana**. Las rondas de `CobroParcial` además llevan un `factorAplicado` atado al descuento global de SU venta, así que fusionarlas cruza dos contabilidades.

### Comportamiento de los contenedores

- Comanda destino **DISPONIBLE** → hereda la mesa del origen **sólo si el alcance es ITEMS** (dividir la cuenta en la misma mesa: la gente sigue sentada ahí). En **COMPLETA** no hereda: la cuenta *se va* de la mesa. Vincularla dejaba la mesa ocupada, sin cuenta propia y sin forma de atenderla ni liberarla — era el bug reportado.
- Mesa origen → se libera sólo si no le queda trabajo vivo, con el mismo criterio que `set-pdv-mesa-estado` y `cerrarComanda` (cuenta comandas OCUPADO + ventas ABIERTA con `comanda IS NULL`). Por eso mesa completa → comanda nueva sobre esa misma mesa **deja la mesa ocupada**: la gente sigue sentada, ahora con tarjeta.
- Comanda origen → vuelve a DISPONIBLE con `pdv_mesa`, `sector` y `observacion` en null.
- Por ítems: el origen se cierra sólo si quedó sin ítems activos.

**UI:** `transferir-destino-dialog` (era `transferir-mesa-dialog`) con dos chips arriba, MESAS y COMANDAS. Devuelve `{ tipo, id, etiqueta }`. Los destinos ocupados se marcan con borde y un icono de persona — transferir ahí **une** las dos cuentas. Las comandas ganaron botones TRANSFERIR y MOVER ITEMS, que antes no tenían.

### Concurrencia: se lockean los DOS tipos de contenedor

`withMesaLock` **y** `withComandaLock`, tomados en orden ascendente de id dentro de cada tipo, y las comandas siempre después de las mesas. El candado de mesa solo no alcanza: una transferencia entre dos comandas no toca ninguna mesa, así que corría sin serializar y dos cajeros podían dejar **dos ventas ABIERTA colgando de la misma comanda** — `buscarVentaAbiertaDe` devuelve una sola, y la otra queda viva en la base con sus ítems ya en cocina, inalcanzable desde el cobro.

`cerrarComanda` delega en el mismo helper transaccional (`cerrarComandaEnTx`) en vez de tener su copia. La copia ya había divergido en dos puntos: limpiaba `pdv_mesa`/`sector`/`observacion` con **`undefined`** — y TypeORM **no emite UPDATE para propiedades undefined**, así que el FK conservaba la mesa vieja (regla 15 de esta skill) — y contaba el trabajo vivo de la mesa fuera de toda transacción, pudiendo liberar una mesa que una transferencia en curso acababa de ocupar.

⚠️ `getPdvMesa` ahora filtra `comanda: IsNull()` al buscar la venta de la mesa, igual que `queryMesasWithVentaAbierta` y `set-pdv-mesa-estado`. Sin ese filtro devolvía la cuenta de una comanda vinculada como si fuera la cuenta de la mesa — lo usa el detalle de mesa de la PWA.

**Una venta con `CuentaPorCobrar` ACTIVO no se transfiere.** El flujo normal (`cobrar-venta-credito`) concluye la venta al crear la CPC, así que no debería aparecer como origen; pero `create-cuenta-por-cobrar` deja vincular una a mano a una venta abierta, y cancelar esa venta acá se saltearía la reversión de saldo que hace `updateVenta`.

**Test:** `npm run test:transferencia-pdv` (65 asserts: las 8 celdas, las reglas de dinero, la mesa fantasma de la cadena mesa→comanda→mesa, el FK de la comanda al cerrarse, la CPC y los permisos).

## Entidades clave (24 archivos `*.entity.ts` en `entities/ventas/`)

```
Sector ─┐
        └── PdvMesa ─── Reserva (opcional)
                  └── Venta ─── VentaItem ─── VentaItemSabor ─── VentaItemAdicional
                            ├── VentaItemIngredienteModificacion
                            ├── VentaItemObservacion
                            ├── Pago + PagoDetalle (legacy)
                            ├── Comanda ─── ComandaItem (cocina / KDS)
                            └── Delivery (si delivery)
                                  └── PrecioDelivery

KdsPantalla   (config de pantallas KDS, standalone — no FK)
```

## Diferencia: Venta vs Comanda vs Mesa

| Concepto | Entidad | Propósito | Ciclo |
|---|---|---|---|
| **Venta** | `Venta` | Transacción comercial (factura) | ABIERTA → CONCLUIDA / CANCELADA |
| **Comanda** | `Comanda` | Tarjeta de cocina (pedido a preparar). Tarjeta física con número/código de barras. | DISPONIBLE (libre) ↔ OCUPADO (asignada) |
| **Mesa** | `PdvMesa` | Ubicación física | DISPONIBLE ↔ OCUPADO |

Una mesa puede tener **1 venta abierta** Y **N comandas vinculadas** (cuentas separadas).

## Estados

```typescript
VentaEstado: ABIERTA | CONCLUIDA | CANCELADA
EstadoVentaItem: ACTIVO | MODIFICADO | CANCELADO
ComandaEstado: DISPONIBLE | OCUPADO
ComandaItemEstado: PENDIENTE | EN_PREPARACION | LISTO | ENTREGADO | CANCELADO
PdvMesaEstado: DISPONIBLE | OCUPADO
DeliveryEstado: ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO | CANCELADO
TipoModificacionIngrediente: REMOVIDO | INTERCAMBIADO
```

## Venta

`src/app/database/entities/ventas/venta.entity.ts`:

| Campo | Notas |
|---|---|
| `cliente_id` FK nullable | Cliente registrado |
| `nombreCliente` string | Nombre rápido sin registrar |
| `estado` enum | ABIERTA por default |
| `forma_pago_id` FK (prop `formaPago`) | |
| `caja_id` FK | Una venta siempre pertenece a una caja |
| `dispositivo_id` FK nullable | Dispositivo origen (F5 device tracking). Null en ventas pre-F5; en cliente HTTP lo resuelve el server del JWT |
| `pago_id` FK nullable | Se crea al cobrar (legacy entity Pago) |
| `delivery_id` FK nullable | Si es delivery |
| `mesa_id` FK nullable (prop `mesa`) | Si es venta en mesa |
| `comanda_id` FK nullable | Si está vinculada a comanda |
| `ventaPadre_id` FK nullable | Para división de cuenta |
| `descuentoPorcentaje, descuentoMonto, descuentoMotivo` | Descuento global |
| `descuentoAutorizadoPor_id` FK | Quién autorizó el descuento |
| `fechaCierre` datetime nullable | Cuando se concluyó |
| `vendedor_id` FK Usuario | Para comisiones (refactor RRHH Fase 6 — fallback `created_by`) |
| `total` decimal denormalizado | Puede no estar actualizado, recalcular desde items |

## VentaItem

```typescript
{
  venta_id, producto_id, presentacion_id
  precioVentaPresentacion: PrecioVenta (snapshot)
  precioCostoUnitario: decimal
  precioVentaUnitario: decimal
  cantidad: decimal
  descuentoUnitario: decimal       // se resta del precio unitario
  precioAdicionales: decimal       // suma denormalizada de adicionales
  estado: ACTIVO | MODIFICADO | CANCELADO
  canceladoPor, horaCancelado
  modificado: boolean
  modificadoPor, horaModificacion
  nuevaVersionVentaItem: VentaItem (FK al item editado)
  historialCambios: text JSON      // qué cambió al editar
  recetaPresentacion: RecetaPresentacion (opcional, para ELABORADO_CON_VARIACION)
  ensambladoDescripcion: string    // descripción legible de la composición
  cantidadSabores: int             // 1, 2, 3 (max: Producto.maxVariacionesSimultaneas ?? PdvConfig.pizzaMaxSabores)
  saboresVenta: VentaItemSabor[]
  vendedor: Usuario (split de comisiones por item, opcional)
  // Buffet por peso (solo producto BUFFET_POR_PESO):
  pesoBruto, pesoTara, pesoNeto: decimal(10,3)  // gramos; siempre se persiste
  precioPorKg: decimal              // precio por kilo real usado (reporting)
  aplicoLibre: boolean             // true si se activó el tope "buffet libre"
  // Impresión de comanda de cocina (sistema documentos):
  impreso: boolean                 // true solo cuando TODOS los sectores del item se imprimieron OK
  fechaImpresion: Date
  impresiones: text JSON           // log [{sectorId, printerId, ts, ok, error?}] por intento
}
```

**Cálculo final por item:** `(precioVentaUnitario + precioAdicionales - descuentoUnitario) * cantidad`.

**Estados:**
- ACTIVO: cuenta en total.
- MODIFICADO: el item fue editado, hay una versión nueva linked en `nuevaVersionVentaItem`. Sigue contando (sumamos solo la última versión activa).
- CANCELADO: NO cuenta en total.

## VentaItemSabor (multi-sabor)

Para pizzas con 2+ sabores:

```typescript
{
  ventaItem_id (CASCADE)
  recetaPresentacion_id        // ej: "Pizza Grande Calabresa"
  proporcion: decimal          // 1.0 entera, 0.5 mitad, 0.33 tercio
  precioReferencia, costoReferencia
  activo
}
```

Pizza con Margherita + Calabresa cada uno 0.5.

## VentaItemAdicional

```typescript
{
  ventaItem_id (CASCADE)
  adicional_id
  precioCobrado: decimal       // snapshot
  cantidad: decimal default 1
  ventaItemSabor_id nullable   // si aplica solo a 1 sabor (ej: jamón solo en mitad)
}
```

## VentaItemIngredienteModificacion

```typescript
{
  ventaItem_id (CASCADE)
  recetaIngrediente_id
  tipoModificacion: REMOVIDO | INTERCAMBIADO
  ingredienteReemplazo_id: Producto nullable   // si INTERCAMBIADO
  ventaItemSabor_id nullable
}
```

REMOVIDO: "sin tomate". INTERCAMBIADO: "Mozzarella → Queso de Cabra" (ingredienteReemplazo).

## VentaItemObservacion

```typescript
{
  ventaItem_id (CASCADE)
  observacion_id: Observacion    // predefinida (catálogo) — NOT NULL
  observacionLibre: varchar       // texto libre
  ventaItemSabor_id nullable
}
```

### Nota libre: el sentinel `NOTA DEL CLIENTE` (2026-08)

`observacion_id` es **NOT NULL** en las dos baselines, así que una nota escrita a
mano no puede guardarse "sin observación". La única forma soportada:

- El caller manda `createVentaItemObservacion({ ventaItem, observacionLibre })`
  **sin** `observacion`, y el handler cuelga la fila de la `Observacion` sentinel
  `NOTA DEL CLIENTE` (`electron/utils/observacion-libre.utils.ts` →
  `ensureObservacionNotaLibreId`, que la crea si no existe). También normaliza a
  UPPERCASE y corta a 500. Una llamada sin observación **y** sin nota se rechaza.
- **Una sola fila por nota.** Una observación del catálogo y la nota son filas
  distintas: nunca meter la nota dentro de la fila de una observación elegida.
- **Al renderizar gana `observacionLibre`**: `observacionLibre || observacion?.descripcion`.
  Si se muestra la descripción primero, la nota queda invisible y el usuario ve
  "NOTA DEL CLIENTE" en vez del texto.
- **Al reabrir el diálogo de personalización**, las filas con `observacionLibre`
  se excluyen de los chips seleccionados (si no, el sentinel vuelve marcado como
  si el cajero lo hubiera elegido) y son las que precargan el textarea.
- El handler las trata como **excluyentes**: mandar `observacion` del catálogo
  **y** `observacionLibre` en la misma fila se rechaza, porque al renderizar la
  nota tapa a la observación (era el bug viejo).
- El sentinel está **excluido del catálogo** (`getObservaciones` /
  `searchObservaciones` en `productos.handler.ts`): si se lo pudiera vincular a
  un producto, aparecería como chip elegible y el cajero vería el texto interno
  "NOTA DEL CLIENTE".
- **Guardar observaciones desde un diálogo que las precarga = reconciliar**
  (borrar las actuales y recrear la selección), nunca sólo insertar.
  `personalizarItem()` y el flujo de mobile ya lo hacían; `editItem()` no, y
  duplicaba todas las observaciones **en cada edición**, aunque sólo cambiaras la
  cantidad (2×, 3×, …). Arreglado el 2026-08-17.

Bug histórico (arreglado 2026-08-17): los tres sitios del PdV que persistían
observaciones colgaban la nota de `observacionIds[0]` — duplicando esa
observación en pantalla y en la comanda — o mandaban `observacion: null`, que
reventaba contra el NOT NULL y perdía la nota en silencio. Además la comanda leía
`o.descripcion`, campo inexistente en la entidad, así que la nota nunca se
imprimía. Test: `npm run test:observacion-libre`.

## Mesas y sectores

`PdvMesa`:
- `numero` (visible, ej: 1, 2, 3)
- `cantidad_personas` (capacidad, default 4)
- `estado` (DISPONIBLE / OCUPADO)
- `activo`, `reservado`
- `sector_id`, `reserva_id` nullable
- `venta` 1:1 con la venta abierta (max 1)
- `comandas` 1:N

`Sector`: `nombre`, `activo`, `mesas[]`. Ej: "Salón A", "Barra", "Terraza".

**Estado auto-update**: el handler `cerrarVentasAbiertasMesa(mesaId, estado)` concluye/cancela la venta abierta de la mesa y libera la mesa (estado → DISPONIBLE). Lo invoca el flujo de cobro/cancelación del PdV.

## Comandas (cuentas individuales)

Tarjetas físicas con código de barras ("CMD-001", "CMD-002") que se entregan a clientes para cuentas individuales en mesa o barra. Permiten que dos clientes en la misma mesa tengan cuentas separadas.

```typescript
Comanda {
  codigo: string           // "CMD-001"
  numero: int              // secuencial
  estado: DISPONIBLE | OCUPADO
  descripcion?, observacion?
  pdv_mesa?: PdvMesa nullable     // mesa vinculada (opcional)
  sector?: Sector nullable
  activo
}

ComandaItem {
  comanda_id (CASCADE)
  ventaItem_id            // referencia a item específico de la venta
  sector_id nullable      // KDS: sector donde se prepara (1 ComandaItem por sector → estado independiente)
  estado: PENDIENTE | EN_PREPARACION | LISTO | ENTREGADO | CANCELADO
  observacion
  fechaEnPreparacion      // timestamp al pasar a EN_PREPARACION (métricas de tiempo de prep)
  fechaListo
  activo
}
```

**KDS (Kitchen Display System)**: los `ComandaItem` alimentan el feed de pantallas de cocina. Ver dominio `cocina-impresion.md` y el handler `kds.handler.ts`. Páginas en `src/app/pages/ventas/kds/` (`kds.component`, `list-kds-pantallas`, `create-edit-kds-pantalla-dialog`).

**Caso de uso**:
- Cliente en barra: abre comanda CMD-007 sin mesa.
- 2 clientes mesa 5 piden cuentas separadas: abrir CMD-012 y CMD-013 vinculadas a mesa 5 (mesa NO tiene venta directa, las comandas sí).

**Configuración**: `PdvConfig.comandasHabilitadas` (boolean) y `pdvTabDefault: MESAS | COMANDAS`.

## Delivery (reescrito 2026-08-24 — leer antes de tocar nada)

El módulo estaba implementado pero **nunca se usó en producción**. La auditoría
completa está en [`docs/DIAGNOSTICO-DELIVERY.md`](../../../../docs/DIAGNOSTICO-DELIVERY.md):
26 hallazgos, cuatro bloqueantes. Lo que sigue describe el estado **después** de
cerrarlos.

### La regla que faltaba: el envío es un cargo de la venta

```
venta.costoDelivery  =  monto CONGELADO del envío
```

Se persiste el **monto**, no sólo la FK a la zona: el precio de una zona cambia
con el tiempo y el ticket de una venta vieja tiene que seguir mostrando lo que
se cobró. Se escribe al crear el delivery y al cambiar la zona.

⚠️ **Antes de este cambio el envío NO SE COBRABA NUNCA.** `cobrar-venta-dialog`
sumaba únicamente `Σ ítems − descuento` y `precioDelivery.valor` era decorativo.
Hoy el costo entra en el total del cobro, en `getEstadoCobroVenta` y en el
comprobante como línea `ENVIO`. **No modelarlo como `VentaItem`**: fue evaluado
y descartado porque ensucia stock, costo/rentabilidad, comisiones y KDS.

### La máquina de estados es del backend

`delivery.handler.ts` es el dueño. `updateDelivery` (el CRUD genérico) **rechaza**
cualquier payload que traiga `estado` o un timestamp.

```
ABIERTO      → PARA_ENTREGA | EN_CAMINO
PARA_ENTREGA → EN_CAMINO | ABIERTO
EN_CAMINO    → ENTREGADO | PARA_ENTREGA
ENTREGADO    → EN_CAMINO          (corrección de un click errado)
CANCELADO    → (nada: es terminal)
```

- **ENTREGADO exige la venta CONCLUIDA.** Marcar entregado sin cobrar deja un
  pedido en la calle que nadie va a cobrar.
- **EN_CAMINO exige repartidor** si `PdvConfig.deliveryRequiereRepartidor`.
- Los timestamps los estampa y los limpia el backend; al retroceder se borran
  las fechas de los estados que quedan por delante.
- ⚠️ **Reabrir un CANCELADO no se puede, a propósito.** Antes se podía y estaba
  roto de raíz: la reapertura ponía la venta en ABIERTA confiando en que "el
  stock se re-procesará", pero `revertirStockVenta` desactiva los
  `StockMovimiento` y **nada los reactiva**. Si el cliente vuelve a pedir, se
  crea un delivery nuevo.

### Cancelar mueve plata: es transaccional y tiene permiso propio

`delivery-cancelar(id, motivo)` hace todo en un `queryRunner`, vía
`electron/utils/venta-reversa.utils.ts` (`cancelarVentaCompletaEnTx`): ítems →
CANCELADO, `PagoDetalle.activo = false`, rondas de `CobroParcial` de baja, CPC
revertida con el saldo del cliente y su `MovimientoCliente`, `StockMovimiento`
desactivados, venta CANCELADA.

- El **motivo es obligatorio**.
- Si la venta estaba CONCLUIDA exige **`VENTAS_DELIVERY_CANCELAR_COBRADO`**
  además de `VENTAS_PDV`.
- Es **idempotente**: reintentar tras un error de red no descuadra al cliente.

`venta-reversa.utils.ts` es reutilizable: es el lugar donde poner cualquier
futura "cancelación de venta cobrada" (p. ej. desde Últimas Ventas, que hoy
sigue sin revertir el cobro).

### Handlers

| Canal | Qué hace |
|---|---|
| `delivery-listar-pdv(cajaId, filtros)` | Lista del PdV: la caja actual **+ los pendientes de cualquier caja** (marcados `otraCaja`). Reemplaza a `getDeliveriesByCaja`, que perdía de vista un EN_CAMINO al cerrar la caja. |
| `delivery-crear(payload)` | Delivery **+ Venta en una transacción**. Antes eran dos llamadas y un fallo en la segunda dejaba un delivery sin venta, invisible (la lista parte de `Venta`). |
| `delivery-actualizar-datos(id, payload)` | Datos del cliente + zona. Sincroniza `venta.costoDelivery`; rechaza el cambio de zona si la venta ya no está ABIERTA. |
| `delivery-cambiar-estado(id, estado, {funcionarioId})` | La máquina de estados. |
| `delivery-asignar-repartidor(id, funcionarioId)` | — |
| `delivery-cancelar(id, motivo)` | Reversa transaccional. |
| `delivery-listar-repartidores()` | Funcionarios activos sin egreso. |
| `delivery-imprimir-ticket(id, printerId?)` | Ticket de reparto. |

### Entidades

`Delivery`:
| Campo | Notas |
|---|---|
| `precioDelivery_id` FK nullable | Zona de entrega |
| `cliente_id` FK nullable | Cliente registrado |
| `nombre, telefono, direccion` | Si no hay cliente registrado |
| `observacion` | Notas |
| `estado` | Ver la máquina de estados |
| `fechaAbierto, fechaParaEntrega, fechaEnCamino, fechaEntregado, fechaCancelacion` | Los escribe el backend |
| `motivoCancelacion` | Obligatorio al cancelar |
| `cobroAnticipado` | boolean. ⚠️ Sigue siendo **informativo**: ningún flujo lo lee todavía |
| `entregadoPorFuncionario_id` | **Repartidor = `Funcionario`**, no `Usuario` |
| `entregadoPor` | ⚠️ **DEPRECADO** (FK a `Usuario`). Nunca llegó a escribirse: el botón ENVIAR tenía un TODO. La columna se conserva |

`PrecioDelivery`: `descripcion`, `valor`, `activo`.

⚠️ **`PrecioDelivery.valor` y `Venta.costoDelivery` son `decimal`**: en Postgres
llegan al renderer como **string** (no hay `pg.types.setTypeParser(1700)` en el
repo). Sin `Number()` se concatenan en vez de sumarse — el total del detalle
mostraba `100005000`.

### Ticket de reparto

`printDeliveryTicketInternal` (en `documentos-tickets.handler.ts`). Responde las
tres preguntas del repartidor: **a dónde va, qué lleva y cuánto cobra** — con
`A COBRAR Gs. X` / `PAGADO — NO COBRAR` en letra grande al pie.

Reemplaza a `print-etiqueta-delivery`, que era **código muerto** (no estaba en
`preload.ts` ni en el mapa de canales, así que nadie podía invocarla) y sólo
imprimía nombre y dirección.

Rol de impresora: `TICKET_VENTA` (no hay rol DELIVERY propio).

### UI

- **`delivery-dialog`** (90vw × 85vh): lista paginada con filtro por estado,
  panel de detalle con totales (SUBTOTAL / ENVÍO / TOTAL), timer de espera con
  colores por umbral, y footer de acciones. El menú ESTADO se arma desde un
  espejo de la tabla de transiciones del backend.
- **`crear-delivery-dialog`**: alta/edición, con autocomplete de cliente por
  teléfono (**match por dígitos**, no por string: antes `0981 123456` y
  `0981123456` creaban dos clientes).
- **`seleccionar-repartidor-dialog`** (nuevo): elige el `Funcionario` al enviar.
- **ABM de zonas**: `Ventas → Configuración → Precios de Delivery`, ahora en el
  `MENU_TREE` (antes sólo se alcanzaba desde el dashboard de Ventas).

### `ConfirmationDialogComponent` cambió de contrato

Ahora implementa `showInput` / `inputLabel` / `inputRequerido` / `showCancel`,
que varios llamadores le pasaban desde siempre y el componente **ignoraba**.

**Con `showInput: true` cierra devolviendo el STRING** (en UPPERCASE, trimeado),
no `true`. Sin `showInput` sigue devolviendo `true`/`false` como siempre.

Este era el bug A-3: el delivery pedía el motivo de cancelación con `showInput`,
el diálogo no lo implementaba, la guarda `typeof result === 'string'` nunca se
cumplía y **todos** los deliveries cancelados quedaban con `'SIN MOTIVO'`.

### Test

`npm run test:delivery` — 46 asserts. Manual de pruebas:
`docs/testing/TESTING-CHECKLIST-DELIVERY.md`.

## Sistema de Atajos PdV

Botones rápidos en el PdV para productos / categorías frecuentes.

```
PdvAtajoGrupo (tab: "CENA", "DESAYUNO")
  └─ PdvAtajoGrupoItem (M:N)
       └─ PdvAtajoItem (botón "BEBIDAS", "HAMBURGUESAS")
             └─ PdvAtajoItemProducto (M:N producto, con posición y nombre_alternativo)
```

`PdvAtajoItem` tiene `colorFondo`, `colorTexto`, `icono`. Permite layout visual customizable.

**Configuración**: `atajo-config-dialog` con drag & drop, tamaños configurables (`PdvConfig.atajosGridSize`, `atajosProductosGridSize`).

**Tipos de producto soportados al click**:
- RETAIL: muestra presentaciones, agrega directo.
- ELABORADO_SIN_VARIACION: precio via receta, abre `PersonalizarProductoDialog`.
- ELABORADO_CON_VARIACION: abre `seleccionar-variacion-dialog` (tamaño → sabores → personalización).
  En las listas se muestra el **rango de precios** de sus variaciones (no un precio único), y si el
  tamaño tiene un solo sabor con precio se autoselecciona. → [recetas-sabores-variaciones.md](recetas-sabores-variaciones.md).
- COMBO: precio directo en producto.

## Categorías PdV (legacy)

```
PdvGrupoCategoria → PdvCategoria → PdvCategoriaItem (con imagen) → PdvItemProducto
```

ABM via `pdv-config-dialog`. Visualización **parcialmente implementada** — los items se muestran pero la navegación a click no agrega productos al carrito (TODO).

→ Memoria sugiere reemplazar con sistema de Atajos. (`project_atajos_sistema`)

## PdvConfig (configuración global)

Una sola fila. Campos:

| Campo | Default | Efecto |
|---|---|---|
| `cantidad_mesas` | 0 | Total de mesas |
| `pdvGrupoCategoria_id` | null | Grupo categorías default |
| `umbralDiferenciaBaja` | 5 | % aceptable diferencia caja (verde) |
| `umbralDiferenciaAlta` | 15 | % alerta diferencia (rojo) |
| `deliveryHabilitado` | true | Muestra el botón DELIVERY en el PdV |
| `deliveryTiempoAmarillo` | 30 | min para color amarillo |
| `deliveryTiempoRojo` | 60 | min para color rojo |
| `deliveryPrecioDefaultId` | null | Zona preseleccionada al crear (null = la de menor valor) |
| `deliveryCobroAnticipadoDefault` | false | Estado inicial del toggle COBRO ANTICIPADO |
> ### Delivery y retiro son el mismo registro (2026-08-25)
>
> `Delivery.modo` vale `DELIVERY` (se reparte) o `RETIRO` (el cliente lo pasa a
> buscar). Comparten cliente, ítems, cocina, cobro y cancelación; el retiro se
> diferencia sólo en las tres cosas que dependen de que alguien lo lleve:
> **dirección, costo de envío y repartidor**.
>
> Consecuencias que hay que respetar al tocar el módulo:
>
> - El alta es **un solo formulario** con un toggle. El cajero atiende el
>   teléfono sin saber qué va a pedir el cliente.
> - En modo RETIRO el **nombre pasa a ser obligatorio** (reemplaza a la
>   dirección como lo que identifica la bolsa en el mostrador) y se valida en el
>   backend, no sólo en el diálogo.
> - **`EN_CAMINO` no existe** para un retiro: `transicionesDe(modo)` en
>   `delivery.handler.ts` tiene su propia tabla, espejada en el front.
> - **El candado del repartidor no aplica**: nadie lo lleva.
> - El **único botón del footer** que un retiro no puede usar es REPARTIDOR.
>   Cobra, edita ítems, imprime y se cancela por los mismos botones — el cobro
>   nunca fue distinto, es el mismo diálogo con el envío en cero.
> - El **reloj se congela** al marcar `PARA_ENTREGA`: de ahí en más falta que
>   venga el cliente, que no depende del local. Sin eso un retiro se ponía rojo
>   a las horas y el rojo dejaba de significar «hay que apurarse» en toda la
>   lista.

| `deliveryRequiereDireccion` | **false** desde 2026-08-25 | Dirección obligatoria para dar de alta. El default era `true`; se invirtió porque el mostrador toma pedidos por teléfono y la dirección suele llegar después. La migración `DireccionDeliveryOpcional` también pone en `false` la fila existente |
| `deliveryRequiereRepartidor` | true | Repartidor obligatorio. La etapa en la que bloquea la define `deliveryRepartidorEtapa` |
| `deliveryRepartidorEtapa` | `EN_CAMINO` | Cuándo exige el repartidor: `EN_CAMINO` (al enviar) o `ENTREGADO` (al finalizar). Permite que un delivery salga sin repartidor asignado y se complete después |
| `deliveryTelefonoMinDigitos` | 4 | Mínimo de dígitos para habilitar el alta |
| `deliveryPageSize` | 20 | Filas por página en la lista |
| `deliveryMostrarPendientesOtrasCajas` | true | Suma a la lista los pendientes de otros turnos |
| `deliveryAutoImprimirAlCrear` | false | Imprime el ticket de reparto al crear |
| `deliveryAutoImprimirAlEnviar` | false | Imprime el ticket al pasar a EN_CAMINO |
| `pdvTabDefault` | "MESAS" | Tab inicial PdV (MESAS/COMANDAS/CATEGORIAS/ATAJOS) |
| `comandasHabilitadas` | false | Activa sistema de comandas |
| `ocuparMesaAlVincularComanda` | false | Si true, vincular comanda a mesa marca la mesa OCUPADA; al cerrar la comanda vuelve a DISPONIBLE si no quedan otras comandas/venta abierta |
| `atajosGridSize` | 3 | Tamaño grid atajos (1=grande, 3=pequeño) |
| `atajosProductosGridSize` | 3 | Tamaño grid productos en atajos |
| `pizzaMaxSabores` | 2 | Máximo sabores por pizza. **Es el default**: cada producto puede sobreescribirlo con `Producto.maxVariacionesSimultaneas` |
| `pizzaEstrategiaPrecio` | MAYOR_PRECIO | MAYOR_PRECIO o PROMEDIO. **Es el default**: se sobreescribe con `Producto.estrategiaPrecioVariacion` |
| `autoImprimirComanda` | true | Al agregar items → imprimir comanda automáticamente a impresoras del sector |
| `autoImprimirTicketVenta` | true | Al cobrar (CONCLUIDA) → imprimir ticket de venta automáticamente |
| `imprimirPrecuentaAlSolicitar` | true | Botón "Pre-cuenta" imprime sin confirmación intermedia |
| `balanzaPrefijo` | '2' | Prefijo EAN-13 de etiqueta de balanza (buffet por peso) |
| `balanzaModo` | PESO | Qué codifica el valor embebido: PESO o PRECIO |
| `balanzaFactorPeso` | 1 | Factor valor embebido → gramos |

## Flujo completo de venta (Pdv)

### 1. Apertura de caja

`pdv.component.ts` → `ngOnInit`:
- Si user no tiene caja abierta: dialog "¿Abrir caja?" → `create-caja-dialog` (2 steps: Conteo Apertura → Resumen).
- Dispositivo auto-detectado (MAC en `system.handler.ts`).

### 2. Selección de mesa

El polling de mesas (`getPdvMesasActivas()`) ya trae cada `PdvMesa` con su `venta` abierta (max 1). Al click:
- Si `mesa.venta?.id`: `loadVentaItems(mesa)` → `getVentaItems(ventaId)` y `cargarPersonalizacionesItem` por item (sabores, adicionales, modificaciones, observaciones).
- Si no hay venta abierta: items = [].

Auto-refresh periódico (`getPdvMesasActivas()`) para detectar cambios concurrentes.

### 3. Agregar producto

User busca (`searchForm`: `cantidad` + `searchTerm`) → dialog `producto-search-dialog` → selecciona producto. Atajo de cantidad **`N*`** en el buscador (ej: `3*` → cantidad 3). Antes de abrir el buscador, `openProductSearchDialog()` intenta `tryHandleBalanzaScan()` (etiqueta de balanza, ver buffet). Tras agregar, `resetBuscador()` **resetea la cantidad a 1**.

Despacho por tipo en `addProduct()`:
- **BUFFET_POR_PESO** → `addBuffetPorPesoItem()` (ver sección Buffet por peso). NO abre buscador si vino de escaneo de balanza.
- **ELABORADO_CON_VARIACION** → `seleccionar-variacion-dialog` (3 pasos genéricos con labels configurables PIZZA/DEFAULT) → `addVariacionItem()` (crea VentaItem + un `VentaItemSabor` por sabor).
  El máximo de sabores y la estrategia de precio salen **del producto** (`maxVariacionesSimultaneas` /
  `estrategiaPrecioVariacion`) con fallback al `PdvConfig`; con máximo 1 el diálogo se comporta como
  selección única. Sabor único disponible → se autoselecciona sin abrir la personalización.
- Producto **con receta** (ELABORADO_SIN_VARIACION) → `PersonalizarProductoDialog` (750px, 2 columnas):
  - Izquierda: ingredientes opcionales (chips verde/rojo toggle), intercambiables (chip naranja + select alternativas), fijos (texto compacto).
  - Derecha: adicionales con precio (chips verde con +valor), observaciones predefinidas (chips celeste), observación libre.
  - Footer: cantidad +/-, desglose precio, total.
- **COMBO / RETAIL** sin receta: agregar directo.

Si no hay mesa/comanda/venta-rápida seleccionada → `showMesaSelectionDialog()`. `createVentaItem(...)` con `precioAdicionales` denormalizado; crea sub-entidades en cascada.

**Atajos de accesos rápidos**: `onAtajoItemClick()` abre `AtajoProductosDialogComponent` (55%×70%) pasando la cantidad actual del buscador.

### Buffet por peso (venta por kilo)

Producto tipo **`BUFFET_POR_PESO`** (Fases 1-4, merged 2026). Flujo `addBuffetPorPesoItem()`:
- Resuelve el precio vigente con `resolverPrecioVigente` (**precios programados por día/horario**).
- Abre `PesajeBuffetDialogComponent` (peso bruto/tara → neto).
- Persiste `VentaItem` con `cantidad = kg neto`, `precioVentaUnitario = precio/kg efectivo` (incluye tope "buffet libre"), y los campos de peso reales: `pesoBruto`, `pesoTara`, `pesoNeto` (gramos), `precioPorKg`, `aplicoLibre`.
- En la tabla se ve como un item normal (cantidad = kg); no hay columnas de peso propias.

**Escaneo de etiqueta EAN-13 de balanza** (`tryHandleBalanzaScan` → `parseEtiquetaBalanza`): usa config de `PdvConfig` (`balanzaPrefijo` def '2', `balanzaModo` PESO/PRECIO, `balanzaFactorPeso`). Si el código resuelve a un producto buffet, agrega el item con el peso de la etiqueta sin abrir el buscador.

> **Foco del diálogo cuando el peso vino escaneado (2026-08).** El lector cierra el
> escaneo con un **Enter**, que es justo lo que abre el diálogo. Por eso el foco NO
> arranca en AGREGAR: se queda en el campo de peso (donde un Enter suelto no hace
> nada, porque el diálogo no tiene `<form>`) y recién a los `FOCO_AGREGAR_DELAY_MS`
> (400 ms) pasa a AGREGAR, para que el cajero confirme con Enter. Sólo pasa cuando
> `pesoInicialGramos > 0`; abierto a mano, el foco se queda donde hay que escribir.
> **Si algún día se agrega un botón antes del campo de peso, o un `<form>`, revisá
> esto**: el Enter del lector volvería a disparar la acción sola.

**Backend**: descuento de stock por `processBuffetPorPeso` (híbrido: por receta si `descuentaPorReceta`, si no por kg neto del propio producto; stock se carga vía Producción). Métricas en `get-buffet-metricas` → dashboard buffet. Detalle → `docs/buffet-por-kilo.md`.

### 4. Editar item

`edit-venta-item-dialog`: cantidad, descuento (fijo o %, chips rápidos 5/10/15/20/25/50%), redondeo a múltiplos de 500 Gs.

Marca original como MODIFICADO y crea versión nueva con vínculo `nuevaVersionVentaItem`. Historial JSON en `historialCambios`.

### 5. Cancelar item

Cambia estado a CANCELADO. `canceladoPor`, `horaCancelado`. NO se borra. NO suma al total.

### 6. Cobrar venta

`cobrar-venta-dialog` (dimensión la fija quien lo abre; ~80vw × 80vh). Componente en `shared/components/cobrar-venta-dialog/`. **El cobro NO crea entidades en `ventas.handler.ts`** — usa `createPago`/`createPagoDetalle` (que viven en `compras.handler.ts`, compartidos) + `updateVenta(CONCLUIDA)`.

Layout:
- Top: barra de cliente (autocomplete + "Nuevo cliente", asignable en vivo con `updateVenta`) y totales por moneda con banderas y cotizaciones (`MonedaCambio.compraLocal`).
- Izq (55%): tabla de líneas de pago (`numero, moneda, formaPago, valor, tipo, actions`). Menú por línea: observación, duplicar, editar valor, eliminar (`edit-detalle-dialog`).
- Der (45%): botones moneda (**F1-F3**) + forma pago (**F4-F7**) + selector Máquina POS + selector Cuenta Bancaria + input valor + indicador PAGO/VUELTO + bloque división de cuenta.

**Atajos**: F1-F3 monedas, F4-F7 formas de pago, **F9** Descuento/Aumento (`ajuste-cobrar-dialog`), **F10** Finalizar (sin ticket), **F11** Finalizar + Ticket. No hay F8.

**Botones de acción**: Finalizar (F10) · Finalizar + Ticket (F11) · Cobro Parcial · **Cobrar a crédito** · Descuento/Aumento (F9) · **Factura** · Cancelar.

Soporta:
- Multi-pago (varias formas de pago) y multi-moneda (vuelto en cualquier moneda). Cada línea se persiste al agregarla.
- **Tolerancia de redondeo** en monedas con decimales (`toleranciaRedondeoPrincipal()`): un residuo menor a la unidad mínima convertida se considera saldo cero (habilita Finalizar aunque pagos en R$/USD no cuadren exacto en Gs).
- Cobro parcial (`{success:false, partial:true}` — deja Pago ABIERTO con detalles ya persistidos, no cierra venta).
- División de cuenta (1-20 personas): **solo informativa** — autocompleta el input con valor/persona; sugiere registrar cada pago con nombre en observación. No divide realmente ni crea múltiples pagos.
- **Ver costo** (protegido por credenciales vía `edit-detalle-dialog` modo password + `validateCredentials`).

**Máquina POS / Cuenta bancaria por forma de pago** (`FormasPago.maquinasPos` / `.cuentasBancarias`): el selector se muestra si hay ≥1 y es **obligatorio** si hay ≥2 (con 1 se auto-selecciona). Elegir POS/cuenta **ajusta la moneda** del pago a la de la cuenta bancaria asociada. Al finalizar: cada línea PAGO con POS → `createAcreditacionPos`; con cuenta bancaria → `acreditarTransferenciaBancaria` (ambos no bloqueantes). Ambos piden `[VENTAS_COBRAR, BANCOS_GESTIONAR]` — con `BANCOS_GESTIONAR` solo, el cajero no cobraba ni con tarjeta ni con transferencia.

**Ajuste global (`ajuste-cobrar-dialog`, F9)**: descuento|aumento, modo %|monto (chips 5/10/15/20/25/50%), **redondeo a múltiplos de 500 Gs** (arriba/abajo/exacto), **alerta si el nuevo total < costo** (venta a pérdida). Devuelve `{valor, motivo}` (valor POSITIVO = descuento, NEGATIVO = aumento). Se persiste como `PagoDetalle` tipo DESCUENTO/AUMENTO. **No pide password** (la única autorización por credenciales del flujo es "Ver costo").

**Cobro a crédito (`cobrar-credito-dialog`)**: requiere cliente asignado con `credito` habilitado y saldo pendiente. Configura cuotas (cantidad, frecuencia 30/15/7 días, fecha inicio) con preview de saldo proyectado vs `limite_credito`. Pregunta si imprimir pagaré (`imprimir-pagare-dialog`). Llama `cobrarVentaCredito(payload)` (handler en **`cuentas-por-cobrar.handler.ts`**), que en una transacción: get-or-create `FormaPago` CREDITO (`movimentaCaja=false`), crea Pago PAGADO + PagoDetalle, cierra la venta CONCLUIDA, crea la **CuentaPorCobrar (CREDITO_VENTA)** + cuotas, imprime ticket/pagaré. Si excede el límite devuelve `{requiereConfirmacion:true}` → confirmación → reintento con `forzar`. El front NO crea Pago/PagoDetalle por este camino.

**Factura**: botón abre `FacturarDialogComponent` (facturación electrónica precargada con cliente e items). NO finaliza el cobro.

**Gate por dispositivo (caja compartida multi-dispositivo)**: `createPago` con `validarDispositivoCaja:true` valida que el dispositivo actual sea dueño de la caja; si difiere lanza `COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO`. El PdV además desactiva el botón Cobrar (`puedeCobrar`) en dispositivos que no son dueños de la caja: pueden lanzar items pero no cobrar.

**Cobro rápido (F2, en `pdv.component`)**: cobra total en moneda + forma de pago principal con un click (crea Pago/PagoDetalle "COBRO RAPIDO", concluye la venta, procesa stock).

Al confirmar contado (`finalizar`):
- `Pago.estado = PAGADO`; `Venta.estado = CONCLUIDA`, `formaPago` = FP dominante, `pago`, `fechaCierre`. Flag interno `__imprimirTicketVenta` (F10=false / F11=true) controla la impresión del ticket **por encima** de `PdvConfig.autoImprimirTicketVenta`.
- `PdvMesa.estado = DISPONIBLE`, `venta = null` (comanda vuelve a DISPONIBLE si aplica).
- `procesarStockVenta(ventaId)` (fire-and-forget — si falla, venta NO se revierte).
- Auto-impresión de ticket vía `printVentaTicketInternal(ventaId)` (ver `cocina-impresion.md`).
- Hook KDS en `updateVenta`: CONCLUIDA → `ComandaItem` activos a ENTREGADO; CANCELADA → a CANCELADO.

### 7. Cancelar venta completa

Dialog con motivo obligatorio:
- `Venta.estado = CANCELADA`, `descuentoMotivo = motivo`.
- Items ACTIVOS → CANCELADO.
- `revertirStockVenta(ventaId)` (marca movimientos `activo=false`).
- Mesa → DISPONIBLE.

### 8. Cierre de caja

User intenta cerrar caja → si hay ventas ABIERTA → alerta con lista (mesa #N).

Dialog cierre:
- Step 1: Conteo Cierre (billetes por moneda).
- Step 2: Resumen (ventas por forma de pago, conteo apertura, conteo cierre). **NO muestra diferencia** (medida anti-fraude).

Al confirmar:
- `Caja.estado = CERRADO`, `fechaCierre`.
- Muestra resumen post-cierre con diferencias (verde/amarillo/rojo según `umbralDiferenciaBaja/Alta`).

## Procesamiento de stock automático

`ventas.handler.ts:1826` (`procesarStockVenta(ventaId)`).

**Trigger**: fire-and-forget tras `updateVenta(CONCLUIDA)`. Si falla, no rollback de venta.

**Idempotente**: chequea movimientos activos para esa venta antes de procesar. Permite re-procesar si los anteriores fueron desactivados.

**Estrategia por tipo:**

```
RETAIL / RETAIL_INGREDIENTE (con controlaStock=true):
  cantidad_a_descontar = ventaItem.cantidad × presentacion.cantidad
  Crear StockMovimiento(VENTA, -cantidad)

ELABORADO_SIN_VARIACION:
  Por cada RecetaIngrediente:
    cantidad_ingrediente = (recetaIngrediente.cantidad × ventaItem.cantidad / receta.rendimiento) / (porcentajeAprovechamiento/100)
    Procesar recursivamente (ingrediente puede ser otro elaborado, max depth 3)

ELABORADO_CON_VARIACION:
  Buscar RecetaPresentacion correspondiente a la presentación vendida.
  Aplicar lógica ELABORADO_SIN_VARIACION sobre su receta.

COMBO:
  Iterar ComboProducto (componentes), recursión por tipo (max depth 2).
```

**Personalizaciones respetadas:**
- INGREDIENTE_REMOVIDO: no descuenta.
- INGREDIENTE_INTERCAMBIADO: descuenta el reemplazo.
- ADICIONAL con receta: descuenta sus ingredientes.

**Cancelación**: `revertirStockVenta(ventaId)` marca movimientos `activo=false`. Re-procesar si se rehabilita.

## Atajos de teclado

PdV principal:
- F1: Cobrar
- F2: Cobro rápido
- F3: Buscar productos
- F4: Cancelar venta
- F5: Pre-cuenta / imprimir
- ESC: deselecciona mesa / cierra modo delivery

Cobrar dialog:
- F1/F2/F3: monedas
- F4/F5/F6/F7: formas de pago
- F9: descuento/aumento (`ajuste-cobrar-dialog`)
- F10: finalizar (sin ticket)
- F11: finalizar + imprimir ticket

Guard: los atajos del PdV principal NO disparan si hay un diálogo abierto ni si el host no es visible (evita fugas entre pestañas).

## Utilitarios PdV (retiros, gastos, últimas ventas)

Botón **UTILITARIOS** → `utilitarios-dialog` (600px, requiere caja abierta). Grid de tarjetas:
- **Retiro de Caja** → `create-retiro-caja-dialog`.
- **Gastos** → `gasto-caja-dialog`: gasto pagado con efectivo de la caja del PdV (descuenta del cajón, aparece en el cierre). Campos: categoría (opcional), descripción, monto, moneda, forma de pago (preselecciona EFECTIVO), fecha. Handler `create-gasto-caja` (**`gastos-caja.handler.ts`**: `create-gasto-caja`/`get-gastos-caja`/`anular-gasto-caja`).
- **Últimas Ventas** → `ultimas-ventas-dialog`: últimas ventas de la caja (`getVentasByCaja`). Menú por venta: ver detalle (`detalle-venta-dialog`), reimprimir ticket (`print-venta-ticket`), reimprimir pagaré si es crédito (`get-cpc-by-venta` → `print-pagare-cpc-ticket`), cancelar venta (revierte stock si estaba CONCLUIDA).
- **Cierre Parcial** — próximamente (deshabilitado).

## Página principal: `pdv.component.ts` (~2745 líneas)

`src/app/pages/ventas/pdv/`. Standalone. Sub-componentes:
- `utilitarios-dialog/`: lanzador (retiros, gastos, últimas ventas).
- `gasto-caja-dialog/`: registro de gasto pagado con efectivo de caja.
- `ultimas-ventas-dialog/`: últimas ventas de la caja con acciones.

Patrón: master con 2 paneles. Izq: totales/saldos por moneda → tarjeta de contexto (delivery/venta-rápida/mesa/comanda) → **tabla de items** → buscador → botones COBRAR/COBRO RÁPIDO/CANCELAR. Der: tarjeta de caja → accesos rápidos (atajos) → tabs MESAS/COMANDAS con filtro de sector → botones inferiores (TRANSFERIR/MOVER, IMPRIMIR, DELIVERY, UTILITARIOS).

**Tabla de items** (`ventaItemsDataSource`, `multiTemplateDataRows`): columnas `['productoNombre','cantidad','precio','total','actions']` (+ `'select'` al frente en modo mover items). `productoNombre` muestra `ensambladoDescripcion || producto.nombre` + icono `tune` si tiene personalizaciones. Fila con clases `item-cancelado` / `item-personalizado`; click expande el detalle (`expandedDetail`: chips de removidos/intercambiados/adicionales/observaciones/descuento + metadata). Menú de acciones del item: **Personalizar / Editar / Cancelar** (NO hay Eliminar en el menú, aunque `removeItem()` existe).

**Apertura de caja (`inicializarCaja`)**: 1 caja abierta → automática; varias → `seleccionar-caja-dialog`; ninguna → ofrecer abrir (`create-caja-dialog`). Si se descarta, se cierra la pestaña PdV.

**Polling**: `setInterval` cada **1 segundo** refresca mesas + comandas silenciosamente (sin pisar selección); otro cada 60s actualiza el tiempo de caja abierta.

## Handler: `ventas.handler.ts` (~3000 líneas)

~123 handlers `ipcMain.handle(...)` organizados en grupos (más helpers internos como `autoPrintComandaIfNeeded`):
- Buffet métricas (`get-buffet-metricas`)
- PrecioDelivery
- Delivery (incluye `getDeliveriesByEstado`, `getDeliveriesByCaja`)
- Venta (CRUD + `getVentasByDateRange(desde, hasta, filtros?)`, `getResumenCaja`, `cerrarVentasAbiertasMesa`)
- VentaItem
- VentaItemObservacion / Adicional / IngredienteModificacion
- PdvGrupoCategoria / PdvCategoria / PdvCategoriaItem / PdvItemProducto
- PdvConfig (get / create / update)
- Reserva
- PdvMesa (incluye `createBatchPdvMesas`)
- Comanda (incluye `abrirComanda`, `cerrarComanda`, `createBatchComandas`, `getComandaWithVenta`)
- Sector
- Stock (`procesarStockVenta`, `revertirStockVenta`)
- PdvAtajoGrupo / PdvAtajoItem / PdvAtajoItemProducto
- VentaItemSabor

**El cobro NO vive en `ventas.handler.ts`.** `createPago`/`createPagoDetalle`/`updatePago` están en **`compras.handler.ts`** (compartidos compras+ventas; `createPago` con flag `validarDispositivoCaja` para el gate por dispositivo). Piden `[VENTAS_COBRAR, COMPRAS_GESTIONAR]`: hasta 2026-08 pedían sólo `COMPRAS_GESTIONAR` y **el cajero no podía agregar una línea de cobro**. El cobro a crédito (`cobrarVentaCredito`, `cobrar-cpc-cuota`, `get-cpc-by-venta`) en **`cuentas-por-cobrar.handler.ts`**. Gastos de caja en **`gastos-caja.handler.ts`**. Convenios/cobro consolidado en **`convenios.handler.ts`**. Acreditaciones POS y transferencias bancarias en **`banking.handler.ts`**. `ventas.handler.ts` cierra la venta con `updateVenta(CONCLUIDA)`.

**Permisos**: `ensurePermission(..., 'VENTAS_PDV')` es **selectivo** — solo en `cerrarVentasAbiertasMesa`, `updateVenta`, `deleteVenta`. El resto de handlers de este archivo NO chequea permiso explícito (confía en el gating del frontend).

**Hooks de auto-impresión** (no son IPC, son helpers internos): `createVentaItem`/`updateVentaItem` llaman `autoPrintComandaIfNeeded` (delay 2500ms) + `startRetryComandaWorker` (setInterval 5s reintenta comandas no impresas); `updateVenta(CONCLUIDA)` dispara el ticket de venta. Ambos respetan flags de `PdvConfig` y van por `documentos-tickets.handler.ts`. Ruteo de impresión por sector (sectores de IMPRESION ≠ sectores de MESA) vía `producto-sectores.handler.ts` y `sectores-impresoras.handler.ts`. KDS en `kds.handler.ts`.

→ Lista completa en [reference/handlers-index.md](../reference/handlers-index.md).

## Funcionalidades documentadas

→ Detalle completo (manual funcional por función, con estado de implementación) en `docs/guia-funcionamiento-punto-de-venta.md`.
→ Buffet por kilo (venta por peso): `docs/buffet-por-kilo.md`.
→ Plan de implementación: `docs/PLAN-IMPLEMENTACION-PDV.md`.
→ Errores conocidos: `docs/testing/ERRORES-PDV.md`; checklist de testing: `docs/testing/TESTING-CHECKLIST-PDV.md`.

---

## Actualización 2026-07 (cobro parcial, cajas, utilitarios, login QR)

### Cobro parcial por ítems (F1–F5)

**No usa `PagoDetalle` por ítem.** Modelo nuevo:
- `CobroParcial` (`cobros_parciales`): una **ronda** de cobro. `venta` (CASCADE), `factorAplicado` decimal(10,6) = `saldoDinero / pendienteBruto` de la ronda (conecta cobertura en bruto con dinero real, absorbiendo descuento/aumento global), `cashTotal`, `activo` (false = anulada), `items[]`.
- `CobroParcialItem` (`cobro_parcial_items`): imputación **en bruto** de una ronda sobre un ítem. `brutoCubierto`, `cantidad?` informativa. La suma de imputaciones activas de un ítem = `VentaItem.montoCubierto`.
- Cache: `VentaItem.montoCubierto` (cobertura bruta acumulada) y `PagoDetalle.cobroParcialId` (la ronda que originó la línea de pago). Migración `1783805921597-AddCobroParcialPorItems.ts`.

**Handlers** (`ventas.handler.ts`, permiso `VENTAS_PDV`): `getEstadoCobroVenta(ventaId)` → por ítem `{netoBruto, montoCubierto, estado PENDIENTE/PARCIAL/PAGADO}` (tolerancia 0.5) + `pendienteBruto` + descuento/aumento global; `registrarCobroParcial(ventaId, {imputaciones, pagoDetalleIds, cashTotalPrincipal, factorAplicado})` (transaccional, tope anti-doble-cobro `ITEM_YA_CUBIERTO`); `anularCobroParcial(cobroParcialId)` (desactiva ronda + sus PagoDetalle, recomputa `montoCubierto`). `computeNetoBrutoItem = (precioVentaUnitario + precioAdicionales − descuentoUnitario) × cantidad`.

**UI:** panel de ítems como **tab** dentro del panel izquierdo del `cobrar-venta-dialog` (Pagos | Items) para no ensanchar; footer fijo. En `pdv.component.ts`: chips PAGADO (verde)/PARCIAL (naranja); `bloqueadoPorCobro(item)` impide editar/cancelar/mover ítems con `montoCubierto > 0.5` ("Anulá el cobro parcial primero").

> **El ticket impreso NO conoce el cobro parcial.** `buildVentaTicketLines` no resta `montoCubierto`, así que una pre-cuenta reimpresa después de una ronda muestra el total del pedido y no el saldo (el PdV sí lo muestra en pantalla). Decisión de producto pendiente en el issue [#241](https://github.com/GabFrank/frc-gourmet/issues/241).

### Cajas

- **Compartida multi-dispositivo** (`0ac7868`): `get-cajas-abiertas` (todas las ABIERTO). El cobro se restringe: el flujo de venta manda `validarDispositivoCaja:true` y `createPago` rechaza con `COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO` si el dispositivo del request ≠ `caja.dispositivo.id`. (Repo HTTP de `getCajasAbiertas` aún NO implementado — pendiente client mode.)
- **Auto-retiro del cierre** (`5c0f068`): `generarRetiroDelCierre(ds, cajaId, userId)` (`retiro-cierre.util.ts`) crea un `RetiroCaja` origen=CIERRE estado=FLOTANTE con el efectivo por moneda del conteo (idempotente por `conteoCierre.id`). Se dispara automáticamente en `update-caja` al cerrar.
- **Ajustar caja cerrada** (`34015ca`): `puede-ajustar-caja` (editable solo si CERRADA y el retiro no está INGRESADO en Caja Mayor) + `finalizar-ajuste-caja(cajaId, motivo)` (permiso **`FINANCIERO_CAJA_AJUSTAR`**; regenera el retiro, marca `revisado`/`motivoAjuste`). Migración `AddMotivoAjusteToCaja`.
- **Guard anti-huérfanas** (`d90867b`): `update-caja` rechaza el cierre si hay ventas ABIERTAS en esa caja (chequeo en backend, inmune a la carrera multi-dispositivo). También "solo quien abrió la caja puede cerrarla".
- **Retiros manuales en el esperado** (`2504b92`, `resumen-caja.utils.ts`): `esperado = apertura + ventasEfectivo − gastosEfectivo − egresosEfectivo − retirosEfectivoManuales` (el retiro de CIERRE se excluye, se genera del conteo).
- **Conteo simplificado** (`b4f43ae`): `ConteoDetalle.monto?` = total por moneda sin desglose por billete. Efectivo del cierre = `COALESCE(monto, cantidad×valor)`.
- **Dispositivo asignado a la PC** (`e267bf5`): la creación de caja prioriza `app-settings.deviceId` (`getDeviceId()`), cae a MAC solo si no está seteado.

### Utilitarios del cajón (`utilitarios-dialog`)

Grid de tarjetas: Retiro de Caja, Gastos, Vale, Compra, Egresos de caja, Últimas Ventas, Cierre Parcial (deshabilitada).
- **Gastos de caja** (`GastoCaja`, `gastos-caja.handler.ts`): gasto con efectivo del cajón, **distinto del `Gasto` de Caja Mayor**. `create/get/anular-gasto-caja`.
- **Vales/Compras desde el cajón** (`EgresoCaja`, `pdv-egresos.handler.ts`): la salida de efectivo; el `Vale`/`CuentaPorPagarCuota` sigue siendo la fuente de verdad. `tipo` VALE|COMPRA, `valeCreado` (si el egreso creó el vale, al anular lo ANULA; si solo pagó uno SOLICITADO, vuelve a SOLICITADO). Permisos `PDV_PAGAR_VALE`/`PDV_PAGAR_COMPRA`/`PDV_ANULAR_EGRESO`. Los egresos descuentan de la caja del PdV y aparecen en el cierre; **NO pasan por Caja Mayor**.
- **Compra simplificada sin ítems** (`b11b379`): `Compra.simplificada`; `crear-compra-simplificada` no mueve stock/costo, solo genera CPP + cuotas + pago opcional. (Distinta del `pagar-compra-caja-dialog` del cajón.)
- **Últimas Ventas** (`cb14ed2`): menú por venta — detalle, reimprimir ticket, reimprimir pagaré (crédito, vía `get-cpc-by-venta`), cancelar (revierte stock).

### Cobro (fixes)

- **Tolerancia de redondeo con monedas con decimales** (`642bb33`/`66d2ec3`): el saldo neto se redondea a los decimales de la principal; `toleranciaRedondeoPrincipal()` = valor en principal de una unidad mínima de la moneda pagada (ej. 0,01 R$ ≈ 10,9 Gs) habilita Finalizar si el residuo es menor. Sin pagos, tolerancia 0.
- **Venta a crédito → forma de pago `CREDITO`** (`db5cc29`): reusa la FP renombrada, ya no recrea `CUENTA CORRIENTE`.
- **Resetear cantidad del buscador a 1** al agregar (`0c4af26`).

### Login por QR (desktop + PWA)

Device Authorization Grant. `DeviceAuthCode` (`device_auth_codes`: `deviceCode` unique, `estado` PENDING/APPROVED/CONSUMED, `expiresAt` ~3min). Rutas Fastify `electron/server/device-auth-routes.ts`: `POST /api/auth/device/start` (público, genera QR), `/approve` (autenticado, aprueba con el JWT del que escanea), `/token` (poll, emite tokens + `LoginSession`, un solo uso). Desktop: `qr-login-dialog` (pollea `api.deviceToken` vía `httpFetch` → requiere nodo server accesible) → `AuthService.applyExternalSession`. PWA: páginas `vincular-dispositivo`/`aprobar-dispositivo`.
