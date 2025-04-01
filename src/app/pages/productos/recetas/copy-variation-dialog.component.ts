import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';

export interface CopyVariationDialogData {
  variaciones: RecetaVariacion[];
}

export interface CopyVariationDialogResult {
  shouldCopy: boolean;
  variacionId?: number;
}

@Component({
  selector: 'app-copy-variation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatRadioModule,
    MatSelectModule,
    MatFormFieldModule,
    FormsModule
  ],
  template: `
    <h2 mat-dialog-title>Nueva Variación</h2>
    <mat-dialog-content>
      <p>¿Desea copiar los ingredientes de una variación existente?</p>
      
      <div class="radio-group">
        <mat-radio-group [(ngModel)]="shouldCopy">
          <mat-radio-button [value]="true">Sí, copiar ingredientes</mat-radio-button>
          <mat-radio-button [value]="false">No, crear vacía</mat-radio-button>
        </mat-radio-group>
      </div>
      
      <div *ngIf="shouldCopy" class="select-variation">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Seleccione variación a copiar</mat-label>
          <mat-select [(ngModel)]="selectedVariacionId">
            <mat-option *ngFor="let variacion of data.variaciones" [value]="variacion.id">
              {{ variacion.nombre }}
              <span *ngIf="variacion.principal">(Principal)</span>
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Cancelar</button>
      <button mat-raised-button color="primary" [mat-dialog-close]="getResult()" [disabled]="shouldCopy && !selectedVariacionId">
        Continuar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .radio-group {
      display: flex;
      flex-direction: column;
      margin: 15px 0;
    }
    
    .select-variation {
      margin-top: 15px;
    }
    
    .full-width {
      width: 100%;
    }
    
    mat-radio-button {
      margin-bottom: 8px;
    }
  `]
})
export class CopyVariationDialogComponent {
  shouldCopy: boolean = false;
  selectedVariacionId?: number;

  constructor(
    public dialogRef: MatDialogRef<CopyVariationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CopyVariationDialogData
  ) {
    // If there are variations, select the principal one by default
    const principalVariation = this.data.variaciones.find(v => v.principal);
    if (principalVariation) {
      this.selectedVariacionId = principalVariation.id;
    } else if (this.data.variaciones.length > 0) {
      this.selectedVariacionId = this.data.variaciones[0].id;
    }
  }

  getResult(): CopyVariationDialogResult {
    return {
      shouldCopy: this.shouldCopy,
      variacionId: this.shouldCopy ? this.selectedVariacionId : undefined
    };
  }
} 