import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-list-cargos',
  templateUrl: './list-cargos.component.html',
  styleUrls: ['./list-cargos.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
  ],
})
export class ListCargosComponent implements OnInit {
  cargos: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'descripcion', 'salario', 'activo', 'actions'];

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
      nombre: ['', Validators.required],
      descripcion: [''],
      salarioReferencia: [null],
      activo: [true],
    });
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.cargos = await firstValueFrom(this.repositoryService.getCargos());
    } catch (error) {
      console.error('Error loading cargos:', error);
      this.snackBar.open('Error al cargar cargos', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  showCreateForm(): void {
    this.editingId = null;
    this.inlineForm.reset({ activo: true });
    this.showInlineForm = true;
  }

  editCargo(c: any): void {
    this.editingId = c.id;
    this.inlineForm.patchValue({
      nombre: c.nombre,
      descripcion: c.descripcion,
      salarioReferencia: c.salarioReferencia,
      activo: c.activo,
    });
    this.showInlineForm = true;
  }

  cancelInlineForm(): void {
    this.showInlineForm = false;
    this.editingId = null;
    this.inlineForm.reset({ activo: true });
  }

  async submitInlineForm(): Promise<void> {
    if (this.inlineForm.invalid) return;
    const value = this.inlineForm.value;
    const data = {
      nombre: (value.nombre || '').toUpperCase(),
      descripcion: value.descripcion,
      salarioReferencia: value.salarioReferencia,
      activo: value.activo !== false,
    };
    try {
      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updateCargo(this.editingId, data));
        this.snackBar.open('Cargo actualizado', 'Cerrar', { duration: 2500 });
      } else {
        await firstValueFrom(this.repositoryService.createCargo(data));
        this.snackBar.open('Cargo creado', 'Cerrar', { duration: 2500 });
      }
      this.cancelInlineForm();
      this.loadData();
    } catch (error) {
      console.error('Error guardando cargo:', error);
      this.snackBar.open('Error al guardar cargo', 'Cerrar', { duration: 3500 });
    }
  }

  async deleteCargo(c: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Desactivar cargo',
        message: `¿Desactivar el cargo "${c.nombre}"? No se elimina; queda en historico.`,
        confirmText: 'Desactivar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteCargo(c.id));
      this.snackBar.open('Cargo desactivado', 'Cerrar', { duration: 2500 });
      this.loadData();
    } catch (error) {
      console.error('Error desactivando cargo:', error);
      this.snackBar.open('Error al desactivar cargo', 'Cerrar', { duration: 3500 });
    }
  }
}
