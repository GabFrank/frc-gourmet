# Capítulo 5 — Recetas, sabores y variaciones

Sistema clave para productos elaborados (cocinados). Permite calcular costo automáticamente, controlar stock por ingrediente, y manejar productos con N sabores × M tamaños.

## Receta = lista de ingredientes con cantidades

Una **Receta** es la fórmula de un producto. Define qué ingredientes (otros productos tipo `RETAIL_INGREDIENTE` o `ELABORADO_SIN_VARIACION`) y en qué cantidades.

A partir de la receta, el sistema:
- Calcula **costo automático** (suma de costos × cantidades).
- Descuenta **stock de ingredientes** al vender (si el producto no controla stock propio).
- Permite **personalizar la venta**: cliente pide sin tomate, intercambia un ingrediente, agrega adicionales.

## Crear una receta

### Para producto ELABORADO_SIN_VARIACION (1 receta única)

**Menu → Productos → Productos → tu producto → tab "Receta"**.

1. Click "Crear receta" (si no existe).
2. Ingresar:
   - **Nombre**: ej "Lasaña de Carne".
   - **Categoría**: ej "PASTAS".
   - **Subcategoría**: ej "LASAÑAS".
   - **Descripción**: opcional.
   - **Rendimiento**: cuántas unidades produce la receta. Ej: 1 (una lasaña por receta).
   - **Unidad de rendimiento**: UNIDADES, PORCIONES, KG, etc.
3. Guardar.

### Agregar ingredientes

Click "Agregar ingrediente":

- **Ingrediente**: seleccionar producto (debe ser `RETAIL_INGREDIENTE` o `ELABORADO_SIN_VARIACION`).
- **Cantidad**.
- **Unidad**: GRAMOS, KILOGRAMOS, ML, LITROS, UNIDADES.
- **Unidad original** (opcional): si querés mostrar al chef "250 gramos" pero el cálculo internamente usa "0.250 kg".
- **Es extra**: marca si es ingrediente adicional.
- **Es opcional**: el cliente puede declinarlo en venta.
- **Es cambiable**: el cliente puede sustituirlo (ver intercambiables).
- **Es ingrediente base**: parte fundamental del sabor.
- **Porcentaje de aprovechamiento**: para mermas (default 100%).

⚠️ **El porcentaje de aprovechamiento NO afecta el costo** actualmente — solo se almacena para futuro uso.

### Recalcular costo

Click **"Recalcular costo"** (botón en el editor):

El sistema:
1. Para cada ingrediente, busca el último PrecioCosto activo (o el `costoCalculado` de la sub-receta si es elaborado).
2. Multiplica costo × cantidad.
3. Suma todo → `Receta.costoCalculado`.
4. Crea PrecioCosto con `fuente=AJUSTE_RECETA` automáticamente.

**Cuándo correrlo**:
- Después de agregar/editar ingredientes.
- Después de actualizar precio de costo de un ingrediente (no es automático en cascada).

## Sabores (ELABORADO_CON_VARIACION)

Para una pizza con 3 sabores y 2 tamaños, no creás una receta — creás **6 variaciones**.

### Pre-requisito: crear el producto

1. Producto tipo **ELABORADO_CON_VARIACION**.
2. Crear 2 presentaciones: "Mediana" (cantidad=1), "Grande" (cantidad=1).

### Crear sabores

**Tab "Sabores"** del producto.

Por cada sabor:
1. Click "Nuevo sabor".
2. Ingresar:
   - **Nombre**: ej "Calabresa".
   - **Categoría**: ej "PIZZA".
   - **Descripción**: opcional.
3. Guardar.

**Al guardar el sabor**, el sistema **automáticamente crea**:
- Una **RecetaPresentacion** por cada presentación del producto. Ej:
  - "PIZZA MEDIANA CALABRESA" + Receta vacía.
  - "PIZZA GRANDE CALABRESA" + Receta vacía.

### Configurar cada variación

Por cada **RecetaPresentacion** generada:

1. Click "Gestionar receta" en la variación específica.
2. Agregar ingredientes a esa Receta única.
3. Recalcular costo.

**Importante**: cada variación tiene **su propia receta**. La pizza Grande puede tener ingredientes que la Mediana no tenga, o cantidades NO proporcionales.

### Repetir para cada sabor

3 sabores × 2 presentaciones = **6 variaciones**, cada una con su propia receta.

### Asignar precio a cada variación

Cada variación tiene su propio PrecioVenta:

**Tab "Precios"** del producto, sección "Por variación":
- "PIZZA MEDIANA CALABRESA" → $30.000 PYG.
- "PIZZA GRANDE CALABRESA" → $50.000 PYG.
- "PIZZA MEDIANA PEPPERONI" → $32.000 PYG.
- ...

## Adicionales

Items extras vendibles sobre el producto:
- "Extra queso" (+$5.000)
- "Jamón" (+$3.000)
- "Aceitunas" (+$2.000)

### Crear adicional

**Menu → Productos → Adicionales → "Nuevo adicional"**.

- **Nombre**.
- **Precio base**.
- **Categoría**: "Carnes", "Lácteos", "Salsas".
- **Receta** (opcional): si querés que descuente stock de ingredientes al venderlo. Ej: "Extra queso = 50g de mozzarella".

### Vincular adicional a receta con precio personalizado

Mismo adicional, distintos precios según la receta:

**En el editor de receta**, sección "Adicionales disponibles" → "Vincular adicional con precio":
- Adicional: "Extra Queso".
- Receta: "Pizza Grande".
- Precio personalizado: $4.500 (en lugar del $5.000 base).
- Cantidad y unidad.

Esto es útil cuando "Extra queso" cuesta diferente en una pizza grande vs mediana.

## Intercambiables (sustitución)

Si un ingrediente es **`esCambiable=true`**, podés definir alternativas:

**En el ingrediente de la receta** → click "Intercambiables":
- "Mozzarella" (default) → Reemplazos:
  - "Queso de Cabra" (+$2.000)
  - "Queso Provolone" (+$1.500)
  - "Queso Vegano" (+$3.000)

En el PdV, al personalizar el producto, el cliente puede elegir cualquiera de las alternativas.

## Observaciones

Notas reutilizables (no específicas de receta):
- "BIEN COCIDO", "POCO COCIDO".
- "SIN SAL", "MUCHO PICANTE".

Se gestionan y vinculan desde el tab "Observaciones" del producto (UI parcial), y aparecen como chips en el PdV al personalizar.

## Adicionales de adicionales

Si un Adicional tiene receta propia (campo "Receta" del Adicional), su receta tiene sus propios ingredientes y costo. Al vender ese adicional, el sistema descuenta los ingredientes de la receta del adicional, no el adicional como unidad.

Ejemplo: "Extra Cheddar" con receta "50g Queso Cheddar":
- Vender 1 Extra Cheddar → descuenta 50g de queso cheddar del stock.

## Cálculo de stock al vender

Al concluir una venta, el sistema descuenta automáticamente según el tipo de producto:

| Tipo | Cómo descuenta |
|---|---|
| RETAIL | Cantidad × presentacion.cantidad de la unidad base |
| RETAIL_INGREDIENTE | Igual |
| ELABORADO_SIN_VARIACION | Recorre los ingredientes de la receta y los descuenta proporcionalmente |
| ELABORADO_CON_VARIACION | Busca la RecetaPresentacion correspondiente, descuenta sus ingredientes |
| COMBO | Itera componentes y aplica recursivamente (max 2 niveles) |

**Personalizaciones respetadas**:
- Ingrediente removido → no descuenta.
- Ingrediente intercambiado → descuenta el reemplazo.
- Adicional con receta → descuenta sus ingredientes.

## Lista de recetas

**Menu → Productos → Recetas**.

Filtros:
- Por categoría / subcategoría.
- Búsqueda por nombre.

Acciones:
- Ver / Editar.
- Recalcular costo.
- Eliminar (soft delete — preserva historia).

## Casos comunes

### "Tengo una pizza Margherita Grande con receta. Quiero la Mediana también"

1. Crear presentación "Mediana" del producto Pizza.
2. Editar el sabor "Margherita". Al guardar (incluso sin cambios), el sistema **auto-genera** la variación "PIZZA MEDIANA MARGHERITA" con receta vacía.
3. Ir a esa variación → click "Gestionar receta" → copiar/agregar ingredientes (cantidades reducidas).
4. Recalcular costo.
5. Asignar precio en PrecioVenta.

### "Quiero compartir ingredientes entre 2 sabores"

No hay copia automática (TODO). Hay que cargar ingredientes manualmente en cada variación.

### "El costo de un ingrediente cambió. Las recetas no se actualizan"

El sistema **no recalcula en cascada**. Hay que:
1. Ir a cada receta que usa ese ingrediente.
2. Click "Recalcular costo".

(Mejora futura: trigger automático.)

### "Quiero vender un Combo Pizza + Bebida con descuento"

El Combo es un producto aparte (no una receta). Capítulo 4, Tab Combo.

### "El cliente quiere su pizza mitad y mitad"

PdV → seleccionar pizza → dialog `Seleccionar variación` → tamaño → marcar 2 sabores → cada sabor recibe `proporcion=0.5`.

→ Cobertura completa en [06-pdv-uso-diario.md](06-pdv-uso-diario.md).

## Limitaciones conocidas

- ⚠️ No hay validación que impida usar productos sin `esIngrediente=true` como ingredientes.
- ⚠️ Recálculo de costo en cascada manual (cambia un costo, recalcular todas las recetas que lo usan).
- ⚠️ No hay UI para **producción** (registrar cuánto se cocinó). Las entidades existen pero falta pantalla.
- ⚠️ Importación masiva de recetas no existe (manual una por una).

---

**Próximo capítulo →** [06 — PdV: uso diario](06-pdv-uso-diario.md)
