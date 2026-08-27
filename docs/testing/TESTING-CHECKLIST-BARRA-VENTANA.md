# Checklist manual — barra de ventana y herramientas (zoom / DevTools)

Cubre el cambio de 2026-08-27: la app sigue siendo **frameless**, pero los
botones de minimizar/maximizar/cerrar los dibuja ahora el **sistema operativo**
(en Windows, con Window Controls Overlay) y las funciones que traía el menú
nativo de Electron —zoom, recargar, DevTools— viven en un menú propio del
header más sus atajos de teclado.

> **Requiere reiniciar la app**: se tocaron `main.ts` y `preload.ts`.

Qué cambió, resumido:

| Plataforma | Botones de ventana | De dónde salen |
|---|---|---|
| Windows | minimizar / maximizar / cerrar | Nativos, sobre la toolbar (`titleBarOverlay`) |
| macOS | semáforos | Nativos (`titleBarStyle:'hiddenInset'`) |
| Linux | minimizar / maximizar / cerrar | Los dibuja el header (no hay overlay en Electron 24) |
| Web `/admin` | ninguno | Es una pestaña del navegador |

---

## 1. Windows — botones nativos (el caso principal)

- [ ] Abrí la app. Arriba a la derecha se ven los **tres botones de Windows**
      (─ ☐ ✕), con la forma del sistema, no con iconos de Material.
- [ ] **Minimizar** manda la app a la barra de tareas.
- [ ] **Maximizar/restaurar** alterna el tamaño de la ventana.
- [ ] **Cerrar** cierra la app.
- [ ] Los botones **no tapan** el menú de usuario, el reloj ni las cotizaciones:
      queda un hueco reservado a la derecha de la toolbar.
- [ ] La ventana sigue **arrastrándose** desde cualquier zona vacía de la barra.
- [ ] Doble clic en la barra maximiza/restaura.
- [ ] Ya **no aparecen** los botones custom de minimizar/cerrar que estaban en el
      header (los que no hacían nada).

## 2. Windows — el color acompaña al tema

- [ ] Con tema claro, mirá el color de fondo de los tres botones: coincide con el
      de la barra de la app.
- [ ] Cambiá a **tema oscuro** (menú de usuario → *Tema oscuro*). Los botones
      cambian de color junto con la barra, sin reiniciar.
- [ ] Cerrá sesión y volvé a entrar: siguen con el color correcto.

## 3. Menú de herramientas de ventana

En el header, a la izquierda del nombre de usuario, hay un botón con el icono de
controles (`tune`) y tooltip *Herramientas de ventana*.

- [ ] Se abre el menú y muestra: fila de zoom (`−  100%  +`), *Pantalla
      completa* (F11), *Recargar* (F5) y *Herramientas de desarrollo* (F12).
- [ ] Tocá **+** varias veces: la app se agranda y el porcentaje sube
      (110%, 125%, 150%…). **El menú no se cierra** entre clics.
- [ ] Tocá **−** varias veces: baja hasta 50% y ahí se detiene.
- [ ] Tocá el **porcentaje**: vuelve a 100%.
- [ ] *Pantalla completa*: la ventana ocupa toda la pantalla y el ítem pasa a
      decir *Salir de pantalla completa*. Volvé a tocarlo para salir.
- [ ] *Recargar*: la app se recarga y **mantiene el zoom** que habías dejado.
- [ ] *Herramientas de desarrollo*: abre el inspector en una ventana aparte;
      volver a tocarlo lo cierra.

## 4. El zoom se recuerda

- [ ] Dejá el zoom en 125% y **cerrá la app**.
- [ ] Volvé a abrirla: arranca en 125% y el menú muestra `125%`.
- [ ] Volvé a 100% (para no dejar el equipo raro para el próximo).
- [ ] *(Opcional, técnico)* En `userData/app-settings.json` existe
      `"ui": { "zoomFactor": 1.25 }`.

## 5. Atajos de teclado (sin abrir el menú)

- [ ] **Ctrl +** y **Ctrl −** cambian el zoom (en macOS, Cmd).
- [ ] **Ctrl 0** vuelve a 100%.
- [ ] **F5** y **Ctrl+R** recargan.
- [ ] **F12** y **Ctrl+Shift+I** abren/cierran DevTools.
- [ ] **F11** entra y sale de pantalla completa.
- [ ] El porcentaje que muestra el menú **queda sincronizado** con lo que
      hiciste por teclado.

## 6. Que los atajos no molesten al trabajo diario

- [ ] En el PdV, escribí en el buscador de productos un texto con **guiones** y
      con **ceros** (`0`, `-`, `COCA-COLA 500`): se escriben normal, no cambian
      el zoom.
- [ ] Escaneá un **código de barras** con el lector: entra completo, sin que
      ninguna tecla se pierda.
- [ ] Guardá con **Ctrl+S** donde la pantalla lo use: sigue funcionando.

## 7. Modo cliente (el bug que se corrige)

En un PC configurado como **cliente** (*Sistema → Modo de operación*), apuntando
a otro PC servidor:

- [ ] Los botones de ventana **funcionan** (antes no hacían nada: la llamada
      salía por HTTP hacia el servidor en vez de quedarse en la máquina local).
- [ ] Zoom, recargar y DevTools funcionan sobre **esta** ventana.
- [ ] Con el **servidor apagado**, minimizar/cerrar/zoom siguen funcionando
      (no dependen de la red).

## 8. macOS

- [ ] Los **semáforos** de macOS siguen arriba a la izquierda y funcionan.
- [ ] **No** aparecen botones custom en el header ni un hueco reservado a la
      derecha.
- [ ] El menú de herramientas funciona igual, con **Cmd** en lugar de Ctrl.

## 9. Linux

- [ ] Se ven los botones del header (minimizar / maximizar / cerrar) y
      **funcionan**: sin ellos no habría forma de cerrar la ventana.
- [ ] El menú de herramientas funciona igual que en Windows.

## 10. Web `/admin` y PWA mobile

- [ ] Entrando por el navegador a `http://<server>:7070/admin`, el header **no
      muestra** botones de ventana ni el menú de herramientas (el zoom lo maneja
      el navegador con Ctrl +/−).
- [ ] Nada en la consola del navegador se queja de `window.api.window*`.
