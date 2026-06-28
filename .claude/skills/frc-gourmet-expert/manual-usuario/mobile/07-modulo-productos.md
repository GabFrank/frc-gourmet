# Módulo Productos

Entrás tocando **Productos** (📦) en la navegación. Te permite **gestionar la estructura de
categorías** (familias, subfamilias) y los **adicionales**, y **consultar** el catálogo de
productos.

> Repasá [Cómo usar las listas y los formularios](03-como-usar-listas-y-formularios.md) para el uso general de listas.

---

## A. Lo que podés gestionar

### Familias

El primer nivel de categorías de productos (BEBIDAS, COMIDAS, POSTRES…).

- **Campos:** Nombre, Activo.
- **Permiso:** `CATEGORIAS_GESTIONAR`.

### Subfamilias

El segundo nivel, **dentro de una familia** (por ejemplo, dentro de BEBIDAS:
GASEOSAS, JUGOS, CERVEZAS).

- **Campos:** Nombre, **Familia** a la que pertenece (se elige de la lista), Activo.
- **Permiso:** `CATEGORIAS_GESTIONAR`.
- Para crear subfamilias primero tiene que existir la **Familia**.

### Adicionales

Los extras que se pueden sumar a un producto (EXTRA QUESO, SIN CEBOLLA, etc.).

- **Campos:** Nombre y, según corresponda, su precio/estado.
- **Permiso:** `ADICIONALES_GESTIONAR`.

---

## B. Sub-módulos de solo consulta

### Productos

El catálogo de productos del negocio. Cada tarjeta muestra:

- La **imagen** del producto (si tiene).
- El **nombre**.
- El **tipo**.
- La etiqueta **Activo / Inactivo**.

Podés buscar por nombre con el filtro. Es una vista de consulta: el alta y la edición
completa de un producto (con sus presentaciones, precios de venta y de costo, recetas,
etc.) se hacen en el **escritorio**, porque involucran varias pantallas relacionadas.

---

## C. Lo que todavía no está (aparece como "pronto")

- **Recetas** — la gestión de recetas no está en mobile.
- **Sabores** — la gestión de sabores y variaciones (por ejemplo, pizzas multi-sabor) no
  está en mobile.

Ambas se manejan en el escritorio. Ver [Qué falta en mobile](10-limitaciones-y-version-escritorio.md).

---

## Errores comunes

- **No veo las imágenes de los productos:** puede ser un problema temporal de conexión con
  el servidor (las imágenes se traen desde la PC del local). Si persiste, avisá a soporte.
- **Quiero cambiar el precio de un producto:** los precios se editan en el escritorio.
- **Creé una subfamilia pero no aparece la familia que quiero:** creá primero esa Familia.

---

**Próximo capítulo →** [Permisos y roles](08-permisos-y-roles.md)
