# AUDITORÍA DIFF A — Deep Links Ops (PR #305)

**Fecha:** 2026-09-15  
**Auditor:** grok-4.6 (DIFF AUDITOR A)  
**Rama auditada:** `cursor/plan-deep-links-ops-259f` vs `origin/develop`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/305  
**Alcance (eje A):** motor/arquitectura de `DeepLinkService` + interceptor hash + AuthGuard/`returnUrl`; gates de permiso (`ensurePermission` / seed / UX fail-closed); poder discriminante de tests.  
**Modo:** solo auditoría. No se implementó ningún fix.  
**Veredicto:** **BLOCK**

HEAD auditado: `19358b1b` (`feat(deep-links): Fase 6 - integración AuthGuard + returnUrl (P0)`).  
Diff: 15 archivos, +1351/−33 (el grueso es el plan). **Cero archivos de test.** Fases 7–8 del plan siguen pendientes.

---

## Resumen ejecutivo

El PR describe un flujo WhatsApp → `#/o/{tipo}/{id}` → tab/dialog, con login+`returnUrl` si no hay sesión. El código **no puede cumplir ese contrato** contra el routing real del desktop ni contra la PWA que el plan declara como superficie de entrada.

Tres roturas de motor son independientes y cada una sola ya bloquea:

1. El wildcard `{ path: '**', redirectTo: '' }` **se come** `#/o/...` antes de que el interceptor lea `window.location.hash`.
2. El interceptor se suscribe a `NavigationEnd` en `ngAfterViewInit` (se pierde el nav inicial) y **no usa** `event.url`.
3. `AuthGuard` del desktop **no está cableado a ninguna ruta**. El logout real es `router.navigate(['/login'])` sin `returnUrl`. `LoginComponent.navigateAfterLogin()` es código muerto para el cold-start de WhatsApp.

Encima, el URL del plan (`https://app.frc-gourmet.com/#/o/...`) cae en la **PWA** (`projects/mobile`, `provideRouter` **sin** hash y **sin** `DeepLinkService`). El bundle que sí se tocó vive en el desktop / `/admin`.

Los permisos nuevos existen en `SEED_PERMISOS` y ADMIN los hereda por `syncAdminPermissions`, pero **no están en `ROLES_PLANTILLA`**. `get-gasto` ahora exige `FINANCIERO_GASTO_VER`: el GERENTE con `CAJA_MAYOR_OPERAR` deja de poder abrir un gasto desde la lista. El check dual de pago consolidado **reemplazó** un `ensurePermission` correcto por SQL crudo con `?` + `getCurrentUser()` sin ALS.

No hay tests. Cualquier mutación (incluido reintroducir el bug del hash) queda en verde.

| Eje | Estado | Comentario |
|-----|--------|------------|
| Motor DeepLinkService + hash interceptor | **FAIL** | `**` destruye el hash; AfterViewInit llega tarde; no hay ruta `/o/:tipo/:id` |
| AuthGuard / returnUrl | **FAIL** | Guard no usado; AppComponent navega a `/login` sin query; carrera post-login a `/` |
| Superficie WhatsApp (PWA `/`) | **FAIL** | Implementado solo en shell desktop; PWA ignora el hash |
| Permisos seed + ensurePermission | **FAIL** | Seed sí; plantilla no; regresión GERENTE; pago consolidado peor que antes |
| UX fail-closed | **FAIL** | Plan pedía ConfirmationDialog; `loadGasto` traga el error; Fase 7 ausente |
| Poder discriminante de tests | **FAIL** | Cero tests. Todo lo de arriba pasaría CI |

---

## Stats del diff (código, no el plan)

```
src/app/services/deep-link.service.ts          (nuevo, 210 líneas)
src/app/app.component.ts                       interceptor NavigationEnd
src/app/auth/login/login.component.ts          navigateAfterLogin()
electron/handlers/permissions.handler.ts       +3 SEED_PERMISOS
electron/handlers/caja-mayor.handler.ts        ensurePermission en get-gasto
electron/handlers/vales.handler.ts             handler get-vale
electron/handlers/pago-consolidado.handler.ts  check dual ad-hoc
repository*.ts                                 getVale
create-edit-gasto-dialog.*                     readonly + mat-chip
create-edit-vale-dialog.component.ts           readonly + loadVale
package-lock.json                              ruido devOptional→dev
```

`src/app/guards/auth.guard.ts` **no forma parte del diff** (y no está aplicado).  
`projects/mobile/**` **no forma parte del diff**.

---

## Hallazgos (verificados contra código)

### F1 — P0 — El wildcard `**` destruye el deep link antes del interceptor

**Archivos:** `src/app/app-routing.module.ts` L7–14, `src/app/app.component.ts` L762–781, `src/app/services/deep-link.service.ts` L37–53.

Rutas reales del desktop:

```typescript
const routes: Routes = [
  { path: 'login', loadComponent: () => import('./auth/login/login.component')... },
  { path: '**', redirectTo: '' },
];
RouterModule.forRoot(routes, { useHash: true })
```

No existe `path: ''` con componente, ni `path: 'o/:tipo/:id'`. Cualquier `#/o/compra/123` es, para el Router, `/o/compra/123` → matchea `**` → `redirectTo: ''` → `HashLocationStrategy` reescribe el fragmento a `#/` (o vacío).

El interceptor hace esto **después** de ese redirect:

```typescript
.subscribe((event: NavigationEnd) => {
  const hash = window.location.hash;          // ya no es #/o/...
  const parsed = this.deepLinkService.parseDeepLink(hash);
  if (!parsed) return;                        // return silencioso
  this.deepLinkService.openDeepLink(...)
});
```

No usa `event.url` ni `event.urlAfterRedirects`. `parseDeepLink` es correcto **si le llega** `#/o/{tipo}/{id}` o `/o/{tipo}/{id}`; en runtime no le llega.

El plan afirma (PLAN §3) que el prefijo `/o` «no colisiona con rutas Angular existentes porque el router solo tiene `/login` y `/**`». Eso es exactamente la colisión: `**` **sí** maneja (y descarta) el path.

**Los T1–T8 del plan, tal como están escritos** (`window.location.hash = '#/o/...'` con la app viva), disparan el mismo `hashchange` → Router → `**` → hash vacío. El snackbar de tipo inválido (T8) también muere: `parseDeepLink('#/')` devuelve `null` y no hay feedback.

**Qué faltaría para que el motor viva:** capturar el path **antes** del redirect (p.ej. `NavigationStart` / `APP_INITIALIZER` / `location.hash` en el constructor de `AppComponent`) **o** registrar una ruta Angular real `o/:tipo/:id` que no redirija, y no leer `window.location.hash` post-redirect.

---

### F2 — P0 — Interceptor en `ngAfterViewInit` pierde el cold-start

**Archivo:** `src/app/app.component.ts` L756–781.

`router.events` es un hot Observable. El nav inicial de Angular 15 (`enabledNonBlocking`) termina durante bootstrap, **antes** de `ngAfterViewInit`. Aunque F1 no existiera, el caso «usuario toca el link de WhatsApp y la app arranca» no vería el `NavigationEnd` original.

No hay parseo eager (`parseDeepLink(window.location.hash)` en constructor/`ngOnInit`). No hay `hashchange` nativo. La suscripción no se guarda ni se limpia en `ngOnDestroy`.

---

### F3 — P0 — AuthGuard desktop no está cableado; `returnUrl` no se preserva

**Archivos:** `src/app/app-routing.module.ts` (importa `AuthGuard` y **no lo usa**), `src/app/guards/auth.guard.ts` L14–22, `src/app/app.component.ts` L338–344, `src/app/auth/login/login.component.ts` L121–124, L147–151, L241–247, `src/app/app.component.html` L9 / L284–312.

El PR (Fase 6) afirma:

> AuthGuard ya redirige correctamente con returnUrl (línea 22 de `auth.guard.ts`)

Eso es cierto **del archivo**, y falso **del runtime**. `canActivate` no está en ninguna `Route` del desktop. La autenticación es un `*ngIf="isAuthenticated"` en `AppComponent`: el `router-outlet` **solo existe** en el `ng-template` de login.

Camino real sin sesión:

1. `AuthService.currentUser$` emite `null`.
2. `AppComponent` hace `this.router.navigate(['/login'])` — **sin** `queryParams.returnUrl`.
3. El hash `#/o/compra/123` pasa a `#/login`.
4. `LoginComponent.navigateAfterLogin()` lee `queryParams['returnUrl']` → `undefined` → `navigate(['/'])`.

Carrera post-login (aunque `returnUrl` existiera):

```338:344:src/app/app.component.ts
      if (!this.isAuthenticated) {
        this.router.navigate(['/login']);
      } else if (this.router.url === '/login') {
        // If user is logged in and on login page, navigate to home
        this.router.navigate(['/']);
      }
```

`AuthService.login()` hace `currentUserSubject.next(usuario)` **antes** de volver a `onSubmit`. El subscribe de `AppComponent` corre síncrono y navega a `/` mientras la URL sigue siendo `/login`. Recién después corre `navigateAfterLogin()`. Hay una carrera contra el wildcard de F1.

Otros caminos que ignoran `returnUrl` (este PR no los tocó):

- `LoginComponent.ngOnInit`: si ya hay sesión, `navigate(['/'])`.
- `loginConQr()`: `navigate(['/'])` al aprobar.

El `AuthGuard` de la **PWA** (`projects/mobile/.../auth.guard.ts`) sí pone `returnUrl: state.url`. Este PR no lo usa ni lo extiende.

**Conclusión:** Fase 6 implementa el lector de un query param que **nadie escribe** en el shell desktop. El P0 de la auditoría del plan no está resuelto.

---

### F4 — P0 — El URL del plan cae en la PWA, que no tiene este código

**Plan:** `https://app.frc-gourmet.com/#/o/gasto/1234` (PLAN §1 y §3).  
**Server:** `/` = PWA mobile, `/admin/` = desktop web (`electron/server/server.ts`, skill cliente-servidor).

`projects/mobile/src/main.ts` usa `provideRouter(routes)` **sin** `useHash`. El hash `#/o/gasto/1234` **no entra** al Router. El path es `/`. El wildcard mobile `{ path: '**', redirectTo: '' }` (L968) ni siquiera ve el fragmento.

No hay `DeepLinkService` en mobile. El diff no toca `projects/mobile/**`.

El bundle que sí tiene el interceptor es el desktop. La URL útil sería como mínimo `https://app.frc-gourmet.com/admin/#/o/gasto/1234`, y **aún así** choca F1–F3. El caso de uso declarado (tocar el link en WhatsApp del teléfono) no está implementado.

---

### F5 — P0 — `get-pago-consolidado-detalle`: el check dual es una regresión

**Archivo:** `electron/handlers/pago-consolidado.handler.ts` L442–464.

Antes (develop):

```typescript
await ensurePermission(dataSource, getCurrentUser, getAdapter(pago.concepto).permiso);
```

`ensurePermission` → `checkPermission` → `resolveAuthUser` (ALS HTTP primero, `getCurrentUser` solo en standalone) + `mustChangePassword` + cache de códigos. Acepta `string | string[]` (OR).

Ahora:

```typescript
const user = getCurrentUser();  // IGNORA AsyncLocalStorage
const permisos = user?.id
  ? await permisoRepo.query(`
      SELECT DISTINCT p.codigo FROM permissions p
      ...
      WHERE ur.usuario_id = ? AND p.codigo IN (?, ?)
    `, [user.id, 'FINANCIERO_PAGO_CONSOLIDADO_VER', getAdapter(pago.concepto).permiso])
  : [];
```

Verificado:

| Problema | Evidencia |
|----------|-----------|
| Placeholders `?` | En este repo las queries Postgres usan `$1` o interpolación. `DataSource.query` con `?` en `pg` es SQL inválido. El destino del bot es modo **server + Postgres**. El detalle de pago queda roto o lanza. |
| Usuario equivocado en HTTP | `getCurrentUser()` es el operador del proceso Electron del server, no el JWT del request. `ensurePermission` existía justo para esto (`auth.utils.ts` L48–56, L94–96). Confused deputy: o todos pasan con los permisos del server, o todos fallan si no hay usuario global. |
| Saltea `mustChangePassword` | `checkPermission` L164–169. Un usuario con pass temporal ve el pago. |
| Reinvención innecesaria | `ensurePermission(ds, getCurrentUser, ['FINANCIERO_PAGO_CONSOLIDADO_VER', adapter.permiso])` ya era el OR. |
| Orden fail-open de existencia | Carga el `PagoConsolidado` **antes** del check. Sin permiso se revela que el id existe (y el concepto, vía el mensaje de error). |

La web `/admin` (caso WhatsApp si se corrigiera el path) pasa por `/api/rpc`. Este handler es la frontera. Quedó peor que en `develop`.

---

### F6 — P1 — Permisos nuevos en seed, no en plantilla; regresión GERENTE en gastos

**Archivos:** `electron/handlers/permissions.handler.ts` L20, L131–132; `electron/utils/seed-system.ts` `ROLES_PLANTILLA` (GERENTE L448–520, GERENTE_READONLY L523–570); `electron/handlers/caja-mayor.handler.ts` L1173–1174; `src/app/pages/financiero/caja-mayor/gastos/list-gastos/list-gastos.component.ts` L128–136.

Seed (idempotente, OK):

- `RRHH_VALE_VER`
- `FINANCIERO_GASTO_VER`
- `FINANCIERO_PAGO_CONSOLIDADO_VER`

`syncAdminPermissions` asigna **todos** los permisos al rol ADMINISTRADOR. Los tres aparecen para admin en el próximo arranque.

`ROLES_PLANTILLA` **no se tocó**. GERENTE tiene `CAJA_MAYOR_OPERAR`, `RRHH_VALE_CREAR`/`CONFIRMAR`, `COMPRAS_VER`. No tiene ninguno de los tres `*_VER` nuevos. GERENTE_READONLY (el rol de auditoría que debería ser el consumidor natural de un deep link de solo lectura) tampoco.

`get-gasto` ahora exige `FINANCIERO_GASTO_VER` como primera línea. `ListGastosComponent.abrirGasto()` llama el mismo handler. `get-gastos` (el listado) **sigue sin** `ensurePermission`. Resultado:

- GERENTE lista gastos.
- GERENTE abre el dialog desde la lista → `PERMISO REQUERIDO: FINANCIERO_GASTO_VER`.
- Era un flujo cotidiano. Esta PR lo rompe para todo el mundo que no sea ADMIN / grant manual.

El tile mobile de Gastos sigue gated por `CAJA_MAYOR_OPERAR` (`app.routes.ts` L74). El RPC `get-gasto` les va a devolver FORBIDDEN igual.

`get-vale` es handler **nuevo**, así que no hay regresión de lista (la lista usa `get-vales`, aún sin permiso). Quien no tenga `RRHH_VALE_VER` no puede el deep link; GERENTE con `RRHH_VALE_CREAR` tampoco ve el detalle por id.

Fail-closed del seed para **admin** está bien. Fail-closed para el resto, sin grant de plantilla, convierte VER en un permiso fantasma. El plan (enmienda P1) pedía el seed; no pidió olvidar `ROLES_PLANTILLA`. La skill lo dice: *roles custom / plantilla pueden necesitar grant manual* — acá el grant ni siquiera está en GERENTE.

---

### F7 — P1 — `getCompra` sigue default-allow; el deep link lo hace alcanzable por URL

**Archivo:** `electron/handlers/compras.handler.ts` L433–446 (no está en el diff).

```typescript
ipcMain.handle('getCompra', async (_event: any, id: number) => {
  // sin ensurePermission
  ...
});
```

Existe `COMPRAS_VER` en el seed. `openCompra` abre la tab sin chequear permisos en el cliente. `/api/rpc` es default-allow: cualquier JWT válido lee cualquier compra. Preexistente, pero este PR publica `#/o/compra/{id}` como contrato. La defensa de gasto/vale/pago no se replicó acá.

`CompraDetalleComponent` solo pone `*appHasPermission="'COMPRAS_GESTIONAR'"` en Anular. Ver no está gated.

---

### F8 — P1 — UX fail-closed incompleta (y `mat-chip` sin módulo)

El plan enmendado (P2 / Fase 7): 404 → snackbar + superficie vacía, **sin** auto-cierre; sin permiso → `ConfirmationDialogComponent`. Fase 7 **no está implementada**.

| Superficie | Sin permiso / 404 real |
|------------|-------------------------|
| Compra (tab) | snackbar vía `extraerError`; tab vacía. OK-ish. No ConfirmationDialog. |
| Gasto (dialog) | `loadGasto` `catch` solo `console.error` (create-edit-gasto-dialog.component.ts L264–266). Dialog readonly **vacío**, sin snackbar. El usuario ve un formulario deshabilitado en blanco. |
| Vale (dialog) | snackbar en `loadVale`. No ConfirmationDialog. No muestra estado SOLICITADO/CONFIRMADO (el plan lo pedía). |
| Pago (dialog) | snackbar con `e.message`. Si F5 dispara SQL error en Postgres, el mensaje no es «sin permisos». |
| Tipo inválido | snackbar **solo si** `parseDeepLink` matchea. F1 hace que ni llegue. |
| DeepLinkService | no consulta `PermissionService` / `isLoggedIn`. Si el hash sobreviviera en la pantalla de login, `MatDialog` (overlay global) puede abrir **encima** del login. |

`mat-chip` se agregó en gasto HTML y en el template inline de vale **sin** `MatChipsModule` en `imports` del standalone. AOT (`npm run check`) suele ser `NG8001: 'mat-chip' is not a known element`. El PR solo reporta `electron:serve-tsc`, que no ve templates Angular.

Estilos inline `style="margin-left: 12px"` (gasto + vale): viola la regla de no hardcodear presentación; menor.

---

### F9 — P1 — `get-vale` hidrata `createdBy` entero (hash de password)

**Archivo:** `electron/handlers/vales.handler.ts` L29–36.

```typescript
relations: [..., 'createdBy', 'createdBy.persona']
```

`Usuario.password` no tiene `select: false`. El handler es nuevo y viaja por `/api/rpc`. Es el mismo gotcha de `known-bugs.md` / auditoría de informes delivery. `get-gasto` ya hidrataba `createdBy` (preexistente); este PR **suma** el mismo leak en vales.

---

### F10 — P2 — Huecos menores del motor (no bloquean solos)

1. `parseDeepLink` ancla en `^...$`: no acepta `/` final ni query (`#/o/gasto/1?x=1`). El plan dejó query string out of scope; OK, pero un link sucio falla en silencio (el interceptor no snackbar-ea `null`).
2. `openDeepLink` no espera a `isAuthenticated`; no hay cola de deep link post-splash (1.6 s).
3. Dedup de dialogs: `isDialogOpen` hace `return` sin `ref.focus()` / bring-to-front. Segundo click al mismo link no hace nada visible.
4. `TabsService.addTab` deduplica por **título**, no por el `id` `detalle-compra-${id}` que el comentario del servicio da por sentado. Coinciden en la práctica (`Compra #${id}`), pero el comentario es falso.
5. `package-lock.json`: 20 flips `devOptional` → `dev`, sin cambio de deps. Ruido.
6. Import duplicado de `rxjs/operators` en `app.component.ts` (`filter` en línea nueva; el archivo ya importaba de ese path).

---

## Eje 1 — Motor / arquitectura (síntesis)

`DeepLinkService` como dispatcher es el diseño correcto: parse puro + switch + lazy import + `Map` de dialogs. `openCompra` reusa `tabsService.openTab` con el mismo `data` / tabId que `ListComprasComponent.verDetalle`. `openGasto`/`openVale`/`openPago` reusan los dialogs existentes. Eso está bien.

Lo que no está bien es **cómo se llega** al dispatcher:

```
URL hash  ──►  Router (** redirect)  ──►  hash destruido
                 │
                 └── NavigationEnd (tarde, AfterViewInit, lee location.hash)
                       └── parseDeepLink(null) → no-op
```

El login no reinyecta el hash. Auth no es el `AuthGuard` que el PR cita. La PWA, que es la puerta WhatsApp, ni siquiera carga este servicio.

Hasta que F1+F2+F3+F4 no estén cerrados, las Fases 2–5 son código inalcanzable desde el link publicado.

---

## Eje 2 — Permisos (síntesis)

| Recurso | Handler | Guard real | Plantilla | UX fail-closed |
|---------|---------|------------|-----------|----------------|
| compra | `getCompra` | **ninguno** | `COMPRAS_VER` existe, no se usa | snackbar genérico |
| gasto | `get-gasto` | `FINANCIERO_GASTO_VER` (nuevo, OK forma) | **no** en GERENTE → **rompe lista** | error tragado |
| vale | `get-vale` (nuevo) | `RRHH_VALE_VER` (OK forma) | **no** en GERENTE | snackbar |
| pago | `get-pago-consolidado-detalle` | SQL ad-hoc, no `ensurePermission` | **no** en GERENTE | snackbar; Postgres ? |

ADMIN: cubierto por sync.  
GERENTE / GERENTE_READONLY / roles custom: no.  
`mustChangePassword`: respetado en gasto/vale vía `ensurePermission`; **no** en el check nuevo de pago.

Fail-closed de verdad hubiera sido:

```typescript
await ensurePermission(ds, getCurrentUser, ['FINANCIERO_GASTO_VER', 'CAJA_MAYOR_OPERAR']);
// o seedear FINANCIERO_GASTO_VER en GERENTE + GERENTE_READONLY
```

y lo mismo para vale (`RRHH_VALE_VER` \| `RRHH_VALE_CREAR` \| `RRHH_VALE_CONFIRMAR`) y pago (`ensurePermission` con array OR).

---

## Eje 3 — Poder discriminante de los tests

**Tests añadidos:** ninguno. No hay `*.spec.ts`, no hay `scripts/test-deep-link*`, no hay script npm.

`parseDeepLink` es función pura, cero dependencias: el candidato obvio a un spec de 20 casos (hash con/sin `#`, id 0, trailing slash, tipo desconocido, mayúsculas). No está.

### Qué mutación dejaría CI en verde

| Mutación | ¿La atrapa alguien? |
|----------|---------------------|
| Borrar el interceptor entero | No |
| Leer `window.location.hash` post-`**` (el bug actual) | No |
| `AuthGuard` sin `canActivate` (el bug actual) | No |
| `navigateAfterLogin` otra vez a `['/']` | No |
| Quitar los 3 códigos del seed | No (salvo un humano en UI admin) |
| `get-gasto` sin `ensurePermission` | No |
| SQL `?` en Postgres | No (`test:pago-consolidado` no cubre el check nuevo) |
| `getCurrentUser()` vs ALS | No |
| GERENTE sin `*_VER` | No (`test:roles-pdv` no incluye estos canales) |
| `mat-chip` sin módulo | `npm run check` **sí** lo vería; el PR no lo corrió |
| `loadGasto` que traga FORBIDDEN | No |

Los T1–T8 del plan son checklist manual del CEO y, por F1, **fallarían** si se ejecutaran tal cual. No hay red de seguridad automática detrás.

Un test que *sí* discriminaría el motor:

1. Dado `Router` con las rutas reales (`login` + `**` redirect) y `useHash: true`.
2. `navigateByUrl('/o/gasto/17')` o setear `location.hash`.
3. Assert: `parseDeepLink` recibe `/o/gasto/17` **o** el servicio `openGasto` se llama. Hoy esto **falla** y el test lo haría visible.

Un test que *sí* discriminaría permisos: seed real + usuario GERENTE + `invokeHandler('get-gasto', id)` → no FORBIDDEN (hoy FORBIDDEN; el test fallaría y señalaría F6).

Nada de eso está.

---

## Lo que está bien (para no mezclar)

- `parseDeepLink` en aislamiento: regex `/^\/o\/([^\/]+)\/(\d+)$/`, `id <= 0` rechazado, `Number.isFinite`.
- Lazy import de los 4 destinos; no se inventó una pantalla nueva.
- `readonly` en gasto/vale: `form.disable()`, submit oculto, botón Cerrar. Dirección correcta.
- `getVale` atravesó abstract + IPC + HTTP (`callRpc`), no solo el handler.
- `ensurePermission` en `get-gasto` / `get-vale` está como primera sentencia del handler (forma de la regla dura §22).
- No se cambió `useHash: true` a path routing (correcto para Electron `file://`).
- Dedup de dialogs con `Map` + `afterClosed` cleanup: idea correcta.

Ninguno de estos puntos hace usable el flujo WhatsApp.

---

## Veredicto

**BLOCK**

No mergear. El P0 de `returnUrl` del plan quedó como un lector huérfano. El interceptor no puede ver el hash que el Router borra. La URL publicada apunta a un proyecto Angular distinto. El único handler de lectura que se “mejoró” con OR (`get-pago-consolidado-detalle`) se degradó en Postgres y en modo server. `get-gasto` + permiso nuevo sin plantilla rompe GERENTE.

### Mínimo para salir de BLOCK

1. **Preservar** `#/o/{tipo}/{id}` (ruta Angular real, o captura pre-redirect + replay post-login). Probar cold-start y `hashchange` con la app viva.
2. **Escribir** `returnUrl` en el camino real de no-sesión (`AppComponent` → login), no en un `AuthGuard` muerto. Quitar la carrera `navigate(['/'])`. QR y `ngOnInit` already-logged-in también.
3. Decidir superficie WhatsApp: PWA (`projects/mobile` + path `/o/...` + `authGuard` que ya existe) **o** `/admin/#/o/...` documentado. Implementar esa, no la otra.
4. Pago consolidado: volver a `ensurePermission(..., [VER, adapter.permiso])`. Cero SQL crudo.
5. Sembrar `*_VER` en GERENTE y GERENTE_READONLY, **o** OR con los permisos de operar que ya tienen. No romper `abrirGasto`.
6. `ensurePermission('COMPRAS_VER')` (o OR con `COMPRAS_GESTIONAR`) en `getCompra`.
7. Tests que fallen si se revierten 1, 4 y 5. `parseDeepLink` unitario. Un caso GERENTE `get-gasto`.
8. `npm run check` (AOT) por el `mat-chip`.

Fase 7 (ConfirmationDialog, no tragar errores en `loadGasto`) y docs/skill pueden ir después, no son el BLOCK.

---

*Auditoría A. No se modificó código de producto. No mergear.*
