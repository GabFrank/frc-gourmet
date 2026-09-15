# Auditoría diff — Deep Links Ops (PR #305) — Eje B (UI / componentes)

**Modelo:** composer-2.5  
**Alcance:** Cambios `.ts/.html` de UI: readonly Gasto/Vale, ruta CompraDetalle, DetallePagoConsolidado, Login `returnUrl`, dedupe de diálogos, hash web/mobile, superficies de edición accidental vía deep link.  
**Branch:** `cursor/plan-deep-links-ops-259f` vs `develop`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/305  
**Ejecutada:** 2026-09-15  
**Auditor:** Cloud Agent (DIFF AUDITOR B — solo lectura del diff)

---

## Veredicto: **BLOCK**

El PR introduce la infraestructura correcta en espíritu (`DeepLinkService`, readonly parcial en Gasto/Vale, dedupe de diálogos), pero **no compila en AOT** y el esquema `#/o/{tipo}/{id}` **no sobrevive** al routing Angular actual, por lo que el flujo principal de deep link (arranque en frío / link de WhatsApp) no puede funcionar. Hay además huecos de solo-lectura y de `returnUrl` que dejan superficies de mutación accesibles desde el enlace.

---

## Resumen ejecutivo

| Criterio | Resultado | Severidad máxima |
|---|---|---|
| Build AOT (`ng build`) | ❌ FAIL | P0 |
| Hash `#/o/...` llega al interceptor | ❌ FAIL | P0 |
| Readonly Gasto (form + adjuntos) | ⚠️ PARCIAL | P1 |
| Readonly Vale (form + carga) | ⚠️ PARCIAL | P1 |
| CompraDetalle vía deep link | ❌ FAIL | P1 |
| DetallePagoConsolidado vía deep link | ⚠️ RIESGO | P1 |
| Login `returnUrl` post-auth | ⚠️ INCOMPLETO | P1 |
| Dedupe de diálogos | ✅ PASS | — |
| Mobile PWA (`projects/mobile`) | ⚠️ SIN CAMBIOS | P2 |

**Hallazgos:** 3 P0, 5 P1, 3 P2.

---

## Archivos UI auditados (diff vs `develop`)

| Archivo | Rol |
|---|---|
| `src/app/services/deep-link.service.ts` | Nuevo — dispatch y dedupe |
| `src/app/app.component.ts` | Interceptor `NavigationEnd` → hash |
| `src/app/auth/login/login.component.ts` | `navigateAfterLogin()` + `returnUrl` |
| `create-edit-gasto-dialog.component.{ts,html}` | Modo `readonly` |
| `create-edit-vale-dialog.component.ts` | Modo `readonly` + `loadVale()` |

*(Handlers/repository tocados en el mismo PR se citan solo cuando impactan la UI.)*

---

## 1. Build AOT — ❌ FAIL (P0)

**Verificación:** `npx ng build --base-href ./` en la rama del PR.

### 1.1 `mat-chip` sin `MatChipsModule`

**Archivos:**
- `create-edit-gasto-dialog.component.html:3`
- `create-edit-vale-dialog.component.ts:41` (template inline)

```
Error NG8001: 'mat-chip' is not a known element
```

Los imports de ambos componentes **no incluyen** `MatChipsModule`. El chip “Solo lectura” rompe la compilación de producción.

### 1.2 `getVale()` en `RepositoryHttpService`

**Archivo:** `src/app/database/repository-http.service.ts:2197-2199`

```typescript
getVale(id: number): Observable<any> {
  return this.callRpc<any>('get-vale', id);
}
```

`callRpc` **no existe** en `RepositoryHttpService` → `TS2339`. El diálogo de vale readonly no compila en modo `client`/web HTTP.

**Conclusión:** el PR no pasa `ng build`. Bloqueante antes de merge.

---

## 2. Hash routing / interceptor — ❌ FAIL (P0)

### 2.1 El wildcard del router destruye el deep link

**Archivo:** `src/app/app-routing.module.ts`

```typescript
const routes: Routes = [
  { path: 'login', loadComponent: () => import('./auth/login/login.component')... },
  { path: '**', redirectTo: '' }  // captura /o/gasto/123
];
// useHash: true
```

Flujo al abrir `https://app.frc-gourmet.com/#/o/gasto/123`:

1. Router interpreta la ruta hash `/o/gasto/123`.
2. No hay ruta registrada → `**` redirige a `''`.
3. El hash final queda en `#/` (deep link **perdido**).
4. `NavigationEnd` en `AppComponent` lee `window.location.hash` ya vacío de `/o/...`.

**Archivo:** `src/app/app.component.ts:762-775`

```typescript
this.router.events
  .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
  .subscribe(() => {
    const hash = window.location.hash;
    const parsed = this.deepLinkService.parseDeepLink(hash);
    if (!parsed) return;
    this.deepLinkService.openDeepLink(parsed.tipo, parsed.id);
  });
```

El interceptor corre **después** de la navegación (incluido el redirect), no antes. El comentario del plan (“el router no las manejará — requiere interceptación manual”) asume que el fragmento sobrevive; con `** → ''` no es cierto.

**Recomendación mínima:** registrar una ruta stub `o/:tipo/:id` (componente vacío o guard que no redirija), **o** leer el hash inicial en `APP_INITIALIZER` / `ngOnInit` de `AppComponent` **antes** de que el wildcard lo pise, **o** cambiar `UrlHandlingStrategy`.

### 2.2 Re-disparo en cada `NavigationEnd`

El hash **no se limpia** tras procesar (comentado a propósito en `app.component.ts:777-780`). Mientras `#/o/gasto/123` permanezca en la URL, **cada** `NavigationEnd` vuelve a invocar `openDeepLink()`.

- Diálogos: mitigado por `openDialogs` Map en `DeepLinkService` ✅
- Tabs compra: `openTab()` reactiva la tab en cada navegación interna ⚠️

### 2.3 Sin chequeo de autenticación en el interceptor

El handler en `ngAfterViewInit` no verifica `isAuthenticated`. Si el hash `/o/...` estuviera presente en pantalla de login, intentaría abrir diálogos/tabs igual (fallaría en backend, pero es UX/seguridad floja).

### 2.4 Mobile PWA

`projects/mobile` **no incluye** `DeepLinkService` ni interceptor equivalente. Los links del plan apuntan a `app.frc-gourmet.com/#/o/...`; la PWA mobile usa su propio router sin rutas `/o/*`. Fuera del diff desktop, pero relevante para el objetivo “link de WhatsApp en móvil”.

---

## 3. Login `returnUrl` — ⚠️ INCOMPLETO (P1)

### 3.1 Implementación en `LoginComponent` — ✅ correcta en aislamiento

**Archivo:** `src/app/auth/login/login.component.ts:236-247`

```typescript
private navigateAfterLogin(): void {
  const returnUrl = this.route.snapshot.queryParams['returnUrl'];
  if (returnUrl) {
    this.router.navigateByUrl(returnUrl);
  } else {
    this.router.navigate(['/']);
  }
}
```

`navigateByUrl` decodifica `%23` → `#` como indica el plan.

### 3.2 `AuthGuard` no aplicado en rutas desktop

**Archivo:** `src/app/app-routing.module.ts` — `AuthGuard` importado pero **no usado** en `routes`. La app protege con `*ngIf="isAuthenticated"` en `app.component.html`, no con guard + `returnUrl`.

Efecto: visita sin sesión a `#/o/gasto/123` → hash se pierde (§2) → login sin `returnUrl` → post-login va a `/` → deep link nunca se abre.

### 3.3 Carrera con `app.component` auth subscription

**Archivo:** `src/app/app.component.ts:338-344`

```typescript
if (!this.isAuthenticated) {
  this.router.navigate(['/login']);
} else if (this.router.url === '/login') {
  this.router.navigate(['/']);  // puede pisar returnUrl si corre después
}
```

`authService.login()` emite `currentUser$` **antes** de que `LoginComponent` llame `navigateAfterLogin()`. En la práctica `navigateAfterLogin()` suele ganar por orden, pero hay navegación redundante a `/` que compite con el `returnUrl`.

---

## 4. CreateEditGasto — modo readonly — ⚠️ PARCIAL (P1)

### 4.1 Lo que sí hace bien ✅

**Archivo:** `create-edit-gasto-dialog.component.ts`

- Lee `data.readonly` en `ngOnInit`.
- `form.disable()` + `detalleForm.disable()` tras cargar lookups.
- Template oculta Guardar, Agregar detalle, Eliminar fila (`*ngIf="!readonly"`).
- `DeepLinkService.openGasto()` pasa `{ gastoId: id, readonly: true }`.

### 4.2 Superficies de edición aún activas ❌

| Superficie | Problema | Archivo |
|---|---|---|
| Adjuntos | `<app-adjuntos-list>` sin `[readonly]="readonly"` — upload y delete siguen visibles | `create-edit-gasto-dialog.component.html:216-222` |
| Autocomplete categoría | `categoriaFilter` es `FormControl` **fuera** del `FormGroup` — `form.disable()` no lo deshabilita | `.html:12-15`, `.ts:68` |
| Autocomplete proveedor | Igual con `proveedorFilter` + botón limpiar | `.html:85-90` |
| Permiso `FINANCIERO_GASTO_VER` | Plan Fase 3 pedía fail-closed en UI; no hay check en el diálogo | — |

Un usuario que abre `#/o/gasto/{id}` puede **subir o borrar comprobantes** aunque el formulario esté deshabilitado.

### 4.3 Regla “sin funciones en template”

El diff no empeora esto; el componente ya usaba `displayCategoria` / `displayProveedor` como callbacks de autocomplete (pre-existente).

---

## 5. CreateEditVale — modo readonly — ⚠️ PARCIAL (P1)

### 5.1 Lo que sí hace bien ✅

- `data.readonly` + `data.valeId`.
- `loadVale()` vía `repositoryService.getVale()` (handler `get-vale` en backend).
- `form.disable()` tras carga.
- Oculta botón submit; label “Cerrar” en cancel.

### 5.2 Gaps vs plan y UX

| Gap | Detalle |
|---|---|
| `mat-chip` sin módulo | Mismo error de compilación que Gasto (P0) |
| Sin chip de **estado** del vale | Plan Fase 4 pedía mostrar CONFIRMADO/SOLICITADO/ANULADO |
| Sin botones contextuales readonly | Plan: Pagar/Anular según permisos en modo ver; no implementado |
| Vale no encontrado | Snackbar pero diálogo queda abierto con form vacío (no cierra) |

---

## 6. CompraDetalle — ruta tab — ❌ FAIL (P1)

### 6.1 Apertura desde `DeepLinkService` — patrón alineado con lista

**Archivo:** `src/app/services/deep-link.service.ts:101-114`

```typescript
this.tabsService.openTab(
  `Compra #${id}`,
  CompraDetalleComponent,
  { compraId: id },
  `detalle-compra-${id}`,
  true,
);
```

Mismo contrato que `ListComprasComponent.verDetalle()`.

### 6.2 `setData()` no dispara `load()` — bug de ciclo de vida

**Archivo:** `src/app/pages/compras/compra-detalle/compra-detalle.component.ts`

```typescript
ngOnInit(): void {
  if (this.compraId) this.load();
}

setData(d: any): void {
  if (d?.compraId) this.compraId = d.compraId;
  // falta: this.load();
}
```

**Archivo:** `src/app/components/tab-container/tab-content.component.ts:45-52`

`createComponent()` ejecuta `ngOnInit` del hijo **antes** de `setData()`. Al abrir la tab, `compraId` sigue `undefined` en `ngOnInit`; `setData` asigna el id pero **no recarga**.

Contraste con el patrón correcto del repo:

```typescript
// cuenta-por-pagar-detalle.component.ts
setData(data: any): void {
  this.cuentaPorPagarId = data?.cuentaPorPagarId || null;
  if (this.cuentaPorPagarId) this.loadData();
}
```

**Impacto deep link:** tab “Compra #N” vacía hasta que el usuario pulse Refrescar. Bug pre-existente en navegación normal, pero **bloquea el caso de uso principal** del deep link de compra.

### 6.3 Superficie de mutación — Anular

**Archivo:** `compra-detalle.component.html:21-24`

```html
<button ... *appHasPermission="'COMPRAS_GESTIONAR'" (click)="anular()">
```

No es formulario editable, pero **sí permite anular** desde deep link si el usuario tiene `COMPRAS_GESTIONAR`. El plan no exigía readonly estricto para compra (solo tab de detalle); documentar como decisión consciente o endurecer con flag `readonly` en `data`.

### 6.4 Dedupe de tabs

`TabsService.addTab()` deduplica por **título** (`Compra #${id}`), no por `id` de tab. Funciona para el caso nominal. Preferible `openTabWithData()` para refrescar `data` si la tab ya existía vacía.

---

## 7. DetallePagoConsolidado — ❌ RIESGO (P1)

### 7.1 Apertura desde deep link

**Archivo:** `deep-link.service.ts:168-187`

```typescript
this.dialog.open(DetallePagoConsolidadoDialogComponent, {
  width: '760px',
  maxWidth: '95vw',
  data: { pagoId: id },
});
```

Mismo `data` que `CajaMayorDetalleComponent.verDetallePagoConsolidado()` — sin flag readonly.

### 7.2 Botón Anular siempre visible

**Archivo:** `detalle-pago-consolidado-dialog.component.html:68-70`

```html
<button mat-flat-button color="warn" *ngIf="!estaAnulado" (click)="anular()">
```

- Sin `*appHasPermission`.
- Sin `data.readonly`.
- `anular()` llama `repo.anularPagoConsolidado()` — backend sí tiene `ensurePermission`, pero la UI expone mutación a cualquiera que abra el deep link y vea el detalle.

**Conclusión:** deep link de pago es **vista + anulación** desde el mismo diálogo; inconsistente con Gasto/Vale readonly.

---

## 8. Dedupe de diálogos — ✅ PASS

**Archivo:** `deep-link.service.ts:24-25, 120-126, 195-208`

```typescript
private openDialogs = new Map<string, MatDialogRef<any>>();

if (this.isDialogOpen(dialogKey)) return;
// ...
protected registerDialog(key: string, ref: MatDialogRef<any>): void {
  this.openDialogs.set(key, ref);
  ref.afterClosed().subscribe(() => this.openDialogs.delete(key));
}
```

- Claves `gasto-${id}`, `vale-${id}`, `pago-${id}`.
- Limpieza en `afterClosed`.
- Patrón correcto para evitar doble `MatDialog.open` en clicks rápidos o re-`NavigationEnd`.

**Nota menor (P2):** no trae el diálogo al frente si ya está abierto (solo no-op).

---

## 9. `DeepLinkService` — diseño general — ✅ PASS con reservas

| Aspecto | Evaluación |
|---|---|
| `parseDeepLink()` regex `^/o/([^/]+)/(\d+)$` | ✅ Alineado al plan |
| Lazy imports de componentes | ✅ Reduce bundle inicial |
| Switch por tipo | ✅ Extensible |
| Snackbar en errores | ✅ |
| `openCompra` sin await real | ⚠️ OK (sync tab open) |
| Import `Type` sin uso | P2 lint |

---

## 10. Matriz de superficies de edición vía deep link

| Tipo | Destino | Form editable | Adjuntos / extra | Mutación crítica |
|---|---|---|---|---|
| `gasto` | Dialog readonly | ❌ deshabilitado | ⚠️ adjuntos editables | — |
| `vale` | Dialog readonly | ❌ deshabilitado | — | — |
| `compra` | Tab detalle | N/A (no form) | — | ⚠️ Anular si `COMPRAS_GESTIONAR` |
| `pago` | Dialog detalle | N/A | — | ❌ Anular sin guard UI |

---

## Recomendaciones priorizadas (sin implementar — solo auditoría)

### P0 — bloqueantes

1. Importar `MatChipsModule` en Gasto y Vale (o quitar `mat-chip` y usar texto/badge CSS).
2. Corregir `RepositoryHttpService.getVale()` (método RPC existente en la clase, no `callRpc` inexistente).
3. Evitar que `** → ''` borre `#/o/...` antes del interceptor (ruta stub o lectura temprana del hash).

### P1 — antes de considerar listo

4. `CompraDetalleComponent.setData()` → llamar `this.load()` cuando `compraId` cambie.
5. Gasto readonly: `[readonly]="readonly"` en `app-adjuntos-list`; deshabilitar `categoriaFilter` / `proveedorFilter`.
6. Pago consolidado: `data.readonly` + ocultar Anular en deep link, o `*appHasPermission` alineado al backend.
7. Cablear `returnUrl` en flujo sin sesión (guard o redirect explícito en `app.component` preservando hash).
8. Interceptor: `if (!this.isAuthenticated) return;` + opcional limpiar hash tras procesar.

### P2 — mejoras

9. Vale readonly: chip de estado + acciones contextuales del plan.
10. `openTabWithData` para compra; `router.events` unsubscribe en `ngOnDestroy`.
11. Evaluar paridad mobile o documentar que deep links desktop viven en `/admin`.

---

## Checklist de pruebas manuales (post-fix)

- [ ] `ng build` sin errores en la rama.
- [ ] Arranque en frío: `/#/o/gasto/{id}` con sesión → dialog readonly, adjuntos no editables.
- [ ] Arranque sin sesión → login con `returnUrl` → post-login abre el recurso.
- [ ] `/#/o/compra/{id}` → tab con datos cargados (sin pulsar Refrescar).
- [ ] `/#/o/pago/{id}` → detalle sin botón Anular (o con permiso explícito).
- [ ] Doble click / doble navegación → un solo dialog.
- [ ] Navegar internamente con hash persistente → no spam de aperturas.

---

## Conclusión

El eje UI del PR va en la dirección correcta (servicio centralizado, readonly en Gasto/Vale, dedupe de diálogos, lazy load), pero **no está mergeable** en el estado actual: falla compilación AOT, el hash operativo no llega al interceptor, CompraDetalle no carga datos al abrir por tab, y quedan huecos de mutación (adjuntos de gasto, anular pago) en el camino deep link.

**Veredicto final: BLOCK** — corregir P0 y P1 de UI antes de merge.

---

*Auditoría de diff únicamente. No se implementaron cambios de código ni se fusionó la rama.*
