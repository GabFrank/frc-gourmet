import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatListModule } from '@angular/material/list';
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
    MatListModule,
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
          <mat-autocomplete #auto="matAutocomplete" [displayWith]="displayNada" (optionSelected)="agregar($event.option.value)">
            <mat-option *ngFor="let c of filtrados" [value]="c">{{ c.nombre }} <small *ngIf="c.documento">· {{ c.documento }}</small></mat-option>
          </mat-autocomplete>
        </mat-form-field>

        <div class="hint">{{ seleccionados.length }} cliente(s) en el convenio</div>
        <mat-list class="lista">
          <mat-list-item *ngFor="let c of seleccionados">
            <span matListItemTitle>{{ c.nombre }}</span>
            <span matListItemLine *ngIf="c.documento">{{ c.documento }}</span>
            <button mat-icon-button color="warn" (click)="quitar(c)"><mat-icon>close</mat-icon></button>
          </mat-list-item>
          <div *ngIf="!seleccionados.length" class="vacio">Aun no hay clientes asignados.</div>
        </mat-list>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="guardar()" [disabled]="saving || loading">Guardar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .spinner { display: flex; justify-content: center; padding: 24px; }
    .full { width: 100%; min-width: 480px; }
    .hint { font-size: 12px; opacity: 0.7; margin: 4px 0; }
    .lista { max-height: 320px; overflow: auto; border: 1px solid var(--border-color); border-radius: 8px; }
    .lista mat-list-item button { margin-left: auto; }
    .vacio { padding: 16px; text-align: center; opacity: 0.6; font-size: 13px; }
  `],
})
export class AsignarClientesDialogComponent implements OnInit {
  loading = true;
  saving = false;
  buscar = new FormControl('');
  todos: ClienteItem[] = [];
  filtrados: ClienteItem[] = [];
  seleccionados: ClienteItem[] = [];
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
    } catch (e: any) {
      this.snackBar.open('Error al cargar clientes', 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
    this.buscar.valueChanges.subscribe((v) => this.aplicarFiltro(typeof v === 'string' ? v : ''));
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

  agregar(c: ClienteItem): void {
    if (!this.seleccionados.some((s) => s.id === c.id)) this.seleccionados = [...this.seleccionados, c];
    this.buscar.setValue('');
    this.aplicarFiltro('');
  }

  quitar(c: ClienteItem): void {
    this.seleccionados = this.seleccionados.filter((s) => s.id !== c.id);
    this.aplicarFiltro('');
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
