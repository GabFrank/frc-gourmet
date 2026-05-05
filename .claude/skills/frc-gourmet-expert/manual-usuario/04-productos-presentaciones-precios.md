# Capítulo 4 — Productos, presentaciones y precios

## Pre-requisitos

Antes de crear productos, asegurate de tener:
- Monedas configuradas (capítulo 2).
- Familias y subfamilias creadas.
- Tipos de precio (al menos uno: NORMAL).

## Tipos de producto: cuál elegir

| Tipo | Cuándo usarlo | Ejemplos |
|---|---|---|
| **RETAIL** | Comprás y vendés tal cual, sin cocinar. | Coca Cola, cerveza, mantel descartable, agua mineral |
| **RETAIL_INGREDIENTE** | Comprás un insumo que NO se vende solo, se usa en recetas. | Harina, queso mozzarella en bolsa, salsa de tomate |
| **ELABORADO_SIN_VARIACION** | Producto cocinado con UNA receta. Sin opciones de tamaño/sabor. | Lasaña, Tiramisú, Empanada |
| **ELABORADO_CON_VARIACION** | Producto cocinado con N sabores × M tamaños. Cada combinación tiene su propia receta. | Pizza, Hamburguesa con varios toppings configurables |
| **COMBO** | Bundle de varios productos vendidos como uno solo. | Combo Familiar (Pizza + Gaseosa + Postre) |

## Crear un producto

**Menu → Productos → Productos → Botón "Nuevo producto"**.

Se abre un editor con tabs internas:

### Tab 1: Información General

- **Nombre** (UPPERCASE).
- **Tipo** de producto (uno de los 5 anteriores).
- **Familia** y **Subfamilia**.
- **Unidad base**: KILOGRAMO / LITRO / UNIDAD / GRAMO / etc. La medida que usás para inventario.
- **Flags**:
  - **Es vendible** (✅ default): aparece en PdV.
  - **Es comprable** (depende del tipo): aparece en buscador de compras.
  - **Controla stock**: tiene inventario.
  - **Es ingrediente**: puede usarse en recetas.
- **Stock mínimo / máximo**: para alertas (TODO).
- **Imagen** (parcialmente desactivado).

### Tab 2: Presentaciones (RETAIL / RETAIL_INGREDIENTE)

Una **presentación** es la forma en que se vende: "Botella 500ml", "Pack 6 unidades", "Caja x 24".

Cada presentación tiene:
- **Nombre**.
- **Cantidad**: en unidad base. Ej: producto en `unidadBase=ML`, presentación "500ml" → cantidad=500.
- **Principal**: la default en PdV.
- **Activo**.

Crear varias presentaciones del mismo producto:
- Coca Cola en `unidadBase=ML`:
  - "350 ml lata" → cantidad=350
  - "500 ml botella" → cantidad=500
  - "1.5 L botella" → cantidad=1500
  - "2 L botella" → cantidad=2000

### Tab 3: Códigos de barra

Por cada presentación podés agregar **N códigos de barras** (EAN-13, UPC, etc.).

- **Código**.
- **Principal** (✅ uno por presentación).
- **Activo**.

Útil cuando un producto tiene códigos antiguos + nuevos, o múltiples marcas equivalentes.

### Tab 4: Precios de Venta

Por cada presentación, agregar precios:
- **Valor**.
- **Moneda** (PYG, USD, etc.).
- **Tipo de Precio** (NORMAL, MAYORISTA).
- **Principal**: se usa por default en PdV.
- **Activo**.

Podés tener:
- Mismo producto, distintos precios por moneda.
- Mismo producto, distintos precios por tipo (NORMAL = $50, MAYORISTA = $40).
- Distintas presentaciones, distintos precios.

Total: matriz **moneda × tipoPrecio × presentación** = precios.

### Tab 5: Precios de Costo

Histórico de costos:
- **Valor** (en unidad base, no en presentación).
- **Fecha**.
- **Fuente**:
  - **COMPRA**: se generó automáticamente al finalizar una compra (promedio ponderado).
  - **MANUAL**: lo ingresaste vos.
  - **AJUSTE_RECETA**: se calculó desde una receta.
- **Activo**.

Solo **uno activo** por producto + moneda + fuente. Al cambiar el costo, el anterior se desactiva.

### Tab 6: Stock

Ver stock actual del producto + histórico de movimientos.

Movimientos:
- COMPRA (ingreso por compra).
- VENTA (egreso por venta).
- AJUSTE_POSITIVO / AJUSTE_NEGATIVO (corrección manual).
- DESCARTE (vencido, dañado).
- PRODUCCION_ENTRADA (al producir un elaborado).
- PRODUCCION_SALIDA (al usar un ingrediente en producción).

⚠️ **UI de movimientos manuales: parcialmente implementada**. Los movimientos automáticos sí funcionan.

### Tab 7: Receta (solo ELABORADO_*)

→ Ver capítulo 5.

### Tab 8: Sabores (solo ELABORADO_CON_VARIACION)

→ Ver capítulo 5.

### Tab 9: Combo (solo COMBO)

Si el producto es un Combo:

- Agregar componentes (otros productos):
  - **Producto**.
  - **Presentación** (opcional).
  - **Cantidad**: cuántas unidades del componente lleva el combo.
  - **Es opcional**: ✅ permite que el cliente decline ese componente.

Ejemplo: "Combo Familiar":
- Pizza Margherita Grande × 1 (no opcional)
- Coca 1.5L × 1 (no opcional)
- Postre del día × 1 (opcional)

### Tab 10: Observaciones

Vincular observaciones predefinidas:
- "SIN GLUTEN", "CONTIENE FRUTOS SECOS", "VEGETARIANO", etc.

Catálogo en **Menu → Productos → Observaciones** (TODO: UI parcial).

### Tab 11: Resumen

Vista read-only del producto completo.

## Familias y subfamilias

**Menu → Productos → (botón "Familias")** o desde el Dashboard.

Crear estructura jerárquica:

```
Familia: BEBIDAS
  ├─ Subfamilia: GASEOSAS
  ├─ Subfamilia: CERVEZAS
  └─ Subfamilia: JUGOS

Familia: COMIDAS
  ├─ Subfamilia: PIZZAS
  └─ Subfamilia: HAMBURGUESAS
```

Familias permiten agrupar productos. Subfamilias son sub-categorías. Sin la jerarquía no podés crear productos.

## Búsqueda y listado

**Menu → Productos → Lista de Productos**.

Filtros disponibles:
- Por familia.
- Por subfamilia.
- Por tipo (RETAIL, ELABORADO, etc.).
- Por activo.
- Búsqueda por nombre.

Acciones por fila (menú **⋮**):
- **Ver / Editar**.
- **Duplicar** (TODO).
- **Eliminar** (soft delete).

## Errores comunes

### "El precio no aparece en PdV"

- Chequeá que el precio esté **activo**.
- Verificá que tenga `tipoPrecio` y `moneda` correctos.
- Si tiene varios precios, marcá uno como **principal**.

### "Cambié el costo y no se actualizó la receta"

- El sistema usa el último PrecioCosto **activo**. Verificá que el nuevo esté activo.
- Si el producto está en una receta, esa receta debe **recalcular costo** (botón en el editor de receta).

### "No puedo agregar una presentación con cantidad 0"

- Lógicamente las presentaciones miden algo. Mínimo 0.001.

### "Producto sin esIngrediente=true puede igual ponerse en una receta"

⚠️ **Bug latente**: el sistema no valida. Si lo agregás, funcionará — pero te puede generar inconsistencias en cálculo de stock. Marcá `esIngrediente=true` si va a usarse en recetas.

## Casos comunes

### "Tengo el mismo producto en 3 tamaños"

→ Crear UN solo producto, con 3 presentaciones. Cada presentación con su propio precio.

### "El cliente compra mayorista a un precio especial"

→ Crear `TipoPrecio = MAYORISTA`. Agregar precio del producto con ese tipo. En el PdV, el cliente debe estar marcado como tipo Mayorista (ver capítulo 3) — el sistema usa el precio que coincida con su tipo.

### "Quiero vender una pizza en 3 tamaños y 5 sabores"

→ Capítulo 5: Recetas, sabores y variaciones.

---

**Próximo capítulo →** [05 — Recetas, sabores y variaciones](05-recetas-sabores-variaciones.md)
