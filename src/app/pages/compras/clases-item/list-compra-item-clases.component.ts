import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface FilaClase {
  id?: number;
  nombre: string;
  destino: string;
  controlaStockPorDefecto: boolean;
  orden: number;
  activo: boolean;
  guardando?: boolean;
}

/**
 * Clases de ítem de compra (PLAN-clasificacion-items-compras): qué es cada línea y
 * a dónde va su costo (CMV, reventa o gasto operativo). Sin borrar: se desactivan.
 */
@Component({
  selector: 'app-list-compra-item-clases',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule, MatSelectModule, MatInputModule,
    MatFormFieldModule, MatSlideToggleModule, MatSnackBarModule,
  ],
  templateUrl: './list-compra-item-clases.component.html',
  styleUrls: ['./list-compra-item-clases.component.scss'],
})
export class ListCompraItemClasesComponent implements OnInit {
  filas: FilaClase[] = [];
  cargando = false;
  readonly destinos = [
    { value: 'CMV', label: 'CMV (costo de ventas)' },
    { value: 'REVENTA', label: 'Reventa' },
    { value: 'GASTO_OPERATIVO', label: 'Gasto operativo' },
  ];

  constructor(private repo: RepositoryService, private snack: MatSnackBar) {}

  setData(_d: any): void {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const rows: any[] = await firstValueFrom(this.repo.getCompraItemClases({ incluirInactivas: true }));
      this.filas = (rows || []).map((r) => ({ ...r }));
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  nueva(): void {
    const orden = this.filas.reduce((m, f) => Math.max(m, Number(f.orden) || 0), 0) + 10;
    this.filas = [...this.filas, { nombre: '', destino: 'GASTO_OPERATIVO', controlaStockPorDefecto: false, orden, activo: true }];
  }

  async guardar(f: FilaClase): Promise<void> {
    if (!f.nombre?.trim()) { this.snack.open('Poné un nombre.', 'Cerrar', { duration: 3000 }); return; }
    f.guardando = true;
    const data = {
      nombre: f.nombre.trim(), destino: f.destino, controlaStockPorDefecto: !!f.controlaStockPorDefecto,
      orden: Number(f.orden) || 0, activo: !!f.activo,
    };
    try {
      const r: any = f.id
        ? await firstValueFrom(this.repo.updateCompraItemClase(f.id, data))
        : await firstValueFrom(this.repo.createCompraItemClase(data));
      Object.assign(f, r);
      this.snack.open('Clase guardada.', 'Cerrar', { duration: 2500 });
    } catch (e: any) {
      this.error(e);
    } finally {
      f.guardando = false;
    }
  }

  private error(e: any): void {
    const msg = String(e?.message || e || 'Error').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    this.snack.open(msg, 'Cerrar', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
