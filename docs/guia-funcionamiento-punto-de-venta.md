# Guia de Funcionamiento - Punto de Venta (PdV)

Este documento describe todas las funciones del Punto de Venta y el estado actual de implementacion de cada una.

> **Ultima revision contra codigo: 2026-07-11.** Novedades respecto de la revision anterior (jun 2026): cobro a credito (cuenta por cobrar + cuotas + pagare), Finalizar + Ticket (F11), ajuste global con redondeo a 500 y alerta de venta a perdida, maquina POS / cuenta bancaria por forma de pago, factura desde el cobro, gate de cobro por dispositivo (caja compartida), buffet por peso + balanza EAN-13, Utilitarios (retiros / gastos / ultimas ventas).

---

## 1. GESTION DE CAJA

### 1.1 Apertura de Caja
- **Descripcion:** Al abrir el PdV se verifica si el usuario actual tiene una caja abierta. Si no hay caja abierta se muestra un dialogo preguntando si desea abrir una nueva.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `ngOnInit()`
- **Notas:** Si el usuario rechaza abrir una caja, se cierra la tab del PdV automaticamente. El dialogo de apertura tiene 2 steps: Conteo Apertura → Resumen. El dispositivo se muestra en el header (auto-detectado).

### 1.2 Informacion de Caja Activa
- **Descripcion:** Se muestra en el panel derecho la informacion de la caja abierta: ID, fecha de apertura, tiempo abierto y estado.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.html` - seccion `caja-data-card`
- **Notas:** El tiempo abierto se actualiza automaticamente cada 60 segundos.

### 1.3 Cierre de Caja
- **Descripcion:** Permite cerrar la caja actual, realizando un conteo final de billetes y generando un resumen con diferencias.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `cerrarCaja()`, `create-caja-dialog.component.ts`
- **Flujo:**
  1. Verifica si hay ventas abiertas → si hay, muestra alerta con lista
  2. Abre dialogo de cierre (mismo componente que apertura, modo cierre)
  3. Salta directo al step de Conteo Cierre (billetes por moneda)
  4. Step Resumen muestra: ventas por forma de pago, conteo apertura, conteo cierre
  5. **Diferencia NO se muestra antes del cierre** (medida de seguridad anti-fraude)
  6. Al confirmar cierre: caja pasa a CERRADO, muestra resumen post-cierre con diferencias (sobrante verde, faltante rojo)
  7. Tab del PdV se cierra automaticamente

---

## 2. GESTION DE MESAS

### 2.1 Visualizacion de Mesas
- **Descripcion:** Grid de botones numerados representando las mesas del local. Se muestra estado con colores (disponible, ocupada, reservada).
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.html` - seccion `tables-grid`
- **Entidad:** `PdvMesa` (numero, cantidad_personas, activo, reservado, estado, sector, reserva, venta)
- **Estados posibles:** DISPONIBLE, OCUPADO

### 2.2 Seleccion de Mesa
- **Descripcion:** Al hacer click en una mesa, se selecciona y se cargan sus datos (venta activa, items, nombre cliente).
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `selectMesa()`, `loadVentaItems()`

### 2.3 Filtro por Sector
- **Descripcion:** Las mesas pueden filtrarse por sector (zonas del local).
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `loadMesasBySector()`, `resetMesasFilter()`
- **Entidad:** `Sector` (nombre, activo, mesas[])

### 2.4 Administracion de Mesas (ABM)
- **Descripcion:** Dialogo para crear, editar y eliminar mesas desde el dashboard de ventas.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv-mesa-dialog.component.ts`, se abre desde `ventas-dashboard.component.ts` - `openPdvMesasDialog()`

### 2.5 Reserva de Mesas
- **Descripcion:** Sistema de reservas asociado a mesas con datos de cliente, fecha/hora, cantidad de personas y observaciones.
- **Estado:** PARCIALMENTE IMPLEMENTADO (solo entidad)
- **Entidad:** `Reserva` (cliente, nombre_cliente, numero_cliente, fecha_hora_reserva, cantidad_personas, motivo, observacion, activo)
- **Pendiente:**
  - UI para crear/gestionar reservas
  - Visualizacion de reservas en el calendario
  - Notificaciones de reservas proximas

---

## 3. GESTION DE VENTAS

### 3.1 Crear Venta
- **Descripcion:** Al agregar el primer producto a una mesa sin venta activa, se crea automaticamente una nueva venta asociada a la mesa y la caja actual.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `getVenta()`
- **Entidad:** `Venta` (cliente, estado, nombreCliente, formaPago, caja, pago, delivery, mesa, items[], fechaCierre)
- **Estados de venta:** ABIERTA, CONCLUIDA, CANCELADA

### 3.2 Nombre de Cliente
- **Descripcion:** Permite agregar/editar un nombre de cliente a la venta. Se guarda con capitalize automatico. Al agregar nombre a mesa sin venta se crea la venta automaticamente.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `startEditingClienteName()`, `saveClienteName()`, `cancelEditingClienteName()`
- **Limpieza:** Al cancelar venta, cobrar o cobro rapido, el nombre se limpia y la mesa se desocupa completamente.

### 3.3 Asociar Cliente Registrado
- **Descripcion:** Vincular la venta a un cliente existente en el sistema mediante busqueda.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `asociarCliente()`, `buscar-cliente-dialog.component.ts`
- **Notas:** Boton de busqueda de cliente (`person_search`) en el card de info de mesa. Abre dialogo con busqueda por nombre, RUC o telefono.

### 3.4 Concluir/Cerrar Venta (Cobro)
- **Descripcion:** Proceso completo de cobro multi-pago con soporte multi-moneda.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `cobrar-venta-dialog.component.ts`
- **Detalle:** Ver seccion 6 (Cobrar Venta)

### 3.5 Cancelar Venta
- **Descripcion:** Cancelar toda la venta con motivo obligatorio, marcandola como CANCELADA y liberando la mesa.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `cancelarVenta()`
- **Detalle:** Ver seccion 7 (Cancelar Venta)

---

## 4. GESTION DE ITEMS DE VENTA

### 4.1 Buscar y Agregar Productos
- **Descripcion:** Busqueda de productos mediante dialogo. Soporta cantidad con atajo de teclado (ej: `3*` para cantidad 3) y Enter para buscar. Tras agregar, la cantidad del buscador se resetea a 1.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `openProductSearchDialog()`, `onSearchKeyDown()`, `addProduct()`, `resetBuscador()`
- **Componente:** `ProductoSearchDialogComponent`
- **Despacho por tipo de producto (`addProduct`):**
  - **BUFFET_POR_PESO** -> `addBuffetPorPesoItem()` (ver 4.10)
  - **ELABORADO_CON_VARIACION** -> `SeleccionarVariacionDialogComponent` -> `addVariacionItem()` (crea VentaItem + un `VentaItemSabor` por sabor)
  - Producto con receta (ELABORADO_SIN_VARIACION) -> `PersonalizarProductoDialogComponent` antes de agregar (ver 4.8)
  - COMBO / RETAIL sin receta -> se agrega directo
- **Notas:** Si no hay mesa/comanda/venta-rapida seleccionada al agregar, se muestra dialogo de seleccion de mesa. Antes de abrir el buscador se intenta leer una etiqueta de balanza (ver 4.10). Accesos rapidos (atajos): `onAtajoItemClick()` abre `AtajoProductosDialogComponent`.

### 4.2 Tabla de Items
- **Descripcion:** Tabla expandible que muestra los items de la venta: producto, presentacion/cantidad, precio unitario (con descuento y adicionales aplicados) y total.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.html` (tabla `pdv-items-table`, `multiTemplateDataRows`)
- **Columnas:** `productoNombre`, `cantidad`, `precio`, `total`, `actions` (+ `select` al frente en modo mover items)
- **Entidad:** `VentaItem` (venta, precioCostoUnitario, precioVentaUnitario, precioAdicionales, cantidad, descuentoUnitario, estado, canceladoPor, horaCancelado, modificado, modificadoPor, horaModificacion, nuevaVersionVentaItem, ensambladoDescripcion, recetaPresentacion, cantidadSabores, y campos de buffet)
- **Nombre mostrado:** `ensambladoDescripcion || producto?.nombre` (la descripcion ensamblada de variaciones tiene prioridad)
- **Estados de item:** ACTIVO (cuenta al total), MODIFICADO, CANCELADO (no cuenta, fila con clase `item-cancelado`)
- **Indicador de personalizacion:** Icono `tune` junto al nombre si tiene adicionales/modificaciones/observaciones. Fila con clase `item-personalizado` (resalte).
- **Calculo de precio:** `(precioVentaUnitario + precioAdicionales - descuentoUnitario) * cantidad`

### 4.3 Detalle Expandido de Item
- **Descripcion:** Al hacer click en un item se expande mostrando personalizaciones y metadata compacta.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.html` - seccion `expandedDetail`
- **Contenido:**
  - Chips de ingredientes removidos (rojo), intercambiados (naranja), adicionales (verde con precio), observaciones (celeste)
  - Descuento condensado en chip naranja si aplica
  - Metadata en una sola linea: usuario, estado, hora, info cancelacion/modificacion

### 4.4 Cancelar Item
- **Descripcion:** Cambia el estado del item a CANCELADO, registrando quien lo cancelo y la hora. El item cancelado no se suma al total.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `cancelItem()`

### 4.5 Eliminar Item
- **Descripcion:** Elimina completamente el item de la venta y de la base de datos.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `removeItem()`

### 4.6 Editar Item
- **Descripcion:** Permite modificar cantidad, precio, descuento y observaciones del item. Soporta descuento fijo o porcentual con chips rapidos. Redondeo a multiplos de 500 Gs. Historial de cambios en JSON.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `editItem()`, `edit-item-dialog.component.ts`

### 4.7 Descuentos por Item
- **Descripcion:** Cada item tiene campo `descuentoUnitario` que se resta del precio unitario al calcular totales. Se aplica desde el dialogo de editar item.
- **Estado:** IMPLEMENTADO
- **Notas:** Soporta descuento fijo y porcentual con chips (5%, 10%, 15%, 20%, 25%, 50%).

### 4.8 Personalizar Producto (Variaciones)
- **Descripcion:** Al agregar un producto que tiene receta, se abre un dialogo de personalizacion que permite modificar ingredientes, agregar extras y observaciones antes de confirmar.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `personalizar-producto-dialog.component.ts`, `pdv.component.ts` - `addProduct()`, `personalizarItem()`
- **Dialogo (750px, 2 columnas):**
  - **Columna izquierda (Ingredientes):**
    - Ingredientes opcionales: chips verde (incluido) / rojo (removido), click para toggle
    - Ingredientes intercambiables: chip naranja cuando intercambiado, mat-select con alternativas
    - Ingredientes fijos: texto compacto (no interactivo) al final como referencia
  - **Columna derecha (Extras + Observaciones):**
    - Adicionales: chips con precio (+valor), verde cuando seleccionado, agrupados por categoria
    - Observaciones predefinidas: chips celeste cuando seleccionado
    - Campo de observacion libre
  - **Footer:** Selector de cantidad (+/-), desglose de precio, total
  - **Boton contextual:** "AGREGAR" para items nuevos, "GUARDAR" para edicion
- **Persistencia (3 entidades):**
  - `VentaItemAdicional` — adicionales seleccionados con precio snapshot (precioCobrado)
  - `VentaItemIngredienteModificacion` — ingredientes removidos (REMOVIDO) o intercambiados (INTERCAMBIADO con ingredienteReemplazo)
  - `VentaItemObservacion` — observaciones predefinidas y libres (ya existia)
  - `VentaItem.precioAdicionales` — columna con total de adicionales (denormalizado)
- **Flujo agregar:** Producto con receta → dialogo → confirmar → crear VentaItem con precioAdicionales → persistir modificaciones/adicionales/observaciones
- **Flujo editar:** Menu del item → "Personalizar" → carga selecciones existentes → editar → guardar → limpia anteriores y persiste nuevas
- **Productos sin receta:** Saltan el dialogo y se agregan directo al carrito
- **Acceso desde menu:** Opcion "Personalizar" en el mat-menu de acciones de cada item

### 4.9 Menu de Acciones del Item
- **Descripcion:** Menu contextual (mat-menu) en cada item con opciones.
- **Estado:** IMPLEMENTADO
- **Opciones:** Personalizar (`tune`), Editar (`edit`), Cancelar (`cancel`). No hay opcion Eliminar en el menu (aunque `removeItem()` existe en el TS).

### 4.10 Buffet por Peso (venta por kilo)
- **Descripcion:** Productos tipo `BUFFET_POR_PESO` se venden por peso. El item guarda `cantidad = kg neto` y `precioVentaUnitario = precio/kg efectivo`.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `addBuffetPorPesoItem()`, `tryHandleBalanzaScan()`; `PesajeBuffetDialogComponent`
- **Flujo:**
  - Resuelve el precio vigente con `resolverPrecioVigente` (precios programados por dia/horario)
  - Abre `PesajeBuffetDialogComponent` (peso bruto/tara -> neto)
  - Persiste `VentaItem` con campos de peso reales: `pesoBruto`, `pesoTara`, `pesoNeto` (gramos), `precioPorKg`, `aplicoLibre` (true si aplico el tope "buffet libre")
- **Escaneo de etiqueta de balanza (EAN-13):** `tryHandleBalanzaScan` -> `parseEtiquetaBalanza` usa config de PdvConfig (`balanzaPrefijo` def '2', `balanzaModo` PESO/PRECIO, `balanzaFactorPeso`). Si el codigo resuelve a un producto buffet, agrega el item con el peso de la etiqueta sin abrir el buscador.
- **Backend:** descuento de stock por `processBuffetPorPeso` (por receta si `descuentaPorReceta`, si no por kg neto del propio producto; stock cargado via Produccion). Metricas en `get-buffet-metricas` -> dashboard buffet.
- **Detalle:** ver `docs/buffet-por-kilo.md`

---

## 5. GESTION DE MONEDAS Y TOTALES

### 5.1 Totales Multi-Moneda
- **Descripcion:** Se muestran los totales de la venta convertidos a cada moneda configurada en la caja, usando los tipos de cambio vigentes.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `calculateTotals()`, `loadCajaMonedasConfig()`, `loadExchangeRates()`
- **Notas:** Se usa la moneda principal como base y se convierte a las demas usando `MonedaCambio.compraLocal`.

### 5.2 Saldos por Moneda
- **Descripcion:** Se muestra el saldo pendiente en cada moneda. Se actualiza con pagos parciales del dialogo de cobro.
- **Estado:** IMPLEMENTADO
- **Notas:** El saldo se calcula correctamente con pagos parciales y vueltos.

### 5.3 Banderas de Moneda
- **Descripcion:** Se muestran las banderas de cada moneda junto al total, con fallback a base64, URL de bandera, o placeholder.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.html` - seccion `currency-totals`

---

## 6. COBRAR VENTA

### 6.1 Dialogo de Cobro
- **Descripcion:** Dialogo completo de cobro (~80vw x 80vh) con soporte multi-pago y multi-moneda.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `src/app/shared/components/cobrar-venta-dialog/cobrar-venta-dialog.component.ts` (+ `.html`)
- **Importante (arquitectura):** el cobro NO crea entidades en `ventas.handler.ts`. Usa `createPago`/`createPagoDetalle`/`updatePago` (definidos en `compras.handler.ts`, compartidos) y cierra la venta con `updateVenta(CONCLUIDA)`.
- **Estructura:**
  - Barra de cliente: si no hay cliente, autocomplete de busqueda + boton "Nuevo cliente" (crea Persona+Cliente); el cliente se asigna en vivo con `updateVenta`.
  - Barra superior con totales por moneda, banderas y cotizaciones (`MonedaCambio.compraLocal`)
  - Panel izquierdo (55%): tabla de lineas de pago (`numero, moneda, formaPago, valor, tipo, actions`). Menu por linea: observacion, duplicar, editar valor, eliminar (via `edit-detalle-dialog.component.ts`). La columna forma de pago muestra tags de maquina POS / cuenta bancaria.
  - Panel derecho (45%): botones de monedas (F1-F3), formas de pago (F4-F7), selector de Maquina POS, selector de Cuenta Bancaria, y bloque de division de cuenta.
  - Formulario: select moneda + select forma pago + input valor + indicador PAGO/VUELTO
- **Atajos de teclado:** F1-F3 monedas, F4-F7 formas de pago, F9 descuento/aumento, F10 Finalizar (sin ticket), F11 Finalizar + Ticket. No hay F8.
- **Botones de accion:** Finalizar (F10), Finalizar + Ticket (F11), Cobro Parcial, Cobrar a credito, Descuento/Aumento (F9), Factura, Cancelar.
- **Funcionalidades:**
  - Multi-pago y multi-moneda; vuelto automatico cuando pago > total; vuelto en cualquier moneda
  - Cada linea de pago se persiste inmediatamente en DB (`createPagoDetalle` al agregar)
  - Tolerancia de redondeo en monedas con decimales: un residuo menor a la unidad minima convertida se considera saldo cero (habilita Finalizar aunque pagos en R$/USD no cuadren exacto en Gs)
  - Cobro parcial: guarda lineas sin cerrar la venta (Pago queda ABIERTO)
  - Ver costo (requiere credenciales via `edit-detalle-dialog` modo password + `validateCredentials`; muestra costo total y margen)
  - Cobro rapido (F2, desde `pdv.component`): cobra total en moneda + forma principal con un click

### 6.2 Maquina POS y Cuenta Bancaria por forma de pago
- **Descripcion:** Las formas de pago pueden tener maquinas POS (`FormasPago.maquinasPos`) y/o cuentas bancarias (`.cuentasBancarias`) asociadas.
- **Estado:** IMPLEMENTADO
- **Comportamiento:**
  - El selector aparece si hay >=1 y es OBLIGATORIO elegir si hay >=2 (con 1 sola se auto-selecciona)
  - Elegir POS/cuenta ajusta automaticamente la moneda del pago a la de la cuenta bancaria asociada
  - Al finalizar: cada linea PAGO con POS -> `createAcreditacionPos`; con cuenta bancaria -> `acreditarTransferenciaBancaria` (ambos no bloqueantes, en `banking.handler.ts`)

### 6.3 Descuento / Aumento global (F9)
- **Descripcion:** Ajuste global sobre el total de la venta.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `ajuste-cobrar-dialog.component.ts` (400px, siempre en moneda principal)
- **Campos:** tipo descuento|aumento, modo porcentaje|monto (chips 5/10/15/20/25/50%), redondeo a multiplos de 500 Gs (arriba/abajo/exacto)
- **Alerta:** si es descuento y el nuevo total < costo total, avisa venta a perdida
- **Resultado:** devuelve `{valor, motivo}` (valor POSITIVO = descuento, NEGATIVO = aumento); se persiste como `PagoDetalle` tipo DESCUENTO/AUMENTO
- **Nota:** NO pide password (la unica autorizacion por credenciales del flujo es "Ver costo")

### 6.4 Cobro a credito
- **Descripcion:** Cierra la venta como cuenta por cobrar del cliente, con cuotas.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `cobrar-credito-dialog.component.ts` (720px)
- **Requisitos:** cliente asignado con `credito` habilitado y saldo pendiente
- **Formulario:** cantidad de cuotas (1-60), frecuencia (30 mensual / 15 quincenal / 7 semanal), fecha inicio, descripcion; preview de saldo proyectado vs `limite_credito` y de cuotas
- **Pagare:** pregunta si imprimir pagare (`imprimir-pagare-dialog.component.ts`)
- **Backend:** llama `cobrarVentaCredito(payload)` (handler en `cuentas-por-cobrar.handler.ts`), que en una transaccion: get-or-create `FormaPago` CREDITO (`movimentaCaja=false`), crea Pago PAGADO + PagoDetalle, cierra la venta CONCLUIDA, crea la `CuentaPorCobrar` (CREDITO_VENTA) + cuotas, imprime ticket/pagare. Si excede el limite devuelve `{requiereConfirmacion:true}` -> confirmacion -> reintento con `forzar`.
- **Nota:** por este camino el front NO crea Pago/PagoDetalle (lo hace el backend).

### 6.5 Emitir factura desde el cobro
- **Descripcion:** Boton "Factura" abre el dialogo de facturacion legal precargado con el cliente y los items del cobro.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `facturar()` -> `FacturarDialogComponent` (1000px)
- **Nota:** NO finaliza el cobro; es una accion independiente.

### 6.6 Division de cuenta
- **Descripcion:** Campo para dividir el total entre N personas (1-20).
- **Estado:** INFORMATIVO
- **Comportamiento:** autocompleta el input con el valor por persona; sugiere registrar cada pago individual con el nombre en la observacion. NO divide realmente el cobro ni crea multiples pagos automaticamente.

### 6.7 Gate de cobro por dispositivo (caja compartida multi-dispositivo)
- **Descripcion:** Con una caja compartida entre varios dispositivos, solo el dispositivo dueño de la caja puede cobrar.
- **Estado:** IMPLEMENTADO
- **Comportamiento:**
  - `createPago` con flag `validarDispositivoCaja:true` valida que el dispositivo actual sea dueño de la caja; si difiere lanza `COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO`
  - En el PdV, `puedeCobrar` desactiva el boton Cobrar en dispositivos que no son dueños de la caja: pueden lanzar items pero no cobrar

### 6.8 Finalizacion (contado)
- **Al finalizar (`finalizar`):**
  - `Pago.estado` -> PAGADO; `Venta.estado` -> CONCLUIDA, `formaPago` = forma de pago dominante, `pago` vinculado, `fechaCierre` registrado
  - Flag interno `__imprimirTicketVenta` (F10=false / F11=true) controla la impresion del ticket por encima de `PdvConfig.autoImprimirTicketVenta`
  - `PdvMesa.estado` -> DISPONIBLE, `venta` -> null (comanda vuelve a DISPONIBLE si aplica)
  - `procesarStockVenta(ventaId)` fire-and-forget (si falla, la venta NO se revierte)
  - Hook KDS en `updateVenta`: CONCLUIDA marca `ComandaItem` activos como ENTREGADO; CANCELADA como CANCELADO

---

## 7. CANCELAR VENTA

- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `cancelarVenta()`, `cancelar-venta-dialog.component.ts`
- **Flujo:** Dialogo con warning → motivo obligatorio → confirmar → venta CANCELADA, items CANCELADOS, mesa DISPONIBLE, UI limpia.

---

## 8. TRANSFERIR MESA

- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts`, `transferir-mesa-dialog.component.ts`
- **Funcionalidades:**
  - Muestra TODAS las mesas (excepto la actual)
  - Transferir a mesa libre → venta se mueve completa (items, pago, cliente)
  - Transferir a mesa ocupada → items se fusionan, pago y nombre se transfieren
  - Mesa origen vuelve a DISPONIBLE
  - **Deshabilitado en modo delivery**

---

## 9. MOVER ITEMS

- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts`
- **Funcionalidades:**
  - Modo seleccion con checkboxes en tabla
  - Checkbox header selecciona/deselecciona todos
  - Si todos seleccionados → opcion "Transferir mesa completa"
  - Si parcial → abre selector de mesa y mueve items seleccionados
  - Si mesa origen queda sin items → se desocupa
  - **Deshabilitado en modo delivery**

---

## 10. PRE-CUENTA / IMPRIMIR

- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `imprimirPreCuenta()`, `reimprimirComanda()`
- **Notas:** Imprime en impresora termica via handler `print-precuenta` (`documentos-tickets.handler.ts`).
  La impresion fisica usa `node-thermal-printer` con ruteo por sector (`SectorImpresora`). Tambien se
  reimprime la comanda con `print-comanda` (forceReprint).

---

## 11. ASOCIAR CLIENTE

### 11.1 Nombre de cliente en mesa
- **Estado:** IMPLEMENTADO
- **Notas:** Campo editable en card de mesa (fila 2, layout compacto). Se guarda con capitalize. Se limpia al cobrar, cancelar o cobro rapido.

### 11.2 Busqueda de cliente registrado
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `asociarCliente()`, `buscar-cliente-dialog.component.ts`
- **Notas:** Boton `person_search` en el card de mesa. Abre dialogo con tabla de clientes, busqueda por nombre, RUC o telefono.

### 11.3 Card de Info de Mesa (layout compacto)
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.html` - `mesa-data-card mesa-compact`
- **Layout 2 filas:**
  - Fila 1: Numero de mesa (bold) + capacidad + sector + badge de estado (alineado a la derecha)
  - Fila 2: Icono persona + nombre cliente (o boton "Nombre" para agregar) + botones editar/buscar. Espacio para futuros iconos (cumpleanos, eventos, etc.)

---

## 12. ATAJOS DE TECLADO

- **Estado:** IMPLEMENTADO
- **PdV principal:**
  - F1 → Cobrar (si hay venta activa con items)
  - F2 → Cobro rapido
  - F3 → Busqueda de productos
  - F4 → Cancelar venta
  - F5 → Pre-cuenta / imprimir
  - ESC → Deselecciona mesa / cierra modo delivery (prioridad)
- **Dialogo de cobro:**
  - F1/F2/F3 → Seleccionar moneda por orden
  - F4/F5/F6/F7 → Seleccionar forma de pago por orden
  - F9 → Descuento/Aumento
  - F10 → Finalizar cobro (sin ticket)
  - F11 → Finalizar cobro + imprimir ticket
  - (No hay F8)
- **Notas:** Atajos NO se disparan cuando hay un dialogo abierto ni cuando el host del PdV no esta visible (evita fugas entre pestañas). Tooltips visibles en botones.

---

## 13. DELIVERY

### 13.1 Acceso
- **Descripcion:** Boton DELIVERY en el PdV abre el dialogo principal de gestion de deliveries.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `openDelivery()`, `delivery-dialog.component.ts`

### 13.2 Dialogo Principal de Delivery
- **Descripcion:** Dialogo 90vw x 85vh con layout dividido: lista (70%) + detalle ticket (30%).
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `delivery-dialog.component.ts`, `.html`, `.scss`
- **Componentes:**
  - **Header:** Titulo "LISTA DE DELIVERY", filtro por estado (select), boton "+ NUEVO DELIVERY"
  - **Lista:** Tabla paginada (backend) con columnas: Tel, Nombre, Estado (chip color), Espera (timer chip), Delivery (valor), Total, Entregador, Obs (icono tooltip)
  - **Detalle:** Cards con datos del cliente, items, totales (delivery + venta), cobro
  - **Footer:** Botones de accion condicionales segun estado

### 13.3 Timer de Espera
- **Descripcion:** Timer que se actualiza cada segundo mostrando tiempo transcurrido desde apertura.
- **Estado:** IMPLEMENTADO
- **Colores segun umbrales configurables en PdvConfig:**
  - Sin color: < deliveryTiempoAmarillo (default 30 min)
  - Amarillo: entre amarillo y rojo
  - Rojo: > deliveryTiempoRojo (default 60 min)
  - Sin color para ENTREGADO/CANCELADO

### 13.4 Estados y Transiciones
- **Estados:** ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO (o CANCELADO desde cualquier estado)
- **Avance (boton unico segun estado):**
  - ABIERTO → boton LISTO (marca PARA_ENTREGA)
  - PARA_ENTREGA → boton ENVIAR (marca EN_CAMINO)
  - EN_CAMINO → boton FINALIZAR (si no tiene cobro completo abre cobro primero, luego marca ENTREGADO)
  - ENTREGADO/CANCELADO → ningun boton de avance visible
- **Retroceso:** Menu "ESTADO" permite cambiar a estados anteriores con confirmacion y advertencias
- **Cancelar:** Pide motivo obligatorio, cancela delivery y venta asociada. Reactivable via menu ESTADO.

### 13.5 Acciones del Footer
- **LISTO / ENVIAR / FINALIZAR:** Solo uno visible segun estado del delivery seleccionado
- **ESTADO (undo):** Menu para retroceder estado. Deshabilitado si ABIERTO.
- **DATOS:** Abre dialogo de edicion de datos del delivery. Deshabilitado si ENTREGADO/CANCELADO.
- **ITEMS:** Cierra dialogo y carga venta en PdV (modo delivery). Deshabilitado si ENTREGADO/CANCELADO.
- **PAGO:** Abre dialogo de cobro con la venta del delivery. Deshabilitado si ENTREGADO/CANCELADO. Post-cobro pregunta si finalizar delivery.
- **IMPRIMIR:** Siempre habilitado. Imprime etiqueta de delivery via `print-etiqueta-delivery`.
- **CANCELAR:** Pide motivo, cancela delivery + venta. Deshabilitado si ENTREGADO/CANCELADO.
- **Todos deshabilitados si no hay delivery seleccionado.**

### 13.6 Crear Nuevo Delivery
- **Descripcion:** Dialogo de creacion/edicion (450px width).
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `crear-delivery-dialog.component.ts`
- **Campos:** Telefono (autocomplete + busqueda), Nombre, Direccion, Precio Delivery (select de activos), Observacion, Cobro Anticipado (toggle)
- **Busqueda por telefono (autocomplete):**
  - Input con `mat-autocomplete` que busca clientes por telefono (debounce 400ms, min 3 chars, max 15 resultados)
  - Dropdown muestra: `telefono — nombre` para cada cliente encontrado
  - Al seleccionar: autocompleta telefono + nombre + direccion + marca "Cliente encontrado"
  - Handler: `buscar-clientes-por-telefono` (LIKE query, limite 15, ordenado por nombre)
  - Si coincidencia exacta con 1 resultado, auto-selecciona
- **Boton buscar cliente:** Icono `person_search` al lado del input de telefono. Abre `BuscarClienteDialogComponent` para busqueda completa por nombre, RUC o telefono.
- **Si no encuentra:** Permite ingresar datos nuevos, al confirmar crea Persona+Cliente automaticamente.
- **Al confirmar:** Crea Persona+Cliente (si nuevo) → Delivery (ABIERTO) → Venta asociada → cierra dialogo y entra en modo delivery para tomar pedido.
- **Modo edicion:** Permite modificar datos de un delivery existente. Advertencia si cambia precio delivery.

### 13.7 Modo Delivery en PdV
- **Descripcion:** Cuando se editan items de un delivery desde el dialogo, el PdV entra en "modo delivery".
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `deliveryActual`, `cerrarModoDelivery()`
- **Comportamiento:**
  - Card de delivery con fondo ambar muestra: telefono, nombre, direccion
  - Mesas deshabilitadas (opacity 0.3, pointer-events none)
  - Botones TRANSFERIR y MOVER ITEMS deshabilitados
  - ESC cierra modo delivery (prioridad sobre deseleccion de mesa)
  - Boton X en card cierra modo delivery
  - Al agregar/editar productos se trabaja sobre la venta del delivery

### 13.8 Precios de Delivery (ABM)
- **Descripcion:** Gestion de precios de delivery configurables.
- **Estado:** IMPLEMENTADO (backend handlers completos)
- **Ubicacion:** `ventas.handler.ts` - handlers de PrecioDelivery
- **Entidad:** `PrecioDelivery` (descripcion, valor, activo)
- **Pendiente:** UI para gestionar precios de delivery (actualmente se crean desde el dialogo de crear delivery)

### 13.9 Entidades y Backend
- **Entidad Delivery:** precioDelivery, telefono, direccion, cliente (nullable), estado, nombre, observacion, motivoCancelacion, fechaCancelacion, cobroAnticipado, fechaAbierto, fechaParaEntrega, fechaEnCamino, fechaEntregado, entregadoPor
- **Handlers:**
  - `getDeliveriesByCaja(cajaId, filtros)` — paginado con filtro por estado
  - `buscarClientePorTelefono(telefono)` — busca Persona por telefono, retorna Cliente
  - `crearClienteRapido(data)` — crea Persona+Cliente con datos minimos (documento opcional)
  - `updateDelivery(id, data)` — actualiza cualquier campo del delivery

---

## 14. HISTORIAL DE VENTAS

### 14.1 Acceso
- **Descripcion:** Tab de historial accesible desde Dashboard → "Listado Ventas".
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `list-ventas.component.ts`

### 14.2 Filtros Basicos
- Rangos rapidos: HOY, ESTA SEMANA, ESTE MES, ULTIMO TRIMESTRE
- Selector de fecha DESDE/HASTA con datepicker
- Filtro por estado (ABIERTA, CONCLUIDA, CANCELADA)
- Filtro por caja (select con ultimas 20 cajas, deshabilita fechas al seleccionar)
- Boton FILTRAR y RESET

### 14.3 Filtros Avanzados
- **Ubicacion:** `filtros-ventas-dialog.component.ts`
- Mozo/vendedor con autocomplete
- Forma de pago (seleccion multiple)
- Moneda (seleccion multiple)
- Rango de valores (habilitado al seleccionar moneda)
- Mesa (select)
- Descuento/aumento (CON DESCUENTO, CON AUMENTO, SIN DESCUENTO)
- Estado de filtros se mantiene al abrir/cerrar dialogo
- Badge muestra cantidad de filtros activos

### 14.4 Tabla de Ventas
- Columnas: fecha, mesa, cajero, estado, total, duracion, acciones
- Estado con chip de color (verde=CONCLUIDA, rojo=CANCELADA, naranja=ABIERTA)
- Paginacion backend con mat-paginator (25, 50, 100)
- Filas canceladas con opacidad reducida
- Menu acciones: ver detalle, cancelar venta, rehabilitar venta
- Duracion calculada desde fechaCierre - createdAt

### 14.5 Detalle de Venta
- **Ubicacion:** `detalle-venta-dialog.component.ts`
- Dialogo 80vw x 80vh con cards:
  - Card Info General: fecha apertura, cierre, duracion, estado, mesa, cliente, cajero
  - Card Items: tabla con mozo por item, descuento, estado, info de cancelacion con tooltip
  - Card Detalle de Cobro: lineas de pago con moneda, forma pago, valor, tipo, observacion
  - Descuento global y total items calculados

---

## 15. LISTA DE CAJAS (FINANCIERO)

### 15.1 Acceso
- **Descripcion:** Tab de lista de cajas accesible desde Financiero Dashboard → "Cajas".
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `list-cajas.component.ts`

### 15.2 Tabla
- Columnas: ID, cajero, apertura, cierre, estado, total ventas, salud, acciones
- Estado con chip de color (verde=ABIERTO, gris=CERRADO, rojo=CANCELADO)
- Total ventas en moneda principal
- Indicador de salud con umbrales configurables en PdvConfig:
  - Verde: diferencia ≤ umbralDiferenciaBaja (default 5%)
  - Amarillo: entre baja y alta
  - Rojo: > umbralDiferenciaAlta (default 15%)
  - Gris: sin conteo de cierre

### 15.3 Filtros
- Filtro por ID de caja
- Filtro por cajero con autocomplete
- Rango de fechas (apertura/cierre toggle)
- Boton limpiar filtros

### 15.4 Resumen de Caja
- **Ubicacion:** `resumen-caja-dialog.component.ts`
- Cards: Info General, Conteo Apertura, Conteo Cierre, Ventas (cantidad + por forma pago + total), Retiros (placeholder), Gastos (placeholder), Diferencias con colores

### 15.5 Acciones
- Ver resumen (click en fila)
- Ir a conteo
- Abrir nueva caja
- Cancelar caja (TODO — pendiente)

---

## 16. CATEGORIAS DEL PdV (MENU RAPIDO)

### 16.1 Estructura de Categorias
- **Descripcion:** Sistema jerarquico de 4 niveles: PdvGrupoCategoria → PdvCategoria → PdvCategoriaItem → PdvItemProducto
- **Estado:** IMPLEMENTADO (estructura y ABM)

### 16.2 Administracion de Categorias (ABM)
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv-config-dialog.component.ts`

### 16.3 Visualizacion de Categorias en el PdV
- **Estado:** PARCIALMENTE IMPLEMENTADO
- **Pendiente:** Navegacion entre niveles y agregar productos al carrito desde categorias

---

## 17. CONFIGURACION DEL PdV

### 17.1 Entidad PdvConfig
- **Campos implementados:**
  - `cantidad_mesas` — cantidad de mesas del local
  - `pdvGrupoCategoria` — grupo de categorias activo
  - `umbralDiferenciaBaja` — % umbral salud caja bajo (default 5)
  - `umbralDiferenciaAlta` — % umbral salud caja alto (default 15)
  - `deliveryTiempoAmarillo` — minutos para color amarillo en espera delivery (default 30)
  - `deliveryTiempoRojo` — minutos para color rojo en espera delivery (default 60)
- **Pendiente:** UI para editar configuracion general del PdV

---

## 18. COMANDAS (TARJETAS DE CUENTA INDIVIDUAL)

### 18.1 Concepto
- **Descripcion:** Las comandas son tarjetas fisicas con numero/codigo de barras que se entregan a clientes como "mesas virtuales" para cuentas individuales. Funcionan como mesas pre-registradas que se "abren" y "cierran".
- **Estado:** IMPLEMENTADO
- **Entidad:** `Comanda` (codigo, numero, estado, descripcion, observacion, pdv_mesa, sector, activo)
- **Estados:** DISPONIBLE (tarjeta libre) | OCUPADO (tarjeta asignada con cuenta abierta)

### 18.2 Casos de Uso
1. Cliente en barra sin mesa → mozo abre comanda pre-registrada, indica sector
2. Cliente en mesa ocupada quiere cuenta separada → mozo abre comanda vinculada a la mesa
3. Dos clientes piden cuentas separadas → mozo abre 2 comandas vinculadas a la mesa (mesa sin venta propia)

### 18.3 ABM de Comandas (Admin)
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `comanda-abm-dialog.component.ts`, accesible desde Dashboard Ventas → "Gestionar Comandas"
- **Funcionalidades:**
  - Tabla con todas las comandas: numero, codigo, descripcion, estado, activo
  - Crear individual: codigo (UPPERCASE), numero, descripcion
  - Creacion masiva: cantidad + prefijo → genera N tarjetas (CMD-001, CMD-002...)
  - Editar: codigo, descripcion (solo si no esta OCUPADO)
  - Activar/Desactivar (soft delete)
  - Estado visible con chips: DISPONIBLE (verde) / OCUPADO (naranja)

### 18.4 Visualizacion en PdV
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.html` - tabs MESAS | COMANDAS
- **Tabs con badges:** Mesas muestra cantidad ocupadas, Comandas muestra cantidad ocupadas
- **Tab por defecto:** Configurable en PdvConfig (`pdvTabDefault`)
- **Grid de comandas:** Mismo estilo que mesas (botones 60x60), colores por estado
- **Filtro por sector:** Compartido entre tabs, aplica al tab activo
- **Mesas con badge:** Si una mesa tiene comandas OCUPADO vinculadas, muestra badge con cantidad

### 18.5 Apertura de Comanda (en PdV)
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `abrir-comanda-dialog.component.ts`
- **Flujo:** Click en comanda DISPONIBLE → dialogo ligero → asignar mesa (opcional) + sector + observacion → comanda pasa a OCUPADO
- **Campos:** Mesa (select opcional, auto-populate sector), Sector (select), Observacion (textarea)

### 18.6 Uso en PdV
- **Estado:** IMPLEMENTADO
- **Flujo:** Seleccionar comanda OCUPADO → cargar items de venta → agregar/editar productos → cobrar/cancelar
- **Card de info:** Muestra numero, codigo, mesa vinculada, sector, estado, nombre cliente, observacion
- **getVenta():** Si la comanda no tiene venta abierta, crea una nueva vinculada a la comanda (y opcionalmente a su mesa)
- **Cobrar:** Al cobrar venta → comanda vuelve automaticamente a DISPONIBLE (tarjeta liberada)
- **Cancelar:** Al cancelar venta → comanda vuelve a DISPONIBLE
- **Cobro rapido:** Igual que cobrar, comanda se libera automaticamente
- **Escape:** Deselecciona comanda sin cerrarla

### 18.7 Refresh Automatico
- **Estado:** IMPLEMENTADO
- **Intervalo:** 1 segundo (junto con mesas)
- **Comportamiento:** Actualiza estados sin perder seleccion, recalcula badges de ocupadas

### 18.8 Entidades y Backend
- **Comanda:** codigo, numero, estado (DISPONIBLE/OCUPADO), descripcion, observacion, pdv_mesa (nullable), sector (nullable), activo
- **Venta:** nueva columna `comanda_id` (nullable) — vincula venta a comanda
- **PdvMesa:** nueva relacion `comandas` (OneToMany) — carga comandas OCUPADO vinculadas
- **PdvConfig:** `pdvTabDefault` (MESAS/COMANDAS), `comandasHabilitadas` (boolean)
- **Handlers nuevos:** abrirComanda, cerrarComanda, getComandasDisponibles, getComandasOcupadas, getComandasBySector, createBatchComandas, getComandaWithVenta

---

## 19. DASHBOARD DE VENTAS

- **Estado:** PARCIALMENTE IMPLEMENTADO
- **Ubicacion:** `ventas-dashboard.component.ts`
- **Funciones disponibles:**
  - Abrir PdV (IMPLEMENTADO)
  - Abrir configuracion de categorias PdV (IMPLEMENTADO)
  - Abrir gestion de mesas (IMPLEMENTADO)
  - Listado de ventas (IMPLEMENTADO)
  - Estadisticas (TODO - datos placeholder)
  - Listado de deliveries (TODO - accesible desde PdV)

---

## 20. MOVIMIENTO DE STOCK EN VENTAS

### 20.1 Descuento Automatico al Finalizar Venta
- **Descripcion:** Al finalizar una venta (CONCLUIDA), se crean automaticamente movimientos de stock tipo VENTA para descontar los productos/ingredientes vendidos.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `ventas.handler.ts` - handler `procesarStockVenta`
- **Trigger:** Se ejecuta fire-and-forget despues de `updateVenta(CONCLUIDA)` tanto en cobro normal como cobro rapido. Si falla, la venta no se revierte.
- **Idempotencia:** Verifica si ya existen movimientos activos para la venta antes de procesar. Permite re-procesar si los anteriores fueron desactivados.

### 20.2 Estrategia por Tipo de Producto
- **RETAIL / RETAIL_INGREDIENTE:** Descuento directo del producto. `cantidad = ventaItem.cantidad * presentacion.cantidad`. Solo si `controlaStock = true`.
- **ELABORADO_SIN_VARIACION:** Recorre los ingredientes de la receta. Para cada ingrediente: `cantidad = (recetaIngrediente.cantidad * ventaItem.cantidad / receta.rendimiento) / (porcentajeAprovechamiento / 100)`.
- **ELABORADO_CON_VARIACION:** Busca la RecetaPresentacion que coincida con la presentacion vendida, luego aplica la misma logica de receta.
- **COMBO:** Itera los ComboProducto y aplica recursivamente la estrategia segun el tipo de cada componente. Limite de profundidad = 2.

### 20.3 Personalizaciones Respetadas
- **Ingrediente REMOVIDO:** No se descuenta (ej: hamburguesa sin queso → queso no se descuenta)
- **Ingrediente INTERCAMBIADO:** Se descuenta el producto reemplazo, no el original
- **Adicional con receta:** Se descontaran los ingredientes de la receta del adicional multiplicados por su cantidad

### 20.4 Recursion en Ingredientes Elaborados
- **Descripcion:** Si un ingrediente tiene `controlaStock = false` y tiene receta propia, el sistema entra recursivamente a la receta y descuenta los ingredientes base hasta encontrar productos con `controlaStock = true`.
- **Ejemplo:** Hamburguesa → Bacon Caramelizado (controlaStock=false) → Bacon Fatiado + Miel de Caña (controlaStock=true)
- **Limite de profundidad:** 3 niveles de recursion
- **Caso contrario:** Si `controlaStock = true`, se descuenta directamente sin entrar a la sub-receta (asume que el producto tiene stock propio via modulo de produccion)

### 20.5 Flag controlaStock en Productos
- **Descripcion:** Toggle visible para TODOS los tipos de producto (antes estaba oculto para elaborados/combos). Default false para elaborados y combos.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `producto-informacion-general.component.ts`
- **Icono informativo:** Tooltip con descripcion del comportamiento segun tipo de producto:
  - RETAIL: Stock se descuenta directamente al vender
  - RETAIL_INGREDIENTE: Stock se descuenta al vender o al ser usado como ingrediente
  - ELABORADO: ON = descuenta producto directo (requiere produccion). OFF = descuenta ingredientes de receta
  - COMBO: ON = descuenta combo como producto. OFF = descuenta productos componentes

### 20.6 Reversion de Stock al Cancelar Venta
- **Descripcion:** Al cancelar una venta CONCLUIDA, los movimientos de stock se marcan como `activo = false`, dejando de contar en el calculo de stock.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `ventas.handler.ts` - handler `revertirStockVenta`
- **Puntos de integracion:**
  - Cancelar venta desde historial (`list-ventas.cancelarVenta`) → revierte stock
  - Rehabilitar venta cancelada (`list-ventas.rehabilitarVenta`) → re-procesa stock
  - Cancelar delivery con venta CONCLUIDA (`delivery-dialog.cancelarDelivery`) → revierte stock
  - Reactivar delivery cancelado → no necesita accion (venta vuelve a ABIERTA, stock se procesara al finalizar nuevamente)

### 20.7 Entidad StockMovimiento
- **Campos:** cantidad, tipo (VENTA/COMPRA/AJUSTE_POSITIVO/AJUSTE_NEGATIVO/DESCARTE/PRODUCCION_ENTRADA/PRODUCCION_SALIDA/TRANSFERENCIA), referencia (ventaId), tipoReferencia (VENTA), fecha, activo, observaciones, producto
- **Calculo de stock:** Suma de movimientos activos. Positivos: COMPRA, AJUSTE_POSITIVO, PRODUCCION_ENTRADA. Negativos: VENTA, AJUSTE_NEGATIVO, PRODUCCION_SALIDA, DESCARTE.

---

## 21. UTILITARIOS DEL PdV (RETIROS, GASTOS, ULTIMAS VENTAS)

### 21.1 Acceso
- **Descripcion:** Boton UTILITARIOS en el panel derecho del PdV abre un dialogo lanzador con tarjetas.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `pdv.component.ts` - `openUtilitarios()`; `utilitarios-dialog.component.ts` (600px)
- **Requisito:** caja abierta (si no, muestra aviso)
- **Opciones:** Retiro de Caja, Gastos, Ultimas Ventas, Cierre Parcial (proximamente / deshabilitado)

### 21.2 Retiro de Caja
- **Descripcion:** Registrar un retiro de efectivo de la caja durante el turno.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `CreateRetiroCajaDialogComponent`
- **Nota:** los retiros se consideran en el esperado del cierre de caja.

### 21.3 Gastos de Caja
- **Descripcion:** Registrar un gasto pagado con efectivo de la caja del PdV (descuenta del cajon, aparece en el cierre).
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `gasto-caja-dialog.component.ts` (560px)
- **Campos:** categoria (opcional), descripcion (requerida), monto, moneda, forma de pago (preselecciona EFECTIVO), fecha
- **Backend:** handler `create-gasto-caja` (`gastos-caja.handler.ts`: `create-gasto-caja` / `get-gastos-caja` / `anular-gasto-caja`)

### 21.4 Ultimas Ventas
- **Descripcion:** Vista rapida de las ultimas ventas de la caja actual con acciones.
- **Estado:** IMPLEMENTADO
- **Ubicacion:** `ultimas-ventas-dialog.component.ts` (560px)
- **Datos:** `getVentasByCaja(cajaId)`; cada fila muestra #id, hora, forma de pago, total (suma de items ACTIVOS), estado (concluida/cancelada/abierta) y flag de credito
- **Acciones (mat-menu por venta):**
  - Ver detalles -> `DetalleVentaDialogComponent`
  - Reimprimir ticket -> IPC `print-venta-ticket`
  - Reimprimir pagare (solo credito) -> IPC `get-cpc-by-venta` -> `print-pagare-cpc-ticket`
  - Cancelar venta (si no esta CANCELADA) -> confirma, `updateVenta(CANCELADA)`, y si estaba CONCLUIDA revierte stock (`revertirStockVenta`)

---

## RESUMEN DE ESTADO

| Modulo | Implementado | Parcial | Pendiente |
|--------|-------------|---------|-----------|
| Gestion de Caja | 3 | 0 | 0 |
| Gestion de Mesas | 4 | 1 | 0 |
| Gestion de Ventas | 5 | 0 | 0 |
| Items de Venta | 9 | 0 | 0 |
| Monedas y Totales | 3 | 0 | 0 |
| Cobrar Venta | 8 | 1 | 0 |
| Cancelar Venta | 1 | 0 | 0 |
| Transferir Mesa | 1 | 0 | 0 |
| Mover Items | 1 | 0 | 0 |
| Pre-Cuenta/Imprimir | 1 | 0 | 0 |
| Asociar Cliente | 3 | 0 | 0 |
| Atajos de Teclado | 1 | 0 | 0 |
| Delivery | 8 | 0 | 1 |
| Historial de Ventas | 5 | 0 | 0 |
| Lista de Cajas | 4 | 0 | 1 |
| Categorias PdV | 2 | 1 | 0 |
| Configuracion PdV | 0 | 1 | 0 |
| Movimiento de Stock | 7 | 0 | 0 |
| Comandas | 8 | 0 | 0 |
| Utilitarios (retiros/gastos/ult. ventas) | 4 | 0 | 1 |
| Dashboard | 0 | 1 | 0 |
| Buffet por peso | 1 | 0 | 0 |

> **Nota (2026-06-28):** la impresion termica ya esta implementada (`documentos-tickets.handler.ts`,
> `print-precuenta`/`print-comanda`/`print-venta-ticket`/`print-etiqueta-delivery`, etc.), con ruteo por
> sector (`SectorImpresora`) y KDS de cocina via SSE. Las menciones de "impresion pendiente" mas abajo
> son del estado anterior.

---

## FUNCIONES PENDIENTES GENERALES

1. **Cancelar Caja** — cancela caja con ventas, cobros y movimientos de stock
2. **Cierre Parcial** — opcion en Utilitarios, deshabilitada ("proximamente")
3. **Categorias click** — agregar productos al carrito desde items de categoria
4. **UI Precios de Delivery** — ABM visual (actualmente se gestionan desde crear-delivery dialog)
5. **UI Configuracion PdV** — dialogo para editar umbrales y parametros de PdvConfig
6. **Division de cuenta real** — hoy es informativa (autocompleta valor/persona, no divide el cobro)

> **Ya implementados** (antes pendientes): Retiros de Efectivo y Gastos operativos, ambos desde Utilitarios (secciones 21.2 y 21.3).

---

## IMPLEMENTACIONES RECIENTES (Abril 2026)

### Personalizacion de productos (variaciones)
- Dialogo de personalizacion al agregar/editar productos con receta
- Ingredientes opcionales (quitar/agregar), intercambiables (swap), adicionales con precio, observaciones
- Persistencia en 3 entidades: `VentaItemAdicional`, `VentaItemIngredienteModificacion`, `VentaItemObservacion`
- Nueva columna `precioAdicionales` en `VentaItem` para precio de extras
- Chips con colores semanticos: verde=incluido, rojo=removido, naranja=intercambiado, celeste=observacion
- Opcion "Personalizar" en menu del item para editar variaciones existentes

### Mejoras de UI del PdV
- Card de info de mesa rediseñado: layout 2 filas compacto (info mesa + cliente)
- Detalle expandido de items rediseñado: chips de personalizacion + metadata compacta en 1 linea
- Indicador visual de items personalizados: icono `tune` + borde celeste en row
- Botones inferiores con texto reducido para evitar overflow

### Autocomplete de clientes en delivery
- Input de telefono con `mat-autocomplete` que busca clientes (max 15 resultados, debounce 400ms)
- Dropdown muestra `telefono — nombre` para seleccion rapida
- Boton `person_search` para busqueda completa via dialogo
- Nuevo handler: `buscar-clientes-por-telefono` (lista con LIKE query, limite 15)
- Navegacion completa con Enter entre campos del formulario sin necesidad de mouse
- Precio delivery inicia con menor valor por defecto

### Movimiento de stock automatico en ventas
- Descuento automatico al finalizar venta (fire-and-forget, no bloquea cobro)
- Estrategia diferenciada por tipo de producto (RETAIL directo, ELABORADO por receta, COMBO recursivo)
- Respeta personalizaciones: ingredientes removidos, intercambiados, adicionales con receta
- Recursion en ingredientes elaborados sin controlaStock: baja a sub-recetas hasta encontrar ingredientes base
- Flag `controlaStock` visible para todos los tipos con tooltip informativo
- Reversion automatica al cancelar venta CONCLUIDA (movimientos marcados activo=false)
- Re-procesamiento al rehabilitar venta cancelada

---

## BUGS / STUBS CONOCIDOS

1. **findPrecioPrincipal()**: stub que retorna 0 (no cableado en la plantilla). `findPrecioCosto()` en cambio ya resuelve el costo real por tipo de producto.
2. **Categorias click**: Los items de categoria se muestran pero no agregan productos al carrito
3. **Budget CSS**: Varios archivos SCSS exceden el limite configurado en angular.json (no afecta funcionalidad)
4. **Metodos declarados pero no cableados** en la plantilla actual: `aplicarDescuentoVenta()` (descuento a nivel venta), `dividirCuenta()` (solo loguea), `ventaRapida()`, `removeItem()`.

---

> Para el plan de implementacion detallado, ver [PLAN-IMPLEMENTACION-PDV.md](PLAN-IMPLEMENTACION-PDV.md)
> Para el checklist de testing, ver [testing/TESTING-CHECKLIST-PDV.md](testing/TESTING-CHECKLIST-PDV.md)
