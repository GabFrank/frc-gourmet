# Plan: Gastos con moneda sin decimales y edición de gastos

**Agente:** Planner (NO implementa código)  
**Rama:** `cursor/gastos-moneda-editar-143b` (desde `develop`)  
**Fecha:** 2026-09-08  
**Solicitado por:** Gabriel Frank

---

## Resumen ejecutivo

Dos features independientes pero entregadas en un solo PR (pedido explícito):

1. **Feature A — Ignorar punto y coma en inputs de moneda SIN decimales:** Prevenir error de tipeo que causó que 730.000 Gs se registrara como 730 Gs.
2. **Feature B — Editar gastos de una caja y recalcular cierre:** Permitir al admin/gerente corregir gastos mal cargados y actualizar los totales de cierre.

---

## Contexto del problema

### Caso real reportado por Gabriel

Un funcionario cargó un gasto de **730.000 guaraníes** (PYG) pero tipeó un punto separador de miles (`730.000`) que el parser interpretó como decimal, registrando **730 Gs**. Esto dejó:

1. Todos los gastos subsiguientes con montos incorrectos (mismo pattern de entrada).
2. Una diferencia en el cierre de caja que no cuadra con el efectivo físico.
3. Imposibilidad de corregir sin anular y recrear cada gasto (perdiendo trazabilidad).

**Moneda afectada:** PYG (`decimales = 0`) — la moneda principal de Paraguay.

**Por qué ocurrió:**

- El input usa la directiva `CurrencyInputDirective` que parsea tanto `.` como `,` como separadores válidos.
- En `parseInput()` (línea 120-142 de `currency-input.directive.ts`), cuando `decimales === 0` Y el input contiene **solo punto** (sin coma), el punto se trata como separador de miles y se elimina (`normalized = s.replace(/\./g, '')`).
- Sin embargo, el usuario puede **tipear caracteres no deseados** antes de hacer blur, y durante el `input` event el parsing acepta el punto.
- El problema NO es el parser (que funciona bien en blur), sino que **no hay guard preventivo** para evitar que el usuario ingrese `.` o `,` cuando la moneda no tiene decimales.

---

## Feature A: Ignorar separadores decimales en monedas sin decimales

### Alcance

**Qué hace:**

- En TODOS los inputs de valor monetario donde `moneda.decimales === 0`:
  - Bloquear teclas `.` y `,` en `keydown` (preventDefault).
  - Filtrar `.` y `,` del texto pegado via `paste` event.
- El bloqueo se aplica **solo en el input**, no en la lógica backend.
- El backend (handlers) ya recibe números parseados y debe seguir validando/truncando como hasta ahora.

**Qué NO hace:**

- NO cambia el comportamiento del `CurrencyInputDirective` en monedas CON decimales (USD, BRL, etc.).
- NO afecta la serialización o persistencia: el backend sigue siendo la fuente de verdad.
- NO agrega validación nueva al backend (asumimos que ya rechaza o trunca decimales en monedas sin decimales).

### Decisiones de diseño

#### Opción A: Extender `CurrencyInputDirective` (RECOMENDADA)

- Agregar lógica `@HostListener('keydown')` y `@HostListener('paste')` que consulte `this.decimals`.
- Si `decimals === 0`, bloquear `.` y `,`.
- **Pro:** Solución centralizada; todos los inputs que usan la directiva quedan cubiertos automáticamente.
- **Contra:** La directiva ya es compleja (~145 líneas); agregar 20-30 líneas más puede dificultar mantenimiento.

#### Opción B: Nueva directiva `NoDecimalSeparatorDirective`

- Directiva standalone que se aplica junto con `CurrencyInputDirective`.
- Ejemplo: `<input appCurrencyInput appNoDecimalSeparator [decimals]="moneda.decimales">`.
- **Pro:** Separación de responsabilidades; más fácil testear y mantener.
- **Contra:** Duplicación de la condición `decimals === 0` en dos lugares; desarrolladores deben recordar aplicar ambas directivas.

**Decisión pendiente:** Gabriel debe elegir entre A o B según preferencia de mantenibilidad vs. simplicidad de uso.

### Implementación técnica

**Si se elige Opción A:**

```typescript
// src/app/shared/directives/currency-input.directive.ts
@HostListener('keydown', ['$event'])
onKeydown(e: KeyboardEvent): void {
  if (this.decimals === 0 && (e.key === '.' || e.key === ',')) {
    e.preventDefault();
  }
}

@HostListener('paste', ['$event'])
onPaste(e: ClipboardEvent): void {
  if (this.decimals === 0) {
    const text = e.clipboardData?.getData('text') || '';
    if (text.includes('.') || text.includes(',')) {
      e.preventDefault();
      const cleaned = text.replace(/[.,]/g, '');
      (e.target as HTMLInputElement).value = cleaned;
      const parsed = this.parseInput(cleaned);
      this.writingFromControl = true;
      this.ngControl?.control?.setValue(parsed, { emitEvent: true });
      this.writingFromControl = false;
    }
  }
}
```

**Si se elige Opción B:**

```typescript
// src/app/shared/directives/no-decimal-separator.directive.ts
@Directive({
  selector: 'input[appNoDecimalSeparator]',
  standalone: true,
})
export class NoDecimalSeparatorDirective {
  @Input() decimals = 0;

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (this.decimals === 0 && (e.key === '.' || e.key === ',')) {
      e.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    if (this.decimals === 0) {
      const text = e.clipboardData?.getData('text') || '';
      if (text.includes('.') || text.includes(',')) {
        e.preventDefault();
        const cleaned = text.replace(/[.,]/g, '');
        document.execCommand('insertText', false, cleaned);
      }
    }
  }
}
```

### Inventario de inputs de moneda

**Ubicaciones confirmadas (deben cubrirse):**

1. **Gastos:**
   - `create-edit-gasto-dialog.component.html` — campo monto + tabla de detalles (`<mat-cell *matCellDef="let d"> <input appCurrencyInput [decimals]="...">`)

2. **Operaciones Financieras:**
   - `create-operacion-financiera-dialog.component.html` — montoOrigen, montoDestino
   - Mobile: `operacion-financiera-nuevo.page.html`

3. **Entradas Varias:**
   - `create-edit-entrada-varia-dialog.component.html` — monto

4. **Retiros de Caja:**
   - `create-retiro-caja-dialog.component.html` — tabla detalles

5. **Conteos de Caja:**
   - `create-conteo-dialog.component.html` — tabla por denominación
   - `conteo-detalle-form.component.html`

6. **Vales RRHH:**
   - `create-edit-vale-dialog.component.html` — monto

7. **Compras:**
   - `pagar-cuota-dialog.component.html` — monto
   - `crear-compra-simplificada-dialog.component.html`

8. **PdV / Cobros:**
   - `cobrar-dialog.component.html` — tabla de formas de pago
   - `ajuste-dialog.component.html`
   - `vuelto-dialog.component.html`

9. **Cuentas por Cobrar/Pagar:**
   - `pagar-obligaciones-dialog.component.html` — wizard de pago consolidado

10. **Mobile PWA:**
    - `gasto-dialog.page.html`
    - `entrada-varia-dialog.page.html`
    - Y otros formularios de montos en `projects/mobile/`

**Búsqueda exhaustiva pendiente:** Usar `grep -r "appCurrencyInput" src/` para confirmar todos los usos.

### Validación backend (verificar, NO implementar)

El backend debe **ya** rechazar o truncar decimales en monedas sin decimales. Investigar:

1. `create-gasto` (línea ~1201-1330 de `caja-mayor.handler.ts`).
2. Otros handlers que reciben montos (`create-operacion-financiera`, `create-vale`, etc.).

**Si NO existe validación:** agregar un issue al backlog, pero NO bloqueante para este PR (la UI ya previene el error).

---

## Feature B: Editar gastos de caja (GastoCaja) y recalcular cierre

### Alcance DEFINITIVO (post-decisiones de Gabriel)

**Qué hace:**

- El **administrador** o **gerente** puede editar gastos de caja existentes (`GastoCaja`):
  - **Campos editables:** monto, descripción, categoría.
  - **Campos NO editables (por simplicidad):** fecha, moneda, forma de pago.
- Al guardar:
  1. Actualizar el registro de `GastoCaja` con los nuevos valores.
  2. Registrar auditoría vía `updatedBy` + `updatedAt` (campos de `BaseModel`).
- El resumen de cierre (`computeResumenCaja`) actualiza automáticamente:
  - Lee gastos con `estado = 'ACTIVO'` (línea 166-188 de `resumen-caja.utils.ts`).
  - Suma montos actuales → NO hay snapshots persistidos que recalcular.

**Qué NO hace:**

- NO edita `Gasto` de Caja Mayor (handler `edit-gasto` ya existe; fuera de alcance).
- NO permite borrar gastos (anular con `anular-gasto-caja` sigue siendo el único camino).
- NO cambia fecha/moneda/forma de pago (simplifica validación y evita romper conteos).
- NO requiere migración (usa `updatedBy` + `updatedAt` de `BaseModel`).

### Permisos

**Handler:** `edit-gasto-caja` (a crear) debe validar con `ensurePermission`.

**Verificar permiso real del handler `create-gasto-caja`:**
- Línea 19 de `gastos-caja.handler.ts`: `ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')`.

**¿Admin y gerente tienen `VENTAS_PDV`?**
- **GERENTE:** SÍ (línea 480 de `seed-system.ts`).
- **ADMINISTRADOR:** SÍ (tiene todos los permisos).
- **CAJERO:** SÍ (línea 527 de `seed-system.ts`).

**Problema:** El permiso `VENTAS_PDV` lo tiene también el cajero, pero Gabriel especificó "solo admin y gerente".

**Opciones:**
1. Crear permiso nuevo `VENTAS_GASTO_CAJA_EDITAR` (solo admin + gerente).
2. Usar `VENTAS_PDV` y confiar en la UI (botón no visible para cajero).
3. Usar `FINANCIERO_CAJA_GESTIONAR` (admin + gerente; línea 499 de seed).

**Decisión:** Usar `FINANCIERO_CAJA_GESTIONAR` — es el permiso de "gestionar cajas" que admin + gerente tienen y cajero NO (línea 540 de seed: cajero solo tiene `FINANCIERO_CAJA_VER` + `FINANCIERO_CAJA_OPERAR`).

### Auditoría de cambios

**Campos a agregar a `Gasto` (migración requerida):**

```typescript
@Column({ name: 'monto_anterior', type: 'decimal', precision: 10, scale: 2, nullable: true })
montoAnterior?: number;

@Column({ name: 'editado_por_id', type: 'int', nullable: true })
editadoPorId?: number;

@ManyToOne('Usuario', { nullable: true, createForeignKeyConstraints: false })
@JoinColumn({ name: 'editado_por_id' })
editadoPor?: any;

@Column({ name: 'fecha_edicion', type: 'datetime', nullable: true })
fechaEdicion?: Date;

@Column({ name: 'descripcion_anterior', type: 'varchar', length: 255, nullable: true })
descripcionAnterior?: string;
```

**Alternativa (si Gabriel prefiere auditoría mínima):**

Solo agregar `montoAnterior` y reutilizar `updatedBy` + `updatedAt` de `BaseModel`. El historial de ediciones quedaría en los logs de movimientos de caja mayor (cada edición crea contra-movs con observación `EDICION GASTO #X (REVERSO)`).

**Decisión pendiente:** Gabriel debe confirmar nivel de auditoría (completo vs. mínimo).

### Recalcular cierre de caja

**Cómo funciona actualmente (confirmado por lectura de código):**

- El cierre de una caja PdV se computa on-the-fly en `computeResumenCaja` (`electron/utils/resumen-caja.utils.ts`).
- NO hay snapshots persistidos de totales de gastos.
- El resumen lee todos los gastos con `estado = 'ACTIVO'` (línea 166-170).
- Suma montos de gastos en efectivo y calcula esperado como: `apertura + efectivo - gastoEfectivo - egresoEfectivo - retiroEfectivo`.

**Conclusión:**

- Al editar un gasto (actualizar su `monto`), el resumen **recalcula automáticamente** porque lee las filas activas de la BD.
- NO hace falta "recalcular cierre persistido" — no existe tal cosa.
- El ticket de cierre, imagen de WhatsApp, y reportes de mes se generan on-demand llamando a `computeResumenCaja`.

**Confusión en el requerimiento:**

Gabriel mencionó "recalcular cierre de caja" pero el gasto fue registrado en **Caja Mayor**, no en una caja PdV. Los gastos de Caja Mayor **no cierran** — la Caja Mayor es un ledger continuo, sin apertura/cierre diario.

**Aclaración necesaria:**

1. Si el gasto fue un `GastoCaja` (registrado desde el cajón del PdV vía "Utilitarios → Gastos"):
   - Editar `GastoCaja` requiere handler nuevo (`edit-gasto-caja`) que revierta el movimiento de la caja PdV.
   - El cierre (`ResumenCaja`) se calcula on-the-fly; no hay snapshot persistido que recalcular.
   - Investigar: ¿`ResumenCaja` lee `gastos_caja` directamente o suma movimientos?

2. Si el gasto fue un `Gasto` (Caja Mayor):
   - El cierre de una caja PdV NO lo incluye (los gastos de Caja Mayor no afectan el arqueo de una terminal).
   - Los reportes de gastos (dashboard, cierre de mes) leen `CajaMayorMovimiento` EGRESO_GASTO → al editar el gasto, los totales ya quedan actualizados.
   - NO hay "snapshot de cierre" de Caja Mayor que recalcular.

**Preguntas abiertas para Gabriel:**

- ¿El gasto que dejó la diferencia fue `GastoCaja` (desde el cajón) o `Gasto` (Caja Mayor)?
- ¿Qué reportes mostraban el monto incorrecto? (para verificar que lean movimientos actualizados)
- ¿"Recalcular cierre" se refiere a regenerar un PDF/imagen de WhatsApp ya enviado, o a corregir saldos en vivo?

**Asunción para el plan:** El gasto fue `Gasto` (Caja Mayor) y "recalcular" significa que los reportes y saldos deben reflejar el monto corregido. Esto ya ocurre automáticamente porque:

- `CajaMayorSaldo` se actualiza en `edit-gasto` (líneas 1503, 1559).
- Dashboards y reportes leen `CajaMayorMovimiento` + saldos actualizados.

**Si la asunción es incorrecta:** Investigar `ResumenCaja` (`electron/utils/resumen-caja.utils.ts`) y handlers de cierre de caja PdV.

### Flujo de edición (ya implementado)

El handler `edit-gasto` (línea 1456-1584) ya hace:

1. Buscar gasto + movimientos existentes.
2. Revertir saldos (línea 1503: `actualizarSaldo(..., AJUSTE_POSITIVO)`).
3. Eliminar movimientos y detalles viejos (línea 1508-1509).
4. Actualizar `Gasto` (merge + save).
5. Crear nuevos detalles y movimientos (línea 1533-1559).
6. Commit transacción.

**Validaciones existentes:**

- Bloquea editar gastos de cuenta bancaria (línea 1473-1476).
- Usa `ensurePermission(CAJA_MAYOR_OPERAR)` (línea 1457).

**Lo que falta (si Gabriel confirma auditoría completa):**

1. Antes de merge (línea 1518), guardar: `montoAnterior = gasto.monto`, `descripcionAnterior = gasto.descripcion`, `editadoPorId = getCurrentUser()?.id`, `fechaEdicion = new Date()`.
2. Migración para agregar esas columnas.

### Testing

**Escenario base (manual):**

1. Crear gasto de 1.000.000 Gs en Caja Mayor.
2. Verificar que `CajaMayorSaldo` para (cajaMayor, PYG, EFECTIVO) disminuyó 1.000.000.
3. Editar el gasto a 730.000 Gs.
4. Verificar:
   - Saldo aumentó 270.000 (1M - 730k).
   - Movimientos: existe un AJUSTE_POSITIVO por 1M (reverso) y un EGRESO_GASTO nuevo por 730k.
   - Dashboard de Caja Mayor muestra el saldo correcto.
   - Reporte de gastos (si existe) suma 730k, no 1M.
5. Verificar auditoría (si se implementa): `montoAnterior = 1000000`, `fechaEdicion` seteada.

**Escenario 2 (multi-moneda):**

1. Crear gasto con 2 detalles: 500k Gs + 100 USD.
2. Editar: cambiar a 600k Gs + 50 USD.
3. Verificar saldos de ambas monedas.

**Escenario 3 (restricción cuenta bancaria):**

1. Crear gasto con `destinoTipo = CUENTA_BANCARIA`.
2. Intentar editar → debe rechazar con mensaje claro.

**Escenario 4 (permisos):**

1. Loguearse como CAJERO → botón "Editar" no visible (o handler rechaza con FORBIDDEN).
2. Loguearse como GERENTE → edición permitida.

---

## Fases de implementación (ACTUALIZADAS)

### Fase 1: Feature A — Guard de inputs sin decimales

**Tareas:**

1. **Extender `CurrencyInputDirective`:**
   - Agregar `@HostListener('keydown', ['$event'])`: si `decimals === 0` y tecla es `.` o `,` → `preventDefault()`.
   - Agregar `@HostListener('input', ['$event'])`: si `decimals === 0`, limpiar `.` y `,` del valor sin romper el cursor.
2. **Test manual:**
   - Abrir formulario de gasto de caja, seleccionar PYG (`decimales=0`).
   - Intentar tipear `.` → bloqueado.
   - Copiar "1.234.567" y pegar → se limpia a "1234567".
   - Cambiar a USD (`decimales=2`) → `.` y `,` funcionan normal.
3. **Build:** `npm run build` (o solo `npm run electron:serve-tsc` si no toca renderer).
4. **Commit:** "feat(monedas): bloquear separadores decimales en monedas sin decimales"

**Archivos:**
- `src/app/shared/directives/currency-input.directive.ts`

---

### Fase 2: Feature B — Handler y entidad

**Tareas:**

1. **Handler `edit-gasto-caja`:**
   - Archivo: `electron/handlers/gastos-caja.handler.ts`.
   - Validar con `ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR')`.
   - Buscar gasto por ID + validar que existe y está ACTIVO.
   - Actualizar: `monto`, `descripcion`, `gastoCategoriaId`.
   - NO editar: `fecha`, `moneda`, `formaPago`, `caja`.
   - `setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true)` (isUpdate=true).
   - Guardar.
2. **Registrar handler:** Ya está en `registerGastosCajaHandlers` — solo agregar el `ipcMain.handle`.
3. **Build:** `npm run electron:serve-tsc`.
4. **Commit:** "feat(gastos-caja): handler para editar gastos de caja"

**Archivos:**
- `electron/handlers/gastos-caja.handler.ts`

---

### Fase 3: Feature B — UI

**Tareas:**

1. **Modificar `CreateGastoCajaDialogComponent`:**
   - Agregar input `@Input() gastoId?: number` (para modo edición).
   - Si `gastoId` existe: cargar gasto con `getGastoCaja(gastoId)` y popular form.
   - Método `guardar()`: bifurcar — si `gastoId` → `editGastoCaja()`, sino → `createGastoCaja()`.
   - Título dinámico: "Registrar gasto" vs "Editar gasto".
2. **Preload (`preload.ts`):**
   - Agregar `editGastoCaja: (id: number, data: any) => invoke('edit-gasto-caja', id, data)`.
   - Agregar `getGastoCaja: (id: number) => invoke('get-gasto-caja', id)` (si no existe).
3. **RepositoryService:**
   - Agregar método abstracto + impl en `repository-ipc.service.ts`.
4. **Botón "Editar" en listado de gastos del cajón:**
   - Verificar dónde se lista (probablemente en `utilitarios-dialog` o componente de caja).
   - Agregar botón con `*appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"`.
   - Al click: `dialog.open(CreateGastoCajaDialogComponent, { data: { gastoId, cajaId, cajaNombre } })`.
5. **Build:** `npm run build`.
6. **Commit:** "feat(gastos-caja): UI para editar gastos de caja"

**Archivos:**
- `src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component.ts`
- `src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component.html`
- `preload.ts`
- `src/app/database/repository.service.ts`
- `src/app/database/repository-ipc.service.ts`
- (Componente que lista gastos — identificar y agregar botón)

---

### Fase 4: Testing manual

**Tareas:**

1. **Feature A:**
   - Abrir formulario de gasto, probar con PYG y USD.
2. **Feature B:**
   - Crear gasto de 1.000.000 Gs.
   - Editar a 730.000 Gs.
   - Verificar que resumen de cierre muestre el monto correcto.
   - Verificar que `updatedBy` + `updatedAt` se actualizan.
3. **Commit:** "test: verificar features A y B manualmente"

---

### Fase 5: Documentación

**Tareas:**

1. **Actualizar skill:**
   - `domains/financiero-caja-mayor.md` → mencionar que gastos de caja son editables.
   - O crear `domains/gastos-caja.md` si hace falta.
2. **Commit:** "docs: actualizar plan y skill con features implementadas"

---

## Migraciones

### Migración 1: Auditoría de gastos (solo si Gabriel confirma)

```typescript
// src/app/database/migrations/<epoch>-AuditoriaGasto.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditoriaGasto<epoch> implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const driver = queryRunner.connection.options.type;
    if (driver === 'postgres') {
      await queryRunner.query(`
        ALTER TABLE gastos
        ADD COLUMN monto_anterior DECIMAL(10,2),
        ADD COLUMN descripcion_anterior VARCHAR(255),
        ADD COLUMN editado_por_id INT,
        ADD COLUMN fecha_edicion TIMESTAMP;
      `);
    } else {
      await queryRunner.query(`
        ALTER TABLE gastos ADD COLUMN monto_anterior DECIMAL(10,2);
        ALTER TABLE gastos ADD COLUMN descripcion_anterior VARCHAR(255);
        ALTER TABLE gastos ADD COLUMN editado_por_id INT;
        ALTER TABLE gastos ADD COLUMN fecha_edicion DATETIME;
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const driver = queryRunner.connection.options.type;
    const drops = ['monto_anterior', 'descripcion_anterior', 'editado_por_id', 'fecha_edicion'];
    for (const col of drops) {
      await queryRunner.query(`ALTER TABLE gastos DROP COLUMN ${col};`);
    }
  }
}
```

**Registro:** Agregar a `getMigrations()` en `database.config.ts`.

---

## Permisos

**Código:** `CAJA_MAYOR_OPERAR` (ya existe).

**Roles:**

- ✅ ADMINISTRADOR (todos los permisos)
- ✅ GERENTE (línea 500 de `seed-system.ts`)
- ❌ CAJERO (correcto)
- ❌ MOZO (correcto)

**UI:** Botón "Editar" en `list-gastos.component.html` debe tener `*appHasPermission="'CAJA_MAYOR_OPERAR'"` (verificar que ya lo tenga).

**Handler:** `edit-gasto` ya valida con `ensurePermission(CAJA_MAYOR_OPERAR)` (línea 1457).

---

## Riesgos y mitigaciones

### Riesgo 1: Olvidar inputs en Feature A

**Probabilidad:** Media.  
**Impacto:** Bajo (solo queda sin guard ese input; el backend sigue validando).  
**Mitigación:**

- Script grep exhaustivo: `grep -r "appCurrencyInput" src/ projects/mobile/ | wc -l` → confirmar que todos están cubiertos.
- Test manual en al menos 5 tipos de input (gastos, operaciones, vales, conteos, cobros).

### Riesgo 2: Confusión entre `Gasto` y `GastoCaja`

**Probabilidad:** Alta (el requerimiento no especifica).  
**Impacto:** Alto (implementar Feature B para la entidad equivocada).  
**Mitigación:**

- Fase 0 obligatoria: Clarificar con Gabriel tipo de gasto y qué reportes mostraban error.
- Si es `GastoCaja`: Implementar `edit-gasto-caja` análogo (handler nuevo + validar cierre de caja PdV).

### Riesgo 3: Reportes cachean saldos viejos

**Probabilidad:** Baja (los dashboards leen `CajaMayorSaldo` en tiempo real).  
**Impacto:** Alto (editar gasto no corrige reportes).  
**Mitigación:**

- Fase 3 investiga handlers de reportes.
- Test E2E: Editar gasto → refrescar dashboard sin reiniciar → verificar que muestre monto nuevo.

### Riesgo 4: Edición sin auditoría pierde trazabilidad

**Probabilidad:** Media (depende de decisión de Gabriel).  
**Impacto:** Medio (imposible saber quién cambió qué y cuándo).  
**Mitigación:**

- Recomendar auditoría completa (migración de 4 campos).
- Si Gabriel elige mínima: Los movimientos de caja mayor llevan observación `EDICION GASTO #X (REVERSO)` que sirve como log parcial.

### Riesgo 5: Mobile PWA usa directiva distinta

**Probabilidad:** Baja (debería importar del core).  
**Impacto:** Medio (guard no aplica en mobile).  
**Mitigación:**

- Verificar imports en `projects/mobile/src/app/shared/directives/`.
- Si es copia: Aplicar cambios duplicados.
- Si es import: Confirmar que funciona (test en mobile).

---

## Tests

### Test unitario (opcional, baja prioridad)

```typescript
// currency-input.directive.spec.ts
it('should block dot and comma keydown when decimals=0', () => {
  directive.decimals = 0;
  const event = new KeyboardEvent('keydown', { key: '.' });
  spyOn(event, 'preventDefault');
  directive.onKeydown(event);
  expect(event.preventDefault).toHaveBeenCalled();
});

it('should allow dot keydown when decimals=2', () => {
  directive.decimals = 2;
  const event = new KeyboardEvent('keydown', { key: '.' });
  spyOn(event, 'preventDefault');
  directive.onKeydown(event);
  expect(event.preventDefault).not.toHaveBeenCalled();
});
```

### Test E2E (manual, OBLIGATORIO)

Ver §"Feature A — Testing" y §"Feature B — Testing" arriba. Incluir en `docs/testing/TESTING-CHECKLIST-GASTOS-MONEDA.md`.

---

## Preguntas abiertas (BLOQUEANTES para Fase 1+)

1. **Feature A — Diseño:**
   - ¿Extender `CurrencyInputDirective` (Opción A) o crear `NoDecimalSeparatorDirective` (Opción B)?

2. **Feature B — Auditoría:**
   - ¿Auditoría completa (migración de 4 campos) o mínima (reutilizar `updatedBy`)?

3. **Feature B — Tipo de gasto:**
   - El gasto que causó la diferencia, ¿fue `Gasto` (Caja Mayor) o `GastoCaja` (cajón del PdV)?

4. **Feature B — Reportes afectados:**
   - ¿Qué reportes mostraban el monto incorrecto? (dashboard, cierre de mes, resumen de caja, otro).

5. **Backend validation (no bloqueante):**
   - ¿El backend rechaza decimales en monedas sin decimales, o los trunca silenciosamente?

---

## Hallazgos durante investigación

### Monedas y decimales

- `Moneda.decimales` define cantidad de decimales para formateo (0 para PYG, 2 para USD/BRL).
- Seed crea PYG con `decimales: 0`, USD con `decimales: 2`, BRL con `decimales: 2`.
- `CurrencyInputDirective` ya parsea correctamente en blur, pero no previene tipeo durante edición.

### Roles reales

- **ADMINISTRADOR:** Todos los permisos (auto-sync en cada arranque).
- **GERENTE:** 48 permisos incluyendo `CAJA_MAYOR_OPERAR` (línea 500).
- **CAJERO:** 18 permisos, **NO** incluye `CAJA_MAYOR_OPERAR` (línea 540).
- **MOZO:** 6 permisos, solo lectura + asistencia + ver música (línea 560).

### Handler `edit-gasto` existente

- **Ubicación:** `electron/handlers/caja-mayor.handler.ts` líneas 1456-1584.
- **Permiso:** `ensurePermission(CAJA_MAYOR_OPERAR)` (línea 1457).
- **Flujo:**
  1. Busca gasto + movimientos viejos.
  2. Revierte saldos con `actualizarSaldo(..., AJUSTE_POSITIVO)`.
  3. Elimina movimientos y detalles viejos.
  4. Actualiza `Gasto` (merge).
  5. Crea nuevos detalles y movimientos.
- **Restricción:** Bloquea editar gastos de cuenta bancaria (línea 1473).
- **Auditoría actual:** Solo `updatedBy` + `updatedAt` de `BaseModel`.

### Cierre de caja

- **Caja PdV:** Apertura/cierre diario, genera `RetiroCaja` → se ingresa a Caja Mayor.
- **Caja Mayor:** Ledger continuo, sin apertura/cierre. `CajaMayorSaldo` se actualiza on-the-fly.
- **Gastos de Caja Mayor:** NO afectan el cierre de una caja PdV (son dos subsistemas separados).
- **`GastoCaja`:** Gastos del cajón del PdV (tabla separada, handler `gastos-caja.handler.ts`).

### Inputs de moneda inventariados

10+ componentes confirmados usan `appCurrencyInput`:

1. `create-edit-gasto-dialog`
2. `create-operacion-financiera-dialog`
3. `create-edit-entrada-varia-dialog`
4. `create-retiro-caja-dialog`
5. `create-conteo-dialog` + `conteo-detalle-form`
6. `create-edit-vale-dialog`
7. `pagar-cuota-dialog`
8. `cobrar-dialog` + `ajuste-dialog` + `vuelto-dialog`
9. `pagar-obligaciones-dialog`
10. Mobile: `gasto-dialog.page`, `entrada-varia-dialog.page`, etc.

**Búsqueda completa pendiente.**

---

## Entregable final

1. **Código:**
   - Guard de separadores decimales (Feature A) — directiva modificada o nueva.
   - Migración de auditoría (Feature B) — si Gabriel confirma completa.
   - Handler `edit-gasto` con captura de valores viejos (Feature B) — si auditoría completa.
2. **Documentación:**
   - Manual de pruebas `docs/testing/TESTING-CHECKLIST-GASTOS-MONEDA.md`.
   - Skill actualizada en `domains/financiero-caja-mayor.md`.
3. **PR:**
   - Rama `cursor/gastos-moneda-editar-143b` → `develop`.
   - Draft hasta que Gabriel confirme que tests pasan.
   - Título: "feat(gastos): ignorar separadores decimales + editar gastos con auditoría".
   - Body: Link a este plan + resumen de cambios + screenshots de tests.

---

## Notas para Gabriel

- **Un solo PR, dos features** como pediste.
- **Bloqueado hasta que respondas las 4 preguntas de Fase 0.**
- **Recomendaciones:**
  1. Feature A: Opción A (extender directiva existente) es más robusta.
  2. Feature B: Auditoría completa (migración de 4 campos) preserva trazabilidad.
  3. Confirmar que el gasto fue `Gasto` (Caja Mayor), no `GastoCaja` (PdV).
- **Importante:** El handler `edit-gasto` ya existe y funciona. Feature B es principalmente agregar auditoría + verificar que reportes actualicen.
- **Defaults asumidos** (si no respondes):
  - Feature A: Opción A (extender `CurrencyInputDirective`).
  - Feature B: Auditoría mínima (sin migración, solo `updatedBy`).
  - Tipo de gasto: `Gasto` (Caja Mayor).
  - Reportes: Dashboard de Caja Mayor lee movimientos actualizados (sin cache).

---

**Plan creado por:** Agente Planner (Cloud Agent)  
**Fecha:** 2026-09-08  
**Rama:** `cursor/gastos-moneda-editar-143b`  
**SHA del plan:** (commit pendiente)
