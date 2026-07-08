import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../database/repository.service';
import { ConfirmationDialogComponent } from '../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { SectorFormDialogComponent } from '../../shared/components/pdv-mesa-dialog/sector-form-dialog/sector-form-dialog.component';

interface SectorImpresoraView {
  id: number;
  sector: { id: number; nombre: string };
  printer: { id: number; name: string };
  rol: string;
  activo: boolean;
  observacion?: string;
}

const ROLES = [
  { value: 'COMANDA', label: 'Comanda (cocina/bar)' },
  { value: 'TICKET_VENTA', label: 'Ticket de venta' },
  { value: 'PRECUENTA', label: 'Pre-cuenta' },
];

/**
 * Dialog de configuración para la M2M `Sector ↔ Printer` con rol.
 *
 * Permite al admin/gerente definir qué impresora(s) reciben las comandas,
 * tickets de venta y pre-cuentas de cada sector. Sin esta configuración los
 * tickets multi-sector caen en error "Sector X sin impresoras configuradas".
 *
 * Usa `callIpc` directo para CRUD M2M en lugar de declarar 5 wrappers en
 * RepositoryService — el endpoint `/api/rpc` los rutea automáticamente en
 * modo cliente HTTP.
 */
@Component({
  selector: 'app-sectores-impresoras-settings',
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
    MatMenuModule,
    MatTableModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  templateUrl: './sectores-impresoras-settings.component.html',
  styleUrls: ['./sectores-impresoras-settings.component.scss'],
})
export class SectoresImpresorasSettingsComponent implements OnInit {

  rows: SectorImpresoraView[] = [];
  sectores: { id: number; nombre: string }[] = [];
  printers: { id: number; name: string }[] = [];

  form: FormGroup;
  editingId: number | null = null;
  loading = false;
  saving = false;

  displayedColumns = ['sector', 'rol', 'printer', 'activo', 'observacion', 'actions'];
  readonly roles = ROLES;

  constructor(
    public dialogRef: MatDialogRef<SectoresImpresorasSettingsComponent>,
    private fb: FormBuilder,
    private repository: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      sectorId: [null, Validators.required],
      printerId: [null, Validators.required],
      rol: ['COMANDA', Validators.required],
      activo: [true],
      observacion: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.cargarSectores(),
      this.cargarPrinters(),
      this.cargarRows(),
    ]);
  }

  private get api(): any {
    return (window as any).api;
  }

  private async cargarSectores(): Promise<void> {
    try {
      // Solo sectores de IMPRESION (cocina/barra): a estos se les asignan
      // impresoras. Los sectores de MESA se gestionan en el ABM de mesas.
      const data = await firstValueFrom(this.repository.getSectoresActivos('IMPRESION'));
      this.sectores = (data || []).map((s: any) => ({ id: s.id, nombre: s.nombre }));
    } catch (e) {
      console.error('Error getSectoresActivos:', e);
    }
  }

  /** Crea un sector de IMPRESION (cocina/barra) — su propio lugar de creación. */
  crearSectorImpresion(): void {
    const ref = this.dialog.open(SectorFormDialogComponent, { width: '400px', data: {} });
    ref.afterClosed().subscribe(async (result: any) => {
      if (!result?.nombre) return;
      try {
        await firstValueFrom(this.repository.createSector({ ...result, tipo: 'IMPRESION' } as any));
        this.snackBar.open('Sector de impresión creado', 'Cerrar', { duration: 2000 });
        await this.cargarSectores();
      } catch (e: any) {
        console.error('Error creando sector de impresión:', e);
        this.snackBar.open(e?.message || 'Error al crear sector', 'Cerrar', { duration: 3000 });
      }
    });
  }

  private async cargarPrinters(): Promise<void> {
    try {
      const data: any[] = await this.api.getPrinters();
      this.printers = (data || []).map(p => ({ id: p.id, name: p.name }));
    } catch (e) {
      console.error('Error getPrinters:', e);
    }
  }

  private async cargarRows(): Promise<void> {
    this.loading = true;
    try {
      const data = await this.api.callIpc('get-sectores-impresoras');
      this.rows = (data || []).map((r: any) => ({
        id: r.id,
        sector: { id: r.sector?.id, nombre: r.sector?.nombre || '—' },
        printer: { id: r.printer?.id, name: r.printer?.name || '—' },
        rol: r.rol,
        activo: r.activo,
        observacion: r.observacion,
      }));
    } catch (e: any) {
      console.error('Error get-sectores-impresoras:', e);
      this.snackBar.open('Error al cargar configuración', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  resetForm(): void {
    this.editingId = null;
    this.form.reset({
      sectorId: null,
      printerId: null,
      rol: 'COMANDA',
      activo: true,
      observacion: '',
    });
  }

  editar(row: SectorImpresoraView): void {
    this.editingId = row.id;
    this.form.patchValue({
      sectorId: row.sector.id,
      printerId: row.printer.id,
      rol: row.rol,
      activo: row.activo,
      observacion: row.observacion || '',
    });
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const payload = this.form.value;
    try {
      if (this.editingId == null) {
        await this.api.callIpc('create-sector-impresora', payload);
        this.snackBar.open('Asignación creada', 'Cerrar', { duration: 2000 });
      } else {
        await this.api.callIpc('update-sector-impresora', this.editingId, payload);
        this.snackBar.open('Asignación actualizada', 'Cerrar', { duration: 2000 });
      }
      this.resetForm();
      await this.cargarRows();
    } catch (e: any) {
      console.error('Error guardar sector-impresora:', e);
      this.snackBar.open(e?.message || 'Error al guardar', 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  async toggleActivo(row: SectorImpresoraView): Promise<void> {
    try {
      await this.api.callIpc('update-sector-impresora', row.id, { activo: !row.activo });
      await this.cargarRows();
    } catch (e: any) {
      console.error('Error toggle activo:', e);
      this.snackBar.open(e?.message || 'Error al actualizar', 'Cerrar', { duration: 3000 });
    }
  }

  eliminar(row: SectorImpresoraView): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar asignación',
        message: `¿Eliminar "${row.sector.nombre} → ${row.printer.name} (${this.rolLabel(row.rol)})"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    ref.afterClosed().subscribe(async (confirm: boolean) => {
      if (!confirm) return;
      try {
        await this.api.callIpc('delete-sector-impresora', row.id);
        this.snackBar.open('Asignación eliminada', 'Cerrar', { duration: 2000 });
        await this.cargarRows();
      } catch (e: any) {
        console.error('Error delete-sector-impresora:', e);
        this.snackBar.open(e?.message || 'Error al eliminar', 'Cerrar', { duration: 3000 });
      }
    });
  }

  rolLabel(rol: string): string {
    return this.roles.find(r => r.value === rol)?.label || rol;
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
