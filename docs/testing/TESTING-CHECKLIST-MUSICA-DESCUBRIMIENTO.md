# Testing Checklist — Descubrimiento dirigido y plan automático

Cubre el cambio de 2026-08-15: filtros en el repertorio, voto y apagado de
estilos, el descubridor leyendo el catálogo, fuentes explícitas de búsqueda, y
la generación del plan del día al arrancar.

**Antes de empezar:** la app tiene que arrancar una vez para que corra la
migración `1786804287491-MusicaPreferenciaEstilo`. Verificar en el log que no
falló.

**Necesitás Spotify conectado y la API key de IA cargada** para las fases 3 a 5.
Las fases 0 a 2 andan sin ninguna de las dos.

---

## Fase 0: Migración sobre datos existentes

- [ ] La app arranca sin errores de migración
- [ ] En Configuración → Música → **Estilos**, los estilos y sus conteos siguen
      exactamente igual que antes del update
- [ ] Todos los estilos arrancan sin voto (ningún pulgar marcado) y ninguno
      aparece apagado
- [ ] En **Repertorio**, la lista sigue mostrando los mismos temas que antes

---

## Fase 1: Filtros del repertorio

- [ ] En **Repertorio** aparecen dos desplegables nuevos: **Estilo** y **Género**
- [ ] Cada opción muestra su cantidad de temas al lado
- [ ] Elegir un estilo → **Filtrar** → sólo aparecen temas de ese estilo, y el
      total de arriba coincide con el número que mostraba el desplegable
- [ ] Elegir **Sin estilo** → aparecen sólo los temas que no cayeron en ninguno
      (si el repertorio está todo clasificado, la lista queda vacía y el total
      dice 0 — eso es correcto, no un error)
- [ ] Elegir un género → sólo temas con ese género crudo
- [ ] Combinar Estado + Estilo + Género + texto: los cuatro se aplican juntos
- [ ] **Limpiar** deja todo en blanco y vuelve a "Puede sonar"
- [ ] El filtro **NO** se aplica solo al elegir: hay que apretar *Filtrar*

### El caso que antes rompía

- [ ] Poner un filtro amplio (Estado: Todos) y navegar hasta la página 4 o 5
- [ ] Ahora elegir un estilo con pocos temas y apretar **Filtrar**
- [ ] **La tabla muestra resultados**, no queda vacía ← esto antes fallaba, porque
      la búsqueda conservaba el número de página

---

## Fase 2: Votar y apagar estilos

### El voto

- [ ] En **Estilos** hay una columna **Me gusta** con dos pulgares por fila
- [ ] Pulgar arriba en un estilo → se pinta verde y avisa
- [ ] Recargar la pestaña → el voto sigue ahí
- [ ] Apretar el mismo pulgar de nuevo → vuelve a neutro
- [ ] Pulgar abajo → se pinta rojo
- [ ] **Verificar que votar NO cambia cuánto suena**: mirar la mezcla de un
      bloque en *Programación* antes y después de votar — los porcentajes tienen
      que estar idénticos. El voto sólo orienta al descubridor.

### Apagar un estilo

- [ ] Menú de acciones de un estilo → **Que no suene**
- [ ] El diálogo de confirmación dice cuántos temas se apagan
- [ ] Cancelar → no pasa nada
- [ ] Confirmar → la fila queda atenuada, con el nombre tachado y un ícono de
      bloqueo
- [ ] Ir a **Repertorio** y filtrar por ese estilo: **los temas siguen ahí y
      siguen en "Puede sonar"** ← el apagado es de elegibilidad, no destructivo
- [ ] En *Programación* → **Generar plan de hoy**
- [ ] Ninguna playlist del día incluye temas de ese estilo
- [ ] Volver a **Estilos** → menú → **Volver a habilitar** (sin confirmación,
      porque no saca nada de ningún lado)
- [ ] Regenerar el plan → los temas de ese estilo vuelven a entrar
- [ ] Prender y apagar el mismo estilo 3 o 4 veces, y después mirar la lista de
      vetos: **tiene que haber una sola entrada**, no una por cada vez

---

## Fase 3: Qué criterio usa el descubridor

- [ ] En **Mi estilo**, paso 3, aparece el botón **¿Qué va a buscar?**
- [ ] Desplegarlo muestra *Lo que más falta* con los estilos ordenados por horas
      faltantes, y cuántos temas hay hoy de cada uno
- [ ] Los números coinciden con el déficit que muestra *Programación* para el
      bloque más exigente de ese estilo
- [ ] La lista *Y además tiene en cuenta* nombra: tu descripción, la cantidad de
      bloques, lo que te gusta más y menos, los estilos apagados, los géneros y
      artistas vetados, los artistas que ya tenés y lo que rechazaste
- [ ] Votar un estilo en **Estilos** y volver acá: el estilo aparece en "Que te
      gusta más"
- [ ] Apagar un estilo y volver: aparece en "Estilos apagados (prohibidos)" y
      **desaparece de "Lo que más falta"**, aunque tenga cuota en algún bloque

### El fix de fondo

- [ ] Configurar un bloque con una cuota alta (50%) de un estilo que tenga muy
      pocos temas — el caso real es PAGODE
- [ ] Abrir **¿Qué va a buscar?**: ese estilo tiene que encabezar *Lo que más falta*
- [ ] Correr **Descubrir música** con la fuente automática
- [ ] **Buena parte de lo propuesto tiene que ser de ese estilo** ← esto es lo que
      antes no pasaba: el descubridor no sabía que la cuota existía y proponía
      indie anglo
- [ ] Volver a abrir **¿Qué va a buscar?**: las horas faltantes de ese estilo
      bajaron

---

## Fase 4: Fuentes de descubrimiento

El desplegable **Buscar según** arranca en *Todo lo que ya sé del local*, que es
el comportamiento de siempre.

- [ ] Al cambiar de fuente, el texto de ayuda de abajo cambia
- [ ] El panel *¿Qué va a buscar?* sólo se muestra en la fuente automática

### Un pedido que escribo

- [ ] Elegir **Un pedido que escribo** → aparece un cuadro de texto que se ve
      bien y crece al escribir (no un campo aplastado de 40px)
- [ ] Dejarlo vacío y buscar → avisa que falta escribir el pedido
- [ ] Escribir algo específico que NO sea lo que más falta (ej: "covers de rock
      clásico en versión bossa")
- [ ] **Lo propuesto responde al pedido, no al déficit** ← si devuelve el estilo
      en déficit, el criterio acumulado se está filtrando y es un bug
- [ ] Pedir explícitamente algo de un género vetado → no debería proponerlo, y si
      lo propone el filtro lo descarta y aparece en el detalle

### Un estilo o género puntual

- [ ] Elegir **Un estilo o género puntual** → aparecen los dos campos
- [ ] Los estilos apagados aparecen marcados "(apagado)" y no se pueden elegir
- [ ] Elegir un estilo y buscar → lo propuesto encaja con ese estilo
- [ ] Con un estilo que tenga descripción cargada en el catálogo, el resultado
      tiene que respetar esa descripción (ej: si dice "covers modernos", que no
      traiga clásicos brasileños)

### Un tema de ejemplo

- [ ] Escribir un nombre libre ("Nouvelle Vague — Just Can't Get Enough") y buscar
- [ ] Pegar una URL de Spotify de un tema → el resultado dice "Referencia usada"
      con el artista y título **resueltos**, no la URL
- [ ] Lo propuesto suena parecido al tema de referencia

### Una playlist de ejemplo

- [ ] Elegir la fuente → aparece el aviso sobre el límite de Spotify
- [ ] Pegar algo que no sea una URL de playlist → avisa qué se espera
- [ ] Pegar la URL de una playlist **de tu propia cuenta** → el resultado dice
      cuántos temas se leyeron
- [ ] Pegar la URL de una playlist **de otro** (ej: una "Bossa Nova Covers"
      pública) → **no falla**: avisa que no se pudieron leer los temas y que usa
      el nombre y la descripción. El resultado va a ser menos preciso, y eso está
      bien
- [ ] Pegar una playlist editorial de Spotify (`37i9dQZF…`) → mismo aviso, no una
      pantalla de error

---

## Fase 5: Plan del día automático

Esta es la que hay que probar con más paciencia, porque depende del reloj.

- [ ] Cerrar la app **matando también el proceso viejo** (`lsof -ti:7070`)
- [ ] Borrar el plan de hoy de la base (`DELETE FROM plan_programacion WHERE fecha = '<hoy>'`)
- [ ] Abrir la app **fuera del horario de cualquier bloque** (ej: a las 09:00 si
      el primer bloque arranca a las 11:00)
- [ ] En el log tiene que aparecer `[musica] Plan del <fecha> generado al arrancar.`
- [ ] **El plan existe antes de que empiece el primer bloque** ← esto es lo nuevo:
      antes se generaba recién a las 11:00, justo cuando ya tenía que sonar
- [ ] En *Programación* → arriba dice "El plan del … se generó solo al iniciar el
      sistema", en verde

### Que no lo pise

- [ ] Con el plan de hoy ya generado, cerrar y volver a abrir la app
- [ ] El log dice `No se genero plan del <fecha>: YA HAY PLAN PARA HOY.`
- [ ] Las playlists en Spotify **no se regeneraron** (mismo contenido, no cambió
      el orden)
- [ ] En la base hay **una sola** fila de plan para hoy

### Cuando no puede

Probar cada una por separado; en todos los casos la app tiene que arrancar
normal y el aviso de *Programación* explicar el motivo en naranja:

- [ ] Módulo de música apagado → "EL MODULO DE MUSICA ESTA DESHABILITADO."
- [ ] Sin bloques para hoy → "NO HAY BLOQUES PROGRAMADOS PARA HOY."
- [ ] Repertorio sin temas aprobados → "EL REPERTORIO NO TIENE NINGUN TEMA APROBADO."
- [ ] Sin client id de Spotify cargado → "FALTA EL CLIENT ID DE SPOTIFY."
- [ ] Spotify desconectado → "SPOTIFY NO ESTA CONECTADO."
- [ ] En ninguno de esos casos la app muestra un error de arranque ni queda colgada

### Medianoche

- [ ] Con la app abierta, esperar a que cruce la medianoche (o cambiar la hora
      del sistema)
- [ ] Dentro de los 2 minutos siguientes (un ciclo de heartbeat), el log muestra
      la generación del plan del día nuevo
- [ ] Se genera **una sola vez**, no en cada heartbeat

---

## Fase 6: Regresión

Lo que no tenía que cambiar:

- [ ] La reproducción sigue funcionando: cambio de bloque, variantes, modo manual
- [ ] *Clasificar* en **Estilos** sigue respetando las correcciones manuales
- [ ] Los desacuerdos agente/género se siguen listando
- [ ] La importación de semillas anda igual
- [ ] *Analizar temas* anda igual
- [ ] El control de música desde la PWA y desde el header del PdV siguen andando
- [ ] Generar el plan **a mano** desde *Programación* sigue funcionando y sí pisa
      el plan existente (a diferencia del automático, que no)

---

## Tests automáticos

Corren sobre SQLite limpia con las migraciones aplicadas:

```bash
npm run test:musica-estilos          # 51 assertions
npm run test:musica-descubrimiento   # 31 assertions
npm run test:musica-plan-automatico  # 11 assertions
npm run test:musica-cuotas           # 17 assertions
```

**Ojo:** ninguno de estos toca Postgres. El gate real de Postgres es el job
*Migration run (Postgres baseline + incrementales)* del CI.
