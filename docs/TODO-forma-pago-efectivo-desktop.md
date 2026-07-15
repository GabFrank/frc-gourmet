# TODO — Forzar EFECTIVO cuando la fuente es Caja Mayor (Desktop)

> Origen: se corrigió esta regla en la **PWA mobile** (commit "fuente Caja Mayor
> siempre en efectivo"). Esta auditoría verifica el **desktop**, donde varios
> componentes todavía la violan. Este documento es la lista de trabajo para
> corregirlos **después** (no aplicado aún).

## Regla de negocio

- **Fuente = CAJA MAYOR** → la forma de pago es **siempre EFECTIVO**. El usuario
  no debe poder elegir otra (tarjeta, transferencia, etc.).
- **Fuente = CUENTA BANCARIA** → es transferencia: **no** se pide forma de pago y
  la **moneda la dicta la cuenta** (no se elige moneda aparte).

## Patrón de referencia (ya correcto — copiar de acá)

`registrar-ingreso-dialog`, `registrar-egreso-dialog`, `cobrar-cuota-dialog`,
`create-edit-vale-dialog` (modoConfirmar) y `confirmar-vale-dialog` usan
`formasPagoEfectivo` (filtrado por **nombre que contiene "EFECTIVO"**) para el
`*ngFor` de forma de pago cuando la fuente es caja mayor, y ocultan la forma de
pago derivando la moneda de la cuenta en modo banco.

> Ojo: filtrar por `movimentaCaja === true` **no** alcanza — deja pasar formas no
> efectivo que muevan caja. Filtrar por nombre "EFECTIVO" (como los que respetan).

---

## Pendientes de corrección (VIOLAN la regla)

- [ ] **1. create-edit-gasto-dialog**
  `src/app/pages/financiero/caja-mayor/gastos/create-edit-gasto/create-edit-gasto-dialog.component.ts`
  - Detalle de pago itera `formasPago` COMPLETO (`.html:124-125`); `formasPago`
    cargado sin filtrar (`.ts:167`). Preselecciona efectivo (`.ts:396-398`) pero
    es libremente modificable.
  - Fix: en las líneas de detalle con fuente CAJA_MAYOR, iterar solo efectivo y
    bloquear el cambio. (Es multi-detalle: aplicar por línea.)
  - Extra: lado banco toma moneda por cotización, no de la cuenta — revisar si se
    quiere alinear al patrón (moneda de la cuenta).

- [ ] **2. create-edit-entrada-varia-dialog**
  `src/app/pages/financiero/caja-mayor/entradas-varias/create-edit-entrada-varia/create-edit-entrada-varia-dialog.component.ts`
  - `formaPagoId` sobre `formasPago` COMPLETO (`.html:48-49`); carga sin filtrar
    (`.ts:135`); preselección efectivo modificable (`.ts:152-155`).
  - Lado banco OK (moneda heredada de la cuenta).
  - Fix: usar `formasPagoEfectivo` para fuente caja mayor.

- [ ] **3. create-operacion-financiera-dialog**
  `src/app/pages/financiero/caja-mayor/operaciones-financieras/create-operacion-financiera/create-operacion-financiera-dialog.component.ts`
  - Todos los tramos contra caja mayor (`formaPagoOrigenId` / `formaPagoDestinoId`)
    iteran `formasPago` COMPLETO: `.html:62-63, 87-88, 122-123, 180-181, 217-218,
    243-244`; sin filtro efectivo (`.ts:267`).
  - Lado banco OK (moneda de la cuenta).
  - Fix: efectivo en cada tramo de caja mayor.

- [ ] **4. pagar-compras-dialog**
  `src/app/pages/financiero/caja-mayor/pagar-compras-dialog/pagar-compras-dialog.component.ts`
  - `formaPagoId` sobre `formasPago` filtrado por **`movimentaCaja`** (`.ts:162`),
    NO por efectivo (`.html:142-143`).
  - Fix: refiltrar a efectivo por nombre.

- [ ] **5. pagar-cuota-dialog (Cuentas por Pagar)**
  `src/app/pages/financiero/caja-mayor/cuentas-por-pagar/pagar-cuota-dialog/pagar-cuota-dialog.component.ts`
  - `formasPago` por `movimentaCaja` (`.ts:164`, `.html:39-40`).
  - Se reutiliza en dirección COBRAR (préstamos a funcionarios) — validar que el
    cambio no rompa ese flujo.
  - Fix: efectivo por nombre para fuente caja mayor.

- [ ] **6. edit-movimiento-dialog**
  `src/app/pages/financiero/caja-mayor/edit-movimiento-dialog/edit-movimiento-dialog.component.ts`
  - Edita un movimiento de caja mayor; `formaPagoId` sobre `formasPago` COMPLETO
    sin filtro (`.html:15-16`, `.ts:91`). Permite reasignar a cualquier forma.
  - Fix: limitar a efectivo.

### Caso borde

- [ ] **7. create-retiro-caja-dialog**
  `src/app/pages/financiero/caja-mayor/retiros/create-retiro-caja-dialog/create-retiro-caja-dialog.component.ts`
  - Retiro desde una caja de VENTA (sin toggle de fuente), pero la variable
    `formasPagoEfectivo` está **mal nombrada**: se llena filtrando por
    `movimentaCaja === true` (`.ts:113`), no por EFECTIVO (`.html:38-39`). Como el
    retiro luego se ingresa a caja mayor, deja entrar formas ≠ efectivo.
  - Fix: renombrar y filtrar realmente por efectivo.

---

## Bug estructural aparte (no es la regla, pero encontrado en la auditoría)

- [ ] **confirmar-vale-dialog** (desktop)
  `src/app/pages/rrhh/vales/confirmar-vale-dialog.component.ts`
  - El `<mat-button-toggle-group formControlName="fuente">` (~línea 37) está
    **fuera** del `<form [formGroup]="form">` (abre ~línea 41): el `formControlName`
    queda sin binding de reactive forms. Mover el toggle dentro del formGroup.
  - (La regla de efectivo sí la respeta; esto es un binding roto aparte.)

---

## Componentes que ya RESPETAN (no tocar)

registrar-ingreso, registrar-egreso, cobrar-cuota, create-edit-vale (confirmar),
confirmar-vale (salvo el bug de binding), egreso-caja-inicial (efectivo por
diseño), ingresar-retiro-caja, crear-movimiento-bancario, cobrar-cpc-rapido
(delega a cobrar-cuota).
