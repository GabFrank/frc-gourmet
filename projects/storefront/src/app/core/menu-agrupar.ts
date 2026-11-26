/** Agrupado de la carta en pestañas (sin Angular, para probarlo con ts-node). */
import { MenuCategoria } from './models';

/** Tarjeta del menú. Una pizza se expande en una tarjeta POR SABOR (tipo iFood). */
export interface MenuCard {
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

/** Arma qué tarjetas muestra cada categoría. Exportada para probarla sin el componente. */
export function agruparPorCategoria(categorias: MenuCategoria[], cards: MenuCard[]): CatView[] {
  const vista: CatView[] = [];
  for (const cat of categorias) {
    let delaCat: MenuCard[];
    if (Array.isArray(cat.productoIds)) {
      // Categoría de la tienda: sus productos en el orden configurado.
      delaCat = [];
      for (const pid of cat.productoIds) delaCat.push(...cards.filter((c) => c.productoId === pid));
    } else {
      delaCat = cards.filter((c) => c.categoriaId === cat.id);
    }
    // Las categorías vacías no se muestran.
    if (delaCat.length) vista.push({ cat, cards: delaCat });
  }
  return vista;
}

export interface CatView {
  cat: MenuCategoria;
  cards: MenuCard[];
}
