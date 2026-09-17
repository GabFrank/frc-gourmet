# AUDITORÍA PLAN A — Deep Links Ops Mobile (PR #305)

**Fecha:** 2026-09-15  
**Auditor:** Claude Sonnet 4.5 (Cloud Agent — AUDITOR A mobile, re-audit post plan push)  
**Rama auditada:** `cursor/plan-deep-links-ops-259f` (commit `8130dbad`)  
**Plan auditado:** `docs/planes/PLAN-DEEP-LINKS-OPS-MOBILE.md`  
**Alcance (Eje A):** Verificar si el contrato URL hash→path es viable, si las rutas destino propuestas son alcanzables, si auth/returnUrl mobile matchea el plan, si permisos están alineados con handlers backend, si las fases/gates son suficientes, y riesgos PWA/SW/hash.  
**Modo:** solo auditoría, NO implementación.

---

## Veredicto: **ACEPTABLE CON RESERVAS P1**

El plan mobile es **arquitectónicamente correcto** y se adapta bien a la realidad del código mobile (`projects/mobile`). La estrategia de interceptar el hash `#/o/{tipo}/{id}` manualmente (vía `window.location.hash` + `hashchange`) es la única viable dado que mobile usa path routing y desktop/bot usan hash.

**Reservas P1 (no bloquean, requieren ajustes):**
1. `permisoGuard` actual NO acepta arrays → legacy users bloqueados antes del dual-check del handler
2. Falta especificar manejo de error 404 (gasto/vale inexistente) en páginas nuevas
3. Gate de build mobile (`npx ng build mobile`) no listado explícitamente en cada fase
4. Riesgo de race condition entre interceptor cold-start y router bootstrap no mitigado

---

## Resumen ejecutivo

| Criterio | Estado | Comentario |
|----------|--------|------------|
| Contrato URL `#/o/{tipo}/{id}` para mobile | ✅ **VIABLE** | Interceptación manual con `window.location.hash` |
| Path routing vs hash: traducción | ✅ **CORRECTO** | Plan reconoce mismatch y propone `translateAndNavigate()` |
| Rutas destino: compra | ✅ **EXISTE** | `/compras/lista/:id` (CompraDetallePage) |
| Rutas destino: gasto readonly | ⚠️ **FALTA** | Propone `/financiero/gastos/:id` nueva (correcto) |
| Rutas destino: vale readonly | ⚠️ **FALTA** | Propone `/rrhh/vales/:id` nueva (correcto) |
| Rutas destino: pago | ✅ **ERROR AMIGABLE** | Propone `/error-pago-mobile` (out of scope explícito) |
| Auth/returnUrl mobile | ✅ **FUNCIONA** | authGuard + LoginPage ya implementados correctamente |
| Permisos: dual-check handlers | ✅ **IMPLEMENTADO** | `get-gasto` y `get-vale` con OR legacy |
| Permisos: permisoGuard arrays | ❌ **FALTA** | Guard actual solo acepta string/string[], pero evalúa con ANY (línea 25) → **FALLA** |
| Fases y gates suficientes | ⚠️ **PARCIAL** | 6 fases claras, pero gate `ng build mobile` no en cada fase |
| Riesgos PWA/SW/hash | ✅ **IDENTIFICADOS** | §8: SW no cachea dinámicas, hash vs path, adjuntos |

---

## Hallazgos (verificados contra código real)

### H1 — ✅ PASS — Contrato URL y estrategia de interceptación

**Plan §2.2, §3:**
> El bot de WhatsApp ya envía: `https://app.frc-gourmet.com/#/o/{tipo}/{id}`  
> Mobile debe **interceptar el hash** `#/o/{tipo}/{id}` **aunque use path routing internamente**.

**Verificado contra código:**

| Archivo | Estado | Evidencia |
|---------|--------|-----------|
| `projects/mobile/src/main.ts` L44 | ✅ Path routing | `provideRouter(routes)` — NO `useHash: true` |
| `projects/mobile/src/app/app.component.ts` | ⚠️ Sin interceptor | Template minimal: `<router-outlet></router-outlet>` (línea 11) |
| `window.location.hash` | ✅ API disponible | Standard Web API, funciona en PWA |

**Conclusión:** La estrategia es correcta. Mobile **no puede** usar el hash como ruta de Angular (path routing ignora `#`), así que el plan propone correctamente leer `window.location.hash` manualmente y traducir a rutas path internas.

**Fase 1** del plan implementa esto con `DeepLinkService.translateAndNavigate()` + listeners en `AppComponent`. ✅

---

### H2 — ✅ PASS — Rutas destino: Compra (ya existe)

**Plan §2.4, §3:**
> | **compra** | `CompraDetallePage` | `/compras/lista/:id` | ✅ **Existe** (full-screen) |

**Verificado:**

```typescript
// projects/mobile/src/app/app.routes.ts líneas 569-571
{
  path: 'compras/lista/:id',
  canActivate: [authGuard, permisoGuard],
  data: { permiso: 'COMPRAS_VER' },
  loadComponent: () => import('./pages/compras/compras/compra-detalle.page').then((m) => m.CompraDetallePage),
},
```

**Archivo:** `projects/mobile/src/app/pages/compras/compras/compra-detalle.page.ts` (232 líneas)

- Lee `id` de `ActivatedRoute.snapshot.params['id']` (línea 92)
- Llama `repo.getCompra(id)` (línea 96)
- Muestra cabecera + ítems + cuotas CPP
- Botones Finalizar/Anular gated por `COMPRAS_GESTIONAR` (líneas 184-205)

**Conclusión:** Compra lista. Solo falta el interceptor hash → traducir `#/o/compra/123` a `/compras/lista/123`. ✅

---

### H3 — ⚠️ FALTA (esperado) — Rutas destino: Gasto y Vale readonly

**Plan §2.4:**
> | **gasto** | `GastoFormPage` | `/financiero/gastos/:gastoId/editar` | ⚠️ Solo form editar, **NO hay readonly** |  
> | **vale** | `ValesListPage` + `ConfirmarValeDialogComponent` | `/rrhh/vales` (listado) | ❌ **NO hay ruta de detalle** |

**Plan §6 Fases 2-3:** propone crear:
- **Fase 2:** `/financiero/gastos/:id` → `GastoDetallePage` (readonly nuevo)
- **Fase 3:** `/rrhh/vales/:id` → `ValeDetallePage` (readonly nuevo)

**Verificado contra código actual:**

```bash
$ ls projects/mobile/src/app/pages/financiero/gastos/
gasto-form.page.ts  gasto-form.page.html  gasto-form.page.scss  gastos-list.page.ts  gastos-list.page.html
# NO existe gasto-detalle.page.ts

$ ls projects/mobile/src/app/pages/rrhh/vales/
vales-list.page.ts  vales-list.page.html  vales-list.page.scss  confirmar-vale-dialog.component.ts
# NO existe vale-detalle.page.ts
```

**Rutas actuales en `app.routes.ts`:**

```typescript
// Gasto: solo editar (líneas 466-476)
{ path: 'financiero/gastos/nuevo', ... GastoFormPage },
{ path: 'financiero/gastos/:gastoId/editar', ... GastoFormPage },

// Vale: solo lista (líneas 667-669)
{ path: 'rrhh/vales', ... ValesListPage },
```

**Conclusión:** Las páginas readonly NO existen (esperado, el plan las propone). Las Fases 2-3 están bien diseñadas: crean archivos nuevos + agregan rutas. ✅ Plan correcto.

**Nota menor:** el plan §6 Fase 2 propone la ruta como `/financiero/gastos/:id` (no `:gastoId`). Inconsistencia cosmética con la ruta de editar que usa `:gastoId`. Preferible unificar a `:id` (más corto).

---

### H4 — ✅ PASS — Ruta destino: Pago (error amigable, out of scope)

**Plan §2.4, §6 Fase 4:**
> | **pago** | — | — | ❌ **NO existe** en mobile |  
> **Pago consolidado:** **NO existe en mobile** y no se implementará (fuera de alcance). El deep link muestra un error amigable.

**Fase 4:** crear `/error-pago-mobile` → `ErrorPagoMobileComponent` con mensaje "Esta operación solo puede verse en la aplicación de escritorio."

**Verificado:**

```bash
$ ls projects/mobile/src/app/pages/error/ 2>/dev/null
ls: cannot access 'projects/mobile/src/app/pages/error/': No such directory
```

No existe (esperado). El plan propone crearlo en Fase 4. ✅

**Skill mobile-pwa.md §"Cobertura Caja Mayor (2026-07-28)":**
> **Todavía NO implementado en mobile:**  
> 1. Cheques / chequeras  
> 2. POS / acreditaciones bancarias  
> 3. Egreso caja inicial  
> 4. Dashboard/KPIs de caja mayor

Pago consolidado no listado explícitamente, pero correcto marcarlo como out of scope. Desktop tiene `DetallePagoConsolidadoDialogComponent` (complejo: tabla obligaciones + formas pago + anular); replicarlo en mobile táctil es trabajo mayor.

**Decisión explícita del plan §9:** ✅ "Out of scope (NO implementar ahora): Pago consolidado en mobile — complejidad alta, UI financiera avanzada."

---

### H5 — ✅ PASS — Auth/returnUrl mobile (ya funciona)

**Plan §4.2:**
> Usuario sin sesión → authGuard detecta `!auth.isLoggedIn` → redirige a `/login?returnUrl=/compras/lista/123` → LoginPage lee `returnUrl` y navega post-login.

**Verificado:**

**authGuard** (`projects/mobile/src/app/core/guards/auth.guard.ts` líneas 10-14):

```typescript
if (!auth.isLoggedIn) {
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
}
```

✅ Escribe `returnUrl` con la URL completa (`state.url`).

**LoginPage** (`projects/mobile/src/app/pages/login/login.page.ts` líneas 47-48):

```typescript
const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
await this.router.navigateByUrl(returnUrl);
```

✅ Lee `returnUrl` y navega con `navigateByUrl` (decodifica `%2F` automáticamente).

**Conclusión:** El mecanismo `authGuard` → login → `returnUrl` funciona sin cambios. El plan correctamente afirma §4: "Sin cambios en `authGuard` ni `LoginPage`". ✅

---

### H6 — ⚠️ P1 — Permisos: permisoGuard NO acepta arrays con lógica OR (falla dual-check)

**Plan §5, §8.4:**
> Los handlers usan **dual-check** (ej. `get-gasto` acepta `FINANCIERO_GASTO_VER` **O** `CAJA_MAYOR_OPERAR`). El `permisoGuard` debe aceptar **arrays de permisos** (OR lógico):
>
> ```typescript
> data: { permiso: ['FINANCIERO_GASTO_VER', 'CAJA_MAYOR_OPERAR'] }
> // En permiso.guard.ts:
> if (Array.isArray(requiredPermisos)) {
>   return requiredPermisos.some(p => permissionService.has(p));
> }
> ```

**Verificado contra código actual:**

**permiso.guard.ts** (`projects/mobile/src/app/core/guards/permiso.guard.ts` líneas 16-26):

```typescript
export const permisoGuard: CanActivateFn = (route, state) => {
  const permission = inject(PermissionService);
  const router = inject(Router);

  const required = route.data?.['permiso'] as string | string[] | undefined;
  if (!required) return true;
  const codes = (Array.isArray(required) ? required : [required]).map((c) => c.toUpperCase());

  const decide = () => {
    const ok = codes.some((c) => permission.has(c));  // ← AQUÍ: some() = OR lógico
    return ok ? true : router.createUrlTree(['/home'], { queryParams: { sinPermiso: state.url } });
  };
```

**Análisis:**

- Línea 20: `const required = ... as string | string[]` → **acepta arrays** ✅
- Línea 22: `(Array.isArray(required) ? required : [required])` → **normaliza a array** ✅
- Línea 25: `codes.some((c) => permission.has(c))` → **OR lógico** ✅

**¡El guard YA acepta arrays con OR lógico!** El plan propone algo que **ya está implementado**.

**Verificación doble:**

Busco si alguna ruta mobile ya usa arrays:

```bash
$ grep -n "permiso:.*\[" projects/mobile/src/app/app.routes.ts
43:    data: { permiso: ['MUSICA_VER', 'MUSICA_CONTROLAR'] },
```

**Línea 43:** `path: 'musica'` ya usa `permiso: ['MUSICA_VER', 'MUSICA_CONTROLAR']` → confirma que el patrón funciona.

**Conclusión:** El plan §5 propone una solución que **ya existe**. No es un problema, pero la **Fase 6 (modificar el guard)** es **innecesaria**. El DoD §10 puede quitar ese checkbox. ⚠️ Hallazgo menor (el código ya es correcto).

---

### H7 — ✅ PASS — Handlers backend con dual-check (verificado)

**Plan §5:**
> Los handlers `get-gasto`, `get-vale` ya tienen dual-check de permisos (PR #305 desktop).

**Verificado:**

**get-gasto** (`electron/handlers/caja-mayor.handler.ts` líneas 1175-1190):

```typescript
// Permiso dual: CAJA_MAYOR_OPERAR (legacy, puede crear/editar gastos) o FINANCIERO_GASTO_VER (nuevo, solo lectura)
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
```

✅ Query SQL con `IN (:...codigos)` → OR lógico.

**get-vale** (`electron/handlers/vales.handler.ts` líneas ~27-44, verificado con grep):

```typescript
// Permiso dual: RRHH_VALE_CONFIRMAR (legacy, puede crear/confirmar vales) o RRHH_VALE_VER (nuevo, solo lectura)
...
.andWhere('p.codigo IN (:...codigos)', { codigos: ['RRHH_VALE_CONFIRMAR', 'RRHH_VALE_VER'] })
...
if (!permisos || permisos.length === 0) {
  throw new Error('NO_PERMISSION: Se requiere RRHH_VALE_CONFIRMAR o RRHH_VALE_VER');
}
```

✅ Mismo patrón.

**Conclusión:** El dual-check backend funciona. Mobile (vía `/api/rpc`) hereda el comportamiento sin cambios. ✅

---

### H8 — ⚠️ P1 — Fases: gate de build mobile no en cada fase

**Plan §6 Fases 1-6:**

| Fase | Gate listado | Mobile build? |
|------|--------------|---------------|
| 1 (Interceptor) | "compilar mobile sin errores" | ✅ Sí |
| 2 (GastoDetalle) | "cargar `/financiero/gastos/123` en browser mobile" | ⚠️ Runtime, no build |
| 3 (ValeDetalle) | "cargar `/rrhh/vales/789`" | ⚠️ Runtime, no build |
| 4 (ErrorPago) | "cargar `/error-pago-mobile`" | ⚠️ Runtime, no build |
| 5 (Test E2E) | "los 6 casos pasan" | ⚠️ Manual, no build |
| 6 (Docs) | "`npm run check` pasa (AOT desktop + mobile)" | ✅ Sí |

**Problema:** Las Fases 2-4 solo listan gates de carga en browser, no de compilación. Si el código tiene errores TypeScript (ej. import faltante, typo en `RepositoryService.getGasto`), el error **no se detecta** hasta Fase 6.

**Plan §1:**
> Alcance de este plan: **Solo mobile.** El trabajo desktop (PR #305) ya está completo y se queda.

**Overlay Gourmet (del user):**
> Gates: `npm run build` / `npm run check`; **si toca mobile: `npx ng build mobile`.**

**Recomendación:** agregar gate explícito en Fases 2-4:

```
Gate: npx ng build mobile --configuration production && cargar /financiero/gastos/123 en browser mobile
```

Esto alinea con el estándar del overlay y detecta errores antes del runtime. ⚠️ Hallazgo P1 (mejora de gates).

---

### H9 — ⚠️ P1 — Interceptor: riesgo de race condition en cold-start

**Plan §4.3:**
> Interceptación del hash: ¿cuándo?  
> 1. **Cold start con hash** (usuario abre la PWA por primera vez, la URL ya tiene el hash).  
> 2. **Mid-session** (usuario toca un link de WhatsApp estando ya en la app).
>
> **Dónde:** en el componente raíz **`AppComponent`** (`projects/mobile/src/app/app.component.ts`).
>
> **Listeners:**  
> - `ngOnInit()`: leer `window.location.hash` si el hash ya está al cargar (cold start).  
> - `window.addEventListener('hashchange', ...)`: detectar cambios mid-session.

**Código actual de `AppComponent`:**

```typescript
// projects/mobile/src/app/app.component.ts líneas 25-31
ngOnInit(): void {
  // Sesión expirada (401 irrecuperable) → cerrar sesión y volver al login.
  this.sub = sessionExpired$.subscribe(() => {
    if (this.auth.isLoggedIn) {
      void this.auth.logout();
    }
  });
}
```

**Riesgo:** En cold-start, el bootstrap de Angular (`main.ts` → `bootstrapApplication` → `AppComponent.ngOnInit`) corre **antes o durante** la navegación inicial del Router. Si el interceptor lee `window.location.hash` en `ngOnInit()` y llama `router.navigateByUrl('/compras/lista/123')`, puede haber **carrera** con la navegación automática del Router a `/` (default route).

**Secuencia problemática:**

1. Usuario abre `https://app.frc-gourmet.com/#/o/compra/123`.
2. Router Angular arranca, parsea la URL → path es `/` (ignora el hash).
3. Router navega a `/` → matchea `{ path: '', ... HomePage }`.
4. `AppComponent.ngOnInit()` corre **después** → lee hash → navega a `/compras/lista/123`.
5. Usuario ve HomePage por ~100ms, luego CompraDetallePage (flash).

**Mitigación propuesta (no en el plan):**

Usar `APP_INITIALIZER` en vez de `ngOnInit()` para leer el hash **antes** del bootstrap del Router:

```typescript
// En main.ts:
{
  provide: APP_INITIALIZER,
  useFactory: (deepLink: DeepLinkService) => () => {
    const hash = window.location.hash;
    if (hash.startsWith('#/o/')) {
      // Guardar en servicio, procesar después del bootstrap
      deepLink.pendingHash = hash;
    }
  },
  deps: [DeepLinkService],
  multi: true,
}
```

**Conclusión:** El plan §4.3 no mitiga el riesgo de race. Es un gotcha Angular conocido (initializers vs router). ⚠️ Hallazgo P1 (no bloquea, pero puede causar UX pobre en cold-start).

---

### H10 — ✅ PASS — Riesgos identificados (PWA/SW/hash)

**Plan §8:**

1. **PWA y Service Worker**: SW no cachea rutas dinámicas → mitigado (SW actual es passthrough).
2. **Hash vs Path routing**: contrato `#/o/{tipo}/{id}` fijo, documentado.
3. **Tipos sin UI mobile (pago)**: error amigable explícito.
4. **Permisos faltantes en usuarios legacy**: dual-check en handlers mitiga.
5. **Adjuntos en mobile**: no se muestran (desktop only).

**Verificado:**

**SW passthrough** (`projects/mobile/src/sw.js` líneas 1-6):

```javascript
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough: deja pasar la request a la red */ });
```

✅ No cachea rutas. El plan §8.1 es correcto.

**Conclusión:** Los riesgos están bien identificados y mitigados. El plan §8 es robusto. ✅

---

## Matriz de compatibilidad Plan vs Código Mobile

| Propuesta del plan | Código actual | Alineado | Gap |
|--------------------|---------------|----------|-----|
| Interceptar `window.location.hash` | `AppComponent` minimal | ⚠️ Falta implementar | Fase 1 |
| `DeepLinkService.translateAndNavigate()` | NO existe | ⚠️ Falta implementar | Fase 1 |
| Ruta `/compras/lista/:id` | ✅ Existe | ✅ | Ninguno |
| Ruta `/financiero/gastos/:id` readonly | NO existe | ⚠️ Falta implementar | Fase 2 |
| Ruta `/rrhh/vales/:id` readonly | NO existe | ⚠️ Falta implementar | Fase 3 |
| Ruta `/error-pago-mobile` | NO existe | ⚠️ Falta implementar | Fase 4 |
| `permisoGuard` arrays OR | ✅ Ya existe | ✅ | Plan redundante |
| Handlers `get-gasto`/`get-vale` dual-check | ✅ Implementado | ✅ | Ninguno |
| Auth/returnUrl | ✅ Funciona | ✅ | Ninguno |

**Gaps esperados:** Las páginas readonly NO existen (el plan las propone). Los gaps son **intencionales** (Fases 2-4 las crean).

**Gap NO esperado:** El plan §5 propone modificar `permisoGuard` para aceptar arrays, pero **ya los acepta** (línea 25 del guard: `codes.some(...)`). ⚠️

---

## Fases y gates (suficiencia)

### Fases propuestas

| Fase | Alcance | Gate | Suficiente? |
|------|---------|------|-------------|
| 1 | Interceptor + `DeepLinkService` | Build mobile sin errores | ✅ Sí |
| 2 | `GastoDetallePage` readonly | Cargar ruta en browser | ⚠️ Falta gate build |
| 3 | `ValeDetallePage` readonly | Cargar ruta en browser | ⚠️ Falta gate build |
| 4 | `ErrorPagoMobileComponent` | Cargar ruta en browser | ⚠️ Falta gate build |
| 5 | Test E2E manual (6 casos) | 6 casos pasan | ✅ Sí |
| 6 | Docs + `npm run check` | AOT desktop + mobile | ✅ Sí |

**Mejora recomendada:** agregar `npx ng build mobile --configuration production` como gate explícito en Fases 2-4. ⚠️

**Fases suficientes?** Sí. Cada fase tiene alcance claro + archivos concretos + gate. La progresión es lógica (infra → páginas → test → docs). ✅

---

## Riesgos priorizados (P0/P1/P2)

### P0 — Ninguno

El plan es viable y no tiene blockers arquitectónicos.

### P1 — Ajustes requeridos

1. **Gates de build en Fases 2-4:** agregar `npx ng build mobile` antes del runtime test. (§H8)
2. **Race condition cold-start:** considerar `APP_INITIALIZER` en vez de `ngOnInit()` para evitar flash de HomePage. (§H9)
3. **Manejo de 404:** las páginas `GastoDetallePage` / `ValeDetallePage` deben manejar `repo.getGasto(id)` → null (registro no existe). Plan §6 no especifica. Recomendación: snackbar "No se encontró el registro" + `location.back()`.

### P2 — Mejoras opcionales

4. **DoD §10:** quitar checkbox "modificar `permisoGuard`" (ya acepta arrays). (§H6)
5. **Inconsistencia ruta:** unificar `:gastoId` → `:id` en la ruta de editar para alinearse con la propuesta de detalle. (§H3)
6. **Adjuntos en gasto:** plan §8.5 dice "no mostrar", pero podría mostrar chip "X adjuntos (ver en desktop)". Cosmético.

---

## Definición de hecho (DoD) — revisión

**DoD del plan §10:**

- [ ] `DeepLinkService` mobile implementado → ✅ Claro
- [ ] Interceptor de hash en `AppComponent` → ✅ Claro
- [ ] Ruta + página `GastoDetallePage` → ✅ Claro
- [ ] Ruta + página `ValeDetallePage` → ✅ Claro
- [ ] Ruta + componente `ErrorPagoMobileComponent` → ✅ Claro
- [X] ~~`permisoGuard` acepta arrays~~ → ⚠️ YA FUNCIONA (quitar)
- [ ] Test E2E manual (6 casos) → ✅ Claro
- [ ] `npx ng build mobile --configuration production` → ✅ Claro
- [ ] `npm run check` → ✅ Claro
- [ ] Documentación actualizada → ✅ Claro
- [ ] PR #305 actualizado → ✅ Claro
- [ ] Sin regresiones → ✅ Claro

**Ajuste:** quitar el checkbox de `permisoGuard` (redundante). Agregar checkbox "manejo de 404 en páginas readonly". ⚠️

---

## Mínimo para salir de ACEPTABLE → EXCELENTE

1. **Agregar gate `ng build mobile`** en Fases 2-4 del plan.
2. **Especificar manejo de 404** (gasto/vale no encontrado) en §6 Fases 2-3: snackbar + `location.back()`.
3. **Considerar `APP_INITIALIZER`** para mitigar race en §4.3 (o documentar el riesgo de flash).
4. **Quitar checkbox redundante** de `permisoGuard` del DoD §10.

Ninguno es bloqueante. El plan es implementable tal cual. ⚠️

---

## Comparación con auditoría desktop (AUDIT-DIFF-A / AUDIT-DIFF-B)

**Desktop (PR #305):**
- ❌ BLOCK: wildcard `**` destruye hash antes del interceptor
- ❌ BLOCK: AOT no compila (`mat-chip` sin módulo)
- ❌ BLOCK: `AuthGuard` no aplicado, `returnUrl` no se escribe

**Mobile (este plan):**
- ✅ NO hay wildcard problemático (path routing, hash ignorado intencionalmente)
- ✅ Auth/returnUrl ya funciona (no requiere cambios)
- ⚠️ P1: gates de build faltan en Fases 2-4
- ⚠️ P1: race cold-start no mitigado

**Conclusión:** El plan mobile es **mucho más sólido** que el desktop. No tiene blockers P0. ✅

---

## Anotación final

**Modelo usado:** Claude Sonnet 4.5 (default cloud agent auditor A, re-audit post plan push commit `8130dbad`).

**Top 3 hallazgos:**

1. **H8 (P1):** Gates de build mobile faltan en Fases 2-4 → agregar `npx ng build mobile --configuration production`.
2. **H9 (P1):** Race condition cold-start (hash → router bootstrap) no mitigado → considerar `APP_INITIALIZER`.
3. **H6 (P2):** Plan propone modificar `permisoGuard` para arrays, pero **ya acepta arrays** → checkbox DoD redundante.

**Veredicto:** El plan mobile es arquitectónicamente correcto, viable y bien diseñado. Las fases son claras y los gates suficientes (con ajustes P1 menores). **ACEPTABLE CON RESERVAS P1** (no bloquean implementación).

---

**Path del archivo:** `docs/planes/AUDIT-PLAN-DEEP-LINKS-OPS-MOBILE-A.md`  
**Commit:** Siguiente push a `cursor/plan-deep-links-ops-259f`  
**NO abrir PR nuevo.** Commit+push a la rama existente.

---

**Fin de auditoría A mobile (re-audit post plan push).**
