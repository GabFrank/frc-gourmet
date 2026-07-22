import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Type } from '@angular/core';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subscription } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { PermissionService } from 'src/app/services/permission.service';
import { TabsService } from 'src/app/services/tabs.service';
import { MENU_ENTRIES, MenuEntry } from 'src/app/services/menu-registry';

import { ListClientesComponent } from 'src/app/pages/personas/clientes/list-clientes.component';
import { ListProductosComponent } from 'src/app/pages/productos/list-productos/list-productos.component';
import { ListFuncionariosComponent } from 'src/app/pages/rrhh/funcionarios/list-funcionarios/list-funcionarios.component';
import { ListProveedoresComponent } from 'src/app/pages/compras/proveedores/list-proveedores.component';

interface ResultadoItem {
  tipo: 'MENU' | 'ENTIDAD';
  seccionKey: string;
  titulo: string;
  subtitulo?: string;
  icono: string;
  entry?: MenuEntry;      // si tipo=MENU
  id?: number;            // si tipo=ENTIDAD
}
interface Seccion {
  key: string;
  titulo: string;
  items: ResultadoItem[];
  hasMore?: boolean;
}

/** Normaliza para búsqueda: mayúsculas + sin acentos. */
function norm(s: string): string {
  return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
}

// Config de las secciones de entidad: a qué listado navega cada una.
const ENTIDAD_NAV: { [key: string]: { title: string; component: Type<any>; tabId: string } } = {
  PRODUCTOS: { title: 'Productos', component: ListProductosComponent, tabId: 'productos-tab' },
  CLIENTES: { title: 'Clientes', component: ListClientesComponent, tabId: 'clientes-tab' },
  FUNCIONARIOS: { title: 'Funcionarios', component: ListFuncionariosComponent, tabId: 'funcionarios-tab' },
  PROVEEDORES: { title: 'Proveedores', component: ListProveedoresComponent, tabId: 'proveedores-tab' },
};

@Component({
  selector: 'app-buscador-global-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatProgressBarModule,
  ],
  templateUrl: './buscador-global-dialog.component.html',
  styleUrls: ['./buscador-global-dialog.component.scss'],
})
export class BuscadorGlobalDialogComponent implements OnInit {
  @ViewChild('inputBuscar') inputBuscar!: ElementRef<HTMLInputElement>;

  readonly control = new FormControl('');
  secciones: Seccion[] = [];
  flat: ResultadoItem[] = [];
  seleccionado = 0;
  cargando = false;
  termino = '';

  private sub?: Subscription;
  private reqId = 0;

  constructor(
    private repositoryService: RepositoryService,
    private permissionService: PermissionService,
    private tabsService: TabsService,
    private matDialog: MatDialog,
    private dialogRef: MatDialogRef<BuscadorGlobalDialogComponent>,
  ) {}

  ngOnInit(): void {
    this.sub = this.control.valueChanges
      .pipe(debounceTime(280), distinctUntilChanged())
      .subscribe((v) => this.buscar(v || ''));
    setTimeout(() => this.inputBuscar?.nativeElement.focus(), 60);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private buscar(termino: string): void {
    this.termino = termino;
    const q = norm(termino.trim());
    if (q.length < 2) {
      this.secciones = [];
      this.rebuildFlat();
      this.cargando = false;
      return;
    }

    // ── Menús y Configuraciones (100% cliente) ──
    // Matching por tokens (AND): cada palabra del término debe aparecer. Así
    // "categoria de gasto" matchea "Categorías de Gasto" (independiente del
    // orden y tolerante a plural/singular por substring de cada token).
    const tokens = q.split(/\s+/).filter(Boolean);
    const menuMatches = MENU_ENTRIES.filter((e) => {
      if (e.permiso && !this.permissionService.has(e.permiso)) return false;
      const hay = norm(e.label + ' ' + (e.keywords || []).join(' ') + ' ' + (e.group || ''));
      return tokens.every((t) => hay.includes(t));
    });
    const menus = menuMatches.filter((e) => !e.esConfig).slice(0, 8);
    const configs = menuMatches.filter((e) => e.esConfig).slice(0, 8);

    const menuSeccion = (key: string, titulo: string, entries: MenuEntry[]): Seccion => ({
      key, titulo,
      items: entries.map((e) => ({
        tipo: 'MENU' as const, seccionKey: key, titulo: e.label,
        subtitulo: e.group, icono: e.icon || 'chevron_right', entry: e,
      })),
    });

    // Base con menús ya resueltos; las entidades llegan async.
    const base: Seccion[] = [];
    if (menus.length) base.push(menuSeccion('MENUS', 'Menús y submenús', menus));

    // ── Entidades (backend, un solo round-trip) ──
    this.cargando = true;
    const mine = ++this.reqId;
    this.repositoryService.buscarGlobal(termino.trim()).subscribe({
      next: (res: any) => {
        if (mine !== this.reqId) return; // respuesta obsoleta
        const secs: Seccion[] = [...base];
        const addEntidad = (key: string, titulo: string, data: any) => {
          const items = (data?.items || []).map((it: any) => ({
            tipo: 'ENTIDAD' as const, seccionKey: key, titulo: it.titulo,
            subtitulo: it.subtitulo, icono: this.iconoEntidad(key), id: it.id,
          }));
          if (items.length) secs.push({ key, titulo, items, hasMore: !!data?.hasMore });
        };
        addEntidad('PRODUCTOS', 'Productos', res?.productos);
        addEntidad('CLIENTES', 'Clientes', res?.clientes);
        addEntidad('FUNCIONARIOS', 'Funcionarios', res?.funcionarios);
        addEntidad('PROVEEDORES', 'Proveedores', res?.proveedores);
        // Configuraciones al final
        if (configs.length) secs.push(menuSeccion('CONFIG', 'Configuraciones', configs));
        this.secciones = secs;
        this.rebuildFlat();
        this.cargando = false;
      },
      error: () => {
        if (mine !== this.reqId) return;
        // Sin backend igual mostramos menús/config.
        const secs = [...base];
        if (configs.length) secs.push(menuSeccion('CONFIG', 'Configuraciones', configs));
        this.secciones = secs;
        this.rebuildFlat();
        this.cargando = false;
      },
    });
  }

  private iconoEntidad(key: string): string {
    switch (key) {
      case 'PRODUCTOS': return 'inventory_2';
      case 'CLIENTES': return 'people';
      case 'FUNCIONARIOS': return 'badge';
      case 'PROVEEDORES': return 'local_shipping';
      default: return 'chevron_right';
    }
  }

  private rebuildFlat(): void {
    this.flat = this.secciones.reduce((acc, s) => acc.concat(s.items), [] as ResultadoItem[]);
    this.seleccionado = this.flat.length ? 0 : -1;
  }

  esSeleccionado(item: ResultadoItem): boolean {
    return this.flat[this.seleccionado] === item;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') { this.dialogRef.close(); return; }
    if (!this.flat.length) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.seleccionado = (this.seleccionado + 1) % this.flat.length;
      this.scrollAlSeleccionado();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.seleccionado = (this.seleccionado - 1 + this.flat.length) % this.flat.length;
      this.scrollAlSeleccionado();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const item = this.flat[this.seleccionado];
      if (item) this.activar(item);
    }
  }

  private scrollAlSeleccionado(): void {
    setTimeout(() => {
      const el = document.querySelector('.bg-item.seleccionado');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  activar(item: ResultadoItem): void {
    if (item.tipo === 'MENU' && item.entry) {
      const e = item.entry;
      if (e.openMode === 'dialog') {
        // Lanzador de diálogo: cerramos el buscador y abrimos el diálogo destino.
        this.dialogRef.close();
        this.matDialog.open(e.component, { ...(e.dialogConfig || {}), data: e.data || {} });
        return;
      }
      this.tabsService.openTab(e.title, e.component, e.data || {}, e.tabId, true);
    } else if (item.tipo === 'ENTIDAD') {
      const nav = ENTIDAD_NAV[item.seccionKey];
      if (nav) {
        this.tabsService.openTab(
          nav.title, nav.component,
          { source: 'buscador', focusId: item.id, buscarTermino: this.termino },
          nav.tabId, true,
        );
      }
    }
    this.dialogRef.close();
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
