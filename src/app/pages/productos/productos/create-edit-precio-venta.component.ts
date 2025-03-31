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
import { RepositoryService } from '../../../database/repository.service';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { Presentacion } from '../../../database/entities/productos/presentacion.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { TipoPrecio } from '../../../database/entities/financiero/tipo-precio.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  presentacion: Presentacion;
  precio?: PrecioVenta;
  editMode?: boolean;
}

@Component({
  selector: 'app-create-edit-precio-venta',
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
    <div class="precios-container">
      <div class="loading-shade" *ngIf="isLoading">
        <mat-spinner diameter="50"></mat-spinner>
      </div>

      <!-- Form Section -->
      <mat-card class="form-card">
        <mat-card-header>
          <mat-card-title>{{ isEditing ? 'Editar' : 'Nuevo' }} Precio de Venta</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="precioForm" class="form-container">
            <div class="form-row">
              <mat-form-field appearance="outline" class="field-moneda">
                <mat-label>Moneda</mat-label>
                <mat-select formControlName="monedaId" required>
                  <mat-option *ngFor="let moneda of monedas" [value]="moneda.id">
                    {{ moneda.simbolo }} - {{ moneda.denominacion }}
                  </mat-option>
                </mat-select>
                <mat-error *ngIf="precioForm.get('monedaId')?.hasError('required')">
                  La moneda es requerida
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline" class="field-valor">
                <mat-label>Valor</mat-label>
                <input matInput type="number" formControlName="valor" min="0.01" step="0.01" required>
                <mat-error *ngIf="precioForm.get('valor')?.hasError('required')">
                  El valor es requerido
                </mat-error>
                <mat-error *ngIf="precioForm.get('valor')?.hasError('min')">
                  El valor debe ser mayor a 0
                </mat-error>
              </mat-form-field>
            </div>

            <div class="form-row second-row">
              <mat-form-field appearance="outline" class="field-tipo">
                <mat-label>Tipo de Precio</mat-label>
                <mat-select formControlName="tipoPrecioId">
                  <mat-option [value]="null">Sin tipo específico</mat-option>
                  <mat-option *ngFor="let tipoPrecio of tipoPrecios" [value]="tipoPrecio.id">
                    {{ tipoPrecio.descripcion }}
                  </mat-option>
                </mat-select>
              </mat-form-field>

              <div class="checkbox-wrapper">
                <div class="checkbox-group">
                  <mat-checkbox formControlName="principal" color="primary">Principal</mat-checkbox>
                  <mat-checkbox formControlName="activo" color="primary">Activo</mat-checkbox>
                </div>
              </div>
            </div>
          </form>
        </mat-card-content>
        <mat-card-actions align="end">
          <button mat-button (click)="closeDialog()" *ngIf="hasDialog">
            Salir
          </button>
          <button mat-button *ngIf="isEditing" (click)="cancelEdit()" [disabled]="isLoading">
            Cancelar
          </button>
          <button mat-raised-button color="primary" (click)="savePrecio()" [disabled]="precioForm.invalid || isLoading">
            {{ isEditing ? 'Actualizar' : 'Guardar' }}
          </button>
        </mat-card-actions>
      </mat-card>

      <!-- List Section -->
      <div class="list-section">
        <h4 class="list-title">Lista de precios</h4>

        <div *ngIf="precios.length === 0" class="empty-list">
          <mat-icon>monetization_on</mat-icon>
          <p>No hay precios configurados para esta presentación</p>
          <p class="hint">Complete el formulario para agregar un precio</p>
        </div>

        <div class="table-container" *ngIf="precios.length > 0">
          <table mat-table [dataSource]="precios" class="mat-elevation-z1">
            <!-- Moneda Column -->
            <ng-container matColumnDef="moneda">
              <th mat-header-cell *matHeaderCellDef>Moneda</th>
              <td mat-cell *matCellDef="let item">
                {{ item.moneda?.simbolo }} - {{ item.moneda?.denominacion }}
              </td>
            </ng-container>

            <!-- Valor Column -->
            <ng-container matColumnDef="valor">
              <th mat-header-cell *matHeaderCellDef>Valor</th>
              <td mat-cell *matCellDef="let item">
                {{ item.moneda?.simbolo }} {{ item.valor | number:'1.2-2' }}
              </td>
            </ng-container>

            <!-- Tipo Precio Column -->
            <ng-container matColumnDef="tipoPrecio">
              <th mat-header-cell *matHeaderCellDef>Tipo de Precio</th>
              <td mat-cell *matCellDef="let item">
                {{ item.tipoPrecio?.descripcion || 'Estándar' }}
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
              <td mat-cell *matCellDef="let item" class="actions-cell">
                <div class="action-buttons">
                  <button mat-icon-button color="primary" (click)="editPrecio(item)" matTooltip="Editar">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button mat-icon-button color="warn" (click)="deletePrecio(item)" matTooltip="Eliminar">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .precios-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
      min-width: 750px;
      max-width: 800px;
      margin: 0 auto;
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
      margin-bottom: 4px;
      padding-bottom: 0;
    }

    .form-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    .form-row {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      gap: 8px;
      width: 100%;
    }

    .second-row {
      margin-top: -8px;
    }

    .field-moneda {
      width: 60%;
      min-width: 150px;
    }

    .field-valor {
      width: 40%;
      min-width: 100px;
    }

    .field-tipo {
      width: 50%;
      min-width: 150px;
    }

    .checkbox-wrapper {
      width: 50%;
      display: flex;
      align-items: flex-start;
    }

    .checkbox-group {
      display: flex;
      gap: 16px;
      align-items: center;
      white-space: nowrap;
      padding-bottom: 30px;
      padding-left: 10px;
    }

    .empty-list {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }

    .empty-list mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 12px;
      color: #757575;
    }

    .empty-list p {
      margin: 0;
      color: #616161;
      text-align: center;
    }

    .empty-list .hint {
      margin-top: 6px;
      font-size: 0.9em;
      color: #9e9e9e;
    }

    .list-section {
      margin-top: 4px;
    }

    .list-title {
      margin-top: 0;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 500;
      padding-left: 16px;
    }

    .table-container {
      height: 300px;
      overflow-y: auto;
      overflow-x: hidden;
      border-radius: 4px;
      border: 1px solid rgba(0, 0, 0, 0.12);
    }

    table {
      width: 100%;
    }

    /* Style table headers and cells */
    .mat-mdc-header-cell {
      text-align: center;
      justify-content: center;
      padding: 0 8px;
    }

    .mat-mdc-cell {
      text-align: center;
      justify-content: center;
      padding: 0 8px;
    }

    /* Keep action buttons side by side */
    .mat-column-acciones {
      width: 100px;
    }

    .actions-cell {
      padding: 0 8px !important;
    }

    .action-buttons {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
    }

    .action-buttons button {
      margin: 0 2px;
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

      .mat-mdc-header-cell, .mat-mdc-cell {
        color: rgba(255, 255, 255, 0.87);
      }

      .status-badge.active {
        background-color: #1b5e20;
        color: #e8f5e9;
      }

      .status-badge.inactive {
        background-color: #b71c1c;
        color: #ffebee;
      }

      .table-container {
        border-color: rgba(255, 255, 255, 0.12);
      }
    }
  `]
})
export class CreateEditPrecioVentaComponent implements OnInit, OnChanges {
  @Input() presentacion?: Presentacion;

  precioForm: FormGroup;
  precios: PrecioVenta[] = [];
  monedas: Moneda[] = [];
  tipoPrecios: TipoPrecio[] = [];
  isLoading = false;
  isEditing = false;
  currentPrecioId?: number;
  displayedColumns: string[] = ['moneda', 'valor', 'tipoPrecio', 'principal', 'activo', 'acciones'];

  get selectedMoneda(): Moneda | undefined {
    const monedaId = this.precioForm.get('monedaId')?.value;
    return this.monedas.find(m => m.id === monedaId);
  }

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() private dialogRef?: MatDialogRef<CreateEditPrecioVentaComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData?: DialogData
  ) {
    // Initialize with dialog data if available
    if (this.dialogData?.presentacion) {
      this.presentacion = this.dialogData.presentacion;

      // Handle editing existing precio
      if (this.dialogData.editMode && this.dialogData.precio) {
        this.isEditing = true;
        this.currentPrecioId = this.dialogData.precio.id;
      }
    }

    this.precioForm = this.fb.group({
      monedaId: ['', Validators.required],
      valor: [0, [Validators.required, Validators.min(0.01)]],
      tipoPrecioId: [null],
      principal: [false],
      activo: [true]
    });
  }

  ngOnInit(): void {
    this.loadMonedas();
    this.loadTipoPrecios();
    if (this.presentacion?.id) {
      this.loadPrecios();

      // Pre-fill form if editing
      if (this.isEditing && this.dialogData?.precio) {
        this.precioForm.patchValue({
          monedaId: this.dialogData.precio.monedaId,
          valor: this.dialogData.precio.valor,
          tipoPrecioId: this.dialogData.precio.tipoPrecioId,
          principal: this.dialogData.precio.principal,
          activo: this.dialogData.precio.activo
        });
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['presentacion'] && this.presentacion?.id) {
      this.loadPrecios();
    }
  }

  async loadMonedas(): Promise<void> {
    this.isLoading = true;
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      // If there are monedas, set the first one as default
      if (this.monedas.length > 0) {
        const defaultMoneda = this.monedas.find(m => m.principal) || this.monedas[0];
        this.precioForm.get('monedaId')?.setValue(defaultMoneda.id);
      }
    } catch (error) {
      console.error('Error loading monedas:', error);
      this.snackBar.open('Error al cargar las monedas', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  async loadTipoPrecios(): Promise<void> {
    this.isLoading = true;
    try {
      this.tipoPrecios = await firstValueFrom(this.repositoryService.getTipoPrecios());
    } catch (error) {
      console.error('Error loading tipo precios:', error);
      this.snackBar.open('Error al cargar los tipos de precio', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  async loadPrecios(): Promise<void> {
    if (!this.presentacion?.id) return;

    this.isLoading = true;
    try {
      this.precios = await firstValueFrom(this.repositoryService.getPreciosVentaByPresentacion(this.presentacion.id));

      // Load moneda and tipoPrecio details for each precio
      for (const precio of this.precios) {
        try {
          precio.moneda = await firstValueFrom(this.repositoryService.getMoneda(precio.monedaId));

          if (precio.tipoPrecioId) {
            precio.tipoPrecio = await firstValueFrom(this.repositoryService.getTipoPrecio(precio.tipoPrecioId));
          }
        } catch (error) {
          console.error(`Error loading details for precio ${precio.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error loading precios:', error);
      this.snackBar.open('Error al cargar los precios', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  async savePrecio(): Promise<void> {
    if (this.precioForm.invalid || !this.presentacion?.id) return;

    this.isLoading = true;
    const formValue = this.precioForm.value;

    try {
      // If it's marked as principal, make sure to unmark others
      if (formValue.principal) {
        for (const precio of this.precios) {
          if (precio.id !== this.currentPrecioId && precio.principal) {
            await firstValueFrom(this.repositoryService.updatePrecioVenta(precio.id, { principal: false }));
          }
        }
      } else if (this.precios.length === 0) {
        // If this is the first precio, make it principal by default
        formValue.principal = true;
      }

      if (this.isEditing && this.currentPrecioId) {
        // Update existing precio
        const result = await firstValueFrom(
          this.repositoryService.updatePrecioVenta(this.currentPrecioId, {
            ...formValue
          })
        );

        this.snackBar.open('Precio actualizado exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new precio
        const result = await firstValueFrom(
          this.repositoryService.createPrecioVenta({
            ...formValue,
            presentacionId: this.presentacion!.id
          })
        );

        this.snackBar.open('Precio creado exitosamente', 'Cerrar', { duration: 3000 });
      }

      // Reload precios
      this.loadPrecios();

      // Reset form and editing state
      this.resetForm();
    } catch (error) {
      console.error('Error saving precio:', error);
      this.snackBar.open('Error al guardar el precio', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  editPrecio(precio: PrecioVenta): void {
    this.isEditing = true;
    this.currentPrecioId = precio.id;

    this.precioForm.patchValue({
      monedaId: precio.monedaId,
      valor: precio.valor,
      tipoPrecioId: precio.tipoPrecioId,
      principal: precio.principal,
      activo: precio.activo
    });
  }

  async deletePrecio(precio: PrecioVenta): Promise<void> {
    if (!confirm(`¿Está seguro que desea eliminar este precio?`)) {
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(this.repositoryService.deletePrecioVenta(precio.id));

      this.snackBar.open('Precio eliminado exitosamente', 'Cerrar', { duration: 3000 });

      // Reload precios
      this.loadPrecios();
    } catch (error) {
      console.error('Error deleting precio:', error);
      this.snackBar.open('Error al eliminar el precio', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  cancelEdit(): void {
    this.resetForm();
  }

  resetForm(): void {
    this.isEditing = false;
    this.currentPrecioId = undefined;

    // If there are monedas, set the first one as default
    const defaultMonedaId = this.monedas.length > 0 ?
      (this.monedas.find(m => m.principal)?.id || this.monedas[0].id) :
      '';

    this.precioForm.reset({
      monedaId: defaultMonedaId,
      valor: 0,
      tipoPrecioId: null,
      principal: false,
      activo: true
    });
  }

  get hasDialog(): boolean {
    return !!this.dialogRef;
  }

  closeDialog(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }
}
