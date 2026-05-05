# Frontend shell — AppComponent, tabs, sidenav, theme

## Layout principal

`src/app/app.component.ts` (743 líneas) y `app.component.html` (390 líneas). Es **standalone** pero AppModule todavía aporta providers globales.

### Estructura visual

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ [☰] FRC Gourmet                  [☀/🌙] [🔔5] [👤Mi Perfil ▾] │  │  ← mat-toolbar (64px)
│ └────────────────────────────────────────────────────────────────┘  │
│ ┌──────────┬─────────────────────────────────────────────────────┐  │
│ │ SIDENAV  │  TAB CONTAINER                                      │  │
│ │ (60px ↔  │  ┌─────────┬──────────┬───────────┬─────────────┐ │  │
│ │  250px)  │  │ Dashbo… │ Pdv [×] │ Compras…  │ + ...       │ │  │
│ │          │  ├─────────┴──────────┴───────────┴─────────────┤ │  │
│ │ ◯ Dash   │  │                                                │ │  │
│ │ ▾ Ventas │  │   Componente activo del tab                    │ │  │
│ │ ▾ RRHH   │  │                                                │ │  │
│ │ ▾ Compr. │  │                                                │ │  │
│ │ ▾ Finan. │  │                                                │ │  │
│ │ ▾ Prod.  │  │                                                │ │  │
│ │ ▾ Comis. │  │                                                │ │  │
│ │ ▾ Confg. │  │                                                │ │  │
│ │          │  │                                                │ │  │
│ │ [Salir]  │  │                                                │ │  │
│ └──────────┴─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Toolbar (header)

- **Botón menu** (☰): toggle expanded/collapsed sidenav.
- **Theme toggle**: `mat-slide-toggle` con iconos `light_mode` / `dark_mode`. Persiste en `localStorage.darkTheme`.
- **Notificaciones** (badge "5" hardcoded en HTML, pero también se carga `notificacionesNoLeidas` real de RRHH cada 5 min vía `repo.countNotificacionesNoLeidas()`).
- **User menu**: Mi Perfil, Cerrar Sesión.

### Sidenav

`mat-sidenav` con dos modos:
- **`collapsed`**: 60px, sólo iconos centrados.
- **`expanded`**: 250px, iconos + labels + paneles expandibles.

User profile header al tope (avatar + nombre + último acceso).

Secciones (8 paneles `mat-expansion-panel`):
1. **Dashboard** (item simple, no expansion)
2. **Ventas** → Dashboard
3. **Recursos Humanos** → 19 sub-items (Dashboard, Notificaciones [con badge], Reportes, Personas, Usuarios, Clientes, Cargos, Funcionarios, Turnos, Asistencias, Penalizaciones, Horas extra, Vales, Motivos vale, Préstamos, Liquidaciones, Bonos, Aguinaldos, Feriados, Permisos, Config RRHH)
4. **Comisiones** → Reglas, Equipos, Liquidaciones
5. **Productos** → Dashboard, Categorías (TODO), Productos, Recetas, Sabores, Adicionales, Ingredientes (TODO), Movimientos Stock (TODO)
6. **Compras** → Dashboard, Compras
7. **Financiero** → Dashboard, Cajas, Monedas, Tipos Precio (TODO), Caja Mayor, Cuentas por Cobrar
8. **Configuración** → Impresoras, Dispositivos y Puntos de Venta

Footer del sidenav: botón **Salir** (logout, rojo).

→ Árbol completo en [reference/menu-sidenav-tree.md](../reference/menu-sidenav-tree.md).

## TabsService — sistema de navegación

`src/app/services/tabs.service.ts` (242 líneas). El router de Angular sólo maneja `/login`. Todo el resto de la nav es por **tabs dinámicas** gestionadas en memoria.

### Modelo

```typescript
interface Tab {
  id: string;            // UUID o id estable
  title: string;
  componentType: Type<any>;
  active: boolean;
  data?: any;
  closable?: boolean;
}

class TabsService {
  tabs: Tab[] = [];
  tabs$ = new BehaviorSubject<Tab[]>([]);
  activeTab$ = new BehaviorSubject<string | null>(null);

  // API principal
  openTab(title, componentType, data?, id?, closable=true): number;
  openTabWithData(title, componentType, data?, id?, closable=true): number;
  removeTab(index: number);
  removeTabById(tabId: string);
  removeAllTabs();
  setTabActive(index: number);
  changeCurrentTabName(name: string);
}
```

**Comportamiento de duplicados:**
- `openTab`: si ya hay tab con mismo título → activa la existente (no duplica).
- `openTabWithData`: si hay tab con mismo `id` o `title` → actualiza `data` y la activa. Útil para "abrir compra-detalle del id 42" desde múltiples lugares.

**Tab inicial:** el constructor agrega `'Dashboard de ventas'` (`VentasDashboardComponent`).

**Logout** llama `removeAllTabs()` antes del `authService.logout()`.

### TabContainerComponent

`src/app/components/tab-container/`. Itera `tabsService.tabs$` con `mat-tab-group` y monta el componente activo dinámicamente vía `ViewContainerRef.createComponent()` (directiva `content-container.directive.ts`).

Cada tab puede tener botón × para cerrarse (si `closable=true`). Click en × usa `event.stopPropagation()` para no activar la tab al cerrarla.

## Servicios Angular

`src/app/services/`:

| Servicio | Función |
|---|---|
| `RepositoryService` (en `database/`) | Wrapper de `window.api.*` → Observables. ~3700 líneas. |
| `TabsService` | Gestión de tabs dinámicas. |
| `AuthService` | Login/logout, sesión, `currentUser$` BehaviorSubject. JWT en localStorage. |
| `ThemeService` | Dark/light, persistencia en localStorage, fallback `prefers-color-scheme`. |
| `DatabaseService` | Wrapper Angular del DataSource (renderer-side). |
| `PrinterService` | Carga de impresoras, default printer, test print. |
| `PermissionService` | Permisos del usuario actual cacheados en `Set<string>`. `has()`, `hasAny()`, `hasAll()`. |
| `RecetasService` | CRUD recetas + cálculo costos. Usa `window.api`. |
| `SaboresService` | CRUD sabores via IPC. |
| `SaboresVariacionesService` | Estado complejo sabores/variaciones con BehaviorSubjects. |
| `EliminarIngredienteService` | Orquesta eliminación de ingredientes multi-variación. |
| `UnitConversionService` | Conversiones GRAMO↔KILOGRAMO, LITRO↔ML, METRO↔CM. |

`src/app/core/services/`:
- `comprasService` — algunas operaciones de compras a alto nivel.
- `pagosService` — flujo de pagos.

`src/app/shared/services/`:
- `currencyConfigService` — config `ngx-currency` por moneda (PYG: precision 0; USD/BRL: precision 2).

## Theming

`src/styles.scss`:
- Material 15 con paletas custom: red (primary), green (secondary), orange (accent/warn).
- Density: `-3` (mínima).
- Tipografía custom (tamaños reducidos).
- `@include mat.all-component-themes($custom-light-theme)` por defecto.
- `.dark-theme { @include mat.all-component-themes($custom-dark-theme); }`.

`src/styles/theme-variables.scss` (CSS custom properties):

```scss
:root {
  --text-primary: #000000;
  --text-secondary: #666666;
  --surface: #ffffff;
  --surface-variant: #f5f5f5;
  --border-color: rgba(0, 0, 0, 0.12);
  --hover-bg: rgba(0, 0, 0, 0.04);
  --shadow-color: rgba(0, 0, 0, 0.1);

  --success-color: #4caf50;   // verde
  --warning-color: #ff9800;   // naranja
  --error-color: #f44336;     // rojo
  --info-color: #2196f3;      // celeste
}

.dark-theme {
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --surface: #424242;
  --surface-variant: #616161;
  // ...
}
```

**Regla:** componentes nunca hardcodean colores. Usar siempre `var(--xxx)`.

→ Paleta de estados / alertas en [conventions/coding-rules.md](../conventions/coding-rules.md).

## Routing y guards

`src/app/app-routing.module.ts`:

```typescript
const routes: Routes = [
  { path: 'login', loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent) },
  { path: '**', redirectTo: '' }
];
```

**Sólo `/login` es ruta**. Todo el resto se navega como tabs (no usa router). El path `''` no resuelve a un componente — el sidenav y `app.component.html` controlan qué se muestra cuando hay sesión activa.

**`AuthGuard`** (`src/app/guards/auth.guard.ts`): chequea `authService.isLoggedIn`, redirige a `/login?returnUrl=<url>` si no.

**No hay guards de permisos** — la validación de permisos se hace en componentes (`*ngIf="permService.has('CODIGO')"`) o, idealmente, en handlers (TODO: agregar).

## I18n

**No implementado**. Todo el texto está hardcoded en español. `@ngx-translate/core` está instalado pero no inicializado.

`PaginatorIntlEs` (`src/app/shared/utils/paginator-intl-es.ts`) traduce los labels del `mat-paginator`:
```typescript
{ provide: MatPaginatorIntl, useClass: PaginatorIntlEs }
```
Provider en AppModule, propaga a standalones via `importProvidersFrom(AppModule)`.

## Dialogs reusables

`src/app/shared/components/` tiene ~40 dialogs. Algunos importantes:

| Dialog | Propósito |
|---|---|
| `confirmation-dialog` | Sí/No genérico — usar siempre que se pida confirmación. |
| `cobrar-venta-dialog` | Cobro multi-pago multi-moneda (PdV). 819 líneas. |
| `personalizar-producto-dialog` | Variaciones, ingredientes, adicionales, observaciones de un producto en venta. |
| `seleccionar-variacion-dialog` | Pizza con sabores: 3 pasos (tamaño → sabores → personalización). |
| `pagar-compras-dialog` | Pago multi-cuota de CPP de compras (modo lote). |
| `confirmar-egreso-dialog` / `registrar-egreso-dialog` / `registrar-ingreso-dialog` | Flujo Caja Mayor. |
| `pagar-cuota-dialog` | Pago de cuota individual CPP/CPC con dirección PAGAR/COBRAR. |
| `paginated-dropdown` | Dropdown con paginación + búsqueda — útil para listas largas. |
| `producto-search-dialog` | Búsqueda paginada de productos para PdV/compras (con `mode: 'venta' | 'compra'`). |
| `delivery-dialog` / `crear-delivery-dialog` | Gestión de delivery con autocomplete por teléfono. |
| `pdv-config-dialog` | Configuración del PdV (umbrales, pizza, delivery, comandas). |
| `atajo-config-dialog` / `atajo-productos-dialog` | Configuración y uso de atajos de PdV. |
| `transferir-mesa-dialog`, `dividir-cuenta-dialog`, `mesa-selection-dialog` | Operativa de mesas. |
| `payment-options-dialog` | "¿Cobrar ahora o después?" PAY_NOW/PAY_LATER/CANCEL. |
| `currency-input` | Componente standalone para entrada de montos con máscara según moneda. |
