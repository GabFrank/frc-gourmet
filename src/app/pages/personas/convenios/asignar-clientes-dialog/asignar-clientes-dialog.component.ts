import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';

interface ClienteItem { id: number; nombre: string; documento?: string; }

@Component({
  selector: 'app-asignar-clientes-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Clientes del convenio — {{ data.convenio?.nombre }}</h2>
    <mat-dialog-content>
      <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="32"></mat-progress-spinner></div>

      <div *ngIf="!loading">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Agregar cliente</mat-label>
          <input matInput [formControl]="buscar" [matAutocomplete]="auto" placeholder="Buscar por nombre o documento" />
          <mat-icon matSuffix>person_add</mat-icon>
          <mat-autocomplete #auto="matAutocomplete" [displayWith]="displayNada" (optionSelected)="agregar($event.option.value)">
            <mat-option *ngFor="let c of filtrados" [value]="c">
              {{ c.nombre }} <small *ngIf="c.documento">· {{ c.documento }}</small>
            </mat-option>
          </mat-autocomplete>
        </mat-form-field>

        <div class="lista-head">
          <span class="hint">{{ seleccionados.length }} cliente(s) en el convenio</span>
          <mat-form-field appearance="outline" class="filtro" *ngIf="seleccionados.length > 5" subscriptSizing="dynamic">
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [formControl]="filtroSel" placeholder="Filtrar lista" />
            <button mat-icon-button matSuffix *ngIf="filtroSel.value" (click)="filtroSel.setValue('')"><mat-icon>close</mat-icon></button>
          </mat-form-field>
        </div>

        <div class="lista">
          <div class="lista-row" *ngFor="let c of seleccionadosVisibles">
            <div class="lista-info">
              <span class="lista-nombre">{{ c.nombre }}</span>
              <span class="lista-doc" *ngIf="c.documento">{{ c.documento }}</span>
            </div>
            <button mat-icon-button color="warn" (click)="quitar(c)" matTooltip="Quitar del convenio">
              <mat-icon>delete_outline</mat-icon>
            </button>
          </div>
          <div *ngIf="!seleccionados.length" class="vacio">Aun no hay clientes asignados.</div>
          <div *ngIf="seleccionados.length && !seleccionadosVisibles.length" class="vacio">Sin coincidencias.</div>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="guardar()" [disabled]="saving || loading">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .spinner { display: flex; justify-content: center; padding: 24px; }
    .full { width: 100%; min-width: 520px; }
    .lista-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 8px; }
    .hint { font-size: 12px; opacity: 0.7; white-space: nowrap; }
    .filtro { width: 220px; }
    .lista {
      max-height: 340px; overflow: auto;
      border: 1px solid var(--border-color); border-radius: 8px;
    }
    .lista-row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px 6px 14px;
      border-bottom: 1px solid var(--border-color);
    }
    .lista-row:last-child { border-bottom: none; }
    .lista-info { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
    .lista-nombre { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lista-doc { font-size: 12px; color: var(--text-secondary); }
    .vacio { padding: 18px; text-align: center; opacity: 0.6; font-size: 13px; }
  `],
})
export class AsignarClientesDialogComponent implements OnInit {
  loading = true;
  saving = false;
  buscar = new FormControl('');
  filtroSel = new FormControl('');
  todos: ClienteItem[] = [];
  filtrados: ClienteItem[] = [];
  seleccionados: ClienteItem[] = [];
  seleccionadosVisibles: ClienteItem[] = [];
  displayNada = () => '';

  constructor(
    private dialogRef: MatDialogRef<AsignarClientesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { convenio: any },
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [clientes, convenio] = await Promise.all([
        firstValueFrom(this.repo.getClientes({ activo: true })),
        firstValueFrom(this.repo.getConvenio(this.data.convenio.id)),
      ]);
      this.todos = ((clientes as any[]) || []).map((c) => this.toItem(c));
      this.seleccionados = ((convenio?.clientes as any[]) || []).map((c) => this.toItem(c));
      this.aplicarFiltro('');
      this.aplicarFiltroSel();
    } catch (e: any) {
      this.snackBar.open('Error al cargar clientes', 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
    this.buscar.valueChanges.subscribe((v) => this.aplicarFiltro(typeof v === 'string' ? v : ''));
    this.filtroSel.valueChanges.subscribe(() => this.aplicarFiltroSel());
  }

  private toItem(c: any): ClienteItem {
    return {
      id: c.id,
      nombre: c.razon_social || [c.persona?.nombre, c.persona?.apellido].filter(Boolean).join(' ') || `CLIENTE #${c.id}`,
      documento: c.ruc || c.persona?.documento || undefined,
    };
  }

  private aplicarFiltro(texto: string): void {
    const t = (texto || '').toUpperCase();
    const seleccionadosIds = new Set(this.seleccionados.map((s) => s.id));
    this.filtrados = this.todos
      .filter((c) => !seleccionadosIds.has(c.id))
      .filter((c) => !t || c.nombre.toUpperCase().includes(t) || (c.documento || '').toUpperCase().includes(t))
      .slice(0, 50);
  }

  private aplicarFiltroSel(): void {
    const t = (this.filtroSel.value || '').toUpperCase();
    this.seleccionadosVisibles = !t
      ? [...this.seleccionados]
      : this.seleccionados.filter((c) => c.nombre.toUpperCase().includes(t) || (c.documento || '').toUpperCase().includes(t));
  }

  agregar(c: ClienteItem): void {
    if (!this.seleccionados.some((s) => s.id === c.id)) this.seleccionados = [...this.seleccionados, c];
    this.buscar.setValue('');
    this.aplicarFiltro('');
    this.aplicarFiltroSel();
  }

  quitar(c: ClienteItem): void {
    this.seleccionados = this.seleccionados.filter((s) => s.id !== c.id);
    this.aplicarFiltro('');
    this.aplicarFiltroSel();
  }

  cancel(): void { this.dialogRef.close(); }

  async guardar(): Promise<void> {
    this.saving = true;
    try {
      await firstValueFrom(this.repo.setConvenioClientes({
        convenioId: this.data.convenio.id,
        clienteIds: this.seleccionados.map((s) => s.id),
      }));
      this.snackBar.open('Clientes del convenio actualizados', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    } finally {
      this.saving = false;
    }
  }
}
