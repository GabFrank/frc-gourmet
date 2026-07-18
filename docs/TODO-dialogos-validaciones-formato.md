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
- [x] **Egreso de caja inicial = multi-moneda.** El diálogo de edición ahora edita
  TODAS las monedas del grupo (FormArray, un bloque por moneda, cada una con su
  `movimientoId`); la validación de saldo negativo agrega los deltas de todas las
  filas. Retrocompatible con movimientos de una sola moneda.

---

## 2. Unificar diálogos con fuente "Caja Mayor (efectivo) / Cuenta Bancaria (transferencia)"

Regla ya documentada en `known-bugs.md:144`: **fuente Caja Mayor ⇒ EFECTIVO**
(filtrar formas de pago a las que contienen "EFECTIVO"); **cuenta bancaria ⇒ no
se pide forma de pago** (siempre transferencia). Convención nueva a agregar:
**fuente ANTES de monto/moneda**, y usar `cuentaBancaria: { id }` anidado en el submit.

12 formularios afectados:

- [x] **Quitar el `mat-select` manual de forma de pago** (redundante con la fuente):
  - [x] `rrhh/vales/create-edit-vale-dialog.component.ts` (modo Caja Mayor)
  - [x] `rrhh/vales/confirmar-vale-dialog.component.ts`
  - [x] `financiero/caja-mayor/entradas-varias/create-edit-entrada-varia-dialog`
  - [ ] `financiero/caja-mayor/gastos/create-edit-gasto-dialog` — **DIFERIDO**: usa una tabla de detalles de pago (multi-línea) compartida entre CAJA_MAYOR y CUENTA_BANCARIA; su FP ya está filtrada a EFECTIVO (no viola la regla). Ocultar la FP solo para banco requiere restructurar los detalles — bajo riesgo/valor, no urgente.
  - [x] `financiero/caja-mayor/pagar-compras-dialog`
  - [x] `financiero/caja-mayor/cuentas-por-pagar/pagar-cuota-dialog`
  - [x] `financiero/caja-mayor/cuentas-por-cobrar/cobrar-cuota-dialog`
  - [x] `financiero/caja-mayor/registrar-ingreso-dialog`
  - [x] `financiero/caja-mayor/registrar-egreso-dialog`
- [x] **Filtrar formas de pago a EFECTIVO (hoy usan la lista completa, violan la regla)** — resuelto quitando el select y auto-seteando EFECTIVO:
  - [x] `rrhh/prestamos-funcionarios/crear-prestamo-funcionario-dialog.component.ts`
  - [x] `rrhh/liquidaciones-sueldo/pagar-dialog/pagar-liquidacion-dialog.component.ts`
  - [x] `personas/convenios/cobro-consolidado/cobro-consolidado.component.html`
- [x] **Reordenar fuente ANTES de monto/moneda**:
  - [x] `create-edit-vale-dialog` (modo Caja Mayor)
  - [x] `cobrar-cuota-dialog`
  - [x] `crear-prestamo-funcionario-dialog`
- [ ] **Normalizar nombre de control** `destinoTipo` → `fuente` en `create-edit-entrada-varia` — decidido **NO** renombrar por ahora (evita tocar el payload/backend); el patrón se aplicó igual usando `destinoTipo`.

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
  - [x] `rrhh/vales/create-edit-vale-dialog` (mat-error + markAllAsTouched + snackbar)
  - [x] `financiero/caja-mayor/registrar-egreso-dialog`
  - [x] `financiero/caja-mayor/registrar-ingreso-dialog`
  - [ ] `financiero/caja-mayor/bancos/create-edit-cuenta-bancaria`
- [ ] **Prioridad 2 — falta `mat-error` por campo**:
  - [ ] `personas/clientes/create-edit-cliente-dialog`
  - [ ] `shared/components/cobrar-venta-dialog/cobrar-credito-dialog`
  - [ ] `financiero/caja-mayor/operaciones-financieras/create-operacion-financiera` (completar campos)
- Referencias a replicar (ya bien hechos): `gasto-caja-dialog`, `create-edit-entrada-varia`,
  `emitir-cheque`, `prompt-dialog`.

### Edge conocido tras quitar el select de forma de pago (revisión adversarial)

- [ ] **`formaPagoId` required-pero-invisible en el camino CAJA_MAYOR.** Al quitar el
  select, `formaPagoId` sólo se auto-setea desde `formasPagoEfectivo` (formas cuyo
  nombre contiene "EFECTIVO"; en cobrar-cuota/pagar-cuota/pagar-compras/cobro-consolidado
  además pre-filtradas por `movimentaCaja`). **Si esa lista queda vacía** (dato mal
  configurado: no hay forma EFECTIVO / sin `movimentaCaja`), el submit se bloquea con
  el snackbar genérico sin campo visible que corregir. No se dispara con los seeds
  normales (traen EFECTIVO con movimentaCaja). **Fix recomendado**: derivar la forma
  de pago efectivo en el backend (no exigirla en el front), o mostrar un aviso inline
  cuando no se pueda resolver una forma efectivo. Aplica a los ~11 diálogos.
- [x] **`monedaId` required-pero-invisible en el camino CUENTA_BANCARIA** en
  `crear-prestamo-funcionario` y `create-edit-entrada-varia`: se limpiaba el validador
  en el resto pero no en estos dos. Corregido (clearValidators en la rama banco).

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
- [~] **Migrar inputs `type="number"` de monto/precio/cotización a máscara**
  (`appCurrencyInput`). Prioridad montos:
  - [x] `gasto-caja-dialog` (PdV) — monto
  - [x] `list-cargos` (salarioReferencia)
  - [ ] `facturar-dialog` (precioUnitario, descuento), `edit-venta-item-dialog` (descuentoUnitario)
    — **con cuidado**: tocan el flujo de venta/factura; necesitan `decimales` de la moneda de la venta.
  - [ ] `create-edit-regla-dialog` (meta) — meta es cantidad de unidades, quizá dejar `type=number`.
  - [~] `egreso-caja-inicial` / `create-caja-dialog` (conteo de billetes): son **cantidades enteras**
    (conteo), NO montos → se dejan `type=number` (no aplica la máscara de moneda).
  - [ ] cotizaciones (`create-operacion-financiera`, `create-edit-gasto`, `cobrar-cuota-dialog`):
    son **tasas** con precisión variable, no montos; migrar solo si se decide un `decimales` fijo.
  - [ ] cantidades con decimales (pdv, compras, recetas, producción) — menor prioridad
- [ ] **Parseo frágil**: `producto-inference.util.ts:147` (`replace(',', '.')` no
  descarta separador de miles).
- [ ] **Decisión**: unificar en la directiva `appCurrencyInput` y deprecar el
  componente `<app-currency-input>`/ngx-currency (o arreglar su default).
