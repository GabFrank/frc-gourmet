# Plan: Deep Links para Operaciones — MOBILE (PWA)

**Fecha:** 2026-09-15  
**Autor:** Cloud Agent (PLANNER)  
**Estado:** DRAFT — pendiente auditoría + aprobación  
**Branch:** `cursor/plan-deep-links-ops-259f`  
**Contexto:** El trabajo de deep links para **desktop** (`src/app`) ya está en esta misma branch (PR #305). Este plan cubre **solo la paridad mobile** (`projects/mobile`, PWA en `https://app.frc-gourmet.com/`).

---

## 1. Problema / Why (alcance mobile)

### Caso de uso real: WhatsApp → móvil

El bot de operaciones de WhatsApp crea/paga registros (compra, gasto, vale, pago consolidado) y reporta al usuario con un mensaje + deep link:

```
✅ Gasto registrado: #1234 — MANTENIMIENTO LOCAL — 450.000 Gs
🔗 Ver: https://app.frc-gourmet.com/#/o/gasto/1234
```

**Contexto:** el usuario está fuera de la oficina (móvil en mano), NO tiene acceso a la desktop app. Necesita verificar/aprobar la operación desde el móvil.

**Problema actual:** la **PWA mobile** (`projects/mobile`) **no intercepta** el hash `#/o/{tipo}/{id}`. El usuario toca el link, pero la app mobile:
- Lo ignora (si ya tiene sesión) — queda en Home sin abrir nada.
- O redirige a login pero **no retorna** al deep link post-autenticación.

**Objetivo:** que el deep link funcione igual que en desktop:
- **Con sesión activa:** abre directamente el registro (página/dialog).
- **Sin sesión:** redirige a login con `returnUrl`, y después del login navega automáticamente al registro.

### Alcance de este plan

**Solo mobile.** El trabajo desktop (PR #305) ya está completo y se queda:
- Desktop (`src/app`) → `DeepLinkService` + hash interceptor en `AppComponent` → done.
- Mobile (`projects/mobile`) → **falta** interceptor + páginas faltantes → **este plan**.

---

## 2. Arquitectura mobile actual (verificado)

### 2.1. LocationStrategy: PATH routing (NO hash)

Desktop usa `useHash: true` (`src/app/app-routing.module.ts`) porque corre sobre `file://` en Electron y el hash evita `ERR_FILE_NOT_FOUND`.

Mobile usa **path routing** (default de `provideRouter(routes)` en `projects/mobile/src/main.ts`):

```typescript
// main.ts línea 44
provideRouter(routes),
```

**NO hay `useHash: true` en mobile.** El router espera URLs como `https://app.frc-gourmet.com/compras/lista/123`, NO `#/compras/lista/123`.

### 2.2. Contrato de URL deep-link (mismo que desktop)

El bot de WhatsApp ya envía (y seguirá enviando):

```
https://app.frc-gourmet.com/#/o/{tipo}/{id}
```

**Razón del hash:** es el formato que desktop usa, y el bot es único para ambos clientes. **No podemos cambiar el bot a path routing** porque rompería desktop.

**Implicación:** mobile debe **interceptar el hash** `#/o/{tipo}/{id}` **aunque use path routing internamente**. El hash no activa el Router de Angular (el router ignora `#` en path mode) — hay que leerlo manualmente con `window.location.hash`.

### 2.3. Auth: returnUrl ya funciona

El `authGuard` (`projects/mobile/src/app/core/guards/auth.guard.ts`) ya redirige a `/login` con `queryParams: { returnUrl: state.url }` (línea 14).

La `LoginPage` (`projects/mobile/src/app/pages/login/login.page.ts`) ya lee `returnUrl` y navega post-login (línea 47):

```typescript
const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
await this.router.navigateByUrl(returnUrl);
```

**Implicación:** si el deep link genera una ruta válida (ej. `/compras/lista/123`), el ciclo `authGuard` → login → `returnUrl` funciona sin cambios. **Pero el hash `#/o/{tipo}/{id}` no es una ruta de Angular** — necesitamos un interceptor que lo traduzca.

### 2.4. Páginas de detalle actuales

| Tipo | Página/dialog en mobile | Ruta | Estado |
|------|------------------------|------|--------|
| **compra** | `CompraDetallePage` | `/compras/lista/:id` | ✅ **Existe** (full-screen) |
| **gasto** | `GastoFormPage` | `/financiero/gastos/:gastoId/editar` | ⚠️ Solo form editar, **NO hay readonly** |
| **vale** | `ValesListPage` + `ConfirmarValeDialogComponent` | `/rrhh/vales` (listado) | ❌ **NO hay ruta de detalle** |
| **pago** | — | — | ❌ **NO existe** en mobile |

**Hallazgos clave:**
1. **Compra**: listo, solo falta el interceptor del hash.
2. **Gasto**: falta crear una **ruta de detalle readonly** (ej. `/financiero/gastos/:id`). El form editar NO sirve (requiere permisos de escribir, altera el estado).
3. **Vale**: falta crear una **ruta de detalle** (ej. `/rrhh/vales/:id`). El dialog `ConfirmarValeDialogComponent` NO sirve (es para confirmar, no para ver).
4. **Pago consolidado**: **NO existe en mobile** — fuera de alcance de este plan. El deep link `#/o/pago/{id}` debe mostrar un mensaje de "esta operación solo se puede ver en desktop".

---

## 3. Mapa URL → ruta mobile

### Contrato de deep link (externo, fijo)

```
https://app.frc-gourmet.com/#/o/{tipo}/{id}
```

Donde `{tipo}` ∈ `{compra, gasto, vale, pago}`.

### Traducción hash → ruta interna

El **interceptor de hash** en mobile debe:
1. Leer `window.location.hash`.
2. Si empieza con `#/o/`, parsear `tipo` e `id`.
3. Traducir a una ruta de Angular path routing:

| Hash (externo) | Ruta interna (Angular) | Componente | Gate |
|----------------|------------------------|-----------|------|
| `#/o/compra/123` | `/compras/lista/123` | `CompraDetallePage` | `COMPRAS_VER` |
| `#/o/gasto/456` | `/financiero/gastos/456` | `GastoDetallePage` **(nueva)** | `FINANCIERO_GASTO_VER` |
| `#/o/vale/789` | `/rrhh/vales/789` | `ValeDetallePage` **(nueva)** | `RRHH_VALE_VER` |
| `#/o/pago/111` | `/error-pago-mobile` | `ErrorPagoMobileComponent` **(nueva)** | ninguno (público) |

4. Navegar con `router.navigateByUrl(rutaInterna)`.

**Nota:** el Router de Angular (path mode) **ignora el hash** — nunca matchea `#/o/compra/123` como una ruta. Por eso el interceptor debe **traducir** el hash a una ruta path antes de navegar.

---

## 4. Sesión / returnUrl / authGuard (sin cambios)

### 4.1. Ciclo con sesión activa

1. Usuario toca `https://app.frc-gourmet.com/#/o/compra/123` en WhatsApp.
2. PWA carga (o ya estaba abierta).
3. **Interceptor** en `AppComponent` lee `window.location.hash` → `#/o/compra/123`.
4. Parsea → `{ tipo: 'compra', id: 123 }`.
5. Traduce a ruta interna → `/compras/lista/123`.
6. Navega: `this.router.navigateByUrl('/compras/lista/123')`.
7. El `authGuard` valida sesión → OK.
8. `permisoGuard` valida `COMPRAS_VER` → OK.
9. Se carga `CompraDetallePage` con `id: 123`.

### 4.2. Ciclo sin sesión

1. Usuario toca el link, pero **no tiene sesión** (o la sesión expiró).
2. **Interceptor** lee el hash → traduce a `/compras/lista/123`.
3. Navega: `this.router.navigateByUrl('/compras/lista/123')`.
4. `authGuard` detecta `!auth.isLoggedIn` → **intercepta**.
5. Redirige a `/login?returnUrl=/compras/lista/123`.
6. Usuario se loguea.
7. `LoginPage.submit()` lee `returnUrl` → `/compras/lista/123`.
8. Navega: `this.router.navigateByUrl('/compras/lista/123')`.
9. `authGuard` valida sesión → OK.
10. `CompraDetallePage` se carga.

**Sin cambios en `authGuard` ni `LoginPage`** — el mecanismo `returnUrl` ya existe y funciona.

### 4.3. Interceptación del hash: ¿cuándo?

Necesitamos interceptar el hash en **dos momentos**:

1. **Cold start con hash** (usuario abre la PWA por primera vez, la URL ya tiene el hash).
2. **Mid-session** (usuario toca un link de WhatsApp estando ya en la app).

**Dónde:** en el componente raíz **`AppComponent`** (`projects/mobile/src/app/app.component.ts`).

**Listeners:**
- `ngOnInit()`: leer `window.location.hash` si el hash ya está al cargar (cold start).
- `window.addEventListener('hashchange', ...)`: detectar cambios mid-session (usuario toca link estando logueado).

**Diferencia con desktop:** desktop usa `router.events` (`NavigationEnd`) porque el hash es parte de la navegación. Mobile usa path routing, así que `NavigationEnd` **no se dispara** cuando cambia el hash — hay que escuchar `hashchange` directamente.

---

## 5. Readonly / permisos (alineados a desktop)

| Tipo | Permiso de lectura | Superficie | Readonly |
|------|-------------------|-----------|----------|
| **compra** | `COMPRAS_VER` | Página full-screen (`CompraDetallePage`) | Sí (no editable, solo Finalizar/Anular con `COMPRAS_GESTIONAR`) |
| **gasto** | `FINANCIERO_GASTO_VER` | Página full-screen **(nueva)** `GastoDetallePage` | **Sí** (readonly puro, sin editar/anular) |
| **vale** | `RRHH_VALE_VER` | Página full-screen **(nueva)** `ValeDetallePage` | **Sí** (readonly puro, sin confirmar/anular) |
| **pago** | ninguno | Página **(nueva)** `ErrorPagoMobileComponent` | N/A (solo mensaje) |

### Dual-check en handlers (ya hecho en desktop)

Los handlers IPC (`get-gasto`, `get-vale`) ya tienen dual-check de permisos (PR #305):
- `get-gasto`: acepta `FINANCIERO_GASTO_VER` **O** `CAJA_MAYOR_OPERAR` (legacy).
- `get-vale`: acepta `RRHH_VALE_VER` **O** `RRHH_VALE_CONFIRMAR` (legacy).

Mobile reutiliza esos handlers vía HTTP (`/api/rpc`) → **sin cambios backend**.

### Permisos nuevos (ya seeded en desktop)

Los permisos `FINANCIERO_GASTO_VER`, `RRHH_VALE_VER`, `FINANCIERO_PAGO_CONSOLIDADO_VER` ya se seeded en `electron/handlers/permissions.handler.ts` (PR #305). Mobile los leerá vía `PermissionService`.

### Páginas readonly: comportamiento

**Gasto detalle** (`GastoDetallePage`):
- Muestra cabecera: fecha, caja mayor, moneda, monto, estado (confirmado/anulado).
- Lista de detalles: categoría + descripción + monto.
- **NO muestra adjuntos** (mobile no tiene `<app-file-upload>`).
- **NO hay botón Editar** (readonly puro).
- **NO hay botón Anular** (requiere `CAJA_MAYOR_OPERAR`, fuera de alcance de lectura).

**Vale detalle** (`ValeDetallePage`):
- Muestra cabecera: funcionario, motivo, fecha, monto, moneda, estado.
- Campo `descripcion` (si hay).
- Flag `esAdelanto` (chip visual).
- **NO hay botón Confirmar** (requiere `RRHH_VALE_CONFIRMAR`).
- **NO hay botón Anular** (requiere `RRHH_VALE_CONFIRMAR`).

**Pago consolidado** (`ErrorPagoMobileComponent`):
- Card con mensaje: "Esta operación solo puede verse en la aplicación de escritorio."
- Botón "Volver" → navega a Home (`/`).

---

## 6. Fases concretas + gates

### Fase 1: Interceptor de hash en mobile

**Archivos nuevos:**
- `projects/mobile/src/app/core/services/deep-link.service.ts` — nuevo servicio para parsear y traducir hash → ruta.

**Cambios:**
- `projects/mobile/src/app/app.component.ts`:
  - Inyectar `DeepLinkService`, `Router`, `AuthService`.
  - En `ngOnInit()`: leer `window.location.hash`, si empieza con `#/o/` → llamar a `deepLinkService.translateAndNavigate(hash)`.
  - En `ngOnInit()` o `ngAfterViewInit()`: agregar `window.addEventListener('hashchange', (e) => { ... deepLinkService.translateAndNavigate(e.newURL) })`.

**`DeepLinkService.translateAndNavigate(url: string)`:**
1. Extraer el hash de la URL (puede ser la URL completa o solo el hash).
2. Parsear `#/o/{tipo}/{id}` → `{ tipo, id }`.
3. Validar: `tipo` ∈ `{compra, gasto, vale, pago}`, `id` > 0.
4. Traducir a ruta path:
   - `compra` → `/compras/lista/${id}`
   - `gasto` → `/financiero/gastos/${id}`
   - `vale` → `/rrhh/vales/${id}`
   - `pago` → `/error-pago-mobile`
5. Navegar: `this.router.navigateByUrl(rutaPath)`.
6. Si el hash es inválido → `console.warn` + no hacer nada.

**Gate:** compilar mobile (`npx ng build mobile --configuration production`) sin errores.

---

### Fase 2: Página de detalle de Gasto (readonly)

**Archivos nuevos:**
- `projects/mobile/src/app/pages/financiero/gastos/gasto-detalle.page.ts`
- `projects/mobile/src/app/pages/financiero/gastos/gasto-detalle.page.html`
- `projects/mobile/src/app/pages/financiero/gastos/gasto-detalle.page.scss`

**Cambios en rutas:**
- `projects/mobile/src/app/app.routes.ts`:
  - Agregar ruta (dentro del shell, después de las rutas de form de gasto):
    ```typescript
    {
      path: 'financiero/gastos/:id',
      canActivate: [authGuard, permisoGuard],
      data: { permiso: 'FINANCIERO_GASTO_VER' },
      loadComponent: () => import('./pages/financiero/gastos/gasto-detalle.page').then((m) => m.GastoDetallePage),
    },
    ```

**Componente `GastoDetallePage`:**
- Lee `id` de `ActivatedRoute.snapshot.params['id']`.
- Llama al handler `get-gasto` (ya existe, dual-check de permisos).
- Muestra cabecera + detalles en cards Material.
- **NO muestra adjuntos** (mobile no tiene visor).
- **NO hay botones de editar/anular** (readonly).
- Botón "Volver" (ícono `<-` en toolbar) → `location.back()`.

**Gate:** cargar `/financiero/gastos/123` en browser mobile viewport (F12 device toolbar) → ve el gasto.

---

### Fase 3: Página de detalle de Vale (readonly)

**Archivos nuevos:**
- `projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.ts`
- `projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.html`
- `projects/mobile/src/app/pages/rrhh/vales/vale-detalle.page.scss`

**Cambios en rutas:**
- `projects/mobile/src/app/app.routes.ts`:
  - Agregar ruta (dentro del shell, después del listado de vales):
    ```typescript
    {
      path: 'rrhh/vales/:id',
      canActivate: [authGuard, permisoGuard],
      data: { permiso: 'RRHH_VALE_VER' },
      loadComponent: () => import('./pages/rrhh/vales/vale-detalle.page').then((m) => m.ValeDetallePage),
    },
    ```

**Componente `ValeDetallePage`:**
- Lee `id` de `ActivatedRoute.snapshot.params['id']`.
- Llama al handler `get-vale` (ya existe, dual-check).
- Muestra cabecera: funcionario, motivo, fecha, monto, moneda, estado, `esAdelanto`.
- Campo `descripcion` si hay.
- **NO hay botones de confirmar/anular** (readonly).
- Botón "Volver" → `location.back()`.

**Gate:** cargar `/rrhh/vales/789` → ve el vale.

---

### Fase 4: Página de error para Pago Consolidado

**Archivos nuevos:**
- `projects/mobile/src/app/pages/error/error-pago-mobile.component.ts`
- `projects/mobile/src/app/pages/error/error-pago-mobile.component.html`
- `projects/mobile/src/app/pages/error/error-pago-mobile.component.scss`

**Cambios en rutas:**
- `projects/mobile/src/app/app.routes.ts`:
  - Agregar ruta **fuera del shell** (sin `authGuard`, público):
    ```typescript
    {
      path: 'error-pago-mobile',
      loadComponent: () => import('./pages/error/error-pago-mobile.component').then((m) => m.ErrorPagoMobileComponent),
    },
    ```

**Componente `ErrorPagoMobileComponent`:**
- Card Material con ícono `error_outline` + mensaje:
  ```
  Esta operación solo puede verse en la aplicación de escritorio.
  ```
- Botón "Volver" → navega a `/`.

**Gate:** cargar `/error-pago-mobile` → ve el mensaje.

---

### Fase 5: Test de integración E2E (manual)

**Sandbox:** `https://app.frc-gourmet.com` (prod) o `http://localhost:4200` (dev mobile con `npx ng serve mobile`).

**Device:** browser con F12 device toolbar en mobile viewport (Pixel 5, iPhone 12, etc.) o PWA instalada.

**Casos:**

1. **Compra con sesión:**
   - Loguear.
   - Abrir consola: `window.location.hash = '#/o/compra/1'`.
   - Verificar: navega a `CompraDetallePage`, muestra compra #1.

2. **Gasto sin sesión:**
   - Cerrar sesión.
   - Abrir `https://app.frc-gourmet.com/#/o/gasto/5` (link directo).
   - Verificar: redirige a login.
   - Loguear.
   - Verificar: navega a `GastoDetallePage`, muestra gasto #5.

3. **Vale mid-session:**
   - Loguear.
   - Navegar a Home.
   - Tocar link de WhatsApp (simular: abrir nueva pestaña con `#/o/vale/10`).
   - Verificar: abre `ValeDetallePage`, muestra vale #10.

4. **Pago consolidado:**
   - Abrir `https://app.frc-gourmet.com/#/o/pago/999`.
   - Verificar: muestra `ErrorPagoMobileComponent` con mensaje.

5. **Hash inválido:**
   - `window.location.hash = '#/o/invalido/123'`.
   - Verificar: `console.warn`, no navega (queda donde estaba).

6. **ID no numérico:**
   - `window.location.hash = '#/o/compra/abc'`.
   - Verificar: `console.warn`, no navega.

**Gate:** los 6 casos pasan.

---

### Fase 6: Documentación + actualización de PR

**Cambios:**
- Agregar sección "Deep Links Mobile" al plan desktop (`docs/planes/PLAN-DEEP-LINKS-OPS.md`) con link a este plan.
- Actualizar la skill `frc-gourmet-expert` (`architecture/mobile-pwa.md`) con la nueva capacidad de deep links mobile.

**Gate:** `npm run check` pasa (AOT prod build desktop + mobile).

---

## 7. Test UI: sandbox Gourmet

**Entorno:** `https://app.frc-gourmet.com` (sandbox prod) o `http://localhost:4200` (dev).

**Viewport:** browser F12 device toolbar (mobile) o PWA instalada en Android/iOS.

**NO asumir Electron tabs** — mobile es web/PWA, no tiene `TabsService`. Todo es routing de Angular (páginas full-screen) o dialogs.

**Casos de test:** ver Fase 5 arriba.

---

## 8. Riesgos

### 8.1. PWA y Service Worker

Mobile tiene un Service Worker mínimo (`projects/mobile/src/sw.js`) para cumplir los requisitos de instalabilidad. **NO cachea rutas** (no es un SW offline-first). El SW actual es un no-op:

```javascript
// sw.js (actual)
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', () => { self.clients.claim(); });
```

**Riesgo:** si el SW se actualiza en el futuro para cachear rutas, debe **dejar pasar** las nuevas rutas de detalle (`/financiero/gastos/:id`, `/rrhh/vales/:id`, `/error-pago-mobile`) sin cachearlas (son dinámicas, requieren auth).

**Mitigación:** en este plan el SW no cambia. Cuando se implemente caching, agregar las rutas de detalle a la blacklist del SW.

### 8.2. Hash vs Path routing (mismatch)

Desktop usa hash routing (`useHash: true`), mobile usa path routing. El deep link **externo** usa hash (`#/o/{tipo}/{id}`). Esto requiere **traducción manual** en mobile.

**Riesgo:** si el bot cambia el formato de URL a path puro (ej. `https://app.frc-gourmet.com/o/compra/123` sin hash), el interceptor de mobile deja de funcionar.

**Mitigación:** el contrato de URL (`#/o/{tipo}/{id}`) está documentado en este plan y en el plan desktop. Cualquier cambio en el bot requiere coordinar con este plan. **No cambiar el formato sin actualizar ambos clientes.**

### 8.3. Tipos sin UI mobile (vale, pago)

- **Vale:** en este plan se crea `ValeDetallePage` (readonly). OK.
- **Pago consolidado:** **NO existe en mobile** y no se implementará (fuera de alcance). El deep link muestra un error amigable.

**Riesgo:** si el bot envía deep links de pago consolidado, el usuario móvil ve el mensaje "solo desktop". Esto es **intencional** (pago consolidado es complejo, requiere UI financiera avanzada, no es prioritario en mobile).

**Mitigación:** el mensaje del error debe ser claro y amigable. Si en el futuro se implementa pago consolidado en mobile, solo hay que agregar la ruta en `DeepLinkService.translateAndNavigate()` (una línea) y crear la página.

### 8.4. Permisos faltantes en usuarios legacy

Los permisos `FINANCIERO_GASTO_VER`, `RRHH_VALE_VER` se seedean automáticamente en nuevas BDs, pero **usuarios legacy** (BDs pre-PR #305) no los tienen.

**Riesgo:** un usuario legacy sin `FINANCIERO_GASTO_VER` toca el deep link → el `permisoGuard` lo rechaza → error "No tiene permisos".

**Mitigación:** los handlers usan **dual-check** (aceptan el permiso nuevo O el legacy). Ejemplo:
- `get-gasto`: acepta `FINANCIERO_GASTO_VER` **O** `CAJA_MAYOR_OPERAR`.
- `get-vale`: acepta `RRHH_VALE_VER` **O** `RRHH_VALE_CONFIRMAR`.

Los usuarios legacy con `CAJA_MAYOR_OPERAR` o `RRHH_VALE_CONFIRMAR` pueden ver gastos/vales sin necesidad de asignar el permiso nuevo manualmente.

**Pendiente:** el `permisoGuard` de mobile solo valida el permiso de la ruta (ej. `FINANCIERO_GASTO_VER`). Si el usuario no tiene ese permiso pero tiene el legacy (`CAJA_MAYOR_OPERAR`), el guard lo rechaza **antes de llegar al handler** (que sí acepta ambos).

**Solución:** modificar el `permisoGuard` de mobile para aceptar **arrays de permisos** (OR lógico):

```typescript
// En app.routes.ts:
data: { permiso: ['FINANCIERO_GASTO_VER', 'CAJA_MAYOR_OPERAR'] }

// En permiso.guard.ts:
const requiredPermisos = route.data['permiso'];
if (Array.isArray(requiredPermisos)) {
  return requiredPermisos.some(p => permissionService.has(p));
}
```

Esto alinea el comportamiento del guard con el dual-check del handler.

### 8.5. Adjuntos en mobile

Desktop muestra adjuntos (imágenes, PDFs) de gastos vía `<app-file-upload>` y el visor `<app-document-viewer>`. Mobile **NO tiene** esos componentes.

**Riesgo:** el usuario toca el deep link de un gasto con adjuntos, pero en mobile no puede verlos.

**Mitigación:** la página `GastoDetallePage` **no muestra la sección de adjuntos**. Si el usuario necesita ver adjuntos, debe abrir el gasto en desktop. El mensaje no es necesario (el usuario no ve que falta algo si no se muestra).

**Alternativa futura:** mostrar un mensaje "Adjuntos: X archivos (ver en desktop)" con un chip. Fuera de alcance de este plan.

---

## 9. Out of scope (NO implementar ahora)

1. **Pago consolidado en mobile** — complejidad alta, UI financiera avanzada. El deep link muestra error amigable.
2. **Editar desde deep link** — todos los deep links abren **readonly**. Para editar, el usuario debe navegar manualmente.
3. **Adjuntos en mobile** — no se muestran. Ver desktop si hay adjuntos.
4. **Deep links de otros tipos** (venta, mesa, comanda, etc.) — solo operaciones (compra, gasto, vale, pago) por ahora.
5. **Notificaciones push** — el bot no envía push, solo mensajes de WhatsApp con links. Fuera de alcance.
6. **Cambiar el formato de URL del bot** — el contrato `#/o/{tipo}/{id}` es fijo. No se cambia.

---

## 10. Definición de hecho (DoD)

- [ ] `DeepLinkService` mobile implementado (parsea hash → traduce a ruta path).
- [ ] Interceptor de hash en `AppComponent` mobile (cold start + `hashchange`).
- [ ] Ruta + página `GastoDetallePage` (readonly, sin adjuntos, sin editar).
- [ ] Ruta + página `ValeDetallePage` (readonly, sin confirmar/anular).
- [ ] Ruta + componente `ErrorPagoMobileComponent` (mensaje amigable).
- [ ] `permisoGuard` acepta arrays de permisos (OR lógico) para dual-check.
- [ ] Test E2E manual (6 casos) pasan en mobile viewport.
- [ ] `npx ng build mobile --configuration production` sin errores.
- [ ] `npm run check` (AOT desktop + mobile) sin errores.
- [ ] Documentación actualizada: este plan + skill `frc-gourmet-expert`.
- [ ] PR #305 actualizado: descripción nota "desktop done + mobile done".
- [ ] Sin regresiones en funcionalidad mobile existente.

---

## 11. Notas finales

- **Desktop done:** PR #305 ya tiene `DeepLinkService` + hash interceptor + páginas readonly de gasto/vale. Mobile replica la misma lógica pero adaptada a path routing.
- **Sin cambios backend:** los handlers `get-gasto`, `get-vale`, `get-pago-consolidado-detalle` ya existen y tienen dual-check de permisos. Mobile los consume vía HTTP (`/api/rpc`).
- **Sin cambios en el bot:** el formato `#/o/{tipo}/{id}` es fijo. El bot no necesita actualizarse.
- **Paridad parcial:** mobile NO implementa pago consolidado (out of scope). Los otros 3 tipos sí.
- **Test en prod:** el sandbox Gourmet (`https://app.frc-gourmet.com`) es prod-like. Los tests se hacen ahí o en `ng serve mobile` (localhost).

---

**Próximos pasos (después de este plan):**
1. Auditoría del plan (2 agentes independientes).
2. Aprobación de Gabriel.
3. Implementación por fases (commit+push cada fase).
4. Test E2E manual en sandbox.
5. Undraft PR #305 (desktop + mobile done).
6. Merge a `develop`.
