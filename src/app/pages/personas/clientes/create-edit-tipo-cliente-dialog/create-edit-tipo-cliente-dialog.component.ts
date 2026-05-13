import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { TipoCliente } from 'src/app/database/entities/personas/tipo-cliente.entity';

@Component({
  selector: 'app-create-edit-tipo-cliente-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './create-edit-tipo-cliente-dialog.component.html',
  styleUrls: ['./create-edit-tipo-cliente-dialog.component.scss'],
})
export class CreateEditTipoClienteDialogComponent implements OnInit {
  form!: FormGroup;
  isEditing = false;
  saving = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<CreateEditTipoClienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { tipoCliente?: TipoCliente | null },
  ) {
    this.isEditing = !!data?.tipoCliente;
  }

  ngOnInit(): void {
    const t = this.data?.tipoCliente;
    this.form = this.fb.group({
      descripcion: [t?.descripcion || '', [Validators.required, Validators.minLength(2)]],
      credito: [t?.credito ?? false],
      descuento: [t?.descuento ?? false],
      porcentaje_descuento: [t?.porcentaje_descuento ?? 0, [Validators.min(0), Validators.max(100)]],
      activo: [t?.activo ?? true],
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    const v = this.form.value;
    const payload: Partial<TipoCliente> = {
      descripcion: (v.descripcion || '').trim().toUpperCase(),
      credito: !!v.credito,
      descuento: !!v.descuento,
      porcentaje_descuento: v.descuento ? Number(v.porcentaje_descuento) || 0 : 0,
      activo: !!v.activo,
    };
    try {
      let saved: TipoCliente;
      if (this.isEditing && this.data.tipoCliente?.id) {
        const res: any = await firstValueFrom(
          this.repositoryService.updateTipoCliente(this.data.tipoCliente.id, payload),
        );
        saved = res?.tipoCliente || { ...this.data.tipoCliente, ...payload } as TipoCliente;
        this.snackBar.open('Tipo de cliente actualizado', 'Cerrar', { duration: 2500 });
      } else {
        saved = await firstValueFrom(this.repositoryService.createTipoCliente(payload));
        this.snackBar.open('Tipo de cliente creado', 'Cerrar', { duration: 2500 });
      }
      this.dialogRef.close({ saved: true, tipoCliente: saved });
    } catch (error) {
      console.error('Error guardando tipo cliente:', error);
      this.snackBar.open('Error al guardar tipo cliente', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
