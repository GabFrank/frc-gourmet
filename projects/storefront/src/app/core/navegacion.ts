/** Pantalla a la que vuelve cada una, como en las apps de delivery: el checkout al carrito, el resto a la carta. */
export function destinoAtras(url: string): string | null {
  const ruta = url.split('?')[0].split('#')[0];
  if (ruta === '/' || ruta === '' || ruta.startsWith('/producto/') || ruta.startsWith('/pizza/')) return null;
  if (ruta.startsWith('/checkout')) return '/carrito';
  return '/';
}
