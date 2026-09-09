# PLAN-288: Fix layout overflow horizontal diálogo Crear vale/adelanto

**Issue:** [#288](https://github.com/GabFrank/frc-gourmet/issues/288)  
**Rama:** `cursor/fix-288-vale-dialog-layout-2582`  
**Tipo:** Layout UI fix  
**Alcance:** Solo frontend (template inline + estilos inline del componente), sin lógica de negocio

---

## 1. Diagnóstico — Causa raíz

### Evidencia del problema

**Archivo:** `src/app/pages/rrhh/vales/create-edit-vale-dialog.component.ts`

**Estilos inline actuales (líneas 133-140):**
```typescript
styles: [`
  .dialog-content { min-width: 720px; }
  .spinner { display: flex; justify-content: center; padding: 24px; }
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; }
  .full { grid-column: 1 / -1; }
  .fuente-toggle .mat-button-toggle { flex: 1; }
  .convertido { color: #1565c0; font-size: 14px; align-self: center; }
`],
```

**Llamadas al diálogo (3 callers):**
- `list-vales.component.ts` línea 192: `width: '780px'` ✅ funciona (780 > 720 + padding)
- `pagar-obligaciones-dialog.component.ts` línea 712: `width: '700px'` ❌ **overflow** (700 < 720 + padding)
- `registrar-egreso-dialog.component.ts` línea 303: `width: '760px', maxWidth: '95vw'` ✅ **ya está bien** (760 > 720 + padding)

### Causa raíz identificada

El `min-width: 720px` en `.dialog-content` **más el padding de ~32px del mat-dialog-content** (16px × 2) excede el `width: '700px'` del MatDialogConfig cuando se abre desde el wizard de pago consolidado:

**Ancho real del contenido:** 720px (min-width) + 32px (padding) = **752px**  
**Ancho del dialog:** 700px  
**Overflow:** 752 - 700 = **52px** → scroll horizontal visible

Esto fuerza al contenido a ser más ancho que el dialog, causando:

1. **Scroll horizontal visible** — el contenedor del dialog tiene `overflow-x: auto` implícito
2. **Campo Funcionario desborda** — el `mat-select` con clase `.full` (grid-column: 1 / -1) hereda el ancho excesivo del contenedor padre y se sale del viewport del dialog
3. **Inconsistencia visual** — depende de DÓNDE se abre el diálogo (780px vs 700px)

### Verificación en otros diálogos

**Ejemplo correcto:** `crear-movimiento-bancario-dialog.component.scss`
```scss
mat-dialog-content {
  min-width: 500px;
  max-width: 700px;  // ← Define un tope
}
```

Este usa **ambos** `min-width` y `max-width`, evitando el overflow.

---

## 2. Cambios propuestos

### Fase 1: Ajustar ancho del dialog (callers)

**Archivos a modificar:**

1. **`src/app/pages/rrhh/vales/list-vales.component.ts`** línea 192
   - **Antes:** `width: '780px'`
   - **Después:** `width: '760px'` (unificar a valor consistente)

2. **`src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.ts`** línea 712
   - **Antes:** `width: '700px'` ❌ **este es el overflow**
   - **Después:** `width: '760px'` (unificar)

3. **`src/app/pages/financiero/caja-mayor/registrar-egreso-dialog/registrar-egreso-dialog.component.ts`** línea 303
   - **Antes:** `width: '760px', maxWidth: '95vh'` ✅ **ya está bien**
   - **Después:** No modificar, solo verificar que sigue funcionando

**Justificación:** 760px es suficiente para el grid 2 columnas + gap + padding (≈350px por columna). Con `max-width: 720px` en el contenido y 32px de padding del mat-dialog-content, el margen real es: **760 - 32 - 720 = 8px** (suficiente para evitar que el contenido alcance el borde del dialog).

### Fase 2: Ajustar estilos del contenido

**Archivo:** `src/app/pages/rrhh/vales/create-edit-vale-dialog.component.ts` líneas 133-140

**Cambio en el bloque `styles`:**

```typescript
styles: [`
  .dialog-content { 
    width: 100%; 
    max-width: 720px; 
    box-sizing: border-box; 
  }
  .spinner { display: flex; justify-content: center; padding: 24px; }
  .form { 
    display: grid; 
    grid-template-columns: 1fr 1fr; 
    gap: 12px; 
    align-items: center; 
    width: 100%; 
    box-sizing: border-box; 
  }
  .full { 
    grid-column: 1 / -1; 
    max-width: 100%; 
    box-sizing: border-box; 
  }
  .fuente-toggle { 
    width: 100%; 
    box-sizing: border-box; 
  }
  .fuente-toggle .mat-button-toggle { flex: 1; }
  .convertido { color: #1565c0; font-size: 14px; align-self: center; }
`],
```

**Cambios clave:**
- `.dialog-content`: **Eliminar `min-width: 720px`** → usar `width: 100%; max-width: 720px;` para que se ajuste al dialog sin excederlo
- `.form`: Agregar `width: 100%; box-sizing: border-box;` para asegurar que el grid no crezca más allá del contenedor
- `.full`: Agregar `max-width: 100%; box-sizing: border-box;` para evitar que los campos de ancho completo (Funcionario, Descripción) se desborden
- `.fuente-toggle`: Agregar `width: 100%; box-sizing: border-box;` para contener el button toggle group

**Razón de `box-sizing: border-box`:** Incluye padding y border en el ancho calculado, evitando que el contenido + padding exceda el 100%.

### Fase 2.5: Truncar texto del trigger del mat-select Funcionario

**Archivo:** `src/app/pages/rrhh/vales/create-edit-vale-dialog.component.ts` estilos

Agregar clase para truncar el trigger del mat-select cuando el nombre del funcionario es muy largo:

```typescript
mat-select {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Justificación:** Si un funcionario tiene nombre + apellido muy largo, el trigger debe truncar con ellipsis (`...`) para no causar overflow horizontal. El dropdown panel (overlay) puede mostrar el nombre completo sin afectar el layout del dialog.

### Fase 3: Verificar mat-select no causa overflow

**Template actual** (líneas 44-50):
```html
<mat-form-field appearance="outline" class="full">
  <mat-label>Funcionario</mat-label>
  <mat-select formControlName="funcionarioId">
    <mat-option *ngFor="let f of funcionarios" [value]="f.id">
      {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
    </mat-option>
  </mat-select>
</mat-form-field>
```

**Verificación:** El mat-select de Angular Material respeta el ancho del mat-form-field contenedor. Con `.full` teniendo `max-width: 100%` + `box-sizing: border-box`, el select no debería causar overflow.

**Posible edge case:** Si un nombre de funcionario es extremadamente largo, el dropdown panel podría ser ancho, pero el **trigger** (campo visible en el form) respetará el ancho del contenedor. El panel de opciones se renderiza en overlay y puede exceder el ancho del dialog sin causar scroll horizontal en el form.

**Acción:** Si durante las pruebas se observa que el panel es excesivo, agregar:
```typescript
// En el template, si es necesario:
<mat-select formControlName="funcionarioId" [panelClass]="'vale-funcionario-panel'">
```

```typescript
// En styles, si es necesario:
::ng-deep .vale-funcionario-panel { max-width: 500px !important; }
```

**Decisión:** No incluir esto en el plan inicial; solo aplicar si se observa el problema durante pruebas manuales.

---

## 3. Fases de implementación

### Fase 1: Ajustar llamadas al dialog (3 callers)
- Modificar width de `'780px'` a `'760px'` en `list-vales.component.ts` línea 192
- Modificar width de `'700px'` a `'760px'` en `pagar-obligaciones-dialog.component.ts` línea 712
- **NO modificar** `registrar-egreso-dialog.component.ts` línea 303 (ya está bien con `'760px'` y `maxWidth: '95vw'`)

### Fase 2: Ajustar estilos inline del componente
- Modificar el bloque `styles` en `create-edit-vale-dialog.component.ts`
- **Eliminar** `.dialog-content { min-width: 720px; }` → usar `width: 100%; max-width: 720px; box-sizing: border-box;`
- Agregar `max-width` y `box-sizing` a `.full`, `.form`, y `.fuente-toggle`
- **Agregar** truncamiento del trigger del mat-select: `mat-select { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`

### Fase 3: Commit del plan enmendado
- Commit con mensaje: `docs(rrhh): enmendar plan #288 con hallazgos de auditoría`

### Fase 4: Implementación
- Commit con mensaje conventional: `fix(rrhh): eliminar overflow horizontal en diálogo crear vale/adelanto`

### Fase 5: Push + Verificación
- Push a `cursor/fix-288-vale-dialog-layout-2582`
- `npm run build` para verificar compilación

---

## 4. Cómo probar

### Escenario 1: Abrir desde lista de vales (desktop)
1. Login como admin
2. Navegar a **RRHH → Vales**
3. Click en botón **Crear** (abre con `width: '760px'`)
4. **Verificar:**
   - ✅ No hay scrollbar horizontal
   - ✅ Campo Funcionario se ve completo sin desbordar
   - ✅ Todos los campos alineados en grid 2 columnas
   - ✅ Campos `.full` (Funcionario, Descripción) ocupan el ancho completo sin overflow

### Escenario 2: Abrir desde pago consolidado
1. Login como admin con permiso `RRHH_VALE_CREAR`
2. Navegar a **Financiero → Caja Mayor → Pagar Obligaciones**
3. Seleccionar concepto **VALE**
4. Click en botón **+ Crear nuevo**
5. **Verificar:**
   - ✅ No hay scrollbar horizontal (este era el caso del overflow)
   - ✅ Campo Funcionario se ve completo sin desbordar
   - ✅ Todos los campos alineados en grid 2 columnas
   - ✅ Campos condicionales (Caja Mayor, Cuenta Bancaria) se muestran/ocultan correctamente sin romper layout

### Escenario 3: Abrir desde hub de egresos de Caja Mayor
1. Login como admin
2. Navegar a **Financiero → Caja Mayor → (tarjetas de acción en el dashboard)**
3. Click en tarjeta **Registrar egreso** o similar (abre `registrar-egreso-dialog`)
4. Seleccionar tipo **REGISTRAR_VALE**
5. **Verificar:**
   - ✅ No hay scrollbar horizontal (este caller ya estaba bien con 760px)
   - ✅ Campo Funcionario se ve completo sin desbordar
   - ✅ Todos los campos alineados en grid 2 columnas
   - ✅ El `maxWidth: '95vw'` funciona correctamente en pantallas pequeñas

### Escenario 4: Dark theme
1. Cambiar a dark theme (toggle en header)
2. Repetir escenarios 1, 2 y 3
3. **Verificar:**
   - ✅ No hay scrollbar horizontal en dark theme
   - ✅ Colores del dialog se ven correctos (sin fondos blancos que delaten overflow)
   - ✅ El texto del campo Funcionario es legible (color correcto en dark)

### Escenario 5: Nombres largos (truncamiento con ellipsis)
1. En la BD de prueba, modificar un funcionario para tener nombre + apellido muy largo (ej: "JUAN PABLO SEBASTIAN GONZALEZ RODRIGUEZ MARTINEZ")
2. Abrir el diálogo y seleccionar ese funcionario
3. **Verificar:**
   - ✅ El trigger del mat-select **trunca el texto con ellipsis** (`...`) sin causar overflow
   - ✅ El dropdown panel (overlay) muestra el nombre completo sin afectar el layout del dialog

### Escenario 6: Modo confirmar (modoConfirmar = true)
Este modo se usa en mobile PWA (`projects/mobile/.../ops/vale-nuevo.page.ts`) pero NO tiene caller en desktop actualmente. El código existe pero la entrada desde `pagar-obligaciones-dialog` usa `data: {}` (no pasa `modoConfirmar: true`).

**Acción:** Solo verificar visualmente que los campos condicionales no rompen:
1. Temporalmente modificar el llamado en `pagar-obligaciones-dialog` para pasar `data: { modoConfirmar: true }`
2. Abrir el dialog y alternar entre "Caja Mayor" y "Cuenta Bancaria"
3. **Verificar:**
   - ✅ Los campos condicionales se muestran/ocultan sin romper el layout
   - ✅ No aparece scrollbar horizontal al cambiar de fuente

**Nota:** Revertir el cambio temporal después de verificar. El fix no toca el modo confirmar, solo layout general.

---

## 5. Qué NO tocar

### Validaciones y lógica de negocio
- NO modificar `Validators` del FormGroup
- NO cambiar condiciones de `modoConfirmar`
- NO tocar `aplicarValidadoresFuente()`, `recalcularCotizacion()`, `recalcularConvertido()`
- NO modificar `confirmarSaldoSiNegativo()`
- NO cambiar el flujo de submit (handlers `createVale` / `crearValeConfirmado`)

### Permisos
- NO tocar permisos (`RRHH_VALE_CREAR`, `RRHH_VALE_CONFIRMAR`)
- NO agregar/quitar campos del form

### Funcionalidades
- NO cambiar el comportamiento del toggle "Es adelanto de salario"
- NO modificar el campo de cotización cuando `requiereCotiz = true`
- NO tocar la lógica de `formasPagoEfectivo` vs `formasPago`

### Backend
- NO tocar handlers (`electron/handlers/vales.handler.ts`)
- NO tocar entities (`vale.entity.ts`, `motivo-vale.entity.ts`)
- NO requiere migración

### Testing
- NO requiere tests E2E nuevos (es un fix de layout, se verifica visualmente)
- NO tocar `scripts/test-funcionario-vales-e2e.ts`

---

## 6. Impacto y riesgo

### Impacto
- **Bajo**: Solo afecta estilos inline del componente + llamadas al MatDialog.open()
- **Scope:** 1 componente + 3 callers (2 modificados, 1 verificado)
- **Cambio de behavior:** Ninguno. La funcionalidad del dialog es idéntica, solo se arregla el layout.

### Riesgo
- **Muy bajo**: 
  - No toca lógica de validación ni submit
  - No requiere reinicio (Angular renderer, hot reload suficiente)
  - No afecta backend ni base de datos
  - No cambia permisos ni seguridad

### Regresión potencial
- **Posible:** El cambio de `width: '780px'` a `'760px'` en `list-vales` hace el dialog 20px más angosto. Si algún campo muy largo estaba "justo" antes, podría verse apretado.
- **Mitigación:** El `max-width: 720px` en `.dialog-content` permite que el dialog crezca hasta 760px si el viewport lo permite. El grid `1fr 1fr` se adapta proporcionalmente.

### Rollback
- **Trivial:** Revertir el commit restaura el comportamiento previo.

---

## 7. Ambiente y tooling

### Hot reload suficiente
✅ **SÍ** — Solo se modifican templates inline + estilos inline de un componente Angular standalone.

**No requiere:**
- Reiniciar Electron
- Rebuild de TypeScript (el `.ts` cambia solo en el string del template/styles)
- Migración de BD

**Suficiente con:**
- `npm start` corriendo (Angular dev server + Electron)
- Guardar los archivos → Angular CLI detecta cambios y recompila
- Reabrir el dialog (cerrar y volver a abrir)

### Verificación en ambos temas
El usuario usa dark theme habitualmente. El fix debe probarse en:
- Light theme (default)
- Dark theme (toggle en header)

Los estilos globales de `styles.scss` ya manejan `.dark-theme .mat-mdc-dialog-container`, así que el dialog respeta el tema actual. El cambio de layout no introduce colores hardcoded.

---

## 8. Criterios de aceptación

### Debe cumplir
1. ✅ No hay scrollbar horizontal visible en el dialog en **ninguno** de los 3 puntos de entrada (lista de vales, pago consolidado, hub de egresos)
2. ✅ El campo Funcionario (mat-select con clase `.full`) se ve completo sin desbordar el panel
3. ✅ El trigger del mat-select **trunca nombres largos con ellipsis** sin causar overflow
4. ✅ El grid de 2 columnas se mantiene alineado (los campos no "saltan" de posición)
5. ✅ Los campos `.full` (Funcionario, Descripción) ocupan el ancho completo del form sin causar overflow
6. ✅ Funciona correctamente en **light theme y dark theme**
7. ✅ El diálogo es visualmente consistente desde los 3 puntos de entrada (mismo ancho, misma apariencia)

### No debe romper
1. ✅ Validaciones del form (campo requerido, monto > 0, etc.)
2. ✅ Modo confirmar (si se usa en futuro): campos condicionales se muestran/ocultan sin romper layout
3. ✅ Submit del form (crear vale SOLICITADO o CONFIRMADO según modo)
4. ✅ Confirmación de saldo negativo en modo confirmar
5. ✅ Recálculo de cotización cuando `requiereCotiz = true`

---

## 9. Notas adicionales

### Por qué no usar min-width en el contenido
`min-width` en `.dialog-content` **fuerza** un ancho mínimo que puede exceder el ancho del dialog parent si no hay espacio. Esto causa overflow horizontal porque el contenido "empuja" más allá del viewport del dialog.

**Alternativa correcta:**
- `width: 100%` → ocupa el 100% del dialog parent (sea cual sea su ancho)
- `max-width: 720px` → no crece más allá de 720px aunque el dialog sea más grande
- `box-sizing: border-box` → incluye padding/border en el cálculo del ancho

Esto hace el layout **responsive dentro del rango 760px (dialog) ↔ 720px (contenido máx)**, sin overflow.

### Por qué 760px para el dialog
- Suficiente para grid 2 columnas: `(760 - 32 padding - 12 gap) / 2 ≈ 358px` por columna
- **Margen real:** `760px (dialog) - 32px (padding mat-dialog-content) - 720px (max-width contenido) = 8px` → suficiente para evitar que el contenido alcance el borde del dialog
- **Consistente entre los 3 callers** → no depende de dónde se abre
- Conservador (no demasiado ancho) → funciona en resoluciones 1366x768 (laptop común)
- **Corrige el overflow:** 700px (antes) < 720px + 32px = 752px → **52px de overflow**

### Evidencia del issue
Captura del issue #288 muestra:
- Scrollbar horizontal visible en la parte inferior del dialog
- Campo Funcionario con mat-select desbordado (se ve el borde rojo de foco/error más ancho que el contenedor)
- Dark theme activo

Esto confirma el diagnóstico: el `min-width: 720px` del contenido excede el `width: '700px'` del dialog cuando se abre desde pago consolidado.

---

## 10. Checklist de implementación

### Plan enmendado (auditorías PASS-with-fixes)
- [x] Corregir que son 3 callers, no 2
- [x] Agregar `registrar-egreso-dialog.component.ts` (ya está bien, solo verificar)
- [x] Corregir causa real: min-width 720px + padding 32px = 752px > 700px
- [x] Corregir margen real: 8px, no 40px
- [x] Agregar truncamiento del trigger del mat-select con ellipsis
- [x] Agregar escenario de prueba desde hub de egresos

### Implementación
- [ ] Fase 1: Modificar `list-vales.component.ts` línea 192 (`width: '760px'`)
- [ ] Fase 1: Modificar `pagar-obligaciones-dialog.component.ts` línea 712 (`width: '760px'`)
- [ ] Fase 1: Verificar `registrar-egreso-dialog.component.ts` línea 303 (no modificar)
- [ ] Fase 2: Modificar estilos inline en `create-edit-vale-dialog.component.ts`
- [ ] Fase 2: Eliminar `min-width: 720px` del `.dialog-content`
- [ ] Fase 2: Agregar truncamiento del mat-select
- [ ] Commit plan enmendado: `docs(rrhh): enmendar plan #288 con hallazgos de auditoría`
- [ ] Commit implementación: `fix(rrhh): eliminar overflow horizontal en diálogo crear vale/adelanto`
- [ ] Push a `cursor/fix-288-vale-dialog-layout-2582`
- [ ] `npm run build` para verificar compilación
- [ ] Actualizar PR #294 con la implementación

---

**Fecha de plan:** 2026-09-09  
**Fecha de enmienda:** 2026-09-09 (auditorías PASS-with-fixes)  
**Autor:** Claude (Cloud Agent)  
**Revisión:** Aprobado por Gabriel para implementación
