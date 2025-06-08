# Productos - Entidades y Relaciones del Sistema

## Resumen General
Este documento detalla todas las entidades del sistema de productos y sus relaciones, organizadas por módulos funcionales.

## Estructura de Carpetas
```
src/app/database/entities/productos/
├── core/                    # Entidades fundamentales
├── categorias/             # Sistema de categorización
├── comercial/              # Aspectos comerciales y presentaciones
├── recetas/                # Sistema de recetas
├── variaciones/            # Variaciones de productos
├── observaciones/          # Sistema de observaciones
├── gestion/                # Gestión y administración
└── index.ts               # Exportaciones centralizadas
```

## Entidades Core (Fundamentales)

### ProductoBase
**Archivo**: `core/producto-base.entity.ts`
**Descripción**: Entidad principal que define la información básica de cualquier producto en el sistema.

**Enums**:
- `TipoProducto`: RETAIL, ELABORADO, INGREDIENTE, COMBO, PACKAGING

**Relaciones**:
- `subcategoria` (ManyToOne) → Subcategoria
- `images` (OneToMany) → ProductoImage[]

**Campos Clave**:
- Control de stock: `hasStock`, `isPesable`, `hasVencimiento`
- Variaciones: `hasVariaciones`
- Delivery: `requierePackaging`
- IVA y categorización

### UnidadMedida
**Archivo**: `core/unidad-medida.entity.ts`
**Descripción**: Define las unidades de medida utilizadas en el sistema.

**Enums**:
- `TipoUnidadMedida`: PESO, VOLUMEN, UNIDAD, TIEMPO, TEMPERATURA
- `CategoriaMedida`: SOLIDO, LIQUIDO, GASEOSO, UNIDAD, TIEMPO, TEMPERATURA

### Ingrediente
**Archivo**: `core/ingrediente.entity.ts`
**Descripción**: Representa ingredientes que pueden ser comprados o elaborados.

**Enums**:
- `OrigenIngrediente`: COMPRADO, ELABORADO

## Sistema de Categorización

### Categoria
**Archivo**: `categorias/categoria.entity.ts`
**Relaciones**:
- `subcategorias` (OneToMany) → Subcategoria[]

### Subcategoria
**Archivo**: `categorias/subcategoria.entity.ts`
**Relaciones**:
- `categoria` (ManyToOne) → Categoria
- `productos` (OneToMany) → Producto[]

**Jerarquía**: Categoria → Subcategoria → ProductoBase

## Módulo Comercial

### ProductoPresentacion
**Archivo**: `comercial/producto-presentacion.entity.ts`
**Descripción**: Entidad central que maneja todas las presentaciones comerciales de productos.

**Relaciones Principales**:
- `productoBase` (ManyToOne) → ProductoBase
- `variacionTamaño` (ManyToOne) → ProductoVariacion
- `variacionSabor` (ManyToOne) → ProductoVariacion
- `unidadMedida` (ManyToOne) → UnidadMedida
- `receta` (ManyToOne) → Receta
- `recetaPackaging` (ManyToOne) → Receta
- `precios` (OneToMany) → PrecioVenta[]
- `codigos` (OneToMany) → Codigo[]

**Funcionalidades**:
- Manejo de variaciones de tamaño y sabor
- Recetas específicas por presentación
- Recetas de packaging para delivery
- Precios y códigos asociados

### PrecioVenta
**Archivo**: `comercial/precio-venta.entity.ts`
**Relaciones**:
- `presentacion` (ManyToOne) → ProductoPresentacion

### Codigo
**Archivo**: `comercial/codigo.entity.ts`
**Enums**:
- `TipoCodigo`: BARRAS, QR, INTERNO, SKU
**Relaciones**:
- `presentacion` (ManyToOne) → ProductoPresentacion

### CostoPorProducto
**Archivo**: `comercial/costo-por-producto.entity.ts`
**Enums**:
- `OrigenCosto`: COMPRA, CALCULADO, ESTIMADO

### Combo y ComboItem
**Archivos**: `comercial/combo.entity.ts`, `comercial/combo-item.entity.ts`
**Relaciones**:
- Combo → ProductoBase (ManyToOne)
- Combo → ComboItem[] (OneToMany)
- ComboItem → Combo (ManyToOne)
- ComboItem → ProductoPresentacion (ManyToOne)

## Sistema de Recetas

### Receta
**Archivo**: `recetas/receta.entity.ts`
**Enums**:
- `TipoReceta`: PRODUCTO, INGREDIENTE, PACKAGING

**Relaciones**:
- `productoBase` (ManyToOne) → ProductoBase
- `unidadMedidaSalida` (ManyToOne) → UnidadMedida
- `items` (OneToMany) → RecetaItem[]

### RecetaItem
**Archivo**: `recetas/receta-item.entity.ts`
**Relaciones**:
- `receta` (ManyToOne) → Receta
- `ingrediente` (ManyToOne) → Ingrediente
- `unidadMedida` (ManyToOne) → UnidadMedida

**Flujo**: Receta → RecetaItem[] → Ingrediente

## Sistema de Variaciones

### ProductoVariacion
**Archivo**: `variaciones/producto-variacion.entity.ts`
**Enums**:
- `TipoVariacion`: TAMAÑO, SABOR, COLOR, MATERIAL

**Relaciones**:
- `productoBase` (ManyToOne) → ProductoBase

## Sistema de Observaciones

### Observacion
**Archivo**: `observaciones/observacion.entity.ts`
**Enums**:
- `TipoObservacion`: SIMPLE, CON_COSTO, CON_RECETA

**Relaciones**:
- `receta` (ManyToOne) → Receta
- `moneda` (ManyToOne) → Moneda

### ObservacionProducto
**Archivo**: `observaciones/observacion-producto.entity.ts`
**Descripción**: Tabla de unión para asociar observaciones específicas a productos.

## Módulo de Gestión

### ProductoImage
**Archivo**: `gestion/producto-image.entity.ts`
**Relaciones**:
- `producto` (ManyToOne) → ProductoBase

### MovimientoStock
**Archivo**: `gestion/movimiento-stock.entity.ts`
**Descripción**: Registra movimientos de inventario.

## Flujos de Relaciones Principales

### 1. Flujo de Categorización
```
Categoria → Subcategoria → ProductoBase
```

### 2. Flujo de Presentación Comercial
```
ProductoBase → ProductoPresentacion
                ├── Variaciones (Tamaño/Sabor)
                ├── UnidadMedida
                ├── Receta
                ├── RecetaPackaging
                ├── PrecioVenta[]
                └── Codigo[]
```

### 3. Flujo de Recetas
```
ProductoBase → Receta → RecetaItem[] → Ingrediente
                    └── UnidadMedida
```

### 4. Flujo de Combos
```
ProductoBase (tipo COMBO) → Combo → ComboItem[] → ProductoPresentacion
```

### 5. Flujo de Observaciones
```
Observacion (reutilizable) → ObservacionProducto → ProductoBase
         └── Receta (opcional)
```

## Tipos de Productos y Sus Relaciones

### RETAIL
- ProductoBase → ProductoPresentacion → PrecioVenta
- No requiere recetas
- Puede tener variaciones simples

### ELABORADO
- ProductoBase → Receta → RecetaItem[] → Ingrediente
- ProductoBase → ProductoPresentacion (con receta específica)
- Puede requerir packaging para delivery

### INGREDIENTE
- Puede ser comprado (costo directo) o elaborado (con receta)
- Se usa en RecetaItem de otros productos

### COMBO
- ProductoBase → Combo → ComboItem[] → ProductoPresentacion
- Tiene lógica de descuentos

### PACKAGING
- Se usa en recetas de packaging para delivery
- ProductoBase → Receta (tipo PACKAGING)

## Campos Calculados y Lógica de Negocio

### Costos
- `Receta.costoCalculado`: Suma de costos de RecetaItem
- `ProductoPresentacion.costoTotal`: Incluye producto + packaging
- `Combo.costoTotal`: Suma de costos de ComboItem
- `Observacion.costoTotal`: Costo adicional + costo de receta

### Precios
- Múltiples precios por presentación en diferentes monedas
- Precios de combo con descuentos aplicados

## Consideraciones Técnicas

### Performance
- Se evitan function calls en templates
- Campos calculados se almacenan cuando es necesario
- Relaciones lazy loading donde corresponde

### Integridad Referencial
- Cascades definidos según lógica de negocio
- RESTRICT en relaciones críticas como UnidadMedida
- SET NULL para relaciones opcionales

### Extensibilidad
- Enums para tipos configurables
- Sistema de observaciones reutilizable
- Arquitectura modular por funcionalidades

Este documento preserva la estructura completa de relaciones del sistema de productos antes del rollback de commits. 