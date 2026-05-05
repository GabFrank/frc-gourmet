# Patrones UI

## Layout full-height (tabla con scroll local)

Cuando una tabla con paginador alto causa scroll de página, usar este patrón para que **solo la zona de la tabla scrollee**:

```scss
:host {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.contenedor-raiz {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.page-header {
  flex-shrink: 0;  // El header NO crece
}

.content-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

mat-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

::ng-deep .mat-mdc-card-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;  // ← AQUÍ scrollea la tabla
}

mat-paginator {
  flex-shrink: 0;  // El paginator NO crece
}

// Header sticky
.mat-mdc-header-cell {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #fff;
}
.dark-theme .mat-mdc-header-cell {
  background: #424242;
}

// Responsive: en mobile volver al scroll de página
@media (max-width: 1100px) {
  .contenedor-raiz, mat-card, ::ng-deep .mat-mdc-card-content { overflow: visible; height: auto; }
}
```

**Cuidado paso 6:** `mat-card-content` por defecto es `display: block` — sin el `::ng-deep` override, la cadena flex se rompe.

Implementado en `caja-mayor-detalle.component`. Replicar exactamente. (`feedback_full_height_layout`)

## Componente híbrido tab/dialog

Cuando un dialog se queda chico para su contenido (tabla con muchas columnas, filtros + paginación), abrirlo **como tab** da mejor UX que agrandar el dialog.

```typescript
// Componente
@Component({
  selector: 'app-x',
  standalone: true,  // ← obligatorio
  imports: [...],
})
export class XComponent {
  isTab = false;

  constructor(
    @Optional() public dialogRef: MatDialogRef<XComponent> | null,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    this.isTab = !this.dialogRef;
  }

  // Llamado por TabContainer si se monta como tab
  setData(data: any) {
    this.data = data;
    if (this.form) this.loadData();  // protección si form no está inicializado
  }
}
```

```html
<!-- Botón cerrar solo en modo dialog -->
<button mat-icon-button *ngIf="!isTab" (click)="dialogRef.close()">
  <mat-icon>close</mat-icon>
</button>

<div [class.tab-mode]="isTab">...</div>
```

```scss
:host {
  &.tab-mode {
    min-width: 0;
    max-width: none;
    width: 100%;
  }
  // Modo dialog mantiene min-width: 90vw, etc.
}
```

Apertura desde código:
```typescript
// Como tab (id estable evita duplicados, permite refrescar data)
this.tabsService.openTabWithData('Movimientos cuenta', XComponent, { cuentaBancariaId: 5 }, `cb-mov-${5}`, true);

// Como dialog
this.dialog.open(XComponent, { data: { cuentaBancariaId: 5 }, width: '1100px' });
```

(`feedback_componente_hibrido_tab_dialog`)

## Chip inline con span (no mat-chip)

```html
<!-- ❌ mat-chip suelto se renderiza como block/flex propio, sin respetar inline-flex -->
<td>
  <span>Pago</span>
  <mat-chip color="warn">ANULADO</mat-chip>  <!-- pegado al borde derecho -->
</td>

<!-- ✅ Span con clase -->
<td>
  <span>Pago</span>
  <span class="chip-anulado">ANULADO</span>
</td>
```

```scss
.chip-anulado {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  color: white;
  background: #f44336;  // rojo (estado anulado)
  white-space: nowrap;

  mat-icon {
    font-size: 14px;
    width: 14px;
    height: 14px;
  }
}
```

`<mat-chip-listbox><mat-chip>...</mat-chip></mat-chip-listbox>` SÍ funciona — el problema es **chip suelto** fuera del listbox. (`feedback_mat_chip_standalone`)

## Acciones en tablas (mat-menu)

```html
<ng-container matColumnDef="acciones">
  <th mat-header-cell *matHeaderCellDef></th>
  <td mat-cell *matCellDef="let row">
    <button mat-icon-button [matMenuTriggerFor]="menu" (click)="$event.stopPropagation()">
      <mat-icon>more_vert</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      <button mat-menu-item (click)="editar(row)" *ngIf="row.estado === 'BORRADOR'">
        <mat-icon>edit</mat-icon> Editar
      </button>
      <button mat-menu-item (click)="ver(row)">
        <mat-icon>visibility</mat-icon> Ver detalle
      </button>
      <mat-divider></mat-divider>
      <button mat-menu-item (click)="anular(row)" *ngIf="row.estado === 'FINALIZADO'">
        <mat-icon>cancel</mat-icon> Anular
      </button>
    </mat-menu>
  </td>
</ng-container>
```

`event.stopPropagation()` evita que el click en el botón también dispare un `(rowClick)` si la fila la tiene.

## PaginatorIntlEs

`MatPaginator` está traducido al español global. Provider en `AppModule`:

```typescript
{ provide: MatPaginatorIntl, useClass: PaginatorIntlEs }
```

Funciona para standalones porque `main.ts` usa `bootstrapApplication(AppComponent, { providers: [importProvidersFrom(AppModule)] })`.

Si en el futuro se elimina AppModule, mover el provider directamente a `bootstrapApplication`. (`reference_paginator_intl_es`)

## Tab/dialog para componentes pesados

Patrón típico: lista paginada + filtros + acciones en tabla. Si el componente vive en una **tab**, generalmente no necesita ser dialog. Reservar dialog sólo para flujos modales cortos (confirmación, formulario simple, selector).

## Refresh manual en tabla

Patrón provisional (hasta crear `<app-table-toolbar>` reutilizable):

```html
<div class="movimientos-header">
  <h3>Movimientos</h3>
  <button mat-icon-button (click)="loadMovimientos()" [disabled]="isLoading">
    <mat-icon [class.spinning]="isLoading">refresh</mat-icon>
  </button>
</div>
```

```scss
.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

→ TODO: componente reutilizable `<app-table-toolbar>` (ver `project_todo_table_toolbar`).

## SnackBar para feedback

```typescript
this.snackBar.open('Compra finalizada exitosamente', 'Cerrar', {
  duration: 3000,
  panelClass: 'success-snackbar',  // o 'error-snackbar' (8s, rojo)
  horizontalPosition: 'right',
  verticalPosition: 'bottom',
});
```

Para errores que vienen de IPC:

```typescript
const extraerMensajeError = (e: any): string => {
  const raw = e?.message || String(e);
  // Quita el prefijo "Error invoking remote method 'X': Error: ..."
  const m = raw.match(/Error invoking remote method '[^']+': Error: (.*)/);
  return m ? m[1] : raw;
};

this.snackBar.open(extraerMensajeError(error), 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
```

## Currency input

Componente standalone: `src/app/shared/components/currency-input/`. Aplica máscara según moneda (PYG: sin decimales, separador `.`; USD/BRL: 2 decimales, separador `,`).

Servicio: `currencyConfigService.getConfigForCurrency(moneda)`.

## Confirmación con ConfirmationDialog

```typescript
this.dialog.open(ConfirmationDialogComponent, {
  data: {
    title: 'Anular liquidación',
    message: 'Esta acción revertirá vales, cuotas y movimientos de caja mayor.\n\n¿Continuar?'
  }
}).afterClosed().subscribe(ok => {
  if (ok) this.anular();
});
```

`white-space: pre-line` en el `<p>` permite saltos de línea con `\n`.

## Diferencia visual: ANULADO vs MODIFICADO

- **ANULADO** (Caja Mayor, vales, etc.): chip rojo `🚫 ANULADO` + texto/monto **tachado**.
- **MODIFICADO** (VentaItem editado): se preserva el original con flag `modificado=true` y se crea una nueva versión vinculada por `nuevaVersionVentaItem`. UI muestra estado MODIFICADO con color celeste.
- **CANCELADO** (VentaItem desde menú): estado=CANCELADO, no suma al total, opacidad reducida.

## Tipos humanizados (chips)

En lugar de mostrar enums tal cual:

```typescript
const tipoMovimientoLabelMap: Record<string, string> = {
  EGRESO_CUOTA_PRESTAMO: 'Egreso cuota préstamo',
  INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO: 'Cobro cuota préstamo func.',
  EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO: 'Desembolso préstamo func.',
  // ...
};

humanizar(tipo: string) {
  return this.tipoMovimientoLabelMap[tipo] || tipo;
}
```

```html
<span class="chip-tipo" [matTooltip]="row.tipoMovimiento">{{ humanizar(row.tipoMovimiento) }}</span>
```

El tooltip preserva el enum técnico para debugging.

## Toggle "Ver anulaciones" en lista de movimientos

Por defecto, la lista de Caja Mayor **oculta los contra-movimientos** (filas con `referencia_anulacion_id != null`). Las filas originales que fueron anuladas se muestran con texto/monto **tachado** y chip rojo `ANULADO`.

Toggle "Ver anulaciones": muestra también los contra-movimientos con chip naranja `↩ ANULACION DE #X` y fondo rojizo claro.

Backend: `get-caja-mayor-movimientos` acepta `incluirAnulaciones` (default false). Cada item se decora con `.anulacion: { id, fecha, motivo, responsableNombre }` si fue anulado. (`project_caja_mayor_anulaciones_ux`)
