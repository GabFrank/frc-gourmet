# Dominio: Recetas, Sabores y Variaciones

El sistema más complejo del proyecto. Permite que un producto tenga **N sabores × M presentaciones**, cada combinación con su propia receta de ingredientes y precio.

## El refactor 2024-07-29

Documentado en `docs/legacy/2024-07-29-REFACTOR_RECETAS_POR_VARIACION.md`.

**Antes** (modelo viejo):
```
Producto Pizza
├─ Sabor Calabresa
│   └─ Receta base (Pizza Calabresa)
│       └─ multiplicador por tamaño:
│            Mediana: ×1.0
│            Grande:  ×1.5
└─ Sabor Pepperoni
    └─ Receta base
        └─ multiplicador...
```
Limitación: una pizza grande de calabresa no podía tener ingredientes diferentes (no proporcionales) a la mediana.

**Ahora** (modelo actual):
```
Producto Pizza (tipo ELABORADO_CON_VARIACION)
├─ Sabor Calabresa
│   ├─ RecetaPresentacion (Pizza Calabresa Mediana) → Receta única
│   └─ RecetaPresentacion (Pizza Calabresa Grande)  → Receta única
└─ Sabor Pepperoni
    ├─ RecetaPresentacion (Pizza Pepperoni Mediana) → Receta única
    └─ RecetaPresentacion (Pizza Pepperoni Grande)  → Receta única
```

Cada combinación `(presentación, sabor)` es una `RecetaPresentacion` con:
- Su propio nombre generado y SKU
- Su propio costo calculado (cache `costo_calculado`)
- Sus propios precios (`PrecioVenta` con `receta_presentacion_id`)
- Una `Receta` asociada (FK `receta_id`)

> ✅ **Actualizado 2026-07-11 (refactor "cada variación su propia receta").** Antes, `generarVariacionesParaProducto` creaba **una** `Receta` base por sabor y la compartía entre todos los tamaños (editar "grande" cambiaba "mediano" — bug bloqueante). **Ahora ya NO se comparte:** `create-sabor` no crea receta base, y `generarVariacionesParaProducto(queryRunner, productoId, saborId)` (la firma **perdió** el parámetro `recetaId`) crea **una `Receta` propia por cada presentación** y la enlaza a su `RecetaPresentacion`. Cada combinación `(presentación, sabor)` tiene ingredientes y costo independientes por tamaño.
>
> `RecetaPresentacion.receta` sigue siendo `@ManyToOne` (`eager:true`, sin cascade) — la cardinalidad permite compartir a nivel de modelo, pero el alta ya no lo hace. Para datos viejos que aún comparten receta existe el handler de reparación **`reparar-recetas-compartidas`** (ver abajo). `delete-sabor` sigue deduplicando `receta_id` con un `Set` antes de borrar (defensivo, protege datos previos al refactor).

## Entidades

### Receta

`src/app/database/entities/productos/receta.entity.ts`:

```typescript
@Entity('receta')
class Receta extends BaseModel {
  @Index() categoria?: string;       // 'PIZZA CALABRESA'
  subcategoria?: string;             // 'GRANDE', 'MEDIANA'
  nombre: string;
  descripcion?: string;
  costoCalculado: decimal(10,2);     // CACHE — actualizado por 'calcular-costo-receta'
  rendimiento: decimal(10,4);        // cantidad producida (default 1)
  unidadRendimiento: string;         // 'UNIDADES', 'PORCIONES' (default 'UNIDADES')
  unidadRendimientoOriginal?: string;
  tiempoPreparo?: int;               // minutos
  imageUrl?: string;                 // app://producto-images/<file>
  activo: boolean;

  @OneToOne 'Producto' producto;     // ⚠️ DEPRECADO — FK producto_id, SIEMPRE NULL. Ver abajo.
  productoVinculado?: {id,nombre}|null; // VIRTUAL — el producto real, por producto.receta_id
  @OneToOne 'Adicional' adicional;   // si la receta es de un Adicional complejo
  @OneToMany RecetaIngrediente[] ingredientes;
  @OneToMany 'RecetaFase' fases;     // fases del modo de preparo (ordenadas)
  @OneToMany 'RecetaMaterial' materiales; // materiales/utensilios
  @OneToMany PrecioVenta[];
  @OneToMany PrecioCosto[];
  @ManyToMany 'Adicional' adicionalesDisponibles; // tabla receta_adicional
  @OneToMany RecetaAdicionalVinculacion[] adicionalesVinculados; // con precio por receta
  @ManyToOne 'Producto' productoVariacion; // ELABORADO_CON_VARIACION, FK producto_variacion_id
  @OneToOne 'RecetaPresentacion' variacion; // relación inversa hacia su variación
}
```

(Entidades nuevas relacionadas: `RecetaFase` / `RecetaFaseIngrediente` para el modo de preparo por pasos, y `RecetaMaterial` para utensilios — ver archivos homónimos en `entities/productos/`.)

### ⚠️ Las cuatro FKs de "dueño" de una Receta (leer antes de tocar el vínculo)

Una `Receta` puede pertenecer a cuatro cosas distintas. Confundirlas fue la causa
de un bug de larga data (arreglado 2026-08, ver más abajo):

| Dueño | Columna | UNIQUE | ¿La escribe la app? |
|---|---|---|---|
| **Producto simple** (`ELABORADO_SIN_VARIACION`) | `producto.receta_id` | **sí** | **SÍ — fuente de verdad** |
| Adicional complejo | `adicional.receta_id` | sí | sí |
| Variación sabor × tamaño | `receta_presentacion.receta_id` | no | sí (una receta por variación) |
| Producto con variaciones | `receta.producto_variacion_id` | no | sólo lectura en handlers |
| ~~Legacy 1:1~~ | ~~`receta.producto_id`~~ | sí | **NO — DEPRECADA, siempre NULL** |

**`receta.producto_id` está DEPRECADA.** Nació en el refactor de 2026-03 junto con
`producto.receta_id`: quedó un 1:1 con **dos owning sides**, cada uno con su propia
columna, y sólo prosperó `producto.receta_id`. Ningún handler la escribe.

- Para "el producto de esta receta" usar la **virtual `receta.productoVinculado`**,
  que resuelven `get-receta` y `get-recetas-with-filters` por `producto.receta_id`
  (una query por lote, sin N+1). **Nunca** leer `receta.producto`.
- Para las recetas de un producto **con** variaciones, usar `productoVariacion`.
- La columna no se borra: las migraciones del proyecto son aditivas.

### Vincular / desvincular una receta a un producto simple

Se hace **sólo** con estos handlers, nunca con `update-producto` + `update-receta`
encadenados (dos writes a dos tablas con dos UNIQUE → estado a medio aplicar):

- **`vincular-receta-a-producto(productoId, recetaId)`** — transaccional. Valida que
  la receta no sea de otro producto, de un adicional ni de una variación, y devuelve
  un mensaje legible en vez del `UNIQUE constraint failed` crudo del driver.
- **`desvincular-receta-de-producto(productoId)`** — pone `producto.receta_id` en
  `null`. La receta NO se borra: queda libre.
- **`get-recetas-asignables({productoId, search, activo, page, pageSize})`** — las
  recetas ofrecibles en "Buscar Receta". Filtra en SQL por las cuatro FKs de arriba,
  con búsqueda y paginación server-side. Excluye del chequeo al `productoId` actual
  para que el producto pueda re-elegir su propia receta.

Ambos mutadores llevan `ensurePermission('PRODUCTOS_GESTIONAR')`: es la tabla que
escriben, y `/api/rpc` es default-allow.

⚠️ **Desvincular es destructivo**: el producto resuelve su precio de venta
(`productos.handler.ts`, `ventas.handler.ts`) y su descuento de stock por la receta
vinculada. La UI lo advierte en el diálogo de confirmación.

### RecetaIngrediente

`receta-ingrediente.entity.ts`:

| Campo | Tipo | Descripción |
|---|---|---|
| `cantidad` | decimal(10,4), nullable | Cantidad usada |
| `unidad` | varchar(50), nullable | GRAMOS, KILOGRAMOS, ML, LITROS, UNIDADES |
| `descripcion` | text, nullable | Ítem solo-descripción sin ingrediente vinculado todavía (ej. "KIT DE CARNES"). Al menos uno de `ingrediente` o `descripcion` debe estar presente. No aporta costo. |
| `unidadOriginal` | varchar(50), nullable | Unidad que eligió el usuario (para conversión) |
| `costoUnitario` | decimal(10,2) | Calculado |
| `costoTotal` | decimal(10,2) | `costoUnitario × cantidad` |
| `esExtra` | boolean | Ingrediente adicional |
| `esOpcional` | boolean | Puede omitirse |
| `esCambiable` | boolean | Puede sustituirse |
| `costoExtra` | decimal(10,2), nullable | Costo de la opción extra |
| `porcentajeAprovechamiento` | decimal(5,2), default 100 | Para mermas. **No afecta costo** actualmente — sólo se almacena. |
| `esIngredienteBase` | boolean | Forma parte del sabor base |
| `receta_id` | FK | |
| `ingrediente_id` | FK, **nullable** | Producto (RETAIL_INGREDIENTE o ELABORADO_SIN_VARIACION). Nullable: puede ser un ítem solo-descripción |
| `reemplazoDefault_id` | FK, nullable (col `reemplazo_default_id`) | Sustituto por defecto |

> ⚠️ **Para mostrar el nombre de un ingrediente SIEMPRE hay que hacer
> `ingrediente?.nombre || descripcion`.** `ingrediente_id` es nullable a
> propósito (ítem solo-descripción), así que leer sólo `ingrediente.nombre` deja
> el nombre en blanco. El backend ya lo hace bien en la comanda
> (`documentos-tickets.handler.ts`) y en el KDS (`kds.handler.ts`); al frontend
> le faltaba en 6 lugares y se arregló el 2026-08-17 — el síntoma era un chip
> "OPCIONALES" sin texto en el diálogo de personalización y un chip `SIN` sin
> nombre en el PdV, mientras la comanda impresa sí decía `SIN ACEITUNAS`.

### RecetaIngredienteIntercambiable

`receta-ingrediente-intercambiable.entity.ts`:
Permite definir alternativas a un ingrediente:

```
RecetaIngrediente: Mozzarella (50g)
  └─ Intercambiables:
       ├─ Queso Cheddar (+$2)
       ├─ Queso Provolone (+$1.5)
       └─ Queso Vegano (+$3)
```

Campos: `receta_ingrediente_id`, `ingrediente_opcion_id` (Producto), `costoExtra`, `activo`.

### Sabor

`sabor.entity.ts`:

```typescript
@Entity('sabor')
class Sabor extends BaseModel {
  nombre: string;        // 'CALABRESA', 'PEPPERONI'
  categoria: string;     // 'PIZZA', 'HAMBURGUESA' (NOT nullable)
  descripcion?: string;
  activo: boolean;
  imageUrl?: string;     // app://producto-images/<file>
  producto_id: FK;       // NOT nullable. Solo ELABORADO_CON_VARIACION
}
```

**Importante**: post-refactor, `Sabor` **no tiene relación directa con Receta**. La conexión es indirecta vía `RecetaPresentacion`.

### RecetaPresentacion (corazón de la arquitectura)

`receta-presentacion.entity.ts`:

```typescript
@Entity('receta_presentacion')
@Index(['presentacion', 'sabor'], { unique: true })
class RecetaPresentacion extends BaseModel {
  nombre_generado: string;          // 'PIZZA GRANDE CALABRESA'
  sku?: string;                     // nullable, unique. 'PIZ-CAL-G'
  precio_ajuste?: decimal(10,2);    // ajuste al precio base
  costo_calculado: decimal(10,2);   // CACHE (default 0)
  activo: boolean;

  @ManyToOne 'Receta', { nullable: false, eager: true } receta;  // FK receta_id, eager (SIN cascade)
  @ManyToOne 'Presentacion' presentacion;  // FK presentacion_id, nullable:false
  @ManyToOne 'Sabor' sabor;                // FK sabor_id, nullable:false
  @OneToMany 'PrecioVenta' preciosVenta;
}
```

**`@ManyToOne` (NO OneToOne)**: a nivel de modelo varias variaciones *podrían* compartir la misma `Receta`, pero **desde el refactor 2026-07-11 el alta crea una receta por variación** (ya no se comparte — ver el aviso al inicio del doc).

**`eager: true`** carga la receta automáticamente cada vez que cargás `RecetaPresentacion`. **Costoso** si hay muchas variaciones — considerar lazy en performance hot paths.

⚠️ **No hay `cascade`**: borrar la variación NO borra automáticamente su receta. El borrado se maneja manualmente en el handler (`delete-sabor` borra primero las `RecetaPresentacion` y luego las recetas deduplicadas + sus ingredientes).

### Adicional

`adicional.entity.ts`:

```typescript
class Adicional extends BaseModel {
  nombre: string;            // 'Extra Queso', 'Jamón'
  precioBase: decimal(10,2); // Precio base
  activo: boolean;
  categoria?: string;        // 'Carnes', 'Lácteos', 'Salsas'

  @OneToOne 'Receta' receta;  // OPCIONAL — adicional con receta propia (control de stock)
  @ManyToMany 'Receta' recetas;  // disponibilidad general
  @OneToMany RecetaAdicionalVinculacion[]; // precio personalizado por receta
}
```

**Adicional simple** (sin receta): solo precio. Ej: "Mermelada extra".

**Adicional complejo** (con receta): tiene ingredientes y costo calculado. Ej: "Extra Cheddar = 50g de queso cheddar".

### RecetaAdicionalVinculacion

```typescript
class RecetaAdicionalVinculacion extends BaseModel {
  precioAdicional: decimal(10,2);  // Precio específico para esta receta
  cantidad: decimal(10,4);         // Cantidad
  unidad: varchar(50);             // 'UNIDADES'
  unidadOriginal?: varchar(50);
  receta_id: FK;
  adicional_id: FK;
}
```

**Diferencia con tabla M:N `receta_adicional`**:
- `receta_adicional`: disponibilidad general (este adicional CAN ser ofrecido en esta receta).
- `RecetaAdicionalVinculacion`: vinculación CON precio + cantidad específico (es ofrecido a este precio).

Caso de uso:
```
Adicional: "Extra Queso"
├─ Vinculado a Pizza Grande:    $2.50
├─ Vinculado a Hamburguesa:     $2.00
└─ Vinculado a Pasta:           $1.50
```

## Algoritmo: cálculo de costo de receta

Canal IPC `calcular-costo-receta` (`recetas.handler.ts`, ~línea 588) → función interna `calcularCostoReceta` (~líneas 30-223). También existe `actualizar-costo-receta`, `calcular-costo-ingrediente`, `recalcular-costo-variacion`, `recalculate-all-recipe-costs`:

```
calcularCostoReceta(recetaId):
  receta = obtener(recetaId)
  ingredientes = obtener_ingredientes(recetaId, activos=true)
  
  costoTotal = 0
  
  para cada ingrediente:
    // Paso 1: Costo unitario del ingrediente (Producto)
    si ingrediente.tipo == ELABORADO_SIN_VARIACION:
      recetaIngrediente = obtener_receta_del_producto(ingrediente.id)
      si recetaIngrediente.costoCalculado > 0:
        costoUnitario = recetaIngrediente.costoCalculado
      sino:
        costoUnitario = obtener_ultimo_precio_costo(ingrediente)
    sino:
      costoUnitario = obtener_ultimo_precio_costo(ingrediente)
    
    // Paso 2: Conversión de unidades (si unidadOriginal != unidad)
    cantidadNormalizada = convertir(cantidad, unidadOriginal → unidad)
    costoIngrediente = costoUnitario × cantidadNormalizada
    
    // Paso 3: porcentajeAprovechamiento NO afecta costo (solo se almacena)
    
    ingrediente.costoUnitario = costoUnitario
    ingrediente.costoTotal = costoIngrediente
    costoTotal += costoIngrediente
  
  // Paso 4: Persistir
  receta.costoCalculado = costoTotal
  guardar(receta)
  
  // Paso 5: Crear PrecioCosto AJUSTE_RECETA si cambió > 0.01
  si monedaPrincipal existe:
    precioCostoAnterior = obtener_ultimo_precio_costo(receta, fuente=AJUSTE_RECETA)
    si precio cambió:
      crear_precio_costo(receta, valor=costoTotal, fuente=AJUSTE_RECETA, fecha=hoy)
  
  return costoTotal
```

**Conversión de unidades**: `unidadConvertir.utils.ts` o lógica inline. Soporta:
- KILOGRAMO ↔ GRAMOS (×1000)
- LITRO ↔ MILILITROS (×1000)
- METRO ↔ CENTIMETROS (×100)
- LIBRA ↔ ONZA (×16) (uso raro)

## Algoritmo: generación automática de variaciones

Cuando se crea un Sabor nuevo (desde `producto-sabores.component`):

1. `create-sabor` (**`recetas.handler.ts`, ~línea 1527**, NO sabores.handler.ts) crea el `Sabor` vinculado al producto (todo en una transacción con `ensurePermission('SABORES_GESTIONAR')`).
2. Crea **una sola** `Receta` base para ese sabor (`<producto> <sabor>`, rendimiento 1, costo 0). El alta NO copia ingredientes de otro sabor.
3. Llama `generarVariacionesParaProducto`: por cada `Presentacion` del producto crea un `RecetaPresentacion` (si no existe ya para esa presentación+sabor) con:
   - `nombre_generado = generarNombreVariacion(producto.nombre, presentacion.nombre, producto.nombre)`
   - `sku = generarSKU(producto.nombre, producto.nombre, presentacion.nombre)`
   - `receta_id` = **la misma** receta base creada en el paso 2 (todas las variaciones del sabor comparten esa receta).

Funciones helper: `generarVariacionesParaProducto`, `generarNombreVariacion`, `generarSKU` viven en **`recetas.handler.ts`** (~líneas 226-280), NO en `receta-presentacion.handler.ts`.

## ⚠️ Trampa: handlers en `recetas.handler.ts`, NO en `receta-presentacion.handler.ts` ni `sabores.handler.ts`

Tanto `receta-presentacion.handler.ts` (556 líneas) como `sabores.handler.ts` (437 líneas) existen pero **NUNCA se registran en main.ts**. Los handlers de recetas + sabores + variaciones que sí se usan están todos dentro de `recetas.handler.ts` (registrado como `registerRecetasHandlers`, con el comentario "Recetas + Sabores + Variaciones (unificado)"). (`project_atajos_sistema`)

Si encontrás un canal IPC que dice no existir, chequear `recetas.handler.ts` primero (es el único de estos tres que se registra).

## Servicios Angular

`src/app/services/`:
- `RecetasService` — CRUD recetas + cálculo costos.
- `SaboresService` — CRUD sabores via IPC.
- `SaboresVariacionesService` — estado complejo (BehaviorSubjects) sabores y variaciones.
- `EliminarIngredienteService` — orquesta eliminación de ingredientes en multi-variación.

## Pages

`src/app/pages/gestion-recetas/` (NgModule `GestionRecetasModule`):
- `list-recetas/` — paginada con costos.
- `gestion-recetas/` — editor (ingredientes, adicionales, cálculo costos, multi-variación).
- `list-adicionales/` — lista con filtros.
- `receta-detalle/` — vista detalle.

Dialogs:
- `ingrediente-dialog` — agregar/editar ingrediente con filtros.
- `create-edit-adicional-dialog` — CRUD adicional.
- `vincular-receta-adicional-dialog` — vincular adicional a receta con precio.
- `receta-dialog` — selección de receta.
- `confirmar-agregar-ingrediente-dialog` — asistente.
- `gestionar-ingrediente-multi-variacion-dialog` — para variaciones.

`src/app/pages/gestion-sabores/`:
- `list-sabores/`
- `gestion-sabor/`
- `create-edit-sabor-dialog/`
- `ingrediente-sabor-dialog/`

`src/app/pages/productos/gestionar-producto/components/producto-sabores/` — gestión de sabores y variaciones desde el editor de producto. Incluye:
- Listado de sabores
- Botón "Gestionar receta" en cada **variación** (no en sabor) — post-refactor.
- Sincronización con `SaboresVariacionesService`.

## Casos de uso end-to-end

### Crear pizza con 2 sabores y 2 tamaños

1. Crear Producto "Pizza" tipo ELABORADO_CON_VARIACION, `unidadBase=UNIDAD`.
2. Crear Presentaciones: "Mediana" (cantidad=1), "Grande" (cantidad=1).
3. Crear Sabor "Calabresa":
   - Crea Sabor.
   - Crea Receta "Pizza Calabresa Base".
   - Auto-genera RecetaPresentacion: "PIZZA MEDIANA CALABRESA" + "PIZZA GRANDE CALABRESA", cada uno con su propia Receta inicial vacía o copiada.
4. Crear Sabor "Pepperoni" — análogo. Total: 4 RecetaPresentacion.
5. Para cada variación, agregar ingredientes a su Receta única:
   - "PIZZA MEDIANA CALABRESA": Masa 200g, Salsa 80g, Mozzarella 100g, Calabresa 60g.
   - "PIZZA GRANDE CALABRESA": Masa 350g, Salsa 130g, Mozzarella 180g, Calabresa 100g.
   - (Idem Pepperoni — cantidades pueden no ser proporcionales).
6. Recalcular costo en cada variación.
7. Crear PrecioVenta por variación: `recetaPresentacion_id` apunta a la variación, `valor` = precio de venta.

### Vender pizza con 2 sabores

1. PdV → buscar "Pizza" → click → abre `seleccionar-variacion-dialog` (3 pasos: tamaño → sabores → personalización).
2. User elige Tamaño Grande → muestra sabores disponibles para esa presentación → user selecciona Calabresa + Pepperoni (max según `PdvConfig.pizzaMaxSabores`).
3. Cálculo de precio: según `PdvConfig.pizzaEstrategiaPrecio`:
   - `MAYOR_PRECIO`: el más caro entre los sabores.
   - `PROMEDIO`: promedio.
4. Personalización: `PersonalizarProductoDialog` aparece con ingredientes de cada sabor (puede modificarlos por sabor independientemente).
5. Confirmar → `addVariacionItem`:
   - Crea `VentaItem` con `recetaPresentacion_id` = la variación principal (la del sabor más representativo o la primera).
   - Crea N `VentaItemSabor` (uno por sabor, con `proporcion=0.5` cada uno).
   - Crea `VentaItemAdicional`, `VentaItemIngredienteModificacion`, `VentaItemObservacion` según selección — cada uno opcionalmente vinculado a `ventaItemSabor_id` específico.

→ Detalles de venta: [ventas-pdv.md](ventas-pdv.md).

---

## Módulo Gestión de Sabores (2026-07)

Listado **global** de sabores (fuera del editor de producto), en `src/app/pages/gestion-sabores/`.

- **Handler `get-all-sabores`** (`recetas.handler.ts`): filtros `{productoId, categoria, activo, texto}`, join a `producto`, y **conteo de variaciones por sabor** (`variacionesCount`, subconsulta sobre `receta_presentacion.sabor_id`). Devuelve DTO plano. Exige `ensurePermission('SABORES_GESTIONAR')` en las mutaciones; `create-sabor` valida `productoId` entero (guard contra `findOne({id: undefined})`).
- **Componentes** (estructura real): `list-sabores/` (lista paginada client-side, filtros con botón, toggle activo, crear/editar reusando `SaborDialogComponent` de productos, botón **"Reparar recetas compartidas"**), `gestion-sabor/`, y bajo `dialogs/`: `create-edit-sabor-dialog/`, `ingrediente-sabor-dialog/`, y **`variaciones-sabor-dialog/`** (nuevo).
- **`variaciones-sabor-dialog`**: carga variaciones del producto filtradas por sabor; por variación permite gestionar precio (`PrecioVentaDialog` con `recetaPresentacionId`), editar variación, **gestionar receta** (abre `GestionRecetasComponent` en tab con `recetaId = v.receta.id` — receta propia por tamaño), toggle activo, y **generar variaciones faltantes** (`generate-variaciones-faltantes`).

## Precio de variación por `receta_presentacion_id` (`454831c`)

El precio de una variación vive en **`PrecioVenta.receta_presentacion_id`** (4ª FK "flexible" de `PrecioVenta`, junto a presentacion/receta/producto), NO en `receta_id`. Antes, como los tamaños compartían receta, mostraban el mismo precio.

- **Lectura**: `get-variaciones-by-producto` y `get-variaciones-by-producto-and-presentacion` consultan `pv.receta_presentacion_id = :rpId AND pv.activo`, ordenan `principal DESC`, exponen `preciosVenta` + `precioPrincipal` por variación.
- **Escritura**: `create-precio-venta`/`update-precio-venta` aceptan `recetaPresentacionId` como 4ª rama; el flag `principal` se acota a esa `RecetaPresentacion`.
- **Frontend**: `precio-venta-dialog`, `producto-sabores`, `variacion-dialog` y `variaciones-sabor-dialog` usan `relationField: 'recetaPresentacionId'`. Alinea gestión + PdV + storefront.

## Reparación de recetas compartidas (`d9cbba3`)

**No es una migración** (por el riesgo de un deep-clone corriendo en cada arranque): es un handler de mantenimiento **manual/opt-in**.

- Handler IPC **`reparar-recetas-compartidas`** (`ensurePermission('SABORES_GESTIONAR')`) → `desduplicarRecetasCompartidas` en transacción. Botón en `list-sabores` con confirmación.
- Lógica en `electron/utils/receta-clone.utils.ts`: agrupa `receta_presentacion` por `receta_id` con `HAVING COUNT(*)>1`; la primera variación (por `id ASC`) conserva la receta original y las demás reciben un **clon** (re-apuntan su `receta_id`). Idempotente.
- `clonarReceta(manager, recetaId)`: **deep-clone DB-agnóstico** (vía EntityManager, no SQL crudo) del grafo completo — escalares + M2M `adicionalesDisponibles`, ingredientes (+intercambiables), fases (+fase-ingredientes con doble remapeo), materiales y `RecetaAdicionalVinculacion`.
- Tests: `npm run test:reparar-recetas` (7/7) y `npm run test:receta-por-variacion` (Fase A, 4/4).

> **Nota histórica:** el fix `14253af` corrigió handlers que referenciaban un `Receta.sabor` inexistente; el modelo real es `Sabor → RecetaPresentacion → Receta` (Sabor no tiene FK directa a Receta). El refactor "cada variación su receta" (2026-07-11) es distinto del refactor de *naming* de 2024-07-29.
