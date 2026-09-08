# Auditoría del Plan: GASTOS-MONEDA-EDITAR (Eje A: Alcance y Convenciones)

**Auditor:** Agente Cloud  
**Plan auditado:** `docs/planes/PLAN-GASTOS-MONEDA-EDITAR.md` (710 líneas)  
**Rama:** `cursor/gastos-moneda-editar-143b` (PR #290)  
**Fecha:** 2026-09-08  
**Enfoque:** Alcance técnico de Feature A + convenciones del repo + riesgos de implementación

---

## Resumen ejecutivo

El plan presenta **dos features independientes** (A: prevenir input de separadores decimales en PYG; B: editar gastos) entregadas en un solo PR. Esta auditoría se centra en el **eje A: alcance y convenciones**.

**Hallazgos críticos:** 2 P0, 2 P1, 4 observaciones menores.

**Recomendación:** **NO implementar** hasta resolver P0. El plan asume que `CurrencyInputDirective` cubre todos los inputs de monto, pero **Mobile PWA usa un patrón diferente** (`type="number"` nativo sin directiva) y **no está mencionado** en el alcance de Feature A. También faltan consideraciones sobre teclado numérico físico y eventos de input vs. keydown.

---

## P0 — Hallazgos bloqueantes

### P0-1: Mobile PWA queda COMPLETAMENTE fuera del alcance

**Evidencia:**

- El plan menciona Mobile PWA en §"Inventario de inputs de moneda" (línea 173-175), listando `gasto-dialog.page.html` y `entrada-varia-dialog.page.html`.
- **Verificación:** `grep -r "appCurrencyInput" projects/mobile/` → **0 resultados**.
- Mobile PWA usa `<input type="number" inputmode="decimal">` directo (sin directiva custom).
  - Ejemplo: `projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.page.html:74`
    ```html
    <input matInput type="number" inputmode="decimal" formControlName="monto" min="0.01" step="any" />
    ```

**Impacto:**

- La Feature A (bloqueo de `.` y `,` en `keydown`/`paste`) **NO aplicará a ningún input de Mobile PWA**.
- Un funcionario que cargue gastos desde un tablet/celular seguirá pudiendo tipear `730.000` y registrar 730 Gs.
- El problema reportado por Gabriel **NO queda resuelto** en el canal mobile.

**Opciones de remediación:**

1. **Excluir Mobile PWA del alcance explícitamente** — justificar que Mobile rara vez usa teclado físico con punto del numpad (los teclados móviles con `inputmode="decimal"` solo presentan coma decimal). **Riesgo:** tablets con teclado Bluetooth sí tienen el problema.
2. **Implementar guard mobile-nativo** — atributo `[pattern]` en el input + validador custom que rechace strings con `.` cuando `decimales=0`. Más complejo porque `type="number"` no dispara `keydown` de caracteres alfabéticos/puntuación en algunos browsers.
3. **Migrar Mobile a `appCurrencyInput`** — importar la directiva desde `@frc/shared-core` (si es accesible) o replicarla en `projects/mobile/src/app/shared/`. Más invasivo pero **unifica el patrón**.

**Recomendación:** El plan debe **declarar explícitamente** si Mobile queda fuera o dentro. Si queda fuera, agregar una **nota en el entregable** ("Feature A cubre solo Desktop; Mobile usa `inputmode` que ya restringe teclado virtual, pero teclados físicos Bluetooth no están protegidos"). Si queda dentro, agregar Fase 1b (Mobile guard).

---

### P0-2: `@HostListener('input')` ya existe y colisiona con el plan

**Evidencia:**

- `CurrencyInputDirective` YA tiene un `@HostListener('input', ['$event'])` (línea 76-88 de `currency-input.directive.ts`) que parsea y propaga el valor al model.
- El plan propone agregar `@HostListener('keydown')` y `@HostListener('paste')`.
- **Problema:** `keydown` bloquea la tecla, pero `input` se dispara IGUAL cuando el usuario pega texto con el mouse (click derecho → Pegar) o mediante IME/autocorrect del SO. El evento `input` **no es cancelable** (no tiene `preventDefault()`).

**Escenario no cubierto:**

1. Usuario hace click derecho en el campo → "Pegar" del menú contextual.
2. El portapapeles contiene `"730.000"`.
3. `paste` event NO se dispara (porque es paste vía menú contextual, no Ctrl+V).
4. `input` event se dispara con `target.value = "730.000"`.
5. `parseInput()` ejecuta → `decimals === 0 && hasDot && !hasComma` → normaliza a `730000` (línea 134 de la directiva).
6. **El valor correcto se guarda** (730000), pero **el usuario VE "730.000" en el campo** hasta el blur.

**¿Es un bug?** No estrictamente — el valor parseado es correcto. Pero la UX es confusa: el usuario tipea `730.000`, ve `730.000` en el campo, y no sabe si se guardó bien o mal (hasta hacer blur).

**Opciones:**

1. **Aceptar la confusión temporal** — el blur corrige el display. Es el comportamiento actual.
2. **Filtrar también en `input`** — en el handler `onInput`, antes de parsear, limpiar el `.value` si `decimals === 0`:
   ```typescript
   onInput(e: Event): void {
     if (this.decimals === 0) {
       const input = this.el.nativeElement;
       input.value = input.value.replace(/[.,]/g, '');
     }
     const parsed = this.parseInput(this.el.nativeElement.value);
     // ...
   }
   ```
   **Riesgo:** Reemplazar el `.value` mientras el usuario está tipeando puede romper el cursor position (queda al final del string).

**Recomendación:** Agregar un test manual explícito: "Click derecho → Pegar `730.000` en campo PYG → verificar que el campo se limpia a `730000` antes del blur". Si el plan elige Opción 1 (no limpiar en `input`), **declararlo explícitamente** como comportamiento aceptado.

---

## P1 — Hallazgos alta prioridad

### P1-1: Teclado numérico físico usa `.` no `,` — keydown lo bloquea

**Contexto:**

- En Paraguay, el formato de números es `1.234.567` (punto como separador de miles) para montos sin decimales.
- Los teclados físicos del numpad tienen una tecla `.` (punto decimal), NO coma.
- Un cajero acostumbrado a tipear montos con el numpad **siempre usa `.`** como separador.

**Consecuencia de Feature A:**

- El handler `keydown` bloquea `.` cuando `decimales === 0`.
- El cajero tipea `730[.]000` en el numpad → el `.` se bloquea → el campo muestra `730000` (correcto), pero el flujo se interrumpe (el cajero espera ver el separador mientras tipea).

**¿Es deseable?**

- **Desde el punto de vista de Gabriel:** SÍ, porque el punto NO es separador de miles en el estándar ISO — es decorativo. El valor real es `730000` sin separadores.
- **Desde el punto de vista del cajero:** Confuso — está acostumbrado a ver `730.000` en pantalla (el `formatDisplay` lo muestra en el blur, pero no mientras tipea).

**Trade-off:**

1. **Bloquear `.` (plan actual)** — previene el error de tipeo, pero interrumpe el flujo muscle-memory del numpad.
2. **Permitir `.` pero NO interpretarlo como decimal** — `parseInput` ya lo hace (línea 134: si `hasDot && !hasComma && decimals===0`, elimina el punto). El problema es que el parser ACTUAL interpreta `.` correctamente SOLO en el blur; durante `input` el valor puede ser ambiguo.
3. **Limpiar `.` en `input`** (Opción de P0-2) — permite tipear, pero el punto desaparece al instante.

**Recomendación:** El plan debe **explicar esta decisión** en §"Decisiones de diseño". Si Gabriel prefiere permitir el punto del numpad (y confiarse en el parser del blur), la Feature A puede reducirse a **bloquear solo coma** cuando `decimales===0` (porque la coma SÍ causa ambigüedad: ¿decimal o error de tipeo?). Alternativamente, mantener el bloqueo de `.` pero **agregar un tooltip** en el campo: "PYG no usa separadores — tipee el número completo (ej. 730000)".

---

### P1-2: Handler `edit-gasto` NO tiene auditoría de `montoAnterior`

**Evidencia:**

- El plan propone agregar campos de auditoría (`montoAnterior`, `editadoPorId`, etc.) en Feature B.
- El handler `edit-gasto` (línea 1456-1584 de `caja-mayor.handler.ts`) **ya existe** y funciona.
- **Captura actual:** Solo `updatedBy` + `updatedAt` de `BaseModel` (línea 1527 `setEntityUserTracking`).
- **NO captura** el monto anterior ni la descripción anterior.

**Por qué P1 (no P0):**

- La edición **sí funciona** — revierte movimientos viejos y crea nuevos (líneas 1498-1559).
- Los saldos se actualizan correctamente.
- **Falta:** Trazabilidad histórica (saber QUÉ cambió, no solo QUIÉN y CUÁNDO).

**Problema práctico:**

- Si un gerente edita un gasto de 1.000.000 Gs a 730.000 Gs, el único registro del cambio es:
  1. Los movimientos de caja mayor tienen observación `EDICION GASTO #X (REVERSO)` (línea 1494).
  2. `updatedAt` del `Gasto` cambia.
- **NO hay forma de saber** que el monto anterior era 1M (salvo buscar en un backup o en los logs).

**Opciones:**

1. **Auditoría mínima** (plan default, línea 699) — NO agregar columnas, confiar en los movimientos como log indirecto.
2. **Auditoría completa** — migración de 4 columnas (`montoAnterior`, `descripcionAnterior`, `editadoPorId`, `fechaEdicion`). Costo: 1 migración + modificar handler en ~10 líneas.

**Recomendación:** Gabriel debe decidir. Si elige auditoría mínima, el plan debe **advertir explícitamente** en el entregable: "Los montos anteriores NO quedan registrados; para auditoría forense, usar backups de BD o restaurar desde el repositorio de movimientos (método indirecto)".

---

## Observaciones menores

### OBS-1: `preventDefault` de `paste` + `insertText` manual puede romper undo/redo del browser

**Código propuesto (Opción B del plan, línea 130-132):**

```typescript
e.preventDefault();
const cleaned = text.replace(/[.,]/g, '');
document.execCommand('insertText', false, cleaned);
```

**Problema:**

- `document.execCommand` está **deprecado** (MDN warning desde 2020).
- `insertText` mantiene el undo stack, pero `preventDefault()` del paste + `execCommand` puede romper el Ctrl+Z en algunos browsers (Firefox tiene bugs conocidos con este patrón).

**Alternativa moderna:**

```typescript
e.preventDefault();
const cleaned = text.replace(/[.,]/g, '');
(e.target as HTMLInputElement).value = cleaned;
this.ngControl?.control?.setValue(this.parseInput(cleaned), { emitEvent: true });
// Trigger 'input' manualmente si es necesario para otros listeners
```

**Impacto:** Bajo (undo/redo en inputs es poco usado). Pero el código del plan usa API obsoleta.

**Recomendación:** Reemplazar `document.execCommand` en Opción B. El código de Opción A (línea 96-98 del plan) ya usa el patrón correcto.

---

### OBS-2: El plan no menciona IME (Input Method Editors) ni composición

**Contexto:**

- IME se usa en idiomas con caracteres compuestos (chino, japonés, etc.) pero también en algunos layouts de teclado latinoamericano con dead keys.
- Durante composición IME, `keydown` de `.` o `,` se dispara, pero el caracter final puede ser diferente.

**¿Afecta a este caso?** Probablemente no (inputs numéricos en Paraguay no usan IME). Pero si se bloquea `.` en `keydown`, podría interferir con dead keys en teclados internacionales.

**Recomendación:** Agregar al manual de pruebas: "Probar con teclado EN-US, ES-PY, y PT-BR (si hay funcionarios brasileños)".

---

### OBS-3: `type="text"` + `inputmode="decimal"` sería mejor que el actual `type="text"` sin `inputmode`

**Estado actual:**

- `CurrencyInputDirective` exige `<input type="text">` (comentario línea 20 de la directiva).
- **NO especifica `inputmode`** (el atributo no está en ningún template).

**Consecuencia:**

- En mobile, el teclado virtual es el QWERTY completo, no el numpad.
- Los inputs de monto en mobile deberían tener `inputmode="decimal"` para mostrar teclado numérico.

**Alcance de este PR:** Feature A NO toca mobile (ver P0-1), así que esta observación es **fuera de alcance**. Pero vale registrarla.

**Recomendación:** Agregar un TODO en `todos-pendientes.md`: "Desktop: agregar `inputmode='decimal'` a todos los `<input appCurrencyInput>` para mejorar UX en tablets touch".

---

### OBS-4: `grep` del inventario puede perder inputs si usan binding dinámico

**Línea 179 del plan:**

> **Búsqueda exhaustiva pendiente:** Usar `grep -r "appCurrencyInput" src/` para confirmar todos los usos.

**Problema:**

- Si algún componente hace `[attr.appCurrencyInput]="condition"` (binding condicional), el grep NO lo encuentra.
- **Verificación:** `grep -r "\[appCurrencyInput\]" src/` → 0 resultados. Los usos son todos estáticos (`appCurrencyInput` sin corchetes).

**Conclusión:** El grep es suficiente para este repo. Pero el plan debería decirlo explícitamente: "Grep estático es suficiente; no se detectaron bindings dinámicos".

---

## Convenciones del repo — Cumplimiento

### ✅ Editar solo `.ts` (regla CLAUDE.md)

- Feature A modifica solo `currency-input.directive.ts` (o crea nueva directiva `.ts`).
- Feature B modifica `caja-mayor.handler.ts` (backend) y posiblemente la entity `gasto.entity.ts` (si auditoría completa).
- **NO se tocan `.js` ni `.js.map`**. ✅

### ✅ Strings en UPPERCASE

- Feature A NO toca strings de BD.
- Feature B: el handler `edit-gasto` ya usa `.toUpperCase()` en línea 1551 (`observacion: GASTO: ${...}.toUpperCase()`). ✅

### ⚠️ No funciones en templates (verificar)

- Feature A modifica una **directiva**, no templates. Si se elige Opción B (nueva directiva), hay que agregarla a los templates: `<input appCurrencyInput appNoDecimalSeparator [decimals]="moneda.decimales">`.
- El binding `[decimals]="moneda.decimales"` es **propiedad**, no función. ✅
- **Riesgo:** Si algún template tiene `[decimals]="getDecimals(moneda)"` (función), viola la regla. **Verificar** en Fase 1 antes de implementar.

### ✅ No colores hardcoded

- Feature A/B no tocan estilos. N/A.

### ✅ Permisos — `ensurePermission` en handlers mutantes

- `edit-gasto` ya tiene `ensurePermission(CAJA_MAYOR_OPERAR)` en línea 1457. ✅
- Feature A NO agrega handlers (solo directiva frontend). N/A.

---

## Alcance — Inflado vs. Huecos

### Alcance inflado: Feature B es mayormente **verificación**

**Línea 195 del plan:**

> **Qué hace:** El administrador o gerente puede editar gastos existentes.

**Realidad:**

- El handler `edit-gasto` **ya existe** y funciona (línea 1456-1584 de `caja-mayor.handler.ts`).
- La UI de editar **ya existe** (`create-edit-gasto-dialog`).
- Los reportes **ya leen** `CajaMayorMovimiento` actualizado (no cachean).

**Lo que REALMENTE falta (según el plan):**

1. Capturar auditoría (si Gabriel elige completa) — 1 migración + 10 líneas de código.
2. Verificar que reportes no cachean — **investigación**, no implementación.

**Fase 3 del plan (línea 405-429)** es casi toda **verificación** ("Investigar handlers de reportes", "Verificar que lean movimientos actualizados"). La única implementación potencial es "Invalidar cache al editar gasto" — **que probablemente no existe**.

**Recomendación:** Renombrar Fase 3 a "Fase 3: Verificar recálculo (investigación, NO implementación)". Aclara que Feature B es principalmente validar que algo que ya funciona, funciona.

---

### Hueco 1: ¿Qué pasa con Ctrl+V en campos bloqueados?

- El plan bloquea `keydown` de `.` y `,`.
- **NO bloquea** Ctrl+V → el evento `paste` se dispara, y ahí el código limpia el texto.
- ¿Pero qué pasa si el usuario presiona Ctrl+V y **no hay nada en el portapapeles**? ¿O si el portapapeles contiene una imagen?

**Respuesta:** `e.clipboardData?.getData('text')` devuelve `""` → `text.includes('.')` → false → NO se ejecuta `preventDefault()` → el paste default ocurre (que es no-op si no hay texto). **No es un bug**, pero el plan no lo documenta.

**Recomendación:** Agregar un caso de test: "Ctrl+V con portapapeles vacío → sin efecto".

---

### Hueco 2: ¿Paste de texto con saltos de línea?

- Si el portapapeles contiene `"730.000\n900.000"`, el código limpia a `"730000900000"` → se guarda **1.630.000** en un solo campo.
- Comportamiento probablemente correcto (es un valor numérico), pero inesperado para el usuario.

**Recomendación:** Agregar validación extra: si `text` contiene `\n` o `\r`, rechazar el paste completo (`preventDefault()` sin limpiar).

---

### Hueco 3: Feature B no aborda `GastoCaja` (cajón del PdV)

**Línea 265 del plan:**

> Los `Gasto` (Caja Mayor) NO afectan directamente el cierre de una caja PdV.

**Conclusión del plan:**

> **Asunción para el plan:** El gasto fue `Gasto` (Caja Mayor)...

**Problema:**

- Si el gasto reportado por Gabriel fue un `GastoCaja` (desde el cajón del PdV), Feature B **NO lo resuelve**.
- El plan pone esto como "pregunta abierta" (línea 282-287), pero **NO lo escala a bloqueante**.

**Recomendación:** Mover la pregunta "¿El gasto fue `Gasto` o `GastoCaja`?" de Fase 0 (línea 356) a **BLOQUEANTE P0**. Si fue `GastoCaja`, el plan entero de Feature B cambia (hay que implementar `edit-gasto-caja` que no existe).

---

## Comparación con código real

### Feature A: `CurrencyInputDirective` actual

**Archivo:** `src/app/shared/directives/currency-input.directive.ts`

**Estado:**

- 145 líneas, con `@HostListener('focus')`, `@HostListener('blur')`, `@HostListener('input')`.
- **NO tiene** `@HostListener('keydown')` ni `@HostListener('paste')`.
- El parser `parseInput` (línea 120-142) **SÍ maneja** correctamente el caso `decimals === 0 && hasDot` (línea 134: `normalized = s.replace(/\./g, '')`).
- **Conclusión:** La lógica de parseo ya es robusta; lo que falta es la **prevención proactiva** de tipeo de separadores.

### Feature B: Handler `edit-gasto`

**Archivo:** `electron/handlers/caja-mayor.handler.ts` líneas 1456-1584

**Estado:**

- ✅ Permiso `CAJA_MAYOR_OPERAR` (línea 1457).
- ✅ Transacción (línea 1459-1460).
- ✅ Reversión de saldos (línea 1503).
- ✅ Eliminación de movimientos viejos (línea 1508-1509).
- ✅ Creación de movimientos nuevos (línea 1544-1559).
- ❌ NO captura `montoAnterior` (el merge línea 1518 sobrescribe directamente).
- ✅ Bloquea editar gastos de cuenta bancaria (línea 1473-1476).

**Conclusión:** El handler ya es funcional; Feature B solo necesita auditoría (si Gabriel la quiere) + verificar reportes.

---

## Riesgos adicionales (no listados en el plan)

### RIESGO-A1: `decimals` es `@Input()` — puede cambiar dinámicamente

**Código de la directiva (línea 27):**

```typescript
@Input() decimals = 0;
```

**Escenario:**

1. Usuario abre formulario de gasto, selecciona PYG (`decimals=0`).
2. La directiva instala el `keydown` listener que bloquea `.` y `,`.
3. Usuario **cambia** la moneda a USD (`decimals=2`).
4. La directiva **NO reinstala** el listener (no hay `ngOnChanges`).
5. El `.` sigue bloqueado en un campo que AHORA necesita decimales.

**Impacto:** P1 — bloquea input de decimales en USD/BRL.

**Solución:** Implementar `ngOnChanges` que actualice el comportamiento del listener. O hacer el check de `this.decimals` **dentro** del handler `onKeydown` (no como condición de registro del listener).

**El plan NO menciona esto.** El código propuesto (línea 83-87 del plan) hace el check dentro del handler → ✅ correcto. Pero debería **documentarse** que esto es deliberado (porque los listeners no se registran/desregistran dinámicamente).

---

### RIESGO-A2: Angular AOT puede eliminar `@HostListener` si no se usa el componente

**Contexto:**

- Las directivas standalone se tree-shake si no se importan explícitamente.
- `CurrencyInputDirective` es standalone (línea 23-25).

**Verificación:** ¿Está importada en `imports` de algún module o componente standalone?

**Hallazgo:** El grep muestra 40+ archivos HTML que usan `appCurrencyInput`, pero son componentes **legacy** (declarados en `AppModule`).

**Riesgo:** Bajo — si el plan se implementa en componentes existentes, la directiva ya está en uso y no se tree-shakeará. Pero si se crea la nueva directiva `NoDecimalSeparatorDirective` (Opción B) y NO se importa en ningún componente, el AOT la elimina.

**Recomendación:** En Fase 4 (línea 437), agregar test: `npm run check` (AOT) → verificar que el bundle incluye la directiva.

---

## Justificación explícita de decisiones (requerido por auditoría)

### ¿Por qué extender `CurrencyInputDirective` (Opción A) en vez de nueva directiva (Opción B)?

**Pro Opción A (recomendada por el plan, línea 64):**

- Solución centralizada: todos los inputs cubiertos automáticamente.
- Menos fricción de uso: no hay que recordar aplicar dos directivas.

**Contra Opción A:**

- La directiva ya es compleja (145 líneas); agregar 20-30 líneas más puede dificultar mantenimiento (línea 66 del plan).
- **Contraargumento:** Las 20-30 líneas son dos handlers simples (`keydown` y `paste`); no complican la lógica core (parsing). El riesgo de mantenimiento es **bajo**.

**Justificación:** Opción A es superior **porque el problema es INHERENTE al input de moneda** — no es una feature ortogonal. Un input de PYG SIEMPRE debe bloquear separadores decimales; no es una decisión caso-por-caso. Opción B (directiva separada) implica que el desarrollador debe "recordar" aplicarla, lo cual es error-prone.

---

### ¿Por qué el handler `edit-gasto` NO permite editar gastos de cuenta bancaria?

**Línea 1473-1476 del handler:**

```typescript
if (gasto.destinoTipo === GastoDestinoTipo.CUENTA_BANCARIA) {
  throw new Error('Los gastos pagados desde cuenta bancaria no se editan: anulá el gasto y creá uno nuevo.');
}
```

**Justificación (NO en el plan, pero deducible del código):**

1. Un gasto bancario debita `cuentaBancaria.saldo` directamente (línea 1486-1496).
2. La reversión del débito requiere `registrarMovimientoBancario` con tipo `AJUSTE_POSITIVO` (línea 1489-1496).
3. Si el usuario cambia la cuenta bancaria (edita `cuentaBancariaId`), hay que:
   - Acreditar la cuenta vieja.
   - Debitar la cuenta nueva.
   - Validar que ambas cuentas existan y estén activas.
   - Registrar dos movimientos bancarios (reverso + nuevo).
4. **Decisión arquitectónica:** Evitar esa complejidad. Anular + recrear es más simple y menos error-prone.

**¿Es razonable?** SÍ. Los gastos bancarios son relativamente raros (mayoría va por Caja Mayor). Exigir anular + recrear es aceptable.

**El plan LO MENCIONA (línea 210-212) pero NO justifica la decisión.** Debería agregar un párrafo: "Esta restricción es deliberada por complejidad; anular + recrear es más seguro que editar cross-cuenta".

---

## Recomendaciones finales

### Antes de implementar (bloqueantes)

1. **P0-1:** Decidir alcance de Mobile PWA. Opciones:
   - Excluir explícitamente (agregar warning en docs).
   - Incluir (Fase 1b: Mobile guard con `pattern` o migrar a directiva).
2. **P0-2:** Resolver colisión `input` event — decidir si limpiar `.value` en tiempo real o aceptar confusión temporal.
3. **P1-1:** Decidir si bloquear `.` del numpad o solo `,`. Documentar trade-off.
4. **Hueco 3:** Confirmar que el gasto reportado fue `Gasto`, NO `GastoCaja`.

### Mejoras al plan (no bloqueantes)

1. Renombrar Fase 3 a "Verificar recálculo (investigación)".
2. Agregar test de cambio dinámico de `decimals` (PYG → USD).
3. Reemplazar `document.execCommand` por API moderna.
4. Documentar comportamiento de paste con portapapeles vacío / multi-línea.
5. Agregar `inputmode="decimal"` a desktop (TODO en backlog, fuera de alcance de este PR).

### Tests obligatorios adicionales

1. **Numpad físico:** Tipear monto con `.` del numpad en PYG → verificar bloqueo.
2. **Click derecho → Pegar:** Pegar `730.000` → verificar limpieza.
3. **Cambio de moneda:** Abrir formulario, PYG → USD → verificar que `.` se desbloquea.
4. **Mobile (si entra):** Tablet con teclado Bluetooth → tipear `.` en gasto PYG → verificar.
5. **Reportes (Feature B):** Editar gasto → refrescar dashboard sin reiniciar → verificar monto actualizado.

---

## Conclusión

El plan está **bien estructurado** y cubre la mayoría de casos, pero tiene **dos huecos P0** que lo hacen **no implementable** sin decisión de Gabriel:

1. Mobile PWA no está cubierto (y el plan lo asume cubierto).
2. Colisión `input` event no está resuelta.

La Feature B es mayormente **verificación** de algo que ya funciona; el único trabajo real es auditoría (si se elige completa). El plan sobreestima el esfuerzo de Feature B.

**Recomendación:** Resolver P0-1 y P0-2, luego proceder. El resto son refinamientos.

---

**Auditoría realizada por:** Cloud Agent  
**Siguiente paso:** Esperar resolución de P0 por Gabriel → Auditor B (implementación) → Aprobación → Implementar
