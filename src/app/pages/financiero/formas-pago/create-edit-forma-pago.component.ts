import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { FormasPago } from '../../../database/entities';

@Component({
  selector: 'app-create-edit-forma-pago',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    DragDropModule
  ],
  template: `
    <div class="formas-pago-dialog-container">
      <h2 mat-dialog-title>Administrar Formas de Pago</h2>
      <div *ngIf="isLoading" class="loading-spinner">
        <mat-spinner diameter="50"></mat-spinner>
      </div>

      <mat-dialog-content>
        <!-- Form for creating/editing payment methods -->
        <mat-card>
          <mat-card-header>
            <mat-card-title>{{ isEditing ? 'Editar' : 'Crear' }} Forma de Pago</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <form [formGroup]="formaPagoForm" (ngSubmit)="saveFormaPago()">
              <div class="form-row">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Nombre</mat-label>
                  <input matInput formControlName="nombre" placeholder="Nombre de la forma de pago">
                  <mat-error *ngIf="formaPagoForm.get('nombre')?.hasError('required')">
                    El nombre es obligatorio
                  </mat-error>
                </mat-form-field>
              </div>

              <div class="form-row checkbox-row">
                <mat-checkbox formControlName="movimentaCaja" color="primary">
                  Movimenta Caja
                </mat-checkbox>

                <mat-checkbox formControlName="principal" color="primary">
                  Principal
                </mat-checkbox>

                <mat-checkbox formControlName="activo" color="primary">
                  Activo
                </mat-checkbox>
              </div>

              <div class="actions-row">
                <button
                  type="button"
                  mat-button
                  color="warn"
                  *ngIf="isEditing"
                  (click)="cancelEdit()">
                  Cancelar
                </button>
                <button
                  type="submit"
                  mat-raised-button
                  color="primary"
                  [disabled]="formaPagoForm.invalid || isSaving">
                  {{ isEditing ? 'Actualizar' : 'Guardar' }}
                </button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>

        <mat-divider class="section-divider"></mat-divider>

        <!-- Table of existing payment methods -->
        <div class="table-container">
          <h3>Formas de Pago Existentes</h3>
          <p class="drag-instruction">Arrastre las filas para ordenar las formas de pago</p>

          <table mat-table [dataSource]="dataSource" class="formas-pago-table" cdkDropList
            (cdkDropListDropped)="dropTable($event)">

            <!-- Drag Handle Column -->
            <ng-container matColumnDef="dragHandle">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let formaPago" cdkDragHandle class="drag-cell">
                <mat-icon class="drag-icon">drag_indicator</mat-icon>
              </td>
            </ng-container>

            <!-- Nombre Column -->
            <ng-container matColumnDef="nombre">
              <th mat-header-cell *matHeaderCellDef>Nombre</th>
              <td mat-cell *matCellDef="let formaPago">{{ formaPago.nombre }}</td>
            </ng-container>

            <!-- Movimenta Caja Column -->
            <ng-container matColumnDef="movimentaCaja">
              <th mat-header-cell *matHeaderCellDef>Movimenta Caja</th>
              <td mat-cell *matCellDef="let formaPago">
                <mat-icon color="primary" *ngIf="formaPago.movimentaCaja">check_circle</mat-icon>
                <mat-icon color="warn" *ngIf="!formaPago.movimentaCaja">cancel</mat-icon>
              </td>
            </ng-container>

            <!-- Principal Column -->
            <ng-container matColumnDef="principal">
              <th mat-header-cell *matHeaderCellDef>Principal</th>
              <td mat-cell *matCellDef="let formaPago">
                <mat-icon color="primary" *ngIf="formaPago.principal">check_circle</mat-icon>
                <mat-icon color="warn" *ngIf="!formaPago.principal">cancel</mat-icon>
              </td>
            </ng-container>

            <!-- Activo Column -->
            <ng-container matColumnDef="activo">
              <th mat-header-cell *matHeaderCellDef>Activo</th>
              <td mat-cell *matCellDef="let formaPago">
                <mat-icon color="primary" *ngIf="formaPago.activo">check_circle</mat-icon>
                <mat-icon color="warn" *ngIf="!formaPago.activo">cancel</mat-icon>
              </td>
            </ng-container>

            <!-- Actions Column -->
            <ng-container matColumnDef="acciones">
              <th mat-header-cell *matHeaderCellDef>Acciones</th>
              <td mat-cell *matCellDef="let formaPago">
                <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Acciones">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="editFormaPago(formaPago)">
                    <mat-icon>edit</mat-icon>
                    <span>Editar</span>
                  </button>
                  <button mat-menu-item (click)="deleteFormaPago(formaPago)">
                    <mat-icon>delete</mat-icon>
                    <span>Eliminar</span>
                  </button>
                </mat-menu>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;" cdkDrag
                [cdkDragData]="row"
                class="table-row">
            </tr>

            <!-- Row shown when there is no matching data. -->
            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell no-data" [attr.colspan]="displayedColumns.length">
                No hay formas de pago disponibles.
              </td>
            </tr>
          </table>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Cerrar</button>
        <button mat-raised-button color="primary" (click)="saveOrder()" [disabled]="!orderChanged">
          Guardar Orden
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .formas-pago-dialog-container {
      min-width: 600px;
      max-width: 800px;
      position: relative;
    }

    .loading-spinner {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    mat-dialog-content {
      max-height: 70vh;
      padding: 0;
    }

    .full-width {
      width: 100%;
    }

    .form-row {
      margin-bottom: 16px;
    }

    .checkbox-row {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .actions-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .section-divider {
      margin: 24px 0;
    }

    .table-container {
      margin-top: 16px;
    }

    .formas-pago-table {
      width: 100%;
    }

    .no-data {
      padding: 16px !important;
      text-align: center;
      font-style: italic;
    }

    .cdk-drag-preview {
      box-sizing: border-box;
      border-radius: 4px;
      box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2),
                  0 8px 10px 1px rgba(0, 0, 0, 0.14),
                  0 3px 14px 2px rgba(0, 0, 0, 0.12);
      background-color: white;
      display: table;
    }

    .cdk-drag-placeholder {
      opacity: 0;
    }

    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .table-row:last-child {
      border: none;
    }

    .formas-pago-table.cdk-drop-list-dragging .table-row:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .drag-cell {
      width: 40px;
      cursor: move;
    }

    .drag-icon {
      color: #888;
    }

    .drag-instruction {
      color: #666;
      font-style: italic;
      margin-bottom: 12px;
    }
  `]
})
export class CreateEditFormaPagoComponent implements OnInit {
  displayedColumns: string[] = ['dragHandle', 'nombre', 'movimentaCaja', 'principal', 'activo', 'acciones'];
  dataSource = new MatTableDataSource<FormasPago>([]);
  originalOrder: FormasPago[] = [];
  orderChanged = false;

  formaPagoForm: FormGroup;
  selectedFormaPago: FormasPago | null = null;
  isEditing = false;
  isLoading = false;
  isSaving = false;

  constructor(
    private dialogRef: MatDialogRef<CreateEditFormaPagoComponent>,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.formaPagoForm = this.createFormaPagoForm();
  }

  ngOnInit(): void {
    this.loadFormasPago();
  }

  createFormaPagoForm(formaPago?: FormasPago): FormGroup {
    return this.fb.group({
      id: [formaPago?.id || null],
      nombre: [formaPago?.nombre || '', Validators.required],
      movimentaCaja: [formaPago?.movimentaCaja || false],
      principal: [formaPago?.principal || false],
      activo: [formaPago?.activo !== undefined ? formaPago.activo : true],
      orden: [formaPago?.orden || 0]
    });
  }

  async loadFormasPago(): Promise<void> {
    try {
      this.isLoading = true;
      const formasPago = await firstValueFrom(this.repositoryService.getFormasPago());

      // Sort by orden field
      formasPago.sort((a, b) => a.orden - b.orden);

      this.dataSource.data = formasPago;
      // Store original order for comparison
      this.originalOrder = [...formasPago];
      this.orderChanged = false;
    } catch (error) {
      console.error('Error loading formas de pago:', error);
      this.showError('Error al cargar las formas de pago');
    } finally {
      this.isLoading = false;
    }
  }

  editFormaPago(formaPago: FormasPago): void {
    this.selectedFormaPago = formaPago;
    this.isEditing = true;
    this.formaPagoForm = this.createFormaPagoForm(formaPago);
  }

  cancelEdit(): void {
    this.selectedFormaPago = null;
    this.isEditing = false;
    this.formaPagoForm = this.createFormaPagoForm();
  }

  async saveFormaPago(): Promise<void> {
    if (this.formaPagoForm.invalid) {
      return;
    }

    try {
      this.isSaving = true;
      //set nombre to uppercase
      this.formaPagoForm.get('nombre')?.setValue(this.formaPagoForm.get('nombre')?.value.toUpperCase());
      const formaPagoData = this.formaPagoForm.value;

      // If we're setting this as principal, we may need to update other forms
      // This would typically be handled on the server side

      if (this.isEditing && formaPagoData.id) {
        await firstValueFrom(
          this.repositoryService.updateFormaPago(formaPagoData.id, formaPagoData)
        );
        this.showSuccess('Forma de pago actualizada correctamente');
      } else {
        // Set the orden for new items to be at the end
        if (this.dataSource.data.length > 0) {
          const maxOrden = Math.max(...this.dataSource.data.map(item => item.orden));
          formaPagoData.orden = maxOrden + 1;
        }

        await firstValueFrom(
          this.repositoryService.createFormaPago(formaPagoData)
        );
        this.showSuccess('Forma de pago creada correctamente');
      }

      this.cancelEdit();
      await this.loadFormasPago();
    } catch (error) {
      console.error('Error saving forma de pago:', error);
      this.showError('Error al guardar la forma de pago');
    } finally {
      this.isSaving = false;
    }
  }

  async deleteFormaPago(formaPago: FormasPago): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar la forma de pago "${formaPago.nombre}"?`)) {
      return;
    }

    try {
      this.isLoading = true;
      await firstValueFrom(
        this.repositoryService.deleteFormaPago(formaPago.id)
      );
      this.showSuccess('Forma de pago eliminada correctamente');
      await this.loadFormasPago();
    } catch (error) {
      console.error('Error deleting forma de pago:', error);
      this.showError('Error al eliminar la forma de pago');
    } finally {
      this.isLoading = false;
    }
  }

  dropTable(event: CdkDragDrop<FormasPago[]>): void {
    const currentData = [...this.dataSource.data];
    moveItemInArray(currentData, event.previousIndex, event.currentIndex);

    // Update orden values based on new position
    currentData.forEach((item, index) => {
      item.orden = index;
    });

    this.dataSource.data = currentData;

    // Check if order has changed
    this.orderChanged = !this.arraysEqual(currentData, this.originalOrder);
  }

  // Helper to compare arrays
  private arraysEqual(arr1: FormasPago[], arr2: FormasPago[]): boolean {
    if (arr1.length !== arr2.length) return false;

    return arr1.every((item, index) => item.id === arr2[index].id);
  }

  async saveOrder(): Promise<void> {
    try {
      this.isLoading = true;

      // Create an array of updates with ID and new orden
      const updates = this.dataSource.data.map(item => ({
        id: item.id,
        orden: item.orden
      }));

      // Call a batch update endpoint to update all orders at once
      await firstValueFrom(
        this.repositoryService.updateFormasPagoOrder(updates)
      );

      this.showSuccess('Orden de formas de pago actualizado correctamente');
      this.orderChanged = false;
      this.originalOrder = [...this.dataSource.data];
    } catch (error) {
      console.error('Error saving order:', error);
      this.showError('Error al guardar el orden de las formas de pago');
    } finally {
      this.isLoading = false;
    }
  }

  showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['success-snackbar']
    });
  }

  showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['error-snackbar']
    });
  }
}
