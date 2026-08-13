# Testing Checklist — Clasificación semántica de música

Cubre el cambio de 2026-08-12: tres opiniones de estilo con precedencia, ejes de
ánimo y momento en el bloque, y las acciones de catálogo que faltaban.

**Antes de empezar:** la app tiene que arrancar una vez para que corra la
migración `1786563231306-MusicaClasificacionSemantica`. Verificar en el log que
no falló.

---

## Fase 0: Migración sobre datos existentes

- [ ] La app arranca sin errores de migración
- [ ] En Configuración → Música → **Estilos**, los estilos y sus conteos de temas
      siguen igual que antes del update (la migración no debe mover ningún tema)
- [ ] En **Repertorio**, la columna nueva **Estilo** muestra el estilo de cada tema
- [ ] Los temas que ya estaban corregidos a mano muestran el ícono de chincheta
- [ ] Ningún tema quedó sin estilo que antes tuviera uno

### Normalización del vocabulario

- [ ] Correr *Analizar temas* sobre algunos temas nuevos
- [ ] Verificar en la base que `musica_tracks.ambiente` solo tiene valores del
      vocabulario: `RELAJADO`, `ALEGRE`, `ENERGICO`, `MELANCOLICO`
- [ ] Que no aparezca `energetico`, ni valores en minúscula, ni con acentos
- [ ] `escenas` guarda los valores en MAYÚSCULA y sigue siendo JSON válido

---

## Fase 1: Precedencia entre las tres opiniones

Es el corazón del cambio: **manual › agente › género**.

- [ ] Elegir un tema en **Repertorio** y anotar su estilo actual
- [ ] Menú de acciones → **Cambiar estilo** → elegir otro estilo
- [ ] El estilo cambia y aparece el ícono de chincheta
- [ ] Ir a **Estilos** → *Clasificar* (sin MusicBrainz)
- [ ] **El tema corregido conserva el estilo que le pusiste** ← lo que antes se perdía
- [ ] Menú → Cambiar estilo → **Quitar corrección**
- [ ] El tema vuelve al estilo automático y **no queda sin estilo**
- [ ] Correr *Clasificar* de nuevo: el resultado es estable, no cambia en cada corrida

### Desacuerdos

- [ ] Después de un *Analizar temas*, la pestaña **Estilos** muestra la tarjeta
      "El agente y el género no coinciden" si hubo alguno
- [ ] Cada fila muestra las dos opiniones y cuál quedó vigente
- [ ] El vigente es el del agente, salvo que haya corrección manual (chincheta)

---

## Fase 2: Ánimo y momento en el bloque

- [ ] Configuración → Música → **Programación** → abrir un bloque
- [ ] Aparecen los campos **Que no suene** (multi-selección) y **Momento del día**
- [ ] Elegir `MELANCOLICO` en "Que no suene" y guardar
- [ ] Cerrar y volver a abrir el bloque: el valor quedó guardado
- [ ] **Regenerar el plan** (sin esto no cambia nada: las playlists ya están escritas)
- [ ] Abrir la playlist del bloque en Spotify y verificar que no entró ningún tema
      que el Repertorio marque como melancólico
- [ ] Elegir un **Momento del día** y regenerar: los temas de ese momento aparecen
      antes, pero la playlist **no queda más corta** que sin la preferencia

---

## Fase 3: Catálogo — acciones nuevas

- [ ] **Estilos** → menú de un estilo → **Editar**
- [ ] Cambiar el nombre y guardar → se refleja en la lista y en la mezcla del bloque
- [ ] Escribir una **descripción** y guardar
- [ ] Correr *Analizar temas* sobre temas nuevos: el modelo usa la descripción para
      elegir (probar con dos estilos del mismo género, ej. bossa clásica vs covers)
- [ ] En el diálogo de edición, un género de la lista → **Mover a…** otro estilo
- [ ] Al cerrar, la reclasificación corre sola y los temas de ese género cambian de estilo
- [ ] Un género → **Quitar del catálogo** → sus temas quedan sin clasificación por
      género, pero **conservan** lo que dijo el agente o la corrección manual

---

## Fase 4: Regresión

- [ ] Generar el plan del día completo sin errores
- [ ] Las cuotas por estilo siguen respetándose (mezcla configurada → proporciones)
- [ ] El déficit por estilo sigue calculando bien
- [ ] El control del header y el de la PWA siguen funcionando
- [ ] Vetar un tema y un artista sigue funcionando

---

## Automatizados

```bash
npm run test:musica-estilos   # precedencia, desacuerdos, catálogo, déficit
npm run test:musica-cuotas    # cuotas, intercalado, ánimo y escena
npm run check                 # AOT de producción
```
