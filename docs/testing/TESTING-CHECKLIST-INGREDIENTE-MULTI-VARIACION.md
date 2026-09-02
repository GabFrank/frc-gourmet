# Testing Checklist — Asistente "agregar ingrediente a otras variaciones"

Cubre el fix del bug por el que el asistente **duplicaba (triplicaba) el mismo ingrediente**
en las recetas de las variaciones.

**Contexto del bug:** al agregar un ingrediente en la receta de una variación, el asistente
preguntaba si copiarlo a las demás variaciones del sabor y hacía un `create-receta-ingrediente`
suelto por variación, sin validar nada. Si dos variaciones **compartían receta** (datos previos
al refactor "una receta por variación") las N inserciones caían en la MISMA receta; y correr el
asistente desde otra variación volvía a insertar donde ya estaba. Además la copia se guardaba
en la unidad del usuario (100 GRAMOS) en vez de la unidad base (0.1 KILOGRAMOS), lo que
inflaba el costo 1000×.

**Ahora** todo lo resuelve el handler transaccional `agregar-ingrediente-multiples-variaciones`.

Requiere **reiniciar la app** (cambia `electron/handlers/recetas.handler.ts` y `preload.ts`).

## Pre-requisitos

- Producto tipo `ELABORADO_CON_VARIACION` con al menos 3 presentaciones (ej. PIZZA: MEDIANO,
  GRANDE, FAMILIAR) y un sabor con sus variaciones generadas.
- Usuario con permiso `INGREDIENTES_GESTIONAR`.

## Caso feliz — variaciones con receta propia

- [ ] Abrir *Productos → Gestionar Producto → Sabores* y entrar a **Gestionar receta** de la variación MEDIANO
- [ ] Agregar un ingrediente (ej. QUESO MOZARELLA, 100 GRAMOS)
- [ ] Aparece el diálogo "¿Agregar a otras variaciones?" → **Sí**
- [ ] El diálogo lista GRANDE y FAMILIAR, ambas **marcadas y editables**
- [ ] Ajustar cantidades (ej. 150 y 200) → *Guardar Cambios*
- [ ] Snackbar dice "2 variaciones actualizadas" (sin omitidas)
- [ ] La tabla de MEDIANO muestra **una sola** fila de QUESO MOZARELLA
- [ ] Abrir la receta de GRANDE → una sola fila, 150 GRAMOS
- [ ] Abrir la receta de FAMILIAR → una sola fila, 200 GRAMOS

## No duplica al repetir el asistente

- [ ] En la receta de GRANDE, agregar otro ingrediente y decir **Sí** al asistente
- [ ] Ahora agregar de nuevo **QUESO MOZARELLA** en FAMILIAR (el alta manual ya lo bloquea:
      "Este ingrediente ya está en la receta")
- [ ] Borrar QUESO MOZARELLA sólo de FAMILIAR, volver a agregarlo ahí y decir **Sí**
- [ ] MEDIANO y GRANDE aparecen **deshabilitadas** con el chip **YA LO TIENE**
- [ ] El pie del diálogo explica por qué están deshabilitadas
- [ ] Guardar → snackbar "0 variaciones actualizadas (2 omitidas…)"
- [ ] Ninguna receta quedó con filas repetidas

## Recetas compartidas (datos viejos)

Sólo aplica si el producto viene de antes del refactor de recetas por variación.

- [ ] En un sabor cuyas variaciones comparten receta, agregar un ingrediente y decir **Sí**
- [ ] Las variaciones que comparten la receta actual aparecen deshabilitadas con el chip
      **COMPARTE LA RECETA ACTUAL**
- [ ] Guardar no agrega filas nuevas; la receta sigue con **una sola** fila del ingrediente
- [ ] (Opcional) Correr *Gestión de Sabores → Reparar recetas compartidas* y repetir el flujo:
      ahora las variaciones sí se pueden seleccionar y cada receta recibe su copia

## Unidades y costo

- [ ] Usar un ingrediente cuyo producto tenga `unidadBase = KILOGRAMO` y cargarlo en GRAMOS
- [ ] Copiar a otra variación con el asistente (ej. 150 GRAMOS)
- [ ] En la receta destino la tabla muestra **150 GRAMOS** (no 0.15)
- [ ] El costo del ingrediente en la receta destino es coherente con el de la receta origen
      (≈ 1.5× si la cantidad es 1.5×), **no** 1000× mayor
- [ ] Lo mismo con un producto `unidadBase = LITRO` cargado en MILILITROS

## Ingrediente borrado y vuelto a agregar

`delete-receta-ingrediente` desactiva la fila la primera vez (soft delete) y la lista de
ingredientes no filtra por `activo`, así que insertar una fila nueva al lado volvería a
mostrarlo repetido. El handler reactiva la fila existente.

- [ ] En la receta de GRANDE, borrar QUESO MOZARELLA **una sola vez** (queda desactivado)
- [ ] Volver a la receta de MEDIANO, agregar QUESO MOZARELLA y decir **Sí** al asistente
- [ ] GRANDE aparece **habilitada** (no bloqueada por la fila desactivada)
- [ ] Guardar → la receta de GRANDE queda con **una sola** fila de QUESO MOZARELLA, activa,
      con la cantidad nueva

## Casos borde

- [ ] Ingrediente **solo descripción** (sin producto vinculado): el asistente lo copia igual y
      no lo duplica al repetirlo
- [ ] Sabor con una sola variación: el asistente avisa "No hay otras variaciones en este sabor"
- [ ] Cantidad en 0 en una fila del diálogo → esa variación no se agrega
- [ ] Cancelar el diálogo → no se agrega nada
- [ ] Usuario **sin** `INGREDIENTES_GESTIONAR` → la operación falla con error de permiso

## Automatizado

```bash
npm run test:ingrediente-multi-variacion   # 16 checks
npm run test:reparar-recetas               # recetas compartidas (regresión)
npm run test:receta-por-variacion          # una receta por variación (regresión)
```
