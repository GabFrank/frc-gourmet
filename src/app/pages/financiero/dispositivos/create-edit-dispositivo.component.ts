import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Dispositivo } from 'src/app/database/entities/financiero/dispositivo.entity';
import { RepositoryService } from 'src/app/database/repository.service';

interface DialogData {
  dispositivo?: Dispositivo;
}

@Component({
  selector: 'app-create-edit-dispositivo',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatIconModule
  ],
  templateUrl: './create-edit-dispositivo.component.html',
  styleUrls: ['./create-edit-dispositivo.component.scss']
})
export class CreateEditDispositivoComponent implements OnInit {
  form: FormGroup;
  loading = false;
  saving = false;
  isEditMode = false;
  loadingMacAddress = false;
  nameError: string | null = null;
  macError: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<CreateEditDispositivoComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    // Initialize form
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      mac: [''],
      isVenta: [false],
      isCaja: [false],
      isTouch: [false],
      isMobile: [false],
      activo: [true]
    });
  }

  ngOnInit(): void {
    this.isEditMode = !!this.data.dispositivo;

    // If in edit mode, populate the form with the data
    if (this.isEditMode && this.data.dispositivo) {
      this.populateForm();
    }

    // Add listeners to clear validation errors when form values change
    this.form.get('nombre')?.valueChanges.subscribe(() => {
      this.nameError = null;
    });

    this.form.get('mac')?.valueChanges.subscribe(() => {
      this.macError = null;
    });
  }

  private populateForm(): void {
    const dispositivo = this.data.dispositivo!;
    this.form.patchValue({
      nombre: dispositivo.nombre,
      mac: dispositivo.mac || '',
      isVenta: dispositivo.isVenta,
      isCaja: dispositivo.isCaja,
      isTouch: dispositivo.isTouch,
      isMobile: dispositivo.isMobile,
      activo: dispositivo.activo
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }

    this.saving = true;
    //set nombre as uppercase before save
    this.form.get('nombre')?.setValue(this.form.get('nombre')?.value.toUpperCase());
    const dispositivoData = this.form.value;

    if (this.isEditMode) {
      this.updateDispositivo(dispositivoData);
    } else {
      this.createDispositivo(dispositivoData);
    }
  }

  private createDispositivo(dispositivoData: Partial<Dispositivo>): void {
    this.repositoryService.createDispositivo(dispositivoData).subscribe(
      result => {
        this.saving = false;
        this.snackBar.open('Dispositivo creado exitosamente', 'Cerrar', {
          duration: 3000
        });
        this.dialogRef.close(result);
      },
      error => {
        console.error('Error creating dispositivo:', error);
        this.saving = false;

        // Check for specific duplicate errors
        if (error.message) {
          if (error.message.includes('Ya existe un dispositivo con el nombre')) {
            this.nameError = error.message;
            this.snackBar.open(error.message, 'Cerrar', { duration: 5000 });
          } else if (error.message.includes('Ya existe un dispositivo con la dirección MAC')) {
            this.macError = error.message;
            this.snackBar.open(error.message, 'Cerrar', { duration: 5000 });
          } else {
            this.snackBar.open('Error al crear el dispositivo', 'Cerrar', { duration: 3000 });
          }
        } else {
          this.snackBar.open('Error al crear el dispositivo', 'Cerrar', { duration: 3000 });
        }
      }
    );
  }

  private updateDispositivo(dispositivoData: Partial<Dispositivo>): void {
    this.repositoryService.updateDispositivo(this.data.dispositivo!.id!, dispositivoData).subscribe(
      result => {
        this.saving = false;
        this.snackBar.open('Dispositivo actualizado exitosamente', 'Cerrar', {
          duration: 3000
        });
        this.dialogRef.close(result);
      },
      error => {
        console.error('Error updating dispositivo:', error);
        this.saving = false;

        // Check for specific duplicate errors
        if (error.message) {
          if (error.message.includes('Ya existe un dispositivo con el nombre')) {
            this.nameError = error.message;
            this.snackBar.open(error.message, 'Cerrar', { duration: 5000 });
          } else if (error.message.includes('Ya existe un dispositivo con la dirección MAC')) {
            this.macError = error.message;
            this.snackBar.open(error.message, 'Cerrar', { duration: 5000 });
          } else {
            this.snackBar.open('Error al actualizar el dispositivo', 'Cerrar', { duration: 3000 });
          }
        } else {
          this.snackBar.open('Error al actualizar el dispositivo', 'Cerrar', { duration: 3000 });
        }
      }
    );
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getSystemMacAddress(): void {
    this.loadingMacAddress = true;

    // Access the API exposed by preload script
    (window as any).api.getSystemMacAddress()
      .then((macAddress: string) => {
        if (macAddress) {
          this.form.patchValue({ mac: macAddress });
          this.snackBar.open('Dirección MAC obtenida correctamente', 'Cerrar', {
            duration: 3000
          });
        } else {
          this.snackBar.open('No se pudo obtener la dirección MAC', 'Cerrar', {
            duration: 3000
          });
        }
        this.loadingMacAddress = false;
      })
      .catch((error: any) => {
        console.error('Error getting MAC address:', error);
        this.snackBar.open('Error al obtener la dirección MAC', 'Cerrar', {
          duration: 3000
        });
        this.loadingMacAddress = false;
      });
  }
}
