import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { ConfigService } from '../../core/config.service';
import { MenuService } from '../../core/menu.service';
import { AppImgPipe } from '../../core/app-img.pipe';
import { MenuSnapshot, MenuProducto, MenuCategoria } from '../../core/models';

@Component({
  selector: 'sf-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, AppImgPipe],
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
})
export class MenuPage implements OnInit, AfterViewInit, OnDestroy {
  private router = inject(Router);
  private menuSvc = inject(MenuService);
  cart = inject(CartService);
  config = inject(ConfigService);

  menu: MenuSnapshot | null = null;
  cargando = true;
  error: string | null = null;
  busqueda = '';
  categoriaActiva: number | string | null = null;

  @ViewChildren('seccion') secciones!: QueryList<ElementRef<HTMLElement>>;
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    this.menuSvc.cargar().subscribe({
      next: (m) => {
        this.menu = m;
        this.categoriaActiva = m.categorias[0]?.id ?? null;
        this.cargando = false;
        setTimeout(() => this.setupScrollSpy(), 0);
      },
      error: (e) => {
        this.error = 'No se pudo cargar la carta. ' + (e?.message || '');
        this.cargando = false;
      },
    });
  }

  ngAfterViewInit(): void {
    this.secciones.changes.subscribe(() => this.setupScrollSpy());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private setupScrollSpy(): void {
    this.observer?.disconnect();
    if (!this.secciones?.length) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset['cat'];
            if (id != null) this.categoriaActiva = this.parseId(id);
          }
        }
      },
      { rootMargin: '-120px 0px -70% 0px', threshold: 0 },
    );
    this.secciones.forEach((s) => this.observer!.observe(s.nativeElement));
  }

  private parseId(id: string): number | string {
    const n = Number(id);
    return String(n) === id ? n : id;
  }

  productosDe(cat: MenuCategoria): MenuProducto[] {
    const term = this.busqueda.trim().toUpperCase();
    return (this.menu?.productos || []).filter(
      (p) => p.categoriaId === cat.id && (!term || p.nombre.toUpperCase().includes(term)),
    );
  }

  categoriasVisibles(): MenuCategoria[] {
    if (!this.menu) return [];
    return this.menu.categorias.filter((c) => this.productosDe(c).length > 0);
  }

  irACategoria(cat: MenuCategoria): void {
    this.categoriaActiva = cat.id;
    const el = document.getElementById('cat-' + cat.id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 104;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  abrir(p: MenuProducto): void {
    this.router.navigate(['/producto', p.id]);
  }

  verCarrito(): void {
    this.router.navigate(['/carrito']);
  }

  skeletons = Array.from({ length: 6 });
}
