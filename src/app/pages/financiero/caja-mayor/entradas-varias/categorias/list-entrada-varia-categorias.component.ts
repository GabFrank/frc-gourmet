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

@Component({
  selector: 'app-list-entrada-varia-categorias',
  templateUrl: './list-entrada-varia-categorias.component.html',
  styleUrls: ['./list-entrada-varia-categorias.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatButtonModule, MatIconModule, MatMenuModule, MatCardModule,
    MatProgressSpinnerModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSnackBarModule, MatDialogModule, MatTooltipModule,
  ]
})
export class ListEntradaVariaCategoriasComponent implements OnInit {
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

  setData(_data: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getEntradaVariaCategorias());
    } catch (error) {
      console.error('Error loading entrada varia categorias:', error);
      this.snackBar.open('Error al cargar categorias', 'Cerrar', { duration: 3000 });
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
      const data: any = {
        nombre: v.nombre?.toUpperCase(),
        padre: v.padreId ? { id: v.padreId } : null,
        activo: true,
      };
      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updateEntradaVariaCategoria(this.editingId, data));
        this.snackBar.open('Categoria actualizada', 'Cerrar', { duration: 3000 });
      } else {
        await firstValueFrom(this.repositoryService.createEntradaVariaCategoria(data));
        this.snackBar.open('Categoria creada', 'Cerrar', { duration: 3000 });
      }
      this.cancelInlineForm();
      this.loadData();
    } catch (error) {
      console.error('Error saving entrada varia categoria:', error);
      this.snackBar.open('Error al guardar', 'Cerrar', { duration: 3000 });
    }
  }

  async desactivar(c: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Desactivar Categoria',
        message: `¿Desactivar "${c.nombre}"?`,
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteEntradaVariaCategoria(c.id));
      this.snackBar.open('Categoria desactivada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (error) {
      console.error('Error desactivando entrada varia categoria:', error);
      this.snackBar.open('Error al desactivar', 'Cerrar', { duration: 3000 });
    }
  }
}
