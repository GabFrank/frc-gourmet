import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from '../../../database/repository.service';
import { Proveedor } from '../../../database/entities/compras/proveedor.entity';
import { Persona } from '../../../database/entities/personas/persona.entity';
import { CuentaBancariaDestino } from '../../../database/entities/financiero/cuenta-bancaria-destino.entity';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { GenericSearchDialogComponent, GenericSearchConfig } from '../../../shared/components/generic-search-dialog/generic-search-dialog.component';
import { SelectorCuentaDestinoComponent } from '../../../shared/components/selector-cuenta-destino/selector-cuenta-destino.component';
import { CreateEditCuentaDestinoDialogComponent } from '../../../shared/dialogs/cuenta-destino/create-edit-cuenta-destino-dialog.component';

@Component({
  selector: 'app-create-edit-proveedor',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    SelectorCuentaDestinoComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEditing ? 'Editar' : 'Crear' }} Proveedor</h2>

    <div mat-dialog-content>
      <form [formGroup]="proveedorForm" class="form-container">
        <div class="loading-shade" *ngIf="isLoading">
          <mat-spinner></mat-spinner>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Nombre</mat-label>
            <input matInput formControlName="nombre" placeholder="Nombre del proveedor">
            <mat-error *ngIf="proveedorForm.get('nombre')?.hasError('required')">
              El nombre es requerido
            </mat-error>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Razón Social</mat-label>
            <input matInput formControlName="razon_social" placeholder="Razón social del proveedor">
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>RUC</mat-label>
            <input matInput formControlName="ruc" placeholder="RUC del proveedor">
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Teléfono</mat-label>
            <input matInput formControlName="telefono" placeholder="Teléfono de contacto">
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Dirección</mat-label>
            <input matInput formControlName="direccion" placeholder="Dirección del proveedor">
          </mat-form-field>
        </div>

        <!-- Persona association -->
        <div class="form-row persona-section">
          <div class="persona-field">
            <div class="persona-label">
              Persona asociada:
              <span *ngIf="!selectedPersona" class="badge badge-warning">
                <mat-icon>warning</mat-icon>
                SIN PERSONA VINCULADA
              </span>
            </div>
            <div *ngIf="selectedPersona" class="persona-info">
              <div class="persona-name">{{ selectedPersona.nombre }}</div>
              <div class="persona-doc" *ngIf="selectedPersona.documento">
                {{ selectedPersona.tipoDocumento }}: {{ selectedPersona.documento }}
              </div>
            </div>
            <div *ngIf="!selectedPersona" class="persona-empty">
              No hay persona asociada
            </div>
          </div>

          <button
            type="button"
            mat-raised-button
            color="primary"
            (click)="openPersonaSearch()"
            class="search-button">
            <mat-icon>search</mat-icon>
            Buscar Persona
          </button>
        </div>

        <!-- Cuenta bancaria de cobro -->
        <div class="cuenta-bancaria-section">
          <div class="section-header">
            <mat-icon>account_balance</mat-icon>
            <span>Cuenta bancaria de cobro</span>
          </div>

          <div *ngIf="!selectedPersona" class="warning-message">
            <mat-icon>info</mat-icon>
            <span>Vinculá una persona primero para asignar cuenta bancaria</span>
          </div>

          <div *ngIf="selectedPersona">
            <app-selector-cuenta-destino
              [personaId]="selectedPersona.id"
              [cuentaSeleccionadaId]="proveedorForm.get('cuentaBancariaDefaultId')?.value"
              (cuentaChange)="onCuentaChange($event)">
            </app-selector-cuenta-destino>

            <div class="cuenta-actions">
              <button
                type="button"
                mat-stroked-button
                color="primary"
                (click)="openCreateCuentaDialog()"
                [disabled]="!selectedPersona">
                <mat-icon>add</mat-icon>
                Nueva cuenta para esta persona
              </button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <mat-checkbox formControlName="activo" color="primary">
            Activo
          </mat-checkbox>
        </div>
      </form>
    </div>

    <div mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()" [disabled]="isLoading">
        Cancelar
      </button>
      <button
        mat-raised-button
        color="primary"
        (click)="save()"
        [disabled]="proveedorForm.invalid || isLoading">
        {{ isEditing ? 'Actualizar' : 'Guardar' }}
      </button>
    </div>
  `,
  styles: [`
    .form-container {
      position: relative;
      min-height: 300px;
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

    .form-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      align-items: center;
    }

    .full-width {
      width: 100%;
    }

    mat-form-field {
      flex: 1;
    }

    .persona-section {
      padding: 16px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background-color: var(--surface-hover);
      justify-content: space-between;
    }

    .persona-field {
      flex: 1;
    }

    .persona-label {
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--text-secondary);
    }

    .persona-info {
      display: flex;
      flex-direction: column;
    }

    .persona-name {
      font-weight: 500;
      color: var(--text-primary);
    }

    .persona-doc {
      font-size: 0.9em;
      color: var(--text-secondary);
    }

    .persona-empty {
      color: var(--text-disabled);
      font-style: italic;
    }

    .search-button {
      align-self: flex-start;
      margin-top: 12px;
    }

    .cuenta-bancaria-section {
      margin-top: 24px;
      padding: 16px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background-color: var(--surface-hover);
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      font-size: 16px;
      margin-bottom: 16px;
      color: var(--text-primary);
    }

    .section-header mat-icon {
      color: rgba(63, 81, 181, 0.7);
    }

    .warning-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background-color: rgba(255, 152, 0, 0.1);
      border-left: 4px solid rgba(255, 152, 0, 1);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 14px;
    }

    .warning-message mat-icon {
      color: rgba(255, 152, 0, 1);
    }

    .cuenta-actions {
      margin-top: 16px;
      display: flex;
      gap: 12px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      height: 22px;
      padding: 0 8px;
      border-radius: 11px;
      border: 1px solid;
      margin-left: 8px;
    }

    .badge mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .badge-warning {
      background-color: rgba(255, 152, 0, 0.15);
      color: #ff9800;
      border-color: rgba(255, 152, 0, 0.3);
    }

    /* Dark theme: solo los acentos indigo, el resto sale de las variables de tema */
    :host-context(.dark-theme) {
      .section-header mat-icon {
        color: rgba(121, 134, 203, 0.9);
      }
    }
  `]
})
export class CreateEditProveedorComponent implements OnInit {
  proveedorForm: FormGroup;
  isLoading = false;
  isEditing = false;

  // Selected persona for display
  selectedPersona: Persona | null = null;

  constructor(
    private dialogRef: MatDialogRef<CreateEditProveedorComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      proveedor?: Proveedor,
      preselectedPersona?: Partial<Persona>
    },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private dialog: MatDialog
  ) {
    this.proveedorForm = this.fb.group({
      nombre: ['', [Validators.required]],
      razon_social: [''],
      ruc: [''],
      telefono: [''],
      direccion: [''],
      activo: [true],
      persona_id: [null],
      cuentaBancariaDefaultId: [null]
    });

    this.isEditing = !!this.data.proveedor;
  }

  ngOnInit(): void {
    if (this.isEditing && this.data.proveedor) {
      // Set form values when editing
      this.proveedorForm.patchValue({
        nombre: this.data.proveedor.nombre,
        razon_social: this.data.proveedor.razon_social || '',
        ruc: this.data.proveedor.ruc || '',
        telefono: this.data.proveedor.telefono || '',
        direccion: this.data.proveedor.direccion || '',
        activo: this.data.proveedor.activo,
        persona_id: this.data.proveedor.persona?.id || null,
        cuentaBancariaDefaultId: this.data.proveedor.cuentaBancariaDefaultId || null
      });

      // Store selected persona for display
      this.selectedPersona = this.data.proveedor.persona || null;
    } else if (this.data.preselectedPersona && this.data.preselectedPersona.id) {
      // If we have a preselected persona
      this.selectedPersona = this.data.preselectedPersona as Persona;

      // Use persona's data to pre-fill the form
      this.proveedorForm.patchValue({
        persona_id: this.data.preselectedPersona.id,
        nombre: this.data.preselectedPersona.nombre || '',
        telefono: this.data.preselectedPersona.telefono || ''
      });
    }
  }

  async openPersonaSearch(): Promise<void> {
    // Configuration for the generic search dialog
    const searchConfig: GenericSearchConfig = {
      title: 'Buscar Persona',
      displayedColumns: ['nombre', 'documento', 'tipoDocumento'],
      columnLabels: {
        nombre: 'Nombre',
        documento: 'Documento',
        tipoDocumento: 'Tipo'
      },
      searchFn: async (query: string, page: number, pageSize: number) => {
        // This would be implemented in repository service in a real app
        // For now, we'll simulate by filtering the personas we get
        try {
          const allPersonas = await firstValueFrom(this.repositoryService.getPersonas());
          let filteredPersonas = allPersonas;

          if (query) {
            const lowerQuery = query.toLowerCase();
            filteredPersonas = allPersonas.filter(p =>
              p.nombre.toLowerCase().includes(lowerQuery) ||
              (p.documento && p.documento.toLowerCase().includes(lowerQuery))
            );
          }

          // Manual pagination
          const start = page * pageSize;
          const end = start + pageSize;
          const paginatedPersonas = filteredPersonas.slice(start, end);

          return {
            items: paginatedPersonas,
            total: filteredPersonas.length
          };
        } catch (error) {
          console.error('Error searching personas:', error);
          return { items: [], total: 0 };
        }
      }
    };

    // Open the generic search dialog
    const dialogRef = this.dialog.open(GenericSearchDialogComponent, {
      width: '800px',
      data: searchConfig
    });

    // Handle dialog close
    dialogRef.afterClosed().subscribe((persona: Persona | undefined) => {
      if (persona) {
        this.selectedPersona = persona;
        this.proveedorForm.patchValue({
          persona_id: persona.id,
          // Optionally update other fields based on persona data
          nombre: persona.nombre || this.proveedorForm.get('nombre')?.value,
          telefono: persona.telefono || this.proveedorForm.get('telefono')?.value
        });
      }
    });
  }

  async save(): Promise<void> {
    if (this.proveedorForm.invalid) {
      return;
    }

    this.isLoading = true;
    //set nombre and razon_social to uppercase
    this.proveedorForm.patchValue({
      nombre: this.proveedorForm.get('nombre')?.value.toUpperCase(),
      razon_social: this.proveedorForm.get('razon_social')?.value.toUpperCase()
    });
    const formData = { ...this.proveedorForm.value };

    try {
      if (this.isEditing && this.data.proveedor) {
        const updatedProveedor = await firstValueFrom(
          this.repositoryService.updateProveedor(this.data.proveedor.id!, formData)
        );
        this.dialogRef.close({ success: true, action: 'update', proveedor: updatedProveedor });
      } else {
        const newProveedor = await firstValueFrom(
          this.repositoryService.createProveedor(formData)
        );
        this.dialogRef.close({ success: true, action: 'create', proveedor: newProveedor });
      }
    } catch (error) {
      console.error('Error saving proveedor:', error);
      this.dialogRef.close({ success: false, error });
    } finally {
      this.isLoading = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  onCuentaChange(cuenta: CuentaBancariaDestino | null): void {
    this.proveedorForm.patchValue({
      cuentaBancariaDefaultId: cuenta?.id || null
    });
  }

  async openCreateCuentaDialog(): Promise<void> {
    if (!this.selectedPersona) {
      return;
    }

    const dialogRef = this.dialog.open(CreateEditCuentaDestinoDialogComponent, {
      width: '600px',
      data: {
        personaId: this.selectedPersona.id
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success && result?.cuenta) {
        // Actualizar el selector con la nueva cuenta
        this.proveedorForm.patchValue({
          cuentaBancariaDefaultId: result.cuenta.id
        });
      }
    });
  }
}
