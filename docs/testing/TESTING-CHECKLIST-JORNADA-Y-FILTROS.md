# Testing Checklist — Jornada comercial + filtros del resumen de ventas

Cubre el cambio de 2026-08-24: la ventana que define "un día" pasa a ser
configurable (default **07:00 → 06:59 del día siguiente**), y el resumen de
ventas de la PWA gana filtros por fecha y por caja.

**Antes de empezar:**

- **Hay migración** (`InicioJornadaHora`): arrancar la app una vez y verificar en
  el log que corrió sin error. Se agrega `pdv_config.inicio_jornada_hora`
  con default `7`.
- Tras `npm run build:mobile`, **reiniciar la app**. Si no, Fastify sigue
  sirviendo el bundle viejo y la PWA queda con el cartel "No se pudo cargar la
  app" — sin errores en consola.
- Ideal tener al menos **una venta después de medianoche y antes de las 07:00**.
  Si la base de desarrollo no la tiene, se puede fabricar cambiando
  temporalmente `inicio_jornada_hora` a un valor que deje ventas reales del otro
  lado del corte (ver Fase 5).

**El criterio de fondo, para leer los resultados:** con la jornada en 7, una
venta de la 01:30 del 16 pertenece a la jornada del **15**. No es un error de
fecha — es el punto del cambio: las cajas del turno noche cruzan las 00:00 y
siguen hasta las 2 AM, y antes ese turno aparecía partido en dos días.

---

## Fase 1: La configuración existe y se guarda

- [ ] **PdV → Configuración**: aparece la sección **JORNADA COMERCIAL** con el
      campo *Inicio de la jornada (hora)* en **7**
- [ ] Debajo del campo hay una nota explicando por qué existe la opción
- [ ] Cambiar a **5**, guardar, cerrar y volver a abrir el diálogo: sigue en **5**
- [ ] Cambiar a **0**, guardar, reabrir: **sigue en 0** (no vuelve a 7)
  - Esto último es la regresión concreta que se cuidó: `0` es un valor válido
    (día calendario) y con un `||` en vez de `??` se convertía en 7 solo
- [ ] El campo no acepta valores fuera de 0–23
- [ ] Dejarlo de nuevo en **7** antes de seguir

## Fase 2: El cambio se ve enseguida

- [ ] Con la jornada en 7, abrir **Ventas → Resumen** y anotar el total
- [ ] Volver a la configuración, poner **0**, guardar
- [ ] Volver al resumen y refrescar: si hay ventas de madrugada, **el total cambia
      en el acto** — no hay que esperar ni reiniciar
  - El valor se cachea 60 s en el backend; guardar la config invalida ese caché.
    Si tuvieras que esperar un minuto, eso es el bug
- [ ] Dejarlo de nuevo en **7**

## Fase 3: El resumen sin filtros no cambió

- [ ] **Ventas → Resumen** abre igual que antes, sin panel de filtros desplegado
- [ ] Arriba a la izquierda dice **"Jornada de hoy"**
- [ ] El botón `tune` **no** tiene badge (no hay filtros activos)
- [ ] Con una caja abierta, el label del total dice **"Total en caja"**
- [ ] Sin cajas abiertas, dice **"Total del día"**
- [ ] El botón de refrescar sigue funcionando

## Fase 4: Filtros de fecha

- [ ] Tocar `tune`: se despliega el panel con **Desde**, **Hasta**, **Cajas**
      y los botones **Limpiar** / **Aplicar**
- [ ] El panel muestra la nota de la jornada con las horas reales
      ("Un día va de las 07:00 a las 06:59 del día siguiente")
- [ ] Elegir **Desde = Hasta = una fecha con ventas** y tocar **Aplicar**:
  - [ ] El panel se cierra
  - [ ] El badge del botón `tune` muestra **2**
  - [ ] Arriba aparece el rango consultado con **hora**, del estilo
        `15/07 07:00 → 16/07 06:59`
  - [ ] El label del total pasa a **"Total del período"**
- [ ] **Este es el chequeo que importa:** la fecha del rótulo *"hasta"* es el día
      **siguiente** al elegido, a las 06:59. Si dijera el mismo día a las 23:59,
      la jornada no se está aplicando
- [ ] Elegir un rango de varios días: el total crece y el rótulo lo refleja
- [ ] **Limpiar**: vuelve a "Jornada de hoy", el badge desaparece y el label del
      total vuelve a "Total en caja" / "Total del día"

### Validaciones

- [ ] Poner **Desde** posterior a **Hasta** y Aplicar → mensaje
      *"La fecha 'desde' es posterior a 'hasta'"*, y **no** se rompe la pantalla
- [ ] Poner un rango de **más de 92 días** → mensaje *"El rango no puede superar
      92 días"*
- [ ] Elegir una fecha **sin ventas** → mensaje **"No hubo ventas en el período
      seleccionado"**, que es distinto de un error de conexión

## Fase 5: Filtro por caja

- [ ] En **Cajas** aparece la lista con formato `#id · DISPOSITIVO · dd/mm`
- [ ] Es **multi-selección**: se pueden marcar varias
- [ ] Elegir **una** caja y Aplicar: el rótulo nombra esa caja y el total baja a
      lo de esa caja
- [ ] Elegir **dos** cajas: el rótulo dice **"2 cajas"** y el total es la suma
- [ ] **Combinar fecha + caja**: el resultado es la intersección (esa caja, en
      ese período), no la unión. Verificarlo contra los totales por separado
- [ ] Deseleccionar todas las cajas dejando sólo la fecha: vuelve al total del
      período completo

## Fase 6: Reportes y dashboards siguen el mismo corte

Esto es lo que evita que la misma venta aparezca en días distintos según la
pantalla.

- [ ] **Reportes → Ventas del cierre de mes**, período *Hoy*: el total coincide
      con el del **Resumen sin filtros** cuando no hay caja abierta
- [ ] Con una venta de madrugada en la base, ponerla a prueba en los dos lados:
  - [ ] Jornada en **7**: la venta de la 01:30 cuenta en el día **anterior**,
        tanto en el dashboard como en el reporte
  - [ ] Jornada en **0**: cuenta en el día calendario, tanto en el dashboard como
        en el reporte
  - [ ] **En ningún caso las dos pantallas discrepan entre sí**
- [ ] **Dashboard de Ventas**, chip *Hoy*: el chart cruza la medianoche — las
      últimas barras son las horas de madrugada, no arranca de cero a las 00:00
- [ ] El total de la card sigue cerrando con la suma de las barras del chart

## Fase 7: Rango personalizado de los reportes

- [ ] **Reportes → Ventas**, período **personalizado**, elegir *desde* y *hasta*
- [ ] Las fechas del reporte son **las que se eligieron**, no un día antes
  - Este era el bug: `new Date('2026-07-15')` se interpretaba como UTC y en
    Paraguay caía el 14 a la noche, así que el rango entero corría un día

## Fase 8: Modo standalone (SQLite)

Sólo si la instalación de prueba corre en SQLite (modo standalone). El bug de
abajo **no se ve en Postgres**.

- [ ] Cargar una venta **ahora** y abrir el **Resumen**: la venta aparece en el
      total del día
  - Antes devolvía **cero** sin ningún error: TypeORM guarda `created_at` como
    `2026-08-24 09:40:12` y el filtro comparaba contra
    `2026-08-24T03:00:00.000Z`; como texto, el espacio ordena antes que la `T`
- [ ] Filtrar por la fecha de hoy explícitamente: también la trae
- [ ] Lo mismo en **Reportes → Ventas** y en el **Dashboard de Compras**

---

## Cobertura automática

Estas partes ya están cubiertas por tests; el checklist manual busca lo que los
tests no ven (rótulos, estados vacíos, que la config se guarde bien):

```
npm run test:kpis-filtros      # jornada, AND fecha+caja, fecha local, selector
npm run test:reportes-periodo  # el ancla compartido con los reportes
npm run test:dashboard-rangos  # invariante unión(buckets) == rango
npm run test:reporte-ventas    # sellado en el formato real de SQLite
```
