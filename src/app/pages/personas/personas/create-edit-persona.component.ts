import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RepositoryService } from '../../../database/repository.service';
import { Persona } from '../../../database/entities/personas/persona.entity';
import { DocumentoTipo } from '../../../database/entities/personas/documento-tipo.enum';
import { PersonaTipo } from '../../../database/entities/personas/persona-tipo.enum';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-create-edit-persona',
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
  templateUrl: './create-edit-persona.component.html',
  styleUrls: ['./create-edit-persona.component.scss']
})
export class CreateEditPersonaComponent implements OnInit {
  personaForm: FormGroup;
  documentoTipos = Object.values(DocumentoTipo);
  personaTipos = Object.values(PersonaTipo);
  isEditing = false;
  loading = false;
  
  // Image upload properties
  selectedImageFile: File | null = null;
  imagePreviewUrl: string | null = null;
  maxImageSize = 5 * 1024 * 1024; // 5MB

  constructor(
    private dialogRef: MatDialogRef<CreateEditPersonaComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { persona?: Persona },
    private fb: FormBuilder,
    private repositoryService: RepositoryService
  ) {
    this.personaForm = this.fb.group({
      nombre: ['', [Validators.required]],
      telefono: [''],
      direccion: [''],
      tipoDocumento: [DocumentoTipo.CI, [Validators.required]],
      documento: ['', [Validators.required]],
      tipoPersona: [PersonaTipo.FISICA, [Validators.required]],
      activo: [true],
      imageUrl: ['']
    });
    
    this.isEditing = !!this.data.persona;
  }

  ngOnInit(): void {
    if (this.isEditing && this.data.persona) {
      this.loadPersona();
    }
  }

  loadPersona(): void {
    if (!this.data.persona) return;
    
    this.loading = true;
    try {
      // Patch form with existing persona data
      this.personaForm.patchValue({
        nombre: this.data.persona.nombre,
        telefono: this.data.persona.telefono || '',
        direccion: this.data.persona.direccion || '',
        tipoDocumento: this.data.persona.tipoDocumento,
        documento: this.data.persona.documento,
        tipoPersona: this.data.persona.tipoPersona,
        activo: this.data.persona.activo,
        imageUrl: this.data.persona.imageUrl || ''
      });
      
      // If the persona has an image, set the preview
      if (this.data.persona.imageUrl) {
        this.imagePreviewUrl = this.data.persona.imageUrl;
        
      }
    } catch (error) {
      console.error('Error loading persona data:', error);
    } finally {
      this.loading = false;
    }
  }
  
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    
    if (!input.files || input.files.length === 0) {
      this.selectedImageFile = null;
      this.imagePreviewUrl = null;
      return;
    }
    
    const file = input.files[0];
    
    // Validate file type
    if (!file.type.match(/image\/(jpeg|jpg|png|gif|webp)/)) {
      alert('Solo se permiten archivos de imagen (JPEG, PNG, GIF, WEBP)');
      this.selectedImageFile = null;
      this.imagePreviewUrl = null;
      return;
    }
    
    // Validate file size
    if (file.size > this.maxImageSize) {
      alert(`El tamaño de la imagen no debe superar ${this.maxImageSize / (1024 * 1024)}MB`);
      this.selectedImageFile = null;
      this.imagePreviewUrl = null;
      return;
    }
    
    this.selectedImageFile = file;
    
    // Create preview URL
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreviewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }
  
  removeImage(): void {
    // If we have an existing image URL and we're editing, delete the image
    if (this.isEditing && this.data.persona && this.data.persona.imageUrl && 
        this.data.persona.imageUrl.startsWith('app://')) {
      this.repositoryService.deleteProfileImage(this.data.persona.imageUrl)
        .subscribe({
          next: (success: boolean) => {
            console.log('Image deleted successfully:', success);
          },
          error: (error: any) => {
            console.error('Error deleting image:', error);
          }
        });
    }
    
    this.selectedImageFile = null;
    this.imagePreviewUrl = null;
    this.personaForm.patchValue({ imageUrl: null });
  }

  // Helper method to format image URLs for display
  displayImageUrl(imageUrl: string | null): string {
    if (!imageUrl) {
      return 'assets/default-profile.png'; // Fallback image
    }
    
    // If it's already a proper URL or data URL, use it directly
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
      return imageUrl;
    }
    
    // For our app protocol URLs, return as is - the protocol handler will resolve it
    if (imageUrl.startsWith('app://')) {
      return imageUrl;
    }

    return imageUrl;
  }

  async onSubmit(): Promise<void> {
    if (this.personaForm.invalid) {
      this.markFormGroupTouched(this.personaForm);
      return;
    }

    this.loading = true;
    const formData = this.personaForm.value;
    
    // Convert string fields to uppercase
    const personaData = {
      ...formData,
      nombre: formData.nombre?.toUpperCase() || '',
      telefono: formData.telefono?.toUpperCase() || '',
      direccion: formData.direccion?.toUpperCase() || '',
      documento: formData.documento?.toUpperCase() || '',
      // Don't set imageUrl here, we'll set it based on the conditions below
      imageUrl: undefined
    };
    
    try {
      // Handle image changes
      const oldImageUrl = this.isEditing && this.data.persona ? this.data.persona.imageUrl : null;
      
      // Handle image upload if a new image was selected
      if (this.selectedImageFile) {
        try {
          const imageUrl = await this.uploadImage(this.selectedImageFile);
          personaData.imageUrl = imageUrl;
          
          // Delete old image if it was replaced and was a local app:// image
          if (oldImageUrl && oldImageUrl !== this.imagePreviewUrl && oldImageUrl.startsWith('app://')) {
            this.repositoryService.deleteProfileImage(oldImageUrl).subscribe({
              next: (success: boolean) => console.log('Old image deleted:', success),
              error: (error: any) => console.error('Error deleting old image:', error)
            });
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          alert(`Error al subir la imagen: ${errorMessage}. Los datos se guardarán sin la imagen.`);
          // Clear the image URL to ensure we don't save an invalid reference
          personaData.imageUrl = null;
        }
      } else if (oldImageUrl && !this.imagePreviewUrl) {
        // If image was removed, delete it and set imageUrl to null
        if (oldImageUrl.startsWith('app://')) {
          this.repositoryService.deleteProfileImage(oldImageUrl).subscribe({
            next: (success: boolean) => console.log('Image deleted:', success),
            error: (error: any) => console.error('Error deleting image:', error)
          });
        }
        
        // Explicitly set imageUrl to null when image is removed
        personaData.imageUrl = null;
      } else if (this.isEditing && oldImageUrl && !this.selectedImageFile) {
        // If we're editing and there's an existing image, but no new image selected,
        // keep the existing image URL
        personaData.imageUrl = oldImageUrl;
      }
      
      
      if (this.isEditing && this.data.persona) {
        // Update existing persona
        const updatedPersona = await firstValueFrom(this.repositoryService.updatePersona(this.data.persona.id!, personaData));
        this.dialogRef.close({ success: true, action: 'update', persona: updatedPersona });
      } else {
        // Create new persona
        const createdPersona = await firstValueFrom(this.repositoryService.createPersona(personaData));
        this.dialogRef.close({ success: true, action: 'create', persona: createdPersona });
      }
    } catch (error) {
      console.error('Error saving persona:', error);
      this.dialogRef.close({ success: false, error });
    } finally {
      this.loading = false;
    }
  }
  
  // Upload image and return the URL
  private async uploadImage(file: File): Promise<string> {
    try {
      
      // Create a FormData object to send the file
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload the image using repository service
      const response = await firstValueFrom(this.repositoryService.uploadImage(formData));
      
      // Log and return the URL of the uploaded image
      return response.imageUrl;
    } catch (error) {
      console.error('Error in uploadImage:', error);
      throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  // Helper method to mark all form controls as touched to trigger validation errors
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }
} 