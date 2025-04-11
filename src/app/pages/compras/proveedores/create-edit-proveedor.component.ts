import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from '../../../database/repository.service';
import { Proveedor } from '../../../database/entities/compras/proveedor.entity';
import { Persona } from '../../../database/entities/personas/persona.entity';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { GenericSearchDialogComponent, GenericSearchConfig } from '../../../shared/components/generic-search-dialog/generic-search-dialog.component';

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
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
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
            <div class="persona-label">Persona asociada:</div>
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
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 4px;
      background-color: rgba(0, 0, 0, 0.02);
      justify-content: space-between;
    }

    .persona-field {
      flex: 1;
    }

    .persona-label {
      font-weight: 500;
      margin-bottom: 8px;
      color: rgba(0, 0, 0, 0.6);
    }

    .persona-info {
      display: flex;
      flex-direction: column;
    }

    .persona-name {
      font-weight: 500;
    }

    .persona-doc {
      font-size: 0.9em;
      color: rgba(0, 0, 0, 0.6);
    }

    .persona-empty {
      color: rgba(0, 0, 0, 0.4);
      font-style: italic;
    }

    .search-button {
      align-self: flex-start;
      margin-top: 12px;
    }

    /* Dark theme adjustments */
    :host-context(.dark-theme) {
      .persona-section {
        border-color: rgba(255, 255, 255, 0.12);
        background-color: rgba(255, 255, 255, 0.05);
      }

      .persona-label {
        color: rgba(255, 255, 255, 0.6);
      }

      .persona-doc {
        color: rgba(255, 255, 255, 0.6);
      }

      .persona-empty {
        color: rgba(255, 255, 255, 0.4);
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
      persona_id: [null]
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
        persona_id: this.data.proveedor.persona?.id || null
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
}
