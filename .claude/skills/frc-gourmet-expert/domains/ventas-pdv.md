# Dominio: Ventas y Punto de Venta (PdV)

El módulo más visible y operativamente más usado. Ventas, mesas, comandas, delivery, atajos, multi-sabor, descuento de stock automático.

## Entidades clave (24 archivos `*.entity.ts` en `entities/ventas/`)

```
Sector ─┐
        └── PdvMesa ─── Reserva (opcional)
                  └── Venta ─── VentaItem ─── VentaItemSabor ─── VentaItemAdicional
                            ├── VentaItemIngredienteModificacion
                            ├── VentaItemObservacion
                            ├── Pago + PagoDetalle (legacy)
                            ├── Comanda ─── ComandaItem (cocina / KDS)
                            └── Delivery (si delivery)
                                  └── PrecioDelivery

KdsPantalla   (config de pantallas KDS, standalone — no FK)
```

## Diferencia: Venta vs Comanda vs Mesa

| Concepto | Entidad | Propósito | Ciclo |
|---|---|---|---|
| **Venta** | `Venta` | Transacción comercial (factura) | ABIERTA → CONCLUIDA / CANCELADA |
| **Comanda** | `Comanda` | Tarjeta de cocina (pedido a preparar). Tarjeta física con número/código de barras. | DISPONIBLE (libre) ↔ OCUPADO (asignada) |
| **Mesa** | `PdvMesa` | Ubicación física | DISPONIBLE ↔ OCUPADO |

Una mesa puede tener **1 venta abierta** Y **N comandas vinculadas** (cuentas separadas).

## Estados

```typescript
VentaEstado: ABIERTA | CONCLUIDA | CANCELADA
EstadoVentaItem: ACTIVO | MODIFICADO | CANCELADO
ComandaEstado: DISPONIBLE | OCUPADO
ComandaItemEstado: PENDIENTE | EN_PREPARACION | LISTO | ENTREGADO | CANCELADO
PdvMesaEstado: DISPONIBLE | OCUPADO
DeliveryEstado: ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO | CANCELADO
TipoModificacionIngrediente: REMOVIDO | INTERCAMBIADO
```

## Venta

`src/app/database/entities/ventas/venta.entity.ts`:

| Campo | Notas |
|---|---|
| `cliente_id` FK nullable | Cliente registrado |
| `nombreCliente` string | Nombre rápido sin registrar |
| `estado` enum | ABIERTA por default |
| `forma_pago_id` FK (prop `formaPago`) | |
| `caja_id` FK | Una venta siempre pertenece a una caja |
| `dispositivo_id` FK nullable | Dispositivo origen (F5 device tracking). Null en ventas pre-F5; en cliente HTTP lo resuelve el server del JWT |
| `pago_id` FK nullable | Se crea al cobrar (legacy entity Pago) |
| `delivery_id` FK nullable | Si es delivery |
| `mesa_id` FK nullable (prop `mesa`) | Si es venta en mesa |
| `comanda_id` FK nullable | Si está vinculada a comanda |
| `ventaPadre_id` FK nullable | Para división de cuenta |
| `descuentoPorcentaje, descuentoMonto, descuentoMotivo` | Descuento global |
| `descuentoAutorizadoPor_id` FK | Quién autorizó el descuento |
| `fechaCierre` datetime nullable | Cuando se concluyó |
| `vendedor_id` FK Usuario | Para comisiones (refactor RRHH Fase 6 — fallback `created_by`) |
| `total` decimal denormalizado | Puede no estar actualizado, recalcular desde items |

## VentaItem

```typescript
{
  venta_id, producto_id, presentacion_id
  precioVentaPresentacion: PrecioVenta (snapshot)
  precioCostoUnitario: decimal
  precioVentaUnitario: decimal
  cantidad: decimal
  descuentoUnitario: decimal       // se resta del precio unitario
  precioAdicionales: decimal       // suma denormalizada de adicionales
  estado: ACTIVO | MODIFICADO | CANCELADO
  canceladoPor, horaCancelado
  modificado: boolean
  modificadoPor, horaModificacion
  nuevaVersionVentaItem: VentaItem (FK al item editado)
  historialCambios: text JSON      // qué cambió al editar
  recetaPresentacion: RecetaPresentacion (opcional, para ELABORADO_CON_VARIACION)
  ensambladoDescripcion: string    // descripción legible de la composición
  cantidadSabores: int             // 1, 2, 3 (max según PdvConfig.pizzaMaxSabores)
  saboresVenta: VentaItemSabor[]
  vendedor: Usuario (split de comisiones por item, opcional)
  // Buffet por peso (solo producto BUFFET_POR_PESO):
  pesoBruto, pesoTara, pesoNeto: decimal(10,3)  // gramos; siempre se persiste
  precioPorKg: decimal              // precio por kilo real usado (reporting)
  aplicoLibre: boolean             // true si se activó el tope "buffet libre"
  // Impresión de comanda de cocina (sistema documentos):
  impreso: boolean                 // true solo cuando TODOS los sectores del item se imprimieron OK
  fechaImpresion: Date
  impresiones: text JSON           // log [{sectorId, printerId, ts, ok, error?}] por intento
}
```

**Cálculo final por item:** `(precioVentaUnitario + precioAdicionales - descuentoUnitario) * cantidad`.

**Estados:**
- ACTIVO: cuenta en total.
- MODIFICADO: el item fue editado, hay una versión nueva linked en `nuevaVersionVentaItem`. Sigue contando (sumamos solo la última versión activa).
- CANCELADO: NO cuenta en total.

## VentaItemSabor (multi-sabor)

Para pizzas con 2+ sabores:

```typescript
{
  ventaItem_id (CASCADE)
  recetaPresentacion_id        // ej: "Pizza Grande Calabresa"
  proporcion: decimal          // 1.0 entera, 0.5 mitad, 0.33 tercio
  precioReferencia, costoReferencia
  activo
}
```

Pizza con Margherita + Calabresa cada uno 0.5.

## VentaItemAdicional

```typescript
{
  ventaItem_id (CASCADE)
  adicional_id
  precioCobrado: decimal       // snapshot
  cantidad: decimal default 1
  ventaItemSabor_id nullable   // si aplica solo a 1 sabor (ej: jamón solo en mitad)
}
```

## VentaItemIngredienteModificacion

```typescript
{
  ventaItem_id (CASCADE)
  recetaIngrediente_id
  tipoModificacion: REMOVIDO | INTERCAMBIADO
  ingredienteReemplazo_id: Producto nullable   // si INTERCAMBIADO
  ventaItemSabor_id nullable
}
```

REMOVIDO: "sin tomate". INTERCAMBIADO: "Mozzarella → Queso de Cabra" (ingredienteReemplazo).

## VentaItemObservacion

```typescript
{
  ventaItem_id (CASCADE)
  observacion_id: Observacion    // predefinida (catálogo)
  observacionLibre: varchar       // texto libre
  ventaItemSabor_id nullable
}
```

## Mesas y sectores

`PdvMesa`:
- `numero` (visible, ej: 1, 2, 3)
- `cantidad_personas` (capacidad, default 4)
- `estado` (DISPONIBLE / OCUPADO)
- `activo`, `reservado`
- `sector_id`, `reserva_id` nullable
- `venta` 1:1 con la venta abierta (max 1)
- `comandas` 1:N

`Sector`: `nombre`, `activo`, `mesas[]`. Ej: "Salón A", "Barra", "Terraza".

**Estado auto-update**: el handler `cerrarVentasAbiertasMesa(mesaId, estado)` concluye/cancela la venta abierta de la mesa y libera la mesa (estado → DISPONIBLE). Lo invoca el flujo de cobro/cancelación del PdV.

## Comandas (cuentas individuales)

Tarjetas físicas con código de barras ("CMD-001", "CMD-002") que se entregan a clientes para cuentas individuales en mesa o barra. Permiten que dos clientes en la misma mesa tengan cuentas separadas.

```typescript
Comanda {
  codigo: string           // "CMD-001"
  numero: int              // secuencial
  estado: DISPONIBLE | OCUPADO
  descripcion?, observacion?
  pdv_mesa?: PdvMesa nullable     // mesa vinculada (opcional)
  sector?: Sector nullable
  activo
}

ComandaItem {
  comanda_id (CASCADE)
  ventaItem_id            // referencia a item específico de la venta
  sector_id nullable      // KDS: sector donde se prepara (1 ComandaItem por sector → estado independiente)
  estado: PENDIENTE | EN_PREPARACION | LISTO | ENTREGADO | CANCELADO
  observacion
  fechaEnPreparacion      // timestamp al pasar a EN_PREPARACION (métricas de tiempo de prep)
  fechaListo
  activo
}
```

**KDS (Kitchen Display System)**: los `ComandaItem` alimentan el feed de pantallas de cocina. Ver dominio `cocina-impresion.md` y el handler `kds.handler.ts`. Páginas en `src/app/pages/ventas/kds/` (`kds.component`, `list-kds-pantallas`, `create-edit-kds-pantalla-dialog`).

**Caso de uso**:
- Cliente en barra: abre comanda CMD-007 sin mesa.
- 2 clientes mesa 5 piden cuentas separadas: abrir CMD-012 y CMD-013 vinculadas a mesa 5 (mesa NO tiene venta directa, las comandas sí).

**Configuración**: `PdvConfig.comandasHabilitadas` (boolean) y `pdvTabDefault: MESAS | COMANDAS`.

## Delivery

`Delivery`:
| Campo | Notas |
|---|---|
| `precioDelivery_id` FK nullable | Zona de entrega |
| `cliente_id` FK nullable | Cliente registrado |
| `nombre, telefono, direccion` | Si no hay cliente registrado |
| `observacion` | Notas |
| `estado` | ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO / CANCELADO |
| `fechaAbierto, fechaParaEntrega, fechaEnCamino, fechaEntregado, fechaCancelacion` | Timestamps por estado |
| `motivoCancelacion` | Texto |
| `cobroAnticipado` | boolean |
| `entregadoPor` | Usuario (repartidor) |

`PrecioDelivery`: `descripcion`, `valor`. Configurable.

**UI Delivery**: dialog 90vw × 85vh con lista paginada (filtros por estado), detalle ticket, timer de espera por estado (con colores configurables en `PdvConfig.deliveryTiempoAmarillo` / `deliveryTiempoRojo`).

## Sistema de Atajos PdV

Botones rápidos en el PdV para productos / categorías frecuentes.

```
PdvAtajoGrupo (tab: "CENA", "DESAYUNO")
  └─ PdvAtajoGrupoItem (M:N)
       └─ PdvAtajoItem (botón "BEBIDAS", "HAMBURGUESAS")
             └─ PdvAtajoItemProducto (M:N producto, con posición y nombre_alternativo)
```

`PdvAtajoItem` tiene `colorFondo`, `colorTexto`, `icono`. Permite layout visual customizable.

**Configuración**: `atajo-config-dialog` con drag & drop, tamaños configurables (`PdvConfig.atajosGridSize`, `atajosProductosGridSize`).

**Tipos de producto soportados al click**:
- RETAIL: muestra presentaciones, agrega directo.
- ELABORADO_SIN_VARIACION: precio via receta, abre `PersonalizarProductoDialog`.
- ELABORADO_CON_VARIACION: abre `seleccionar-variacion-dialog` (tamaño → sabores → personalización).
- COMBO: precio directo en producto.

## Categorías PdV (legacy)

```
PdvGrupoCategoria → PdvCategoria → PdvCategoriaItem (con imagen) → PdvItemProducto
```

ABM via `pdv-config-dialog`. Visualización **parcialmente implementada** — los items se muestran pero la navegación a click no agrega productos al carrito (TODO).

→ Memoria sugiere reemplazar con sistema de Atajos. (`project_atajos_sistema`)

## PdvConfig (configuración global)

Una sola fila. Campos:

| Campo | Default | Efecto |
|---|---|---|
| `cantidad_mesas` | 0 | Total de mesas |
| `pdvGrupoCategoria_id` | null | Grupo categorías default |
| `umbralDiferenciaBaja` | 5 | % aceptable diferencia caja (verde) |
| `umbralDiferenciaAlta` | 15 | % alerta diferencia (rojo) |
| `deliveryTiempoAmarillo` | 30 | min para color amarillo |
| `deliveryTiempoRojo` | 60 | min para color rojo |
| `pdvTabDefault` | "MESAS" | Tab inicial PdV (MESAS/COMANDAS/CATEGORIAS/ATAJOS) |
| `comandasHabilitadas` | false | Activa sistema de comandas |
| `ocuparMesaAlVincularComanda` | false | Si true, vincular comanda a mesa marca la mesa OCUPADA; al cerrar la comanda vuelve a DISPONIBLE si no quedan otras comandas/venta abierta |
| `atajosGridSize` | 3 | Tamaño grid atajos (1=grande, 3=pequeño) |
| `atajosProductosGridSize` | 3 | Tamaño grid productos en atajos |
| `pizzaMaxSabores` | 2 | Máximo sabores por pizza |
| `pizzaEstrategiaPrecio` | MAYOR_PRECIO | MAYOR_PRECIO o PROMEDIO |
| `autoImprimirComanda` | true | Al agregar items → imprimir comanda automáticamente a impresoras del sector |
| `autoImprimirTicketVenta` | true | Al cobrar (CONCLUIDA) → imprimir ticket de venta automáticamente |
| `imprimirPrecuentaAlSolicitar` | true | Botón "Pre-cuenta" imprime sin confirmación intermedia |
| `balanzaPrefijo` | '2' | Prefijo EAN-13 de etiqueta de balanza (buffet por peso) |
| `balanzaModo` | PESO | Qué codifica el valor embebido: PESO o PRECIO |
| `balanzaFactorPeso` | 1 | Factor valor embebido → gramos |

## Flujo completo de venta (Pdv)

### 1. Apertura de caja

`pdv.component.ts` → `ngOnInit`:
- Si user no tiene caja abierta: dialog "¿Abrir caja?" → `create-caja-dialog` (2 steps: Conteo Apertura → Resumen).
- Dispositivo auto-detectado (MAC en `system.handler.ts`).

### 2. Selección de mesa

El polling de mesas (`getPdvMesasActivas()`) ya trae cada `PdvMesa` con su `venta` abierta (max 1). Al click:
- Si `mesa.venta?.id`: `loadVentaItems(mesa)` → `getVentaItems(ventaId)` y `cargarPersonalizacionesItem` por item (sabores, adicionales, modificaciones, observaciones).
- Si no hay venta abierta: items = [].

Auto-refresh periódico (`getPdvMesasActivas()`) para detectar cambios concurrentes.

### 3. Agregar producto

User busca → dialog `producto-search-dialog` → selecciona producto.

Si producto tiene receta: abre `PersonalizarProductoDialog` (750px, 2 columnas):
- Izquierda: ingredientes opcionales (chips verde/rojo toggle), intercambiables (chip naranja + select alternativas), fijos (texto compacto).
- Derecha: adicionales con precio (chips verde con +valor), observaciones predefinidas (chips celeste), observación libre.
- Footer: cantidad +/-, desglose precio, total.

Si tipo ELABORADO_CON_VARIACION: abre `seleccionar-variacion-dialog` (3 pasos genéricos con labels configurables PIZZA/DEFAULT).

Si tipo COMBO o RETAIL: agregar directo.

`createVentaItem(...)` con `precioAdicionales` denormalizado. Crea sub-entidades en cascada.

### 4. Editar item

`edit-venta-item-dialog`: cantidad, descuento (fijo o %, chips rápidos 5/10/15/20/25/50%), redondeo a múltiplos de 500 Gs.

Marca original como MODIFICADO y crea versión nueva con vínculo `nuevaVersionVentaItem`. Historial JSON en `historialCambios`.

### 5. Cancelar item

Cambia estado a CANCELADO. `canceladoPor`, `horaCancelado`. NO se borra. NO suma al total.

### 6. Cobrar venta

`cobrar-venta-dialog` (80vw × 80vh):
- Top: totales por moneda con banderas y cotizaciones (`MonedaCambio.compraLocal`).
- Izq (55%): tabla de líneas de pago.
- Der (45%): botones moneda (F1-F3) + forma pago (F4-F7) + input valor + indicador PAGO/VUELTO.
- F9: Descuento/Aumento global (con `descuentoAutorizadoPor`).
- F10: Finalizar.

Soporta:
- Multi-pago (varias formas de pago en la misma venta).
- Multi-moneda (líneas en distintas monedas, vuelto en cualquier moneda).
- Cobro parcial (guarda líneas sin cerrar venta).
- División de cuenta (1-20 personas, auto-calcula).
- "Ver costo" (requiere credenciales).
- Cobro rápido (F2): cobra total en moneda principal + forma principal con un click.

Al confirmar:
- `Pago` + `PagoDetalle[]` (legacy entities, todavía se usan en ventas).
- `Venta.estado = CONCLUIDA`, `fechaCierre`, `pago_id`.
- `PdvMesa.estado = DISPONIBLE`, `venta = null`.
- `procesarStockVenta(ventaId)` (fire-and-forget — si falla, venta NO se revierte).
- Auto-impresión de ticket de venta si `PdvConfig.autoImprimirTicketVenta=true`: `updateVenta` dispara `printVentaTicketInternal(ventaId)` (ver `cocina-impresion.md`).

### 7. Cancelar venta completa

Dialog con motivo obligatorio:
- `Venta.estado = CANCELADA`, `descuentoMotivo = motivo`.
- Items ACTIVOS → CANCELADO.
- `revertirStockVenta(ventaId)` (marca movimientos `activo=false`).
- Mesa → DISPONIBLE.

### 8. Cierre de caja

User intenta cerrar caja → si hay ventas ABIERTA → alerta con lista (mesa #N).

Dialog cierre:
- Step 1: Conteo Cierre (billetes por moneda).
- Step 2: Resumen (ventas por forma de pago, conteo apertura, conteo cierre). **NO muestra diferencia** (medida anti-fraude).

Al confirmar:
- `Caja.estado = CERRADO`, `fechaCierre`.
- Muestra resumen post-cierre con diferencias (verde/amarillo/rojo según `umbralDiferenciaBaja/Alta`).

## Procesamiento de stock automático

`ventas.handler.ts:1826` (`procesarStockVenta(ventaId)`).

**Trigger**: fire-and-forget tras `updateVenta(CONCLUIDA)`. Si falla, no rollback de venta.

**Idempotente**: chequea movimientos activos para esa venta antes de procesar. Permite re-procesar si los anteriores fueron desactivados.

**Estrategia por tipo:**

```
RETAIL / RETAIL_INGREDIENTE (con controlaStock=true):
  cantidad_a_descontar = ventaItem.cantidad × presentacion.cantidad
  Crear StockMovimiento(VENTA, -cantidad)

ELABORADO_SIN_VARIACION:
  Por cada RecetaIngrediente:
    cantidad_ingrediente = (recetaIngrediente.cantidad × ventaItem.cantidad / receta.rendimiento) / (porcentajeAprovechamiento/100)
    Procesar recursivamente (ingrediente puede ser otro elaborado, max depth 3)

ELABORADO_CON_VARIACION:
  Buscar RecetaPresentacion correspondiente a la presentación vendida.
  Aplicar lógica ELABORADO_SIN_VARIACION sobre su receta.

COMBO:
  Iterar ComboProducto (componentes), recursión por tipo (max depth 2).
```

**Personalizaciones respetadas:**
- INGREDIENTE_REMOVIDO: no descuenta.
- INGREDIENTE_INTERCAMBIADO: descuenta el reemplazo.
- ADICIONAL con receta: descuenta sus ingredientes.

**Cancelación**: `revertirStockVenta(ventaId)` marca movimientos `activo=false`. Re-procesar si se rehabilita.

## Atajos de teclado

PdV principal:
- F1: Cobrar
- F2: Cobro rápido
- F3: Buscar productos
- F4: Cancelar venta
- F5: Pre-cuenta / imprimir
- ESC: deselecciona mesa / cierra modo delivery

Cobrar dialog:
- F1/F2/F3: monedas
- F4/F5/F6/F7: formas de pago
- F9: descuento/aumento
- F10: finalizar

## Página principal: `pdv.component.ts` (~2600 líneas)

`src/app/pages/ventas/pdv/`. Sub-componentes:
- `utilitarios-dialog/`: utilidades extra.

Patrón: master con paneles (mesas, tabla items, totales por moneda).

## Handler: `ventas.handler.ts` (~3000 líneas)

~123 handlers `ipcMain.handle(...)` organizados en grupos (más helpers internos como `autoPrintComandaIfNeeded`):
- Buffet métricas (`get-buffet-metricas`)
- PrecioDelivery
- Delivery (incluye `getDeliveriesByEstado`, `getDeliveriesByCaja`)
- Venta (CRUD + `getVentasByDateRange(desde, hasta, filtros?)`, `getResumenCaja`, `cerrarVentasAbiertasMesa`)
- VentaItem
- VentaItemObservacion / Adicional / IngredienteModificacion
- PdvGrupoCategoria / PdvCategoria / PdvCategoriaItem / PdvItemProducto
- PdvConfig (get / create / update)
- Reserva
- PdvMesa (incluye `createBatchPdvMesas`)
- Comanda (incluye `abrirComanda`, `cerrarComanda`, `createBatchComandas`, `getComandaWithVenta`)
- Sector
- Stock (`procesarStockVenta`, `revertirStockVenta`)
- PdvAtajoGrupo / PdvAtajoItem / PdvAtajoItemProducto
- VentaItemSabor

**Hooks de auto-impresión** (no son IPC, son helpers internos): `createVentaItem`/`updateVentaItem` llaman `autoPrintComandaIfNeeded`; `updateVenta(CONCLUIDA)` dispara el ticket de venta. Ambos respetan flags de `PdvConfig` y van por `documentos-tickets.handler.ts`. Ruteo de impresión por sector vía handlers `producto-sectores.handler.ts` y `sectores-impresoras.handler.ts`. KDS en `kds.handler.ts`.

→ Lista completa en [reference/handlers-index.md](../reference/handlers-index.md).

## Funcionalidades documentadas

→ Detalle completo en `docs/guia-funcionamiento-punto-de-venta.md` (727 líneas, 20 secciones).
→ Plan de implementación: `docs/PLAN-IMPLEMENTACION-PDV.md`.
→ Errores conocidos: `docs/testing/ERRORES-PDV.md`.
