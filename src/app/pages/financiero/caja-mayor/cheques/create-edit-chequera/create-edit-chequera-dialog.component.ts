import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-create-edit-chequera-dialog',
  templateUrl: './create-edit-chequera-dialog.component.html',
  styleUrls: ['./create-edit-chequera-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatProgressSpinnerModule, MatSnackBarModule,
  ]
})
export class CreateEditChequeraDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  isEditing = false;
  chequeraId: number | null = null;

  cuentasBancarias: any[] = [];
  estados = ['ACTIVA', 'AGOTADA', 'ANULADA'];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateEditChequeraDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  async ngOnInit(): Promise<void> {
    this.chequeraId = this.data?.chequeraId || null;
    this.isEditing = !!this.chequeraId;

    this.form = this.fb.group({
      nombre: ['', Validators.required],
      cuentaBancariaId: [null, Validators.required],
      numeroInicial: ['', Validators.required],
      numeroFinal: ['', Validators.required],
      siguienteNumero: [''],
      estado: ['ACTIVA'],
      observacion: [''],
    });

    await this.loadOptions();
    if (this.isEditing) {
      await this.loadChequera();
    }
  }

  async loadOptions(): Promise<void> {
    try {
      this.cuentasBancarias = await firstValueFrom(this.repositoryService.getCuentasBancarias());
      this.cuentasBancarias = (this.cuentasBancarias || []).filter((cb: any) => cb.activo);
    } catch (error) {
      console.error('Error loading cuentas bancarias:', error);
    }
  }

  async loadChequera(): Promise<void> {
    try {
      const ch = await firstValueFrom(this.repositoryService.getChequera(this.chequeraId!));
      this.form.patchValue({
        nombre: ch.nombre,
        cuentaBancariaId: ch.cuentaBancaria?.id,
        numeroInicial: ch.numeroInicial,
        numeroFinal: ch.numeroFinal,
        siguienteNumero: ch.siguienteNumero,
        estado: ch.estado,
        observacion: ch.observacion,
      });
    } catch (error) {
      console.error('Error loading chequera:', error);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      const v = this.form.value;
      const data: any = {
        nombre: v.nombre,
        cuentaBancariaId: v.cuentaBancariaId,
        numeroInicial: v.numeroInicial,
        numeroFinal: v.numeroFinal,
        siguienteNumero: v.siguienteNumero || v.numeroInicial,
        estado: v.estado,
        observacion: v.observacion || null,
      };
      if (this.isEditing) {
        await firstValueFrom(this.repositoryService.updateChequera(this.chequeraId!, data));
        this.snackBar.open('Chequera actualizada', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createChequera(data));
        this.snackBar.open('Chequera creada', 'Cerrar', { duration: 3000 });
      }
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error saving chequera:', error);
      this.snackBar.open('Error al guardar chequera', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close();
  }
}
