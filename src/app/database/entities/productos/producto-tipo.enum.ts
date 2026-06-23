export enum ProductoTipo {
  RETAIL = 'RETAIL',
  RETAIL_INGREDIENTE = 'RETAIL_INGREDIENTE',
  ELABORADO_SIN_VARIACION = 'ELABORADO_SIN_VARIACION',
  ELABORADO_CON_VARIACION = 'ELABORADO_CON_VARIACION',
  COMBO = 'COMBO',
  // Producto servido y cobrado por peso (buffet por kilo / self-service).
  // El precio (PrecioVenta.valor) se interpreta como precio por kilo.
  BUFFET_POR_PESO = 'BUFFET_POR_PESO',
} 