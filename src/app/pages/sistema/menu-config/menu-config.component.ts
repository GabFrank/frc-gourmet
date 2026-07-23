import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { MenuService } from 'src/app/services/menu.service';
import { MENU_TREE, MenuNode, esHoja, OverrideMap } from 'src/app/services/menu-tree';

/** Fila plana del árbol para la tabla de configuración. */
interface Fila {
  id: string;
  label: string;
  icon: string;
  depth: number;
  esRama: boolean;
  pad: number;            // padding-left precomputado (indentación)
  defSidenav: boolean;
  defBuscador: boolean;   // solo aplica a hojas
  // Valores editables (efectivos = default ∪ override)
  enSidenav: boolean;
  enBuscador: boolean;
  orden: number | null;
}

/**
 * Config del menú para el ADMIN: muestra todo el árbol (`MENU_TREE`) con toggles
 * de visibilidad en sidenav / buscador y orden. Persiste overrides por id de
 * nodo. Requiere `SISTEMA_MENU_CONFIGURAR`.
 */
@Component({
  selector: 'app-menu-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatSlideToggleModule, MatInputModule, MatFormFieldModule, MatTooltipModule,
    MatSnackBarModule, MatProgressBarModule,
  ],
  templateUrl: './menu-config.component.html',
  styleUrls: ['./menu-config.component.scss'],
})
export class MenuConfigComponent implements OnInit {
  filas: Fila[] = [];
  cargando = false;
  guardando = false;

  constructor(
    private menuService: MenuService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cargando = true;
    // Recargar overrides frescos y luego construir las filas.
    this.menuService.loadOverrides().subscribe(() => {
      this.construirFilas(this.menuService.getOverridesSnapshot());
      this.cargando = false;
    });
  }

  private construirFilas(ov: OverrideMap): void {
    const filas: Fila[] = [];
    const walk = (nodes: MenuNode[], depth: number) => {
      for (const n of nodes) {
        const hoja = esHoja(n);
        const o = ov[n.id] || {};
        const defSidenav = n.enSidenav !== false;
        const defBuscador = hoja ? n.enBuscador !== false : false;
        filas.push({
          id: n.id,
          label: n.label,
          icon: n.icon || (hoja ? 'chevron_right' : 'folder'),
          depth,
          pad: 8 + depth * 20,
          esRama: !hoja,
          defSidenav,
          defBuscador,
          enSidenav: o.enSidenav === true || o.enSidenav === false ? o.enSidenav : defSidenav,
          enBuscador: o.enBuscador === true || o.enBuscador === false ? o.enBuscador : defBuscador,
          orden: o.orden === null || o.orden === undefined ? null : o.orden,
        });
        if (!hoja) walk(n.children || [], depth + 1);
      }
    };
    walk(MENU_TREE, 0);
    this.filas = filas;
  }

  restaurar(): void {
    // Volver todo a los defaults del árbol (sin overrides).
    this.filas = this.filas.map((f) => ({
      ...f,
      enSidenav: f.defSidenav,
      enBuscador: f.defBuscador,
      orden: null,
    }));
  }

  guardar(): void {
    this.guardando = true;
    // Enviar todas las filas; el backend guarda solo las que difieren del
    // default y borra las que vuelven al default.
    const items = this.filas.map((f) => ({
      nodeId: f.id,
      enSidenav: f.enSidenav === f.defSidenav ? null : f.enSidenav,
      enBuscador: f.esRama || f.enBuscador === f.defBuscador ? null : f.enBuscador,
      orden: f.orden === null || f.orden === undefined || (f.orden as any) === '' ? null : Number(f.orden),
    }));
    this.menuService.saveOverrides(items).subscribe({
      next: () => {
        this.guardando = false;
        this.snackBar.open('Configuración del menú guardada.', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.guardando = false;
        console.error('Error guardando config de menú:', err);
        this.snackBar.open('No se pudo guardar la configuración.', 'CERRAR', { duration: 4000 });
      },
    });
  }
}
