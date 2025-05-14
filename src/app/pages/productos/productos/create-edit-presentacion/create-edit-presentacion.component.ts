import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { RepositoryService } from '../../../../database/repository.service';
import { Presentacion, TipoMedida } from '../../../../database/entities/productos/presentacion.entity';
import { Producto } from '../../../../database/entities/productos/producto.entity';
import { PrecioVenta } from '../../../../database/entities/productos/precio-venta.entity';
import { Codigo } from '../../../../database/entities/productos/codigo.entity';
import { firstValueFrom } from 'rxjs';
import { CreateEditCodigoComponent } from '../create-edit-codigo/create-edit-codigo.component';
import { CreateEditPrecioVentaComponent } from '../create-edit-precio-venta/create-edit-precio-venta.component';

@Component({
  selector: 'app-create-edit-presentacion',
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
    MatDialogModule,
    MatMenuModule
  ],
  template: `
    <div class="presentaciones-container">
      <div class="loading-shade" *ngIf="isLoading">
        <mat-spinner diameter="50"></mat-spinner>
      </div>

      <!-- Form Section -->
      <mat-card class="form-card">
        <mat-card-header>
          <mat-card-title>{{ isEditing ? 'Editar' : 'Nueva' }} Presentación</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="presentacionForm" class="form-container">
            <div class="form-row">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Descripción</mat-label>
                <input matInput formControlName="descripcion" placeholder="Ej: Caja de 12 unidades">
              </mat-form-field>
            </div>

            <div class="form-row">
              <mat-form-field appearance="outline" class="equal-width">
                <mat-label>Tipo de Medida</mat-label>
                <mat-select formControlName="tipoMedida" required>
                  <mat-option *ngFor="let tipo of tiposMedida" [value]="tipo.value">
                    {{ tipo.label }}
                  </mat-option>
                </mat-select>
                <mat-error *ngIf="presentacionForm.get('tipoMedida')?.hasError('required')">
                  El tipo de medida es requerido
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline" class="equal-width">
                <mat-label>Cantidad</mat-label>
                <input matInput type="number" formControlName="cantidad" min="0.01" step="0.01" required>
                <mat-error *ngIf="presentacionForm.get('cantidad')?.hasError('required')">
                  La cantidad es requerida
                </mat-error>
                <mat-error *ngIf="presentacionForm.get('cantidad')?.hasError('min')">
                  La cantidad debe ser mayor a 0
                </mat-error>
              </mat-form-field>
            </div>

            <div class="form-row checkbox-row">
              <mat-checkbox formControlName="principal" color="primary">Presentación Principal</mat-checkbox>
              <mat-checkbox formControlName="activo" color="primary">Activo</mat-checkbox>
            </div>
          </form>
        </mat-card-content>
        <mat-card-actions align="end">
          <button mat-button *ngIf="isEditing" (click)="cancelEdit()" [disabled]="isLoading">
            Cancelar
          </button>
          <button mat-raised-button color="primary" (click)="savePresentacion()" [disabled]="presentacionForm.invalid || isLoading">
            {{ isEditing ? 'Actualizar' : 'Guardar' }}
          </button>
        </mat-card-actions>
      </mat-card>

      <!-- List Section -->
      <div class="list-section">
        <h3>Presentaciones del Producto</h3>
        
        <div *ngIf="presentaciones.length === 0" class="empty-list">
          <mat-icon>category</mat-icon>
          <p>No hay presentaciones configuradas para este producto</p>
          <p class="hint">Complete el formulario para agregar una presentación</p>
        </div>

        <table mat-table [dataSource]="presentaciones" class="mat-elevation-z1" *ngIf="presentaciones.length > 0">
          <!-- Descripcion Column -->
          <ng-container matColumnDef="descripcion">
            <th mat-header-cell *matHeaderCellDef>Descripción</th>
            <td mat-cell *matCellDef="let item">{{ item.descripcion || 'Sin descripción' }}</td>
          </ng-container>

          <!-- Tipo Medida Column -->
          <ng-container matColumnDef="tipoMedida">
            <th mat-header-cell *matHeaderCellDef>Tipo de Medida</th>
            <td mat-cell *matCellDef="let item">{{ getTipoMedidaLabel(item.tipoMedida) }}</td>
          </ng-container>

          <!-- Cantidad Column -->
          <ng-container matColumnDef="cantidad">
            <th mat-header-cell *matHeaderCellDef>Cantidad</th>
            <td mat-cell *matCellDef="let item">{{ item.cantidad }}</td>
          </ng-container>
          
          <!-- Precio Principal Column -->
          <ng-container matColumnDef="precioPrincipal">
            <th mat-header-cell *matHeaderCellDef>Precio Principal</th>
            <td mat-cell *matCellDef="let item">
              <ng-container *ngIf="presentacionPrecios.get(item.id)">
                {{ presentacionPrecios.get(item.id)?.valor | currency:presentacionPrecios.get(item.id)?.moneda?.simbolo || 'USD':true }}
              </ng-container>
              <span *ngIf="!presentacionPrecios.get(item.id)" class="no-data">Sin precio</span>
            </td>
          </ng-container>
          
          <!-- Código Principal Column -->
          <ng-container matColumnDef="codigoPrincipal">
            <th mat-header-cell *matHeaderCellDef>Código Principal</th>
            <td mat-cell *matCellDef="let item">
              <ng-container *ngIf="presentacionCodigos.get(item.id)">
                {{ presentacionCodigos.get(item.id)?.codigo }}
              </ng-container>
              <span *ngIf="!presentacionCodigos.get(item.id)" class="no-data">Sin código</span>
            </td>
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
              <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Acciones">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="editPresentacion(item)">
                  <mat-icon>edit</mat-icon>
                  <span>Editar</span>
                </button>
                <button mat-menu-item (click)="deletePresentacion(item)">
                  <mat-icon>delete</mat-icon>
                  <span>Eliminar</span>
                </button>
                <button mat-menu-item (click)="viewPrecios(item)">
                  <mat-icon>monetization_on</mat-icon>
                  <span>Ver Precios</span>
                </button>
                <button mat-menu-item (click)="viewCodigos(item)">
                  <mat-icon>qr_code</mat-icon>
                  <span>Ver Códigos</span>
                </button>
              </mat-menu>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .presentaciones-container {
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

    .no-data {
      color: #9e9e9e;
      font-style: italic;
      font-size: 0.9em;
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

      .no-data {
        color: #757575;
      }
    }
  `]
})
export class CreateEditPresentacionComponent implements OnInit, OnChanges {
  @Input() producto!: Producto;
  
  presentacionForm: FormGroup;
  presentaciones: Presentacion[] = [];
  presentacionPrecios: Map<number, PrecioVenta> = new Map();
  presentacionCodigos: Map<number, Codigo> = new Map();
  isLoading = false;
  isEditing = false;
  currentPresentacionId?: number;
  displayedColumns: string[] = [
    'descripcion', 
    'tipoMedida', 
    'cantidad', 
    'precioPrincipal', 
    'codigoPrincipal', 
    'principal', 
    'activo', 
    'acciones'
  ];
  
  tiposMedida = [
    { value: TipoMedida.UNIDAD, label: 'Unidad' },
    { value: TipoMedida.PAQUETE, label: 'Paquete' },
    { value: TipoMedida.GRAMO, label: 'Gramo' },
    { value: TipoMedida.LITRO, label: 'Litro' }
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.presentacionForm = this.fb.group({
      descripcion: [''],
      tipoMedida: [TipoMedida.UNIDAD, Validators.required],
      cantidad: [1, [Validators.required, Validators.min(0.01)]],
      principal: [false],
      activo: [true]
    });
  }

  ngOnInit(): void {
    if (this.producto?.id) {
      this.loadPresentaciones();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['producto'] && this.producto?.id) {
      this.loadPresentaciones();
    }
  }

  async loadPresentaciones(): Promise<void> {
    if (!this.producto?.id) return;
    
    this.isLoading = true;
    try {
      this.presentaciones = await firstValueFrom(this.repositoryService.getPresentacionesByProducto(this.producto.id));
      this.loadPrincipalesData();
    } catch (error) {
      console.error('Error loading presentaciones:', error);
      this.snackBar.open('Error al cargar las presentaciones', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  async loadPrincipalesData(): Promise<void> {
    this.presentacionPrecios.clear();
    this.presentacionCodigos.clear();
    
    for (const presentacion of this.presentaciones) {
      if (presentacion.id) {
        try {
          const precios = await firstValueFrom(this.repositoryService.getPreciosVentaByPresentacion(presentacion.id));
          const precioPrincipal = precios.find(p => p.principal);
          if (precioPrincipal) {
            this.presentacionPrecios.set(presentacion.id, precioPrincipal);
          }
        } catch (error) {
          console.error(`Error loading prices for presentacion ${presentacion.id}:`, error);
        }
        
        try {
          const codigos = await firstValueFrom(this.repositoryService.getCodigosByPresentacion(presentacion.id));
          const codigoPrincipal = codigos.find(c => c.principal);
          if (codigoPrincipal) {
            this.presentacionCodigos.set(presentacion.id, codigoPrincipal);
          }
        } catch (error) {
          console.error(`Error loading codes for presentacion ${presentacion.id}:`, error);
        }
      }
    }
  }

  getTipoMedidaLabel(tipo: TipoMedida): string {
    const found = this.tiposMedida.find(t => t.value === tipo);
    return found ? found.label : tipo;
  }

  async savePresentacion(): Promise<void> {
    if (this.presentacionForm.invalid) return;
    
    this.isLoading = true;
    const formValue = this.presentacionForm.value;
    
    try {
      // Convert string fields to uppercase
      if (formValue.descripcion) {
        formValue.descripcion = formValue.descripcion.toUpperCase();
      }
      
      // If it's marked as principal, make sure to unmark others
      if (formValue.principal) {
        // We need to update other presentaciones to set principal = false
        for (const pres of this.presentaciones) {
          if (pres.id !== this.currentPresentacionId && pres.principal) {
            await firstValueFrom(this.repositoryService.updatePresentacion(pres.id, { principal: false }));
          }
        }
      } else if (this.presentaciones.length === 0) {
        // If this is the first presentacion, make it principal by default
        formValue.principal = true;
      }
      
      if (this.isEditing && this.currentPresentacionId) {
        // Update existing presentacion
        const result = await firstValueFrom(
          this.repositoryService.updatePresentacion(this.currentPresentacionId, {
            ...formValue
          })
        );
        
        this.snackBar.open('Presentación actualizada exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new presentacion
        const result = await firstValueFrom(
          this.repositoryService.createPresentacion({
            ...formValue,
            productoId: this.producto.id
          })
        );
        
        this.snackBar.open('Presentación creada exitosamente', 'Cerrar', { duration: 3000 });
      }
      
      // Reload presentaciones
      this.loadPresentaciones();
      
      // Reset form and editing state
      this.resetForm();
    } catch (error) {
      console.error('Error saving presentacion:', error);
      this.snackBar.open('Error al guardar la presentación', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  editPresentacion(presentacion: Presentacion): void {
    this.isEditing = true;
    this.currentPresentacionId = presentacion.id;
    
    this.presentacionForm.patchValue({
      descripcion: presentacion.descripcion,
      tipoMedida: presentacion.tipoMedida,
      cantidad: presentacion.cantidad,
      principal: presentacion.principal,
      activo: presentacion.activo
    });
  }

  async deletePresentacion(presentacion: Presentacion): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar la presentación "${presentacion.descripcion}"?`)) {
      return;
    }
    
    this.isLoading = true;
    try {
      await firstValueFrom(this.repositoryService.deletePresentacion(presentacion.id));
      
      this.snackBar.open('Presentación eliminada exitosamente', 'Cerrar', { duration: 3000 });
      
      // Reload presentaciones
      this.loadPresentaciones();
    } catch (error) {
      console.error('Error deleting presentacion:', error);
      this.snackBar.open('Error al eliminar la presentación', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  cancelEdit(): void {
    this.resetForm();
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentPresentacionId = undefined;
    this.presentacionForm.reset({
      descripcion: '',
      tipoMedida: TipoMedida.UNIDAD,
      cantidad: 1,
      principal: false,
      activo: true
    });
  }

  viewPrecios(presentacion: Presentacion): void {
    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '800px',
      maxHeight: '90vh',
      panelClass: 'no-padding-dialog',
      data: { presentacion }
    });
    
    // Refresh principal data when the dialog is closed
    dialogRef.afterClosed().subscribe(() => {
      this.loadPrincipalesData();
    });
  }

  viewCodigos(presentacion: Presentacion): void {
    const dialogRef = this.dialog.open(CreateEditCodigoComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: { presentacion },
      panelClass: 'custom-dialog-container',
    });
    
    // Refresh principal data when the dialog is closed
    dialogRef.afterClosed().subscribe(() => {
      this.loadPrincipalesData();
    });
  }
} 