import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators } from '@angular/forms';
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
  selector: 'app-list-compra-categorias',
  templateUrl: './list-compra-categorias.component.html',
  styleUrls: ['./list-compra-categorias.component.scss'],
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
export class ListCompraCategoriasComponent implements OnInit {
  categorias: any[] = [];
  loading = false;
  displayedColumns = ['nombre', 'padre', 'activo', 'actions'];

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

  setData(_d: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getCompraCategorias());
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar categorías', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  showCreateForm(): void {
    this.editingId = null;
    this.inlineForm.reset();
    this.showInlineForm = true;
  }

  editCategoria(c: any): void {
    this.editingId = c.id;
    this.inlineForm.patchValue({ nombre: c.nombre, padreId: c.padre?.id || null });
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
      const v = this.inlineForm.value;
      const data = {
        nombre: v.nombre?.toUpperCase(),
        padreId: v.padreId || null,
        activo: true,
      };
      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updateCompraCategoria(this.editingId, data));
        this.snackBar.open('Categoría actualizada', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createCompraCategoria(data));
        this.snackBar.open('Categoría creada', 'Cerrar', { duration: 3000 });
      }
      this.cancelInlineForm();
      this.loadData();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3000 });
    }
  }

  async desactivar(c: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Desactivar', message: `¿Desactivar "${c.nombre}"?` },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.updateCompraCategoria(c.id, { activo: false }));
      this.snackBar.open('Categoría desactivada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al desactivar', 'Cerrar', { duration: 3000 });
    }
  }
}
