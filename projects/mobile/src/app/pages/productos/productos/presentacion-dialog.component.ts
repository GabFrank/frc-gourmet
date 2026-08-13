import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

/** Código de barra en borrador. `id` presente = ya existe en la BD (edición). */
export interface CodigoDraft {
  id?: number;
  codigo: string;
  principal: boolean;
}

/**
 * Presentación en borrador. En edición trae `id` (presentación existente) y
 * `precioId` (precio principal existente) para saber si actualizar o crear.
 */
export interface PresentacionDraft {
  id?: number;
  precioId?: number;
  nombre: string;
  cantidad: number;
  principal: boolean;
  precioValor: number | null;
  monedaId: number | null;
  tipoPrecioId: number | null;
  codigos: CodigoDraft[];
}

interface DialogData {
  monedas: { id: number; denominacion: string; simbolo: string; principal?: boolean }[];
  tiposPrecio: { id: number; descripcion: string; principal?: boolean }[];
  presentacion?: PresentacionDraft;
}

/**
 * Alta/edición de una presentación (con su precio y códigos de barra) dentro del
 * alta de producto en la PWA. Devuelve un `PresentacionDraft`; el guardado real
 * lo hace la página al persistir el producto (createPresentacion → createPrecioVenta
 * → createCodigoBarra).
 */
@Component({
  selector: 'app-presentacion-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule, MatSlideToggleModule, MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.presentacion ? 'Editar presentación' : 'Nueva presentación' }}</h2>
    <mat-dialog-content>
      <form class="pd-form" [formGroup]="form">
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="nombre" autocapitalize="characters" placeholder="Ej: UNIDAD, CAJA X6" />
          <mat-error *ngIf="form.controls.nombre.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Cantidad</mat-label>
          <input matInput type="number" inputmode="decimal" formControlName="cantidad" />
          <mat-error *ngIf="form.controls.cantidad.hasError('required') || form.controls.cantidad.hasError('min')">
            Debe ser mayor a 0
          </mat-error>
        </mat-form-field>

        <mat-slide-toggle formControlName="principal" color="primary">Presentación principal</mat-slide-toggle>

        <h3 class="pd-section">Precio</h3>
        <mat-form-field appearance="outline">
          <mat-label>Valor</mat-label>
          <input matInput type="number" inputmode="decimal" formControlName="precioValor" />
        </mat-form-field>
        <div class="pd-row">
          <mat-form-field appearance="outline">
            <mat-label>Moneda</mat-label>
            <mat-select formControlName="monedaId">
              <mat-option *ngFor="let m of data.monedas" [value]="m.id">{{ m.simbolo }} — {{ m.denominacion }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Tipo de precio</mat-label>
            <mat-select formControlName="tipoPrecioId">
              <mat-option *ngFor="let t of data.tiposPrecio" [value]="t.id">{{ t.descripcion }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <p class="pd-hint" *ngIf="form.controls.precioValor.value">
          El precio se guardará como principal de esta presentación.
        </p>

        <h3 class="pd-section">Códigos de barra</h3>
        <div class="pd-codigo" *ngFor="let c of codigos; let i = index">
          <mat-form-field appearance="outline" class="pd-codigo-input">
            <mat-label>Código {{ i + 1 }}</mat-label>
            <input matInput [value]="c.codigo" (input)="setCodigo(i, $event)" autocapitalize="characters" />
          </mat-form-field>
          <button mat-icon-button [color]="c.principal ? 'primary' : undefined" (click)="marcarCodigoPrincipal(i)"
                  [attr.aria-label]="'Marcar principal'" matTooltip="Principal">
            <mat-icon>{{ c.principal ? 'star' : 'star_border' }}</mat-icon>
          </button>
          <button mat-icon-button color="warn" (click)="quitarCodigo(i)" aria-label="Quitar">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <button mat-stroked-button type="button" class="pd-add-codigo" (click)="agregarCodigo()">
          <mat-icon>add</mat-icon> Agregar código
        </button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="aceptar()">Aceptar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .pd-form { display: flex; flex-direction: column; gap: 4px; min-width: min(86vw, 420px); }
    .pd-row { display: flex; gap: 8px; }
    .pd-row mat-form-field { flex: 1 1 0; }
    .pd-section { margin: 8px 0 2px; font-size: 0.95rem; font-weight: 600; color: var(--text-secondary); }
    .pd-hint { margin: 0 0 6px; font-size: 0.78rem; color: var(--text-secondary); }
    .pd-codigo { display: flex; align-items: center; gap: 4px; }
    .pd-codigo-input { flex: 1 1 auto; }
    .pd-add-codigo { align-self: flex-start; margin-top: 4px; }
  `],
})
export class PresentacionDialogComponent {
  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    cantidad: [1, [Validators.required, Validators.min(0.001)]],
    principal: [false],
    precioValor: [null as number | null],
    monedaId: [null as number | null],
    tipoPrecioId: [null as number | null],
  });

  codigos: CodigoDraft[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<PresentacionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
  ) {
    const p = data.presentacion;
    if (p) {
      this.form.patchValue({
        nombre: p.nombre, cantidad: p.cantidad, principal: p.principal,
        precioValor: p.precioValor, monedaId: p.monedaId, tipoPrecioId: p.tipoPrecioId,
      });
      this.codigos = p.codigos.map((c) => ({ ...c }));
    } else {
      // Preseleccionar moneda principal (o primera) y primer tipo de precio.
      const monedaDef = data.monedas.find((m) => m.principal) || data.monedas[0];
      const tipoDef = data.tiposPrecio.find((t) => t.principal) || data.tiposPrecio[0];
      this.form.patchValue({ monedaId: monedaDef?.id ?? null, tipoPrecioId: tipoDef?.id ?? null });
    }
  }

  agregarCodigo(): void {
    this.codigos.push({ codigo: '', principal: this.codigos.length === 0 });
  }

  setCodigo(i: number, ev: Event): void {
    this.codigos[i].codigo = (ev.target as HTMLInputElement).value;
  }

  marcarCodigoPrincipal(i: number): void {
    this.codigos.forEach((c, idx) => (c.principal = idx === i));
  }

  quitarCodigo(i: number): void {
    const eraPrincipal = this.codigos[i].principal;
    this.codigos.splice(i, 1);
    if (eraPrincipal && this.codigos.length) this.codigos[0].principal = true;
  }

  cancelar(): void {
    this.dialogRef.close();
  }

  aceptar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const codigos: CodigoDraft[] = this.codigos
      .map((c) => ({ id: c.id, codigo: c.codigo.trim().toUpperCase(), principal: c.principal }))
      .filter((c) => c.codigo.length > 0);
    if (codigos.length && !codigos.some((c) => c.principal)) codigos[0].principal = true;
    const prev = this.data.presentacion;
    const result: PresentacionDraft = {
      id: prev?.id,
      precioId: prev?.precioId,
      nombre: v.nombre.trim().toUpperCase(),
      cantidad: Number(v.cantidad) || 1,
      principal: v.principal,
      precioValor: v.precioValor != null && Number(v.precioValor) > 0 ? Number(v.precioValor) : null,
      monedaId: v.monedaId,
      tipoPrecioId: v.tipoPrecioId,
      codigos,
    };
    this.dialogRef.close(result);
  }
}
