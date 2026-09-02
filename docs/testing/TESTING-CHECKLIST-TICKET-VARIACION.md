# Manual de pruebas — Detalle de variación en el ticket

Rama `feat/ticket-detalle-variacion`. El ticket del cliente pasa de decir
«1 PIZZA» a decir qué pizza, de qué tamaño, con qué sabor, qué se le sacó y qué
extras lleva.

**Aplica a los tres tickets**: venta, pre-cuenta y delivery.

---

## 1 · El checkbox nuevo en la presentación

*Productos → editar un producto → Presentaciones y precios*

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 1.1 | Creá o editá una presentación | Aparece **«Mostrar en el nombre del producto»**, tildado por defecto |
| 1.2 | Pasá el mouse por encima | El tooltip explica cuándo destildarlo |
| 1.3 | Destildalo y guardá | Se guarda sin error |
| 1.4 | Volvé a abrir la presentación | Sigue destildado (no se pierde al recargar) |

## 2 · El checkbox nuevo en el sabor

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2.1 | Abrí el diálogo de un sabor | Mismo checkbox, tildado por defecto |
| 2.2 | Destildalo, guardá y reabrí | Persiste |

## 3 · El efecto en el ticket

Necesita una venta con un producto de variación. Con el catálogo real, PIZZA y
PAPAS FRITAS sirven.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 3.1 | Vendé una PIZZA GRANDE CALABRESA y sacá el ticket | Debajo del producto aparece `GRANDE · CALABRESA` |
| 3.2 | Agregale un adicional | Aparece `+ BORDE CHEDDAR`, **sin importe propio** — su precio ya está dentro del total de la línea |
| 3.3 | Sacale un ingrediente | Aparece `SIN CEBOLLA`, sin el video invertido de la comanda |
| 3.4 | Poné una observación | Aparece el texto, **sin el prefijo `>>`** (ese es de cocina) |
| 3.5 | Vendé una pizza **mitad y mitad** | `GRANDE · 1/2 CALABRESA + 1/2 4 QUESOS` |
| 3.6 | Repetí en una impresora de **58 mm** | La línea larga **se envuelve en dos**, no se corta. Los dos sabores tienen que verse |
| 3.7 | Mirá la comanda de cocina | Sigue igual que siempre: `ADD`, `>>`, `SIN X` invertido, sabores en grande |

## 4 · El flag apagando una parte

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 4.1 | En QUESADILLAS, destildá la presentación «TRADICIONAL» | El ticket pasa de `QUESADILLAS TRADICIONAL CARNE` a `QUESADILLAS CARNE` |
| 4.2 | En MILANESITA, destildá el sabor «TRADICIONAL» | Pasa a `MILANESITA DON FRANCO GRANDE` |
| 4.3 | En AROS DE CEBOLLA **no toques nada** | Sigue diciendo `TRADICIONAL`, y está bien: ahí sí distingue de BACON Y CHEDDAR |

## 5 · El nombre que se pudría al renombrar

Este es el bug viejo que se arregla de paso.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 5.1 | Renombrá un **sabor** que tenga variaciones | En *Gestión de Sabores*, el nombre de sus variaciones se actualiza |
| 5.2 | Renombrá un **producto** con variaciones | Ídem |
| 5.3 | Renombrá una **presentación** | Ídem |
| 5.4 | Sacá un ticket de cualquiera de ellos | Muestra el nombre nuevo (el ticket compone en vivo, así que esto ya andaba) |

---

## Los 7 registros que conviene destildar en producción

No se pre-marcaron en la migración a propósito: adivinar por el nombre y
cambiar datos en silencio es peor que dejar el switch. En el catálogo real:

- **Presentación** «TRADICIONAL» de QUESADILLAS
- **Sabor** «TRADICIONAL» de MILANESITA DON FRANCO, PICADA DON FRANCO,
  POLLITO EMPANADO, TILAPIA y PORCION TILAPIA EMPANADA

## Qué NO se verificó

- **Impresión física.** Los tests comparan el texto renderizado, que es la
  condición necesaria. Cómo sale en papel a 58 y 80 mm hay que verlo en el local
  (pasos 3.6 y 3.7).
- El desarrollo corrió contra **Postgres**; los tests, sobre **SQLite**. Los dos
  motores quedan cubiertos, pero no se probó la app empaquetada.
