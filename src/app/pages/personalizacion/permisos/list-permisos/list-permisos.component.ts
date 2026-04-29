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
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AssignPermisosRoleDialogComponent } from '../assign-permisos-role-dialog/assign-permisos-role-dialog.component';

@Component({
  selector: 'app-list-permisos',
  templateUrl: './list-permisos.component.html',
  styleUrls: ['./list-permisos.component.scss'],
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
    MatTabsModule,
    MatSlideToggleModule,
  ],
})
export class ListPermisosComponent implements OnInit {
  permisos: any[] = [];
  permisosFiltrados: any[] = [];
  modulos: string[] = [];
  filtroModulo: string = 'TODOS';
  loading = false;
  displayedColumns = ['codigo', 'descripcion', 'modulo', 'activo', 'actions'];

  // Roles para asignacion masiva
  roles: any[] = [];

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
      codigo: ['', Validators.required],
      descripcion: [''],
      modulo: ['', Validators.required],
      activo: [true],
    });

    this.loadData();
    this.loadRoles();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.permisos = await firstValueFrom(this.repositoryService.getAllPermissions());
      const set = new Set<string>();
      (this.permisos || []).forEach((p) => p?.modulo && set.add(p.modulo));
      this.modulos = ['TODOS', ...Array.from(set).sort()];
      this.aplicarFiltro();
    } catch (error) {
      console.error('Error loading permisos:', error);
      this.snackBar.open('Error al cargar permisos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async loadRoles(): Promise<void> {
    try {
      this.roles = await firstValueFrom(this.repositoryService.getRoles());
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  }

  aplicarFiltro(): void {
    if (this.filtroModulo === 'TODOS') {
      this.permisosFiltrados = [...this.permisos];
    } else {
      this.permisosFiltrados = this.permisos.filter((p) => p.modulo === this.filtroModulo);
    }
  }

  cambiarFiltro(modulo: string): void {
    this.filtroModulo = modulo;
    this.aplicarFiltro();
  }

  showCreateForm(): void {
    this.editingId = null;
    this.inlineForm.reset({ activo: true });
    this.showInlineForm = true;
  }

  editPermiso(p: any): void {
    this.editingId = p.id;
    this.inlineForm.patchValue({
      codigo: p.codigo,
      descripcion: p.descripcion,
      modulo: p.modulo,
      activo: p.activo,
    });
    this.showInlineForm = true;
  }

  cancelInlineForm(): void {
    this.showInlineForm = false;
    this.editingId = null;
    this.inlineForm.reset();
  }

  async submitInlineForm(): Promise<void> {
    if (this.inlineForm.invalid) return;
    const value = this.inlineForm.value;
    const data = {
      codigo: (value.codigo || '').toUpperCase(),
      descripcion: value.descripcion,
      modulo: (value.modulo || '').toUpperCase(),
      activo: value.activo !== false,
    };
    try {
      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updatePermission(this.editingId, data));
        this.snackBar.open('Permiso actualizado', 'Cerrar', { duration: 2500 });
      } else {
        await firstValueFrom(this.repositoryService.createPermission(data));
        this.snackBar.open('Permiso creado', 'Cerrar', { duration: 2500 });
      }
      this.cancelInlineForm();
      this.loadData();
    } catch (error: any) {
      console.error('Error guardando permiso:', error);
      this.snackBar.open('Error al guardar permiso', 'Cerrar', { duration: 3500 });
    }
  }

  async deletePermiso(p: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar permiso',
        message: `¿Eliminar el permiso "${p.codigo}"? Esta accion solo lo borra del catalogo.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deletePermission(p.id));
      this.snackBar.open('Permiso eliminado', 'Cerrar', { duration: 2500 });
      this.loadData();
    } catch (error) {
      console.error('Error eliminando permiso:', error);
      this.snackBar.open('Error al eliminar permiso', 'Cerrar', { duration: 3500 });
    }
  }

  abrirAsignacion(role: any): void {
    const ref = this.dialog.open(AssignPermisosRoleDialogComponent, {
      width: '700px',
      data: { role, permisos: this.permisos },
    });
    ref.afterClosed().subscribe((res) => {
      if (res?.saved) {
        this.snackBar.open(`Permisos asignados al rol "${role.descripcion}"`, 'Cerrar', { duration: 2500 });
      }
    });
  }

  async resemenbrarPermisosBase(): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Re-sembrar permisos base',
        message: 'Crea los permisos del catalogo base que no existan. No borra ni modifica los actuales.',
        confirmText: 'Sembrar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.seedPermissions());
      this.snackBar.open('Permisos base sembrados', 'Cerrar', { duration: 2500 });
      this.loadData();
    } catch (error) {
      console.error('Error sembrando permisos:', error);
      this.snackBar.open('Error al sembrar permisos', 'Cerrar', { duration: 3500 });
    }
  }
}
