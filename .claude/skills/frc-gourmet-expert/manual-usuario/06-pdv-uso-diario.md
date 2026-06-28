# Capítulo 6 — PdV: uso diario

El módulo más usado. Ventas en mesa, mostrador y delivery. Cobro multi-pago, multi-moneda. Gestión de comandas (cuentas individuales). Atajos de teclado.

## Pre-requisitos

- Tu usuario tiene rol con permiso de PdV.
- Hay productos con precio.
- Existe al menos un Dispositivo configurado (capítulo 2).
- Existe al menos una Forma de Pago.

## 1. Abrir el PdV

**Menu → Ventas → Dashboard → "Abrir PdV"** o desde tarjeta del Dashboard.

Si **NO tenés una caja abierta**, aparece un dialog: "¿Querés abrir una caja nueva?"

### Apertura de caja

Step 1: **Conteo Apertura**

Tabs por moneda. En cada moneda, ingresar cuántos billetes/monedas tenés:
- 100.000 PYG: 0
- 50.000 PYG: 5
- 20.000 PYG: 10
- 10.000 PYG: 20
- 5.000 PYG: 30
- 2.000 PYG: 0
- 1.000 PYG: 50
- 500 PYG: 100
- 100 PYG: 200

Sistema calcula total.

Step 2: **Resumen**

- Dispositivo (auto-detectado por MAC).
- Moneda principal.
- Conteo total.
- Confirmar → Caja queda **ABIERTA**.

Si rechazás abrir caja, la pestaña del PdV se cierra automáticamente.

## 2. Pantalla del PdV

```
┌────────────────────────────────────────────────────────────────────┐
│  CAJA #5 — Abierta hace 02:35 hs               [F1 COBRAR]         │
├────────────────────────────────────────┬───────────────────────────┤
│ MESA / COMANDA / DELIVERY              │  TABS: MESAS COMANDAS     │
│  Mesa 3 — 4 personas                   │  ATAJOS  CATEGORÍAS       │
│  [👤 Juan García]                      │                           │
│                                        │  ┌──┬──┬──┬──┬──┐         │
│ ┌──────────────────────────────────┐   │  │ 1│ 2│ 3│ 4│ 5│         │
│ │ Cant Producto         Total      │   │  ├──┼──┼──┼──┼──┤         │
│ │  1   Pizza Margherita 45.000     │   │  │ 6│ 7│ 8│ 9│10│         │
│ │  2   Coca 500ml        8.000     │   │  └──┴──┴──┴──┴──┘         │
│ │       (sub: 16.000)              │   │                           │
│ └──────────────────────────────────┘   │  Sector: ▼ Salón A        │
│                                        │                           │
│ Subtotal: 61.000                       │                           │
│ Total:    61.000                       │                           │
│                                        │                           │
│ [F3 BUSCAR PRODUCTO]                   │                           │
│ [F4 CANCELAR] [F2 COBRO RÁPIDO]        │                           │
└────────────────────────────────────────┴───────────────────────────┘
```

### Panel derecho: tabs

- **MESAS**: grid de mesas con número y estado (verde=disponible, rojo=ocupada).
- **COMANDAS**: si están habilitadas, tarjetas físicas con número/código.
- **ATAJOS**: botones rápidos configurados.
- **CATEGORÍAS**: items visuales con imagen (UI parcial).

### Panel izquierdo: detalle de la venta activa

- Datos de mesa / comanda / delivery.
- Cliente vinculado (opcional).
- Tabla de items de la venta.
- Totales por moneda.
- Botones de acción.

## 3. Seleccionar mesa

Click en mesa disponible (verde) → se selecciona y carga sus datos:
- Si la mesa NO tiene venta abierta: tabla items vacía, totales 0.
- Si la mesa YA tiene venta abierta: carga items existentes.

La mesa pasa a OCUPADO al agregar el primer item.

### Filtrar mesas por sector

Selector "Sector" en el panel derecho:
- "Todos" → muestra todas.
- "Salón A" → solo mesas del salón A.

### Reservar mesa (UI parcial)

Si la mesa tiene reserva, aparece icono. (Sistema completo: TODO.)

## 4. Agregar productos

### Buscar y agregar

1. Tab "ATAJOS" o "CATEGORÍAS" → click en el producto.
2. O **F3** o botón "Buscar producto" → dialog de búsqueda → escribir nombre → seleccionar.

**Atajos rápidos**:
- Escribir cantidad antes con `*`: `3*` + buscar pizza → agrega 3 pizzas.

### Si producto tiene receta — Personalizar

Aparece dialog "Personalizar producto":

**Columna izquierda — Ingredientes**:
- Verde (incluido) / Rojo (removido) — click para toggle (solo opcionales).
- Naranja (intercambiado) — usar select para elegir alternativa.
- Texto compacto: ingredientes fijos (no interactivos).

**Columna derecha — Extras y observaciones**:
- Adicionales con precio (chips verde con +valor) — click para seleccionar.
- Observaciones predefinidas (chips celeste).
- Campo de observación libre.

**Footer**:
- Selector cantidad +/-.
- Desglose precio.
- Total.

Click "Agregar" → se suma al carrito.

### Si producto tiene variaciones (multi-sabor) — Pizza

Aparece dialog "Seleccionar variación":

Step 1: Elegir tamaño (Mediana / Grande).
Step 2: Elegir sabor(es) — máximo 2 según `PdvConfig.pizzaMaxSabores`.
Step 3: Personalizar (igual que arriba, pero por sabor).

Confirmar → se agrega con `cantidadSabores=2`, `proporcion=0.5` cada uno.

**Cálculo del precio**:
- Si `pizzaEstrategiaPrecio = MAYOR_PRECIO`: el más caro de los sabores.
- Si `pizzaEstrategiaPrecio = PROMEDIO`: promedio.

## 5. Editar item

Click en menu **⋮** del item → **"Editar"**.

Dialog `Editar item`:
- Cantidad.
- Descuento (fijo o %, chips rápidos: 5/10/15/20/25/50%).
- Redondeo a múltiplos de 500 PYG.
- Observaciones libres.

Guardar → el original se marca como **MODIFICADO**, se crea una versión nueva. El total cuenta la versión nueva.

## 6. Cancelar item

Click ⋮ → **"Cancelar"**.

Estado item → CANCELADO. Aparece tachado en la tabla. NO suma al total.

No se borra (queda en historial con `canceladoPor`, `horaCancelado`).

## 7. Cliente

### Asignar nombre rápido

Click "👤 Nombre" en card de mesa → ingresar nombre → guardar.

Se guarda en `Venta.nombreCliente` (sin crear cliente registrado).

### Vincular cliente registrado

Click ícono de buscar (🔍 con persona) → buscar por nombre, RUC, teléfono → seleccionar.

Útil para clientes habituales que están registrados.

## 8. Cobrar venta

**F1** o botón "COBRAR".

Dialog `Cobrar venta`:

**Top**: totales en cada moneda configurada (con banderas y cotizaciones).

**Izquierda (55%)**: tabla de líneas de pago.

**Derecha (45%)**: botones de monedas (F1-F3) + formas de pago (F4-F7) + input valor + indicador PAGO/VUELTO.

### Agregar línea de pago

1. Elegir moneda (click botón o F1/F2/F3).
2. Elegir forma de pago (F4-F7).
3. Ingresar monto.
4. **Enter** → se agrega la línea.

Soporta multi-pago: una venta puede pagarse parcialmente con tarjeta + el resto en efectivo.

### Vuelto

Si el monto pagado > total → aparece "VUELTO" automáticamente. Podés:
- Devolverlo en efectivo.
- Pasarlo como crédito (vuelto en otra moneda → línea VUELTO).

### Descuento / aumento global

**F9** → dialog dedicado:
- Porcentaje o monto fijo.
- Redondeo automático.
- Motivo (obligatorio).
- Autorizado por: usuario actual o seleccionar otro.

### Cobro rápido (F2)

Atajo: cobra todo en moneda principal + forma principal con un click. Útil para mostrador rápido.

### División de cuenta

Botón "Dividir cuenta" → dialog:
- Personas: 2 a 20.
- Auto-calcula monto por persona.

### Ver costo

Botón "Ver costo" → pide credenciales → muestra costo total y margen. Solo lo ve quien tiene permiso.

### Finalizar (F10)

- Venta pasa a CONCLUIDA.
- Pago a PAGADO.
- Mesa libera (DISPONIBLE).
- Stock se descuenta automáticamente (en background).
- Tab del PdV se limpia.

## 9. Cancelar venta completa

Botón "Cancelar venta" o **F4**.

Dialog con motivo obligatorio. Al confirmar:
- Venta → CANCELADA.
- Items → CANCELADO.
- Mesa libera.
- Stock revierte (movimientos `activo=false`).

## 10. Comandas

Si están habilitadas (`PdvConfig.comandasHabilitadas = true`):

Tab "COMANDAS" en el PdV. Tarjetas con código de barras (CMD-001, CMD-002...).

### Crear comandas en lote

**Menu → Ventas → Dashboard → "Gestionar Comandas"** → "Creación masiva":
- Cantidad: 100.
- Prefijo: CMD.
- Generates CMD-001, CMD-002, ..., CMD-100.

### Abrir comanda

Click en comanda DISPONIBLE → dialog ligero:
- Mesa (opcional, se auto-popula sector).
- Sector.
- Observación.

Comanda → OCUPADO. Trabajás en ella como si fuera una mesa.

### Cobrar comanda

Igual que mesa. Al cobrar, comanda libera automáticamente (DISPONIBLE).

## 11. Delivery

Botón "DELIVERY" en el PdV.

Dialog `Lista de Delivery` (90vw × 85vh):
- Filtro por estado.
- "+ NUEVO DELIVERY".

### Nuevo delivery

Dialog "Crear delivery":
- **Teléfono** (autocomplete por debounce 400ms con clientes existentes).
- Nombre, dirección.
- Precio delivery (zona).
- Observación.
- Cobro anticipado (✅).

Si el teléfono no existe → al confirmar se crea Persona + Cliente automáticamente.

Click confirmar → crea Delivery (estado ABIERTO) + Venta vacía. Entrás en **modo delivery** del PdV (mesas deshabilitadas).

### Estados de delivery

```
ABIERTO         (acaba de crearse)
   ↓ botón LISTO
PARA_ENTREGA    (listo para enviar al repartidor)
   ↓ botón ENVIAR
EN_CAMINO       (repartidor en camino)
   ↓ botón FINALIZAR (si no cobrado, abre cobro primero)
ENTREGADO       (cliente recibió)

   o CANCELADO desde cualquier estado (con motivo).
```

### Timer de espera

Junto a cada delivery, un timer cuenta el tiempo desde apertura:
- Sin color: < 30 min (configurable).
- Amarillo: 30-60 min.
- Rojo: > 60 min.
- Sin color: ENTREGADO/CANCELADO.

## 12. Cierre de caja

Botón "CERRAR CAJA" (en panel derecho).

Si hay ventas ABIERTAS: alerta "Las siguientes mesas tienen venta abierta: Mesa 3, Mesa 5..." → debes cobrar/cancelar todas primero.

Dialog:
- **Step 1**: Conteo Cierre (igual que apertura, ingresar billetes por moneda).
- **Step 2**: Resumen (ventas por forma de pago + conteo apertura + conteo cierre). **No se muestra diferencia** (medida anti-fraude).

Al confirmar:
- Caja → CERRADO, fechaCierre.
- **Resumen post-cierre** con diferencias:
  - Verde: ≤5%.
  - Amarillo: 5-15%.
  - Rojo: >15%.
- Tab del PdV se cierra.

## 13. Atajos de teclado

PdV principal:
- **F1**: Cobrar
- **F2**: Cobro rápido
- **F3**: Buscar productos
- **F4**: Cancelar venta
- **F5**: Pre-cuenta / imprimir (TODO impresión real)
- **ESC**: Deselecciona mesa / cierra modo delivery

Dialog Cobrar:
- **F1/F2/F3**: monedas
- **F4-F7**: formas de pago
- **F9**: descuento/aumento
- **F10**: finalizar

## 14. Historial de ventas

**Menu → Ventas → Dashboard → "Listado de ventas"** o desde el PdV.

Filtros:
- Rangos rápidos: HOY, ESTA SEMANA, ESTE MES, ÚLTIMO TRIMESTRE.
- Datepicker desde / hasta.
- Estado (ABIERTA / CONCLUIDA / CANCELADA).
- Caja específica.
- Mozo / vendedor (autocomplete).
- Forma de pago, moneda, rango de valores.
- Mesa.
- Con descuento / aumento.

Acciones:
- Ver detalle (dialog 80vw × 80vh con cards completas).
- Cancelar venta (CONCLUIDA → CANCELADA).
- Rehabilitar venta cancelada.

## 15. Otros módulos de Ventas

Además del PdV, el menú **Ventas** incluye:

- **Buffet por kilo** (`Ventas → Buffet por kilo`): pantalla pensada para vender comida por peso (el producto se pesa y se cobra según el precio por kilo).
- **KDS — Cocina** (`Ventas → KDS — Cocina`): pantalla de cocina (Kitchen Display System) donde el personal de cocina ve los pedidos a preparar en tiempo real, sin papel.
- **Pantallas KDS** (`Ventas → Pantallas KDS`): configuración de las pantallas de cocina (qué sectores/productos muestra cada una).

Estos módulos dependen de permisos y de la configuración del local; pueden no estar visibles si tu negocio no los usa.

## 16. Errores comunes

### "No puedo abrir caja"

- Verificá que no tengas una caja abierta de un día anterior. Cerrala primero.
- El dispositivo debe tener `isCaja=true`.

### "El producto no aparece en el buscador"

- Verificá `esVendible=true` en el producto.
- Verificá que esté `activo=true`.

### "Stock no se descontó"

- Para combo / elaborado: verificá que la receta tenga ingredientes con `controlaStock=true`.
- El descuento es fire-and-forget — si falló, podés re-procesar (consultar admin).

### "Mesa quedó OCUPADA sin venta"

→ [workflows/verificacion-bd-sqlite.md](../../workflows/verificacion-bd-sqlite.md): query manual para liberarla.

### "El cobro está rechazando una moneda"

- Verificá que la caja tenga esa moneda configurada (CajaMoneda).
- Verificá que el tipo de cambio (MonedaCambio) esté activo.

---

**Próximo capítulo →** [07 — Compras y proveedores](07-compras-y-proveedores.md)
