# AUDITORÍA PLAN A — Deep Links Ops Mobile (PR #305)

**Fecha:** 2026-09-15  
**Auditor:** Claude Sonnet 4.5 (Cloud Agent — AUDITOR A mobile)  
**Rama auditada:** `cursor/plan-deep-links-ops-259f`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/305  
**Plan auditado:** `docs/planes/PLAN-DEEP-LINKS-OPS.md`  
**Alcance (Eje A):** Verificar si el contrato URL WhatsApp del plan coincide con el routing real mobile, si las rutas destino existen, si auth/returnUrl matchea, si permisos están alineados, y si hay riesgos PWA/hash.  
**Modo:** solo auditoría, NO implementación.

---

## Veredicto: **CONTRADICCIÓN ARQUITECTÓNICA FUNDAMENTAL**

El plan declara un contrato URL `https://app.frc-gourmet.com/#/o/{tipo}/{id}` destinado a móviles via WhatsApp, pero la implementación del PR vive **exclusivamente en el desktop** (`src/app`, hash routing) mientras que la URL del plan apunta a la **PWA mobile** (`projects/mobile`, path routing sin hash). Las dos apps Angular son incompatibles en routing strategy y ninguna puede cumplir el contrato declarado.

---

## Resumen ejecutivo

| Criterio | Estado | Comentario |
|----------|--------|------------|
| Contrato URL correcto para mobile | ❌ **FAIL P0** | El plan dice `#/o/{tipo}/{id}` → cae en PWA mobile que usa path routing (ignora `#`) |
| Desktop implementó pero en hash | ✅ Implementado | Desktop `src/app` tiene `DeepLinkService` + hash interceptor |
| Rutas destino en mobile | ⚠️ **PARCIAL** | Mobile tiene `/compras/lista/:id`, `/financiero/gastos`, `/rrhh/vales`, pero NO `/o/{tipo}/{id}` |
| Auth/returnUrl mobile | ✅ **CORRECTO** | `authGuard` mobile escribe `returnUrl`; `LoginPage` lo lee y navega |
| Permisos mobile alineados | ⚠️ **GAPS** | `FINANCIERO_GASTO_VER` no usado; mobile gatea por `CAJA_MAYOR_OPERAR` |
| Desktop auth/returnUrl | ❌ **ROTO** | `AuthGuard` no aplicado, `returnUrl` no escrito, intercept post-wildcard |
| PWA/SW/hash | ⚠️ **INCOMPATIBLE** | PWA usa `provideRouter(routes)` sin `useHash`; `#` no es ruta Angular |
| Fases/gates mobile | ❌ **AUSENTES** | Plan no menciona `npx ng build mobile`; PR no toca `projects/mobile/**` |
| Readonly UI mobile | ❓ **NO EXISTE** | Mobile no tiene diálogos de gastos/vales; son forms de página completa |

---

## Hallazgos (verificados contra código real)

### H1 — P0 — El URL del plan apunta a la PWA mobile, no al desktop

**Plan §1, §3:**
> URL: `https://app.frc-gourmet.com/#/o/gasto/1234`  
> Al tocar el enlace [desde el móvil]: Con sesión activa → abre directamente el registro

**Arquitectura real:**

| Path | Bundle servido | Router config | Branch actual |
|------|----------------|---------------|---------------|
| `/` | `dist/mobile` (PWA) | `provideRouter(routes)` **sin** `useHash` | **NO tocado** |
| `/admin/` | `dist/frc-gourmet-web` (desktop web) | `useHash: true` en `app-routing.module` | Implementado |
| Electron local | desktop nativo | `useHash: true` | Implementado |

**Archivo:** `electron/server/server.ts` L47-66

```typescript
/**
 * F2 (mobile PWA): carpeta con el bundle Angular de `projects/mobile`
 * (`dist/mobile`). Si existe, se sirve estáticamente en `/` para que los
 * dispositivos remotos abran la PWA desde el mismo server (same-origin con
 * la API).
 */
staticRoot?: string;  // → dist/mobile servido en `/`

/**
 * Frontend desktop servido como web (`dist/frc-gourmet-web`). Es el mismo
 * bundle Angular del desktop, buildeado con `--base-href /admin/` y un shim
 * HTTP en vez del preload de Electron. Si existe, se sirve en `/admin/` ...
 */
adminRoot?: string;   // → dist/frc-gourmet-web servido en `/admin/`
```

**Skill:** `.claude/skills/frc-gourmet-expert/architecture/mobile-pwa.md` L13-18

> | Hosting del bundle | Lo sirve el **propio Fastify** del nodo `server` |
> | Alcance MVP | Paridad CRUD de todo lo administrativo |

**Conclusión:**  
Un link `https://app.frc-gourmet.com/#/o/gasto/1234` abre el **mobile bundle** en `/`. El `#/o/...` es un fragmento HTML que Angular mobile **ignora** porque su router está configurado sin `useHash`.

---

### H2 — P0 — Mobile usa path routing; el fragmento `#` no es una ruta Angular

**Archivo:** `projects/mobile/src/main.ts` (verificado: no hay `useHash` en config)  
**Archivo:** `projects/mobile/src/app/app.routes.ts` L1-970

```typescript
export const routes: Routes = [
  { path: 'login', loadComponent: ... },
  { path: 'vincular-dispositivo', ... },
  // ... 80+ rutas con authGuard
  { path: '**', redirectTo: '' },
];

// En main.ts:
provideRouter(routes)  // SIN { useHash: true }
```

**Comportamiento real al abrir `/#/o/gasto/123` en mobile PWA:**

1. Router Angular lee el path como `/` (base del dominio).
2. El fragmento `#/o/gasto/123` **no entra** al router; es un ancla HTML pasivo.
3. Matchea `path: ''` → `HomePage`.
4. El usuario ve la pantalla de inicio, **no** el gasto.

**Skill mobile-pwa.md** L49:
> Con rutas por path, `history.pushState` ignora `<base href>` bajo `file://`... Con hash, la ruta viaja en el fragmento y `location` nunca se corrompe.

Esa razón aplica **solo** a Electron/desktop bajo `file://`. El mobile sirve por HTTP en LAN/WAN; no necesita hash. De hecho, el PR de mobile PWA (2026-05) eligió path routing explícitamente para URLs limpias en dispositivos táctiles.

---

### H3 — P1 — Desktop sí implementó, pero el plan no lo menciona como `/admin/`

**Archivos en el diff del PR:**
- `src/app/services/deep-link.service.ts` (nuevo, 210 líneas)
- `src/app/app.component.ts` (interceptor `NavigationEnd`)
- `src/app/auth/login/login.component.ts` (`navigateAfterLogin`)
- `create-edit-gasto-dialog.component.*` (modo `readonly`)
- `create-edit-vale-dialog.component.*` (modo `readonly`)

**No en el diff:**
- `projects/mobile/**` (cero archivos)

El desktop existe como:
1. App Electron nativa (hash routing, IPC handlers)
2. Web build en `/admin/` (hash routing, HTTP RPC)

El plan **asume** que el link WhatsApp abre el mobile (`app.frc-gourmet.com`), pero **implementa** el desktop. Si el CEO quisiera que el link abriera el desktop web, debería ser:

```
https://app.frc-gourmet.com/admin/#/o/gasto/1234
```

Ese path **no está en el plan ni en los ejemplos de Fase 1-8**. La auditoría A del desktop (AUDIT-DIFF-DEEP-LINKS-OPS-A.md) ya marcó esto como P0 de superficie WhatsApp.

---

### H4 — ⚠️ PARCIAL — Mobile tiene rutas equivalentes, pero NO el prefijo `/o/`

**Rutas mobile relevantes:**

| Tipo plan | Ruta mobile existente | Componente |
|-----------|----------------------|------------|
| `compra` | `/compras/lista/:id` | `CompraDetallePage` (full-screen) |
| `gasto` | `/financiero/gastos/nuevo`, `/financiero/gastos/:gastoId/editar` | `GastoFormPage` (full-screen) |
| `vale` | NO existe detalle por `:id` | `ValesListPage` (lista read-only) |
| `pago` | NO existe | — |

**Archivo:** `projects/mobile/src/app/app.routes.ts`

- L569-571: `compras/lista/:id` con `CompraDetallePage` (cabecera + ítems + cuotas)
- L466-476: `financiero/gastos/nuevo` / `financiero/gastos/:gastoId/editar` (full-screen form)
- L667-669: `rrhh/vales` lista (no hay ruta `rrhh/vales/:id` de detalle)
- L782-788: `financiero/caja-mayor/:id` detalle (podría abrir un pago consolidado desde ahí, pero sin deep link directo)

**Skill mobile-pwa.md §"Cobertura Caja Mayor mobile (2026-07-28)":**

> ✅ Operaciones financieras — form full-screen con los 5 tipos (cambio divisa, depósito/retiro bancario, transferencia entre cajas, transferencia bancaria) + lista + anular.
>
> ✅ **Pago de CxP** — `cxp-detalle.page` con cuotas + `pagar-cpp-dialog` (efectivo desde caja mayor, `COMPRAS_GESTIONAR`, via `pagar-cpp-cuota`).
>
> **Todavía NO implementado en mobile:**  
> 1. Cheques / chequeras (`emitir/cobrar/anular-cheque`)  
> 2. POS / acreditaciones bancarias  
> 3. Egreso caja inicial + abrir caja desde conteo  
> 4. Dashboard/KPIs de caja mayor

Mobile tiene **operaciones** de caja mayor (gasto, entrada varia, ajuste, vale, pagar compras), pero **no** deep link `/o/pago/{id}` ni dialog de detalle de pago consolidado standalone.

---

### H5 — ✅ CORRECTO — Auth/returnUrl mobile funciona (a diferencia del desktop)

**Archivo:** `projects/mobile/src/app/core/guards/auth.guard.ts` L1-21

```typescript
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (auth.currentUser?.mustChangePassword && !state.url.startsWith('/cambiar-password')) {
    return router.createUrlTree(['/cambiar-password']);
  }
  return true;
};
```

**Archivo:** `projects/mobile/src/app/pages/login/login.page.ts` L36-50

```typescript
async submit(): Promise<void> {
  // ...
  const result = await this.auth.login(nickname, password);
  if (result.success) {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
    await this.router.navigateByUrl(returnUrl);
  }
  // ...
}
```

**Contraste con desktop (AUDIT-DIFF-A §F3):**

> `AuthGuard` desktop no está cableado; `returnUrl` no se preserva.  
> `AppComponent` hace `this.router.navigate(['/login'])` — **sin** `queryParams.returnUrl`.

**Conclusión mobile:**  
Si mobile tuviera una ruta `/o/{tipo}/{id}` y el usuario sin sesión la abriera, el `authGuard` redirige a `/login?returnUrl=%2Fo%2F{tipo}%2F{id}` y después del login navegaría correctamente. El motor de returnUrl mobile **está listo**, lo que falta es el interceptor de deep links.

---

### H6 — ⚠️ GAPS — Permisos mobile: no usan `*_VER` seedeados en el PR

**Permisos nuevos en el PR (desktop):**  
`electron/handlers/permissions.handler.ts` L131-144

```typescript
{
  codigo: 'FINANCIERO_GASTO_VER',
  categoria: 'FINANCIERO',
  nombre: 'Ver gastos',
  descripcion: 'Permite ver el detalle de gastos registrados',
},
{
  codigo: 'RRHH_VALE_VER',
  categoria: 'RRHH',
  nombre: 'Ver vales',
  descripcion: 'Permite ver el detalle de vales y adelantos',
},
{
  codigo: 'FINANCIERO_PAGO_CONSOLIDADO_VER',
  categoria: 'FINANCIERO',
  nombre: 'Ver pagos consolidados',
  descripcion: 'Permite ver el detalle de pagos consolidados de Caja Mayor',
},
```

**Uso mobile actual:**

| Módulo mobile | Permiso gate ruta | Permiso handler | Gap |
|---------------|-------------------|-----------------|-----|
| `/financiero/gastos` | `CAJA_MAYOR_OPERAR` | `get-gasto` ahora exige `FINANCIERO_GASTO_VER` | ❌ Regresión |
| `/compras/lista/:id` | `COMPRAS_VER` | `getCompra` no tiene `ensurePermission` | ⚠️ Default-allow |
| `/rrhh/vales` | `RRHH_VALE_CREAR` | Lista usa `get-vales` (sin guard); detalle nuevo `get-vale` exige `RRHH_VALE_VER` | ❌ Mobile no puede ver detalle |
| Pago consolidado | No existe ruta directa | `get-pago-consolidado-detalle` ahora con check dual ad-hoc | ⚠️ Ver H5 de AUDIT-A |

**Archivo:** `projects/mobile/src/app/app.routes.ts` L760-765

```typescript
{
  path: 'financiero/gastos',
  canActivate: [permisoGuard],
  data: { title: 'Gastos', permiso: 'CAJA_MAYOR_OPERAR' },  // ← NO usa FINANCIERO_GASTO_VER
  loadComponent: () => import('./pages/financiero/gastos/gastos-list.page').then((m) => m.GastosListPage),
},
```

**Handler desktop:** `electron/handlers/caja-mayor.handler.ts` L1173-1174

```typescript
ipcMain.handle('get-gasto', async (event, id: number) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_GASTO_VER');  // ← Bloqueará mobile
```

**Consecuencia:**  
Un usuario mobile con rol GERENTE (tiene `CAJA_MAYOR_OPERAR`, no tiene `FINANCIERO_GASTO_VER` por falta de grant en `ROLES_PLANTILLA`) puede:
- Listar gastos (la lista no está gated por el handler)
- Abrir el form de edición `/financiero/gastos/:gastoId/editar` (porque la ruta solo chequea `CAJA_MAYOR_OPERAR`)
- Pero **fallaría** al cargar los datos del gasto si `GastoFormPage.ngOnInit()` llama `getGasto(id)` → FORBIDDEN

AUDIT-A desktop ya marcó esto como regresión P1. Mobile lo hereda porque comparte los handlers IPC vía `/api/rpc`.

---

### H7 — ⚠️ RIESGO PWA — Service Worker + offline

**Skill mobile-pwa.md §"Offline":**

> Sin server no hay acción: pantalla "sin conexión". El SW sólo cachea el app-shell.

Deep link toca por WhatsApp → HTTP request. Si el SW está activo y el móvil offline, el router carga (`/` matchea en cache), pero el RPC a `/api/rpc` falla → UI muestra error de red (ya existe `ConnectionService` + banner).

No es un bloqueante del motor de deep link, pero sí una condición de borde: **deep link offline = error graceful**, no ejecución diferida. El plan no lo contempla (§6 "Riesgos" menciona PWA pero no el caso offline).

---

### H8 — ❌ AUSENTE — Plan no menciona gates `ng build mobile`

**Plan §4 Fase 1-8:** todos los commits/tests asumen:
- Electron sandbox local
- DevTools console: `window.location.hash = '#/o/...'`
- T1-T8 con la "app desktop"

**Plan §5 Permisos, §7 Test plan:** cero mención de `projects/mobile`.

**GATE real del overlay:**  
`.cursor/environment.json` (no visible en el PR) probablemente define:

```json
{
  "install": "npm ci",
  "check": ["npm run build", "npm run check"],
  "start": "npm run electron:serve"
}
```

Si toca mobile, el gate sería `npx ng build mobile`. El PR **no toca mobile**, así que no aplica. Pero el **plan** dice "tocar mobile" (URL WhatsApp → PWA mobile), lo que es una contradicción.

---

### H9 — ❓ NO EXISTE — Mobile no tiene "dialogs readonly" de gastos/vales

**Desktop (implementado en PR):**
- `CreateEditGastoDialogComponent` con `data.readonly: true` → `form.disable()` + ocultar submit
- `CreateEditValeDialogComponent` con `data.readonly: true` + `loadVale()`

**Mobile (arquitectura actual):**
- Gastos: **página full-screen** `GastoFormPage` (`financiero/caja-mayor/ops/gasto-form.page.ts`)
- Vales: **lista read-only** `ValesListPage` (`pages/rrhh/vales/vales-list.page.ts`); NO hay página de detalle por `:id`

**Skill mobile-pwa.md §"UI / navegación":**

> Navegación con **Angular Router** (no TabsService). Forms full-screen = rutas top-level (antes del shell); listas/índices = hijos del shell.
>
> **Cards, nunca tablas** (sin scroll horizontal).

Mobile **no usa** `MatDialog` para formularios operativos (solo para confirmaciones/toasts). El equivalente de "abrir gasto readonly" en mobile sería:
1. Navegar a `/financiero/gastos/:gastoId/editar` con query param `?readonly=true`
2. O navegar a una nueva ruta `/financiero/gastos/:id` (vista de detalle)

Ninguna existe. El plan asume el patrón desktop (dialog con tab/dialog dedup) que mobile no replica.

---

## Matriz de compatibilidad URL plan vs implementación

| URL plan | Desktop (hash) | Mobile (path) | Funciona? |
|----------|----------------|---------------|-----------|
| `app.frc-gourmet.com/#/o/gasto/1` | Interceptor implementado; falla por wildcard + AOT | Ignora `#` → va a `/` | ❌ Ninguno |
| `app.frc-gourmet.com/admin/#/o/gasto/1` | Funcionaría tras fix wildcard + AOT | No aplica (no es `/admin`) | ⚠️ Solo desktop si se corrige |
| `app.frc-gourmet.com/o/gasto/1` | No es hash, desktop no lo lee | Ruta Angular no existe (wildcard → `''`) | ❌ Ninguno |
| `app.frc-gourmet.com/financiero/gastos/1/editar` | No aplicable | Existe; authGuard + returnUrl ✅; readonly no existe | ⚠️ Mobile ruta larga, sin prefix `/o` |

---

## Riesgos priorizados (P0/P1)

### P0 — Bloquea caso de uso principal

1. **URL contrato no funciona en ninguno de los dos bundles.**  
   - `/#/o/...` cae en mobile → ignora hash.  
   - Desktop implementado pero solo alcanzable vía `/admin/#/o/...` (no documentado).  
   - Bot de WhatsApp enviará link roto.

2. **Plan no aclara cuál es la superficie de entrada.**  
   - §1 "usuario desde su móvil" + "app mobile" → implica PWA.  
   - Implementación vive en `src/app` (desktop).  
   - Skill dice desktop = Electron + `/admin` web, mobile = PWA en `/`.

### P1 — Gaps alineación backend/permisos

3. **Handlers `get-gasto`/`get-vale` con permisos nuevos romperán mobile.**  
   - Mobile gatea ruta por `CAJA_MAYOR_OPERAR` / `RRHH_VALE_CREAR`.  
   - Handlers exigen `*_VER`.  
   - GERENTE no los tiene en `ROLES_PLANTILLA` (AUDIT-A §F6).

4. **CompraDetalle mobile vía deep link requiere rutas largas.**  
   - `/compras/lista/:id` es path válido mobile.  
   - Pero no es `/o/compra/:id` del plan → bot tendría que construir URL larga específica.

5. **Vale/Pago mobile no tienen detalle por `:id` hoy.**  
   - Plan asume 4 tipos (compra/gasto/vale/pago).  
   - Mobile solo tiene form editable de gasto + detalle de compra.  
   - Vale = lista; pago = no existe como ruta directa.

### P2 — Mejoras UX/docs

6. **Fase 7 (errores) no cubre offline PWA.**  
7. **Fase 8 (docs) debe separar desktop vs mobile si se decide soportar ambos.**  
8. **Test plan (T1-T8) solo cubre desktop Electron; falta checklist mobile táctil.**

---

## Propuesta de resolución (fuera de alcance de auditoría)

**Opción A — Deep links solo desktop web `/admin/`:**

1. Cambiar plan: URL es `https://app.frc-gourmet.com/admin/#/o/{tipo}/{id}`.
2. Corregir bugs P0 desktop (wildcard, AOT, returnUrl) según AUDIT-A + AUDIT-B.
3. Bot de WhatsApp construye `/admin/#/o/...` → abre desktop web en móvil (responsive OK-ish pero no táctil).
4. Mobile PWA queda fuera de alcance (usa rutas largas normales sin prefijo `/o`).

**Opción B — Deep links mobile path routing:**

1. Implementar `DeepLinkService` mobile sin hash: intercepta `/o/:tipo/:id` como **ruta Angular real**.
2. Mapear:
   - `/o/compra/:id` → `router.navigate(['/compras/lista', id])`
   - `/o/gasto/:id` → `router.navigate(['/financiero/gastos', id, 'editar'], { queryParams: { readonly: true } })`
   - `/o/vale/:id` → agregar `ValeDetallePage` nueva (no existe hoy)
   - `/o/pago/:id` → agregar `PagoConsolidadoDetallePage` nueva (no existe hoy)
3. Agregar readonly a `GastoFormPage` (vía query param).
4. Arreglar permisos: OR con `CAJA_MAYOR_OPERAR` en `get-gasto`, grant de `*_VER` en GERENTE.
5. Plan URL correcto: `https://app.frc-gourmet.com/o/gasto/1234` (sin `#`).

**Opción C — Soportar ambos:**

1. Desktop web → `/admin/#/o/{tipo}/{id}` (hash).
2. Mobile PWA → `/o/{tipo}/{id}` (path).
3. Bot decide según `User-Agent` o tiene dos templates de mensaje (uno para desktop, otro para mobile).
4. Requiere implementación doble + testing en ambos.

---

## Mínimo para salir de BLOCK (asumiendo Opción B: mobile como superficie principal)

1. **Decidir superficie:** documentar en plan que la URL target es mobile PWA, no desktop.
2. **Agregar ruta mobile `/o/:tipo/:id`** con guard que intercepta y redirige a rutas largas existentes.
3. **`GastoFormPage` readonly:** query param `?readonly=true` → `form.disable()` + ocultar submit.
4. **`ValeDetallePage` nueva:** o agregar param readonly a form existente si el form de vale existe (verificar).
5. **Permisos fix:** `get-gasto` con OR `['FINANCIERO_GASTO_VER', 'CAJA_MAYOR_OPERAR']` + grant `*_VER` en GERENTE.
6. **Tests mobile:** tocar link en WhatsApp real del móvil, verificar login+returnUrl, verificar carga de datos.
7. **Gate `ng build mobile`:** agregar a Fase 1-8 del plan + correr en CI.

---

## Anotación final

**Modelo usado:** Claude Sonnet 4.5 (default cloud agent auditor A).

**Top 3 hallazgos:**

1. **H1 (P0):** URL del plan `/#/o/...` apunta a mobile PWA que usa path routing → fragmento ignorado.
2. **H3 (P0):** Implementación vive en desktop (`src/app`), no en mobile (`projects/mobile`).
3. **H6 (P1):** Permisos nuevos `*_VER` sin grant en GERENTE + mobile usa `CAJA_MAYOR_OPERAR` → regresión compartida con desktop.

El eje A mobile confirma: **no hay plan mobile implementado, y el plan desktop apunta a la URL mobile por error arquitectónico de routing strategy**.

---

**Fin de auditoría A mobile. Commit + push a `cursor/plan-deep-links-ops-259f`.**
