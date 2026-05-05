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
- Su propia `Receta` (ingredientes específicos)
- Su propio nombre generado y SKU
- Su propio costo calculado
- Sus propios precios

Flexibilidad total: pizza grande puede llevar más queso, otro tipo de masa, etc., independientemente de la mediana.

## Entidades

### Receta

`src/app/database/entities/productos/receta.entity.ts`:

```typescript
@Entity('recetas')
class Receta extends BaseModel {
  @Index() categoria?: string;       // 'PIZZA CALABRESA'
  subcategoria?: string;             // 'GRANDE', 'MEDIANA'
  nombre: string;
  descripcion?: string;
  costoCalculado: decimal(10,2);     // CACHE — actualizado por recalcular-costo
  rendimiento: decimal(10,4);        // cantidad producida (default 1)
  unidadRendimiento: string;         // 'UNIDADES', 'PORCIONES'
  activo: boolean;

  @OneToOne 'Producto' producto;     // legacy 1:1 (pre-refactor) — deprecated
  @OneToOne 'Adicional' adicional;   // si la receta es de un Adicional complejo
  @OneToMany RecetaIngrediente[];
  @OneToMany PrecioVenta[];
  @OneToMany PrecioCosto[];
  @ManyToMany 'Adicional' adicionales;  // disponibilidad general (tabla receta_adicional)
  @OneToMany RecetaAdicionalVinculacion[]; // con precio personalizado por receta
  @ManyToOne 'Producto' productoVariacion; // para ELABORADO_CON_VARIACION
  @OneToOne 'RecetaPresentacion' variacion; // post-refactor: 1:1 con su variación
}
```

### RecetaIngrediente

`receta-ingrediente.entity.ts`:

| Campo | Tipo | Descripción |
|---|---|---|
| `cantidad` | decimal(10,4) | Cantidad usada |
| `unidad` | varchar(50) | GRAMOS, KILOGRAMOS, ML, LITROS, UNIDADES |
| `unidadOriginal` | varchar(50) | Unidad que eligió el usuario (para conversión) |
| `costoUnitario` | decimal(10,2) | Calculado |
| `costoTotal` | decimal(10,2) | `costoUnitario × cantidad` |
| `esExtra` | boolean | Ingrediente adicional |
| `esOpcional` | boolean | Puede omitirse |
| `esCambiable` | boolean | Puede sustituirse |
| `costoExtra` | decimal(10,2), nullable | Costo de la opción extra |
| `porcentajeAprovechamiento` | decimal(5,2), default 100 | Para mermas. **No afecta costo** actualmente — sólo se almacena. |
| `esIngredienteBase` | boolean | Forma parte del sabor base |
| `receta_id` | FK | |
| `ingrediente_id` | FK | Producto tipo RETAIL_INGREDIENTE o ELABORADO_SIN_VARIACION |
| `reemplazoDefault_id` | FK, nullable | Sustituto por defecto |

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
class Sabor extends BaseModel {
  nombre: string;        // 'Calabresa', 'Pepperoni'
  categoria: string;     // 'PIZZA', 'HAMBURGUESA'
  descripcion?: string;
  activo: boolean;
  producto_id: FK;       // Solo ELABORADO_CON_VARIACION
}
```

**Importante**: post-refactor, `Sabor` **no tiene relación directa con Receta**. La conexión es indirecta vía `RecetaPresentacion`.

### RecetaPresentacion (corazón de la arquitectura)

`receta-presentacion.entity.ts`:

```typescript
@Entity('recetas_presentaciones')
@Index(['presentacion', 'sabor'], { unique: true })
class RecetaPresentacion extends BaseModel {
  nombre_generado: string;          // 'PIZZA GRANDE CALABRESA'
  sku: string, nullable, unique;    // 'PIZ-CAL-G'
  precio_ajuste: decimal(10,2), nullable;
  costo_calculado: decimal(10,2);   // CACHE
  activo: boolean;

  @OneToOne 'Receta', { eager: true, cascade: true } receta;  // ← eager + cascade
  @ManyToOne 'Presentacion' presentacion;
  @ManyToOne 'Sabor' sabor;
  @OneToMany 'PrecioVenta' precios;
}
```

**`eager: true`** carga la receta automáticamente cada vez que cargás `RecetaPresentacion`. **Costoso** si hay muchas variaciones — considerar lazy en performance hot paths.

**`cascade: true`**: borrar la variación borra su receta.

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

`recetas.handler.ts:24-207` (`recalcular-costo-receta`):

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
    
    // Paso 3: porcentajeAprovechamiento NO afecta costo (línea 137-138)
    
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

Cuando se crea un Sabor nuevo en `producto-sabores.component`:

1. `create-sabor` (sabores.handler.ts:38) crea el `Sabor` vinculado al producto.
2. Crea una `Receta` para ese sabor (con ingredientes copiados de un sabor base si aplica).
3. Por cada `Presentacion` activa del producto: crea un `RecetaPresentacion` con:
   - `nombre_generado = generarNombreVariacion(receta.nombre, presentacion.nombre, sabor.nombre)` → "PIZZA GRANDE CALABRESA"
   - `sku = generarSKU(receta.nombre, sabor.nombre, presentacion.nombre)` → "PIZ-CAL-G"
   - `receta_id` apuntando a la receta del sabor.

Función helper: `receta-presentacion.handler.ts:108-118` (`generarNombreVariacion`, `generarSKU`).

## ⚠️ Trampa: handlers en `recetas.handler.ts`, NO en `receta-presentacion.handler.ts`

`receta-presentacion.handler.ts` existe (556 líneas) pero **NUNCA se registra en main.ts**. Los handlers de variaciones que sí se usan están dentro de `recetas.handler.ts` (que se registra como `registerRecetasHandlers`). (`project_atajos_sistema`)

Si encontrás un canal IPC que dice no existir, chequear ambos archivos.

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
