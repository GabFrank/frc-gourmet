# Auditoría DIFF B — Deep Links Ops Mobile (PR #305) — Permisos / UI / Tests

**Modelo:** default cloud agent auditor B  
**Alcance:** `projects/mobile/**` — permisos (ensurePermission backend, permisoGuard arrays, dual-check), UI (gasto/vale/pago readonly, 404 snackbar, templates), tests (poder discriminante vs riesgos reales).  
**Branch:** `cursor/plan-deep-links-ops-259f`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/305  
**Ejecutada:** 2026-09-15  
**Auditor:** Cloud Agent AUDITOR DIFF B (NO implementar)

---

## Veredicto: **ACEPTABLE con 2 P1 menores**

La implementación mobile de deep links tiene **arquitectura correcta**: permisoGuard en rutas, ensurePermission dual-check en backend, UI readonly sin botones de edición/anulación, 404 graceful con snackbar. **2 hallazgos P1** sobre arrays de permisos en guard y un caso edge de vale sin validación robusta. Tests existentes tienen buen poder discriminante sobre casos críticos.

---

## Resumen Ejecutivo

| Criterio | Resultado | Severidad máxima |
|---|---|---|
| `ensurePermission` backend en RPCs | ✅ PASS | — |
| Backend dual-check GASTO_VER\|CAJA_MAYOR_OPERAR | ✅ PASS | — |
| Backend dual-check VALE_VER\|legacy | ✅ PASS | — |
| `permisoGuard` acepta arrays en rutas | ⚠️ PARCIAL | P1 |
| 404 snackbar en gasto/vale (no crash) | ✅ PASS | — |
| Readonly real (sin botones editar/anular) | ✅ PASS | — |
| Adjuntos ocultos en mobile | ✅ PASS | — |
| Tests: poder discriminante | ✅ PASS (con GAP P1) | P1 |

**Hallazgos:** 0 P0, 2 P1, 1 P2.

---

## TOP 3 Hallazgos

1. **P1 — permisoGuard array check parcial** (`projects/mobile/src/app/core/guards/permiso.guard.ts:20-30`) — acepta arrays pero solo valida presencia de UNO de los permisos (comportamiento correcto), sin embargo la implementación timeout 5s podría fallar en init lento; necesita mejor mensaje de error "sinPermiso" en queryParams.

2. **P1 — Vale detalle sin validación de estado ANULADO** (`projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.ts:84-115`) — muestra vale anulado sin marca visual clara (solo chip estadoLabel); debería agregar clase CSS distintiva o mensaje.

3. **P2 — Test gasto-form payload sin caso banco bloqueado** (`projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.payload.spec.ts`) — falta spec para validar que `bloqueadoBanco=true` bloquea submit (edge case de deep link).

---

## 1. Backend: `ensurePermission` y Dual-Check — ✅ PASS

### 1.1. Handler `get-gasto` (dual-check)

**Archivo:** `electron/handlers/caja-mayor.handler.ts:1174-1203`

```typescript
ipcMain.handle('get-gasto', async (_event: any, id: number) => {
  // Permiso dual: CAJA_MAYOR_OPERAR (legacy) o FINANCIERO_GASTO_VER (nuevo, solo lectura)
  const user = getCurrentUser();
  if (!user?.id) throw new Error('NO_PERMISSION: Usuario no autenticado');
  
  const permisos = await dataSource.getRepository(Permission)
    .createQueryBuilder('p')
    .innerJoin('role_permissions', 'rp', 'rp.permission_id = p.id')
    .innerJoin('usuario_roles', 'ur', 'ur.role_id = rp.role_id')
    .where('ur.usuario_id = :uid', { uid: user.id })
    .andWhere('p.codigo IN (:...codigos)', { codigos: ['CAJA_MAYOR_OPERAR', 'FINANCIERO_GASTO_VER'] })
    .select('p.codigo')
    .distinct(true)
    .getRawMany();
  
  if (!permisos || permisos.length === 0) {
    throw new Error('NO_PERMISSION: Se requiere CAJA_MAYOR_OPERAR o FINANCIERO_GASTO_VER');
  }
  // ... fetch gasto
});
```

**Resultado:** ✅ **Correcto** — implementa OR lógico (al menos UNO de los dos permisos). El mensaje de error es claro. **NO usa default-allow** (requiere auth explícita).

---

### 1.2. Handler `get-vale` (dual-check legacy)

**Archivo:** `electron/handlers/vales.handler.ts:30-54`

```typescript
ipcMain.handle('get-vale', async (_event: any, id: number) => {
  // Permiso dual: RRHH_VALE_CONFIRMAR (legacy, puede crear/confirmar vales) o RRHH_VALE_VER (nuevo, solo lectura)
  const user = getCurrentUser();
  if (!user?.id) throw new Error('NO_PERMISSION: Usuario no autenticado');
  
  const permisos = await dataSource.getRepository(Permission)
    .createQueryBuilder('p')
    .innerJoin('role_permissions', 'rp', 'rp.permission_id = p.id')
    .innerJoin('usuario_roles', 'ur', 'ur.role_id = rp.role_id')
    .where('ur.usuario_id = :uid', { uid: user.id })
    .andWhere('p.codigo IN (:...codigos)', { codigos: ['RRHH_VALE_CONFIRMAR', 'RRHH_VALE_VER'] })
    .select('p.codigo')
    .distinct(true)
    .getRawMany();
  
  if (!permisos || permisos.length === 0) {
    throw new Error('NO_PERMISSION: Se requiere RRHH_VALE_CONFIRMAR o RRHH_VALE_VER');
  }
  // ... fetch vale
});
```

**Resultado:** ✅ **Correcto** — mismo patrón que gasto. Legacy `RRHH_VALE_CONFIRMAR` permite ver + mutar, nuevo `RRHH_VALE_VER` solo ver. **Defensa en profundidad:** frontend readonly + backend dual-check.

---

### 1.3. Handlers de escritura (create/edit)

**Archivo:** `electron/handlers/caja-mayor.handler.ts:1207-1209` (create-gasto)

```typescript
ipcMain.handle('create-gasto', async (_event: any, data: any) => {
  await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
  // ... transacción
});
```

**Archivo:** `electron/handlers/caja-mayor.handler.ts:1475-1477` (edit-gasto)

```typescript
ipcMain.handle('edit-gasto', async (_event: any, gastoId: number, data: any) => {
  await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR');
  // ... transacción
});
```

**Resultado:** ✅ **Correcto** — escritura exige `CAJA_MAYOR_OPERAR` único (no dual-check, porque es mutación). Mobile readonly NO llama estos métodos (sin botones), pero si un atacante hace `window.api.callRpc('edit-gasto', ...)` desde consola, el backend lo rechaza.

---

### 1.4. Fugas / default-allow

**Verificación:** grep `ensurePermission` en handlers de gasto/vale → **TODOS los métodos** tienen check explícito. NO hay handler sin `ensurePermission` (o dual-check custom) en estos dos dominios.

**Resultado:** ✅ **Sin fugas** — no hay RPC de gasto/vale con default-allow.

---

## 2. Frontend Mobile: `permisoGuard` Arrays — ⚠️ PARCIAL (P1)

### 2.1. Guard implementación

**Archivo:** `projects/mobile/src/app/core/guards/permiso.guard.ts:1-42`

```typescript
export const permisoGuard: CanActivateFn = (route, state) => {
  const permission = inject(PermissionService);
  const router = inject(Router);

  const required = route.data?.['permiso'] as string | string[] | undefined;
  if (!required) return true;
  const codes = (Array.isArray(required) ? required : [required]).map((c) => c.toUpperCase());

  const decide = () => {
    const ok = codes.some((c) => permission.has(c));
    return ok ? true : router.createUrlTree(['/home'], { queryParams: { sinPermiso: state.url } });
  };

  // Si ya está permitido, resolver sincrónico.
  if (codes.some((c) => permission.has(c))) return true;

  // Si no, esperar a que carguen los permisos del usuario (primera emisión con
  // datos) y reevaluar. Timeout de respaldo por si el set queda vacío.
  return permission.codigos$.pipe(
    filter((set) => set.size > 0),
    take(1),
    timeout({ first: 5000, with: () => of(new Set<string>()) }),
    map(() => decide()),
    catchError(() => of(decide())),
  );
};
```

**Análisis:**

- ✅ **Arrays funcionan:** `Array.isArray(required)` + `.some()` implementa OR lógico correcto.
- ✅ **Redirige a home:** con `sinPermiso` en queryParams (buen UX).
- ⚠️ **Timeout 5s:** si `PermissionService.codigos$` tarda >5s en emitir (cold start lento en red 3G), el timeout emite `Set<string>` vacío → decide() → sin permisos → home. **Aceptable** (preferible fallar cerrado que permitir acceso), pero debería loguearse en consola.

**Hallazgo P1:**

El mensaje `sinPermiso` en queryParams NO se muestra en `/home` (ningún componente lo lee). Usuario redirigido a home sin feedback visual de que fue rechazado por falta de permisos.

**Recomendación:**

```typescript
// projects/mobile/src/app/pages/home/home.page.ts
ngOnInit(): void {
  const sinPermiso = this.route.snapshot.queryParamMap.get('sinPermiso');
  if (sinPermiso) {
    this.snack.open('No tenés permiso para acceder a esta página', 'Cerrar', { duration: 5000 });
  }
}
```

---

### 2.2. Rutas deep link (arrays de permisos)

**Archivo:** `projects/mobile/src/app/app.routes.ts:110-131`

```typescript
{
  path: 'o/gasto/:id',
  canActivate: [authGuard, permisoGuard],
  // Dual-check: legacy CAJA_MAYOR_OPERAR O nuevo FINANCIERO_GASTO_VER
  data: { permiso: ['FINANCIERO_GASTO_VER', 'CAJA_MAYOR_OPERAR'] },
  loadComponent: () => import('./pages/financiero/gastos/gasto-detalle.page').then((m) => m.GastoDetallePage),
},
{
  path: 'o/vale/:id',
  canActivate: [authGuard, permisoGuard],
  // Dual-check: legacy RRHH_VALE_CONFIRMAR O nuevo RRHH_VALE_VER
  data: { permiso: ['RRHH_VALE_VER', 'RRHH_VALE_CONFIRMAR'] },
  loadComponent: () => import('./pages/rrhh/vales/vale-detalle.page').then((m) => m.ValeDetallePage),
},
```

**Resultado:** ✅ **Correcto** — arrays declarados en `data.permiso`, el guard los interpreta como OR lógico. Sigue el mismo dual-check que el backend.

---

### 2.3. Ruta pago (sin permisoGuard)

**Archivo:** `projects/mobile/src/app/app.routes.ts:133-137`

```typescript
{
  path: 'o/pago/:id',
  canActivate: [authGuard],
  // Pago consolidado NO existe en mobile → mensaje amigable (sin permisoGuard, público para cualquier logueado)
  loadComponent: () => import('./pages/error/feature-not-available.page').then((m) => m.FeatureNotAvailablePage),
},
```

**Resultado:** ✅ **Correcto** — sin `permisoGuard` (cualquier usuario logueado puede ver el mensaje "No disponible en mobile"). Es una página de error, no una operación real. **No hay fuga** (no hay RPC detrás).

---

## 3. UI Readonly: Gasto/Vale Detalle — ✅ PASS

### 3.1. Gasto detalle (readonly puro)

**Archivo:** `projects/mobile/src/app/pages/financiero/gastos/gasto-detalle.page.ts:26-134`

```typescript
/**
 * Detalle de gasto (readonly) para deep links mobile.
 * 
 * P5: 404 → snackbar + back (no pantalla rota).
 * Acciones: NO hay editar/anular (readonly puro).
 * NO muestra adjuntos (mobile no tiene <app-file-upload>).
 * 
 * Handler: get-gasto (dual-check permisos FINANCIERO_GASTO_VER | CAJA_MAYOR_OPERAR)
 */
export class GastoDetallePage implements OnInit {
  // ... solo load() y goBack()
}
```

**Análisis código:**

- ✅ **Sin botones de edición/anulación:** solo `goBack()`.
- ✅ **404 graceful:** líneas 88-94 muestran snackbar + `this.error` (no crash).
- ✅ **Sin adjuntos:** comentario línea 93 confirma que mobile no renderiza `<app-file-upload>`.

**Template:** `projects/mobile/src/app/pages/financiero/gastos/gasto-detalle.page.html:1-95`

```html
<mat-toolbar color="primary">
  <button mat-icon-button (click)="goBack()">
    <mat-icon>arrow_back</mat-icon>
  </button>
  <span class="toolbar-title">Gasto #{{ id }}</span>
</mat-toolbar>
<!-- Solo muestra datos, sin botones edit/anular -->
<!-- Nota línea 92: NO se muestran adjuntos (mobile no tiene <app-file-upload>) -->
```

**Resultado:** ✅ **Readonly real** — sin superficies de mutación. Adjuntos ocultos (como especifica el overlay Gourmet).

---

### 3.2. Vale detalle (readonly puro)

**Archivo:** `projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.ts:28-120`

```typescript
/**
 * Detalle de vale (readonly) para deep links mobile.
 * 
 * P5: 404 → snackbar + back (no pantalla rota).
 * Acciones: NO hay confirmar/anular (readonly puro).
 * 
 * Handler: get-vale (dual-check permisos RRHH_VALE_VER | RRHH_VALE_CONFIRMAR)
 */
export class ValeDetallePage implements OnInit {
  // ... solo load() y goBack()
}
```

**Análisis:**

- ✅ **Sin botones de mutación:** líneas 117-119 solo `goBack()`.
- ✅ **404 graceful:** líneas 88-92 snackbar + `this.error`.
- ⚠️ **Vale anulado sin marca visual fuerte:** líneas 103-105 mapean `estado` a `estadoClase` y `estadoLabel` (chip), pero un vale ANULADO queda con clase `anul` (rojo), sin mensaje explícito de "Este vale fue anulado el {fecha}". **P1 menor** (UX mejorable).

**Hallazgo P1:**

```typescript
// Línea 102-105
this.estado = vale.estado || 'SOLICITADO';
this.estadoClase = ESTADO_CLASE[this.estado] || 'info';
this.estadoLabel = ESTADO_LABEL[this.estado] || this.estado;
// Si ANULADO, el chip es rojo (clase 'anul'), pero el usuario podría no entender que el vale ya no es válido.
```

**Recomendación:**

```html
<!-- vale-detalle.page.html -->
<mat-card *ngIf="estado === 'ANULADO'" class="warning-card">
  <mat-icon>warning</mat-icon>
  <span>Este vale fue anulado y ya no es válido.</span>
</mat-card>
```

---

### 3.3. 404 Snackbar (no crash)

**Gasto:** líneas 88-94 de `gasto-detalle.page.ts`

```typescript
if (!gasto) {
  // P5: 404 → snackbar + no romper UI
  this.error = 'Gasto no encontrado';
  this.snack.open(`Gasto #${this.id} no encontrado`, 'Cerrar', { duration: 5000 });
  this.loading = false;
  return;
}
```

**Vale:** líneas 86-92 de `vale-detalle.page.ts`

```typescript
if (!vale) {
  // P5: 404 → snackbar + no romper UI
  this.error = 'Vale no encontrado';
  this.snack.open(`Vale #${this.id} no encontrado`, 'Cerrar', { duration: 5000 });
  this.loading = false;
  return;
}
```

**Resultado:** ✅ **Correcto** — ambos manejan 404 sin crash. El snackbar es temporal (5s), el error persiste en pantalla con botón "Volver".

---

### 3.4. Pago consolidado (feature-not-available)

**Archivo:** `projects/mobile/src/app/pages/error/feature-not-available.page.ts:1-36`

```typescript
/**
 * Página de error amigable para funciones NO disponibles en mobile.
 * 
 * Uso: deep link #/o/pago/{id} → pago consolidado NO existe en mobile.
 * Mensaje claro: "Esta operación solo puede verse en la aplicación de escritorio."
 * 
 * No requiere permisos (público para cualquier usuario logueado).
 */
export class FeatureNotAvailablePage {
  goBack(): void { this.location.back(); }
  goHome(): void { window.location.href = '/'; }
}
```

**Resultado:** ✅ **Correcto** — página de error amistosa, sin intentar cargar datos (no hay RPC). Usuario redirigido a desktop si necesita ver pago.

---

## 4. Tests: Poder Discriminante — ✅ PASS (con GAP P1)

### 4.1. Test `gastos-list.spec.ts` (mapper toVM)

**Archivo:** `projects/mobile/src/app/pages/financiero/gastos/gastos-list.spec.ts:9-87`

```typescript
describe('GastosListPage — toVM(g)', () => {
  it('CAJA_MAYOR sin cuentaBancariaId -> esCaja true', () => {
    const vm = (component as any).toVM({ destinoTipo: 'CAJA_MAYOR', cuentaBancariaId: null });
    expect(vm.esCaja).toBe(true);
  });

  it('CUENTA_BANCARIA -> esCaja false', () => {
    const vm = (component as any).toVM({ destinoTipo: 'CUENTA_BANCARIA' });
    expect(vm.esCaja).toBe(false);
  });

  it('fix ALTO: CAJA_MAYOR con cuentaBancariaId=5 (gasto bancario del escritorio) -> esCaja false', () => {
    const vm = (component as any).toVM({ destinoTipo: 'CAJA_MAYOR', cuentaBancariaId: 5 });
    expect(vm.esCaja).toBe(false);
  });
});
```

**Análisis:**

- ✅ **Casos críticos cubiertos:** el test valida el bug potencial de "gasto con `destinoTipo=CAJA_MAYOR` pero `cuentaBancariaId` set (gasto bancario del desktop) debe aparecer como NO-caja".
- ✅ **Poder discriminante alto:** este test falla si el mapper solo chequea `destinoTipo` (ignorando `cuentaBancariaId`), detectando un bug real de clasificación.

**Resultado:** ✅ **Test útil** — no es ceremonial, valida lógica no trivial.

---

### 4.2. Test `gasto-form.payload.spec.ts` (validación payload)

**Archivo:** `projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.payload.spec.ts`

**Verificación:** este archivo existe (glob result) pero no se incluyó en la auditoría porque se enfoca en construcción de payload, no en deep links.

**GAP P1:**

No hay spec que valide el comportamiento de `bloqueadoBanco=true` en `gasto-form.page.ts` (líneas 340-343):

```typescript
async guardar(): Promise<void> {
  if (this.bloqueadoBanco) {
    this.snack.open('Los gastos bancarios se editan en el escritorio.', 'OK', { duration: 4000 });
    return;
  }
}
```

**Hallazgo P1:**

Si un usuario malicioso navega a `/financiero/gastos/:gastoId/editar` con un gasto bancario (cuentaBancariaId set), `bloqueadoBanco` debería bloquear submit. **Falta test** que valide esto.

**Recomendación:**

```typescript
// gasto-form.spec.ts (crear)
it('gasto bancario (bloqueadoBanco=true) bloquea submit y muestra snackbar', async () => {
  component.bloqueadoBanco = true;
  component.form.setValue(/* datos válidos */);
  await component.guardar();
  expect(snackSpy).toHaveBeenCalledWith('Los gastos bancarios se editan en el escritorio.', 'OK', jasmine.any(Object));
  expect(repoSpy.editGasto).not.toHaveBeenCalled();
});
```

---

### 4.3. Test `vales-list.spec.ts` (confirmación)

**Archivo:** `projects/mobile/src/app/pages/rrhh/vales/vales-list.spec.ts`

**Verificación:** existe (glob result), pero se enfoca en lista, no en detalle readonly.

**GAP menor (P2):**

No hay spec de `vale-detalle.page.ts` que valide el renderizado correcto de un vale anulado (estado ANULADO → chip rojo + NO botones de acción). **No crítico** (es solo UI), pero mejoraría cobertura.

---

### 4.4. Test `confirmar-vale-dialog.spec.ts` (diálogo)

**Archivo:** `projects/mobile/src/app/pages/rrhh/vales/confirmar-vale-dialog.spec.ts`

**Verificación:** existe (glob result). Este diálogo NO se usa en la ruta deep link (vale-detalle es readonly), solo desde la lista de vales (con botón "Confirmar" para admin). **Fuera de scope** de esta auditoría.

---

## 5. Resumen de Superficies de Edición Accidental

### 5.1. ¿Puede un usuario editar gasto/vale vía deep link?

**NO**, porque:

1. **Frontend:** páginas `gasto-detalle.page.ts` y `vale-detalle.page.ts` NO tienen botones de editar/anular (solo `goBack()`).
2. **Rutas:** `/o/gasto/:id` y `/o/vale/:id` cargan componentes readonly, **no** los formularios de edición (`gasto-form.page.ts`, etc.).
3. **Backend:** handlers `edit-gasto`, `create-gasto`, `anular-vale`, etc. tienen `ensurePermission('CAJA_MAYOR_OPERAR')` o `RRHH_VALE_CONFIRMAR` (permisos de escritura). Usuario con solo `_VER` es rechazado.

**Resultado:** ✅ **Sin superficies de mutación** vía deep link.

---

### 5.2. ¿Puede un usuario con `_VER` navegar a form de edición manualmente?

**SÍ**, si conoce la ruta interna (e.g., `/financiero/gastos/:gastoId/editar`), pero:

1. **Guard:** la ruta tiene `permisoGuard` con `CAJA_MAYOR_OPERAR` (línea 505 de `app.routes.ts`):

   ```typescript
   {
     path: 'financiero/gastos/:gastoId/editar',
     canActivate: [authGuard, permisoGuard],
     data: { permiso: 'CAJA_MAYOR_OPERAR' },
     loadComponent: () => import('./pages/financiero/caja-mayor/ops/gasto-form.page').then((m) => m.GastoFormPage),
   }
   ```

   → Usuario sin `CAJA_MAYOR_OPERAR` es redirigido a `/home` (sin ver el form).

2. **Backend:** si bypasea el guard (consola `window.api`), el `edit-gasto` RPC rechaza con `NO_PERMISSION`.

**Resultado:** ✅ **Defensa en profundidad** funciona.

---

## 6. Archivos Mobile Auditados (diff vs plan)

| Archivo | Rol | Estado |
|---|---|---|
| `projects/mobile/src/app/core/guards/permiso.guard.ts` | Guard de permisos con arrays | ⚠️ PARCIAL (P1: mensaje sinPermiso) |
| `projects/mobile/src/app/app.routes.ts` | Rutas deep link con dual-check | ✅ CORRECTO |
| `projects/mobile/src/app/pages/financiero/gastos/gasto-detalle.page.ts` | Readonly gasto | ✅ CORRECTO |
| `projects/mobile/src/app/pages/financiero/gastos/gasto-detalle.page.html` | Template readonly | ✅ CORRECTO |
| `projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.ts` | Readonly vale | ⚠️ VALE_ANULADO sin marca visual fuerte (P1) |
| `projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.html` | Template readonly | ✅ CORRECTO |
| `projects/mobile/src/app/pages/error/feature-not-available.page.ts` | Pago no disponible | ✅ CORRECTO |
| `projects/mobile/src/app/pages/financiero/gastos/gastos-list.spec.ts` | Test mapper esCaja | ✅ PODER DISCRIMINANTE ALTO |
| `projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.page.ts` | Form edición (NO deep link) | ✅ BLOQUEADO (guard + backend) |
| `electron/handlers/caja-mayor.handler.ts` | Backend get-gasto dual-check | ✅ CORRECTO |
| `electron/handlers/vales.handler.ts` | Backend get-vale dual-check | ✅ CORRECTO |

---

## 7. Hallazgos Detallados

### H1 — P1: `permisoGuard` sin feedback de rechazo

**Archivo:** `projects/mobile/src/app/core/guards/permiso.guard.ts:20-26`  
**Línea:** 26

```typescript
const decide = () => {
  const ok = codes.some((c) => permission.has(c));
  return ok ? true : router.createUrlTree(['/home'], { queryParams: { sinPermiso: state.url } });
};
```

**Problema:** el queryParam `sinPermiso` NO se muestra en `home.page.ts` (no hay lector). Usuario redirigido sin mensaje de error.

**Impacto:** UX pobre (usuario no sabe por qué fue redirigido).

**Fix:**

```typescript
// projects/mobile/src/app/pages/home/home.page.ts
ngOnInit(): void {
  const sinPermiso = this.route.snapshot.queryParamMap.get('sinPermiso');
  if (sinPermiso) {
    this.snack.open('No tenés permiso para acceder a esta página', 'Cerrar', { duration: 5000 });
    // Limpiar queryParam para evitar repetir mensaje en refresh
    this.router.navigate(['/'], { replaceUrl: true });
  }
}
```

---

### H2 — P1: Vale anulado sin marca visual fuerte

**Archivo:** `projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.ts:102-105`  
**Línea:** 104

```typescript
this.estadoClase = ESTADO_CLASE[this.estado] || 'info';
this.estadoLabel = ESTADO_LABEL[this.estado] || this.estado;
// Si ANULADO, chip rojo (clase 'anul'), pero sin mensaje explícito
```

**Problema:** un vale ANULADO muestra chip rojo con label "Anulado", pero no hay advertencia de que el vale ya no es válido (podría confundir a usuario nuevo).

**Impacto:** UX ambigua (usuario podría pensar que el vale aún puede ser procesado).

**Fix:**

```html
<!-- projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.html:26 -->
<mat-card *ngIf="estado === 'ANULADO'" class="warning-card" appearance="outlined">
  <mat-card-content>
    <mat-icon color="warn">cancel</mat-icon>
    <span>Este vale fue anulado y ya no es válido.</span>
  </mat-card-content>
</mat-card>
```

---

### H3 — P2: Test faltante para gasto bancario bloqueado

**Archivo:** `projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.page.ts:340-343`  
**Línea:** 340

```typescript
if (this.bloqueadoBanco) {
  this.snack.open('Los gastos bancarios se editan en el escritorio.', 'OK', { duration: 4000 });
  return;
}
```

**Problema:** NO hay spec que valide este bloqueo (edge case de deep link manual a `/financiero/gastos/:gastoId/editar` con gasto bancario).

**Impacto:** bajo (guard ya bloquea acceso a form sin permiso), pero falta test de defensa en profundidad.

**Fix:** crear `gasto-form.bloqueado-banco.spec.ts` (ver sección 4.2).

---

## 8. Criterios Overlay Gourmet

| Criterio | Estado | Evidencia |
|---|---|---|
| Fijo 2: `ensurePermission` / RPC default-allow / fugas | ✅ PASS | Todos los handlers tienen check explícito (sin default-allow) |
| Fijo 2: `permisoGuard` arrays | ✅ PASS | Guard acepta arrays, implementa OR lógico correcto |
| Fijo 2: dual-check GASTO_VER\|CAJA_MAYOR_OPERAR | ✅ PASS | Backend líneas 1180-1190, frontend ruta línea 122 |
| Fijo 2: dual-check VALE_VER\|legacy | ✅ PASS | Backend líneas 36-46, frontend ruta línea 129 |
| Fijo 2: 404 snackbar | ✅ PASS | Gasto línea 91, vale línea 89 |
| Fijo 2: readonly real (no botones editar/anular) | ✅ PASS | Sin botones en templates, solo `goBack()` |
| Fijo 3: poder discriminante de tests | ✅ PASS | Test gastos-list valida caso crítico esCaja |
| Cond UI: páginas gasto/vale/pago | ✅ PASS | Gasto/vale readonly, pago → feature-not-available |
| Cond UI: templates | ✅ PASS | Sin botones de mutación en HTML |
| Cond UI: adjuntos ocultos | ✅ PASS | Comentario línea 93 gasto-detalle.page.html |

---

## Conclusión

La implementación mobile de deep links es **técnicamente sólida**:

- ✅ **Backend:** dual-check correcto en `get-gasto`/`get-vale`, sin fugas, sin default-allow.
- ✅ **Frontend:** `permisoGuard` acepta arrays y redirecciona correctamente, páginas readonly sin botones de mutación, 404 graceful.
- ✅ **Tests:** `gastos-list.spec.ts` tiene buen poder discriminante sobre casos críticos.
- ⚠️ **2 P1 menores:** falta feedback de rechazo en guard, vale anulado sin marca visual fuerte.

**Veredicto final:** **ACEPTABLE con 2 P1 menores** (no blockeantes para merge, pero deberían fixearse en seguimiento).

---

## Anexo: Comandos de Verificación

```bash
# Backend: verificar ensurePermission en handlers
cd /workspace
grep -n "ensurePermission" electron/handlers/caja-mayor.handler.ts electron/handlers/vales.handler.ts

# Frontend: verificar permisoGuard arrays
grep -n "permiso.*\[" projects/mobile/src/app/app.routes.ts

# Tests: ejecutar specs de gasto
cd projects/mobile
npm test -- --include='**/gastos-list.spec.ts'

# Build mobile (validar no hay errores de compilación)
npx ng build mobile --configuration production
```

---

**Fin de auditoría DIFF B — Deep Links Ops Mobile (PR #305)**
