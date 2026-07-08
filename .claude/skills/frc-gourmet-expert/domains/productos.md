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
            ├─ ProductoSector (M:N con Sector, tabla producto_sectores) -- routing de comanda por producto
            └─ StockMovimiento (1:N)
```

> Nota: los nombres de tabla son **singulares** (`producto`, `presentacion`, `precio_venta`, `precio_costo`, `codigo_barra`, `combo`, `combo_producto`, `stock_movimiento`, `receta`, `sabor`, `receta_presentacion`). Excepción: la junction de sectores es `producto_sectores`.

## ProductoTipo (enum)

`src/app/database/entities/productos/producto-tipo.enum.ts`:

| Tipo | Vendible | Comprable | Controla stock | Ingrediente | Caso típico |
|---|:---:|:---:|:---:|:---:|---|
| **RETAIL** | ✅ | ✅ | ✅ | ❌ | Coca-Cola, Quilmes, productos terminados de reventa |
| **RETAIL_INGREDIENTE** | ❌ | ✅ | ✅ | ✅ | Harina, queso, salsas (insumos comprables que entran a recetas) |
| **ELABORADO_SIN_VARIACION** | ✅ | ❌ | ✅¹ | ❌ | Lasaña, Tiramisú, Empanada (1 receta única) |
| **ELABORADO_CON_VARIACION** | ✅ | ❌ | ❌¹ | ❌ | Pizza (varios sabores × varios tamaños) |
| **COMBO** | ✅ | ❌ | ❌¹ | ❌ | "Combo Familiar = 2 Pizzas + Gaseosa + Postre" |
| **BUFFET_POR_PESO** | ✅ | ❌ | ❌¹ | ❌ | Buffet por kilo / self-service. `PrecioVenta.valor` = precio por kilo |

¹ Stock se controla en componentes (presentaciones / ingredientes / componentes), no en el producto padre. Flag `controlaStock` se puede activar manualmente para forzar control sobre el padre.

**BUFFET_POR_PESO**: producto cobrado por peso. El precio se interpreta como precio por kilo. Campos específicos en `Producto`: `taraGramos` (peso del plato a descontar del bruto), `pesoMinimoGramos`, `descuentaPorReceta` (si true, la venta descuenta ingredientes prorrateados por receta en vez del propio producto). Topes de cobro schedule-aware en `PrecioVenta`: `precioMinimo` (cobro mínimo por plato) y `precioMaximo` (tope "buffet libre"). Tiene dialog de producción dedicado: `produccion-buffet-dialog` (`src/app/shared/components/`).

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
| `controlaStock` | boolean | Default true. Visible para todos los tipos (la UI sugiere true para RETAIL/RETAIL_INGREDIENTE) |
| `esIngrediente` | boolean | Default false. Si true, disponible en recetas |
| `requiereComanda` | boolean (col `requiere_comanda`), default true | Si false, el producto NO genera ticket de comanda al ticketear en PdV (servicio, propina, descuento, etc.) |
| `stockMinimo` | decimal(10,3), nullable | Para alertas |
| `stockMaximo` | decimal(10,3), nullable | Para control |
| `taraGramos` | decimal(10,3), nullable (col `tara_gramos`) | Solo BUFFET_POR_PESO. Peso del plato a descontar del bruto (gramos) |
| `pesoMinimoGramos` | decimal(10,3), nullable (col `peso_minimo_gramos`) | Solo BUFFET_POR_PESO. Peso mínimo para cobrar (gramos) |
| `descuentaPorReceta` | boolean (col `descuenta_por_receta`), default false | BUFFET_POR_PESO: si true, descuenta ingredientes prorrateados por receta en vez del propio producto |
| `iva` | int, default 10 | IVA en porcentaje (0/5/10). Pensado para futura facturación electrónica SIFEN. Validado en `create-producto`/`update-producto`. |
| `registroCompleto` | boolean (col `registro_completo`), default true | Si false → producto creado parcial (típicamente desde import OCR). UI muestra chip "Parcial" en list-productos + filtro "Solo parciales". |
| `subfamilia_id` | FK, **nullable** | Categoría. Nullable para soportar productos parciales sin clasificar (ej. creados desde import OCR); `createForeignKeyConstraints: false`. |
| `imageUrl` | varchar(500), nullable (col `image_url`) | `app://producto-images/<file>`. Derivadas (thumb 96px, medium 400px) se infieren con `image-url.util.ts` |

Relaciones nuevas en `Producto`: `sabores` (OneToMany Sabor), `recetas` (OneToMany Receta vía `productoVariacion`), `sectores` (OneToMany ProductoSector, M2M con Sector para routing de comanda).

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

Tabla `precio_venta`. Vinculación **flexible** (cualquiera de estas FKs):
- `presentacion_id` — para RETAIL / RETAIL_INGREDIENTE / BUFFET_POR_PESO.
- `receta_id` — para ELABORADO_SIN_VARIACION.
- `producto_id` — para COMBO.
- `receta_presentacion_id` — para ELABORADO_CON_VARIACION (cada variación con su precio).

Columnas: `valor`, `principal`, `activo`, `moneda_id`, `tipo_precio_id`.

**Multi-moneda**: cada producto puede tener precios en PYG, USD, BRL, etc.

**Multi-tipo**: a través de `TipoPrecio` (tabla en `financiero/`). Roles típicos: NORMAL, MAYORISTA, VIP.

**Programación de vigencia** (precios por día/horario): columnas nullable `diasSemana` (CSV "1,2,3..." 1=Lunes), `horaInicio`/`horaFin` ("HH:mm", soporta cruce de medianoche), `fechaInicio`/`fechaFin` (date), `prioridad` (int, gana el mayor ante solape). Un precio sin programación es el fallback. El resolver es `electron/utils/precio-vigencia.util.ts`.

**Buffet por peso** (cuando producto = BUFFET_POR_PESO): `valor` se interpreta como precio por kilo. `precioMinimo` (cobro mínimo por plato) y `precioMaximo` (tope "buffet libre", cobro fijo a partir de ese monto) son schedule-aware (viven en PrecioVenta).

### PrecioCosto

Tabla `precio_costo`. Multi-fuente:

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

Tabla `codigo_barra`. **N por presentación**.
- `codigo` (string, ej: EAN-13)
- `principal` (boolean): cuál usar por defecto en escaneo
- `activo`

## Combos

`Combo` (ManyToOne a Producto tipo COMBO) + `ComboProducto[]` (componentes):

```
Producto (tipo COMBO, "Combo Ejecutivo")
  └─ Combo
       ├─ ComboProducto: Lasaña × 1 (presentacion_id null = principal)
       ├─ ComboProducto: Coca 500ml × 1 (esOpcional=false)
       └─ ComboProducto: Postre × 1 (esOpcional=true)  ← cliente puede declinar
```

`ComboProducto` campos: `cantidad`, `esOpcional`, `activo`, FKs `combo_id`, `producto_id`, `presentacion_id` (nullable).

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

Handler `crear-produccion` (`productos.handler.ts`) + `get-producciones`. UI: existe `produccion-buffet-dialog` (`src/app/shared/components/`) para producir productos BUFFET_POR_PESO. ⚠️ Para elaborados en general **falta una pantalla de producción dedicada** (las entidades y el handler existen, pero no hay editor genérico).

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
- `gestionar-producto/` — editor principal (declarado en AppModule). Sub-componentes en `gestionar-producto/components/`:
  - `producto-informacion-general` — info base, tipo, flags.
  - `producto-presentaciones-precios` — CRUD presentaciones.
  - `producto-precios-venta` — gestión precios venta.
  - `producto-precios-costo` — gestión costos.
  - `producto-receta` — asociación/creación de receta.
  - `producto-sabores` — gestión multi-sabor.
  - `producto-variaciones` — gestión de variaciones (RecetaPresentacion).
  - `producto-stock` — control stock.
  - `producto-combo` — configurar componentes (si COMBO).
  - `producto-observaciones` — vincular observaciones.
  - `producto-resumen` — vista read-only.
  - `precio-venta-dialog`, `codigo-barra-dialog` — diálogos (viven dentro de `components/`).
- `gestionar-producto/dialogs/`:
  - `sabor-dialog` — crear/editar sabor.
  - `variacion-dialog` — gestionar variación específica.

(Nota: `pages/productos/dialogs/` existe pero está vacía; los diálogos viven bajo `gestionar-producto/`. Los diálogos de PdV `seleccionar-variacion-dialog` y `personalizar-producto-dialog` viven en `src/app/shared/components/`.)

→ Recetas y sabores en detalle: [recetas-sabores-variaciones.md](recetas-sabores-variaciones.md).

## Handlers principales

`electron/handlers/productos.handler.ts`:
- CRUD: `get-familias`, `create-familia`, `update-familia`, `delete-familia`, idem subfamilias; `get-producto`/`create-producto`/`update-producto`, presentaciones (`*-presentacion`), codigos-barra (`*-codigo-barra`), precios-venta (`*-precio-venta`), precios-costo (`*-precio-costo`), stock-movimientos, producto-observacion, producción (`crear-produccion`, `get-producciones`).
- Búsqueda: `search-productos-by-nombre(nombre, mode)` — `mode: 'venta' | 'compra'` (default 'venta') filtra por `esVendible` o `esComprable`; también matchea por código de barra exacto. `search-productos-by-codigo`, `buscar-producto-codigo-mesa`.
- Filtrado: `get-productos-with-filters(filters)` — acepta `search`, `tipo`, `activo`, `esVendible`, `esComprable`, etc. (no se llama `get-productos-paginated`).

`recetas.handler.ts` (registra recetas + sabores + variaciones, unificado). Los archivos `sabores.handler.ts` y `receta-presentacion.handler.ts` existen pero **NO se registran en main.ts** — ver dominio de recetas. El M2M Producto↔Sector lo maneja `producto-sectores.handler.ts` (sí registrado).

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

Notas:
- `receta_adicional` **no es una entidad deprecada**: es la tabla de junction M2M (disponibilidad general de adicionales por receta), todavía en uso. La vinculación con precio/cantidad específicos es la entidad `RecetaAdicionalVinculacion`.
- Existe un subsistema **separado** de armado de pizzas: `TamanhoPizza`, `SaborPizza`, `EnsambladoPizza`, `EnsambladoPizzaSabor` (tablas `tamanho_pizza`, `sabor_pizza`, `ensamblado_pizza`, `ensamblado_pizza_sabor`). Es distinto del modelo Sabor/RecetaPresentacion descrito arriba; verificar en código cuál usa el flujo concreto antes de asumir. (Marcado para revisión humana — alcance no auditado en detalle.)
