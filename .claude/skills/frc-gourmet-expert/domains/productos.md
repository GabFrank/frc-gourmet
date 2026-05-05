# Dominio: Productos

Catálogo central. Familia → Subfamilia → Producto → Presentación + Receta + Precios + Stock.

## Jerarquía y entidades clave

```
Familia (familia)
  └─ Subfamilia (subfamilia)
       └─ Producto (producto)  ← entidad central
            ├─ Presentacion (presentacion)
            │    ├─ CodigoBarra (codigo_barra)  -- N por presentación
            │    └─ PrecioVenta (precio_venta)  -- N por presentación + moneda + tipoPrecio
            ├─ PrecioCosto (precio_costo)
            ├─ Receta (receta)  -- 1:1 (legacy) o vía RecetaPresentacion
            ├─ Sabor (sabor)  -- solo ELABORADO_CON_VARIACION
            ├─ Combo + ComboProducto -- solo COMBO
            ├─ ProductoObservacion (M:N con Observacion)
            └─ StockMovimiento (1:N)
```

## ProductoTipo (enum)

`src/app/database/entities/productos/producto-tipo.enum.ts`:

| Tipo | Vendible | Comprable | Controla stock | Ingrediente | Caso típico |
|---|:---:|:---:|:---:|:---:|---|
| **RETAIL** | ✅ | ✅ | ✅ | ❌ | Coca-Cola, Quilmes, productos terminados de reventa |
| **RETAIL_INGREDIENTE** | ❌ | ✅ | ✅ | ✅ | Harina, queso, salsas (insumos comprables que entran a recetas) |
| **ELABORADO_SIN_VARIACION** | ✅ | ❌ | ✅¹ | ❌ | Lasaña, Tiramisú, Empanada (1 receta única) |
| **ELABORADO_CON_VARIACION** | ✅ | ❌ | ❌¹ | ❌ | Pizza (varios sabores × varios tamaños) |
| **COMBO** | ✅ | ❌ | ❌¹ | ❌ | "Combo Familiar = 2 Pizzas + Gaseosa + Postre" |

¹ Stock se controla en componentes (presentaciones / ingredientes / componentes), no en el producto padre. Flag `controlaStock` se puede activar manualmente para forzar control sobre el padre.

## Entidad Producto

`src/app/database/entities/productos/producto.entity.ts`:

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | varchar 255 | UPPERCASE en BD |
| `tipo` | enum ProductoTipo | Determina UI, flujo de venta, stock |
| `unidadBase` | varchar 100, nullable | Unidad de medida base (KILOGRAMO, LITRO, UNIDAD) — usada para conversiones |
| `activo` | boolean | Soft delete |
| `esVendible` | boolean | Default true. Si false, no aparece en PdV |
| `esComprable` | boolean | Default false. Si false, no aparece en buscador de compras |
| `controlaStock` | boolean | Default true para RETAIL/RETAIL_INGREDIENTE, false para elaborados/combos |
| `esIngrediente` | boolean | Default false. Si true, disponible en recetas |
| `stockMinimo` | decimal(10,3), nullable | Para alertas |
| `stockMaximo` | decimal(10,3), nullable | Para control |
| `subfamilia_id` | FK | Categoría |
| `imageUrl` | varchar, nullable | `app://producto-images/<file>` (parcialmente desactivado) |

## Presentaciones

`Presentacion` representa cada formato/tamaño en que se vende:
- `nombre` (ej: "Botella 500ml", "Pack 6 unidades", "Grande", "Mediana")
- `cantidad` (decimal 10,3): cantidad en `unidadBase` del producto. Ej: producto "Coca Cola" en `unidadBase=ML`, presentación "500ml" → cantidad=500.
- `principal` (boolean): default por defecto en PdV.
- `producto_id` FK.

**Virtual properties** (calculadas en handlers, no persisten):
- `precioPrincipal`: el `PrecioVenta` con `principal=true`, o el primero.
- `codigoPrincipal`: el `CodigoBarra` con `principal=true`, o el primero.

## Precios

### PrecioVenta

Tabla `precios_venta`. Vinculación **flexible** (cualquiera de estas FKs):
- `presentacion_id` — para RETAIL / RETAIL_INGREDIENTE.
- `receta_id` — para ELABORADO_SIN_VARIACION.
- `producto_id` — para COMBO.
- `recetaPresentacion_id` — para ELABORADO_CON_VARIACION (cada variación con su precio).

Columnas: `valor`, `principal`, `activo`, `moneda_id`, `tipo_precio_id`.

**Multi-moneda**: cada producto puede tener precios en PYG, USD, BRL, etc.

**Multi-tipo**: a través de `TipoPrecio` (tabla en `financiero/`). Roles típicos: NORMAL, MAYORISTA, VIP.

### PrecioCosto

Tabla `precios_costo`. Multi-fuente:

```typescript
enum FuenteCosto {
  COMPRA = 'COMPRA',              // Generado al finalizar una compra (promedio ponderado)
  MANUAL = 'MANUAL',              // Ingresado manualmente
  AJUSTE_RECETA = 'AJUSTE_RECETA' // Calculado desde receta (sumatoria de ingredientes × cantidad)
}
```

Estrategia: **un PrecioCosto activo por (producto, moneda, fuente)**. Al actualizar, se desactiva el anterior (`activo=false`) y se inserta el nuevo. Permite historial.

**Costo promedio ponderado** (compras): al finalizar compra, `aplicarCostoPromedioPonderado()` en `compras.handler.ts`:
```
si stockAnterior <= 0 o sin costo previo:
  nuevoCosto = costoAgregado
sino:
  nuevoCosto = (stockAnterior × costoAnterior + cantidadAgregada × costoAgregado) / (stockAnterior + cantidadAgregada)
```

## Códigos de barra

Tabla `codigos_barra`. **N por presentación**.
- `codigo` (string, ej: EAN-13)
- `principal` (boolean): cuál usar por defecto en escaneo
- `activo`

## Combos

`Combo` (1:1 con Producto tipo COMBO) + `ComboProducto[]` (componentes):

```
Producto (tipo COMBO, "Combo Ejecutivo")
  └─ Combo
       ├─ ComboProducto: Lasaña × 1 (presentacion_id null = principal)
       ├─ ComboProducto: Coca 500ml × 1 (esOpcional=false)
       └─ ComboProducto: Postre × 1 (esOpcional=true)  ← cliente puede declinar
```

Al venderse: stock se desglosa automáticamente recursivamente (max depth 2). PdV maneja con `procesarStockVenta` en `ventas.handler.ts:1973`.

## Promociones

`Promocion` + `PromocionPresentacion`:

| Tipo | Comportamiento |
|---|---|
| DESCUENTO_PORCENTAJE | -X% sobre precio |
| DESCUENTO_MONTO | -$X fijo |
| PRODUCTO_GRATIS | Compra X, ganas Y gratis (referencia `productoAplica` y `productoGanado`) |
| COMBO_ESPECIAL | Conjunto de productos con precio especial |

⚠️ Sin UI ni motor de aplicación automática. **TODO** crítico.

## Observaciones

`Observacion`: catálogo plano de notas reutilizables (ej: "SIN GLUTEN", "CONTIENE FRUTOS SECOS", "BIEN COCIDO"). `descripcion` UNIQUE.

`ProductoObservacion`: M:N producto ↔ observación. Permite que un producto tenga "alergenos" comunes.

En venta, `VentaItemObservacion` se usa para anotar el item específico (puede vincular a una `Observacion` predefinida o tener `observacionLibre` en texto plano).

## Stock

`StockMovimiento` (registra cada cambio de stock):

| Tipo | Suma/Resta | Origen típico |
|---|:---:|---|
| COMPRA | + | finalizar compra |
| VENTA | – | cobrar venta |
| AJUSTE_POSITIVO | + | corrección manual |
| AJUSTE_NEGATIVO | – | corrección manual |
| DESCARTE | – | producto vencido/dañado |
| PRODUCCION_ENTRADA | + | producir un elaborado (entra el producto terminado) |
| PRODUCCION_SALIDA | – | producir un elaborado (sale cada ingrediente) |
| TRANSFERENCIA | (no implementado) | entre ubicaciones/almacenes |

**Stock actual**: suma de movimientos activos. Calculado on-the-fly, no se cachea.

`tipoReferencia` + `referencia`: trazabilidad bidireccional (VENTA, COMPRA, PRODUCCION, AJUSTE).

`activo`: al **anular** una venta, los movimientos asociados se marcan `activo=false` (no se borran).

## Producción

`Produccion` + `ProduccionIngrediente`. Registra fabricación de elaborados:

```
Produccion (Lasaña × 5)
  ├─ ProduccionIngrediente: Carne molida × 2500g
  ├─ ProduccionIngrediente: Pasta lasaña × 1000g
  └─ ProduccionIngrediente: Salsa de tomate × 750ml

→ Genera StockMovimiento PRODUCCION_SALIDA por cada ingrediente
→ Genera StockMovimiento PRODUCCION_ENTRADA de 5 unidades de Lasaña
```

⚠️ Sin UI dedicada. Las entidades existen, los handlers también, falta la pantalla.

## Configuración monetaria

`ConfiguracionMonetaria` y `ConversionMoneda` (en domain `productos/` por razones legacy, pero tocan el módulo financiero).

- `ConfiguracionMonetaria`: define moneda principal del sistema.
- `ConversionMoneda`: histórico de tasas (moneda_origen → moneda_destino, fecha, tasa).

Más usado: `MonedaCambio` en `financiero/` (que tiene `compraOficial / ventaOficial / compraLocal / ventaLocal`).

## Pages

`src/app/pages/productos/`:
- `dashboard/` — hub con cards.
- `list-productos/` — paginada con filtros avanzados.
- `familias/` — CRUD familias + subfamilias en dialog.
- `gestionar-producto/` — editor principal (declarado en AppModule). Sub-componentes:
  - `producto-informacion-general` — info base, tipo, flags.
  - `producto-presentaciones-precios` — CRUD presentaciones.
  - `producto-precios-venta` — gestión precios venta.
  - `producto-precios-costo` — gestión costos.
  - `producto-receta` — asociación/creación de receta.
  - `producto-sabores` — gestión multi-sabor.
  - `producto-stock` — control stock.
  - `producto-combo` — configurar componentes (si COMBO).
  - `producto-observaciones` — vincular observaciones.
  - `producto-resumen` — vista read-only.
- `dialogs/`:
  - `sabor-dialog` — crear/editar sabor.
  - `variacion-dialog` — gestionar variación específica.
  - `precio-venta-dialog` — agregar/editar precio.

→ Recetas y sabores en detalle: [recetas-sabores-variaciones.md](recetas-sabores-variaciones.md).

## Handlers principales

`electron/handlers/productos.handler.ts` (~1871 líneas):
- CRUD: `get-familias`, `create-familia`, `update-familia`, `delete-familia`, idem subfamilias, productos, presentaciones, codigos-barra, precios-venta, precios-costo.
- Búsqueda: `search-productos-by-nombre(query, mode)` — `mode: 'venta' | 'compra'` filtra por `esVendible` o `esComprable`.
- Paginated: `get-productos-paginated(page, pageSize, filters)`.

`recetas.handler.ts`, `sabores.handler.ts`, `receta-presentacion.handler.ts` — ver dominio de recetas.

## Reglas clave

1. **Strings UPPERCASE** en handler antes de save.
2. **Flag `principal`** en presentación, código y precio determina el "default" en UI. Sin principal → toma el primero.
3. **`controlaStock` flag** visible para todos los tipos (no oculto en elaborados/combos), con tooltip explicativo del comportamiento.
4. **`esIngrediente` no se valida automáticamente** al crear receta — un producto sin `esIngrediente=true` puede agregarse como ingrediente. (Bug latente.)
5. **Precios y costos NUNCA se borran físicamente** — se inactivan (`activo=false`) y se inserta uno nuevo. Permite historial.

## Refactor histórico

→ [recetas-sabores-variaciones.md](recetas-sabores-variaciones.md) explica el refactor 2024-07-29 (de "receta única + multiplicador por tamaño" → "una receta por (presentación, sabor)").

Cambios de naming en el refactor general:
- `Categoria` → `Familia`
- `Subcategoria` → `Subfamilia`
- `Codigo` → `CodigoBarra`
- `Ingrediente` → `RecetaIngrediente` (un Producto con flag `esIngrediente=true` actúa como ingrediente)
- `CostoPorProducto` → `PrecioCosto`
- `ComboItem` → `ComboProducto`
- `RecetaItem` → `RecetaIngrediente`
- `RecetaVariacion` + `RecetaVariacionItem` → `RecetaPresentacion` (con receta independiente)
- `ProductoImage` → eliminado (imágenes vía `app://producto-images/`)
- `MovimientoStock` → `StockMovimiento`

Entidades **legacy** todavía en BD pero deprecated:
- `RecetaAdicional` (reemplazado por `RecetaAdicionalVinculacion`)
