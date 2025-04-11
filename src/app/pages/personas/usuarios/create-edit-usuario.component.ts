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
import { Usuario } from '../../../database/entities/personas/usuario.entity';
import { Persona } from '../../../database/entities/personas/persona.entity';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { GenericSearchDialogComponent, GenericSearchConfig } from '../../../shared/components/generic-search-dialog/generic-search-dialog.component';

@Component({
  selector: 'app-create-edit-usuario',
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
  templateUrl: './create-edit-usuario.component.html',
  styleUrls: ['./create-edit-usuario.component.scss']
})
export class CreateEditUsuarioComponent implements OnInit {
  usuarioForm: FormGroup;
  isLoading = false;
  isEditing = false;
  personas: Persona[] = [];
  hidePassword = true;

  // Selected persona for display
  selectedPersona: Persona | null = null;

  constructor(
    private dialogRef: MatDialogRef<CreateEditUsuarioComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      usuario?: Usuario,
      preselectedPersona?: Partial<Persona>
    },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private dialog: MatDialog
  ) {
    this.usuarioForm = this.fb.group({
      nickname: ['', [Validators.required]],
      password: ['', this.data.usuario ? [] : [Validators.required, Validators.minLength(4)]],
      activo: [true],
      persona_id: [null]
    });

    this.isEditing = !!this.data.usuario;
  }

  ngOnInit(): void {
    // No need to load all personas since we'll search them as needed

    if (this.isEditing && this.data.usuario) {
      // Set form values when editing
      this.usuarioForm.patchValue({
        nickname: this.data.usuario.nickname,
        activo: this.data.usuario.activo,
        persona_id: this.data.usuario.persona?.id || null
      });

      // Store selected persona for display
      this.selectedPersona = this.data.usuario.persona;

      // Make password optional when editing
      this.usuarioForm.get('password')?.setValidators([]);
      this.usuarioForm.get('password')?.updateValueAndValidity();
    } else if (this.data.preselectedPersona && this.data.preselectedPersona.id) {
      // If we have a preselected persona from the persona list
      this.selectedPersona = this.data.preselectedPersona as Persona;
      this.usuarioForm.patchValue({
        persona_id: this.data.preselectedPersona.id,
        // Generate a suggested nickname based on persona's name or document
        nickname: this.generateSuggestedNickname(this.data.preselectedPersona)
      });
    }
  }

  // Generate a suggested nickname based on persona data
  private generateSuggestedNickname(persona: Partial<Persona>): string {
    if (!persona) return '';

    // Try to create a nickname from persona's name
    if (persona.nombre) {
      // Extract first name
      const nameParts = persona.nombre.toLowerCase().split(' ');
      if (nameParts.length > 0) {
        // If there's a document, combine first name with last digits of document
        if (persona.documento && persona.documento.length > 3) {
          const lastDigits = persona.documento.slice(-3);
          return `${nameParts[0]}${lastDigits}`;
        }
        return nameParts[0]; // Just use first name if no document
      }
    }

    // If no name, try to use the document
    if (persona.documento) {
      return `user${persona.documento.replace(/\D/g, '')}`;
    }

    // Default fallback
    return `user${new Date().getTime().toString().slice(-5)}`;
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
              p.documento.toLowerCase().includes(lowerQuery)
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
        this.usuarioForm.patchValue({
          persona_id: persona.id
        });
      }
    });
  }

  async save(): Promise<void> {
    if (this.usuarioForm.invalid) {
      return;
    }

    this.isLoading = true;
    const formData = { ...this.usuarioForm.value };

    // Convert string form controls to uppercase
    if (formData.nickname) {
      formData.nickname = formData.nickname.toUpperCase();
    }

    if (formData.password) {
      formData.password = formData.password.toUpperCase();
    }

    try {
      if (this.isEditing && this.data.usuario) {
        // Don't send empty password when updating
        if (!formData.password) {
          delete formData.password;
        }
        const updatedUsuario = await firstValueFrom(this.repositoryService.updateUsuario(this.data.usuario.id!, formData));
        this.dialogRef.close({ success: true, action: 'update', usuario: updatedUsuario });
      } else {
        const newUsuario = await firstValueFrom(this.repositoryService.createUsuario(formData));
        this.dialogRef.close({ success: true, action: 'create', usuario: newUsuario });
      }
    } catch (error) {
      console.error('Error saving usuario:', error);
      this.dialogRef.close({ success: false, error });
    } finally {
      this.isLoading = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}