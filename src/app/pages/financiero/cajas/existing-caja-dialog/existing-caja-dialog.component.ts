import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Dispositivo } from 'src/app/database/entities/financiero/dispositivo.entity';
import { Caja } from 'src/app/database/entities/financiero/caja.entity';

@Component({
  selector: 'app-existing-caja-dialog',
  templateUrl: './existing-caja-dialog.component.html',
  styleUrls: ['./existing-caja-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule
  ]
})
export class ExistingCajaDialogComponent implements OnInit {
  existingCaja: Caja;
  otherDispositivos: Dispositivo[] = [];
  dispositivoForm: FormGroup;
  loading = false;

  constructor(
    private dialogRef: MatDialogRef<ExistingCajaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      existingCaja: Caja,
      otherDispositivos: Dispositivo[]
    },
    private formBuilder: FormBuilder
  ) {
    this.existingCaja = data.existingCaja;
    this.otherDispositivos = data.otherDispositivos;

    this.dispositivoForm = this.formBuilder.group({
      dispositivoId: ['']
    });
  }

  ngOnInit(): void {
    // If there are other dispositivos, select the first one by default
    if (this.otherDispositivos.length > 0) {
      this.dispositivoForm.get('dispositivoId')?.setValue(this.otherDispositivos[0].id);
    }
  }

  openExistingCaja(): void {
    this.dialogRef.close({
      action: 'open',
      cajaId: this.existingCaja.id
    });
  }

  createNewCaja(): void {
    this.dialogRef.close({
      action: 'create',
      dispositivoId: this.dispositivoForm.get('dispositivoId')?.value
    });
  }

  cancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }
}
