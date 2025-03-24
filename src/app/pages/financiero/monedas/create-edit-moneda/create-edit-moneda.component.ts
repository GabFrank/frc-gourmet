import { Component, Input, OnInit, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { Moneda } from '../../../../database/entities/financiero/moneda.entity';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-create-edit-moneda',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  templateUrl: './create-edit-moneda.component.html',
  styleUrls: ['./create-edit-moneda.component.scss']
})
export class CreateEditMonedaComponent implements OnInit {
  @Input() data: any;

  monedaForm: FormGroup;
  isLoading = false;
  isEditing = false;
  moneda?: Moneda;
  submitted = false;
  isDialog = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() private dialogRef?: MatDialogRef<CreateEditMonedaComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private dialogData?: any
  ) {
    this.monedaForm = this.fb.group({
      denominacion: ['', [Validators.required]],
      simbolo: ['', [Validators.required]],
      principal: [false],
      activo: [true]
    });
    
    // Check if component is opened in a dialog
    this.isDialog = !!this.dialogRef;
  }

  ngOnInit(): void {
    // If opened in a dialog, use dialogData, otherwise use Input data
    const inputData = this.isDialog ? this.dialogData : this.data;
    this.setData(inputData);
  }

  setData(data: any): void {
    if (data && data.moneda) {
      this.moneda = data.moneda;
      this.isEditing = true;
      
      this.monedaForm.patchValue({
        denominacion: this.moneda?.denominacion || '',
        simbolo: this.moneda?.simbolo || '',
        principal: this.moneda?.principal || false,
        activo: this.moneda?.activo !== undefined ? this.moneda.activo : true
      });
    }
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    if (this.monedaForm.invalid) {
      this.markFormGroupTouched(this.monedaForm);
      return;
    }

    this.isLoading = true;
    try {
      const formData = {
        ...this.monedaForm.value,
        // Ensure strings are in uppercase
        denominacion: this.monedaForm.value.denominacion?.toUpperCase(),
        simbolo: this.monedaForm.value.simbolo?.toUpperCase()
      };

      // If setting as principal, we need to unset other monedas as principal
      let monedas: Moneda[] = [];
      if (formData.principal) {
        monedas = await firstValueFrom(this.repositoryService.getMonedas());
        
        // If there's already a principal moneda different from the current one
        const existingPrincipal = monedas.find(m => 
          m.principal && (!this.isEditing || m.id !== this.moneda?.id)
        );

        if (existingPrincipal) {
          // Show a warning that another moneda will lose principal status
          this.snackBar.open(
            `La moneda "${existingPrincipal.denominacion}" perderá su estado como moneda principal`,
            'Entendido',
            { duration: 5000 }
          );
        }
      }

      if (this.isEditing && this.moneda) {
        // Update
        await firstValueFrom(
          this.repositoryService.updateMoneda(this.moneda.id!, formData)
        );
        this.snackBar.open('Moneda actualizada con éxito', 'Cerrar', { duration: 3000 });
        
        // Close dialog with success result if in dialog mode
        if (this.isDialog && this.dialogRef) {
          this.dialogRef.close(true);
        } else {
          this.resetForm();
        }
      } else {
        // Create
        await firstValueFrom(
          this.repositoryService.createMoneda(formData)
        );
        this.snackBar.open('Moneda creada con éxito', 'Cerrar', { duration: 3000 });
        
        // Close dialog with success result if in dialog mode
        if (this.isDialog && this.dialogRef) {
          this.dialogRef.close(true);
        } else {
          this.resetForm();
        }
      }
    } catch (error) {
      console.error('Error saving moneda:', error);
      this.snackBar.open('Error al guardar moneda', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
      this.submitted = false;
    }
  }

  cancel(): void {
    if (this.isDialog && this.dialogRef) {
      // Close dialog without result if in dialog mode
      this.dialogRef.close(false);
    } else {
      this.resetForm();
    }
  }

  resetForm(): void {
    this.isEditing = false;
    this.moneda = undefined;
    this.monedaForm.reset({
      denominacion: '',
      simbolo: '',
      principal: false,
      activo: true
    });
    this.submitted = false;
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();

      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }
}
