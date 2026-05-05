# Reglas de código (no negociables)

## TypeScript / Angular

### 1. Editar sólo `.ts`

`.js` y `.js.map` se autogeneran. Si encontrás un cambio en un `.js`, asumí que viene de tsc — buscá el `.ts` correspondiente.

### 2. Strings UPPERCASE en BD

```typescript
// ✅ Correcto
const entity = repo.create({
  nombre: (data.nombre || '').toString().toUpperCase(),
  categoria: data.categoria?.toUpperCase(),
});

// ❌ Incorrecto
const entity = repo.create({ nombre: data.nombre });
```

Aplica en handlers (antes de `repo.save()`) y en componentes que pre-procesan input. Excepción: campos de comentarios/observaciones en texto libre (`observacionLibre`, `motivoAnulacion`) — esos se respetan tal cual.

### 3. NO funciones en templates

Nunca:
```html
<!-- ❌ recomputa cada change detection -->
<span>{{ calcularTotal() }}</span>
<input [value]="formatear(item.precio)" />
<div *ngIf="puedeEditar()">...</div>
```

Sí:
```typescript
// Pre-computar en propiedades
this.total = this.items.reduce((s, i) => s + i.precio, 0);
this.precioFormateado = this.formatear(item.precio);
this.canEdit = this.checkPermissions();
```
```html
<span>{{ total }}</span>
<input [value]="precioFormateado" />
<div *ngIf="canEdit">...</div>
```

**Tampoco getters** que computen — Angular los llama en cada CD.

Para transformar datos use **pipes** (`| number:'1.0-2'`, `| date:'dd/MM/yyyy'`, custom pipes).

### 4. Number formatting

Pipe estándar: `| number:'1.0-2'` (mínimo 0 decimales, máximo 2).

```html
<td>{{ producto.precio | number:'1.0-2' }}</td>
```

Para moneda PYG (sin decimales): el pipe `'1.0-0'` o usar `CurrencyConfigService`.

### 5. Sin colores hardcoded

```scss
// ❌ Incorrecto
.card { background: #fff; color: #000; }

// ✅ Correcto
.card { background: var(--surface); color: var(--text-primary); }
```

Variables disponibles (`src/styles/theme-variables.scss`):
- `--text-primary`, `--text-secondary`
- `--surface`, `--surface-variant`
- `--border-color`, `--hover-bg`, `--shadow-color`
- Estados: `--success-color`, `--warning-color`, `--error-color`, `--info-color`

### 6. Paleta de estados (verde/amarillo/naranja/rojo/celeste)

Sólo estos 5 colores para chips/badges/indicadores de estado, alerta, selección:

| Color | Hex | Uso |
|---|---|---|
| Verde | `#4caf50` | OK, completado, entregado, positivo |
| Amarillo | `#ffc107` | atención, advertencia leve, en espera |
| Naranja | `#ff9800` | alerta media, demora |
| Rojo | `#f44336` | error, cancelado, alerta alta, demora crítica |
| Celeste | `#2196f3` | informativo, selección, en proceso |

**No usar** morado, gris, azul oscuro, marrón, etc., para estados. (`feedback_colores_estados`)

### 7. Acciones en tablas con `mat-menu`

```html
<!-- ✅ Correcto -->
<td>
  <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
  <mat-menu #menu="matMenu">
    <button mat-menu-item (click)="editar()"><mat-icon>edit</mat-icon> Editar</button>
    <button mat-menu-item (click)="eliminar()"><mat-icon>delete</mat-icon> Eliminar</button>
  </mat-menu>
</td>

<!-- ❌ Incorrecto -->
<td>
  <button mat-icon-button (click)="editar()"><mat-icon>edit</mat-icon></button>
  <button mat-icon-button (click)="eliminar()"><mat-icon>delete</mat-icon></button>
</td>
```

(`feedback_mat_menu_acciones`)

### 8. Confirmaciones con `ConfirmationDialogComponent`

```typescript
const ref = this.dialog.open(ConfirmationDialogComponent, {
  data: { title: 'Eliminar funcionario', message: '¿Seguro? Esta acción no se puede deshacer.' }
});
ref.afterClosed().subscribe(ok => {
  if (ok) this.eliminar();
});
```

Nunca `confirm()` ni alerts custom.

### 9. Acceso a BD vía RepositoryService

Desde componentes Angular, **siempre** vía `RepositoryService`. Nunca instanciar TypeORM en el renderer ni llamar `window.api.*` directamente.

### 10. No live filtering, no sort por defecto

- Filtros con botón **"Filtrar"** explícito (no debounce + auto-search) — salvo que el usuario pida lo contrario en una UI específica.
- `mat-sort-header` solo si pide explícitamente (`feedback`).

## Naming de componentes

- **Listas**: `list-{entidad}.component` (ej: `list-funcionarios.component.ts`).
- **Editor**: `create-edit-{entidad}.component` (ej: `create-edit-cargo.component.ts`).
- **Dialog**: sufijo `-dialog` (ej: `pagar-cuota-dialog.component.ts`, `cobrar-venta-dialog.component.ts`).
- **Servicio**: `{nombre}.service.ts`.

Cada componente: archivos separados `.ts` + `.html` + `.scss`.

## Estructura de carpetas (pages)

```
src/app/pages/<dominio>/
  ├── dashboard/                # opcional, hub del dominio
  ├── list-<entidad>/
  │   ├── list-<entidad>.component.ts
  │   ├── list-<entidad>.component.html
  │   └── list-<entidad>.component.scss
  ├── create-edit-<entidad>/    # editor (modo create + edit)
  └── <subdialog>/              # dialogs específicos del dominio
```

Para dominios complejos (productos, financiero), hay sub-carpetas adicionales (`gestionar-producto/`, `caja-mayor/`).

## Reusar módulos, no crear nuevos

Si necesitás declarar un componente legacy (no standalone), agregalo a un módulo existente (típicamente `AppModule` o `GestionRecetasModule`). No crees módulos vacíos.

Para componentes nuevos: **standalone** por default.

## Pruebas UI paso a paso

Cuando se prueba una feature nueva:
1. Indicar UNA acción al usuario.
2. Esperar confirmación.
3. Si requiere verificación, leer la BD SQLite (`userData/frc-gourmet.db`) o consultar via handler.
4. Solo entonces dar el siguiente paso.

No listar todos los pasos de una. (`feedback_pruebas_ui_paso_a_paso`)

## Avisar reinicio

Después de cada cambio, indicar al usuario:

| Cambio en | Reinicio |
|---|---|
| `.html`, `.scss`, `.ts` de componentes Angular | ❌ NO (hot reload) |
| `electron/handlers/*` | ✅ SÍ |
| `preload.ts` | ✅ SÍ |
| `main.ts` | ✅ SÍ |
| Nueva entidad o `database.config.ts` | ✅ SÍ |

(`feedback_reiniciar_app`)

## Cada diálogo, un propósito

No mezclar conceptos. Si hay un dialog de "Configurar atajos" y aparece la necesidad de configurar pizza, **NO** agregar a ese dialog: crear `pdv-config-dialog` dedicado.

Excepción: dialogs híbridos tab/dialog que agrupan información de un mismo contexto. (`feedback_separar_conceptos`)

## Componente híbrido tab/dialog

Si un mat-dialog se queda chico para su contenido, abrirlo como **tab** vía `tabsService.openTabWithData(...)`. Patrón → [conventions/ui-patterns.md](ui-patterns.md).
