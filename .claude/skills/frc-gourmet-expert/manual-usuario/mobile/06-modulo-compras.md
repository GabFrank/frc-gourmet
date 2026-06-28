# Módulo Compras

Entrás tocando **Compras** (🛒) en la navegación. Te permite **gestionar las categorías de
compra** y **consultar** las compras y los proveedores.

> Repasá [Cómo usar las listas y los formularios](03-como-usar-listas-y-formularios.md) para el uso general de listas.

---

## A. Lo que podés gestionar

### Categorías de compra

Las categorías con las que se clasifican las compras a proveedores.

- **Campos:** Nombre, Activo.
- **Permiso:** `COMPRAS_GESTIONAR`.
- Podés crear, editar y eliminar (con confirmación).

---

## B. Sub-módulos de solo consulta

### Compras

El historial de compras registradas. Cada tarjeta muestra los datos de la compra
(proveedor, fecha, total). Sirve para revisar qué se compró sin abrir el escritorio.

> El **registro de una compra nueva** (con su detalle de productos, costos y el pago vía
> cuentas por pagar) se hace en el escritorio. En mobile la compra es de solo lectura.

### Proveedores

El listado de proveedores con sus datos. Te deja consultar a quién le comprás.

> El **alta de un proveedor** se hace en el escritorio.

---

## C. Lo que todavía no está (aparece como "pronto")

- **Importaciones IA** — la importación de facturas con inteligencia artificial (OCR) está
  disponible solo en el escritorio. Ver [Qué falta en mobile](10-limitaciones-y-version-escritorio.md).

---

## Errores comunes

- **Quiero registrar una compra y no veo el botón "+":** el registro de compras no está en
  mobile todavía; se hace en el escritorio.
- **No puedo crear/editar categorías de compra:** te falta el permiso `COMPRAS_GESTIONAR`.

---

**Próximo capítulo →** [Módulo Productos](07-modulo-productos.md)
