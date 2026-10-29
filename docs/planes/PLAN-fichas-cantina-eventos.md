# PLAN — Fichas para cantina de eventos (venta directa)

## Problema

En la cantina de eventos el cliente paga en caja y retira lo que pidió en la barra
**con fichas**. Cada ficha es un papel que vale un producto. Hoy la venta rápida de
mostrador no imprime nada hacia la barra: `autoPrintComandaIfNeeded`,
`crearComandaItemsSiCorresponde` y `printComandaInternal` la descartan a propósito
porque es la venta "sin cocina". El sistema no tiene ningún concepto de ficha.

Lo demás ya existe y no se toca:

- **Mesas:** la comanda sale sola a la impresora del sector del producto (barra, cocina).
- **Venta rápida:** se cobra con F2 o con el diálogo de cobro.
- **Ticket de pago opcional:** `PdvConfig.autoImprimirTicketVenta`, más F10/F11 por venta.

## Decisiones del usuario (2026-10-29)

| Tema | Decisión |
|---|---|
| Modo | **Por unidad** por defecto (4 cervezas = 4 fichas 1/4 … 4/4), con **override por producto** |
| Precio | **Configurable**, por defecto **sin** precio |
| Nombre del evento | **Texto libre en la config del PdV** |
| Alcance | **Sólo venta directa** (venta rápida). Las mesas siguen con la comanda. **Sin canje por escaneo** (queda para fase 2) |

## Diseño

### Cuándo se imprimen

Las fichas salen **sólo cuando la venta pasa a CONCLUIDA**, nunca antes; si no, se
entregarían fichas sin cobrar. Hay dos caminos que concluyen una venta:

1. `updateVenta` → ABIERTA a CONCLUIDA. Lo usan el diálogo de cobro (F10/F11), el cobro
   rápido (F2) y `cerrarVentasAbiertasMesa`, aunque este último es sólo de mesa.
2. `cobrar-venta-credito` (`cuentas-por-cobrar.handler.ts`), que cierra la venta por su cuenta.

Ambos llaman a una función única: `imprimirFichasSiCorresponde(dataSource, ventaId)`.

**Gate.** Una venta lleva fichas si cumple todo esto:

- `PdvConfig.fichasHabilitadas`;
- es una venta directa: sin mesa, sin comanda, sin delivery y con `canalOrigen === 'LOCAL'`,
  que es el mismo predicado que hoy la excluye de cocina, invertido;
- tiene al menos una ficha a emitir.

El predicado de "venta directa" se extrae a un helper único,
`esVentaDirecta(venta)`, para que no diverja de los tres gates de cocina.

**Idempotencia y concurrencia.** Antes de imprimir se "reclama" la emisión con un
UPDATE condicional:

```sql
UPDATE ventas SET fichas_emitidas_at = ? WHERE id = ? AND fichas_emitidas_at IS NULL
```

Si afecta 0 filas, no se imprime. Así un doble disparo (reintento, crédito + hook)
no duplica fichas. `fichas_cantidad` guarda cuántas se emitieron.

**Orden de impresión.** El ticket de pago y las fichas van en **la misma cadena
asíncrona**: primero el ticket (si corresponde) y después las fichas. Así no se
intercalan en la misma impresora. Todo es fire-and-forget: un fallo de impresión
nunca revierte el cobro, igual que el ticket de hoy. Si la impresión falla, se emite
`broadcastPrinterEvent` y la venta queda con `fichas_emitidas_at` seteado. Desde ahí
se reimprime con el permiso de reimpresión. **Riesgo aceptado:** queda registrado
como emitido algo que no salió; está visible en "Últimas ventas".

### Qué se imprime

**Modo efectivo por ítem:** `producto.fichaModo ?? pdvConfig.fichasModo`.

| `fichaModo` | Ítem "4 x CERVEZA" |
|---|---|
| `POR_UNIDAD` | 4 fichas "CERVEZA", numeradas 1/4 … 4/4 |
| `POR_ITEM` | 1 ficha "4 x CERVEZA" |
| `NO_IMPRIME` | Ninguna ficha (p. ej. un servicio o una entrada) |
| `null` en el producto | Usa el global |

- Cantidad no entera (venta por peso): se fuerza `POR_ITEM`.
- Sólo ítems `ACTIVO`.
- Numeración: el correlativo es por venta (`FICHA 3/7`), sobre el total de fichas
  de la venta, no por ítem.

**Formato de una ficha** (un corte de papel por ficha; ancho 32/42/48):

```
        FIESTA PATRONAL 2026          ← fichasNombreEvento (tall, centrado), si hay
--------------------------------
          CERVEZA PILSEN              ← producto + presentación (big, centrado, envuelto)
       GRANDE - SIN HIELO             ← detalle de variación (cargarDetalleDeItems)
            4  x                      ← sólo POR_ITEM con cantidad > 1 (big)
           Gs. 15.000                 ← sólo si fichasMostrarPrecio (unitario o subtotal según modo)
--------------------------------
FICHA 3/7              VENTA #1234
CAJA 12        29/10/2026 21:34
COD 1234-3
         ** REIMPRESION **            ← sólo en reimpresiones
```

Se usan los constructores de `ticket.utils.ts` (`ticketText`, `ticketKv`,
`ticketColumns`), que ya sanean CP437, y `ticketCantidad`. El detalle de variación
sale de `cargarDetalleDeItems`, igual que los otros tres tickets con ítems.

La función se divide en dos, siguiendo el patrón de `buildDeliveryTicketLines` /
`printDeliveryTicketInternal`:

- `buildFichasVenta(dataSource, ventaId, { width, reimpresion })` es **pura**:
  devuelve `TicketLine[][]`, una por ficha, y es la que se testea.
- `printFichasVentaInternal(dataSource, ventaId, opts)` resuelve la impresora e imprime.
  Manda **un solo `TicketSpec`** con una línea `{ type: 'cut' }` entre fichas, en vez
  de N conexiones a la impresora.

### Impresora

Las fichas van a la **impresora de tickets de la caja que cobra**. Se usa la misma
resolución que el ticket de venta: `getPrinterByRol(TICKET_VENTA, { dispositivoId })`,
o sea `Dispositivo.printerTicket` y, si no hay, el rol `TICKET_VENTA`.

> **Cambio respecto de lo que te propuse en el chat:** no se agrega un rol `FICHA`.
> La resolución de tickets va por `Dispositivo.printerTicket`, no por sector. Un rol
> de sector no tendría cómo distinguir la caja 1 de la caja 2 en un evento con varias
> cajas. Si después hace falta una impresora sólo de fichas por caja, se suma
> `Dispositivo.printerFicha` en una fase 2.

### Cancelar una venta que ya emitió fichas

Las fichas están en manos del cliente, así que cancelar esa venta es devolver plata
por algo que puede seguir canjeándose.

- **Backend (`updateVenta`, transición a CANCELADA):** si `fichas_cantidad > 0` exige
  además `VENTAS_CANCELAR_CON_FICHAS`.
- **Frontend (`ultimas-ventas-dialog`):** la confirmación avisa "Esta venta emitió N
  fichas. Recuperalas antes de cancelar." Las ventas ABIERTAS del PdV no tienen
  fichas, porque se emiten al concluir, así que `cancelarVenta()` del PdV no cambia.

### Reimpresión

- Handler nuevo `print-fichas-venta` (`{ ventaId }`), con
  `ensurePermission('VENTAS_FICHAS_REIMPRIMIR')` como primera sentencia. Sólo para
  ventas CONCLUIDA con `fichas_emitidas_at` no nulo. Incrementa
  `fichas_reimpresiones` e imprime con la marca `** REIMPRESION **`.
- Acción "Reimprimir fichas" en el `mat-menu` de `ultimas-ventas-dialog`, visible sólo
  si la fila tiene `fichasCantidad > 0`.

## Modelo de datos (una migración, SQLite + Postgres, aditiva)

| Tabla | Columna | Tipo | Default |
|---|---|---|---|
| `pdv_config` | `fichas_habilitadas` | boolean | `false` |
| `pdv_config` | `fichas_modo` | varchar(20) | `'POR_UNIDAD'` |
| `pdv_config` | `fichas_mostrar_precio` | boolean | `false` |
| `pdv_config` | `fichas_nombre_evento` | varchar(120) | null |
| `producto` | `ficha_modo` | varchar(20) | null (= hereda) |
| `ventas` | `fichas_emitidas_at` | timestamp/datetime | null |
| `ventas` | `fichas_cantidad` | int | `0` |
| `ventas` | `fichas_reimpresiones` | int | `0` |

- Enum TS `FichaModo { POR_UNIDAD, POR_ITEM, NO_IMPRIME }`. Va en el entity de
  `PdvConfig`, la ubicación se confirma al implementar. Se guarda como varchar, sin
  CHECK, igual que `SectorImpresoraRol`.
- `type` explícito en cada `@Column` (lección del PR #234). Columnas nullable tipadas
  `string | null` con `type: 'varchar'`.
- Timestamp real de migración (`date +%s%3N`), `IF NOT EXISTS` vía el helper
  `hasColumn` existente.
- Instalaciones existentes: `fichas_habilitadas = false`, cero cambio de comportamiento.

## Permisos (seed `SEED_PERMISOS`)

- `VENTAS_FICHAS_REIMPRIMIR`: reimprimir fichas de una venta.
- `VENTAS_CANCELAR_CON_FICHAS`: cancelar una venta que ya emitió fichas.

Rol plantilla **GERENTE** recibe ambos; **CAJERO** y **MOZO**, ninguno.

## Fases

**F1: Backend**

- Entidades: `PdvConfig`, `Producto`, `Venta`.
- Migración `<ms>-FichasCantina` registrada en `getMigrations()`.
- Seed de permisos.
- `esVentaDirecta` y `buildFichasVenta` / `printFichasVentaInternal` en
  `documentos-tickets.handler.ts`.
- `imprimirFichasSiCorresponde`, enganchada en `updateVenta` (encadenada después del
  ticket) y en `cobrar-venta-credito`.
- Guard de cancelación en `updateVenta`.
- Handler `print-fichas-venta`, más preload, `repository.service` y sus
  implementaciones IPC/HTTP.
- `get-ultimas-ventas`, o el handler que alimente el diálogo, devuelve
  `fichasCantidad`.

**F2: Frontend**

- `pdv-config-dialog`: sección **Cantina / Fichas** con habilitar, modo por defecto,
  mostrar precio y nombre del evento.
- `producto-informacion-general` + `gestionar-producto.service`: select
  **Ficha de cantina** con las opciones Heredar del PdV / Por unidad / Por ítem / No imprime.
- `ultimas-ventas-dialog`: acción **Reimprimir fichas** y aviso al cancelar.
- Reglas: sin funciones ni getters en templates, `mat-menu`, colores de tema,
  `ConfirmationDialogComponent`.

**F3: Tests + docs**

## Tests

`scripts/test-fichas-e2e.ts` → `npm run test:fichas`, sobre SQLite y con el patrón de
`test-delivery-e2e.ts`. Se suma a `run-all-tests`.

1. **Gate:** una venta directa con fichas habilitadas emite. Con mesa, comanda,
   delivery o `canalOrigen=WEB` → 0. Con `fichasHabilitadas=false` → 0.
2. **POR_UNIDAD:** un ítem con cantidad 4 da 4 fichas `1/4…4/4`. Con dos ítems (2 + 3)
   salen 5 fichas numeradas 1/5…5/5. Este fixture tiene varios ítems a propósito,
   para atrapar una numeración por ítem.
3. **POR_ITEM:** 1 ficha con `4  x`.
4. **Override:** con global POR_UNIDAD y producto POR_ITEM gana el producto. Producto
   NO_IMPRIME → ese ítem no emite, los demás sí. Producto `null` → hereda.
5. **Cantidad decimal** (1,5 kg) con modo POR_UNIDAD → 1 ficha, sin perder fracción.
6. **Ítems cancelados** no emiten.
7. **Precio:** aparece sólo con `fichasMostrarPrecio`. En POR_ITEM es el subtotal y en
   POR_UNIDAD el unitario con adicionales y descuento.
8. **Nombre del evento** con tilde inicial ("ÁREA VIP") sale saneado ("AREA VIP"), sin `?`.
9. **Idempotencia:** dos llamadas a `imprimirFichasSiCorresponde` → la segunda no
   reclama, y `fichas_cantidad` no cambia.
10. **Cancelación:** sin `VENTAS_CANCELAR_CON_FICHAS` → rechaza. Con el permiso, pasa.
    Venta sin fichas → no pide el permiso extra.
11. **Reimpresión:** sin permiso → rechaza. Con permiso, incrementa
    `fichas_reimpresiones` e incluye `REIMPRESION`. Una venta ABIERTA o sin fichas → rechaza.
12. **Detalle de variación** presente en la ficha, con la misma fuente que la comanda.

Además corren `npm run test:all`, `npm run check` y el CI. El job *Migration run
(Postgres)* es la única verificación de Postgres.

**Prueba manual** en `docs/testing/TESTING-CHECKLIST-FICHAS-CANTINA.md`, con la
impresora real: ancho 48 y 32, corte entre fichas, ticket + fichas sin intercalarse,
F2 / F10 / F11 / crédito.

## Riesgos

- **Mucho papel:** 50 cervezas en POR_UNIDAD son 50 fichas. Es lo pedido. Se mitiga con
  el override POR_ITEM por producto. No se pone tope.
- **Gate desalineado:** si en el futuro cambia la definición de "venta directa" en
  cocina y no en fichas, una venta podría imprimir comanda y fichas a la vez. Por eso
  existe el helper único `esVentaDirecta`.
- **Impresión fallida tras reclamar:** queda emitido sin papel. Se reimprime con
  permiso; está documentado en el manual.
- **Una venta rápida que pasa a mesa o a delivery:** si la venta tiene mesa al
  concluir, no lleva fichas. El gate se evalúa sobre el estado **al concluir**.

## Fuera de alcance (fase 2)

- Canje por escaneo en la barra (QR + marcar usada).
- Impresora dedicada por caja (`Dispositivo.printerFicha`).
- Fichas en mesas.
- Entidad Evento con reportes por evento.
