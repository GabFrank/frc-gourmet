# AUDITORÍA DEL PLAN A — Eje Overlay Gourmet

**Plan auditado:** `PLAN-CREATE-CAJA-DIALOG-WSOD.md`  
**Eje:** A (Overlay Gourmet — alcance y convenciones)  
**Auditor:** Cloud Agent (Sonnet 4.5)  
**Fecha:** 2026-09-04  
**Veredicto:** **OK CON ENMIENDAS MENORES**

---

## 1. Coherencia de las fases y commits

### 1.1 Estructura de las 6 fases

Las fases propuestas son:

1. **Fase 1:** Limpieza del constructor (`updateSize`, `querySelector`, `initForms` duplicado)
2. **Fase 2:** Agregar `maxWidth`/`maxHeight` en call sites (6 ocurrencias)
3. **Fase 3:** Lazy loading del stepper (`*ngIf="!loading"`)
4. **Fase 4:** Tests de regresión (spec file)
5. **Fase 5:** Checklist de QA manual
6. **Fase 6:** Documentación del plan (ya completada)

**✅ COHERENCIA:** La estructura es lógica y cada fase tiene un propósito claro.

### 1.2 Separación de concerns

**✅ CORRECTO:** Las fases NO tocan:
- La lógica de creación de `Caja` (handlers IPC, `createCaja`, `updateCaja`)
- La lógica de creación de `Conteo` (handlers IPC, `createConteo`, `updateConteo`)
- Los handlers IPC (`cajas.handler.ts`, `conteos.handler.ts`)
- Las entidades TypeORM

**✅ CORRECTO:** El bugfix es **puro frontend** (Angular component + call sites).

### 1.3 Atomicidad de los commits

**✅ CORRECTO:** Cada fase produce un commit independiente y atómico:
- Fase 1 toca solo el constructor del componente
- Fase 2 toca solo los call sites
- Fase 3 toca template + lógica del componente
- Fases 4-5 agregan tests/docs sin tocar código productivo

**⚠️ RECOMENDACIÓN:** El plan debería mencionar explícitamente que cada fase se cierra con **commit + push**, como establece el ciclo de implementación (regla #21 del skill, paso 8).

---

## 2. Cobertura de call sites

### 2.1 Call sites identificados (6 totales)

El plan identifica correctamente los 6 call sites:

| # | Archivo | Línea | Contexto | Width/Height |
|---|---------|-------|----------|--------------|
| 1 | `list-cajas.component.ts` | ~303 | `onCreate()` | `80vw / 80vh` |
| 2 | `list-cajas.component.ts` | ~343 | `goToConteo()` | `80vw / 80vh` |
| 3 | `list-cajas.component.ts` | ~480 | `ajustarConteo()` | `80vw / 80vh` |
| 4 | `list-caja-dialog.component.ts` | ~152 | `toggleNewCajaForm()` | `500px` (sin height) ⚠️ |
| 5 | `pdv.component.ts` | ~354 | `ofrecerAbrirCaja()` | `80vw / 80vh` |
| 6 | `pdv.component.ts` | ~2412 | `cerrarCaja()` | `80vw / 80vh` |

**✅ COBERTURA COMPLETA:** El grep confirma que NO hay más call sites de `CreateCajaDialogComponent` en el workspace.

### 2.2 Tratamiento del outlier (call site 4)

**✅ RIESGO DOCUMENTADO:** El plan identifica correctamente que el call site 4 usa `width: '500px'` sin `height`, y propone:
- Agregar `maxWidth: '90vw', maxHeight: '90vh'` (más conservador que `'100vw'`)
- Marcarlo como escenario de prueba #3 en el checklist de QA

**✅ JUSTIFICACIÓN:** El diálogo pequeño es un selector rápido de caja desde el PdV, no el flujo completo de conteo. El plan lo reconoce y ajusta los valores de `maxWidth`/`maxHeight` acorde.

---

## 3. Docs y tests en fases propias

### 3.1 Fase 4: Tests de regresión

**✅ CORRECTO:** Fase dedicada a crear `create-caja-dialog.component.spec.ts` con:
- Test de regresión: `updateSize()` NO se llama en constructor
- Test de regresión: `querySelector()` NO se llama en constructor
- Test de regresión: `initForms()` solo se llama UNA vez en `ngOnInit()`
- Tests de loading: stepper NO renderiza mientras `loading = true`

**✅ PRIORIDAD ALTA:** El plan marca los tests 1-2 como **tests de regresión del bug** (críticos para prevenir reintroducción).

### 3.2 Fase 5: Checklist de QA manual

**✅ CORRECTO:** Fase dedicada a crear `docs/testing/TESTING-CHECKLIST-CREATE-CAJA-DIALOG.md` con 10 escenarios mínimos.

**✅ COBERTURA:** Los escenarios cubren los 6 call sites + casos edge (múltiples monedas, conteo resumido, diálogo chico).

### 3.3 Fase 6: Documentación del plan

**✅ YA COMPLETADA:** Este es el plan mismo.

---

## 4. Reinicio de la aplicación

### 4.1 Justificación correcta

**✅ CORRECTO:** El plan afirma en §6:

> **NO requiere reinicio de la app completa (Electron).**
> 
> **Justificación:** Los cambios son solo en archivos `.ts`, `.html` del renderer (Angular). El **hot reload de Angular** (ng serve) es suficiente para aplicar los cambios.

**✅ ALINEADO CON CONVENCIONES:** Esta afirmación es consistente con la regla #14 del skill:

> **Avisar siempre si el cambio requiere reiniciar la app**: backend (`electron/handlers/`, `preload.ts`, `main.ts`, nuevas entidades, `database.config.ts`) → reinicio. Solo Angular templates/scss/ts → hot reload.

**✅ NOTA PARA EL OPERADOR:** El plan incluye una nota aclarando que si se corrigen múltiples issues en paralelo y alguno requiere reinicio, entonces sí hay que reiniciar. Esto es correcto y pragmático.

### 4.2 Anotación en el plan

**⚠️ RECOMENDACIÓN MENOR:** El plan debería incluir una sección explícita recordando que el usuario debe ser avisado de que su instancia queda vieja (aunque sea para decirle que NO necesita reiniciar). La regla #14 dice:

> el aviso sigue: el usuario tiene que saber que su instancia abierta quedó vieja.

En este caso, el aviso sería: **"No requiere reinicio — el hot reload aplicará los cambios automáticamente"**.

---

## 5. Migraciones

**✅ CORRECTO:** El plan afirma en §5:

> **No aplica.** Este bugfix no toca entidades de TypeORM ni el esquema de la base de datos.

**✅ JUSTIFICACIÓN:** Las entidades `Caja`, `Conteo`, `ConteoDetalle` ya existen y no se modifican. Los cambios son solo en el componente Angular.

---

## 6. Ambigüedades — decisiones vs preguntas

### 6.1 Decisiones tomadas en el plan (CORRECTO)

El plan toma las siguientes decisiones de diseño:

1. **Eliminar `updateSize()` en constructor** — justificado: es redundante con los call sites.
2. **Eliminar `querySelector()` en constructor** — justificado: selector incorrecto (`.cdk-dialog-container` no existe en Material 15) y peligroso (busca en todo el documento).
3. **Usar `maxWidth: '100vw', maxHeight: '100vh'`** — justificado: reproduce el comportamiento deseado original sin manipular el DOM directamente.
4. **Lazy loading del stepper con `*ngIf="!loading"`** — justificado: evita que el stepper intente renderizar antes de que los datos estén listos.

**✅ TODAS ESTAS DECISIONES SON APROPIADAS PARA UN PLAN.** No son ambiguas; están justificadas técnicamente.

### 6.2 Ambigüedades identificadas (CORRECTAS)

El plan identifica las siguientes ambigüedades:

1. **§7.2 - Riesgo de `@ViewChild` fallando si stepper no está montado** — El plan propone agregar `if (!this.stepper) return;` en `navigateToCierreStep()`. Esta es una **decisión de implementación**, no una pregunta a Gabriel. ✅ CORRECTO.

2. **§7.3 - Timeout de 500ms en `navigateToCierreStep()` podría ser insuficiente** — El plan propone aumentarlo a 1000ms. Esta es una **decisión de implementación**, no una pregunta a Gabriel. ✅ CORRECTO.

3. **§7.4 - Call site con `width: '500px'` podría quedar chico** — El plan propone usar `maxWidth: '90vw'` y verificar en QA. Si falla, expandir a `'60vw'`. Esta es una **decisión de implementación + validación QA**, no una pregunta a Gabriel. ✅ CORRECTO.

4. **§7.5 - El código original usaba `'none'` por alguna razón** — El plan analiza que no tiene sentido permitir que el diálogo se desborde fuera de la ventana, y decide usar `'100vw'`/`'100vh'`. Si en QA falla, se puede cambiar a valores más grandes. Esta es una **decisión de implementación + validación QA**, no una pregunta a Gabriel. ✅ CORRECTO.

**✅ NO HAY AMBIGÜEDADES QUE DEBERÍAN SER PREGUNTAS A GABRIEL.** Todas las decisiones son de implementación técnica y están justificadas.

### 6.3 ¿Falta alguna decisión que DEBERÍA ser pregunta a Gabriel?

Revisando el plan completo, **NO HAY DECISIONES QUE REQUIERAN INPUT DE GABRIEL**:

- El bug está claramente identificado (WSOD por `querySelector()` incorrecto).
- La solución es técnicamente obvia (usar `maxWidth`/`maxHeight` en config de Material).
- Los riesgos están identificados y mitigados con checks de código + QA manual.
- No hay decisiones de negocio (ej. "¿debería pedirse confirmación al usuario antes de X?").

**✅ CORRECTO:** Este es un bugfix técnico puro. No hay ambigüedades que escalen a Gabriel.

---

## 7. Riesgos y justificaciones

### 7.1 Riesgos identificados (5 totales)

El plan identifica **5 riesgos** en §7:

| # | Riesgo | Severidad | Mitigación |
|---|--------|-----------|------------|
| 7.1 | Overlay queda chico si `maxWidth`/`maxHeight` quedan con default | **ALTA** | Agregar explícitamente `maxWidth: '100vw', maxHeight: '100vh'` en call sites |
| 7.2 | `@ViewChild` del stepper falla si `*ngIf="!loading"` lo oculta | **MEDIA** | Agregar `if (!this.stepper) return;` en `navigateToCierreStep()` |
| 7.3 | `setTimeout(500ms)` en modo conteo corre antes de que el stepper esté listo | **ALTA** | Aumentar timeout a 1000ms + agregar check `if (!this.stepper)` |
| 7.4 | Call site con `width: '500px'` queda chico | **MEDIA** | Agregar `maxWidth: '90vw'` + verificar en QA |
| 7.5 | El código original intentaba `maxWidth: 'none'` por alguna razón | **BAJA** | Usar `'100vw'` en lugar de `'none'` + verificar en QA |

**✅ AL MENOS UN RIESGO ALTA EXPLÍCITO:** Los riesgos 7.1 y 7.3 son **ALTA** y están bien justificados.

### 7.2 Justificación de riesgos

Cada riesgo incluye:
- **Descripción técnica clara** del problema
- **Análisis del código actual** (referencias a líneas específicas)
- **Severidad justificada** (por qué es ALTA/MEDIA/BAJA)
- **Mitigación concreta** (qué cambios de código hacer)

**✅ TODOS LOS RIESGOS ESTÁN BIEN JUSTIFICADOS.**

### 7.3 ¿Falta algún riesgo crítico?

Revisando el código del componente, identifico **UN RIESGO ADICIONAL NO MENCIONADO**:

**⚠️ RIESGO NO DOCUMENTADO:**

**§7.6 - Conteo resumido podría no funcionar si el stepper está oculto durante la carga**

**Descripción:** El componente soporta dos modos de conteo:
- **Completo:** una fila de input por denominación de billete.
- **Resumido:** un solo input del total por moneda (flag `conteoResumido`).

El modo resumido usa `resumidoTotals` y `cierreResumidoTotals` (líneas 93-94) que se populan en `updatePropertiesForTemplate()` (líneas 569-575) y `updateCierrePropertiesForTemplate()` (líneas 610-616).

**Si el stepper está oculto (`*ngIf="!loading"`), los inputs de totales resumidos NO estarán en el DOM**, por lo que no se podrán capturar los valores al submit.

**Severidad:** **MEDIA** — Solo afecta el modo resumido (introducido en 2026-08), pero es un flujo activo.

**Mitigación:**
1. Verificar que los valores de `resumidoTotals` y `cierreResumidoTotals` se persistan correctamente en memoria (no dependen del DOM).
2. Agregar un caso de prueba en el checklist de QA: **Escenario #8 - Conteo resumido** (ya está en el plan, pero debería verificarse explícitamente que el stepper oculto no rompe la captura de valores).

**CONCLUSIÓN:** Este riesgo es menor porque el plan ya incluye un escenario de QA para conteo resumido. Sin embargo, el plan NO menciona explícitamente que el lazy loading del stepper podría afectar este flujo. **ENMIENDA MENOR SUGERIDA:** Agregar una nota en §7.3 aclarando que el modo resumido también depende del stepper y debe ser verificado en QA.

---

## 8. Análisis de la Fase 3 (lazy loading del stepper)

### 8.1 Justificación técnica

El plan propone en §3.5:

> Envolver el `<mat-stepper>` completo en un `*ngIf="!loading"`:
> 
> **Justificación:** El stepper contiene referencias a `@ViewChild` que Angular trata de resolver antes de que los datos estén listos. Si `monedasConfig` está vacío o `activeCurrency` es `null`, los `*ngFor` de las tabs y los billetes fallarán o renderizarán vacíos.

**✅ CORRECTO:** Esta justificación es técnicamente válida.

### 8.2 Efecto en el flujo de carga

El componente tiene el siguiente flujo de carga:

1. **Constructor:**
   - ~~`initForms()` (duplicado, se quita en Fase 1)~~
   - ~~`updateSize()` (se quita en Fase 1)~~
   - ~~`querySelector()` (se quita en Fase 1)~~

2. **`ngOnInit()`:**
   - `initForms()` (única llamada)
   - Si modo `conteo`: `loadExistingCajaData(cajaId)` → `loadDispositivos()` → `loadMonedas(true, conteoId)` → `loadConteoData(conteoId)`
   - Si modo `create`: `loadDispositivos()` → `loadMonedas()`

3. **`loadMonedas()` completa:**
   - `loading = false`
   - Stepper se monta (con `*ngIf="!loading"`)

**✅ CORRECTO:** El stepper solo se monta después de que `monedasConfig` esté poblado.

### 8.3 Impacto en `@ViewChild`

El componente tiene:

```typescript
@ViewChild('stepper') stepper!: MatStepper;
```

Con el lazy loading (`*ngIf="!loading"`), el `stepper` será `undefined` hasta que `loading = false`.

**Referencias a `this.stepper` en el código:**

- **Línea 660:** `navigateToCierreStep()` — llama `this.stepper.steps.toArray()` y `this.stepper.selectedIndex = 1`.

**✅ MITIGACIÓN PROPUESTA:** El plan propone agregar `if (!this.stepper) return;` al inicio de `navigateToCierreStep()`.

**✅ TIMING:** `navigateToCierreStep()` se llama desde:
- **Línea 1417:** `setTimeout(() => { this.navigateToCierreStep(); }, 500)` en `loadExistingCajaData()`.

Este timeout **podría ejecutarse antes de que el stepper esté renderizado**, por lo que el check `if (!this.stepper)` es **obligatorio**.

**✅ CORRECTO:** La mitigación propuesta en §7.2 y §7.3 es adecuada.

---

## 9. Análisis de coherencia con el ciclo de implementación

### 9.1 Cumplimiento del ciclo obligatorio (regla #21 del skill)

El plan debe seguir el ciclo de implementación de `workflows/ciclo-implementacion.md`. Los pasos obligatorios para un bugfix son:

1. ✅ **Skill cargado** — El plan referencia el skill de frc-gourmet-expert (solo secciones relevantes de cajas/dialogs, como solicita el usuario).
2. ✅ **Análisis** — §1 (Contexto del problema) + §2 (Call sites) + §7 (Riesgos).
3. ✅ **Plan escrito en `docs/planes/`** — Este plan existe.
4. ⏳ **Auditoría del plan (2 agentes, ejes distintos)** — En curso (este documento es el eje A).
5. ⏳ **Implementación por fases con commit+push al cerrar cada fase** — NO INICIADA (el plan dice "NO implementes").
6. ⏳ **Auditoría de la implementación** — NO INICIADA.
7. ⏳ **`npm run test:all`** — NO INICIADA.
8. ⏳ **`npm run check` (AOT)** — NO INICIADA.
9. ⏳ **Manual de pruebas** — Fase 5 del plan (creará `TESTING-CHECKLIST-CREATE-CAJA-DIALOG.md`).
10. ⏳ **Docs + skill + backlog** — El plan no menciona actualizar el skill ni `reference/known-bugs.md`.
11. ⏳ **PR a `develop`** — NO INICIADA.
12. ⏳ **CI en verde** — NO INICIADA.

**⚠️ ENMIENDA MENOR:** El plan NO menciona explícitamente los siguientes pasos del ciclo:

- **Paso 10 (docs):** ¿Hay que actualizar `reference/known-bugs.md` si el WSOD estaba listado ahí?
- **Paso 10 (skill):** ¿El bugfix invalida algo que el skill afirma? Probablemente NO (el bug no cambia convenciones), pero el plan debería mencionarlo explícitamente.

**SUGERENCIA:** Agregar una sección §9 al plan con:

```markdown
## 9. Actualización de documentación obligatoria

Según `workflows/definition-of-done.md`, antes de dar por terminado el bugfix:

1. **`reference/known-bugs.md`:** Verificar si el WSOD está listado y quitarlo (moviendo a "Bugs cerrados 2026-09").
2. **Skill (`frc-gourmet-expert/`):** NO requiere actualización — el bug no cambia convenciones ni arquitectura.
3. **Backlog (`workflows/todos-pendientes.md`):** NO aplica — los bugs se rastrean en `known-bugs.md`, no en el backlog de features.
```

### 9.2 Commit + push al cerrar cada fase

El plan lista 6 fases con sus commits previstos (§8), pero **NO menciona explícitamente que cada fase debe cerrar con `git commit` + `git push`**.

**⚠️ ENMIENDA MENOR:** Agregar una nota al final de §8:

```markdown
---

**Nota crítica:** Cada fase debe cerrar con `git add .` + `git commit -m "<mensaje>"` + `git push`. Al terminar la Fase 3 (antes de QA), actualizar el PR con los cambios acumulados.
```

---

## 10. Otros hallazgos

### 10.1 Fase 2: Call site 4 con `width: '500px'`

El plan propone agregar `maxWidth: '90vw', maxHeight: '90vh'` al call site 4 (`list-caja-dialog.component.ts:152`).

**⚠️ POSIBLE INCONSISTENCIA:**

El call site 4 usa **solo** `width: '500px'` sin especificar `height`:

```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '500px'
});
```

Si el diálogo tiene `height` por defecto (calculado por Material), agregar `maxHeight: '90vh'` podría no ser necesario. Sin embargo, si el contenido del diálogo es muy alto, podría desbordar.

**RECOMENDACIÓN:** En lugar de adivinar, el plan debería:
1. **Agregar `maxWidth: '90vw'` (como propone).**
2. **NO agregar `maxHeight`** en el primer intento — dejarlo en `auto`.
3. **Verificar en QA** (escenario #3) si el diálogo queda demasiado alto o se desborda.
4. **Si falla, agregar `maxHeight: '90vh'` en un commit de ajuste post-QA.**

**JUSTIFICACIÓN:** Menos intrusivo — el `height` por defecto de Material suele funcionar bien para diálogos de tamaño medio.

**CONCLUSIÓN:** **NO ES UN BLOQUEANTE**, pero el plan podría ser más conservador en este punto.

### 10.2 Fase 4: Tests unitarios — complejidad de mocks

El plan propone crear `create-caja-dialog.component.spec.ts` con 4 tests.

**⚠️ ADVERTENCIA DE COMPLEJIDAD:**

El plan dice:

> **Complejidad estimada:** Media — requiere mockear `RepositoryService`, `AuthService`, `MatDialogRef`, `MatSnackBar`, y varios Observables de TypeORM.

**REALIDAD:** La complejidad es **ALTA**, porque:
- `RepositoryService` tiene ~20 métodos que el componente llama (`getDispositivos`, `getCajasMonedas`, `getMonedasBilletes`, `getConteo`, `getConteoDetalles`, `createConteo`, `createConteoDetalle`, `createCaja`, etc.).
- Cada uno devuelve un `Observable` que debe ser mockeado con `of()` o `throwError()`.
- El componente tiene lógica asincrónica compleja (`forkJoin`, `finalize`, `subscribe` encadenados).

**RECOMENDACIÓN:** El plan debería:
1. Marcar la complejidad como **ALTA** (no MEDIA).
2. Aclarar que los tests de la Fase 4 son **tests de regresión mínimos** (solo constructora y loading), NO tests exhaustivos del flujo completo.
3. Si se quieren tests exhaustivos (ej. submit de caja nueva, submit de conteo de cierre), se pueden agregar en una **Fase 4b opcional** o dejarse para una sesión futura.

**CONCLUSIÓN:** **NO ES UN BLOQUEANTE**, pero el plan podría ser más realista sobre la complejidad de los tests.

---

## 11. Veredicto final

### 11.1 Resumen de hallazgos

| Ítem auditado | Estado | Hallazgos |
|---------------|--------|-----------|
| **Coherencia de fases/commits** | ✅ OK | Estructura lógica, no toca lógica de createCaja/conteo/IPC. **ENMIENDA MENOR:** Mencionar explícitamente commit+push al cerrar cada fase. |
| **Cobertura de call sites** | ✅ OK | Los 6 call sites están identificados y cubiertos. El outlier (call site 4) tiene tratamiento especial. |
| **Docs/tests en fases propias** | ✅ OK | Fases 4-5 dedicadas a tests y QA manual. |
| **Reinicio (solo renderer)** | ✅ OK | Correctamente anotado como NO requiere reinicio. **ENMIENDA MENOR:** Agregar recordatorio de avisar al usuario (aunque sea para decir que NO necesita reiniciar). |
| **Sin migración** | ✅ OK | Justificado correctamente. |
| **Ambigüedades** | ✅ OK | Todas las decisiones son de implementación técnica y están justificadas. NO hay preguntas que escalen a Gabriel. |
| **Riesgos** | ✅ OK | 5 riesgos identificados, 2 de severidad ALTA con mitigaciones concretas. **ENMIENDA MENOR:** Agregar riesgo §7.6 (modo resumido + stepper oculto). |
| **Actualización de docs obligatoria** | ⚠️ FALTA | El plan NO menciona verificar/actualizar `reference/known-bugs.md` ni confirmar que el skill no requiere cambios. **ENMIENDA MENOR:** Agregar sección §9 (ver sugerencia en §9.1). |

### 11.2 Enmiendas menores sugeridas

1. **§8 (Fases de implementación):** Agregar nota al final recordando que cada fase cierra con `git commit` + `git push`.

2. **§6 (Reinicio):** Agregar recordatorio de avisar al usuario (aunque sea para confirmar que NO necesita reiniciar).

3. **§7 (Riesgos):** Agregar riesgo §7.6 sobre el modo resumido + stepper oculto, con referencia al escenario de QA #8.

4. **§9 (nueva sección):** Agregar checklist de actualización de documentación obligatoria (`reference/known-bugs.md`, skill, backlog).

5. **§4.2.1 (Tests unitarios):** Marcar complejidad como **ALTA** (no MEDIA) y aclarar que son tests de regresión mínimos, no exhaustivos.

6. **§3.2 (Fase 2):** Aclarar que el call site 4 (`width: '500px'`) NO recibirá `maxHeight` en el primer intento — se verificará en QA y se ajustará si es necesario.

### 11.3 Veredicto

**✅ OK CON ENMIENDAS MENORES**

**Justificación:**

- ✅ Las fases son coherentes y no tocan de más la lógica de negocio.
- ✅ Los 6 call sites están todos cubiertos.
- ✅ Docs y tests tienen fases propias.
- ✅ Reinicio correctamente anotado como NO requerido.
- ✅ Sin migración, justificado correctamente.
- ✅ No hay ambigüedades que deban escalar a Gabriel.
- ✅ Al menos 2 riesgos ALTA explícitos con mitigaciones concretas.

**Las enmiendas sugeridas son menores y pueden incorporarse antes de la implementación SIN necesidad de re-auditoría.**

---

## 12. Recomendaciones para la implementación

1. **Antes de empezar Fase 1:** Incorporar las enmiendas menores sugeridas en §11.2 al plan.

2. **Al terminar Fase 3:** Commit + push + actualizar el PR antes de empezar QA.

3. **Durante QA (Fase 5):** Verificar explícitamente el escenario #8 (conteo resumido) con el stepper de lazy loading.

4. **Antes de cerrar el PR:** Verificar/actualizar `reference/known-bugs.md` si el WSOD estaba listado.

5. **Si el call site 4 queda chico en QA:** Agregar un commit de ajuste cambiando `width: '500px'` a `width: '60vw'` (no necesita re-auditoría, es un ajuste post-QA esperado).

---

**Fin de la auditoría del eje A (Overlay Gourmet).**
