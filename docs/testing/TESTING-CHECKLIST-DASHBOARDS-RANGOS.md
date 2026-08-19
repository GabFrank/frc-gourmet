# Testing Checklist — Rangos unificados en los dashboards

Cubre el cambio de 2026-08-19: selector de rango en Compras, Productos y Home
(antes solo lo tenía Ventas), util compartido de rangos y buckets, ranking de
mejor margen (CMV) en Productos con click al producto, y lista de Cajas Mayor
activas en el dashboard Financiero.

**Antes de empezar:** no hay migración. Basta con levantar la app actualizada.

**Ojo con el criterio de las cifras:** varias verificaciones comparan un total
contra la suma de las barras del chart. Si el chart está vacío porque no hay
datos en el período, no es un fallo — probá con un rango donde sí haya
movimiento (en la base de desarrollo, "6 meses" en Compras suele tener datos).

---

## Fase 1: Los chips aparecen donde corresponde

- [ ] **Ventas** → dashboard: los chips arriba del chart ahora incluyen **Hoy**,
      además de Esta semana / Este mes / 3 meses / 6 meses. Arranca en *Esta semana*
- [ ] **Compras** → dashboard: chips **Esta semana / Este mes / Mes pasado /
      3 meses / 6 meses**. Arranca en *Este mes*
- [ ] **Productos** → dashboard: chips **Hoy / Esta semana / Este mes /
      Mes pasado / 3 meses**, arriba a la derecha (este dashboard no tiene chart,
      van en el header). Arranca en *Este mes*
- [ ] **Inicio**: chips **Hoy / Esta semana / Este mes / 3 meses**. Arranca en
      *Esta semana*
  - Si el Home muestra la lista de onboarding en vez del dashboard, es porque
      quedan tareas sin completar — completalas o marcalas "No aplica" para ver
      el dashboard
- [ ] En los cuatro, el chip elegido queda resaltado y **solo uno** a la vez

---

## Fase 2: Los textos siguen al chip

Esto es lo que más se rompía antes: los datos cambiaban pero los títulos seguían
diciendo "del mes".

- [ ] **Compras**: al elegir *6 meses*, cambian a la vez el título del chart
      ("Compras · 6 meses"), las dos primeras cards ("COMPRAS · 6 MESES" y
      "TOTAL COMPRADO · 6 MESES") y el ranking ("Top proveedores · 6 meses")
- [ ] **Compras**: las cards de **CPP por vencer (7 días)** y **CPP vencidas**
      NO cambian con el rango. Es correcto: son alertas a futuro, no una serie
      histórica
- [ ] **Productos**: al elegir *Hoy*, el ranking del medio pasa a decir
      "Mas vendidos · Hoy"
- [ ] **Productos**: las 4 cards de arriba (Productos activos, Recetas activas,
      Sin precio, Parciales) NO cambian con el rango. Es correcto: son conteos
      del catálogo, no tienen período
- [ ] **Ventas**: al cambiar de chip, el ranking pasa a decir "Top productos · <rango>"
- [ ] **Inicio**: el título del chart sigue al chip ("Ventas · Este mes", etc.)

---

## Fase 3: Granularidad del chart

El eje X cambia de unidad según el rango elegido.

- [ ] **Hoy** → una marca por hora, etiquetadas `00h`, `01h`… hasta la hora
      actual (no hasta las 23h)
- [ ] **Esta semana** → 7 marcas con nombre de día (`Lun`, `Mar`…), la última es hoy
- [ ] **Este mes** → 30 marcas con número de día
- [ ] **Mes pasado** → los días del mes calendario anterior completo (28, 29, 30
      o 31 marcas según el mes)
- [ ] **3 meses** → 12 marcas semanales (`S1`…`S12`)
- [ ] **6 meses** → 6 marcas con nombre de mes (`Mar`, `Abr`…), la última es el
      mes actual

---

## Fase 4: El total de la card cierra con el chart

Esta es la verificación importante del cambio: antes, en *3 meses* y *6 meses*,
la card sumaba un período más largo que el que dibujaba el chart.

- [ ] **Compras** con *6 meses*: sumar a ojo los puntos del chart y comparar con
      **TOTAL COMPRADO · 6 MESES**. Tienen que dar lo mismo
- [ ] Repetir con *3 meses*
- [ ] Repetir con *Este mes* y *Mes pasado*
- [ ] Pasar de un rango a otro y volver: los números vuelven a los mismos valores
      (no se acumulan ni quedan pegados del rango anterior)

---

## Fase 5: Productos — mejor margen (CMV) y click al producto

- [ ] En **Productos** hay tres listas del mismo tamaño, una al lado de la otra:
      **Mejor margen (CMV)**, **Mas vendidos** y **Productos parciales**
- [ ] "Mejor margen (CMV)" lista productos con su **porcentaje de margen** a la
      derecha y, debajo, el precio de venta y el costo
- [ ] Los porcentajes bajan de arriba hacia abajo (el primero es el de mejor margen)
- [ ] Verificar un producto a mano: margen = (precio venta − costo) / precio
      venta × 100. Con 50.000 de venta y 5.101 de costo da 89,8%
- [ ] Los productos **sin** precio de venta o **sin** precio de costo NO aparecen
      en la lista. Tampoco los que venden a pérdida o al costo
- [ ] Pasar el mouse por encima de un item de cualquiera de las tres listas: el
      cursor cambia a mano y el nombre se subraya
- [ ] Click en un item de **Mejor margen** → se abre la pestaña de edición de ese
      producto, con ese producto cargado (no el listado general)
- [ ] Lo mismo desde **Mas vendidos** y desde **Productos parciales**
- [ ] Volver a la pestaña del dashboard: sigue en el rango que habías elegido
- [ ] "Precios desactualizados (>30 días)" sigue estando, ahora abajo, a lo ancho

---

## Fase 6: Financiero — Cajas Mayor activas

- [ ] En **Financiero** → dashboard, columna derecha, hay una card nueva
      **Cajas Mayor activas** con el número de cajas en el badge
- [ ] Aparece una fila por cada caja mayor **abierta**, con su nombre y su saldo
- [ ] Las cajas mayor **cerradas** no aparecen
- [ ] La card está **arriba** de "Cajas abiertas" y son dos cosas distintas:
      "Cajas abiertas" son las cajas del PdV (con cajero y hora de apertura)
- [ ] Click en una fila → abre la pestaña de detalle de **esa** caja mayor
- [ ] **El saldo de la card coincide con el "Saldo en caja / EFECTIVO" que
      muestra el detalle.** Si la caja tiene saldos en formas de pago que no
      mueven efectivo (por ejemplo TRANSFERENCIA), esos NO se suman
- [ ] Si no hay ninguna caja mayor abierta, la card dice "No hay cajas mayor
      abiertas" en vez de quedar vacía

---

## Fase 7: Tema y responsive

- [ ] Todo lo anterior se ve bien en **tema oscuro y en claro** (los chips
      activos, el subrayado de los items clickeables, la card de Cajas Mayor)
- [ ] Achicar la ventana: las tres listas de Productos pasan a 2 columnas y
      después a 1, sin que aparezca scroll horizontal en la página

---

## Fase 8: Regresión

- [ ] Los dashboards de **RRHH** y los **Reportes de cierre de mes** siguen
      funcionando igual (usan el mismo componente de ranking, que cambió)
- [ ] Ningún ranking que antes no era clickeable se volvió clickeable
- [ ] La **PWA mobile** sigue abriendo sus pantallas de reportes sin error
