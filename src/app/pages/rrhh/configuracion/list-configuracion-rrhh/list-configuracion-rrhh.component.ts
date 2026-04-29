import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

const TIPOS = ['NUMBER', 'STRING', 'BOOLEAN', 'DATE'];

@Component({
  selector: 'app-list-configuracion-rrhh',
  templateUrl: './list-configuracion-rrhh.component.html',
  styleUrls: ['./list-configuracion-rrhh.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatSlideToggleModule,
  ],
})
export class ListConfiguracionRrhhComponent implements OnInit {
  configs: any[] = [];
  loading = false;
  displayedColumns = ['clave', 'valor', 'tipo', 'descripcion', 'activo', 'actions'];
  tipos = TIPOS;

  showInlineForm = false;
  editingId: number | null = null;
  inlineForm!: FormGroup;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.inlineForm = this.fb.group({
      clave: ['', Validators.required],
      valor: [''],
      tipo: ['STRING', Validators.required],
      descripcion: [''],
      activo: [true],
    });
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.configs = await firstValueFrom(this.repositoryService.getConfiguracionesRrhh());
    } catch (error) {
      console.error('Error loading configuracion rrhh:', error);
      this.snackBar.open('Error al cargar configuracion RRHH', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  showCreateForm(): void {
    this.editingId = null;
    this.inlineForm.reset({ tipo: 'STRING', activo: true });
    this.showInlineForm = true;
  }

  editConfig(c: any): void {
    this.editingId = c.id;
    this.inlineForm.patchValue({
      clave: c.clave,
      valor: c.valor,
      tipo: c.tipo,
      descripcion: c.descripcion,
      activo: c.activo,
    });
    this.showInlineForm = true;
  }

  cancelInlineForm(): void {
    this.showInlineForm = false;
    this.editingId = null;
    this.inlineForm.reset({ tipo: 'STRING', activo: true });
  }

  async submitInlineForm(): Promise<void> {
    if (this.inlineForm.invalid) return;
    const value = this.inlineForm.value;
    const data = {
      clave: (value.clave || '').toUpperCase(),
      valor: value.valor,
      tipo: value.tipo,
      descripcion: value.descripcion,
      activo: value.activo !== false,
    };
    try {
      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updateConfiguracionRrhh(this.editingId, data));
        this.snackBar.open('Configuracion actualizada', 'Cerrar', { duration: 2500 });
      } else {
        await firstValueFrom(this.repositoryService.createConfiguracionRrhh(data));
        this.snackBar.open('Configuracion creada', 'Cerrar', { duration: 2500 });
      }
      this.cancelInlineForm();
      this.loadData();
    } catch (error) {
      console.error('Error guardando configuracion rrhh:', error);
      this.snackBar.open('Error al guardar configuracion', 'Cerrar', { duration: 3500 });
    }
  }

  async deleteConfig(c: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar configuracion',
        message: `¿Eliminar la configuracion "${c.clave}"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteConfiguracionRrhh(c.id));
      this.snackBar.open('Configuracion eliminada', 'Cerrar', { duration: 2500 });
      this.loadData();
    } catch (error) {
      console.error('Error eliminando configuracion rrhh:', error);
      this.snackBar.open('Error al eliminar configuracion', 'Cerrar', { duration: 3500 });
    }
  }

  async resemenbrarBase(): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Sembrar configuracion base',
        message: 'Crea las configuraciones base de RRHH (IPS, vacaciones, indemnizacion) que no existan. No modifica las actuales.',
        confirmText: 'Sembrar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.seedConfiguracionRrhh());
      this.snackBar.open('Configuracion base sembrada', 'Cerrar', { duration: 2500 });
      this.loadData();
    } catch (error) {
      console.error('Error sembrando configuracion rrhh:', error);
      this.snackBar.open('Error al sembrar configuracion', 'Cerrar', { duration: 3500 });
    }
  }
}
