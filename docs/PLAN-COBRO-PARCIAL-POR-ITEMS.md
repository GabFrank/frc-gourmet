# Plan de implementación — Cobro parcial por ítems (PdV)

> Estado: PROPUESTA / pendiente de implementar. Consensuado 2026-07-11.

## 1. Problema

En el PdV, cuando una mesa viene a pagar y quiere abonar **solo algunos ítems**, hoy:

- El diálogo de cobro soporta cobro parcial, pero **por monto**, no por ítem.
- No se sabe **qué ítems** fueron pagados, cuáles faltan, ni el saldo desglosado.
- Ni la lista de ítems del PdV ni el diálogo de cobro muestran estado de pago por ítem.

**Raíz técnica:** `VentaItem` no tiene ningún concepto de "pagado". El `Pago` es uno por venta y acumula `PagoDetalle` de todas las rondas; el saldo se calcula por montos, sin vínculo a ítems.

## 2. Objetivo y criterios de aceptación

1. Poder cobrar un subconjunto de ítems (o una **fracción** de un ítem) en una ronda.
2. En la **lista de ítems del PdV**: ver por ítem si está PAGADO / PARCIAL / PENDIENTE, y una barra de resumen **Total · Pagado · Saldo**.
3. En el **diálogo de cobro**: ver el estado por ítem y el saldo pendiente, y elegir qué ítems/fracciones se cobran en la ronda actual.
4. El **descuento/aumento global (F9)** sigue funcionando como hoy, incluso con cobros parciales previos, **sin generar créditos retroactivos ni reembolsos**.
5. Poder **anular** un cobro parcial puntual sin cancelar toda la venta.
6. La venta se concluye con **Finalizar explícito** cuando el saldo llega a 0.

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Unidad de cobro | Fraccionable: se puede pagar parte de un ítem (media pizza, N de M unidades). |
| Monto de la ronda | Fijo = suma de lo seleccionado (ajustado por el factor global, ver §5). |
| Descuento global | Se mantiene a nivel venta; se absorbe vía **factor dinámico** (no se prorratea al neto del ítem). |
| Comprobante por ronda | No por ahora (el modelo lo deja preparado para agregarlo). |
| Ingreso de fracción | Por **monto** + por **cantidad** (cuando `cantidad > 1`). |
| Reversión | **Sí**, anular por ronda (entidad `CobroParcial`). |
| Cierre | **Finalizar explícito** al llegar a saldo 0. |

## 4. Principio de diseño: dos capas

Se separan dos verdades que hoy están mezcladas:

1. **Verdad de dinero (manda para Finalizar)** — como hoy:
   `saldoDinero = (deudaBruta − descuentosGlobales + aumentosGlobales) − Σpagos + Σvueltos`.
   El descuento global (F9) no cambia: es un ajuste a nivel venta.

2. **Vista de ítems (para saber quién pagó qué)** — nuevo:
   cada ítem acumula **cobertura en bruto** (`montoCubierto`, sin descuento global).
   Estado del ítem derivado del bruto cubierto vs su neto bruto.

**Clave:** la cobertura del ítem se guarda **en bruto** (precio con `descuentoUnitario` propio, sin el global). Aplicar/cambiar el descuento global nunca toca lo ya cubierto → no hay crédito retroactivo.

## 5. Cálculos

**Neto bruto de un ítem** (sin descuento global):
```
netoBrutoItem = (precioVentaUnitario + precioAdicionales − descuentoUnitario) × cantidad
```

**Totales de la venta** (sobre ítems ACTIVOS):
```
deudaBruta      = Σ netoBrutoItem
saldoDinero     = (deudaBruta − descuentosGlobales + aumentosGlobales) − Σpagos + Σvueltos
pendienteBruto  = Σ (netoBrutoItem − montoCubierto)
```

**Factor dinámico** (conecta plata ↔ ítems en cada ronda):
```
factor       = saldoDinero / pendienteBruto      // 1 si no hay ajuste global
cashACobrar  = brutoSeleccionado × factor
```

**Estado del ítem:**
```
PENDIENTE  si montoCubierto ≈ 0
PARCIAL    si 0 < montoCubierto < netoBrutoItem
PAGADO     si montoCubierto ≥ netoBrutoItem − tolerancia
```

**Invariante (verificado):** cuando se cubre el bruto del **último** ítem, `saldoDinero` da 0 exacto, sin importar cuándo se aplicó el descuento global. La última ronda siempre paga `cashACobrar = pendienteBruto × (saldoDinero/pendienteBruto) = saldoDinero`. El descuento lo absorbe quien paga después de aplicarlo (comportamiento natural del salón).

**Ejemplo:** mesa 20k (A 10k, B 10k). Pagan A → 10k, A PAGADO. Se aplica 20% global (meta 16k). Queda B bruto 10k, saldoDinero 6k → factor 0,6 → B se cobra 6k. Total 16k. A no se toca, B absorbe el descuento.

**Guarda:** F9 se permite solo mientras `saldoDinero > 0` (descontar cuando no se debe nada no aplica).

**Tolerancia de redondeo:** reutilizar la lógica actual (`toleranciaRedondeoPrincipal`), imprescindible con el factor y monedas con decimales.

## 6. Modelo de datos

### Entidades nuevas (`src/app/database/entities/ventas/`)

**`CobroParcial`** (ronda de cobro):
```
venta_id            FK Venta (CASCADE)
usuario_id          FK Usuario (quién cobró)
fecha               datetime
factor_aplicado     decimal(10,6)   // factor usado en la ronda (auditoría)
cash_total          decimal(10,2)   // plata cobrada en la ronda (moneda principal)
activo              boolean default true   // false = anulada
```

**`CobroParcialItem`** (imputación en bruto):
```
cobro_parcial_id    FK CobroParcial (CASCADE)
venta_item_id       FK VentaItem
bruto_cubierto      decimal(10,2)   // porción de netoBrutoItem cubierta en esta ronda
cantidad            decimal(10,3) nullable   // si se cobró por cantidad
```

### Cambios en entidades existentes

- **`VentaItem`**: `monto_cubierto` decimal(10,2) default 0 (cache = Σ `CobroParcialItem.bruto_cubierto` de rondas activas).
- **`PagoDetalle`**: `cobro_parcial_id` (FK nullable) — qué plata entró en qué ronda.

> `estado` de pago del ítem NO se persiste: se deriva de `monto_cubierto` vs `netoBrutoItem`.

### Migración

- Un archivo en `src/app/database/migrations/` (timestamp real `date +%s%3N`), driver-aware (SQLite/Postgres), aditivo, `IF NOT EXISTS`.
- Registrar entidades en `database.config.ts` (`getEntitiesList`) y la migración en `getMigrations`.
- **Backfill:** ventas ya CONCLUIDAS no necesitan datos (montoCubierto default 0 es correcto para históricos; el estado por ítem solo aplica a ventas abiertas de acá en más).

## 7. Backend (handlers)

En `electron/handlers/ventas.handler.ts` (o sección nueva `cobro-parcial`):

- **`registrarCobroParcial(ventaId, payload)`** — transaccional (`queryRunner`):
  1. Recalcula `saldoDinero` y `pendienteBruto` del server (no confiar en el front).
  2. Calcula `factor`.
  3. Crea `CobroParcial` (factor, cashTotal).
  4. Crea `CobroParcialItem[]` (bruto por ítem; valida que `brutoCubierto ≤ netoBrutoItem − montoCubierto` de cada ítem → **evita doble cobro** del mismo ítem, incluso desde 2 dispositivos).
  5. Crea/actualiza el `Pago` (ABIERTO) + `PagoDetalle[]` de la ronda, tagueados con `cobro_parcial_id`.
  6. Actualiza `VentaItem.montoCubierto` (cache).
  7. Devuelve estado recalculado (saldo, estados por ítem).
- **`anularCobroParcial(cobroParcialId)`** — transaccional: marca ronda `activo=false`, desactiva sus `PagoDetalle`, recomputa `montoCubierto` de los ítems afectados.
- **`getEstadoCobroVenta(ventaId)`** — helper de lectura: devuelve por ítem `{ netoBruto, montoCubierto, estado }` + totales (`deudaBruta`, `pagado`, `saldoDinero`). Usado por el PdV y el diálogo.
- **Finalizar** sigue por `updateVenta(CONCLUIDA)` (sin cambios), habilitado cuando `saldoDinero ≈ 0`.

**Permisos:** `ensurePermission(..., 'VENTAS_PDV')` en `registrarCobroParcial`/`anularCobroParcial` (hoy el chequeo es selectivo; estos son sensibles → agregarlos).

**Concurrencia:** la validación del paso 4 dentro de la transacción es la barrera anti-doble-cobro. El gate por dispositivo (`validarDispositivoCaja`) se mantiene.

## 8. IPC wiring (4 capas)

Por cada handler nuevo: registrar en `ipcMain.handle`, exponer en `preload.ts`, y agregar a `repository.service.ts` (abstract) + `repository-ipc.service.ts` + `repository-http.service.ts`. Reinicio de app requerido (cambios de backend/preload).

## 9. Frontend — diálogo de cobro

`src/app/shared/components/cobrar-venta-dialog/`:

- **Panel de ítems** (nuevo): por ítem → nombre, neto bruto, cubierto, **saldo del ítem**, chip de estado, e input de fracción:
  - por **monto** (default = saldo del ítem, se puede bajar),
  - por **cantidad** cuando `cantidad > 1`.
- **Cabecera:** Total · Descuento global · Pagado · **Saldo** · **A cobrar ahora = brutoSeleccionado × factor**.
- Al confirmar la ronda → `registrarCobroParcial(...)` con las imputaciones + las líneas de pago actuales.
- **Finalizar (F10/F11):** habilitado con `saldoDinero ≈ 0`.
- **F9 (ajuste global):** sin cambios de mecánica; deshabilitado si `saldoDinero ≤ 0`.
- Compatibilidad: si se seleccionan todos los ítems pendientes (default), el flujo es el cobro total de siempre.

## 10. Frontend — lista de ítems del PdV

`src/app/pages/ventas/pdv/`:

- Chip de estado por ítem: **PAGADO** (verde) / **PARCIAL x/y** (amarillo) / **PENDIENTE** (normal).
- Barra de resumen sobre los botones de acción: **Total · Pagado · Saldo** (colores de estado, sin morado/gris).
- Cargar el estado con `getEstadoCobroVenta` al seleccionar mesa/comanda y en el refresh (el polling de 1s ya existe; agregar el estado de cobro sin pisar selección).

## 11. Reglas de negocio y bordes

- **Editar / cancelar / mover** un ítem con `montoCubierto > 0`: bloqueado; primero anular la ronda que lo cubrió.
- **Agregar ítems** después de un cobro parcial: quedan PENDIENTES, aumentan el saldo (permitido).
- **Cancelar venta** con ítems cubiertos: requiere anular las rondas antes (o confirmación explícita que las anule).
- **Vuelto:** si la ronda paga de más, se registra `VUELTO` como hoy; no afecta la cobertura en bruto.
- **Stock:** `procesarStockVenta` sigue disparándose al CONCLUIR (sin cambios); el cobro parcial no descuenta stock.
- **Ticket:** el ticket final se imprime al Finalizar (F11), como hoy. Ticket por ronda queda fuera de alcance.
- **Multi-moneda:** el factor opera en moneda principal; las líneas de pago siguen siendo multi-moneda con la conversión actual.

## 12. Fases de implementación

1. **Datos:** entidades `CobroParcial` / `CobroParcialItem`, `VentaItem.montoCubierto`, `PagoDetalle.cobro_parcial_id`; migración driver-aware; registro en `database.config.ts`.
2. **Backend:** `registrarCobroParcial`, `anularCobroParcial`, `getEstadoCobroVenta`; cálculo de saldo/factor server-side; permisos; IPC + repository (3 impls) + preload.
3. **Diálogo de cobro:** panel de ítems + factor + integración con líneas de pago; guardas de F9 y Finalizar.
4. **Lista del PdV:** chips de estado + barra de resumen; carga en selección y refresh.
5. **Reglas:** bloqueo de edición/cancelación/movimiento sobre ítems cubiertos; anulación de ronda desde UI.

## 13. Checklist de testing

- Cobro total (todos los ítems) → igual que hoy.
- Cobro parcial de 1 ítem entero → ítem PAGADO, resto PENDIENTE, saldo correcto.
- Fracción de un ítem por monto y por cantidad → PARCIAL x/y.
- Descuento global aplicado **antes** de cobrar → factor uniforme, cuadra.
- Descuento global aplicado **después** de un cobro parcial → sin crédito retroactivo; lo absorbe el resto; último ítem cierra en 0.
- Aumento global (factor > 1).
- Anular una ronda → cobertura y saldo se recomputan.
- Doble cobro concurrente del mismo ítem (2 dispositivos) → la transacción rechaza el segundo.
- Finalizar habilitado solo con saldo 0; ticket final impreso.
- Editar/cancelar/mover ítem cubierto → bloqueado.
- Multi-moneda + tolerancia de redondeo en la última ronda.

## 14. Riesgos / abiertos

- **Descuento global cambiado entre rondas:** cubierto por el factor dinámico (se recalcula por ronda). Documentar que el beneficio recae en quienes pagan después.
- **Comprobante por ronda:** fuera de alcance; el modelo (`CobroParcial`) lo habilita como extensión futura (tag `cobro_parcial_id` en `PagoDetalle` ya lo permite).
- **División de cuenta informativa actual:** este trabajo la reemplaza de facto; evaluar quitar/reusar el `DividirCuentaDialog` existente.
