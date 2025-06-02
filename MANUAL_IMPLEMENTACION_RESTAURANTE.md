# Manual de Implementación - Sistema de Gestión de Restaurantes

## Índice
1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Problemas de la Arquitectura Actual](#problemas-de-la-arquitectura-actual)
3. [Nueva Arquitectura Propuesta](#nueva-arquitectura-propuesta)
4. [Entidades Principales](#entidades-principales)
5. [Flujos de Datos](#flujos-de-datos)
6. [Casos de Uso Específicos](#casos-de-uso-específicos)
7. [Plan de Migración](#plan-de-migración)
8. [Consideraciones Técnicas](#consideraciones-técnicas)

## Resumen Ejecutivo

Este manual presenta una nueva arquitectura para el sistema de gestión de restaurantes que resuelve las limitaciones actuales y proporciona una base sólida para manejar todos los escenarios del negocio: productos retail, elaborados, combos, ingredientes, recetas, variaciones, packaging para delivery y observaciones complejas.

### Beneficios Principales:
- **Separación clara de conceptos**: Productos base, presentaciones, variaciones y recetas bien definidos
- **Sistema de medidas unificado**: Una sola fuente de verdad para todas las unidades de medida
- **Flexibilidad total**: Maneja desde productos simples hasta pizzas con múltiples sabores y tamaños
- **Costos precisos**: Incluye merma, packaging y observaciones en el cálculo de costos
- **Escalabilidad**: Arquitectura preparada para crecimiento futuro

## Problemas de la Arquitectura Actual

### 1. Entidad Producto Sobrecargada
```typescript
// PROBLEMA: Una sola entidad intenta manejar todo
@Entity('productos')
export class Producto extends BaseModel {
  // Campos para retail
  isPesable!: boolean;
  // Campos para elaborados  
  isCombo!: boolean;
  isCompuesto!: boolean;
  // Campos para ingredientes
  isIngrediente!: boolean;
  // ... demasiada responsabilidad en una entidad
}
```

### 2. Sistema de Medidas Fragmentado
- `TipoMedida` existe en ingredientes y presentaciones por separado
- No hay conversiones automáticas entre unidades
- Inconsistencias en el manejo de medidas

### 3. Gestión de Variaciones Limitada
- No hay forma clara de manejar pizzas con diferentes tamaños y sabores
- Relación entre recetas y variaciones es confusa
- Falta de flexibilidad para productos complejos

### 4. Costos y Precios Desorganizados
- Múltiples entidades de costo sin jerarquía clara
- No se considera packaging para delivery
- Falta de cálculo automático de merma

## Nueva Arquitectura Propuesta

### Diagrama Conceptual

```
ProductoBase (Concepto base del producto)
    ↓
ProductoVariacion (Tamaños, Sabores, etc.)
    ↓
ProductoPresentacion (Presentaciones específicas vendibles)
    ↓
PrecioVenta + Codigo (Precios y códigos de barras)
```

### Separación por Tipo de Producto

```typescript
export enum TipoProducto {
  RETAIL = 'RETAIL',              // Gaseosas, chocolates
  ELABORADO = 'ELABORADO',        // Hamburguesas, pizzas  
  INGREDIENTE = 'INGREDIENTE',    // Ingredientes
  COMBO = 'COMBO',               // Combinaciones
  PACKAGING = 'PACKAGING'        // Elementos de empaque
}
```

## Entidades Principales

### 1. UnidadMedida - Sistema Unificado de Medidas

```typescript
@Entity('unidades_medida')
export class UnidadMedida extends BaseModel {
  nombre!: string;              // "Gramo", "Litro", "Unidad"
  simbolo!: string;             // "g", "l", "un"
  tipo!: TipoUnidadMedida;      // GRAMO, LITRO, UNIDAD
  categoria!: CategoriaMedida;   // MASA, VOLUMEN, UNIDAD
  factorConversionBase!: number; // 1000 para kg->g
  esUnidadBase!: boolean;       // true para gramo, litro
}
```

**Ventajas:**
- Conversiones automáticas entre unidades
- Consistencia en todo el sistema
- Fácil añadir nuevas unidades de medida

### 2. ProductoBase - Información Fundamental

```typescript
@Entity('productos_base')
export class ProductoBase extends BaseModel {
  nombre!: string;
  tipoProducto!: TipoProducto;
  hasVariaciones!: boolean;     // Para pizzas con sabores/tamaños
  requierePackaging!: boolean;  // Para delivery
  subcategoriaId!: number;
}
```

**Responsabilidades:**
- Información básica del producto
- Clasificación por tipo
- Configuración de comportamiento

### 3. ProductoVariacion - Manejo de Sabores y Tamaños

```typescript
@Entity('producto_variaciones')
export class ProductoVariacion extends BaseModel {
  productoBaseId!: number;
  nombre!: string;              // "Grande", "Pepperoni"
  tipoVariacion!: TipoVariacion; // TAMAÑO, SABOR
  recetaId?: number;            // Receta específica para esta variación
  maxSaboresCombinados?: number; // Para pizzas
  imageUrl?: string;            // Imagen específica
}
```

**Casos de Uso:**
- Pizza Grande (variación tamaño) + Pepperoni (variación sabor)
- Hamburguesa Simple vs Doble (variaciones de tamaño)
- Diferentes recetas según el tamaño

### 4. ProductoPresentacion - Productos Vendibles

```typescript
@Entity('producto_presentaciones')  
export class ProductoPresentacion extends BaseModel {
  productoBaseId!: number;
  variacionTamañoId?: number;   // Referencia a variación de tamaño
  variacionSaborId?: number;    // Referencia a variación de sabor
  unidadMedidaId!: number;      // Unidad de medida de venta
  cantidad!: number;            // Cantidad en esa unidad
  recetaId?: number;            // Receta específica si es necesaria
  recetaPackagingId?: number;   // Packaging para delivery
  disponibleDelivery!: boolean;
}
```

**Ejemplos Prácticos:**
- "Coca Cola 500ml" = ProductoBase(Coca Cola) + UnidadMedida(ml) + cantidad(500)
- "Pizza Grande Pepperoni" = ProductoBase(Pizza) + VariacionTamaño(Grande) + VariacionSabor(Pepperoni)
- "Combo Hamburguesa" = ProductoBase(Combo) + ComboItems

### 5. Ingrediente Mejorado

```typescript
@Entity('ingredientes')
export class Ingrediente extends BaseModel {
  productoBaseId!: number;      // Referencia al producto base
  origen!: OrigenIngrediente;   // COMPRADO, ELABORADO
  unidadMedidaId!: number;      // Unidad base del ingrediente
  costoPorUnidad!: number;      // Costo por unidad de medida
  porcentajeMerma!: number;     // % de desperdicio
  recetaElaboracionId?: number; // Si es elaborado en cocina
  stockActual!: number;
  stockMinimo!: number;
}
```

**Ventajas:**
- Costos precisos con merma incluida
- Stock unificado
- Ingredientes comprados vs elaborados

### 6. Receta Unificada

```typescript
@Entity('recetas')
export class Receta extends BaseModel {
  nombre!: string;
  tipoReceta!: TipoReceta;      // PRODUCTO, INGREDIENTE, PACKAGING
  productoBaseId?: number;      // Producto al que pertenece
  unidadMedidaSalidaId!: number; // Unidad de lo que produce
  cantidadSalida!: number;      // Cantidad que produce
  costoCalculado!: number;      // Costo automático calculado
}
```

**Tipos de Recetas:**
- **PRODUCTO**: Receta para una hamburguesa, pizza, etc.
- **INGREDIENTE**: Receta para salsa especial, bacon caramelizado
- **PACKAGING**: Receta para empaque de delivery

### 7. Observaciones Avanzadas

```typescript
@Entity('observaciones')
export class Observacion extends BaseModel {
  nombre!: string;
  tipoObservacion!: TipoObservacion; // SIMPLE, CON_COSTO, CON_RECETA
  costoAdicional!: number;           // Para observaciones con costo fijo
  recetaId?: number;                 // Para observaciones con receta
  esObligatoria!: boolean;
  permitePersonalizacion!: boolean;
}
```

**Tipos de Observaciones:**
- **SIMPLE**: "Sin cebolla", "Punto medio" (sin costo)
- **CON_COSTO**: "Extra bacon $5000", "Doble queso $3000"
- **CON_RECETA**: "Salsa especial", "Limón y sal" (con ingredientes)

## Flujos de Datos

### 1. Flujo para Producto Retail (Coca Cola)

```
1. Crear ProductoBase: 
   - nombre: "Coca Cola"
   - tipo: RETAIL
   - hasVariaciones: false
   - requierePackaging: false

2. Crear ProductoPresentacion:
   - nombre: "Coca Cola 500ml"
   - unidadMedida: Mililitro
   - cantidad: 500
   - disponibleDelivery: true

3. Agregar PrecioVenta y Codigo para la presentación

4. Si es delivery y requiere packaging:
   - recetaPackagingId: apunta a receta de empaque
```

### 2. Flujo para Pizza con Sabores y Tamaños

```
1. Crear ProductoBase:
   - nombre: "Pizza"
   - tipo: ELABORADO
   - hasVariaciones: true

2. Crear ProductoVariaciones:
   - Variación TAMAÑO: "Grande", "Mediano", "Chico"
   - Variación SABOR: "Pepperoni", "Calabresa", "Margherita"

3. Crear Recetas específicas:
   - "Receta Pizza Grande Pepperoni"
   - "Receta Pizza Mediano Pepperoni"
   - etc.

4. Crear ProductoPresentaciones:
   - variacionTamañoId: referencia a "Grande"
   - variacionSaborId: referencia a "Pepperoni"
   - recetaId: referencia a receta específica

5. Configurar precios y códigos para cada presentación
```

### 3. Flujo para Combo

```
1. Crear ProductoBase:
   - nombre: "Combo Hamburguesa"
   - tipo: COMBO

2. Crear Combo:
   - productoBaseId: referencia al producto base
   - porcentajeDescuento: 10%

3. Crear ComboItems:
   - productoPresentacionId: "Hamburguesa Simple"
   - productoPresentacionId: "Coca Cola 500ml"
   - productoPresentacionId: "Papas Fritas"

4. Crear ProductoPresentacion para el combo completo
```

### 4. Flujo para Ingrediente Elaborado

```
1. Crear ProductoBase:
   - nombre: "Salsa Especial"
   - tipo: INGREDIENTE

2. Crear Receta de elaboración:
   - tipoReceta: INGREDIENTE
   - ingredientes: mayonesa, mostaza, especias
   - cantidadSalida: 1000ml

3. Crear Ingrediente:
   - origen: ELABORADO
   - recetaElaboracionId: referencia a la receta
   - costoPorUnidad: calculado automáticamente
```

## Casos de Uso Específicos

### Caso 1: Pizza Grande Mitad Pepperoni, Mitad Calabresa

**Problema**: ¿Cómo manejar pizzas con múltiples sabores?

**Solución**:
```typescript
// Opción 1: Crear presentación específica
ProductoPresentacion {
  nombre: "Pizza Grande Mitad Pepperoni Mitad Calabresa",
  variacionTamañoId: "Grande",
  recetaId: "Receta_Pizza_Grande_Mitad_Pepperoni_Calabresa"
}

// Opción 2: Manejar en el pedido con observaciones
// El sistema permite combinar sabores según maxSaboresCombinados
```

### Caso 2: Hamburguesa con Extra Bacon

**Problema**: ¿Cómo agregar ingredientes extra con costo?

**Solución**:
```typescript
// En el pedido se agrega:
ObservacionProducto {
  observacionId: "Extra Bacon", // tipo: CON_COSTO
  costoAdicional: 5000,
  cantidad: 1
}
// El sistema automáticamente calcula stock y costo
```

### Caso 3: Delivery con Packaging

**Problema**: ¿Cómo incluir costos de empaque?

**Solución**:
```typescript
ProductoPresentacion {
  nombre: "Hamburguesa Simple - Delivery",
  recetaId: "Receta_Hamburguesa_Simple",
  recetaPackagingId: "Receta_Packaging_Hamburguesa",
  disponibleDelivery: true
}

// La receta de packaging incluye:
RecetaItem {
  ingredienteId: "Caja Cartón",
  cantidad: 1
}
RecetaItem {
  ingredienteId: "Servilletas", 
  cantidad: 2
}
```

### Caso 4: Observación con Receta (Tequila con Limón y Sal)

**Problema**: ¿Cómo manejar observaciones que tienen ingredientes?

**Solución**:
```typescript
Observacion {
  nombre: "Limón y Sal",
  tipoObservacion: CON_RECETA,
  recetaId: "Receta_Limon_Sal"
}

// La receta incluye:
RecetaItem {
  ingredienteId: "Limón",
  cantidad: 0.25 // un cuarto de limón
}
RecetaItem {
  ingredienteId: "Sal",
  cantidad: 2 // 2 gramos
}
```

## Plan de Migración

### Fase 1: Preparación (Semana 1-2)
1. Crear nuevas entidades sin migrar datos
2. Implementar servicios básicos de conversión
3. Crear scripts de migración

### Fase 2: Migración de Datos Base (Semana 3-4)
1. Migrar `Producto` → `ProductoBase`
2. Crear `UnidadMedida` estándar
3. Migrar `Ingrediente` al nuevo formato

### Fase 3: Migración de Presentaciones (Semana 5-6)
1. Migrar `Presentacion` → `ProductoPresentacion`
2. Migrar precios y códigos
3. Configurar recetas básicas

### Fase 4: Características Avanzadas (Semana 7-8)
1. Implementar variaciones
2. Configurar observaciones avanzadas
3. Setup de packaging para delivery

### Fase 5: Testing y Optimización (Semana 9-10)
1. Testing completo de todos los flujos
2. Optimización de performance
3. Capacitación del equipo

## Consideraciones Técnicas

### 1. Performance
- Índices en todas las foreign keys
- Cache para cálculos de costos frecuentes
- Paginación en listados grandes

### 2. Integridad de Datos
```typescript
// Validaciones automáticas
class ProductoPresentacion {
  @AfterLoad()
  validarConsistencia() {
    if (this.variacionSaborId && !this.productoBase.hasVariaciones) {
      throw new Error('Producto no permite variaciones');
    }
  }
}
```

### 3. Cálculos Automáticos
```typescript
// Service para cálculos
class CostoCalculadorService {
  calcularCostoReceta(recetaId: number): number {
    // Incluye costo de ingredientes + merma
  }
  
  calcularCostoPresentacion(presentacionId: number): number {
    // Incluye receta + packaging + observaciones
  }
}
```

### 4. API Design
```typescript
// Endpoints RESTful claros
GET /api/productos-base
GET /api/productos-base/:id/variaciones
GET /api/productos-base/:id/presentaciones
GET /api/presentaciones/:id/precios
GET /api/presentaciones/:id/codigos
```

### 5. Configuración Inicial
```sql
-- Unidades de medida básicas
INSERT INTO unidades_medida (nombre, simbolo, tipo, categoria, factor_conversion_base, es_unidad_base) VALUES
('Gramo', 'g', 'GRAMO', 'MASA', 1, true),
('Kilogramo', 'kg', 'KILOGRAMO', 'MASA', 1000, false),
('Litro', 'l', 'LITRO', 'VOLUMEN', 1, true),
('Mililitro', 'ml', 'MILILITRO', 'VOLUMEN', 0.001, false),
('Unidad', 'un', 'UNIDAD', 'UNIDAD', 1, true);
```

## Conclusión

Esta nueva arquitectura proporciona:

1. **Flexibilidad Total**: Maneja todos los tipos de productos del restaurante
2. **Escalabilidad**: Fácil agregar nuevos tipos de productos y funcionalidades  
3. **Consistencia**: Sistema unificado de medidas y costos
4. **Precisión**: Cálculos exactos incluyendo merma, packaging y observaciones
5. **Mantenibilidad**: Código más limpio y fácil de mantener

La implementación gradual permitirá migrar sin interrumpir las operaciones y el sistema estará preparado para futuras expansiones del negocio. 