# TODO — Diálogos, validaciones y formato numérico

Relevamiento del 2026-07 sobre cuatro ejes de UX/consistencia. Marca `[x]` lo ya
hecho. Los ítems sin marcar quedan pendientes (barridas grandes) para hacer por lotes.

---

## 1. Edición de movimientos de Caja Mayor

Componentes: `caja-mayor-detalle.component.ts` (dispara el editar) →
`edit-movimiento-dialog.component.ts`. Backend: `caja-mayor.handler.ts`.

- [x] **Prefill de moneda/forma de pago (bug).** El detalle consolidado no traía
  `monedaId`/`formaPagoId` (`findFormaPagoByNombre` devolvía `null` siempre y
  `findMonedaBySimbolo` objetos sin `id`), así que el diálogo abría sin
  preseleccionar. Fix: `consolidarCaja` ahora incluye `monedaId`/`formaPagoId` en
  cada detalle y el componente los pasa directo.
- [ ] **Egreso de caja inicial = multi-moneda.** Un `EGRESO_CAJA_INICIAL` es en
  realidad **N movimientos** (uno por moneda) agrupados por `conteo_id` en
  `consolidarCaja`. El diálogo de edición es **mono-moneda** y solo edita
  `detalles[0]`/`movimientoIds[0]`. **Decisión de diseño pendiente** (ver opciones
  en el chat): (a) diálogo multi-moneda (un bloque por moneda), (b) bloquear la
  edición directa y redirigir a "re-hacer el egreso inicial", (c) editor dedicado.

---

## 2. Unificar diálogos con fuente "Caja Mayor (efectivo) / Cuenta Bancaria (transferencia)"

Regla ya documentada en `known-bugs.md:144`: **fuente Caja Mayor ⇒ EFECTIVO**
(filtrar formas de pago a las que contienen "EFECTIVO"); **cuenta bancaria ⇒ no
se pide forma de pago** (siempre transferencia). Convención nueva a agregar:
**fuente ANTES de monto/moneda**, y usar `cuentaBancaria: { id }` anidado en el submit.

12 formularios afectados:

- [ ] **Quitar el `mat-select` manual de forma de pago** (redundante con la fuente):
  - [ ] `rrhh/vales/create-edit-vale-dialog.component.ts` (modo Caja Mayor)
  - [ ] `rrhh/vales/confirmar-vale-dialog.component.ts`
  - [ ] `financiero/caja-mayor/entradas-varias/create-edit-entrada-varia-dialog`
  - [ ] `financiero/caja-mayor/gastos/create-edit-gasto-dialog` (no pedir FP cuando fuente = CUENTA_BANCARIA)
  - [ ] `financiero/caja-mayor/pagar-compras-dialog`
  - [ ] `financiero/caja-mayor/cuentas-por-pagar/pagar-cuota-dialog`
  - [ ] `financiero/caja-mayor/cuentas-por-cobrar/cobrar-cuota-dialog`
  - [ ] `financiero/caja-mayor/registrar-ingreso-dialog`
  - [ ] `financiero/caja-mayor/registrar-egreso-dialog`
- [ ] **Filtrar formas de pago a EFECTIVO (hoy usan la lista completa, violan la regla)**:
  - [ ] `rrhh/prestamos-funcionarios/crear-prestamo-funcionario-dialog.component.ts:90`
  - [ ] `rrhh/liquidaciones-sueldo/pagar-dialog/pagar-liquidacion-dialog.component.ts:67`
  - [ ] `personas/convenios/cobro-consolidado/cobro-consolidado.component.html:57`
- [ ] **Reordenar fuente ANTES de monto/moneda**:
  - [ ] `create-edit-vale-dialog` (modo Caja Mayor)
  - [ ] `cobrar-cuota-dialog`
  - [ ] `crear-prestamo-funcionario-dialog`
- [ ] **Normalizar nombre de control** `destinoTipo` → `fuente` en `create-edit-entrada-varia`.

> Nota: el diálogo de alta de Vale (lista) y el de Caja Mayor son **el mismo
> componente** (`CreateEditValeDialogComponent`) con flag `modoConfirmar`. El modo
> Caja Mayor es el completo (ofrece cuenta bancaria); el modo lista solo pide
> caja/forma de pago opcional. Al unificar, considerar exponer también la opción
> de cuenta bancaria en el modo lista si se quiere paridad.

---

## 3. Avisos de validación en diálogos con inputs obligatorios

Estado actual: no hay patrón único ni helper reutilizable. Lo único universal es
`[disabled]="form.invalid"` (el usuario ve el botón gris sin saber qué falta).
`<mat-error>` y `markAllAsTouched()` se usan de forma dispar.

- [ ] **Crear un helper/convención compartida** (ej. util `markAllAsTouched` + scroll
  al primer error, o componente `<app-form-errors>`), y documentarlo en
  `conventions/ui-patterns.md`.
- [ ] **Prioridad 1 — required sin ningún feedback (retorno silencioso)**:
  - [ ] `rrhh/vales/create-edit-vale-dialog` (sin `mat-error`, submit sin `markAllAsTouched`)
  - [ ] `financiero/caja-mayor/registrar-egreso-dialog`
  - [ ] `financiero/caja-mayor/registrar-ingreso-dialog`
  - [ ] `financiero/caja-mayor/bancos/create-edit-cuenta-bancaria`
- [ ] **Prioridad 2 — falta `mat-error` por campo**:
  - [ ] `personas/clientes/create-edit-cliente-dialog`
  - [ ] `shared/components/cobrar-venta-dialog/cobrar-credito-dialog`
  - [ ] `financiero/caja-mayor/operaciones-financieras/create-operacion-financiera` (completar campos)
- Referencias a replicar (ya bien hechos): `gasto-caja-dialog`, `create-edit-entrada-varia`,
  `emitir-cheque`, `prompt-dialog`.

---

## 4. Formato numérico (separador de miles `.`, decimal `,`)

Locale global = `es-PY` → el pipe `| number` (297 usos) es **consistente**. Los
inputs con la directiva `appCurrencyInput` (46 usos) también. Problemas puntuales:

- [x] **`defaultConfig` de ngx-currency estaba al revés** (US: `decimal:'.'`,
  `thousands:','`). Corregido a `decimal:','`/`thousands:'.'` en
  `currency-config.service.ts` (las monedas conocidas ya tenían su override).
- [x] **`toLocaleString()` sin locale** en `list-cajas.component.ts` (diferencia) y
  `lista-billetes-dialog.component.ts` → ahora `'es-PY'`.
- [ ] **Revisar fallbacks de `formatCurrencyByMoneda`/`formatValue`** en
  `currency-config.service.ts` (sin moneda usa `en-US`/`toFixed`, inconsistente).
- [ ] **Migrar inputs `type="number"` de monto/precio/cotización a máscara**
  (`appCurrencyInput`). Prioridad montos:
  - [ ] `gasto-caja-dialog` (monto), `egreso-caja-inicial-dialog` (monto)
  - [ ] `facturar-dialog` (precioUnitario, descuento), `edit-venta-item-dialog` (descuentoUnitario)
  - [ ] `list-cargos` (salarioReferencia), `create-edit-regla-dialog` (meta)
  - [ ] `create-caja-dialog` (conteo de billetes, varios)
  - [ ] cotizaciones: `create-operacion-financiera`, `create-edit-gasto`, `cobrar-cuota-dialog`
  - [ ] cantidades con decimales (pdv, compras, recetas, producción) — menor prioridad
- [ ] **Parseo frágil**: `producto-inference.util.ts:147` (`replace(',', '.')` no
  descarta separador de miles).
- [ ] **Decisión**: unificar en la directiva `appCurrencyInput` y deprecar el
  componente `<app-currency-input>`/ngx-currency (o arreglar su default).
