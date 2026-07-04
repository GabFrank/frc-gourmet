import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

export interface PasoResult {
  titulo: string | null;
  descripcion: string;
  /** IDs de RecetaIngrediente (ítems) que participan en este paso. */
  itemIds: number[];
}

interface PasoItemOption {
  id: number;
  nombre: string;
}

interface DialogData {
  titulo?: string | null;
  descripcion?: string;
  orden?: number;
  /** Ítems de la receta disponibles para vincular al paso. */
  items?: PasoItemOption[];
  /** IDs de ítems ya vinculados a este paso (edición). */
  selectedItemIds?: number[];
}

/**
 * Alta/edición de un paso (fase) del modo de preparo de una receta en la PWA.
 * Devuelve `{ titulo, descripcion, itemIds }`; el guardado lo hace la página vía
 * create/update-receta-fase + set-receta-fase-ingredientes.
 */
@Component({
  selector: 'app-receta-paso-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.orden != null ? 'Paso ' + (data.orden + 1) : 'Nuevo paso' }}</h2>
    <mat-dialog-content>
      <form class="pd-form" [formGroup]="form">
        <mat-form-field appearance="outline">
          <mat-label>Título (opcional)</mat-label>
          <input matInput formControlName="titulo" autocapitalize="characters" placeholder="Ej: SOFRITO" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Descripción del paso</mat-label>
          <textarea matInput formControlName="descripcion" rows="4" autocapitalize="sentences"
                    placeholder="Ej: Rehogar la cebolla hasta que esté transparente…"></textarea>
          <mat-error *ngIf="form.controls.descripcion.hasError('required')">Requerido</mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" *ngIf="items.length">
          <mat-label>Ítems que participan (opcional)</mat-label>
          <mat-select formControlName="itemIds" multiple>
            <mat-option *ngFor="let it of items" [value]="it.id">{{ it.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="aceptar()">Aceptar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .pd-form { display: flex; flex-direction: column; gap: 4px; min-width: min(86vw, 420px); }
  `],
})
export class RecetaPasoDialogComponent {
  readonly items: PasoItemOption[] = this.data.items || [];

  readonly form = this.fb.nonNullable.group({
    titulo: [''],
    descripcion: ['', Validators.required],
    itemIds: [[] as number[]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<RecetaPasoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
  ) {
    this.form.patchValue({
      titulo: data.titulo ?? '',
      descripcion: data.descripcion ?? '',
      itemIds: data.selectedItemIds ?? [],
    });
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
    const titulo = v.titulo.trim();
    const result: PasoResult = {
      titulo: titulo ? titulo : null,
      descripcion: v.descripcion.trim(),
      itemIds: v.itemIds || [],
    };
    this.dialogRef.close(result);
  }
}
