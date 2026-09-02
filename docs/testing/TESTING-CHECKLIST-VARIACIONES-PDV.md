# Testing Checklist — Elaborados con variación en el PdV y la PWA

Cubre los tres cambios de 2026-08:

1. Las listas de productos muestran el **rango de precios** de un
   `ELABORADO_CON_VARIACION` (antes mostraban `0`).
2. **Autoselección** del sabor cuando el tamaño tiene uno solo.
3. **Configuración por producto** del máximo de sabores combinables y de la
   estrategia de precio (antes era global para todo el local).

## Preparación

- [ ] Producto A tipo `ELABORADO_CON_VARIACION` con **2 presentaciones**
      (ej. GRANDE / MEDIANO) y **1 solo sabor** (ej. TRADICIONAL), con precio
      distinto por tamaño (ej. 65.000 y 50.000).
- [ ] Producto B tipo `ELABORADO_CON_VARIACION` (pizza) con 2+ tamaños y 3+
      sabores con precio.
- [ ] Ambos asignados a un atajo del PdV (para probar el grid de accesos directos).
- [ ] *Configuración → PdV*: máximo de sabores global = 2, estrategia = El más caro.
- [ ] Reiniciar la app (hay cambios de backend y una migración nueva).

## 1. Rango de precios en las listas

### PdV desktop
- [ ] Buscador de productos (F2 / lupa) → buscar el producto A: la columna
      PRECIO muestra `50.000 – 65.000`, **no** `0`.
- [ ] Buscar un producto de un solo precio (RETAIL): muestra un valor único, sin guion.
- [ ] Grid de atajos → abrir el atajo con el producto A: la tarjeta muestra el rango.
- [ ] Producto con variación **sin ningún precio cargado**: muestra `0` (nada que mostrar) y sigue abriendo el diálogo.

### PWA mobile
- [ ] Mesa → Tomar pedido → buscar el producto A: bajo el nombre aparece
      `Gs 50.000 – 65.000` y el detalle `2 tamaños · 1 sabor`.
- [ ] Producto B: el rango va del sabor/tamaño más barato al más caro.
- [ ] Producto RETAIL: precio único + conversiones de moneda como antes.
- [ ] En un producto con rango **no** se muestran las conversiones a USD/BRL
      (serían ambiguas).
- [ ] Atajos del mobile: misma lectura que en la búsqueda.

### Datos viejos (opcional, solo si la base tiene productos pre-refactor)
- [ ] Un producto cuyo precio todavía cuelga de la receta muestra su precio en
      la lista (fallback legacy) en vez de `0`.

## 2. Autoselección del sabor único

### PdV desktop
- [ ] Producto A → se abre el diálogo: al elegir GRANDE, el único sabor queda
      **marcado solo** y el diálogo salta al paso CONFIRMAR.
- [ ] **No** se abre solo el diálogo de personalización; el botón PERSONALIZAR
      sigue disponible y funciona (quitar ingrediente, adicional, nota libre).
- [ ] Producto con **una sola presentación y un solo sabor**: el diálogo abre
      directamente en CONFIRMAR (queda un toque para "Agregar").
- [ ] Producto B (varios sabores): nada cambia — hay que elegir el sabor y al
      tildarlo se abre la personalización, como antes.
- [ ] Volver al paso 2 desde el badge del tamaño y cambiar de tamaño:
      la autoselección se recalcula para el tamaño nuevo.

### PWA mobile
- [ ] Producto A → el sabor único aparece ya tildado y el total se calcula solo.
- [ ] No se abre la personalización sin pedirla; el botón "Personalizar" sí la abre.
- [ ] Producto B: comportamiento anterior (tildar abre la personalización).

## 3. Configuración por producto

### Edición del producto
- [ ] Editar el producto A → tab *Información general*: aparecen los campos
      **Máximo de sabores por ítem** y **Precio con varios sabores**.
- [ ] Los campos **no** aparecen en productos RETAIL / ELABORADO_SIN_VARIACIÓN / COMBO.
- [ ] Dejar el máximo vacío y la estrategia en "Global del PdV" → guardar →
      reabrir: siguen vacíos (hereda el global).
- [ ] Poner máximo = 1 en el producto A y estrategia = "El más caro" → guardar.
- [ ] Poner máximo = 3 en la pizza (producto B) y estrategia = "Promedio" → guardar.
- [ ] Mobile: *Productos → detalle* del producto A muestra "Máx. sabores por
      ítem: 1" y "Precio con varios sabores: El más caro".

### Efecto en la venta
- [ ] PdV desktop, producto A (máximo 1): el título del paso 2 **no** muestra
      "(max N)"; tocar otro sabor **reemplaza** al elegido en vez de no hacer nada;
      no aparece el control de porciones (mitad y mitad).
- [ ] PdV desktop, pizza (máximo 3): se pueden elegir 3 sabores y el precio sale
      del **promedio** (verificar con precios distintos por sabor).
- [ ] PWA mobile: mismos dos comportamientos.
- [ ] Volver el producto A a "vacío / global" → el PdV vuelve a permitir 2 sabores.

### Carta online (solo en modo servidor, si hay tienda publicada)
- [ ] La ficha de la pizza en el storefront ofrece hasta 3 sabores; el producto A
      (máximo 1) no ofrece mitad y mitad.
- [ ] Forzar un pedido con más sabores de los permitidos (API) → el server lo
      rechaza con `demasiados_sabores`.

## 4. Regresión

- [ ] Vender una pizza mitad y mitad con personalización por sabor: la comanda
      imprime cada `SIN X` en el sabor correcto y el ticket cotiza igual que antes.
- [ ] Cobrar la venta y verificar el total.
- [ ] `npm run test:variacion-precios` y `npm run test:variacion-config` en verde.
