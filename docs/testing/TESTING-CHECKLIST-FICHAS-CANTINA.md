# Checklist de pruebas: fichas de cantina (venta directa)

Cubre el modo **cantina de eventos**. En la **venta rápida** del PdV, al finalizar
el cobro se imprimen **fichas**: un papel por producto que el cliente canjea en
la barra.

> ⚠️ **Hay que reiniciar la app.** El cambio toca handlers, tres entidades y una
> migración nueva (`FichasCantina`); el hot reload de Angular no alcanza.

> ⚠️ **Con impresora real.** Casi todo lo que puede salir mal está en el papel:
> cortes, columnas y caracteres. El test automático (`npm run test:fichas`)
> simula la impresora y no ve nada de eso.

---

## Preparación

1. *Configuración del PdV → CANTINA DE EVENTOS (FICHAS)*. Pide el permiso
   `VENTAS_PDV_CONFIGURAR`.
   - Activar **Imprimir fichas al cobrar una venta directa**.
   - Modo por defecto: **UNA FICHA POR UNIDAD**.
   - Nombre del evento: `fiesta patronal`. Tiene que guardarse en mayúsculas.
2. La terminal tiene que tener **impresora de tickets** (*Dispositivos*). Si no
   tiene, se usa la impresora con rol `TICKET_VENTA` o la default.
3. Tener dos productos simples, por ejemplo CERVEZA y GASEOSA, y uno marcado en
   su ficha (*Productos → Información general → Ficha de cantina*) como **Una
   ficha por ítem**, por ejemplo BALDE.

---

## Parte 0: Abrir una venta rápida

La venta rápida se abre con el botón **VENTA RÁPIDA** (junto a MESAS y
COMANDAS). Antes de este PR el botón no existía: las fichas no se podían
disparar desde ninguna pantalla.

| # | Paso | Esperado |
|---|---|---|
| 0.1 | Click en **VENTA RÁPIDA** sin cargar nada | El indicador dice `VENTA RÁPIDA` y `Venta ID NUEVA`. En la base **no** se crea ninguna venta |
| 0.2 | Desde 0.1, click en **MESAS** o en una mesa, o **Escape** | Sale del modo sin aviso; con una mesa, la selecciona |
| 0.3 | VENTA RÁPIDA → agregar un producto | Recién ahí se crea la venta (aparece su ID) |
| 0.4 | Desde 0.3, click en una mesa o comanda | Aviso "Hay una venta rápida abierta: cobrala o cancelala (F4)…". La venta sigue en pantalla |
| 0.5 | Desde 0.3, F4 (cancelar) | La venta se cancela y se puede volver a elegir una mesa |

| 0.6 | Con una venta rápida con ítems, recargar la pantalla (F5) y volver al PdV | Aviso "Se retomó la venta rápida #N…" y la venta aparece con sus ítems |
| 0.7 | *Configuración del PdV → Tipos de venta*: dejar sólo **Venta rápida** | El PdV entra directo en VENTA RÁPIDA y sólo muestra ese botón (sin mesas, comandas ni sectores) |
| 0.8 | Con sólo venta rápida, cobrar con F2 | Después del cobro el PdV queda otra vez en VENTA RÁPIDA / NUEVA |
| 0.9 | Apagar Mesas, Comandas, Venta rápida y Delivery y guardar | No deja: "Habilitá al menos un tipo de venta" |
| 0.10 | Apagar sólo Mesas | No aparece el tab MESAS; el PdV abre en COMANDAS |

> Sin test automático: no hay spec del PdV. Esta parte es la única cobertura.

## Parte 1: Emisión

| # | Paso | Esperado |
|---|---|---|
| 1.1 | Reabrir la config del PdV | El nombre del evento aparece como `FIESTA PATRONAL` |
| 1.2 | Venta rápida: 4 x CERVEZA. Cobrar con **F11** (Finalizar + Ticket) | Sale el **ticket de pago primero** y **después 4 fichas**, cada una con su corte |
| 1.3 | Mirar una ficha | Encabezado `FIESTA PATRONAL`; `CERVEZA` en letra grande; `FICHA 2/4`, `VENTA #N`, `CAJA N`, fecha y hora, y `COD N-2` |
| 1.4 | Mirar la hora en la ficha y en el ticket | Dice `p. m.` o `a. m.`, **sin `?`** (era un bug previo de todos los tickets) |
| 1.5 | Mirar el final de cada ficha | El corte **no rebana** la última línea (`COD …`) |
| 1.6 | Venta rápida: 2 x CERVEZA + 3 x GASEOSA, cobrar con **F10** (sin ticket) | **No** sale ticket de pago; salen **5 fichas** numeradas `1/5 … 5/5`. Las 2 primeras son cerveza y las 3 siguientes, gaseosa |
| 1.7 | Venta rápida: 3 x BALDE (override POR ÍTEM) + 2 x CERVEZA | 3 fichas: una que dice `3 x` grande + BALDE, y dos de CERVEZA |
| 1.8 | Venta rápida cobrada con **F2** (cobro rápido) | Salen las fichas |
| 1.9 | Venta rápida con un producto **No imprime ficha** (p. ej. ENTRADA) + 1 CERVEZA | Sale sólo la ficha de CERVEZA (`1/1`) |
| 1.10 | Una venta de **mesa** cobrada | **No** salen fichas; la comanda a la barra sigue saliendo como siempre |
| 1.11 | Un **delivery** o un pedido web cobrado | **No** salen fichas |
| 1.12 | Venta rápida **a crédito**, con el pagaré **desmarcado** | Salen las fichas aunque no se imprima ticket ni pagaré |
| 1.13 | Ídem **con** pagaré | Orden: ticket (si está activo el ticket automático), pagaré y después las fichas |

## Parte 2: Configuración

| # | Paso | Esperado |
|---|---|---|
| 2.1 | Activar **Mostrar el precio en la ficha** y vender 2 x CERVEZA | Cada ficha muestra el **precio unitario** |
| 2.2 | Ídem con un producto POR ÍTEM (3 x BALDE) | La ficha muestra el **subtotal** (3 × precio) |
| 2.3 | Desactivar **Imprimir el ticket de pago en el cobro rápido (F2) y a crédito** y cobrar con **F2** | Sólo salen fichas |
| 2.4 | Con esa opción desactivada, cobrar por el diálogo con **F11** | Sale el ticket igual: en el diálogo decide el cajero (F10 sin ticket, F11 con ticket) |
| 2.5 | Modo por defecto **UNA FICHA POR ÍTEM**, 4 x CERVEZA | 1 ficha `4 x CERVEZA` |
| 2.6 | Producto con ficha **Una ficha por unidad** y modo global POR ÍTEM | Ese producto sale por unidad |
| 2.7 | Volver un producto a **IGUAL QUE EL PDV**, guardar y reabrir | Queda en "IGUAL QUE EL PDV" (no se queda con el valor anterior) |
| 2.8 | Impresora de **58 mm (32 columnas)**: producto de nombre largo (`HAMBURGUESA COMPLETA CON PAPAS`) | El nombre se parte en varias líneas, no se corta ni se desborda |
| 2.9 | Nombre de evento con tilde inicial (`área vip`) | Se guarda `ÁREA VIP` y en el papel sale `AREA VIP`, sin `?` |
| 2.10 | Apagar **Imprimir fichas** y cobrar una venta rápida | No salen fichas |

## Parte 3: Reimpresión

| # | Paso | Esperado |
|---|---|---|
| 3.1 | *Utilitarios → Últimas ventas*, en una venta con fichas: menú ⋮ | Aparece **Reimprimir fichas (N)** |
| 3.2 | Reimprimir con usuario CAJERO | Salen las N fichas con `** REIMPRESION **` y el código termina en `-R1` (la segunda vez, `-R2`) |
| 3.3 | Con un usuario sin `DOCUMENTOS_REIMPRIMIR_FICHAS` (p. ej. MOZO) | Mensaje de permiso requerido; no imprime |
| 3.4 | En una venta sin fichas (de mesa) | La opción no aparece |
| 3.5 | Con la impresora **apagada**, reimprimir | Error visible. En la base `fichas_reimpresiones` **no** sube |

> ⚠️ Instalaciones existentes: los **roles plantilla no se actualizan solos**
> (el seed no toca un rol que ya existe). Hay que darle a mano
> `DOCUMENTOS_REIMPRIMIR_FICHAS` al rol CAJERO y `VENTAS_CANCELAR_CON_FICHAS` al
> GERENTE. El ADMINISTRADOR los recibe automáticamente.

## Parte 4: Cancelación

| # | Paso | Esperado |
|---|---|---|
| 4.1 | Últimas ventas → Cancelar una venta con 3 fichas | La confirmación dice "Esta venta emitió 3 fichas: recuperalas antes de cancelar." |
| 4.2 | Confirmar con CAJERO | Error **visible**: `PERMISO REQUERIDO: VENTAS_CANCELAR_CON_FICHAS`. La venta sigue CONCLUIDA |
| 4.3 | Confirmar con GERENTE | Se cancela |
| 4.4 | *Ventas → Historial* → Cancelar una venta con fichas | Mismo aviso y mismo permiso. El error se ve en pantalla (antes el historial no mostraba ningún error) |
| 4.5 | Historial → **Rehabilitar** la venta cancelada | Vuelve a CONCLUIDA y **no** reimprime fichas |
| 4.6 | Cancelar una venta **sin** fichas con CAJERO | Funciona como siempre |
| 4.7 | Con fichas **apagadas**, cobrar una venta rápida. Prender fichas, cancelar esa venta desde el historial y **rehabilitarla** | **No** salen fichas: rehabilitar no es cobrar |

## Parte 5: Fallos

| # | Paso | Esperado |
|---|---|---|
| 5.1 | Apagar la impresora y cobrar una venta rápida con 3 cervezas | El cobro **se completa**. Aparece el aviso de impresora del sistema |
| 5.2 | Prender la impresora → Últimas ventas → Reimprimir fichas | Salen las 3 con `REIMPRESION` |
| 5.3 | Terminal **sin** impresora y sin impresora default | El cobro se completa. La venta queda con fichas emitidas y se reimprime desde una terminal con impresora |
| 5.4 | Venta rápida de 300 cervezas (o de cantidad absurda por error) | Sale **una** ficha `300 x` por ítem: pasado el tope de 200 fichas, toda la venta sale por ítem |

---

## Qué verificar en la base (opcional)

```sql
SELECT id, estado, fichas_emitidas_at, fichas_cantidad, fichas_reimpresiones
FROM ventas ORDER BY id DESC LIMIT 10;
```

- Una venta directa cobrada tiene `fichas_emitidas_at` y `fichas_cantidad` > 0.
- Una venta de mesa o delivery tiene `fichas_cantidad = 0`.
- Cada reimpresión suma 1 a `fichas_reimpresiones`.

---

## Limitaciones de los tests automáticos

Para quien corra la batería en un entorno preparado:

- **`npm run test:fichas` corre sólo sobre SQLite.** En Postgres no se ejecutó nada
  de esto:
  - el claim (`UPDATE … WHERE fichas_emitidas_at IS NULL` + `affected`);
  - el `fichas_reimpresiones + 1`;
  - la migración `1793299117857-FichasCantina` sobre una base con datos.

  Lo único que toca Postgres es el job *Migration run* del CI, y sólo para la
  migración. Si hay un Postgres a mano, conviene:
  1. levantar la app en modo server sobre Postgres y cobrar una venta rápida;
  2. disparar dos cobros casi simultáneos de la misma venta y ver que sale una
     sola tanda;
  3. correr `npm run migration:generate` contra Postgres y confirmar que no
     genera diff (el `COMMENT` de `producto.ficha_modo` es el sospechoso).
- **La impresora es simulada** (`__setFichasPrintImplsForTests`). Los cortes, el
  ancho real, el `big` en 58 mm y el fallback CUPS (`lp`) sólo se ven con
  papel.
- **No cubiertos por test automático:**
  - el orden ticket → pagaré → fichas en el crédito **con** pagaré, porque el
    pagaré llama a la impresora real y no se puede inyectar;
  - el gate de `printComandaInternal` y `autoPrintComandaIfNeeded` tras el
    refactor a `esVentaDirecta`. Sí está cubierto `crearComandaItemsSiCorresponde`,
    y los otros dos usan exactamente el mismo predicado y las mismas relaciones;
  - que la reimpresión use la impresora del `Dispositivo` y no la default.
- **El build de Angular y el AOT pasan**, pero la UI (config del PdV, producto,
  últimas ventas, historial) no tiene test automático: la cubren las partes 2 a 4
  de este manual.
