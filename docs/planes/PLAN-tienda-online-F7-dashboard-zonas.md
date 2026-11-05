# PLAN — Tienda online F7: dashboard de Zonas de Delivery

Rama: `bot/ceo-frc-gourmet/feat-tienda-online-f7`, encima de F6b (cadena de la tienda). Pedido del
propietario (05/11): convertir «Zonas de Delivery» —hoy una tabla suelta— en un dashboard con mini
mapa de las zonas y KPIs de delivery por zona, contando **los dos tipos de delivery** (los de la
tienda y los que el cajero carga por teléfono en el PdV).

## 1. Lo que hay hoy (verificado en el código)

- `zonas-delivery.component.ts`: ABM en una tabla (nombre, envío, mínimo, cobertura, estado) +
  diálogo `mapa-zonas-dialog` para dibujar el polígono de UNA zona. El mapa con todas las zonas sólo
  se ve dentro de ese diálogo, de fondo.
- Handlers `get-zonas-delivery-admin` / `guardar-zona-delivery` / `eliminar-zona-delivery`
  (`pedidos-online-admin.handler.ts`), con `PEDIDOS_ONLINE_CONFIGURAR`. La entrada del menú pide
  `VENTAS_PDV` (desfase preexistente: un usuario con `VENTAS_PDV` y sin CONFIGURAR ve la pantalla
  vacía).
- **Dos tablas de zona, unidas por un vínculo opcional:**
  - `precios_delivery` (PdV): tarifas por distancia (en Don Franco: CORTA, MEDIA, MEDIA LARGA,
    LARGA, MUY LARGA DISTANCIA). El delivery del PdV guarda `deliveries.precio_delivery_id`.
  - `zonas_delivery` (tienda): polígono + `precio_delivery_id` («la tarifa compartida entre los dos
    canales», commit d896e046). Al materializar un pedido web, el delivery hereda ese
    `precio_delivery_id`.
  - ⚠️ **La pantalla no permite elegir la tarifa del PdV de una zona.** El handler la acepta
    (`precioDeliveryId`) pero el formulario no la muestra. En la copia del espejo: 1 zona, sin
    vínculo.
- Motor de métricas `reportes-delivery.helper.ts`: facturación desde `pagos_detalles` (PAGO − VUELTO,
  convertido a moneda principal), envío desde `ventas.costo_delivery`, ventana `ventas.created_at`,
  sólo ventas CONCLUIDAS, `Number()` sobre todo decimal. Ya agrupa por tarifa del PdV
  (`enviosPorZona`) y por puerta de entrada (`v.canal_origen`: LOCAL / WEB). **Se reutiliza, no se
  duplica** (regla del archivo: dos pantallas que cuentan lo mismo de dos maneras terminan dando
  números distintos).
- Jornada comercial: `rangoToFechas(rango, now, inicioJornada)` de `dashboard-rangos.util`.
- Backlog: «Mapa de zonas con polígonos» se descartó *en Reportes* (canvas que no se exporta a PDF).
  Acá el mapa va en la pantalla de zonas, no en un reporte exportable: no choca.

## 2. Qué se construye

### Pantalla (reemplaza la tabla, misma entrada de menú y `tabId`)

```
Zonas de Delivery         [Hoy][7 días][30 días]  [Aplicar]   [+ Nueva zona]
KPIs: Zonas activas · Pedidos delivery (tienda | teléfono) · Envíos cobrados ·
      Ticket promedio · Alertas (sin dibujar / sin tarifa del PdV)
┌ Mapa: todas las zonas (color por zona) ┐ ┌ Tabla por zona ───────────────────────┐
│ + puntos de los pedidos de la tienda   │ │ ● Zona  Tarifa PdV  Envío  Tienda  Tel │
│ clic en zona → resalta su fila         │ │   Total  %  Cobertura  Estado  [⋮]     │
└────────────────────────────────────────┘ └───────────────────────────────────────┘
```

- Período con botón **Aplicar** (regla: no filtrar en vivo). Respeta la jornada comercial.
- Clic en una zona del mapa ↔ resalta su fila, y al revés.
- Las acciones de cada zona (dibujar, editar, eliminar) siguen en el `mat-menu` de la fila.
- El formulario de la zona suma **«Tarifa del PdV»** (select de `precios_delivery` activos), con la
  explicación: «es la que usa el cajero al cargar un delivery de esta zona por teléfono».
- Colores de zona: paleta categórica tomada de variables del tema (no hex en el componente); el
  mismo color en el mapa y en el punto de la fila.
- Mapa: Leaflet + OpenStreetMap (como el diálogo, tras el fix de CARTO), `fitBounds` a las zonas
  dibujadas; sin zonas dibujadas, centro del local.

### Atribución de cada delivery a una zona (el punto delicado)

| Delivery | Cómo se sabe la zona |
|---|---|
| Tienda (`v.canal_origen = 'WEB'`) | `pedidos_online.zona_delivery_id` del pedido de esa venta: la zona exacta en la que cayó el pin. |
| Teléfono (`'LOCAL'`) | `deliveries.precio_delivery_id` → la zona que tiene **esa** tarifa vinculada. |

- Si **varias zonas comparten la misma tarifa**, un delivery por teléfono con esa tarifa no se puede
  asignar a una sola zona. **Decisión del propietario (ver §6):** propuesta = mostrarlo en una fila
  aparte «Teléfono · tarifa X (varias zonas)» en vez de repartirlo o adivinarlo.
- Tarifa sin zona vinculada → fila «Teléfono · tarifa X (sin zona)». Delivery sin tarifa → «Sin
  zona». Así **la suma de las filas da el total del KPI** (invariante que se testea).
- Retiros (`modo = RETIRO`) no cuentan: no tienen zona (mismo criterio que `enviosPorZona`).

### Backend

- **`get-dashboard-zonas-delivery`** (`pedidos-online-admin.handler.ts`), `ensurePermission`
  primera sentencia, mismo permiso que el listado (`PEDIDOS_ONLINE_CONFIGURAR`). Entrada:
  `{ rango: 'today' | 'week' | 'month' }`. Salida:
  - `zonas`: las de `get-zonas-delivery-admin` + `precioDeliveryId/nombre`.
  - `filas`: por zona (y las filas especiales de arriba) → `{ tienda: {pedidos, facturacion},
    telefono: {pedidos, facturacion}, envioRecaudado, pct }`.
  - `kpis`: zonas activas, sin dibujar, sin tarifa; pedidos tienda/teléfono; envío recaudado; ticket
    promedio. Los totales salen del MISMO agrupado que las filas (no de otra consulta).
  - `puntos`: `{lat, lng, zonaId}` de los pedidos web DELIVERY del período con coordenadas, no
    rechazados ni cancelados, **tope 1000**. Sin nombre, teléfono, dirección ni monto: el mapa no
    necesita datos personales.
- En `reportes-delivery.helper.ts`: exportar una función nueva que use `agrupar` / `envioRecaudado`
  con la clave «canal + zona» (`LEFT JOIN pedidos_online po ON po.venta_id = v.id` para la web;
  `dcanal.precio_delivery_id` para teléfono). Concatenación con `CAST(... AS VARCHAR)` para que sea
  igual en SQLite y Postgres. El `LEFT JOIN` a `pedidos_online` no multiplica filas: un pedido por
  venta (en mesa sí hay varios, pero la mesa no tiene delivery y queda fuera por `SOLO_ENVIOS`).
  ⚠️ Esto se verifica en el test con una venta de mesa con 2 pedidos.
- Sin entidades ni migraciones nuevas.
- Permisos: alinear la entrada del menú con el handler (`PEDIDOS_ONLINE_CONFIGURAR`), si el
  propietario está de acuerdo (§6).

## 3. Fases

1. **Backend + test** — función del helper, handler, `test:dashboard-zonas-delivery`.
2. **Pantalla** — dashboard (KPIs, mapa, tabla, período), selector de tarifa en el formulario,
   precálculo de todo lo que muestra el template.
3. **Cierre** — auditoría por agentes, `test:all`, `npm run check`, manual de pruebas, docs.

Commit + push al cerrar cada fase. Sin PR (la cadena de la tienda sigue sin PRs nuevos hasta que el
propietario lo pida).

## 4. Tests

`scripts/test-dashboard-zonas-delivery-e2e.ts` (SQLite) y la misma suite contra **Postgres local**
(base temporal creada y borrada por el test, como `test:locks-pg`) — el helper usa SQL crudo sobre
`decimal` y fechas.

Fixture con trampas a propósito:
- 3 zonas: A (tarifa T1), B (tarifa T2), C (tarifa T2 → compartida), D sin tarifa, E sin dibujar.
- Ventas web en A y B (con pago mixto en 2 monedas), por teléfono con T1, T2 y sin tarifa.
- Una venta web con **2 ítems y 2 pagos** (detecta multiplicación por join).
- Una venta de mesa con 2 pedidos online (no debe aparecer).
- Un retiro (no cuenta), una venta ABIERTA y una CANCELADA (no cuentan), una venta fuera del período
  y otra a la 01:30 con jornada desde las 07:00 (cuenta en la jornada de ayer).

Asserts:
- Pedidos y facturación por zona exactos; T1 por teléfono cae en A; T2 por teléfono va a la fila
  «varias zonas»; sin tarifa → «Sin zona».
- **Σ filas = KPI** de pedidos, facturación y envío.
- La facturación coincide con `kpisDelivery` sobre el mismo filtro (el dashboard y Reportes no
  pueden discrepar).
- Puntos: sólo web DELIVERY con coordenadas, sin campos personales, tope respetado.
- Sin `PEDIDOS_ONLINE_CONFIGURAR` → rechazado.
- Cada assert de regresión se valida rompiendo el código a propósito (paso 7 del ciclo).

UI: verificación en Chrome sobre la copia del espejo (tema oscuro y claro), y guía en
`docs/testing/`.

## 5. Riesgos

- **Atribución por tarifa compartida** (§2): si el propietario prefiere repartir o asignar, cambia la
  lógica de las filas, no el resto.
- **Tienda con zonas sin tarifa vinculada** (el caso de hoy): los deliverys por teléfono quedan todos
  en filas «sin zona». La pantalla lo marca como alerta y explica cómo vincular.
- **Volumen de puntos**: tope 1000 y sólo coordenadas; con más, se avisa «mostrando los últimos
  1000».
- **Leaflet en Electron empaquetado**: ya se usa en el diálogo, no suma dependencias.
- OSM tiene una política de uso justo: con el tráfico de un local alcanza; si algún día no, la URL de
  los mosaicos queda en una constante para cambiar de proveedor.

## 6. Decisiones del propietario

1. Deliverys por teléfono con una tarifa que comparten varias zonas: ¿fila aparte «varias zonas»
   (propuesta), o repartir en partes iguales, o exigir una tarifa por zona?
2. ¿Alinear el permiso del menú (`VENTAS_PDV`) con el de la pantalla (`PEDIDOS_ONLINE_CONFIGURAR`)?

## 7. Auditoría del plan (2 agentes, 05/11) — hallazgos incorporados

Cambian el diseño de §2 donde lo contradicen; §2 se deja como estaba para que quede el registro.

**Técnica (correctitud y riesgo)**
- ALTA · `agrupar` deduplica sólo los tickets (`COUNT(DISTINCT v.id)`); la plata y `envioRecaudado`
  suman filas. Un `LEFT JOIN pedidos_online` crudo duplica montos si dos pedidos comparten
  `venta_id` (no hay índice único; MESA_QR lo hace). → Se une una **subconsulta deduplicada**
  `(SELECT venta_id, MIN(zona_delivery_id) zid FROM pedidos_online WHERE venta_id IS NOT NULL GROUP BY venta_id)`.
- ALTA · Unir `zonas_delivery` por tarifa duplica filas cuando la tarifa es compartida. → El SQL
  agrupa por **canal + zona del pedido + tarifa del delivery** (tres columnas, sin concatenar) y la
  asignación a zona se hace **en JS** con la lista de zonas.
- MEDIA · Un pedido web convertido RETIRO→DELIVERY queda con zona null y tarifa en el delivery. →
  Web: zona del pedido; si es null, la zona que resuelve la tarifa del delivery (misma regla que
  teléfono). Testeado.
- MEDIA · Zona eliminada (FK sin constraint) → fila «Zona eliminada», no desaparece. Testeado.
- MEDIA · Puntos vs tabla: la tabla cuenta ventas CONCLUIDAS. → Decisión del propietario (§8).
- MEDIA · Coordenadas = dato personal: se redondean a 3 decimales (~110 m), sin ids ni hora.
- Tests: venta DELIVERY con 2 pedidos con el mismo `venta_id`; tarifa compartida con ventas por
  teléfono; convertida RETIRO→DELIVERY; zona eliminada; pago mixto con cotización ≠ 1; 01:30 con
  jornada 07:00; los mismos casos en Postgres con decimales como string; usuario con `VENTAS_PDV`
  sin CONFIGURAR. Comparación con `kpisDelivery` en pedidos, facturación **y** envío.

**Alcance y convenciones**
- ALTA · Contradice el backlog (`todos-pendientes.md` «Mapa de zonas con polígonos»: descartado en
  Reportes; «si se retoma, va junto con exigir polígono a las zonas del PdV»). → Se retoma **en la
  pantalla de zonas, no en Reportes**; las tarifas del PdV siguen sin polígono; el mapa muestra sólo
  las zonas y pedidos de la tienda, y se dice en pantalla. Ítem del backlog reescrito al cierre.
- ALTA · No hay paleta categórica en variables del tema (sólo hex en `dashboard-chart-theme.ts`).
  → Decisión del propietario (§8).
- MEDIA · Permiso del menú: la regla de MENU_TREE exige que coincida con el handler; con el handler
  nuevo el desfase pasa a ser el estado por defecto. → Decisión del propietario (§8).
- MEDIA · `getPreciosDelivery` (lista de tarifas para el select) no pide permiso: lectura, se deja;
  ítem «UI Precios de Delivery» del backlog está obsoleto (ya existe la pantalla) → se limpia.
- Docs del cierre: `reference/handlers-index.md`, `reference/menu-sidenav-tree.md`,
  `domains/pedidos-online.md`, manual en `docs/testing/`, `package.json`, backlog; el plan se borra
  en el PR final.
- Precálculo en el .ts de todo lo que muestra el template (color, %, resaltado); `number:'1.0-2'`;
  OSM con atribución visible y aviso si no cargan los mosaicos (local sin internet).

## 8. Preguntas al propietario (después de la auditoría)
1. Tarifa compartida por varias zonas (teléfono).
2. Permiso de la entrada del menú.
3. Qué pedidos son puntos del mapa.
4. De dónde salen los colores de zona.

## 9. Decisiones del propietario (05/11, respondidas tras la auditoría)
1. **Tarifa compartida → se exige una tarifa del PdV por zona.** `guardar-zona-delivery` rechaza
   (`tarifa_en_uso`) vincular una tarifa que ya tiene otra zona. Una zona puede quedar sin tarifa
   (alerta en el dashboard: sus deliverys por teléfono no se pueden contar). Si la base ya trae dos
   zonas con la misma tarifa (dato previo a la regla), el dashboard no adivina: esas ventas van a
   «Tarifa X (varias zonas)» y se marca como alerta, para que Σ filas = KPI siga valiendo.
2. **Permiso → lectura con `VENTAS_PDV`.** El handler del dashboard pide `VENTAS_PDV` (igual que la
   entrada del menú, que no cambia); crear, editar, dibujar y eliminar siguen con
   `PEDIDOS_ONLINE_CONFIGURAR` y la pantalla oculta esas acciones a quien no lo tiene.
3. **Puntos del mapa → sólo pedidos cobrados** (venta CONCLUIDA): el mismo conjunto que la tabla.
4. **Colores → variables nuevas del tema** `--zona-1…8`, claro y oscuro; con más de 8 zonas se ciclan.
