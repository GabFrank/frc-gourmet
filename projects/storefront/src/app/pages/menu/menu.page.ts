import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuEstadoService } from '../../core/menu-estado.service';
import { CartService } from '../../core/cart.service';
import { ConfigService } from '../../core/config.service';
import { MenuService } from '../../core/menu.service';
import { AppImgPipe } from '../../core/app-img.pipe';
import { IconComponent } from '../../core/icon.component';
import { MenuSnapshot, MenuProducto, MenuCategoria } from '../../core/models';
import { GuaraniPipe } from '../../core/guarani.pipe';
import { PrecioPipe } from '../../core/precio.pipe';
import { mensajeError } from '../../core/errores';
import { MenuCard, CatView, agruparPorCategoria } from '../../core/menu-agrupar';

@Component({
  selector: 'sf-menu',
  standalone: true,
  imports: [GuaraniPipe, PrecioPipe, CommonModule, FormsModule, AppImgPipe, IconComponent],
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
})
export class MenuPage implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private menuSvc = inject(MenuService);
  private estado = inject(MenuEstadoService);
  cart = inject(CartService);
  config = inject(ConfigService);

  menu: MenuSnapshot | null = null;
  cargando = true;
  error: string | null = null;
  busqueda = '';
  categoriaActiva: number | string | null = null;

  private allCards: MenuCard[] = [];
  /** Todas las categorías con productos (las pestañas). */
  categoriasView: CatView[] = [];
  /** Lo que se lista: la categoría elegida, o los resultados de la búsqueda en toda la carta. */
  tarjetasVisibles: MenuCard[] = [];

  ngOnInit(): void {
    this.menuSvc.cargar().subscribe({
      next: (m) => {
        this.menu = m;
        this.allCards = this.construirCards(m.productos);
        this.categoriasView = agruparPorCategoria(m.categorias, this.allCards);
        // ?cat= de la URL > la última elegida > la primera. Una que ya no existe cae en la primera.
        const pedida = this.route.snapshot.queryParamMap.get('cat') ?? this.estado.categoria;
        const existe = this.categoriasView.find((cv) => String(cv.cat.id) === pedida);
        this.categoriaActiva = (existe ?? this.categoriasView[0])?.cat.id ?? null;
        this.recomputarVista();
        this.cargando = false;
        // Volver a la altura donde estaba el cliente en esta categoría.
        const y = existe ? this.estado.scrollDe(String(existe.cat.id)) : 0;
        setTimeout(() => {
          window.scrollTo({ top: y });
          // La barra de categorías deja a la vista la elegida (al volver de un producto).
          document.querySelector('.sf-chip.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
        }, 0);
      },
      error: (e) => {
        this.error = mensajeError(e, 'No se pudo cargar la carta. Probá de nuevo.');
        this.cargando = false;
      },
    });
  }

  ngOnDestroy(): void {
    this.recordarPosicion();
  }

  get buscando(): boolean {
    return this.busqueda.trim().length > 0;
  }

  get categoriaActivaNombre(): string {
    return this.categoriasView.find((cv) => cv.cat.id === this.categoriaActiva)?.cat.nombre ?? '';
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

  /** Lista la categoría elegida o, si hay búsqueda, lo que coincide en toda la carta (sin repetidos). */
  recomputarVista(): void {
    const term = this.busqueda.trim().toUpperCase();
    if (term) {
      this.tarjetasVisibles = this.allCards.filter((c) => c.titulo.toUpperCase().includes(term));
      return;
    }
    this.tarjetasVisibles = this.categoriasView.find((cv) => cv.cat.id === this.categoriaActiva)?.cards ?? [];
  }

  elegirCategoria(cat: MenuCategoria): void {
    this.recordarPosicion();
    this.categoriaActiva = cat.id;
    this.busqueda = '';
    this.recomputarVista();
    this.estado.guardar(String(cat.id), this.estado.scrollDe(String(cat.id)));
    this.router.navigate([], { queryParams: { cat: String(cat.id) }, replaceUrl: true });
    window.scrollTo({ top: 0 });
  }

  private recordarPosicion(): void {
    if (this.categoriaActiva != null && !this.buscando) {
      this.estado.guardar(String(this.categoriaActiva), window.scrollY);
    }
  }

  abrir(card: MenuCard): void {
    this.recordarPosicion();
    if (card.saborId != null) this.router.navigate(['/pizza', card.productoId, card.saborId]);
    else this.router.navigate(['/producto', card.productoId]);
  }

  verCarrito(): void {
    this.recordarPosicion();
    this.router.navigate(['/carrito']);
  }

  skeletons = Array.from({ length: 6 });
}
