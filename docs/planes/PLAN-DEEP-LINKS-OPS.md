# Plan: Deep Links para Operaciones (Compras, Gastos, Vales, Pagos Consolidados)

**Fecha:** 2026-09-15  
**Autor:** Cloud Agent (PLANNER)  
**Estado:** DRAFT — pendiente auditoría + aprobación  
**Branch:** `cursor/plan-deep-links-ops-259f`

---

## 1. Problema / Why

### Contexto actual

El bot de operaciones de WhatsApp (externo a este repo) crea/paga registros y reporta al usuario con mensajes como:

```
✅ Gasto registrado: #1234 — MANTENIMIENTO LOCAL — 450.000 Gs
```

El usuario recibe el número de ID pero **no tiene forma de ir directamente al registro** desde su móvil. Debe:

1. Abrir la app mobile (`https://app.frc-gourmet.com`)
2. Iniciar sesión (si no tiene sesión activa)
3. Navegar al módulo correspondiente (Compras / Caja Mayor / Vales)
4. Buscar manualmente el registro por ID o filtros
5. Abrirlo

Esto es especialmente tedioso para operaciones desde el móvil durante horas no laborales (noches/fines de semana), cuando el usuario está fuera de la oficina y necesita verificar/aprobar una operación reportada por el bot.

### Objetivo

Permitir que el bot **envíe un deep link clickeable** junto con el mensaje de confirmación:

```
✅ Gasto registrado: #1234 — MANTENIMIENTO LOCAL — 450.000 Gs
🔗 Ver: https://app.frc-gourmet.com/#/o/gasto/1234
```

Al tocar el enlace:
- **Con sesión activa:** abre directamente el registro (tab o dialog según corresponda).
- **Sin sesión:** redirige al login, y **después del login exitoso** navega automáticamente al registro (returnUrl).

---

## 2. Navegación actual (verificado en código)

### 2.1. Arquitectura de routing

#### Routing de Angular

`src/app/app-routing.module.ts` usa **`useHash: true`** (hash routing). Esto NO es cosmético:

```typescript
// Excerpt de app-routing.module.ts líneas 18-38
// Con rutas por path, `history.pushState` ignora `<base href>` bajo `file://`
// y `location` queda en `file:///login`, causando ERR_FILE_NOT_FOUND al recargar.
// El arranque en frío y cada logout pasan por ahí. Con hash, la ruta viaja en el
// fragmento y `location` nunca se corrompe.
imports: [RouterModule.forRoot(routes, { useHash: true })]
```

**Rutas registradas en el Router:**
- `/login` → `LoginComponent`
- `/**` → redirect a `''` (fallback)

**Todo lo demás** se navega vía `TabsService.openTab()` o `MatDialog.open()`, **no como rutas de Angular**.

**Implicación:** las URLs deep-link deben usar el fragmento hash `#/o/{tipo}/{id}`, NO path routing. El router de Angular **no las manejará** (no hay ruta registrada) — requieren interceptación manual en `AppComponent`.

#### Sistema de tabs

- **Servicio:** `TabsService` (`src/app/services/tabs.service.ts`)
- **Método principal:** `openTab(title, componentType, data, id?, closable?)` / `openTabWithData(...)`
- **Tabs registradas:** se identifican por `title` (deduplicación) o `id` (único, generado con UUID si no se pasa)
- **Cómo se pasan datos:** el objeto `data` se pasa al componente y el componente lo lee vía `setData(d: any)` (inyección manual, NO por el Router)

#### Sistema de diálogos

- **API:** `MatDialog.open(ComponentType, { width, data })`
- **Cómo se pasan datos:** vía `MAT_DIALOG_DATA` inyectado en el constructor del diálogo
- **Cierre/refresco:** el diálogo devuelve resultado con `dialogRef.close(result)`

### 2.2. Navegación actual de los 4 tipos

#### A. Compra (`#/o/compra/{id}`)

**Desde:** `ListComprasComponent` (`src/app/pages/compras/list-compras/list-compras.component.ts`)  
**Método:** `verDetalle(compra: any)` (línea 325)

```typescript
verDetalle(compra: any): void {
  this.tabsService.openTab(
    `Compra #${compra.id}`,
    CompraDetalleComponent,
    { compraId: compra.id },
    `detalle-compra-${compra.id}`,
    true,
  );
}
```

**Componente destino:** `CompraDetalleComponent` (standalone)  
**Recibe data vía:** `setData(d: any)` → lee `d.compraId` (línea 60)  
**Qué muestra:** 
- Encabezado de compra (proveedor, fecha, total, estado)
- Tabla de detalles (productos, cantidades, costos)
- Tabla de cuotas CPP (si aplica)
- Botones: "Anular compra" (con `*appHasPermission="'COMPRAS_ANULAR'"`)

**Permisos relevantes:**
- **Lectura:** `COMPRAS_VER` (implícito, no chequeado en el componente de detalle; la lista sí debe tener acceso)
- **Anular:** `COMPRAS_ANULAR` (botón explícito en el detalle)

#### B. Gasto (`#/o/gasto/{id}`)

**Desde:** `ListGastosComponent` (`src/app/pages/financiero/caja-mayor/gastos/list-gastos/list-gastos.component.ts`)  
**Método:** `abrirGasto(gasto: any)` (línea 128)

```typescript
abrirGasto(gasto: any): void {
  const dialogRef = this.dialog.open(CreateEditGastoDialogComponent, {
    width: '700px',
    data: { gastoId: gasto.id },
  });
  dialogRef.afterClosed().subscribe(result => {
    if (result) this.loadData();
  });
}
```

**Componente destino:** `CreateEditGastoDialogComponent` (standalone)  
**Recibe data vía:** `@Inject(MAT_DIALOG_DATA) public data: any` (línea 116) → lee `data.gastoId` (línea 125)  
**Modo:** `edit` (si `gastoId` existe, carga el gasto en `loadGasto()`; líneas 194-258)  
**Qué muestra:**
- Formulario con categoría, descripción, fecha, moneda, proveedor, etc.
- Tabla de detalles de pago (moneda, forma de pago, monto)
- Sección de adjuntos (comprobantes)
- Botones: "Guardar" (puede anular si tiene permiso desde otro lado, pero el dialog NO tiene anular directo)

**Permisos relevantes:**
- **Ver/Editar:** no hay check explícito en el diálogo; la lista tiene `*appHasPermission="'FINANCIERO_GASTO_VER'"` implícito
- **Anular:** `FINANCIERO_GASTO_ANULAR` (desde `ListGastosComponent.anularGasto()`, NO desde el dialog)

**Decisión de diseño:** el dialog NO es read-only; permite editar. Requiere definir si el deep link abre **solo para ver** o **en modo edición**. Recomendación: **abrir en modo read-only** (nuevo parámetro `readonly: true` en data) y agregar un footer informativo con advertencia si el usuario no tiene permisos de edición.

#### C. Vale (`#/o/vale/{id}`)

**Desde:** `ListValesComponent` (`src/app/pages/rrhh/vales/list-vales.component.ts`)  
**Método:** implícito desde botones contextuales de mat-menu (líneas 115-120), NO hay método explícito `verDetalle`

```typescript
// Actualmente NO HAY método para ver un vale existente.
// Los botones son: "Pagar" (→ pagarDesdeCajaMayor) y "Anular" (→ anular)
```

**Problema:** el sistema actual **NO permite "ver" un vale sin editarlo o pagarlo**.

**Propuesta:** **agregar un método `verVale(vale: any)` que abra `CreateEditValeDialogComponent` en modo read-only** (nuevo parámetro `data: { valeId, readonly: true }`).

**Componente objetivo:** `CreateEditValeDialogComponent` (standalone)  
**Recibe data vía:** `@Inject(MAT_DIALOG_DATA) public data: any` (línea 174) → actualmente NO lee `valeId` (solo `modoConfirmar` y `cajaMayorId`)  
**Cambios necesarios:**
- Agregar lógica `loadVale(valeId)` (similar a gasto)
- Soportar `readonly: true` → deshabilitar formulario, ocultar botones de submit, mostrar solo info + botones contextuales (Pagar/Anular según permisos)

**Permisos relevantes:**
- **Ver:** `RRHH_VALE_VER` (no existe todavía → **agregar a seed**)
- **Confirmar/Pagar:** `RRHH_VALE_CONFIRMAR`
- **Anular:** `RRHH_VALE_ANULAR`

#### D. Pago consolidado (`#/o/pago/{id}`)

**Desde:** `CajaMayorDetalleComponent` (`src/app/pages/financiero/caja-mayor/caja-mayor-detalle/caja-mayor-detalle.component.ts`)  
**Método:** `verDetallePagoConsolidado(row: any)` (línea 681)

```typescript
async verDetallePagoConsolidado(row: any): Promise<void> {
  if (!row?.pagoConsolidadoId) return;
  const { DetallePagoConsolidadoDialogComponent } = await import(
    '../detalle-pago-consolidado-dialog/detalle-pago-consolidado-dialog.component'
  );
  const ref = this.dialog.open(DetallePagoConsolidadoDialogComponent, {
    width: '760px',
    maxWidth: '95vw',
    data: { pagoId: row.pagoConsolidadoId },
  });
  const anulado = await firstValueFrom(ref.afterClosed());
  // ...
}
```

**Componente destino:** `DetallePagoConsolidadoDialogComponent` (standalone)  
**Recibe data vía:** `@Inject(MAT_DIALOG_DATA) public data: DetallePagoConsolidadoData` (línea 69) → `data.pagoId`  
**Qué muestra:**
- Tabla de obligaciones pagadas (descripción, beneficiario, monto)
- Tabla de formas de pago (fuente, monto, monto convertido)
- Total + estado
- Botón "Anular pago" (con confirmación y check de saldos negativos)

**Permisos relevantes:**
- **Ver:** `FINANCIERO_PAGO_CONSOLIDADO_VER` (no chequeado en el diálogo; asume que llegaste ahí con permisos)
- **Anular:** `FINANCIERO_PAGO_CONSOLIDADO_ANULAR` (implícito en la lógica del botón, pero sin directiva; el backend tiene `ensurePermission`)

---

## 3. Propuesta de URL scheme

### Esquema base

```
https://app.frc-gourmet.com/#/o/{tipo}/{id}
```

- **Dominio:** `app.frc-gourmet.com` — servidor que corre en modo `server`, sirviendo tanto el desktop (`/admin`) como la PWA mobile (`/`)
- **Hash routing:** `#/` → compatibilidad con Electron local (aunque el servidor web sirve por HTTP, el desktop sigue usando hash)
- **Prefijo `/o`:** "operación" — namespace reservado para deep links operativos (compras, gastos, vales, pagos); **no colisiona con rutas Angular existentes** porque el router solo tiene `/login` y `/**`
- **`{tipo}`:** slug que identifica el tipo de registro
  - `compra` → `CompraDetalleComponent`
  - `gasto` → `CreateEditGastoDialogComponent`
  - `vale` → `CreateEditValeDialogComponent`
  - `pago` → `DetallePagoConsolidadoDialogComponent`
- **`{id}`:** ID numérico del registro (PK de la entidad)

### Casos de uso

#### Sin sesión activa

1. Usuario toca `https://app.frc-gourmet.com/#/o/gasto/1234`
2. `AuthGuard` detecta `!isLoggedIn` → navega a `/login?returnUrl=%23%2Fo%2Fgasto%2F1234`
3. Usuario ingresa credenciales
4. `LoginComponent.onSubmit()` lee `returnUrl` del query param y navega a él
5. `AppComponent` intercepta `#/o/gasto/1234`, parsea `{tipo: 'gasto', id: 1234}` y abre `CreateEditGastoDialogComponent` con `data: { gastoId: 1234, readonly: true }`

#### Con sesión activa

1. Usuario toca `https://app.frc-gourmet.com/#/o/compra/567`
2. `AuthGuard` permite el acceso (ya está logueado)
3. `AppComponent` intercepta `#/o/compra/567`, parsea `{tipo: 'compra', id: 567}` y llama `tabsService.openTab('Compra #567', CompraDetalleComponent, { compraId: 567 }, 'detalle-compra-567')`
4. Tab se abre (o si ya existe, se activa)

#### Casos especiales

- **ID inválido / registro no existe:** el componente destino carga `null`, muestra un mensaje de error (`"No se encontró el registro"`) y ofrece un botón "Cerrar" o "Volver al listado"
- **Usuario sin permiso para ver:** mostrar `ConfirmationDialogComponent` con mensaje `"No tenés permisos para ver este recurso"` y botón "Aceptar" (no falla silenciosamente)
- **Doble-open (tab ya abierta):** `TabsService.openTab()` ya deduplica por `id` → solo activa la tab existente sin duplicar
- **Doble-open (dialog ya abierto):** `MatDialog` no tiene deduplicación nativa → **debemos rastrear manualmente** si un dialog de cierto tipo+id ya está abierto (ej. `private openDialogs = new Map<string, MatDialogRef<any>>()`)

---

## 4. Implementación por fases (commits separados)

### Fase 1: Infraestructura base (sin UI)

**Alcance:**
- Servicio `DeepLinkService` (`src/app/services/deep-link.service.ts`):
  - `parseDeepLink(url: string): { tipo: string; id: number } | null`
  - `openDeepLink(tipo: string, id: number): Promise<void>`
  - Mapeo de tipos → handlers
  - Registro de diálogos abiertos para evitar duplicados
- Interceptor en `AppComponent.ngAfterViewInit()`:
  - Escuchar `router.events` (NavigationEnd) y parsear `location.hash`
  - Si coincide con `/o/{tipo}/{id}`, delegar a `deepLinkService.openDeepLink()`
  - Limpiar el hash después de procesarlo (opcional: `location.replaceState('')` para no dejar la URL visible)

**Tests manuales:**
- Navegar a `http://localhost:4201/#/o/compra/999` → debe intentar abrir (fallará porque no existe, pero el log debe mostrar el intento)
- Sin sesión → debe redirigir a login con `returnUrl`

**Commit:** `feat(deep-links): agregar servicio + interceptor base para /o/{tipo}/{id}`

---

### Fase 2: Handler para Compra (tab)

**Alcance:**
- Implementar `DeepLinkService.openCompra(id: number)`:
  - Llamar `tabsService.openTab('Compra #${id}', CompraDetalleComponent, { compraId: id }, 'detalle-compra-${id}')`
  - Manejar error si `id` inválido (componente ya lo hace en `load()`)
- Registrar `'compra'` en el mapeo de `openDeepLink()`

**Tests manuales:**
- Logueado, navegar a `#/o/compra/1` (asumir que existe compra con id=1) → debe abrir tab
- Navegar a `#/o/compra/999999` (no existe) → tab abre, muestra spinner, luego error en snackbar
- Tab duplicada: abrir `#/o/compra/1` dos veces → segunda vez solo activa la tab existente

**Permisos:**
- NO requiere check explícito (el componente CompraDetalleComponent no tiene guards; hereda permisos del contexto de navegación)
- Si el usuario NO tiene acceso al módulo Compras (ej. `COMPRAS_VER` bloqueado), idealmente debería fallar al cargar datos → el handler del backend rechazará con error de permiso → componente muestra snackbar

**Commit:** `feat(deep-links): agregar handler para #/o/compra/{id}`

---

### Fase 3: Handler para Gasto (dialog read-only)

**Alcance:**
- Modificar `CreateEditGastoDialogComponent`:
  - Aceptar `data.readonly: boolean`
  - Si `readonly === true`:
    - Deshabilitar todos los controles del formulario (`form.disable()`)
    - Ocultar botones "Guardar" / "Agregar detalle"
    - Mostrar solo "Cerrar"
    - Opcional: mostrar banner informativo "Modo solo lectura"
  - Si `data.gastoId` existe pero el gasto NO se encuentra o el usuario no tiene permisos → mostrar error en snackbar y cerrar
- Implementar `DeepLinkService.openGasto(id: number)`:
  - Verificar si ya hay un dialog abierto con `dialogKey = 'gasto-${id}'` → si existe, no abrir otro
  - Llamar `dialog.open(CreateEditGastoDialogComponent, { width: '700px', data: { gastoId: id, readonly: true } })`
  - Registrar en `openDialogs` al abrir, remover al cerrar (`ref.afterClosed().subscribe(() => openDialogs.delete(key))`)
- Registrar `'gasto'` en el mapeo

**Tests manuales:**
- `#/o/gasto/1` → dialog abre en readonly, formulario deshabilitado, muestra adjuntos
- `#/o/gasto/999999` → dialog abre, spinner, error "No se encontró el gasto", cierra automáticamente o muestra botón "Cerrar"
- Dialog duplicado: abrir `#/o/gasto/1` dos veces rápido → segunda llamada no abre otro dialog

**Permisos:**
- Agregar permiso `FINANCIERO_GASTO_VER` al seed (`permissions.handler.ts` en `SEED_PERMISOS`)
- En `CreateEditGastoDialogComponent.ngOnInit()`, si `readonly && !permissionService.has('FINANCIERO_GASTO_VER')` → mostrar error y cerrar (fail-closed)
- Botón "Anular" ya existe en `ListGastosComponent` con permiso `FINANCIERO_GASTO_ANULAR` → **NO duplicar** en el dialog; el dialog es solo para ver/editar datos base

**Commit:** `feat(deep-links): agregar handler para #/o/gasto/{id} + modo read-only`

---

### Fase 4: Handler para Vale (dialog read-only + load)

**Alcance:**
- Modificar `CreateEditValeDialogComponent`:
  - Aceptar `data.valeId: number` y `data.readonly: boolean`
  - Agregar método `loadVale(valeId: number)` (similar a `CreateEditGastoDialogComponent.loadGasto()`):
    - Llamar `repo.getVale(valeId)` (asumir que existe; si no, agregarlo en `repository.service.ts` como wrapper de IPC)
    - Popular el formulario con `form.patchValue({ funcionarioId, motivoId, monto, fecha, monedaId, ... })`
    - Si el vale está CONFIRMADO/DESCONTADO/ANULADO, mostrar el estado en un chip de solo lectura
  - Si `readonly === true`:
    - Deshabilitar formulario
    - Mostrar solo botones contextuales según estado y permisos:
      - Si `estado === 'SOLICITADO' && has('RRHH_VALE_CONFIRMAR')` → botón "Pagar"
      - Si `estado !== 'ANULADO' && estado !== 'DESCONTADO' && has('RRHH_VALE_ANULAR')` → botón "Anular"
      - Siempre: botón "Cerrar"
- Implementar `DeepLinkService.openVale(id: number)`:
  - Verificar duplicado (`dialogKey = 'vale-${id}'`)
  - Llamar `dialog.open(CreateEditValeDialogComponent, { width: '720px', data: { valeId: id, readonly: true } })`
  - Registrar/desregistrar
- Registrar `'vale'` en el mapeo

**Tests manuales:**
- `#/o/vale/1` → dialog abre, muestra funcionario, monto, estado, botones según permisos
- `#/o/vale/999999` → error "No se encontró el vale", cierra
- Dialog duplicado → no abre segundo

**Permisos:**
- Agregar permiso `RRHH_VALE_VER` al seed
- En `CreateEditValeDialogComponent.ngOnInit()`, si `readonly && !has('RRHH_VALE_VER')` → error y cerrar
- Botones "Pagar" / "Anular" ya tienen sus permisos: `RRHH_VALE_CONFIRMAR` / `RRHH_VALE_ANULAR`

**Commit:** `feat(deep-links): agregar handler para #/o/vale/{id} + modo read-only con botones contextuales`

---

### Fase 5: Handler para Pago consolidado (dialog)

**Alcance:**
- `DetallePagoConsolidadoDialogComponent` **ya es read-only** (no tiene modo edit)
- Implementar `DeepLinkService.openPago(id: number)`:
  - Verificar duplicado (`dialogKey = 'pago-${id}'`)
  - Lazy-import del componente (mismo patrón que en `CajaMayorDetalleComponent.verDetallePagoConsolidado()`):
    ```typescript
    const { DetallePagoConsolidadoDialogComponent } = await import(
      'src/app/pages/financiero/caja-mayor/detalle-pago-consolidado-dialog/detalle-pago-consolidado-dialog.component'
    );
    const ref = this.dialog.open(DetallePagoConsolidadoDialogComponent, {
      width: '760px', maxWidth: '95vw', data: { pagoId: id }
    });
    ```
  - Registrar/desregistrar
- Registrar `'pago'` en el mapeo

**Tests manuales:**
- `#/o/pago/1` (asumir que existe pago consolidado con id=1) → dialog abre, muestra obligaciones + formas de pago + botón anular
- `#/o/pago/999999` → error "No se pudo cargar el detalle", snackbar, cierra
- Dialog duplicado → no abre segundo

**Permisos:**
- Agregar permiso `FINANCIERO_PAGO_CONSOLIDADO_VER` al seed (si no existe)
- Opcional: agregar check en `DetallePagoConsolidadoDialogComponent.ngOnInit()` → si `!has('FINANCIERO_PAGO_CONSOLIDADO_VER')` → error y cerrar
- Botón "Anular pago" ya tiene lógica de permiso implícito (backend rechaza si no tiene `FINANCIERO_PAGO_CONSOLIDADO_ANULAR`)

**Commit:** `feat(deep-links): agregar handler para #/o/pago/{id}`

---

### Fase 6: Integración con AuthGuard + returnUrl

**Alcance:**
- Verificar que `AuthGuard` ya maneja `returnUrl` correctamente (líneas 20-22 de `auth.guard.ts`):
  ```typescript
  this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  ```
- Verificar que `LoginComponent.onSubmit()` lee `returnUrl` y navega después del login exitoso:
  ```typescript
  const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '';
  if (returnUrl) {
    this.router.navigateByUrl(returnUrl);
  } else {
    this.router.navigate(['']);
  }
  ```
- Si `LoginComponent` NO lee `returnUrl`, **agregarlo**:
  ```typescript
  async onSubmit(): Promise<void> {
    // ... login logic ...
    const returnUrl = this.route.snapshot.queryParams['returnUrl'];
    if (returnUrl) {
      // Importante: usar navigateByUrl para que respete el hash
      this.router.navigateByUrl(returnUrl);
    } else {
      this.router.navigate(['']);
    }
  }
  ```
- **NOTA sobre hash routing:** `returnUrl` codificado como query param será del tipo `%23%2Fo%2Fgasto%2F1234` (el `#` se codifica como `%23`). `router.navigateByUrl()` lo decodifica automáticamente.

**Tests manuales:**
- Sin sesión, navegar a `#/o/compra/1` → redirige a `/login?returnUrl=%23%2Fo%2Fcompra%2F1`
- Loguearse → debe navegar automáticamente a `#/o/compra/1` y abrir la tab
- Con sesión, navegar a `#/o/gasto/1` → abre directamente sin pasar por login

**Commit:** `feat(deep-links): integrar returnUrl con AuthGuard + LoginComponent`

---

### Fase 7: Manejo de errores + feedback UX

**Alcance:**
- En `DeepLinkService.openDeepLink()`:
  - Si `tipo` no está en el mapeo → mostrar `MatSnackBar`: `"Tipo de deep link no reconocido: {tipo}"`
  - Si `id` no es un número válido → mostrar `MatSnackBar`: `"ID inválido en deep link"`
  - Si el handler lanza error (ej. componente no carga) → atrapar con `try/catch` y mostrar `MatSnackBar`: `"Error al abrir el recurso: {error.message}"`
- En cada componente destino (CompraDetalleComponent, CreateEditGastoDialogComponent, etc.):
  - Si `load()` devuelve `null` o el backend lanza 404 → mostrar `MatSnackBar`: `"No se encontró el registro con ID {id}"` y cerrar el tab/dialog automáticamente después de 3s
  - Si backend lanza error de permisos (ej. `"PERMISSION_DENIED: COMPRAS_VER"`) → mostrar `ConfirmationDialogComponent`:
    ```
    Título: "Sin permisos"
    Mensaje: "No tenés permisos para ver este recurso. Contactá al administrador si necesitás acceso."
    Botón: "Aceptar"
    ```
    Y cerrar el tab/dialog al aceptar

**Tests manuales:**
- `#/o/invalido/1` → snackbar "Tipo de deep link no reconocido: invalido"
- `#/o/compra/abc` → snackbar "ID inválido en deep link"
- `#/o/compra/999999` → snackbar "No se encontró el registro con ID 999999", tab cierra en 3s
- Sin permisos (ej. rol sin `COMPRAS_VER`), navegar a `#/o/compra/1` → dialog "Sin permisos", al aceptar cierra

**Commit:** `feat(deep-links): agregar manejo de errores + feedback UX`

---

### Fase 8: Documentación + actualización de skill

**Alcance:**
- Actualizar `.claude/skills/frc-gourmet-expert/architecture/frontend-shell.md` (o crear nuevo archivo si aplica) con sección:
  ```markdown
  ### Deep Links

  La app soporta deep links operativos con esquema `#/o/{tipo}/{id}`:
  - `compra` → CompraDetalleComponent (tab)
  - `gasto` → CreateEditGastoDialogComponent (dialog read-only)
  - `vale` → CreateEditValeDialogComponent (dialog read-only)
  - `pago` → DetallePagoConsolidadoDialogComponent (dialog)

  Interceptor en AppComponent.ngAfterViewInit() escucha NavigationEnd y delega a DeepLinkService.
  Con sesión → abre directamente. Sin sesión → redirige a login con returnUrl.
  ```
- Actualizar `docs/MENU-SIDENAV.md` (si menciona navegación) con nota sobre deep links
- Actualizar `reference/handlers-index.md` con nota sobre los handlers IPC involucrados (ej. `get-compra`, `get-gasto`, `get-vale`, `get-pago-consolidado-detalle`)

**Commit:** `docs: agregar deep links a skill + docs de navegación`

---

## 5. Permisos: fail-closed con mensaje claro

### Principio: fail-closed

Si el usuario **NO tiene el permiso** correspondiente para ver el recurso, el sistema **debe rechazar el acceso** y mostrar un mensaje claro, **NO fallar en silencio**.

### Matriz de permisos por tipo

| Tipo | Permiso requerido | Ya existe? | Acción |
|------|-------------------|------------|--------|
| Compra | `COMPRAS_VER` | ✅ (implícito) | No requiere cambios; el handler backend lo chequea |
| Gasto | `FINANCIERO_GASTO_VER` | ❌ | **Agregar a seed** en `permissions.handler.ts` |
| Vale | `RRHH_VALE_VER` | ❌ | **Agregar a seed** |
| Pago | `FINANCIERO_PAGO_CONSOLIDADO_VER` | ❌ | **Agregar a seed** |

### Cambios en seed de permisos

En `electron/handlers/permissions.handler.ts`, agregar:

```typescript
const SEED_PERMISOS: SeedPermiso[] = [
  // ... existentes ...
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
];
```

### Check en frontend

En cada componente destino que soporte `readonly: true`:

```typescript
ngOnInit(): void {
  if (this.readonly && !this.permissionService.has('PERMISO_REQUERIDO')) {
    this.dialog.open(ConfirmationDialogComponent, {
      width: '440px',
      data: {
        title: 'Sin permisos',
        message: 'No tenés permisos para ver este recurso. Contactá al administrador si necesitás acceso.',
      },
    });
    this.dialogRef.close(); // o this.cerrarTab() si es tab
    return;
  }
  // ... resto de la lógica
}
```

### Check en backend

Los handlers IPC ya tienen `ensurePermission()` como primera línea en handlers de mutación. Para handlers de lectura (ej. `get-gasto`), **verificar que tengan el check**:

```typescript
ipcMain.handle('get-gasto', async (event, id: number) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_GASTO_VER');
  // ... resto
});
```

Si no lo tienen, **agregarlos** (alcance de este PR si es necesario para cerrar la feature).

---

## 6. Riesgos + gotchas

### R1: Hash routing + Electron file://

**Riesgo:** en el contexto Electron (`file://`), el hash routing puede comportarse distinto que en HTTP.

**Mitigación:**
- `useHash: true` ya está configurado y funciona correctamente en los 3 modos (standalone/server/client)
- Los tests manuales en Electron sandbox (Fase 8) validarán que los deep links abren correctamente en modo standalone

**Test crítico:**
- Arrancar la app desktop en modo standalone
- Pegar en la consola de DevTools: `window.location.hash = '#/o/compra/1'` y verificar que abre la tab
- Verificar que el `AuthGuard` redirige correctamente en desktop (puede ser complicado testear sin un servidor local de login)

### R2: PWA mobile + share API

**Riesgo:** la PWA mobile podría recibir el deep link vía `navigator.share` o link directo desde WhatsApp; el comportamiento puede diferir del desktop.

**Mitigación:**
- La PWA corre bajo HTTP (`https://app.frc-gourmet.com`), así que el router Angular funciona normal
- El `AppComponent` es el mismo en desktop y PWA (mismo código, mismo build), así que el interceptor aplica por igual

**Test crítico:**
- Desde un móvil, abrir WhatsApp y tocar un link `https://app.frc-gourmet.com/#/o/gasto/1`
- Verificar que:
  1. Si NO hay sesión → redirige a login
  2. Si HAY sesión → abre el dialog correctamente
- Verificar que el dialog se ve bien en pantalla móvil (width responsivo con `maxWidth: '95vw'`)

### R3: Dialog duplicado + race condition

**Riesgo:** si el usuario toca el link dos veces muy rápido, o el bot envía dos mensajes con el mismo link, podrían abrirse dos dialogs iguales.

**Mitigación:**
- Rastrear dialogs abiertos en `DeepLinkService` con un `Map<string, MatDialogRef<any>>`
- Antes de abrir, verificar `if (openDialogs.has(key)) return;`
- Al cerrar (`ref.afterClosed()`), remover del map

**Test crítico:**
- Hacer doble-clic en un link (o abrir dos tabs con el mismo hash al mismo tiempo)
- Verificar que solo se abre UN dialog

### R4: ID inválido + 404 del backend

**Riesgo:** el backend puede devolver 404 o error genérico; el frontend debe manejarlo gracefully.

**Mitigación:**
- Cada componente destino ya tiene manejo de errores en su `load()` (ej. `catch` en `firstValueFrom`)
- Fase 7 agrega feedback UX consistente: snackbar + cierre automático del tab/dialog

**Test crítico:**
- `#/o/compra/999999` → debe mostrar error y cerrar, NO quedarse en loading infinito

### R5: Doble navegación en desktop (Electron send)

**Riesgo:** en Electron, si el OS envía el deep link como custom protocol (`frc-gourmet://o/compra/1`), el `main.ts` debe reenviarlo al renderer.

**Fuera de alcance:** este plan NO implementa custom protocol handler en Electron (ej. `app.setAsDefaultProtocolClient('frc-gourmet')`). Solo cubre **links HTTP/HTTPS con hash routing**.

**Justificación:** el bot de WhatsApp envía links HTTP (`https://app.frc-gourmet.com/#/...`), que abren en el navegador web (PWA). Si en el futuro se desea que abran la app desktop nativa, se requiere:
- Registrar custom protocol en el installer (NSIS / AppImage)
- En `main.ts`, escuchar `app.on('open-url')` o `app.on('second-instance')` y enviar el link al renderer vía IPC
- Agregar handler IPC en el renderer para recibir el link y delegarlo a `DeepLinkService`

**Decisión:** **no implementar custom protocol en este PR** (queda para futuro si se necesita).

### R6: PWA offline + deep links en cache

**Riesgo:** si el usuario toca un deep link mientras está offline (PWA con service worker), el app puede cachear la navegación y fallar al cargar datos.

**Mitigación:**
- Los handlers IPC (`window.api.*`) ya fallan con error si no hay conexión en modo `client`
- Los componentes ya muestran error en snackbar si `load()` falla
- El deep link NO se "consume" (no se guarda en localStorage como "pendiente"); simplemente falla y el usuario puede reintentar cuando tenga conexión

**Test crítico:**
- En PWA, activar modo avión
- Tocar un deep link → debe fallar gracefully con error de red, NO quedarse en loading infinito

---

## 7. Test plan (sandbox Electron UI)

**Gate:** cualquier PR que toque UI **debe** ser testeable en sandbox Electron antes de ready/merge (regla del overlay 2026-09-12).

### Escenarios de test manual

#### T1: Compra — tab con sesión

1. Iniciar app desktop (modo standalone) y loguearse como ADMIN
2. Crear una compra de prueba y anotar su ID (ej. `#42`)
3. En DevTools console, ejecutar: `window.location.hash = '#/o/compra/42'`
4. **Esperado:** se abre una tab con título "Compra #42" mostrando el detalle
5. Cerrar la tab
6. Repetir el paso 3 → **Esperado:** la tab se reactiva (no se duplica)
7. Anotar resultado en checklist: ✅ PASS / ❌ FAIL

#### T2: Gasto — dialog read-only con sesión

1. Crear un gasto de prueba y anotar su ID (ej. `#17`)
2. `window.location.hash = '#/o/gasto/17'`
3. **Esperado:** se abre un dialog con el formulario deshabilitado, muestra adjuntos, botones "Cerrar" visible, "Guardar" oculto
4. Cerrar el dialog
5. Repetir el paso 2 → **Esperado:** NO se abre segundo dialog
6. ✅ / ❌

#### T3: Vale — dialog con botones contextuales

1. Crear un vale en estado SOLICITADO con ID `#8`
2. `window.location.hash = '#/o/vale/8'`
3. **Esperado:** dialog muestra funcionario, monto, estado SOLICITADO, botones "Pagar" (si tiene permiso) y "Cerrar"
4. Hacer clic en "Pagar" → debe abrir flujo de pago (no cerrar el dialog original hasta que se confirme)
5. ✅ / ❌

#### T4: Pago consolidado — dialog con tabla

1. Crear un pago consolidado (ej. pagar 2 gastos desde Caja Mayor) con ID `#3`
2. `window.location.hash = '#/o/pago/3'`
3. **Esperado:** dialog muestra tabla de obligaciones, formas de pago, total, botón "Anular pago"
4. ✅ / ❌

#### T5: Sin sesión — returnUrl

1. Cerrar sesión (logout)
2. `window.location.hash = '#/o/compra/42'`
3. **Esperado:** redirige a `/login` con query param `returnUrl=%23%2Fo%2Fcompra%2F42`
4. Loguearse como ADMIN
5. **Esperado:** después del login, automáticamente navega a `#/o/compra/42` y abre la tab
6. ✅ / ❌

#### T6: ID inválido — error graceful

1. `window.location.hash = '#/o/compra/999999'`
2. **Esperado:** tab abre, spinner, luego snackbar rojo "No se encontró el registro con ID 999999", tab cierra automáticamente en 3s
3. ✅ / ❌

#### T7: Sin permisos — dialog de error

1. Loguearse con un rol que NO tenga `FINANCIERO_GASTO_VER` (ej. rol MOZO)
2. `window.location.hash = '#/o/gasto/17'`
3. **Esperado:** dialog de confirmación "Sin permisos", al aceptar cierra
4. ✅ / ❌

#### T8: Tipo inválido — snackbar

1. `window.location.hash = '#/o/invalido/123'`
2. **Esperado:** snackbar "Tipo de deep link no reconocido: invalido"
3. ✅ / ❌

### Resultados esperados

Al menos **6 de 8 escenarios en PASS** para considerar la feature completa y lista para merge. Los fallos deben documentarse en `reference/known-bugs.md` con prioridad según impacto:
- T5 (returnUrl) o T1 (tab básica) fallan → **bloqueante (P0)**, no mergear
- T7 (permisos) falla → **alta (P1)**, mergear con advertencia en PR
- T6 o T8 (manejo de errores) fallan → **media (P2)**, mergear y abrir issue de seguimiento

---

## 8. Out of scope (NO en este PR)

### 8.1. Cambios en el bot de WhatsApp

El bot de operaciones (repo externo, fuera de `frc-gourmet`) deberá:
- Construir las URLs deep-link con el formato `https://app.frc-gourmet.com/#/o/{tipo}/{id}`
- Incluir el link en los mensajes de confirmación

**Responsable:** Gabriel / equipo ops  
**Timing:** después de mergear este PR a `develop` y testear en alpha

### 8.2. Custom protocol handler (Electron)

No se implementa `frc-gourmet://` en este PR. Si se desea en el futuro:
- Registrar el protocol en el installer (NSIS / AppImage)
- En `main.ts`, escuchar `app.on('open-url')` y enviar al renderer
- Agregar handler IPC en renderer para recibir y procesar

Requiere PR aparte con testing en 3 plataformas (Windows / macOS / Linux).

### 8.3. Deep links para otros módulos

Este PR **solo** implementa los 4 tipos solicitados: compra, gasto, vale, pago consolidado. Otros tipos (ej. `#/o/venta/{id}`, `#/o/funcionario/{id}`, `#/o/cliente/{id}`) quedan fuera de alcance.

Si en el futuro se desea agregar más tipos:
- Seguir el mismo patrón de `DeepLinkService.openDeepLink()`
- Agregar el handler correspondiente
- Actualizar el mapeo de tipos

### 8.4. Parámetros extra en query string

El esquema propuesto es **solo `#/o/{tipo}/{id}`**, sin query params adicionales (ej. `?action=anular`). Si en el futuro se desea soportar acciones contextuales:
- Parsear `URLSearchParams` del hash
- Pasar parámetros extra al componente destino vía `data`

Ejemplo: `#/o/vale/8?action=pagar` → `openVale(8, { action: 'pagar' })` → el dialog abre directamente el flujo de pago

Requiere PR aparte.

### 8.5. Inventar rutas non-hash

El plan respeta `useHash: true` existente. **NO se modificará el routing strategy a path-based** (ej. `app.frc-gourmet.com/o/compra/123` sin `#`). Razón: el comentario en `app-routing.module.ts` explica que el hash es necesario para Electron bajo `file://`.

Si en el futuro se desea migrar a path routing:
- Requiere resolver el problema de `file://` (ej. servir el desktop vía Electron's `protocol.registerFileProtocol` con un custom scheme como `app://`)
- Cambiar `useHash: false` en `RouterModule.forRoot()`
- Ajustar `AuthGuard` y `returnUrl` para que funcione sin `#`
- Re-testear en Electron + PWA

Requiere PR aparte + migración de usuarios existentes (las URLs viejas con `#` quedarían rotas).

---

## 9. Docs updates después de merge

Una vez mergeado este PR a `develop`:

1. **Actualizar skill:** `.claude/skills/frc-gourmet-expert/architecture/frontend-shell.md` → sección "Deep Links" con el mapeo de tipos y el flujo de interceptación
2. **Actualizar CLAUDE.md:** agregar bullet en sección "Navegación" explicando que además de tabs y dialogs, la app soporta deep links operativos
3. **Actualizar `reference/handlers-index.md`:** listar los handlers IPC usados por los deep links (ej. `get-gasto`, `get-pago-consolidado-detalle`) con nota de que requieren permisos
4. **Agregar `docs/DEEP-LINKS.md`:** documento de referencia para devs externos (ej. equipo del bot) con ejemplos de cada tipo de link y casos de uso

**Responsable:** el agente que implemente (o el que audite post-merge).

---

## 10. Resumen para auditoría

### Alcance técnico

- **Nuevo servicio:** `DeepLinkService` con parseo + dispatch de `#/o/{tipo}/{id}`
- **Interceptor:** `AppComponent.ngAfterViewInit()` escucha `router.events` y delega al servicio
- **4 handlers:** `openCompra` (tab), `openGasto` (dialog readonly), `openVale` (dialog readonly + load), `openPago` (dialog)
- **Permisos:** 3 nuevos en seed (`FINANCIERO_GASTO_VER`, `RRHH_VALE_VER`, `FINANCIERO_PAGO_CONSOLIDADO_VER`)
- **Modificaciones a componentes:**
  - `CreateEditGastoDialogComponent` → soporte `readonly: true`
  - `CreateEditValeDialogComponent` → soporte `valeId` + `readonly: true` + `loadVale()`
  - `LoginComponent` → verificar que lee y respeta `returnUrl` query param (puede ya existir)
- **Docs:** actualizar skill + `reference/handlers-index.md` + crear `docs/DEEP-LINKS.md`

### Fases de commit

8 commits separados (uno por fase), cada uno testeable de forma aislada.

### Riesgos principales

1. **Hash routing en Electron** → ya funciona, pero validar en sandbox
2. **Dialog duplicado** → manejado con `Map` en servicio
3. **ID inválido / 404** → manejado con snackbar + cierre auto
4. **Sin permisos** → fail-closed con dialog claro

### Tests críticos

- T1 (compra tab), T2 (gasto readonly), T5 (returnUrl), T6 (error graceful), T7 (permisos) → **mínimo 5 de 5 en PASS para mergear**
- T8 en FAIL es aceptable si está documentado como known bug

### Puntos de auditoría sugeridos

1. **Convenciones:** ¿el servicio sigue el patrón de otros servicios de la app? ¿usa `Injectable({ providedIn: 'root' })`?
2. **Alcance:** ¿se respeta el límite de 4 tipos? ¿no se inventan rutas Angular nuevas?
3. **Correctitud:** ¿los componentes realmente reciben `data` correcta? ¿el readonly funciona?
4. **Permisos:** ¿los 3 nuevos permisos están en el seed? ¿los checks fail-closed?
5. **Código:** ¿se siguió la regla de "no funciones en templates"? ¿los decimales de moneda se formatean con `| number:'1.0-2'`?

---

## 11. Conclusión

Este plan es **concreto, testeable y auditable**. Cada fase tiene un commit separado con alcance claro. Los 4 tipos de deep link quedan funcionales end-to-end (login + returnUrl + open + error handling + permisos). El bot de WhatsApp podrá enviar links y los usuarios llegarán directamente al registro desde el móvil.

**Próximos pasos:**
1. Revisar este plan (auditoría de alcance + convenciones)
2. Aprobar
3. Implementar por fases (agente implementador o equipo)
4. Testear en sandbox Electron (manual checklist T1-T8)
5. Mergear a `develop` → alpha → beta → stable
6. Actualizar bot de WhatsApp para usar los links

---

## 12. Enmiendas post-auditoría (2026-09-15)

**Estado:** APROBADO por Gabriel (vía Gerente Don Franco)

### Hallazgos incorporados (auditorías A + B)

#### P0: LoginComponent NO lee returnUrl hoy

**Hallazgo verificado:** `src/app/auth/login/login.component.ts` líneas 203/216 — después del login exitoso, **siempre navega a `/`**. El query param `returnUrl` se pierde.

**Cambio requerido en Fase 6:**

```typescript
// En LoginComponent.onSubmit(), después de login exitoso:
const returnUrl = this.route.snapshot.queryParams['returnUrl'];
if (returnUrl) {
  // navigateByUrl decodifica %23 → # automáticamente
  this.router.navigateByUrl(returnUrl);
} else {
  this.router.navigate(['/']);
}
```

**Inyectar `ActivatedRoute`** en el constructor:

```typescript
constructor(
  // ... existentes
  private route: ActivatedRoute, // <-- AGREGAR
) { ... }
```

**Crítico:** sin esto, el flujo returnUrl no funciona. La Fase 6 debe IMPLEMENTAR, no solo verificar.

---

#### P1: Permisos — agregar 3 nuevos al seed (mínimo correcto)

Los permisos propuestos (`FINANCIERO_GASTO_VER`, `RRHH_VALE_VER`, `FINANCIERO_PAGO_CONSOLIDADO_VER`) **son necesarios** porque:

1. Los componentes hoy NO tienen guard explícito de lectura (solo mutación)
2. `/api/rpc` es default-allow — el handler IPC es la única frontera real
3. Los handlers `get-gasto`, `get-vale`, `get-pago-consolidado-detalle` **no tienen `ensurePermission` hoy** (o usan permisos de mutación como proxy)

**Acción:** en Fase 3/4/5, agregar los 3 permisos al seed (`SEED_PERMISOS` en `electron/handlers/permissions.handler.ts`) y agregar `ensurePermission` como primera línea en los handlers `get-*` correspondientes.

**Alternativa:** si existen permisos `XXX_OPERAR` que ya abarcan lectura+mutación, mapear a esos. Pero preferir granularidad correcta (VER ≠ EDITAR).

---

#### P1: Gasto/Vale dialogs — readonly real + loadById

**Hallazgo:** `CreateEditGastoDialogComponent` y `CreateEditValeDialogComponent` hoy:
- Gasto: tiene `loadGasto(id)` pero NO modo readonly (línea 194-258)
- Vale: NO tiene `loadVale(id)` ni modo readonly

**Cambios requeridos (Fase 3/4):**

1. **Ambos dialogs:** aceptar `data.readonly: boolean`
2. **Si readonly:**
   - `form.disable()` — deshabilitar todos los controles
   - Ocultar botones de submit ("Guardar", "Registrar")
   - Mostrar solo "Cerrar" + botones contextuales según permisos (ej. "Anular" si tiene permiso)
   - Banner opcional: `<mat-chip color="accent">Solo lectura</mat-chip>`
3. **Vale:** agregar `async loadVale(valeId: number)`:
   - Llamar `await firstValueFrom(this.repo.getVale(valeId))`
   - Popular formulario con `form.patchValue({ funcionarioId, monto, ... })`
   - Mostrar estado (SOLICITADO/CONFIRMADO/etc) en chip
4. **Handler IPC `get-vale`:** verificar que existe en `repository.service.ts`. Si no existe, agregarlo:
   ```typescript
   getVale(id: number): Observable<any> {
     return from((window as any).api.callIpc('get-vale', id));
   }
   ```
   Y registrar el handler en `electron/handlers/vales.handler.ts`.

---

#### P2: NO auto-cerrar dialogs/tabs después de 3s

**Hallazgo:** la Fase 7 del plan original decía: *"mostrar snackbar + cerrar el tab/dialog automáticamente después de 3s"*.

**Corrección:** **NUNCA cerrar automáticamente**. Razón:
- El usuario puede estar leyendo el error o copiando el ID
- Auto-cerrar es sorpresivo y frustrante
- Mejor UX: error visible + botón "Cerrar" manual

**Cambio en Fase 7:**
- Si `load()` devuelve `null` o 404:
  - Mostrar `MatSnackBar` con error: `"No se encontró el registro con ID {id}"`
  - **NO cerrar** el tab/dialog
  - El tab/dialog queda en estado vacío con mensaje de error visible (ej. `<div class="empty">No se encontró el registro.</div>`)
  - Botón "Cerrar tab" / "Cerrar" disponible para el usuario
- Si error de permisos:
  - Abrir `ConfirmationDialogComponent` con mensaje claro
  - Al aceptar, **el usuario cierra manualmente**
  - NO cerrar automáticamente

---

#### Aceptación explícita: mismas superficies que hoy

**Confirmado:** cada deep link abre **exactamente la misma UI** que el usuario vería si navegara manualmente:

| Deep link | Superficie | Método equivalente hoy |
|-----------|-----------|------------------------|
| `#/o/compra/{id}` | `CompraDetalleComponent` (tab) | `ListComprasComponent.verDetalle()` |
| `#/o/gasto/{id}` | `CreateEditGastoDialogComponent` (dialog readonly) | `ListGastosComponent.abrirGasto()` + readonly |
| `#/o/vale/{id}` | `CreateEditValeDialogComponent` (dialog readonly) | NO existe hoy — creamos equivalente |
| `#/o/pago/{id}` | `DetallePagoConsolidadoDialogComponent` (dialog) | `CajaMayorDetalleComponent.verDetallePagoConsolidado()` |

**No se inventa navegación nueva** — solo se agrega un punto de entrada alternativo (URL) a las pantallas existentes.

---

### Actualización de fases

Las 8 fases originales se mantienen, con ajustes:

- **Fase 3 (gasto):** agregar readonly + check permiso `FINANCIERO_GASTO_VER` + handler `get-gasto` con `ensurePermission`
- **Fase 4 (vale):** agregar readonly + `loadVale()` + handler `get-vale` con `ensurePermission` + permiso `RRHH_VALE_VER` al seed
- **Fase 5 (pago):** agregar permiso `FINANCIERO_PAGO_CONSOLIDADO_VER` al seed + `ensurePermission` en handler `get-pago-consolidado-detalle`
- **Fase 6 (returnUrl):** **IMPLEMENTAR** lectura de `returnUrl` en `LoginComponent.onSubmit()` (inyectar `ActivatedRoute`)
- **Fase 7 (errores):** **NO auto-cerrar** — solo mostrar error visible + dejar que el usuario cierre manualmente

---

**Fin del plan enmendado.**
