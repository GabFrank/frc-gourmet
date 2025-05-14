import { Component, Input, OnInit, OnChanges, SimpleChanges, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { Codigo, TipoCodigo } from '../../../../database/entities/productos/codigo.entity';
import { Presentacion } from '../../../../database/entities/productos/presentacion.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  presentacion: Presentacion;
}

@Component({
  selector: 'app-create-edit-codigo',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatDividerModule,
    MatTableModule,
    MatTooltipModule,
    MatCardModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  template: `
    <div class="codigos-container">
      <div class="loading-shade" *ngIf="isLoading">
        <mat-spinner diameter="50"></mat-spinner>
      </div>

      <!-- Form Section -->
      <mat-card class="form-card">
        <mat-card-header>
          <mat-card-title>{{ isEditing ? 'Editar' : 'Nuevo' }} Código</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="codigoForm" class="form-container">
            <div class="form-row">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Código</mat-label>
                <input matInput formControlName="codigo" placeholder="Ingrese el código" required>
                <mat-error *ngIf="codigoForm.get('codigo')?.hasError('required')">
                  El código es requerido
                </mat-error>
              </mat-form-field>
            </div>

            <div class="form-row">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Tipo de Código</mat-label>
                <mat-select formControlName="tipoCodigo" required>
                  <mat-option *ngFor="let tipo of tiposCodigo" [value]="tipo.value">
                    {{ tipo.label }}
                  </mat-option>
                </mat-select>
                <mat-error *ngIf="codigoForm.get('tipoCodigo')?.hasError('required')">
                  El tipo de código es requerido
                </mat-error>
              </mat-form-field>
            </div>

            <div class="form-row checkbox-row">
              <mat-checkbox formControlName="principal" color="primary">Código Principal</mat-checkbox>
              <mat-checkbox formControlName="activo" color="primary">Activo</mat-checkbox>
            </div>
          </form>
        </mat-card-content>
        <mat-card-actions align="end">
          <button mat-button (click)="closeDialog()">
            Salir
          </button>
          <button mat-button *ngIf="isEditing" (click)="cancelEdit()" [disabled]="isLoading">
            Cancelar
          </button>
          <button mat-raised-button color="primary" (click)="saveCodigo()" [disabled]="codigoForm.invalid || isLoading">
            {{ isEditing ? 'Actualizar' : 'Guardar' }}
          </button>
        </mat-card-actions>
      </mat-card>

      <!-- List Section -->
      <div class="list-section">
        <h3>Códigos de la Presentación</h3>
        
        <div *ngIf="codigos.length === 0" class="empty-list">
          <mat-icon>qr_code</mat-icon>
          <p>No hay códigos configurados para esta presentación</p>
          <p class="hint">Complete el formulario para agregar un código</p>
        </div>

        <table mat-table [dataSource]="codigos" class="mat-elevation-z1" *ngIf="codigos.length > 0">
          <!-- Codigo Column -->
          <ng-container matColumnDef="codigo">
            <th mat-header-cell *matHeaderCellDef>Código</th>
            <td mat-cell *matCellDef="let item">{{ item.codigo }}</td>
          </ng-container>

          <!-- Tipo Codigo Column -->
          <ng-container matColumnDef="tipoCodigo">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let item">{{ item.tipoCodigo }}</td>
          </ng-container>

          <!-- Principal Column -->
          <ng-container matColumnDef="principal">
            <th mat-header-cell *matHeaderCellDef>Principal</th>
            <td mat-cell *matCellDef="let item">
              <mat-icon *ngIf="item.principal" color="primary">check_circle</mat-icon>
              <mat-icon *ngIf="!item.principal" color="disabled">radio_button_unchecked</mat-icon>
            </td>
          </ng-container>

          <!-- Activo Column -->
          <ng-container matColumnDef="activo">
            <th mat-header-cell *matHeaderCellDef>Activo</th>
            <td mat-cell *matCellDef="let item">
              <span class="status-badge" [ngClass]="item.activo ? 'active' : 'inactive'">
                {{ item.activo ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef>Acciones</th>
            <td mat-cell *matCellDef="let item">
              <button mat-icon-button color="primary" (click)="editCodigo(item)" matTooltip="Editar">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteCodigo(item)" matTooltip="Eliminar">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .codigos-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      position: relative;
    }

    .loading-shade {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .form-card {
      margin-bottom: 16px;
    }

    .form-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-row {
      display: flex;
      gap: 16px;
      width: 100%;
    }

    .full-width {
      width: 100%;
    }

    .equal-width {
      flex: 1;
    }

    .checkbox-row {
      display: flex;
      gap: 24px;
      margin-top: 8px;
    }

    .empty-list {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin-top: 16px;
    }

    .empty-list mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 16px;
      color: #757575;
    }

    .empty-list p {
      margin: 0;
      color: #616161;
      text-align: center;
    }

    .empty-list .hint {
      margin-top: 8px;
      font-size: 0.9em;
      color: #9e9e9e;
    }

    .list-section {
      margin-top: 16px;
    }

    .list-section h3 {
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 18px;
      font-weight: 500;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
    }

    .status-badge.active {
      background-color: #e8f5e9;
      color: #2e7d32;
    }

    .status-badge.inactive {
      background-color: #ffebee;
      color: #c62828;
    }

    /* Dark theme styles */
    :host-context(.dark-theme) {
      .empty-list {
        background-color: #424242;
      }

      .empty-list mat-icon {
        color: #bdbdbd;
      }

      .empty-list p {
        color: #e0e0e0;
      }

      .empty-list .hint {
        color: #9e9e9e;
      }

      .status-badge.active {
        background-color: #1b5e20;
        color: #e8f5e9;
      }

      .status-badge.inactive {
        background-color: #b71c1c;
        color: #ffebee;
      }
    }
  `]
})
export class CreateEditCodigoComponent implements OnInit, OnChanges {
  @Input() presentacion?: Presentacion;
  
  codigoForm: FormGroup;
  codigos: Codigo[] = [];
  isLoading = false;
  isEditing = false;
  currentCodigoId?: number;
  displayedColumns: string[] = ['codigo', 'tipoCodigo', 'principal', 'activo', 'acciones'];
  
  tiposCodigo = [
    { value: TipoCodigo.MANUAL, label: 'Manual' },
    { value: TipoCodigo.BARRA, label: 'Código de Barras' },
    { value: TipoCodigo.QR, label: 'Código QR' }
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() private dialogRef?: MatDialogRef<CreateEditCodigoComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData?: DialogData
  ) {
    // Initialize with dialog data if available
    if (this.dialogData?.presentacion) {
      this.presentacion = this.dialogData.presentacion;
    }

    this.codigoForm = this.fb.group({
      codigo: ['', Validators.required],
      tipoCodigo: [TipoCodigo.MANUAL, Validators.required],
      principal: [false],
      activo: [true]
    });
  }

  ngOnInit(): void {
    if (this.presentacion?.id) {
      this.loadCodigos();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['presentacion'] && this.presentacion?.id) {
      this.loadCodigos();
    }
  }

  async loadCodigos(): Promise<void> {
    if (!this.presentacion?.id) return;
    
    this.isLoading = true;
    try {
      this.codigos = await firstValueFrom(this.repositoryService.getCodigosByPresentacion(this.presentacion.id));
    } catch (error) {
      console.error('Error loading codigos:', error);
      this.snackBar.open('Error al cargar los códigos', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  getTipoCodigoLabel(tipo: TipoCodigo): string {
    const found = this.tiposCodigo.find(t => t.value === tipo);
    return found ? found.label : tipo;
  }

  async saveCodigo(): Promise<void> {
    if (this.codigoForm.invalid) return;
    
    this.isLoading = true;
    const formValue = this.codigoForm.value;
    
    try {
      // Convert string fields to uppercase
      if (formValue.codigo) {
        formValue.codigo = formValue.codigo.toUpperCase();
      }
      
      // If it's marked as principal, make sure to unmark others
      if (formValue.principal) {
        for (const cod of this.codigos) {
          if (cod.id !== this.currentCodigoId && cod.principal) {
            await firstValueFrom(this.repositoryService.updateCodigo(cod.id, { principal: false }));
          }
        }
      } else if (this.codigos.length === 0) {
        // If this is the first codigo, make it principal by default
        formValue.principal = true;
      }
      
      if (this.isEditing && this.currentCodigoId) {
        // Update existing codigo
        const result = await firstValueFrom(
          this.repositoryService.updateCodigo(this.currentCodigoId, {
            ...formValue
          })
        );
        
        this.snackBar.open('Código actualizado exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new codigo
        const result = await firstValueFrom(
          this.repositoryService.createCodigo({
            ...formValue,
            presentacionId: this.presentacion!.id
          })
        );
        
        this.snackBar.open('Código creado exitosamente', 'Cerrar', { duration: 3000 });
      }
      
      // Reload codigos
      this.loadCodigos();
      
      // Reset form and editing state
      this.resetForm();
    } catch (error) {
      console.error('Error saving codigo:', error);
      this.snackBar.open('Error al guardar el código', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  editCodigo(codigo: Codigo): void {
    this.isEditing = true;
    this.currentCodigoId = codigo.id;
    
    this.codigoForm.patchValue({
      codigo: codigo.codigo,
      tipoCodigo: codigo.tipoCodigo,
      principal: codigo.principal,
      activo: codigo.activo
    });
  }

  async deleteCodigo(codigo: Codigo): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar el código "${codigo.codigo}"?`)) {
      return;
    }
    
    this.isLoading = true;
    try {
      await firstValueFrom(this.repositoryService.deleteCodigo(codigo.id));
      
      this.snackBar.open('Código eliminado exitosamente', 'Cerrar', { duration: 3000 });
      
      // Reload codigos
      this.loadCodigos();
    } catch (error) {
      console.error('Error deleting codigo:', error);
      this.snackBar.open('Error al eliminar el código', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  cancelEdit(): void {
    this.resetForm();
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentCodigoId = undefined;
    this.codigoForm.reset({
      codigo: '',
      tipoCodigo: TipoCodigo.MANUAL,
      principal: false,
      activo: true
    });
  }

  closeDialog(): void {
    this.dialogRef?.close();
  }
} 