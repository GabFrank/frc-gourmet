# Buffet por kilo + Precios programados

Documento de diseño e implementación del módulo de **producto de buffet por
peso** (venta por kilo, "peso libre") y de la funcionalidad transversal de
**precios programados por día y horario**.

> Estado (verificado 2026-06-28): Fases 0–4 **implementadas**; Fase 5 (integración serial de balanza
> + modo receta proporcional) pendiente. Los tests manuales en PC quedan pendientes; ver "Verificación".

---

## 1. Motivación

Muchos locales ofrecen comida servida y cobrada por peso ("comida a quilo" /
self-service). El cliente arma su plato, se pesa, y paga `peso × precio_por_kg`.
Variantes habituales del rubro:

- **Peso libre**: `precio = peso_neto × precio_por_kg`.
- **Buffet libre (tope)**: a partir de cierto valor se cobra un monto fijo. Ej:
  kilo a 75.000 Gs, libre a 55.000 Gs → al superar ~733 g el cliente paga 55.000
  fijo.
- **Cobro mínimo**: para que un plato casi vacío no salga gratis.
- **Precios por horario**: almuerzo, cena, viernes premium, feriados.

### Decisión sobre las balanzas (importante)

Las balanzas "self-service" (Toledo Prix, Filizola, Elgin, UPX) traen una
función de **valor máximo / buffet libre**: si la pesada supera el tope, la
balanza congela el valor y emite la etiqueta como "buffet livre", **perdiendo el
peso real**. Eso destruye las métricas de consumo.

**Por eso el tope, el mínimo y la tara se aplican en FRC Gourmet, NO en la
balanza.** La balanza se configura en modo peso puro (protocolo Toledo `PRT1`,
que envía peso) y FRC Gourmet hace el `clamp`. Así el ticket cobra el tope pero
la BD guarda **siempre el peso neto real** para métricas (peso medio, desperdicio).

---

## 2. Modelo de cobro

```
neto   = bruto - tara
neto   = max(neto, 0)
subtotal = (neto / 1000) * precioPorKg        // neto en gramos, precio por kg
total  = clamp(subtotal, precioMinimo, precioMaximo)
aplicoLibre = (precioMaximo != null && subtotal >= precioMaximo)
```

- Si `neto < pesoMinimoGramos` → se cobra igual el `precioMinimo`
  (decisión del negocio: agilidad de mostrador).
- `pesoNeto` se persiste SIEMPRE con el valor real, aunque el `total` quede
  capado por `precioMaximo`.

La lógica pura vive en `src/app/shared/utils/buffet-peso.util.ts` (testeable sin
Electron; los tests autónomos están en `electron/utils/buffet-peso.util.spec.ts`).

---

## 3. Precios programados (Fase 0 — transversal)

Se modela **directamente en `PrecioVenta`** (no entidad nueva), reutilizando que
ya es multi-moneda + multi-tipo y que los precios nunca se borran (se inactivan).

Columnas nuevas (todas nullable / con default → migración aditiva):

| Campo | Tipo | Uso |
|---|---|---|
| `dias_semana` | varchar null | CSV `1,2,3,4,5` (1=Lun … 7=Dom). null = todos los días |
| `hora_inicio` | varchar(5) null | `"HH:mm"`. Soporta cruce de medianoche (22:00–02:00) |
| `hora_fin` | varchar(5) null | `"HH:mm"` |
| `fecha_inicio` | date null | vigencia desde (feriados/promos puntuales) |
| `fecha_fin` | date null | vigencia hasta |
| `prioridad` | int default 0 | ante solape, gana mayor prioridad |

**Resolución** (`src/app/shared/utils/precio-vigencia.util.ts`, pura y testeable):
dado un conjunto de `PrecioVenta` candidatos y una fecha/hora, devuelve el de
mayor prioridad cuya ventana matchea; si ninguno programado matchea, cae al
precio sin programación (fallback / `principal`). Se resuelve en JS, no en SQL,
para evitar incompatibilidades SQLite/Postgres.

> Aplica a **cualquier** producto, no solo buffet (happy hour, cena premium…).

---

## 4. Producto buffet por peso (Fase 1)

- Nuevo `ProductoTipo.BUFFET_POR_PESO`.
- `Producto`: `unidadBase` = `GRAMO`/`KILOGRAMO`, `controlaStock = true`, y campos
  nuevos `taraGramos`, `pesoMinimoGramos`, `descuentaPorReceta` (gancho híbrido).
- `PrecioVenta`: `valor` = **precio por kg**; nuevos `precio_minimo` y
  `precio_maximo` (tope libre). Como van en `PrecioVenta`, el tope/mínimo también
  son schedule-aware (libre de almuerzo ≠ de cena).
- `VentaItem`: nuevos `peso_bruto`, `peso_tara`, `peso_neto`, `precio_por_kg`,
  `aplico_libre`. `cantidad` pasa a `decimal(10,3)`.

### El tope sin romper el cálculo universal

El total de un ítem es siempre
`(precioVentaUnitario + precioAdicionales - descuentoUnitario) * cantidad`.
Para no tocar esa fórmula usada en todo el sistema, cuando aplica el tope se
guarda el **precio efectivo**: `precioVentaUnitario = precioMaximo / pesoNetoKg`,
`cantidad = pesoNetoKg`. El precio por kg real va aparte en `precio_por_kg` +
`aplico_libre = true`, para reporting.

---

## 5. Stock del buffet (Fase 1 + Fase 3)

Modelo **producción + venta por kg** (estándar del rubro):

- **Producir** (cargar las cubas): `PRODUCCION_ENTRADA` del producto buffet en kg
  + `PRODUCCION_SALIDA` de cada insumo (vía receta). Reutiliza las entidades
  `Produccion` / `ProduccionIngrediente` y sus handlers (ya existen; faltaba UI).
- **Vender**: rama nueva en `procesarStockVenta` → `StockMovimiento(VENTA, -pesoNetoKg)`
  sobre el **propio producto buffet**, sin multiplicar por `presentacion.cantidad`
  (a diferencia de RETAIL).
- **Desperdicio = saldo** (producido − vendido). Métrica gratis.

El flag `Producto.descuentaPorReceta` (default false) deja la puerta abierta al
modo "receta proporcional" (Fase 5): si se activa, la venta descontaría
ingredientes prorrateados en vez del producto buffet.

---

## 6. Captura de peso en el PdV (Fase 1 + Fase 2)

- **Fase 1 — manual**: al agregar un producto `BUFFET_POR_PESO`, el PdV abre
  `ingresar-peso-dialog` (peso bruto, muestra tara, calcula total en vivo, marca
  si entró en "libre"). Editar el ítem reabre este diálogo, no el editor de
  cantidad normal.
- **Fase 2 — etiqueta EAN-13**: la balanza imprime una etiqueta con código de
  barras que codifica el peso. Estructura EAN-13 de balanza:
  - dígito 1 = `2` (prefijo "producto por peso")
  - dígitos 2–7 = código del producto
  - dígitos 8–12 = peso (gramos) o precio (5 dígitos)
  - dígito 13 = verificador
  Config global en `PdvConfig`: si la etiqueta trae **peso** o **precio**, y el
  divisor. El parseo (`src/app/shared/utils/balanza-ean13.util.ts`, puro) extrae el
  peso y prellena el `ingresar-peso-dialog`.
- **Fase 5 (futuro)** — integración serial directa (driver por modelo).

---

## 7. Métricas (Fase 4)

Dashboard con el padrón unificado (`<app-dash-*>`):

- **Peso medio por venta** (gramos/cliente) — KPI estrella.
- **Kg vendidos vs kg producidos → desperdicio**.
- **% de tickets que entraron en "libre"** (señal de tope mal calibrado).
- **CMV del buffet** (costo de producción ÷ ingresos), costo/kg vs precio/kg.
- Consumo por franja horaria (alimenta el ajuste de precios programados).

---

## 8. Fases e implementación

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Precios programados por día/horario en `PrecioVenta` | ✅ Implementada |
| 1 | Tipo buffet + peso en `VentaItem` + pesaje manual + tope/mínimo/tara + stock | ✅ Implementada |
| 2 | Parseo EAN-13 de balanza en el PdV | ✅ Implementada |
| 3 | UI de producción de buffet (reusa entidades) + costeo | ✅ Implementada |
| 4 | Dashboard de métricas del buffet | ✅ Implementada |
| 5 | (Futuro) integración serial + modo receta proporcional | ⏳ Pendiente |

> Las utils puras viven en `src/app/shared/utils/` (`precio-vigencia`,
> `buffet-peso`, `balanza-ean13`, `produccion-buffet`, `buffet-metricas`) para
> ser reutilizadas por Angular y Electron. Sus tests autónomos están en
> `electron/utils/*.util.spec.ts` (se corren con ts-node, fuera de karma).

### Fase 5 — Pendiente (futuro)

- **Integración serial directa de balanza** (Toledo Prix `PRT1` / Filizola /
  Urano): driver por modelo que lee el peso en vivo por serial/USB y lo inyecta
  en el `pesaje-buffet-dialog`. Hoy se cubre con ingreso manual + etiqueta EAN-13.
- **Modo receta proporcional** (`Producto.descuentaPorReceta = true`): que la
  venta descuente ingredientes prorrateados por receta en vez del propio
  producto buffet. El gancho ya existe en `procesarStockVenta`; falta el escalado
  fino por `pesoNeto` relativo al rendimiento de la receta.
- **UI de configuración de balanza** en el diálogo de PdvConfig (hoy los campos
  `balanza_*` usan defaults sensatos: prefijo `2`, modo `PESO`, factor `1`).

Cada fase: cambio de entity → **migración aditiva portable** registrada en
`database.config.ts:getMigrations()` → handler (con `ensurePermission`) →
`preload.ts` → `repository.service.ts` → UI. Recordar: cambios en `electron/`,
`preload.ts`, entities → **requieren reiniciar la app**.

---

## 9. Verificación

- **Autónoma (hecha)**: `npm run build` (Angular + Electron tsc) pasa sin
  errores tras cada fase. Tests de lógica pura (74 en total) en verde:
  - `precio-vigencia.util` — 19
  - `buffet-peso.util` — 20
  - `balanza-ean13.util` — 14
  - `produccion-buffet.util` — 6
  - `buffet-metricas.util` — 15

  Correr todos:
  ```bash
  OPTS='{"module":"commonjs","moduleResolution":"node","target":"es2020","esModuleInterop":true,"ignoreDeprecations":"6.0"}'
  for f in precio-vigencia buffet-peso balanza-ean13 produccion-buffet buffet-metricas; do
    TS_NODE_COMPILER_OPTIONS="$OPTS" npx ts-node --transpile-only --skip-project electron/utils/$f.util.spec.ts
  done
  ```
- **Manual (pendiente, en PC)**: alta de producto buffet, pesaje en PdV, tope
  libre, cobro mínimo, descuento de stock, producción, dashboard, precios
  programados. Verificar en dark y light theme. Las migraciones corren solas al
  abrir la app (con backup previo).

---

## 10. Reglas del proyecto respetadas

- Strings UPPERCASE en BD; sin funciones/getters en templates; colores por tema.
- Migraciones aditivas y portables (branch `isPg`), columnas nullable/con default.
- Fechas con `parseLocalDate`; nulear con `(x as any).campo = null`.
- Acceso a BD desde Angular solo vía `RepositoryService`.
- Number pipe `| number:'1.0-2'`; confirmaciones con `ConfirmationDialogComponent`.
