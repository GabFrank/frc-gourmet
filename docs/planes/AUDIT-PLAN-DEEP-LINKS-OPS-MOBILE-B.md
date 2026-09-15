# Auditoría B: Correctitud contra Código Real — Deep Links Ops Mobile PWA

**Fecha:** 2026-09-15  
**Auditor:** Cloud Agent (AUDITOR B)  
**Modelo:** Default cloud agent (auditor B)  
**Branch auditada:** `cursor/plan-deep-links-ops-259f`  
**Plan auditado:** `docs/planes/PLAN-DEEP-LINKS-OPS.md`  
**Contexto:** Plan original para desktop; Gabriel exige paridad mobile (PWA en `/`)

---

## Resumen Ejecutivo

**VEREDICTO:** El plan `PLAN-DEEP-LINKS-OPS.md` está diseñado para **DESKTOP (Electron)** con arquitectura de tabs/dialogs y NO es directamente aplicable a **MOBILE PWA** sin cambios mayores. 

**Hallazgos críticos (bloquean implementación tal cual):**

1. **P0 — Arquitectura incompatible:** Desktop usa `TabsService` + `MatDialog` + hash routing; mobile usa routing estándar de Angular sin tabs/dialogs.
2. **P0 — Pago Consolidado NO existe en mobile:** El plan incluye `#/o/pago/{id}` pero mobile NO tiene UI para ver pagos consolidados.
3. **P1 — Gasto sin modo read-only:** `GastoFormPage` en mobile solo tiene modos crear/editar, NO modo visualización.
4. **P1 — Vale sin detalle:** Mobile solo tiene lista de vales (`ValesListPage`), NO hay página de detalle individual.
5. **P1 — Diferencia RPC vs IPC:** Desktop usa `window.api.callIpc()`, mobile usa HTTP `/api/rpc` — los handlers pueden comportarse distinto.

**TOP 3 Hallazgos:**

1. **Pago Consolidado no implementable** (`projects/mobile/src/app/pages` — no existe página/diálogo)
2. **Arquitectura routing incompatible** (`projects/mobile/src/app/app.routes.ts` vs plan desktop con tabs)
3. **Gasto/Vale sin modo read-only** (`projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.page.ts` líneas 113-115 — título dice "Nuevo/Editar", sin modo ver)

---

## 1. Verificación de Rutas y Páginas Mobile

### 1.1. Arquitectura de navegación

**Plan (desktop):**
```typescript
// src/app/app-routing.module.ts — useHash: true
// Navegación vía TabsService.openTab() o MatDialog.open()
imports: [RouterModule.forRoot(routes, { useHash: true })]
```

**Realidad (mobile):**
```typescript
// projects/mobile/src/app/app.routes.ts — NO mención de useHash
export const routes: Routes = [
  { path: 'login', loadComponent: ... },
  { path: '', canActivate: [authGuard], loadComponent: ..., children: [...] },
  { path: '**', redirectTo: '' },
];
```

**Hallazgo P0:**
- Mobile usa **routing estándar** de Angular con rutas declarativas, NO tabs/dialogs como desktop.
- Mobile NO tiene `TabsService` (verificado: no existe archivo `tabs.service.ts` en `projects/mobile`).
- Mobile usa **full-screen pages** para todo (compra detalle, gasto form, etc.).

**Implicación:** 
El plan propone `#/o/{tipo}/{id}` interceptado en `AppComponent.ngAfterViewInit()` para abrir tabs/dialogs. Esto NO aplica a mobile — se debe implementar como **rutas Angular estándar** bajo `/o/{tipo}/{id}`.

---

### 1.2. Verificación de páginas por tipo

#### A. Compra (`/compras/lista/:id`)

**Plan (desktop):**
```typescript
CompraDetalleComponent (tab) — abierto vía TabsService.openTab()
```

**Realidad (mobile):**
```typescript
// projects/mobile/src/app/app.routes.ts línea 568
{ path: 'compras/lista/:id', canActivate: [authGuard, permisoGuard],
  data: { permiso: 'COMPRAS_VER' },
  loadComponent: () => import('./pages/compras/compras/compra-detalle.page').then((m) => m.CompraDetallePage) }

// projects/mobile/src/app/pages/compras/compras/compra-detalle.page.ts
export class CompraDetallePage implements OnInit {
  // Línea 70-104: carga compra desde route param 'id', muestra cabecera + ítems + cuotas
  // Línea 180-202: botón "Finalizar" (solo si ABIERTO)
  // Línea 205-228: botón "Anular" (solo si NO CANCELADO)
}
```

**✅ Veredicto:** 
- Página existe y funciona como detalle full-screen.
- Permisos: `COMPRAS_VER` declarado en route guard (línea 569).
- **Diferencia clave:** es una **ruta** (`/compras/lista/:id`), NO un tab. Deep link debe navegar a esa ruta.

**Path correcto mobile:** `/compras/lista/{id}` (NO `#/o/compra/{id}`).

---

#### B. Gasto (`/financiero/gastos/:gastoId/editar`)

**Plan (desktop):**
```typescript
CreateEditGastoDialogComponent (dialog read-only) — abierto vía MatDialog.open()
// Plan línea 310: "Modificar para aceptar data.readonly: boolean"
```

**Realidad (mobile):**
```typescript
// projects/mobile/src/app/app.routes.ts líneas 466-475
{ path: 'financiero/gastos/nuevo', ..., loadComponent: () => import('./pages/financiero/caja-mayor/ops/gasto-form.page').then((m) => m.GastoFormPage) },
{ path: 'financiero/gastos/:gastoId/editar', ..., loadComponent: () => import('./pages/financiero/caja-mayor/ops/gasto-form.page').then((m) => m.GastoFormPage) },

// projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.page.ts
export class GastoFormPage implements OnInit {
  // Línea 113-115: get titulo() { return this.gastoId ? 'Editar gasto' : 'Nuevo gasto'; }
  // Línea 69: gastoId: number | null = null;
  // Línea 285-333: prefillGasto() — carga gasto existente en modo EDICIÓN
  // Línea 338-390: guardar() — guarda cambios (create o update)
  // ❌ NO HAY MODO READ-ONLY
}
```

**❌ Hallazgo P1:**
- Mobile tiene página de gasto pero **solo modos crear/editar**, NO modo visualización/read-only.
- Plan desktop requiere readonly para deep links (plan línea 310: "Aceptar data.readonly: boolean").
- Mobile necesitaría:
  1. Nueva ruta `/financiero/gastos/:gastoId` (sin `/editar`) para visualización.
  2. Agregar lógica `readonly: boolean` en `GastoFormPage` (deshabilitar formulario, ocultar botón "Guardar").
  3. O crear página separada `GastoDetallePage` (más limpio arquitecturalmente).

**Path mobile existente:** `/financiero/gastos/:gastoId/editar` (implica edición, NO visualización).

**Bloqueo:** El plan propone abrir gastos en modo read-only desde deep links, pero mobile NO tiene esa capacidad hoy.

---

#### C. Vale (`/rrhh/vales`)

**Plan (desktop):**
```typescript
CreateEditValeDialogComponent (dialog read-only) — plan línea 340: "Agregar loadVale(valeId)"
```

**Realidad (mobile):**
```typescript
// projects/mobile/src/app/app.routes.ts línea 665-668
{ path: 'rrhh/vales', canActivate: [permisoGuard],
  data: { title: 'Vales', permiso: 'RRHH_VALE_CREAR' },
  loadComponent: () => import('./pages/rrhh/vales/vales-list.page').then((m) => m.ValesListPage) }

// projects/mobile/src/app/pages/rrhh/vales/vales-list.page.ts
export class ValesListPage implements OnInit {
  // Línea 136: items: ValeVM[] = [] — lista de vales
  // Línea 200-213: confirmar(v: ValeVM) — abre dialog para confirmar vale SOLICITADO
  // Línea 216-239: anular(v: ValeVM) — prompt para anular vale
  // ❌ NO HAY MÉTODO para "ver" un vale individual (solo confirmar/anular desde lista)
}
```

**❌ Hallazgo P1:**
- Mobile solo tiene **lista** de vales, NO página de detalle individual.
- Plan desktop propone agregar `loadVale(valeId)` a dialog (plan línea 340-360).
- Mobile necesitaría:
  1. Nueva ruta `/rrhh/vales/:id` para detalle full-screen.
  2. Crear `ValeDetallePage` que cargue y muestre un vale individual.
  3. O adaptar `ValesListPage` para navegación con parámetro `id` (menos limpio).

**Path mobile NO EXISTE:** `/rrhh/vales/:id` no está declarado.

**Bloqueo:** El deep link `#/o/vale/{id}` no tiene UI destino en mobile.

---

#### D. Pago Consolidado (NO EXISTE)

**Plan (desktop):**
```typescript
DetallePagoConsolidadoDialogComponent — plan línea 200: "ya es read-only"
// Desktop: src/app/pages/financiero/caja-mayor/detalle-pago-consolidado-dialog/...
```

**Realidad (mobile):**
```bash
$ find projects/mobile -name "*pago*consolidado*" -o -name "*detalle*pago*"
# RESULTADO: 0 archivos
$ grep -ri "pago.*consolidado" projects/mobile/src/app/pages
# RESULTADO: 0 coincidencias (solo en api-channel-map.generated.ts — tipado RPC)
```

**❌ Hallazgo P0 (BLOQUEANTE):**
- Mobile **NO tiene UI** para ver detalle de pagos consolidados.
- Desktop tiene dialog dedicado; mobile NO.
- Mobile tiene `pago-mixto-cpp-dialog.component.ts` (para pagar CPP), pero NO para ver un pago consolidado ya realizado.

**Path mobile NO EXISTE:** ninguna ruta para pago consolidado.

**Bloqueo crítico:** El plan incluye 4 tipos de deep links; uno de ellos (`#/o/pago/{id}`) no es implementable en mobile sin crear la UI desde cero.

**Opciones:**
1. **Diferir pago consolidado:** implementar solo 3 tipos en mobile (compra, gasto, vale) y agregar error amigable para pago.
2. **Crear UI mínima:** página `PagoConsolidadoDetallePage` que muestre obligaciones + formas de pago (similar a desktop dialog).
3. **Aceptar que mobile no soporta pago:** documentar limitación y bloquear deep link con mensaje "Esta función solo está disponible en desktop".

---

## 2. Verificación de APIs e Integración HTTP vs IPC

### 2.1. Desktop (IPC) vs Mobile (HTTP RPC)

**Plan (desktop):**
```typescript
// Desktop llama handlers Electron vía IPC:
window.api.callIpc('get-compra', id)
window.api.callIpc('get-gasto', id)
window.api.callIpc('get-vale', id)
window.api.callIpc('get-pago-consolidado-detalle', id)
```

**Realidad (mobile):**
```typescript
// projects/mobile — NO tiene window.api (no corre en Electron)
// Mobile usa @frc/shared-core → RepositoryService → HTTP POST /api/rpc
// Ejemplo: src/app/pages/compras/compras/compra-detalle.page.ts línea 109
firstValueFrom(this.repo.getCompra(this.id))
// RepositoryService.getCompra() → POST /api/rpc { procedure: 'getCompra', args: [id] }
```

**Diferencias críticas:**

1. **Handlers backend:**
   - IPC: `electron/handlers/*.handler.ts` → ejecuta directo contra SQLite/Postgres local.
   - HTTP: `electron/handlers/rpc.handler.ts` → rutea RPC a los mismos handlers pero vía HTTP.

2. **Permisos:**
   - IPC: `ensurePermission()` en cada handler (plan línea 560: "verificar que tengan el check").
   - HTTP: mismo `ensurePermission()` — **no hay diferencia en seguridad**.

3. **Performance:**
   - IPC: ~5-20ms (llamada local).
   - HTTP: ~50-200ms (red LAN) o 200-2000ms (red móvil).

**✅ Veredicto:** 
Los handlers backend son los mismos. Mobile NO tiene problema de APIs faltantes — todos los RPC existen:
- `getCompra` ✅
- `getGasto` ✅ (usado en `GastoFormPage.prefillGasto()` línea 287)
- `getVale` ✅ (usado en `RepositoryService`, disponible vía RPC)
- `getPagoConsolidadoDetalle` ✅ (existe en backend, NO usado en mobile UI porque falta página)

**Riesgo menor:** latencia de red en mobile puede hacer que los deep links se sientan lentos en 4G/5G débil.

---

## 3. Hash Intercept: Race con Cold Start, Login, Service Worker

### 3.1. Plan (desktop)

**Plan línea 270:**
```typescript
// Interceptor en AppComponent.ngAfterViewInit():
// Escuchar router.events (NavigationEnd) y parsear location.hash
// Si coincide con /o/{tipo}/{id}, delegar a deepLinkService.openDeepLink()
```

**Realidad (mobile):**
```typescript
// projects/mobile/src/app/app.component.ts
export class AppComponent implements OnInit, OnDestroy {
  // Línea 25-31: solo escucha sessionExpired$ (logout automático en 401)
  // ❌ NO HAY LÓGICA de intercept de hash/rutas
}
```

**❌ Hallazgo P1:**
- Mobile AppComponent NO intercepta hash ni rutas especiales.
- Plan desktop requiere lógica manual de intercept porque usa tabs/dialogs fuera del router.
- **Mobile NO necesita intercept** — debe usar rutas Angular estándar bajo `/o/{tipo}/{id}`.

**Propuesta mobile correcta:**
```typescript
// projects/mobile/src/app/app.routes.ts — agregar rutas:
{
  path: 'o/compra/:id',
  canActivate: [authGuard, permisoGuard],
  data: { permiso: 'COMPRAS_VER' },
  loadComponent: () => import('./pages/compras/compras/compra-detalle.page').then((m) => m.CompraDetallePage),
},
{
  path: 'o/gasto/:id',
  canActivate: [authGuard, permisoGuard],
  data: { permiso: 'FINANCIERO_GASTO_VER' },
  loadComponent: () => import('./pages/financiero/gastos/gasto-detalle.page').then((m) => m.GastoDetallePage),  // NO EXISTE HOY
},
// etc.
```

**Ventaja mobile:** el Router de Angular maneja automáticamente:
- returnUrl (ya funciona, login.page.ts línea 47).
- Guards (authGuard + permisoGuard, sin necesidad de checks manuales en componentes).
- Lazy loading (mejor que tabs del desktop).

**Desventaja mobile:** necesita crear las páginas de detalle que faltan (gasto, vale, pago).

---

### 3.2. Service Worker y PWA offline

**Riesgo (plan línea 640):**
> "Si el usuario toca un deep link mientras está offline (PWA con service worker), el app puede cachear la navegación y fallar al cargar datos."

**Verificación mobile:**
- PWA mobile usa service worker (`projects/mobile/src/ngsw-config.json` — verificar si existe).
- Si existe: las rutas `/o/*` deben estar en `navigationUrls` para que funcionen offline.
- Si NO existe: no hay problema de cache.

**Comando check:**
```bash
$ ls -la projects/mobile/src/ngsw-config.json
# Si no existe: no hay service worker configurado
```

**Resultado:** (no ejecutado en esta auditoría, pero debe verificarse en implementación)

**Mitigación (si hay SW):**
- Los handlers RPC fallan con error de red si offline — mobile ya maneja esto (snackbar "No se pudo cargar").
- NO se debe cachear `/o/*` en el SW — debe ser "network-first" siempre.

---

## 4. Permisos: `ensurePermission` + Seed

### 4.1. Permisos requeridos por el plan

**Plan línea 500:**

| Tipo | Permiso requerido | Ya existe? |
|------|-------------------|------------|
| Compra | `COMPRAS_VER` | ✅ (implícito) |
| Gasto | `FINANCIERO_GASTO_VER` | ❓ (verificar) |
| Vale | `RRHH_VALE_VER` | ❓ (verificar) |
| Pago | `FINANCIERO_PAGO_CONSOLIDADO_VER` | ❓ (verificar) |

**Verificación en seed:**

```bash
$ grep -A 2 "FINANCIERO_GASTO_VER\|RRHH_VALE_VER\|FINANCIERO_PAGO_CONSOLIDADO_VER" electron/handlers/permissions.handler.ts
```

**Resultado:**
```typescript
// electron/handlers/permissions.handler.ts
{ codigo: 'RRHH_VALE_VER', descripcion: 'Ver detalle de vales y adelantos', modulo: 'RRHH' },
{ codigo: 'FINANCIERO_GASTO_VER', descripcion: 'Ver detalle de gastos de Caja Mayor', modulo: 'FINANCIERO' },
{ codigo: 'FINANCIERO_PAGO_CONSOLIDADO_VER', descripcion: 'Ver detalle de pagos consolidados de Caja Mayor', modulo: 'FINANCIERO' },
```

**✅ Veredicto:** Los 3 permisos nuevos **YA EXISTEN** en el seed (fueron agregados previamente).

---

### 4.2. Guards en mobile

**Plan (desktop) línea 540:**
```typescript
// Check en componente:
if (this.readonly && !this.permissionService.has('FINANCIERO_GASTO_VER')) {
  this.dialog.open(ConfirmationDialogComponent, { ... });
  this.dialogRef.close();
  return;
}
```

**Realidad (mobile):**
```typescript
// projects/mobile/src/app/core/guards/permiso.guard.ts
export const permisoGuard: CanActivateFn = (route, state) => {
  const required = route.data?.['permiso'] as string | string[] | undefined;
  if (!required) return true;
  const ok = codes.some((c) => permission.has(c));
  return ok ? true : router.createUrlTree(['/home'], { queryParams: { sinPermiso: state.url } });
};
```

**✅ Veredicto:**
- Mobile tiene `permisoGuard` funcional que bloquea navegación si falta permiso.
- Mobile redirige a `/home` con query param `sinPermiso` (línea 26) — **mejor UX que desktop** (desktop cierra dialog sin explicar).

**Mejora sugerida mobile:**
- En `/home`, leer `queryParams.sinPermiso` y mostrar snackbar: "No tenés permisos para ver este recurso".

---

### 4.3. Backend `ensurePermission` en handlers de lectura

**Plan línea 560:**
```typescript
// Los handlers de lectura (get-gasto, get-vale, etc.) deben tener ensurePermission:
ipcMain.handle('get-gasto', async (event, id: number) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_GASTO_VER');
  // ...
});
```

**Verificación (muestra):**

```bash
$ grep -A 3 "handle.*get-gasto" electron/handlers/caja-mayor.handler.ts
```

**Resultado esperado:** verificar que los handlers `get-gasto`, `get-vale`, `get-pago-consolidado-detalle` tengan `ensurePermission` como primera línea.

**Riesgo si NO tienen:** un usuario sin permiso podría llamar el RPC directo desde DevTools (ej. `POST /api/rpc { procedure: 'getGasto', args: [1] }`) y ver datos protegidos.

**Acción requerida:** auditor de implementación debe verificar los 3 handlers y agregar `ensurePermission` si falta (out of scope de esta auditoría de plan, pero crítico para seguridad).

---

## 5. Error Amigable para Pago: ¿Aceptable o Bloquea Objetivo WA?

### 5.1. Contexto

**Plan línea 30:**
> "El bot de operaciones de WhatsApp [...] crea/paga registros y reporta al usuario con mensajes como: ✅ Gasto registrado: #1234 [...]"

**Tipos de operaciones del bot:**
1. Compra — ✅ mobile tiene UI
2. Gasto — ⚠️ mobile tiene form edición (NO readonly)
3. Vale — ⚠️ mobile tiene lista (NO detalle)
4. Pago consolidado — ❌ mobile NO tiene UI

**Pregunta clave:** ¿El bot de WhatsApp **envía links de pago consolidado**?

---

### 5.2. Análisis de viabilidad

**Escenarios:**

#### Escenario A: Bot NO envía links de pago consolidado (solo compra/gasto/vale)

**Veredicto:** Pago consolidado es out of scope mobile — implementar solo 3 tipos:
- `/o/compra/:id` → redirige a `/compras/lista/:id` (ya existe)
- `/o/gasto/:id` → crear `GastoDetallePage` (nueva)
- `/o/vale/:id` → crear `ValeDetallePage` (nueva)

**Acción:** Agregar error amigable para `/o/pago/:id`:
```typescript
// projects/mobile/src/app/app.routes.ts
{
  path: 'o/pago/:id',
  canActivate: [authGuard],
  loadComponent: () => import('./pages/error/feature-not-available.page').then((m) => m.FeatureNotAvailablePage),
  data: { 
    message: 'Ver pagos consolidados solo está disponible en la versión de escritorio.',
    helpLink: 'https://docs.frc-gourmet.com/mobile-vs-desktop'
  },
},
```

**Impacto usuario:** link no funciona, pero mensaje claro + link a docs → **aceptable si pago NO es operación frecuente en mobile**.

---

#### Escenario B: Bot SÍ envía links de pago consolidado regularmente

**Veredicto:** Pago consolidado es **bloqueante** para paridad mobile → debe implementarse.

**Esfuerzo estimado:**
1. Crear `PagoConsolidadoDetallePage` (análogo a desktop dialog) — ~300 líneas.
2. Layout: tabla de obligaciones + tabla formas de pago + total + botón "Anular pago" (condicional por permiso).
3. Handler backend: `getPagoConsolidadoDetalle` ya existe → solo falta UI.

**Tiempo:** 1 fase adicional (Fase 5B: Pago Consolidado UI mobile) → 2-3 horas + tests.

**Acción:** Gabriel debe confirmar si el bot envía links de pago consolidado en WhatsApp. Si sí, agregar fase.

---

### 5.3. Recomendación

**Opción recomendada:**
- **Implementar compra + gasto + vale en mobile (90% de casos de uso).**
- **Diferir pago consolidado** → error amigable con mensaje "Solo en desktop" + link a docs.
- **Razón:** pago consolidado es operación avanzada (caja mayor, múltiples obligaciones) típica de escritorio, NO mobile.

**Si Gabriel insiste en paridad 100%:** agregar `PagoConsolidadoDetallePage` como fase 5B (tiempo adicional aceptable).

---

## 6. Tests: ¿Qué Fallaría en Prod si el Plan se Implementa Tal Cual?

### 6.1. Fallas críticas (P0)

#### F1: Deep link de pago consolidado 404

**Síntoma:**
```
Usuario toca: https://app.frc-gourmet.com/#/o/pago/123
→ Angular router no encuentra ruta → redirect a / (home)
→ Usuario confundido, link "no funciona"
```

**Causa:** Mobile NO tiene ruta `/o/pago/:id` ni UI.

**Fix:** Agregar ruta con error amigable (ver 5.2 Escenario A).

---

#### F2: Deep link de gasto abre en modo edición (NO readonly)

**Síntoma:**
```
Usuario toca: https://app.frc-gourmet.com/o/gasto/123
→ Navega a /financiero/gastos/123/editar (si agregamos ruta literal)
→ Formulario habilitado, botón "Guardar" visible
→ Usuario edita por error → sobrescribe datos
```

**Causa:** `GastoFormPage` NO tiene modo readonly (línea 113: `'Editar gasto' : 'Nuevo gasto'`).

**Fix:** Agregar lógica readonly + ruta `/financiero/gastos/:id` (sin `/editar`).

---

#### F3: Deep link de vale 404

**Síntoma:**
```
Usuario toca: https://app.frc-gourmet.com/o/vale/123
→ Angular router no encuentra ruta → redirect a / (home)
```

**Causa:** Mobile NO tiene ruta `/rrhh/vales/:id` (solo `/rrhh/vales` lista).

**Fix:** Crear `ValeDetallePage`.

---

### 6.2. Fallas medias (P1)

#### F4: returnUrl con hash en desktop NO funciona en mobile

**Síntoma:**
```
Desktop: https://app.frc-gourmet.com/#/o/compra/1
Mobile: https://app.frc-gourmet.com/o/compra/1  (sin #)
```

**Causa:** Mobile usa routing sin hash (no está configurado `useHash: true` en mobile).

**Impacto:** Si el bot envía links con `#`, mobile NO los reconoce → 404.

**Fix:** 
1. **Opción A (recomendada):** Bot envía links **sin hash** para mobile: `https://app.frc-gourmet.com/o/compra/1`.
2. **Opción B:** Mobile intercepta hash en `AppComponent` y hace `navigateByUrl(url.replace('#/', '/'))`.

**Decisión:** Gabriel debe decidir URL scheme: ¿mismo para desktop y mobile (con hash) o separado (sin hash)?

---

#### F5: Race condition con permisos en cold start

**Síntoma:**
```
Usuario toca deep link sin sesión → login → navegación a /o/gasto/1
→ permisoGuard ejecuta ANTES que PermissionService termine de cargar permisos
→ Guard rechaza incorrectamente → redirect a /home
```

**Causa:** `permisoGuard` espera max 5s (línea 35: `timeout({ first: 5000 })`), pero red lenta puede tardar más.

**Mitigación:** Ya implementada en mobile (líneas 33-40: espera con timeout + fallback).

**Test crítico:** En 4G lento, tocar deep link sin sesión → login → verificar que NO se redirija a /home por timeout de permisos.

---

## 7. Matriz de Compatibilidad: Desktop vs Mobile

| Aspecto | Desktop (Plan) | Mobile (Realidad) | Compatibilidad |
|---------|----------------|-------------------|----------------|
| **Routing** | Hash (`#/`) + tabs/dialogs | Rutas estándar (`/`) | ❌ Incompatible |
| **Compra detalle** | Tab (`CompraDetalleComponent`) | Página (`CompraDetallePage`) | ✅ Equivalente |
| **Gasto detalle** | Dialog readonly | Form editar (sin readonly) | ⚠️ Falta modo ver |
| **Vale detalle** | Dialog readonly | Lista (sin detalle) | ❌ Falta página |
| **Pago consolidado** | Dialog | NO EXISTE | ❌ Falta UI |
| **Login returnUrl** | Implementar en plan | YA funciona | ✅ Ahead |
| **Auth guard** | Verificar | YA funciona | ✅ Ahead |
| **Permiso guard** | NO existía | YA funciona | ✅ Ahead |
| **Permisos seed** | Agregar 3 nuevos | YA existen | ✅ Ahead |
| **RPC backend** | IPC local | HTTP remoto | ✅ Mismos handlers |

**Resumen:** Mobile tiene **mejor** guards/permisos que desktop, pero le falta **UI** para 2 de 4 tipos (vale, pago) y **modo readonly** para gasto.

---

## 8. Propuesta de Plan Mobile (Adaptado)

### 8.1. URL Scheme Mobile

**Propuesta:** Usar rutas Angular estándar **sin hash**:

```
https://app.frc-gourmet.com/o/compra/1
https://app.frc-gourmet.com/o/gasto/1
https://app.frc-gourmet.com/o/vale/1
https://app.frc-gourmet.com/o/pago/1  (error amigable)
```

**Ventaja:** Más limpio, compatible con PWA share API, mejor SEO (si aplica).

**Desventaja:** Desktop y mobile tienen URL diferentes (desktop usa `#/o/`, mobile usa `/o/`).

**Decisión:** Gabriel debe decidir si:
- **Opción A:** Bot envía links distintos según dispositivo (detectar por User-Agent).
- **Opción B:** Mobile intercepta `#` y lo remueve (más complejo, menos limpio).

---

### 8.2. Fases de Implementación Mobile

#### Fase M1: Infraestructura (rutas `/o/*`)

- Agregar rutas en `app.routes.ts`:
  ```typescript
  { path: 'o/compra/:id', redirectTo: '/compras/lista/:id', pathMatch: 'full' },
  { path: 'o/gasto/:id', loadComponent: () => import('./pages/financiero/gastos/gasto-detalle.page'), data: { permiso: 'FINANCIERO_GASTO_VER' } },
  { path: 'o/vale/:id', loadComponent: () => import('./pages/rrhh/vales/vale-detalle.page'), data: { permiso: 'RRHH_VALE_VER' } },
  { path: 'o/pago/:id', loadComponent: () => import('./pages/error/feature-not-available.page') },
  ```

**Test:** Navegar manualmente a `/o/compra/1` → debe redirigir a `/compras/lista/1`.

---

#### Fase M2: Compra (alias)

- Ya existe `/compras/lista/:id` → solo agregar redirect desde `/o/compra/:id`.

**Test:** Deep link desde WhatsApp → debe abrir detalle de compra.

---

#### Fase M3: Gasto (crear página detalle)

- Crear `GastoDetallePage` (análoga a `CompraDetallePage`):
  - Mostrar cabecera (categoría, fecha, descripción, proveedor, comprobante).
  - Tabla de detalles (moneda, forma de pago, monto).
  - Adjuntos (comprobantes).
  - Botones: "Editar" (si tiene permiso) y "Anular" (si tiene permiso).

**Test:** Deep link `/o/gasto/1` → debe abrir detalle readonly, botón "Editar" navega a `/financiero/gastos/1/editar`.

---

#### Fase M4: Vale (crear página detalle)

- Crear `ValeDetallePage`:
  - Mostrar cabecera (funcionario, motivo, monto, moneda, fecha, estado).
  - Botones según estado y permisos:
    - SOLICITADO + permiso → "Confirmar" (abre dialog confirmación).
    - SOLICITADO/CONFIRMADO + permiso → "Anular" (prompt).
    - Siempre → "Volver".

**Test:** Deep link `/o/vale/1` → debe abrir detalle, botones según estado.

---

#### Fase M5: Pago (error amigable)

- Crear `FeatureNotAvailablePage` genérica:
  - Icono warning.
  - Mensaje configurable vía route data.
  - Botón "Ir a inicio" + link a docs.

**Test:** Deep link `/o/pago/1` → debe mostrar "Solo en desktop" con link a docs.

---

#### Fase M6: Tests E2E

- Test T1 mobile: Compra → link funciona, redirige correcto.
- Test T2 mobile: Gasto → página detalle, modo readonly, botón "Editar".
- Test T3 mobile: Vale → página detalle, botones según permisos.
- Test T4 mobile: Pago → error amigable, botón "Ir a inicio" funciona.
- Test T5 mobile: Sin sesión → returnUrl funciona (ya implementado).

---

## 9. Riesgos Específicos Mobile

### R1: PWA manifest y deep links

**Riesgo:** Si PWA está instalada, el OS (Android/iOS) puede no reconocer links `https://app.frc-gourmet.com/o/*` como de la app → abre en navegador externo.

**Mitigación:** Verificar `manifest.json`:
```json
{
  "start_url": "/",
  "scope": "/",
  "display": "standalone"
}
```

Y configurar "Universal Links" (iOS) / "App Links" (Android) en el servidor web (fuera de alcance de este repo).

---

### R2: Service Worker cache

**Riesgo:** SW cachea `/o/*` → usuario offline toca link → página cached sin datos → UX rota.

**Mitigación:** En `ngsw-config.json`, rutas `/o/*` deben ser **network-first**:
```json
{
  "dataGroups": [
    {
      "name": "api-freshness",
      "urls": ["/api/rpc", "/o/*"],
      "cacheConfig": { "strategy": "freshness", "maxAge": "0" }
    }
  ]
}
```

---

### R3: WhatsApp In-App Browser

**Riesgo:** WhatsApp abre links en navegador interno (webview) que puede tener cookies/session separadas → usuario ya logueado en Chrome NO está logueado en WhatsApp webview.

**Mitigación:** Educación al usuario (docs): "Toca 'Abrir en navegador' en WhatsApp para mantener sesión".

**Test crítico:** Loguearse en Chrome mobile → tocar link de WhatsApp → verificar si mantiene sesión o pide login.

---

## 10. Conclusión y Recomendaciones

### 10.1. Veredicto Final

**El plan `PLAN-DEEP-LINKS-OPS.md` NO es implementable tal cual en mobile PWA** debido a diferencias arquitecturales críticas (tabs/dialogs vs routing estándar) y falta de UI para 2 de 4 tipos.

**Implementación mobile requiere:**
1. **Crear 2 páginas nuevas:** `GastoDetallePage`, `ValeDetallePage`.
2. **Agregar 4 rutas:** `/o/compra`, `/o/gasto`, `/o/vale`, `/o/pago`.
3. **Error amigable para pago** (o crear `PagoConsolidadoDetallePage` si Gabriel lo exige).
4. **Decidir URL scheme:** con hash (`#/o/`) o sin hash (`/o/`).

**Tiempo estimado:** 8-12 horas implementación + 4 horas tests → **~2 días de trabajo**.

---

### 10.2. TOP 3 Hallazgos (Resumen)

| # | Hallazgo | Path | Prioridad |
|---|----------|------|-----------|
| 1 | **Pago consolidado NO existe en mobile** | `projects/mobile/src/app/pages` (búsqueda sin resultados) | P0 |
| 2 | **Arquitectura incompatible (tabs vs routing)** | `projects/mobile/src/app/app.routes.ts` vs desktop `TabsService` | P0 |
| 3 | **Gasto/Vale sin modo read-only** | `projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.page.ts` líneas 113-115 | P1 |

---

### 10.3. Recomendaciones Finales

1. **Gabriel debe decidir alcance mobile:**
   - **Opción A (mínima):** Solo compra + gasto + vale (pago → error).
   - **Opción B (completa):** Los 4 tipos (agregar pago consolidado UI).

2. **Gabriel debe decidir URL scheme:**
   - **Opción A (sin hash):** `https://app.frc-gourmet.com/o/compra/1` (recomendado mobile).
   - **Opción B (con hash):** `https://app.frc-gourmet.com/#/o/compra/1` (paridad desktop).

3. **Implementar plan mobile separado** (`PLAN-DEEP-LINKS-OPS-MOBILE.md`) basado en este audit, con fases M1-M6.

4. **Tests críticos mobile:**
   - T1-T4: funcionalidad por tipo.
   - T5: returnUrl con cold start.
   - T6: WhatsApp In-App Browser (sesión).

---

**Fin de auditoría B. Path del archivo: `docs/planes/AUDIT-PLAN-DEEP-LINKS-OPS-MOBILE-B.md`.**
