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

⚠️ **Matiz importante (verificado en código)**: `RecetaPresentacion.receta` es `@ManyToOne` (NO OneToOne) y la creación automática (`generarVariacionesParaProducto` en `recetas.handler.ts`) hace que **todas las variaciones de un mismo sabor compartan la MISMA `Receta` base** (mismo `receta_id`). Es decir, al crear un sabor se crea **una** receta y se enlaza a cada presentación. Por lo tanto, "out of the box", la pizza grande y la mediana de un sabor comparten ingredientes salvo que el flujo cree/asigne recetas distintas por variación. La flexibilidad por (presentación, sabor) existe a nivel de modelo (cada `RecetaPresentacion` puede apuntar a una receta distinta), pero el alta automática no genera una receta por variación. (Marcado para revisión humana: confirmar si la UI de variaciones asigna recetas independientes al editarlas.)

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

  @OneToOne 'Producto' producto;     // legacy 1:1 (pre-refactor) — deprecated, FK producto_id
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

**`@ManyToOne` (NO OneToOne)**: varias variaciones pueden compartir la misma `Receta` base (de hecho, el alta automática las comparte por sabor — ver más abajo).

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
