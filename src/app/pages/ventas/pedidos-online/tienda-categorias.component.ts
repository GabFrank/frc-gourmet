import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { RepositoryService } from '../../../database/repository.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';

interface ProdCat { productoId: number; nombre: string; }
interface CatEdit { id?: number; nombre: string; activo: boolean; productos: ProdCat[]; }

/**
 * Tienda online F6: categorías propias de la carta («Entradas», «Promos»…), su orden y qué
 * productos muestra cada una. Mientras no haya ninguna activa, la tienda agrupa por familia.
 */
@Component({
  selector: 'app-tienda-categorias',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSlideToggleModule, MatButtonModule, MatIconModule, MatSnackBarModule, MatDialogModule,
  ],
  template: `
    <div class="tc-container">
      <div class="header">
        <h2>Categorías de la Tienda</h2>
        <button mat-flat-button color="primary" (click)="nueva()"><mat-icon>add</mat-icon> Nueva categoría</button>
      </div>
      <p class="muted">Son las pestañas de la tienda online, en este orden. Un producto puede estar en varias.
        Los productos online que no estén en ninguna salen al final, en «Otros». Sin categorías, la tienda agrupa por familia.</p>

      <mat-card class="form-card" *ngIf="editando">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nombre</mat-label>
          <input matInput [(ngModel)]="editando.nombre" maxlength="80" placeholder="Ej: ENTRADAS">
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="editando.activo" color="primary">Activa (se muestra en la tienda)</mat-slide-toggle>

        <h3>Productos ({{ editando.productos.length }})</h3>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Agregar producto</mat-label>
          <input matInput [(ngModel)]="busqueda" (ngModelChange)="buscar$.next($event)" placeholder="Escribí parte del nombre">
        </mat-form-field>
        <div class="resultados" *ngIf="resultados.length">
          <button mat-stroked-button *ngFor="let p of resultados" (click)="agregar(p)" [disabled]="yaEsta(p.id)">
            <mat-icon>add</mat-icon> {{ p.nombre }}<span class="no-online" *ngIf="!p.disponibleOnline"> (no está online)</span>
          </button>
        </div>
        <div class="fila" *ngFor="let p of editando.productos; let i = index; let last = last">
          <span class="nombre">{{ i + 1 }}. {{ p.nombre }}</span>
          <button mat-icon-button (click)="mover(editando.productos, i, -1)" [disabled]="i === 0" aria-label="Subir"><mat-icon>arrow_upward</mat-icon></button>
          <button mat-icon-button (click)="mover(editando.productos, i, 1)" [disabled]="last" aria-label="Bajar"><mat-icon>arrow_downward</mat-icon></button>
          <button mat-icon-button color="warn" (click)="editando.productos.splice(i, 1)" aria-label="Quitar"><mat-icon>close</mat-icon></button>
        </div>
        <div class="actions">
          <button mat-button (click)="editando = null">Cancelar</button>
          <button mat-flat-button color="primary" [disabled]="guardando" (click)="guardar()">Guardar</button>
        </div>
      </mat-card>

      <p class="muted" *ngIf="cargando">Cargando…</p>
      <p class="muted" *ngIf="!cargando && !categorias.length">Todavía no hay categorías: la tienda agrupa por familia.</p>
      <mat-card class="fila cat" *ngFor="let c of categorias; let i = index; let last = last">
        <span class="nombre">{{ c.nombre }} <span class="muted">· {{ c.productos.length }} productos<span *ngIf="!c.activo"> · inactiva</span></span></span>
        <button mat-icon-button (click)="moverCategoria(i, -1)" [disabled]="i === 0" aria-label="Subir"><mat-icon>arrow_upward</mat-icon></button>
        <button mat-icon-button (click)="moverCategoria(i, 1)" [disabled]="last" aria-label="Bajar"><mat-icon>arrow_downward</mat-icon></button>
        <button mat-icon-button (click)="editar(c)" aria-label="Editar"><mat-icon>edit</mat-icon></button>
        <button mat-icon-button color="warn" (click)="eliminar(c)" aria-label="Eliminar"><mat-icon>delete</mat-icon></button>
      </mat-card>
    </div>
  `,
  styles: [`
    .tc-container { padding: 16px; max-width: 860px; }
    .header { display: flex; align-items: center; justify-content: space-between; }
    .muted { opacity: .7; }
    .full { width: 100%; }
    .form-card { margin: 12px 0; padding: 16px; }
    .resultados { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .no-online { opacity: .6; font-size: 12px; }
    .fila { display: flex; align-items: center; gap: 4px; padding: 2px 8px; }
    .fila.cat { margin-bottom: 8px; }
    .fila .nombre { flex: 1; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  `],
})
export class TiendaCategoriasComponent implements OnInit {
  private repo = inject(RepositoryService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  categorias: any[] = [];
  cargando = false;
  guardando = false;
  editando: CatEdit | null = null;
  busqueda = '';
  resultados: any[] = [];
  buscar$ = new Subject<string>();

  ngOnInit(): void {
    this.cargar();
    this.buscar$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((t) => this.repo.searchProductosByNombre((t || '').trim(), 'venta')),
    ).subscribe({
      next: (r: any[]) => (this.resultados = (this.busqueda.trim().length >= 2 ? r || [] : []).slice(0, 15)),
      error: () => (this.resultados = []),
    });
  }

  cargar(): void {
    this.cargando = true;
    this.repo.getTiendaCategoriasAdmin().subscribe({
      next: (c) => { this.categorias = c || []; this.cargando = false; },
      error: (e) => { this.cargando = false; this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }); },
    });
  }

  nueva(): void {
    this.editando = { nombre: '', activo: true, productos: [] };
  }

  editar(c: any): void {
    this.editando = { id: c.id, nombre: c.nombre, activo: c.activo, productos: (c.productos || []).map((p: any) => ({ ...p })) };
  }

  yaEsta(id: number): boolean {
    return !!this.editando?.productos.some((p) => p.productoId === id);
  }

  agregar(p: any): void {
    if (!this.editando || this.yaEsta(p.id)) return;
    this.editando.productos.push({ productoId: p.id, nombre: p.nombre });
  }

  mover<T>(lista: T[], i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }

  guardar(): void {
    if (!this.editando?.nombre?.trim()) { this.snack.open('Ingresá un nombre', 'OK', { duration: 2500 }); return; }
    this.guardando = true;
    const e = this.editando;
    this.repo.guardarTiendaCategoria({ id: e.id, nombre: e.nombre, activo: e.activo, productoIds: e.productos.map((p) => p.productoId) }).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) { this.editando = null; this.cargar(); this.snack.open('Categoría guardada', 'OK', { duration: 2000 }); }
        else this.snack.open('No se pudo guardar: ' + (res?.error || ''), 'OK', { duration: 3000 });
      },
      error: (err) => { this.guardando = false; this.snack.open('Error: ' + (err?.message || ''), 'OK', { duration: 3000 }); },
    });
  }

  moverCategoria(i: number, d: number): void {
    this.mover(this.categorias, i, d);
    this.repo.reordenarTiendaCategorias(this.categorias.map((c) => c.id)).subscribe({
      error: (e) => { this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }); this.cargar(); },
    });
  }

  eliminar(c: any): void {
    this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar categoría', message: `¿Eliminar «${c.nombre}»? Los productos no se borran: solo salen de esta pestaña.` },
    }).afterClosed().subscribe((ok) => {
      if (!ok) return;
      this.repo.eliminarTiendaCategoria(c.id).subscribe({
        next: () => { this.cargar(); this.snack.open('Categoría eliminada', 'OK', { duration: 2000 }); },
        error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }),
      });
    });
  }
}
