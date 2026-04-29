import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-agregar-item-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Agregar item manual</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Concepto</mat-label>
          <mat-select formControlName="conceptoId">
            <mat-option [value]="null">-- Sin concepto --</mat-option>
            <mat-option *ngFor="let c of conceptos" [value]="c.id">{{ c.codigo }} - {{ c.descripcion }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="tipo">
            <mat-option value="HABER">HABER (suma)</mat-option>
            <mat-option value="DESCUENTO">DESCUENTO (resta)</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripcion</mat-label>
          <input matInput formControlName="descripcion" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Monto</mat-label>
          <input matInput type="number" formControlName="monto" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Observacion</mat-label>
          <input matInput formControlName="observacion" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">Agregar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-width: 600px; }
    .full { grid-column: 1 / -1; }
  `],
})
export class AgregarItemDialogComponent implements OnInit {
  saving = false;
  form: FormGroup;
  conceptos: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<AgregarItemDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { liquidacionId: number },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      conceptoId: [null],
      descripcion: ['', Validators.required],
      monto: [0, [Validators.required, Validators.min(0.01)]],
      tipo: ['HABER', Validators.required],
      observacion: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.conceptos = await firstValueFrom(this.repositoryService.getLiquidacionConceptos());
    } catch (e) {
      console.error(e);
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.agregarItemLiquidacion(this.data.liquidacionId, this.form.value));
      this.snackBar.open('Item agregado', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
