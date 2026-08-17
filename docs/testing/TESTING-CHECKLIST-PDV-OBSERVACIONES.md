# Checklist manual — ingrediente opcional sin nombre + nota libre del ítem

Cubre el fix de 2026-08-17 (PdV). Dos bugs distintos que se ven en la misma
pantalla: el diálogo de personalización de un ítem.

> **Requiere reiniciar la app**: hay cambios de backend (`electron/handlers/`,
> `electron/utils/`). El hot reload de Angular no alcanza.

**Preparación** — necesitás:

- Un producto con receta que tenga un **ingrediente opcional cargado sólo con
  `descripcion`** (sin producto vinculado). Es el caso que rompía. En *Productos
  → Gestionar producto → Receta*, agregá un ingrediente escribiendo sólo la
  descripción (ej. `ACEITUNAS`) y marcalo como opcional.
- Ese mismo producto con al menos **una observación vinculada** (*Gestionar
  producto → Observaciones*, ej. `BUSCAR`).
- Una impresora con rol `COMANDA` configurada para el sector del producto (para
  el bloque 3). Si no tenés, saltealo y anotalo.

---

## 1. El ingrediente opcional muestra su nombre

### 1.1 En el diálogo de personalización
- [ ] PdV → agregá el producto a una mesa → **Personalizar**.
- [ ] En **INGREDIENTES → OPCIONALES**, el chip muestra **`ACEITUNAS`**.
      *(Antes: chip verde con el tilde y sin ningún texto.)*
- [ ] Si el producto tiene ingredientes **INTERCAMBIABLES** cargados sólo con
      descripción, también muestran su nombre.
- [ ] Los ingredientes fijos (base + normales) se listan con nombre, sin huecos
      ni comas sueltas.

### 1.2 En el detalle del ítem en el PdV
- [ ] Quitá el opcional (click en el chip) y agregá el ítem.
- [ ] Click en la fila del ítem para expandir el detalle: el chip rojo dice
      **`SIN ACEITUNAS`**. *(Antes: decía sólo `SIN`.)*
- [ ] Si probaste un intercambiable: el chip naranja dice
      `ACEITUNAS → <reemplazo>`.

### 1.3 En la app mobile (PWA)
- [ ] Abrí la misma mesa en el cliente mobile → detalle del ítem.
- [ ] Dice `Sin ACEITUNAS`. *(Antes: `Sin ingrediente`.)*

### 1.4 Ingrediente normal (no regresión)
- [ ] Repetí 1.1 y 1.2 con un producto cuyo ingrediente **sí** tiene producto
      vinculado: sigue mostrando el nombre del producto, igual que antes.

---

## 2. Nota libre del ítem

### 2.1 Observación del catálogo + nota libre — el caso reportado
- [ ] Personalizá el ítem: marcá la observación **`BUSCAR`** y escribí en
      **OBSERVACIÓN LIBRE** el texto `SIN PICANTE`. Agregar.
- [ ] En el detalle del ítem hay **dos chips**: `BUSCAR` y `SIN PICANTE`.
      *(Antes: dos chips que decían `BUSCAR` y la nota no aparecía en ningún
      lado.)*

### 2.2 Sólo nota libre, sin ninguna observación marcada
- [ ] Personalizá otro ítem: **no marques ninguna observación**, escribí sólo
      `PARA LLEVAR`. Agregar.
- [ ] Aparece un chip `PARA LLEVAR`. *(Antes: no se guardaba nada — el error
      moría en la consola y la nota se perdía sin aviso.)*
- [ ] En ningún chip aparece el texto `NOTA DEL CLIENTE`.

### 2.3 Reabrir el diálogo no ensucia la selección
- [ ] Sobre el ítem de 2.1: **Personalizar** de nuevo.
- [ ] `BUSCAR` aparece marcada, y **`NOTA DEL CLIENTE` no aparece** como
      observación marcada.
- [ ] El campo OBSERVACIÓN LIBRE viene precargado con `SIN PICANTE`.
- [ ] Cambiá la nota a `BIEN CALIENTE` y guardá: queda una sola nota, la nueva.

### 2.4 Editar ítem (menú ⋮ → Editar)
- [ ] Abrí **Editar** sobre un ítem, marcá una observación y escribí una nota.
- [ ] Guardá y expandí el detalle: la observación aparece **una sola vez** y la
      nota como chip aparte. *(Antes la nota se pegaba dentro de cada
      observación seleccionada.)*

### 2.5 Pizza / producto con variación
- [ ] Agregá una pizza, personalizá **un sabor** con una observación + nota.
- [ ] Mismo resultado que 2.1: sin duplicados y con la nota visible.

### 2.6 Mobile
- [ ] Desde el cliente mobile, editá un ítem: marcá observación + nota, guardá.
- [ ] El detalle muestra ambas por separado; al reabrir, la nota viene
      precargada y el sentinel no aparece marcado.

---

## 3. Comanda de cocina

- [ ] Con el ítem de 2.1 (observación `BUSCAR` + nota `SIN PICANTE`), mandá la
      comanda.
- [ ] El ticket impreso muestra **`>> BUSCAR`** y **`>> SIN PICANTE`**, cada uno
      una vez. *(Antes: `>> BUSCAR` dos veces y la nota nunca se imprimía.)*
- [ ] La línea del ingrediente quitado sale como `SIN ACEITUNAS` en video
      inverso, como siempre.

### 3.1 KDS
- [ ] Si usás KDS, la comanda en pantalla muestra la observación y la nota por
      separado (el KDS ya lo hacía bien; es control de no regresión).

---

## 4. Base de datos (opcional, para confirmar el modelo)

```sql
-- Una fila por observación + UNA sola fila para la nota, colgada del sentinel.
SELECT vio.id, o.descripcion AS observacion, vio."observacionLibre"
FROM venta_item_observaciones vio
JOIN observacion o ON o.id = vio.observacion_id
WHERE vio.venta_item_id = <ID_DEL_ITEM>;
```

- [ ] La fila de la nota tiene `observacion = 'NOTA DEL CLIENTE'` y el texto en
      `observacionLibre`, en MAYÚSCULAS.
- [ ] Existe **una sola** `Observacion` con descripción `NOTA DEL CLIENTE` en
      todo el catálogo:
      `SELECT COUNT(*) FROM observacion WHERE descripcion = 'NOTA DEL CLIENTE';`
- [ ] Esa observación **no** aparece como opción marcable en el diálogo de
      personalización (sólo se vinculan al producto las que vos elegís en
      *Gestionar producto → Observaciones*).

---

## Cobertura automática

`npm run test:observacion-libre` (13 asserts) cubre la parte de backend: nota
sola, observación + nota, varias observaciones + nota, el texto que arma la
comanda, el rechazo de la llamada vacía y la reutilización del sentinel.

El fallback del **nombre del ingrediente** es de templates Angular, así que no
está cubierto por ese test: se verifica con el bloque 1 de este checklist.

> **Gotcha al correr los `test:*` localmente:** los `.js` compilados que quedan
> en `electron/` (gitignorados) le ganan a los `.ts` en ts-node. Si editaste un
> handler, corré `npm run electron:serve-tsc` antes de testear o vas a estar
> ejecutando la versión vieja.
