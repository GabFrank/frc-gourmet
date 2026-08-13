import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';
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
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';

@Component({
  selector: 'app-list-gasto-categorias',
  templateUrl: './list-gasto-categorias.component.html',
  styleUrls: ['./list-gasto-categorias.component.scss'],
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
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    HasPermissionDirective,
  ]
})
export class ListGastoCategoriasComponent implements OnInit {
  categorias: any[] = [];
  categoriasFiltradas: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'padre', 'activo', 'actions'];

  // Busqueda client-side por nombre (catalogo chico)
  searchControl = new FormControl('');

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
      padreId: [null],
    });

    this.loadData();
  }

  setData(data: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getGastoCategorias());
      this.aplicarFiltro();
    } catch (error) {
      console.error('Error loading gasto categorias:', error);
      this.snackBar.open('Error al cargar categorias', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  aplicarFiltro(): void {
    const termino = (this.searchControl.value || '').trim().toUpperCase();
    if (!termino) {
      this.categoriasFiltradas = [...this.categorias];
      return;
    }
    this.categoriasFiltradas = this.categorias.filter((cat: any) =>
      (cat.nombre || '').toUpperCase().includes(termino)
    );
  }

  limpiarFiltro(): void {
    this.searchControl.setValue('');
    this.aplicarFiltro();
  }

  showCreateForm(): void {
    this.editingId = null;
    this.inlineForm.reset();
    this.showInlineForm = true;
  }

  editCategoria(categoria: any): void {
    this.editingId = categoria.id;
    this.inlineForm.patchValue({
      nombre: categoria.nombre,
      padreId: categoria.padre?.id || null,
    });
    this.showInlineForm = true;
  }

  cancelInlineForm(): void {
    this.showInlineForm = false;
    this.editingId = null;
    this.inlineForm.reset();
  }

  async saveInlineForm(): Promise<void> {
    if (this.inlineForm.invalid) return;

    try {
      const formValue = this.inlineForm.value;
      const data = {
        nombre: formValue.nombre?.toUpperCase(),
        padreId: formValue.padreId || null,
        activo: true,
      };

      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updateGastoCategoria(this.editingId, data));
        this.snackBar.open('Categoria actualizada correctamente', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createGastoCategoria(data));
        this.snackBar.open('Categoria creada correctamente', 'Cerrar', { duration: 3000 });
      }

      this.cancelInlineForm();
      this.loadData();
    } catch (error) {
      console.error('Error saving categoria:', error);
      this.snackBar.open('Error al guardar categoria', 'Cerrar', { duration: 3000 });
    }
  }

  async desactivarCategoria(categoria: any): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Desactivar Categoria',
        message: '¿Esta seguro que desea desactivar la categoria "' + categoria.nombre + '"?',
      }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      try {
        await firstValueFrom(this.repositoryService.updateGastoCategoria(categoria.id, { activo: false }));
        this.snackBar.open('Categoria desactivada correctamente', 'Cerrar', { duration: 3000 });
        this.loadData();
      } catch (error) {
        console.error('Error desactivando categoria:', error);
        this.snackBar.open('Error al desactivar categoria', 'Cerrar', { duration: 3000 });
      }
    }
  }
}
