import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

export interface CrearAccesoDirectoData {
  /** Dashboards posibles donde colocar el shortcut. */
  dashboardsDisponibles: { key: string; label: string }[];
  /** Sugerencias para los campos. */
  tituloSugerido: string;
  iconoSugerido?: string;
  colorSugerido?: string;
  targetType: string;
  targetData: any;
}

@Component({
  selector: 'app-crear-acceso-directo-dialog',
  templateUrl: './crear-acceso-directo-dialog.component.html',
  styleUrls: ['./crear-acceso-directo-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ]
})
export class CrearAccesoDirectoDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;

  iconosSugeridos = [
    'star', 'bookmark', 'push_pin', 'flash_on', 'rocket_launch',
    'account_balance', 'point_of_sale', 'receipt_long', 'payments',
    'credit_card', 'account_balance_wallet', 'fact_check', 'request_quote',
    'inventory_2', 'shopping_cart', 'home',
  ];
  coloresSugeridos = [
    '#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#7b1fa2',
    '#0288d1', '#00796b', '#5d4037', '#455a64', '#c2185b',
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CrearAccesoDirectoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: CrearAccesoDirectoData,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      dashboardKey: [this.data?.dashboardsDisponibles?.[0]?.key || null, Validators.required],
      titulo: [this.data?.tituloSugerido || '', Validators.required],
      icono: [this.data?.iconoSugerido || 'star', Validators.required],
      color: [this.data?.colorSugerido || '#1976d2', Validators.required],
    });
  }

  seleccionarIcono(icono: string): void {
    this.form.patchValue({ icono });
  }

  seleccionarColor(color: string): void {
    this.form.patchValue({ color });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const f = this.form.value;
      await firstValueFrom(this.repositoryService.createDashboardShortcut({
        dashboardKey: f.dashboardKey,
        titulo: f.titulo,
        icono: f.icono,
        color: f.color,
        targetType: this.data.targetType,
        targetData: this.data.targetData,
      }));
      this.snackBar.open('Acceso directo creado', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al crear acceso directo', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void {
    this.dialogRef?.close(false);
  }
}
