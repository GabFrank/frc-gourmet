import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface DialogData {
  role: any;
  permisos: any[];
}

@Component({
  selector: 'app-assign-permisos-role-dialog',
  templateUrl: './assign-permisos-role-dialog.component.html',
  styleUrls: ['./assign-permisos-role-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatExpansionModule,
  ],
})
export class AssignPermisosRoleDialogComponent implements OnInit {
  loading = false;
  saving = false;
  // Mapa codigo -> { permiso, asignado }
  porModulo: Array<{ modulo: string; items: Array<{ permiso: any; asignado: boolean }> }> = [];

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<AssignPermisosRoleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
  ) {}

  ngOnInit(): void {
    this.loadAsignaciones();
  }

  async loadAsignaciones(): Promise<void> {
    this.loading = true;
    try {
      const asignaciones = await firstValueFrom(
        this.repositoryService.getRolePermissions(this.data.role.id),
      );
      const idsAsignados = new Set<number>(
        (asignaciones || []).map((rp: any) => rp?.permission?.id).filter(Boolean),
      );

      // Agrupar por modulo
      const grupos = new Map<string, Array<{ permiso: any; asignado: boolean }>>();
      for (const p of this.data.permisos || []) {
        if (!p?.activo) continue;
        const mod = p.modulo || 'OTRO';
        if (!grupos.has(mod)) grupos.set(mod, []);
        grupos.get(mod)!.push({ permiso: p, asignado: idsAsignados.has(p.id) });
      }
      this.porModulo = Array.from(grupos.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([modulo, items]) => ({
          modulo,
          items: items.sort((x, y) => x.permiso.codigo.localeCompare(y.permiso.codigo)),
        }));
    } catch (error) {
      console.error('Error cargando asignaciones del rol:', error);
      this.snackBar.open('Error al cargar permisos del rol', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  toggleModulo(grupo: { modulo: string; items: Array<{ permiso: any; asignado: boolean }> }, valor: boolean): void {
    grupo.items.forEach((it) => (it.asignado = valor));
  }

  contarAsignados(grupo: { items: Array<{ asignado: boolean }> }): number {
    return grupo.items.filter((i) => i.asignado).length;
  }

  cerrar(): void {
    this.dialogRef.close({ saved: false });
  }

  async guardar(): Promise<void> {
    this.saving = true;
    try {
      const ids: number[] = [];
      for (const g of this.porModulo) {
        for (const it of g.items) {
          if (it.asignado) ids.push(it.permiso.id);
        }
      }
      await firstValueFrom(this.repositoryService.setRolePermissions(this.data.role.id, ids));
      this.dialogRef.close({ saved: true });
    } catch (error) {
      console.error('Error guardando asignaciones:', error);
      this.snackBar.open('Error al guardar asignaciones', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
