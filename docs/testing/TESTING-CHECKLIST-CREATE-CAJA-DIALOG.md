# Checklist de QA Manual: CreateCajaDialog (WSOD Fix)

**Fecha**: 2026-09-04  
**Bugfix**: Resolver WSOD al abrir diálogo de crear/conteo de caja  
**PR**: #287 (cursor/fix-create-caja-dialog-wsod-bd0a)  
**Plan**: `docs/planes/PLAN-CREATE-CAJA-DIALOG-WSOD.md`  
**Responsable QA**: Asistente general (Grok Bot, snapshot `frc_gourmet_dev`)

---

## Prerrequisitos

- **Ambiente**: VM de QA (Grok Bot, snapshot `frc_gourmet_dev`)
- **Modo Electron**: Dark theme
- **Dispositivos**: Al menos 2 dispositivos configurados como `isCaja = true`
- **Monedas activas**: PYG (predeterminado) + USD o BRL (para probar múltiples tabs)
- **Denominaciones**: Al menos 5-6 billetes/monedas configurados por moneda

---

## Escenarios de prueba

### 1. ✅ Abrir caja nueva desde Financiero → Cajas

**Entrada**: Menú lateral → Financiero → Cajas → botón "ABRIR CAJA"

**Esperado**:
- El diálogo se abre correctamente (NO WSOD)
- Stepper visible con paso "CONTEO APERTURA"
- Dispositivo detectado automáticamente (si está configurado) o selector visible
- Tabs de monedas visibles (una tab por cada moneda activa)
- Spinner de "Cargando datos..." desaparece antes de mostrar stepper
- Width del diálogo ≈ 80% de la ventana (80vw)
- Height del diálogo ≈ 80% de la ventana (80vh)

**Call site verificado**: `list-cajas.component.ts:303` (onCreate)

---

### 2. ✅ Abrir caja nueva desde PdV sin caja abierta

**Entrada**: Menú lateral → Ventas → Punto de Venta (sin caja abierta) → el sistema ofrece abrir caja

**Esperado**:
- El diálogo se abre correctamente (NO WSOD)
- Mismo comportamiento que escenario 1
- Después de abrir la caja, el PdV se inicia correctamente

**Call site verificado**: `pdv.component.ts:354` (ofrecerAbrirCaja)

---

### 3. ✅ Abrir caja nueva desde selector de caja del PdV

**Entrada**: PdV → clic en chip de caja → "Nueva caja" en el diálogo de selección

**Esperado**:
- El diálogo se abre con width ≈ 70% (70vw, NO 500px como antes)
- El diálogo se abre con height ≈ 75% (75vh)
- NO debe quedar demasiado chico (enmienda aplicada)
- Stepper visible, no desbordado
- Funcionalidad completa igual que escenarios 1-2

**Call site verificado**: `list-caja-dialog.component.ts:152` (toggleNewCajaForm)

**⚠️ Riesgo**: Este era el call site con `width: '500px'` que se cambió a `'70vw'/'75vh'` por enmienda. **Verificar especialmente que no quede chico.**

---

### 4. ✅ Conteo de caja abierta

**Entrada**: Financiero → Cajas → (caja abierta) → botón "CONTEO" (ícono de lista)

**Esperado**:
- El diálogo se abre en modo conteo (NO WSOD)
- Título: "Conteo de caja"
- Paso "CONTEO APERTURA" con valores **precargados** de la apertura
- Campos de apertura en **solo lectura** (`isViewMode = true`)
- Paso "CONTEO CIERRE" disponible para navegar
- NO debe haber TypeError en consola sobre `stepper.steps`

**Call site verificado**: `list-cajas.component.ts:343` (goToConteo)

---

### 5. ✅ Cerrar caja desde PdV

**Entrada**: PdV (con caja abierta) → botón "CERRAR CAJA"

**Esperado**:
- El diálogo se abre en modo conteo de cierre (NO WSOD)
- Navega automáticamente al paso "CONTEO CIERRE" (sin intervención manual)
- Valores de apertura precargados y visibles en paso 1
- Paso de cierre permite ingresar conteo
- Resumen de ventas visible (cantidad, totales por forma de pago, diferencias)
- NO debe haber TypeError en consola sobre `stepper` undefined
- Timeout de 1000ms debe ser suficiente para que stepper esté disponible

**Call site verificado**: `pdv.component.ts:2412` (cerrarCaja)

**⚠️ Riesgo**: Este flujo llama `navigateToCierreStep()` que accede a `this.stepper`. Verificar que el timeout de 1000ms + checks de `if (!this.stepper) return;` previenen errores.

---

### 6. ✅ Ajustar conteo de caja cerrada

**Entrada**: Financiero → Cajas → (caja cerrada SIN retiro ingresado a Caja Mayor) → menú "⋮" → "Ajustar"

**Pasos**:
1. Confirmar motivo del ajuste
2. El diálogo se abre en modo ajuste

**Esperado**:
- El diálogo se abre correctamente (NO WSOD)
- Título: "Ajustar conteo de caja"
- Valores de apertura Y cierre precargados
- Campos **editables** (`isViewMode = false`)
- Puede modificar cantidades y guardar
- Al guardar, se registra el motivo del ajuste

**Call site verificado**: `list-cajas.component.ts:480` (ajustarConteo)

---

### 7. ✅ Múltiples monedas activas

**Entrada**: Configurar 2-3 monedas activas (PYG + USD + BRL). Abrir caja nueva.

**Esperado**:
- Las tabs de monedas aparecen correctamente (una tab por moneda)
- Al cambiar de tab, los campos de billetes se actualizan
- Los totales por moneda se calculan correctamente
- NO debe haber problema de renderizado con múltiples tabs

**⚠️ Nota**: Este escenario prueba que el lazy loading del stepper NO rompe la inicialización de tabs dinámicas.

---

### 8. ✅ Conteo resumido vs completo

**Entrada**: Abrir diálogo de apertura de caja. Activar toggle "Conteo resumido".

**Esperado**:
- En modo **resumido**: Solo pide un total por moneda (sin desglose por denominación)
- En modo **completo** (default): Pide cantidad por cada billete/moneda
- Los totales se calculan correctamente en ambos modos
- El cambio de modo no causa errores de renderizado

**⚠️ Nota**: Esta funcionalidad fue agregada en 2026-08. Verificar que el lazy loading NO la rompe.

---

### 9. ✅ Diálogo NO se desborda en pantallas pequeñas

**Entrada**: Reducir el tamaño de la ventana de Electron a ~1024x768. Abrir cualquier diálogo de caja.

**Esperado**:
- El diálogo ocupa máximo 80vw × 80vh (o 70vw × 75vh en el selector del PdV)
- Con `maxWidth: '100vw', maxHeight: '100vh'`, el diálogo NO desborda la ventana
- Scroll interno funciona si el contenido es muy grande
- Stepper completo visible sin cortes

---

### 10. ✅ Escape NO cierra el diálogo (regresión check)

**Entrada**: Abrir cualquier diálogo de caja. Presionar ESC.

**Esperado**:
- El diálogo NO se cierra (todos los call sites usan `disableClose: true`)
- Botón "CANCELAR" sí debe cerrar el diálogo

**⚠️ Nota**: Este comportamiento NO debe cambiar. Es una verificación de que el fix NO alteró `disableClose`.

---

## Registro de pruebas

**Ejecutado por**: _[Nombre del QA]_  
**Fecha**: _[YYYY-MM-DD]_  
**Build testeado**: _[SHA o tag]_  
**Resultado**: _[PASS / FAIL]_

| # | Escenario | Resultado | Notas |
|---|-----------|-----------|-------|
| 1 | Abrir caja desde Financiero | ☐ PASS ☐ FAIL | |
| 2 | Abrir caja desde PdV sin caja | ☐ PASS ☐ FAIL | |
| 3 | Abrir caja desde selector PdV | ☐ PASS ☐ FAIL | Verificar width 70vw |
| 4 | Conteo de caja abierta | ☐ PASS ☐ FAIL | |
| 5 | Cerrar caja desde PdV | ☐ PASS ☐ FAIL | Verificar navegación automática |
| 6 | Ajustar conteo de caja cerrada | ☐ PASS ☐ FAIL | |
| 7 | Múltiples monedas activas | ☐ PASS ☐ FAIL | |
| 8 | Conteo resumido vs completo | ☐ PASS ☐ FAIL | |
| 9 | Diálogo en pantalla pequeña | ☐ PASS ☐ FAIL | |
| 10 | Escape no cierra (regresión) | ☐ PASS ☐ FAIL | |

---

## Evidencia de video

**Archivo**: `_[ruta del video de Grok Bot]_`  
**Duración**: _[minutos]_  
**Cubre escenarios**: _[lista de #]_

---

## Bugs encontrados en QA

_[Listar aquí cualquier bug nuevo encontrado durante las pruebas]_

---

## Notas adicionales

- **Hot reload**: Los cambios son solo en renderer (Angular .ts/.html). NO requiere reinicio de Electron. `ng serve` con hot reload es suficiente para probar cambios incrementales.
- **Consola del navegador**: Verificar que NO hay errores de tipo `TypeError: Cannot read property 'steps' of undefined` o similares durante la navegación del stepper.
- **Logs de Electron**: Verificar que NO aparece "Render frame was disposed" en `main.log` al abrir los diálogos.

---

**Fin del checklist.**
