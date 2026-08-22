# Manual de pruebas — Modelo mesa ↔ comanda

> **La idea en una frase:** el **color** de la mesa dice si tiene cuenta propia;
> el **badge** dice cuántas comandas hay sentadas ahí. Son dos cosas distintas y
> se leen por separado.

| Color | Badge | Significa | Qué hace el cajero |
|---|---|---|---|
| 🟢 verde | — | vacía | nada |
| 🟡 amarillo | N | sin cuenta de mesa, N comandas | **no le cobra a la mesa**; cobra cada comanda |
| 🟠 naranja | — | cuenta de mesa | cobra la mesa |
| 🟠 naranja | N | cuenta de mesa **+** comandas | ⚠️ hay 2 cuentas o más |
| 🔵 azul | cualquiera | reservada | — |

---

## A. El plano

### A1. Los cuatro estados se distinguen

Armá las cuatro situaciones y mirá el plano de un vistazo, desde donde te parás
normalmente (no pegado a la pantalla):

1. Una mesa sin nada → **verde**.
2. Una mesa sin cuenta, con una comanda vinculada → **amarilla con badge 1**.
3. Una mesa con cuenta propia → **naranja**.
4. Una mesa con cuenta propia **y** una comanda → **naranja con badge 1**.

**Esperado:** el amarillo y el naranja se distinguen sin esfuerzo. Si dudás entre
2 y 4, decímelo: ese era el problema del color anterior.

### A2. Los tooltips no mienten

Pasá el mouse por cada una:

- verde → *"Mesa libre"*
- amarilla → *"Sin cuenta de mesa · 1 comanda sentada acá"*
- naranja → *"Cuenta de mesa abierta"*
- naranja con badge → *"Cuenta de mesa + 1 comanda — hay 2 cuentas"*

Antes una mesa con comanda decía **"Mesa disponible"** con un badge que decía 1.

### A3. La selección se ve sobre los cuatro colores

Seleccioná una de cada color.

**Esperado:** el marco de selección se distingue en las cuatro. Sobre amarillo el
marco es **oscuro**; sobre las demás, blanco. (El blanco sobre amarillo era casi
invisible.)

### A4. El color no se queda viejo

Con una mesa **seleccionada**, cargale el primer ítem.

**Esperado:** pasa de verde a naranja **en el momento**, sin deseleccionar ni
recargar. Después cobrala: vuelve a verde igual de rápido.

> Este es el caso que más fácil se rompe: el refresco automático saltea a
> propósito la mesa seleccionada para no pisar lo que estás editando.

### A5. El contador del tab coincide con lo que se ve

Contá las mesas naranjas del plano y comparalas con el número del badge del tab
**MESAS**.

**Esperado:** el mismo número. Las amarillas **no** cuentan.

---

## B. Transferencias

### ▶ B1. Mesa completa → comanda: la cuenta SE VA de la mesa

1. Mesa con cuenta y algunos ítems.
2. **TRANSFERIR** → chip **COMANDAS** → una comanda libre.

**Esperado:** la mesa queda **verde**. La comanda queda abierta y **sin mesa**
(al abrirla no dice "Mesa N").

> Este es el bug reportado: antes la comanda quedaba vinculada a la mesa y la
> mesa se quedaba naranja, sin cuenta y sin forma de atenderla ni liberarla.

### ▶ B2. Ítems de mesa → comanda: la cuenta se queda EN la mesa

1. Mesa con 3 ítems.
2. **MOVER ITEMS** → tildá uno → **CONFIRMAR MOVER (1)** → chip **COMANDAS** →
   comanda libre.

**Esperado:** la comanda se abre **con la mesa** (dice "Mesa N" en su cabecera) y
la mesa sigue **naranja** con los 2 ítems restantes. Es dividir la cuenta en la
misma mesa.

### B3. Comanda → mesa

Transferí una comanda completa a una mesa libre.

**Esperado:** la comanda vuelve a libre; la mesa destino queda naranja.

### B4. Abrir la comanda desde la mesa

Seleccioná una mesa que tenga comandas. En la card de detalle, al lado del
estado, aparecen chips con el número de cada comanda.

**Esperado:** al tocarlos se abre esa comanda directamente, sin ir a la pestaña
COMANDAS a buscarla por número.

---

## C. Cobrar

### ▶ C1. Cobrar una mesa que tiene comandas encima

Mesa con cuenta propia **y** una comanda. Cobrá **la cuenta de la mesa**.

**Esperado:** el cobro termina, la pantalla se limpia y la mesa queda
**amarilla con badge** (le sigue quedando la comanda).

> Antes esto rompía: liberar la mesa tiraba error, la excepción cortaba la
> limpieza de pantalla y el PdV seguía mostrando los ítems de una venta ya
> cobrada.

### C2. Cobrar la comanda

Cobrá esa comanda.

**Esperado:** la comanda queda libre y la mesa pasa a **verde**.

---

## D. Tickets

### ▶ D1. Dos cuentas en la misma mesa

Con una mesa que tenga cuenta propia **y** una comanda vinculada, mandá a cocina
un ítem de cada una.

**Esperado:** los dos tickets se distinguen. El de la comanda muestra **MESA N** y
**COMANDA #X**; el de la mesa, sólo **MESA N**.

> Antes los dos salían idénticos: una comanda con mesa nunca imprimía su número.

### D2. Pre-cuenta de una comanda

Imprimí la pre-cuenta de una comanda vinculada a una mesa.

**Esperado:** muestra mesa y comanda. Antes la comanda **no aparecía nunca**.

### D3. Comanda sin mesa

Una comanda de barra (sin mesa): su ticket debe mostrar **COMANDA #X**.

---

## E. Mover una comanda de mesa

Con una comanda abierta en la mesa 5, **EDITAR** → cambiala a la mesa 8.

**Esperado:** la 5 y la 8 quedan con el color que les corresponde (si ninguna
tiene cuenta propia, las dos verdes; la 8 con badge). Los tickets de esa comanda
pasan a decir MESA 8.

---

## F. PWA mobile

Entrá desde el celular. Abrí una mesa con cuenta y transferila a otra.

**Esperado:** funciona, y si algo falla el mensaje es legible (*"La cuenta de
origen tiene cobros parciales…"*), no `HTTP 400: {"error":...}`.

> La transferencia de mobile pasó a usar el mismo canal transaccional del
> desktop. Antes eran 4 a 6 llamadas sueltas: si una fallaba a mitad —wifi de
> salón— los ítems quedaban movidos y la mesa origen ocupada.

⚠️ El modelo de 3 colores **todavía no está en mobile**: ahí las mesas se siguen
viendo ocupada/libre. Está anotado en el backlog.

---

## Qué mirar si algo no cuadra

```sql
-- La verdad: una mesa está ocupada si tiene cuenta PROPIA
SELECT m.numero,
       m.estado AS cache,
       (SELECT COUNT(*) FROM ventas v
         WHERE v.mesa_id = m.id AND v.estado='ABIERTA' AND v.comanda_id IS NULL) AS cuenta_propia,
       (SELECT COUNT(*) FROM comandas c
         WHERE c.pdv_mesa_id = m.id AND c.estado='OCUPADO' AND c.activo=1) AS comandas
  FROM pdv_mesas m
 WHERE m.activo = 1
 ORDER BY m.numero;
```

`cache` puede diferir de `cuenta_propia` sin que se rompa nada — las pantallas
derivan. Pero si difiere seguido, hay un camino que no está resincronizando.

Tests que cubren lo mismo: `npm run test:mesa-estado` (los colores),
`npm run test:mesa-ocupacion` (el estado derivado y el cache),
`npm run test:transferencia-pdv` (las 8 celdas), `npm run test:ticket-venta`
(los encabezados).
