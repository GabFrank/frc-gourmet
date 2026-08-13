import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { ConfigService } from '../../core/config.service';
import { MenuService } from '../../core/menu.service';
import { AppImgPipe } from '../../core/app-img.pipe';
import { IconComponent } from '../../core/icon.component';
import { MenuSnapshot, MenuProducto, MenuCategoria } from '../../core/models';

/** Tarjeta del menú. Una pizza se expande en una tarjeta POR SABOR (tipo iFood). */
interface MenuCard {
  productoId: number;
  saborId: number | null;
  titulo: string;
  descripcion: string | null;
  imageUrl: string | null;
  precioDesde: number;
  monedaSimbolo: string;
  desde: boolean;
  categoriaId: number | string;
}

interface CatView {
  cat: MenuCategoria;
  cards: MenuCard[];
}

@Component({
  selector: 'sf-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, AppImgPipe, IconComponent],
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

  private allCards: MenuCard[] = [];
  categoriasView: CatView[] = [];

  @ViewChildren('seccion') secciones!: QueryList<ElementRef<HTMLElement>>;
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    this.menuSvc.cargar().subscribe({
      next: (m) => {
        this.menu = m;
        this.allCards = this.construirCards(m.productos);
        this.recomputarVista();
        this.categoriaActiva = this.categoriasView[0]?.cat.id ?? null;
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

  private construirCards(productos: MenuProducto[]): MenuCard[] {
    const cards: MenuCard[] = [];
    for (const p of productos) {
      const simbolo = p.moneda?.simbolo || '';
      if (p.esPizza && p.sabores?.length) {
        // Una tarjeta por sabor: "Pizza Calabresa", "Pizza Bacon"…
        const desde = (p.tamanos?.length || 0) > 1;
        for (const s of p.sabores) {
          cards.push({
            productoId: p.id,
            saborId: s.saborId,
            titulo: `${p.nombre} ${s.nombre}`.trim(),
            descripcion: s.descripcion,
            imageUrl: s.imageUrl || p.imageUrl,
            precioDesde: s.precioDesde,
            monedaSimbolo: simbolo,
            desde,
            categoriaId: p.categoriaId,
          });
        }
      } else {
        cards.push({
          productoId: p.id,
          saborId: null,
          titulo: p.nombre,
          descripcion: p.descripcion,
          imageUrl: p.imageUrl,
          precioDesde: p.precioDesde,
          monedaSimbolo: simbolo,
          desde: p.opciones.length > 1,
          categoriaId: p.categoriaId,
        });
      }
    }
    return cards;
  }

  /** Filtra por búsqueda y reagrupa por categoría (búsqueda en vivo, sin funciones en template). */
  recomputarVista(): void {
    if (!this.menu) { this.categoriasView = []; return; }
    const term = this.busqueda.trim().toUpperCase();
    const filtradas = term ? this.allCards.filter((c) => c.titulo.toUpperCase().includes(term)) : this.allCards;
    const vista: CatView[] = [];
    for (const cat of this.menu.categorias) {
      const cards = filtradas.filter((c) => c.categoriaId === cat.id);
      if (cards.length) vista.push({ cat, cards });
    }
    this.categoriasView = vista;
    setTimeout(() => this.setupScrollSpy(), 0);
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

  irACategoria(cat: MenuCategoria): void {
    this.categoriaActiva = cat.id;
    const el = document.getElementById('cat-' + cat.id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 104;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  abrir(card: MenuCard): void {
    if (card.saborId != null) this.router.navigate(['/pizza', card.productoId, card.saborId]);
    else this.router.navigate(['/producto', card.productoId]);
  }

  verCarrito(): void {
    this.router.navigate(['/carrito']);
  }

  skeletons = Array.from({ length: 6 });
}
