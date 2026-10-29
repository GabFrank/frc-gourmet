# PLAN — Fichas para cantina de eventos (venta directa)

> Revisión 2 (2026-10-29). Incorpora la auditoría del plan hecha por dos agentes: el eje
> de alcance y convenciones y el eje de correctitud técnica. La sección **Hallazgos de
> la auditoría** lista qué cambió y por qué. La revisión 1 está en `git log -p` de este
> archivo.

## Problema

En la cantina de eventos el cliente paga en caja y retira lo que pidió en la barra
**con fichas**. Cada ficha es un papel que vale un producto.

Hoy la venta rápida de mostrador no imprime nada hacia la barra:
`autoPrintComandaIfNeeded`, `crearComandaItemsSiCorresponde` y
`printComandaInternal` la descartan a propósito porque es la venta "sin cocina".
No existe ningún concepto de ficha.

Lo que ya existe y no se toca:

- **Mesas:** la comanda sale sola a la impresora del sector del producto (barra, cocina).
- **Venta rápida:** se cobra con F2 o con el diálogo de cobro.
- **Ticket de pago opcional:** `PdvConfig.autoImprimirTicketVenta`, más F10/F11 por venta.

## Decisiones del usuario (2026-10-29)

| Tema | Decisión |
|---|---|
| Modo | **Por unidad** por defecto (4 cervezas = 4 fichas 1/4 … 4/4), con **override por producto** |
| Precio | **Configurable**, por defecto **sin** precio |
| Nombre del evento | **Texto libre en la config del PdV** |
| Alcance | **Sólo venta directa**. Las mesas siguen con la comanda. **Sin canje por escaneo** (fase 2) |

## Diseño

### Qué es una "venta directa"

Hoy hay tres gates de cocina que repiten el mismo predicado:

- `autoPrintComandaIfNeeded`, en `ventas.handler.ts` (~5029);
- `crearComandaItemsSiCorresponde`, en `ventas.handler.ts` (~5089);
- `printComandaInternal`, en `documentos-tickets.handler.ts` (~497).

Ese predicado se extrae a un helper único, `esVentaDirecta(venta)`, en
`electron/utils/venta-directa.utils.ts`:

```ts
!venta.mesa?.id && !venta.comanda?.id && !venta.delivery?.id
  && (venta.canalOrigen ?? 'LOCAL') === 'LOCAL'
```

- Los tres gates de cocina pasan a usar `!esVentaDirecta(venta)`. Es un refactor sin
  cambio de comportamiento, cubierto con tests de no regresión de la comanda.
- **Precondición:** la venta tiene que venir con `mesa`, `comanda` y `delivery`
  cargadas. El helper recibe la venta ya cargada; la función que la busca usa siempre
  `relations: ['mesa', 'comanda', 'delivery', 'dispositivo']`.
- `QR_MESA` sin mesa **no** es venta directa. Es la misma semántica que hoy usa cocina.

### Cuándo se imprimen

Las fichas salen **sólo cuando la venta pasa a CONCLUIDA**, y siempre
**post-commit y fire-and-forget**: un fallo de impresión nunca revierte el cobro.

Caminos reales hacia CONCLUIDA, verificados en el código:

| Camino | ¿Fichas? | Cómo |
|---|---|---|
| `updateVenta` ABIERTA→CONCLUIDA (diálogo de cobro F10/F11, F2) | Sí | En el hook existente de auto-imprimir ticket, **en la misma cadena**: primero el ticket (si corresponde) y después las fichas |
| `cobrar-venta-credito` (`cuentas-por-cobrar.handler.ts`) | Sí | Llamada explícita **después del commit** del `queryRunner` y **fuera** del `if (imprimirPagare)`. Orden: ticket, pagaré, fichas. Si no hay pagaré, las fichas igual salen |
| `cerrarVentasAbiertasMesa` | No | Usa `repo.save` directo y es sólo de mesa (el gate la excluye). No se toca |
| Rehabilitación (CANCELADA→CONCLUIDA desde `list-ventas`) | No reimprime | El claim ya está seteado. Ver "Cancelación" |

- **El ticket de pago y las fichas son independientes.** Un cobro con F10 (sin ticket)
  igual emite fichas. Para no imprimir ticket de pago en el evento se usa
  `autoImprimirTicketVenta = false`.
- **Sin cobro parcial:** el cobro parcial deja la venta ABIERTA, así que no emite. Se
  verifica al implementar que no tenga un camino propio a CONCLUIDA.

### Claim idempotente (portable SQLite/Postgres)

Antes de imprimir se reclama la emisión con QueryBuilder, no con SQL crudo:

```ts
const r = await dataSource.createQueryBuilder()
  .update(Venta)
  .set({ fichasEmitidasAt: new Date(), fichasCantidad: n })
  .where('id = :id', { id: ventaId })
  .andWhere('fichas_emitidas_at IS NULL')
  .execute();
if ((r.affected ?? 0) !== 1) return; // otro disparo ya emitió
```

Es el mismo patrón que `motor.ts:358`. El SQL crudo no sirve porque `?` falla en
Postgres y `query()` devuelve formas distintas en cada driver.

**Protección del claim frente al merge de `updateVenta`.** `updateVenta` hace
`repo.merge(entity, data)` y el PdV manda la venta entera (`pdv.component.ts:3757`).
Una copia vieja con `fichasEmitidasAt = null` reseteaba el claim. Además, cualquier
cliente vía `/api/rpc` podía poner `fichasCantidad = 0` y esquivar el guard de
cancelación.

Por eso `fichasEmitidasAt`, `fichasCantidad` y `fichasReimpresiones` se suman al
destructuring que ya descarta `caja` y `costoDelivery` (`ventas.handler.ts:1590`).
Sólo los escribe el backend.

### Qué se imprime

**Modo efectivo por ítem:** `producto.fichaModo ?? pdvConfig.fichasModo`.

| `fichaModo` | Ítem "4 x CERVEZA" |
|---|---|
| `POR_UNIDAD` | 4 fichas "CERVEZA", numeradas 1/4 … 4/4 |
| `POR_ITEM` | 1 ficha "4 x CERVEZA" |
| `NO_IMPRIME` | Ninguna (p. ej. una entrada o un servicio) |
| `null` en el producto | Hereda el global |

- La cantidad se convierte con `Number()` antes de `Number.isInteger`, porque
  `decimal(10,3)` llega como string en Postgres. Una cantidad no entera (venta por
  peso) se fuerza a `POR_ITEM`.
- Sólo ítems `ACTIVO`.
- Correlativo **por venta**, no por ítem: `FICHA 3/7`.
- **Precio** (si `fichasMostrarPrecio`): precio de lista efectivo,
  `Number(precioVentaUnitario) + Number(precioAdicionales) - Number(descuentoUnitario)`.
  Es la misma fórmula que el ticket de venta (`documentos-tickets.handler.ts:981`).
  En `POR_ITEM` se multiplica por la cantidad. El descuento global de la venta **no**
  se prorratea a la ficha; queda documentado.

**Formato de una ficha** (ancho 32/42/48):

```
        FIESTA PATRONAL 2026          ← fichasNombreEvento (tall, centrado), si hay
--------------------------------
          CERVEZA PILSEN              ← producto + presentación (big, centrado, envuelto)
       GRANDE - SIN HIELO             ← detalle de variación (cargarDetalleDeItems)
            4  x                      ← sólo POR_ITEM con cantidad > 1 (big)
           Gs. 15.000                 ← sólo si fichasMostrarPrecio
--------------------------------
FICHA 3/7              VENTA #1234
CAJA 12        29/10/2026 21:34
COD 1234-3
         ** REIMPRESION **            ← sólo en reimpresiones
```

Se arma con `ticketText`, `ticketKv`, `ticketColumns` y `ticketCantidad`, que ya
sanean CP437. El detalle de variación sale de `cargarDetalleDeItems`.

- `buildFichasVenta(dataSource, ventaId, { width, reimpresion })` es **pura**: devuelve
  `TicketLine[][]`, una por ficha. Es la que se testea.
- `printFichasVentaInternal(dataSource, ventaId, opts)` resuelve la impresora y llama
  **una vez a `printTicketSpec` por ficha**, con `cutAtEnd: true`.

  > Cambio de la revisión 1. Antes era un spec con `{type:'cut'}` intermedios, pero el
  > `cut` intermedio no avanza papel y rebana las últimas líneas: `feedBottomSafeArea`
  > sólo corre al final (`ticket.utils.ts:404/447`). Además, el fallback CUPS ignora
  > `cut` y saldría una tira continua. Una llamada por ficha es más lenta pero uniforme
  > en todos los backends.
- Si falla una ficha a la mitad, se corta el bucle y se avisa con
  `broadcastPrinterEvent` cuántas salieron (`k/N`).

### Impresora

Las fichas usan la misma impresora que el ticket de venta de la caja que cobra:
`getPrinterByRol(TICKET_VENTA, { dispositivoId: venta.dispositivo?.id })`, o sea
`Dispositivo.printerTicket` y, si no hay, el rol `TICKET_VENTA`.

**No se agrega un rol `FICHA`**, porque la resolución de tickets es por dispositivo y
no por sector. La impresora dedicada por caja (`Dispositivo.printerFicha`) queda para
la fase 2.

### Cancelación de una venta que ya emitió fichas

Esas fichas están en manos del cliente: cancelar la venta es devolver plata por algo
que puede seguir canjeándose.

- **Backend:** en `updateVenta`, dentro del bloque `willCancel` (~1530), antes del
  merge: si `entity.fichasCantidad > 0` se exige además `VENTAS_CANCELAR_CON_FICHAS`.
  El valor se lee de la **entidad en BD**, nunca del payload.
- **Frontend:**
  - `ultimas-ventas-dialog` y `list-ventas`: la confirmación avisa "Esta venta emitió N
    fichas. Recuperalas antes de cancelar."
  - `pdv.component.cancelarVenta()` opera sobre ventas ABIERTAS, que no tienen fichas,
    así que no cambia.
- **Caminos que esquivan `updateVenta`, documentados como no aplicables:**
  - `cancelarVentaCompletaEnTx` (`venta-reversa.utils.ts`, usado por
    `delivery-cancelar` y pedidos online) sólo cancela delivery o web, que no son
    venta directa.
  - El traspaso de mesa (~3293) sólo cancela ventas ABIERTAS de mesa.
  - `deleteVenta` se verifica al implementar. Si permite borrar una venta CONCLUIDA con
    fichas, se le aplica el mismo guard.
- **Rehabilitación** (CANCELADA→CONCLUIDA) no reimprime, porque el claim sigue
  seteado. Si hace falta, se reimprimen con el permiso de reimpresión. Es lo correcto:
  las fichas originales se recuperaron al cancelar.

### Reimpresión

- Handler nuevo `print-fichas-venta` (`{ ventaId }`), con
  `ensurePermission('DOCUMENTOS_REIMPRIMIR_FICHAS')` como primera sentencia.
- Sólo vale para ventas CONCLUIDA con `fichasEmitidasAt` no nulo.
- Incrementa `fichasReimpresiones` (UPDATE atómico `+1` vía QueryBuilder) e imprime
  con la marca `** REIMPRESION **`.
- UI: acción **Reimprimir fichas** en el `mat-menu` de `ultimas-ventas-dialog`, visible
  si `fichasCantidad > 0`. Ese diálogo usa `getVentasByCaja`, que devuelve la entidad
  `Venta`, así que el campo llega sin tocar el handler.

## Modelo de datos (una migración aditiva, SQLite + Postgres)

| Tabla | Columna | Tipo | Default |
|---|---|---|---|
| `pdv_config` | `fichas_habilitadas` | boolean | `false` |
| `pdv_config` | `fichas_modo` | varchar(20) | `'POR_UNIDAD'` |
| `pdv_config` | `fichas_mostrar_precio` | boolean | `false` |
| `pdv_config` | `fichas_nombre_evento` | varchar(120) | null |
| `producto` | `ficha_modo` | varchar(20) | null (= hereda) |
| `ventas` | `fichas_emitidas_at` | `datetime` (SQLite) / `timestamp` (Postgres) | null |
| `ventas` | `fichas_cantidad` | int | `0` |
| `ventas` | `fichas_reimpresiones` | int | `0` |

- Enum TS `FichaModo { POR_UNIDAD, POR_ITEM, NO_IMPRIME }`, guardado como varchar sin
  CHECK, igual que `SectorImpresoraRol`.
- `type` explícito en cada `@Column`. Para la fecha se usa el helper de tipo
  dependiente del driver que tenga el repo. Las columnas nullable se tipan
  `string | null` con `type: 'varchar'` (lección del PR #234).
- Migración `<ms>-FichasCantina` con timestamp real. En este contenedor Linux sirve
  `date +%s%3N`. `hasColumn` se copia **local** en la migración, como hacen las demás.
  Se registra en `getMigrations()` de `database.config.ts`.
- **`fichasNombreEvento` se guarda en UPPERCASE**, convertido en el handler de
  `PdvConfig`.
- Instalaciones existentes: `fichas_habilitadas = false`, cero cambio de comportamiento.

## Permisos

- `DOCUMENTOS_REIMPRIMIR_FICHAS` (módulo DOCUMENTOS): se alinea con los
  `DOCUMENTOS_REIMPRIMIR_*` existentes. Se da a **CAJERO** y **GERENTE**, porque en la
  cantina el cajero es quien reimprime cuando falla el papel.
- `VENTAS_CANCELAR_CON_FICHAS`: sólo **GERENTE**.

Los códigos van en `SEED_PERMISOS` (`permissions.handler.ts`). La asignación a roles
plantilla va en `electron/utils/seed-system.ts`.

## Alcance por superficie

- **Desktop / web `/admin`:** todo lo de este plan. `/admin` es el mismo bundle.
- **PWA mobile:** fuera de alcance en UI. El hook y el guard son backend, así que
  aplican igual. Si la PWA intenta cancelar una venta con fichas sin permiso, recibe el
  error del backend como cualquier otro rechazo. No se agrega `print-fichas-venta` al
  map generado de mobile.

## Fases

**F1: Backend**

- Entidades `PdvConfig`, `Producto` y `Venta`.
- Migración, registrada en `getMigrations()`.
- Permisos: seed y roles plantilla.
- `esVentaDirecta` y el refactor de los tres gates de cocina.
- `buildFichasVenta`, `printFichasVentaInternal` e `imprimirFichasSiCorresponde`.
- Hooks en `updateVenta` y `cobrar-venta-credito` (post-commit).
- Protección del merge. Guard de cancelación. Handler `print-fichas-venta`.
- Preload, `repository.service` y sus implementaciones IPC/HTTP.
- UPPERCASE del nombre del evento.

**F2: Frontend**

- `pdv-config-dialog`: sección **Cantina / Fichas** con habilitar, modo por defecto,
  mostrar precio y nombre del evento.
- `producto-informacion-general` + `gestionar-producto.service`: select **Ficha de
  cantina** con Heredar del PdV / Por unidad / Por ítem / No imprime.
- `ultimas-ventas-dialog`: Reimprimir fichas y aviso al cancelar. `list-ventas`: aviso
  al cancelar.
- Reglas: sin funciones ni getters en templates, `mat-menu`, colores de tema,
  `ConfirmationDialogComponent`.

**F3: Tests, docs, skill y backlog** (regla 24)

## Tests

`scripts/test-fichas-e2e.ts` → `npm run test:fichas`, sobre SQLite y con el patrón de
`test-delivery-e2e.ts`. `test:all` lo descubre solo desde `package.json`.

1. **Gate:** venta directa con fichas habilitadas emite. Con mesa, comanda, delivery,
   `canalOrigen` WEB o QR_MESA → 0. Con `fichasHabilitadas = false` → 0.
2. **No regresión de cocina:** con `esVentaDirecta` aplicado, la mesa, el delivery y la
   web siguen creando `ComandaItem`, y la venta directa no.
3. **POR_UNIDAD con varios ítems** (2 + 3) da 5 fichas numeradas 1/5…5/5. Atrapa una
   numeración por ítem.
4. **POR_ITEM:** 1 ficha con `4  x`.
5. **Override:** el producto POR_ITEM gana sobre el global. NO_IMPRIME excluye sólo ese
   ítem. `null` hereda.
6. **Cantidad decimal** como string (`'1.500'`) da 1 ficha.
7. **Ítems cancelados** no emiten.
8. **Precio:** sólo con el flag. Unitario vs subtotal según el modo, con valores
   `decimal` como string.
9. **Saneado:** "ÁREA VIP" sale "AREA VIP", sin `?`. Además el nombre se guarda en
   UPPERCASE.
10. **Concurrencia del claim:** `Promise.all` de dos `imprimirFichasSiCorresponde`
    → exactamente un claim con `affected = 1`.
11. **Merge:** `updateVenta` con la venta entera y `fichasEmitidasAt = null`,
    `fichasCantidad = 0` no altera las columnas.
12. **Cancelación:** sin `VENTAS_CANCELAR_CON_FICHAS` → rechaza, aunque el payload
    mande `fichasCantidad: 0`. Con el permiso pasa. Una venta sin fichas no lo pide.
13. **Crédito:** `cobrar-venta-credito` sobre una venta directa emite fichas **sin**
    pagaré, y lo hace después del commit (la venta se lee CONCLUIDA al reclamar).
14. **Reimpresión:** sin permiso → rechaza. Con permiso incrementa el contador y la
    ficha incluye `REIMPRESION`. Una venta ABIERTA o sin fichas → rechaza.
15. **Impresión:** con un `printTicketSpec` inyectado o mockeado se verifican N
    llamadas, cada una con `cutAtEnd`, y el orden ticket→fichas en el hook de
    `updateVenta`.
16. **Rehabilitación:** CANCELADA→CONCLUIDA no vuelve a reclamar.

Para que cada test pruebe algo, los que nacen de un riesgo (10–13) se verifican
revirtiendo la protección: el test tiene que ponerse rojo.

**Postgres:** la única verificación es el job *Migration run* del CI, para la
migración. El claim con `affected` usa el patrón de `motor.ts`, que ya corre en
Postgres. Queda declarado como no verificado localmente.

Además corren `npm run test:all` y `npm run check` (AOT).

**Prueba manual** en `docs/testing/TESTING-CHECKLIST-FICHAS-CANTINA.md`, con impresora
real:

- ancho 48 y 32;
- que el corte no rebane la última línea;
- ticket + fichas sin intercalarse;
- F2 / F10 / F11 / crédito con y sin pagaré;
- cancelar y reimprimir.

## Riesgos

- **Mucho papel:** 50 cervezas en POR_UNIDAD son 50 fichas. Es lo pedido, y se mitiga
  con el override POR_ITEM por producto.
- **Impresión fallida después del claim:** queda emitido sin papel. Llega aviso por
  `broadcastPrinterEvent` con `k/N` y se reimprime con permiso.
- **Una venta rápida que pasa a mesa o delivery:** el gate se evalúa **al concluir**.

## Hallazgos de la auditoría incorporados (revisión 2)

| # | Hallazgo | Cambio en el plan |
|---|---|---|
| A1 | El hook de crédito estaba dentro de `if (imprimirPagare)` y dentro de una transacción | Llamada post-commit y fuera del `if` |
| A2 | `updateVenta` mergea el payload: un reset del claim o un bypass del guard | Campos `fichas*` excluidos del merge; el guard lee de BD |
| A3 | El SQL crudo del claim no es portable | QueryBuilder + `affected`, como `motor.ts` |
| A4 | `cut` intermedio rebana la ficha; CUPS lo ignora | Un `printTicketSpec` por ficha |
| A5 | Permiso de reimpresión fuera de convención y negado al cajero | `DOCUMENTOS_REIMPRIMIR_FICHAS`, también para CAJERO |
| A6 | `cerrarVentasAbiertasMesa` no pasa por `updateVenta`; rehabilitar; `deleteVenta` | Tabla de caminos corregida y casos definidos |
| A7 | `esVentaDirecta` dependía de relaciones cargadas; semántica del `??` | Precondición de relaciones explícita; refactor de los 3 gates con no regresión |
| A8 | Decimales como string; descuento global | `Number()`; precio de lista efectivo sin prorrateo |
| A9 | Faltaban UPPERCASE, PWA, `seed-system.ts`, `getMigrations`, `hasColumn` local | Agregados |

No hubo contradicciones entre los dos auditores.

## Fuera de alcance (fase 2)

- Canje por escaneo en la barra.
- `Dispositivo.printerFicha`.
- Fichas en mesas.
- Entidad Evento con reportes por evento.
- UI de fichas en la PWA mobile.
