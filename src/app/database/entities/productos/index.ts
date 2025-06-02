// Core entities
export { UnidadMedida, TipoUnidadMedida, CategoriaMedida } from './core/unidad-medida.entity';
export { ProductoBase, TipoProducto } from './core/producto-base.entity';
export { Ingrediente, OrigenIngrediente } from './core/ingrediente.entity';

// Variations
export { ProductoVariacion, TipoVariacion } from './variaciones/producto-variacion.entity';

// Recipes
export { Receta, TipoReceta } from './recetas/receta.entity';
export { RecetaItem } from './recetas/receta-item.entity';

// Commercial
export { ProductoPresentacion } from './comercial/producto-presentacion.entity';
export { PrecioVenta } from './comercial/precio-venta.entity';
export { Codigo, TipoCodigo } from './comercial/codigo.entity';
export { CostoPorProducto, OrigenCosto } from './comercial/costo-por-producto.entity';
export { Combo } from './comercial/combo.entity';
export { ComboItem } from './comercial/combo-item.entity';

// Observations
export { Observacion, TipoObservacion } from './observaciones/observacion.entity';
export { ObservacionProducto } from './observaciones/observacion-producto.entity';

// Categories
export { Categoria } from './categorias/categoria.entity';
export { Subcategoria } from './categorias/subcategoria.entity';

// Management
export { ProductoImage } from './gestion/producto-image.entity';
export { MovimientoStock } from './gestion/movimiento-stock.entity'; 