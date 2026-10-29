# PLAN: íconos y tipografía sin internet (escritorio y PWA móvil)

## Problema
`src/index.html` y `projects/mobile/src/index.html` cargan Material Icons y Roboto desde
fonts.googleapis.com, y `src/assets/custom-material-icons.scss` declara otro @font-face
apuntando a fonts.gstatic.com. Si la PC del local abre la app sin internet (o con internet
lento), los `<mat-icon>` muestran el nombre de la ligadura («send», «delete») en vez del
ícono, y los botones se deforman. Se vio en las capturas del sandbox (sin salida a internet).

## Cambio
1. Dependencias fijadas (exactas): `material-icons@1.13.12` (Apache-2.0, misma fuente
   oficial de Google) y `@fontsource/roboto@5.3.0` (OFL/Apache). Solo archivos de fuente+CSS.
2. `angular.json`: agregar a `styles` de los proyectos app (build y test) y mobile (build y test):
   `node_modules/material-icons/iconfont/filled.css`,
   `node_modules/@fontsource/roboto/{300,400,500}.css`.
   El builder copia los woff/woff2 al bundle (media/) y reescribe las url → funciona en
   Electron (file://) y en el servidor web/PWA (y el service worker los cachea).
3. Quitar los `<link>` a fonts.googleapis.com de ambos index.html.
4. `custom-material-icons.scss`: quitar el @font-face remoto (la clase .material-icons queda).
   Borrar `src/assets/material-icons/material-icons.css` (no lo referencia nadie).
5. Storefront (tienda web, Inter de Google Fonts) queda igual: la usan clientes con internet.

## Variantes
El código solo usa la familia «Material Icons» (filled); no hay outlined/round/symbols.

## Pruebas
- Build de app y mobile (CI) sin errores; verificar que el bundle contiene material-icons.woff2
  y roboto-*.woff2 y que index.html ya no menciona googleapis.
- Captura del escritorio y de la PWA en el sandbox SIN internet: íconos visibles.
- grep de googleapis/gstatic en src/ y projects/mobile/ → solo queda el tokeninfo de Google (backend).
- test:all sin fallas nuevas respecto de develop.

## Riesgos
- Tamaño: +~130 KB (woff2 de íconos) +~3×20 KB (Roboto latin) al bundle; irrelevante.
- Versión de íconos: 1.13.12 trae los mismos nombres; si algún ícono muy nuevo no existiera,
  se vería su texto (mismo síntoma actual sin red). Se revisa en las capturas.
- No toca cobro, factura ni base de datos.

## Volver atrás
Revertir el commit (squash) en develop: vuelven los <link> remotos. Sin migraciones.
