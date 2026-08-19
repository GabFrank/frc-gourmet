# Checklist manual — foco del diálogo de pesaje (buffet por peso)

Cubre el cambio de 2026-08-17 en el PdV desktop: con el peso leído de una
etiqueta de balanza, el foco pasa al botón **AGREGAR** para poder confirmar con
Enter — pero con una demora, para que el Enter del propio lector no lo dispare.

> **Requiere reiniciar la app** (es Angular, pero el build va empaquetado).

**Preparación:** un producto `BUFFET_POR_PESO` con precio por kilo vigente, la
config de balanza de *PdV → Configuración* acorde a tus etiquetas
(`balanzaPrefijo`, `balanzaModo`, `balanzaFactorPeso`), y el lector de códigos
conectado.

---

## 1. Escaneando una etiqueta de balanza — el caso del fix

- [ ] En el PdV, escaneá una etiqueta EAN-13 de balanza del producto buffet.
- [ ] El diálogo de pesaje abre con el **peso ya cargado**.
- [ ] **No se agrega solo**: el ítem NO entra a la cuenta por el Enter del
      lector. *(Este es el bug que se corrige: con el foco en AGREGAR desde el
      arranque, el Enter del escaneo lo disparaba y el ítem entraba sin que
      llegaras a ver el peso.)*
- [ ] Menos de medio segundo después, **AGREGAR queda enfocado** (se le ve el
      recuadro de foco).
- [ ] Presioná **Enter**: agrega el ítem con el peso de la etiqueta.
- [ ] El total del ítem coincide con peso neto × precio por kilo (descontando la
      tara y respetando mínimo/tope si están configurados).

## 2. Escaneos seguidos

- [ ] Escaneá una etiqueta, esperá a que el diálogo abra, y **escaneá otra sin
      confirmar la primera**. El diálogo no debe agregar dos veces ni quedar en
      un estado raro; anotá qué pasa si el comportamiento te resulta incómodo
      (el diálogo es modal con `disableClose`).
- [ ] Escaneá y confirmá con Enter, varias veces seguidas: cada pesada entra una
      sola vez.

## 3. Abriendo el diálogo a mano (no regresión)

- [ ] Buscá el producto buffet desde el buscador (sin escanear).
- [ ] El diálogo abre **sin peso** y el foco está en el **campo de peso**, no en
      el botón.
- [ ] AGREGAR está deshabilitado hasta que cargues un peso válido.
- [ ] Escribí el peso y confirmá con el botón: agrega normalmente.

## 4. Casos borde

- [ ] Escaneá una etiqueta y **cancelá** el diálogo: no se agrega nada y el
      buscador queda usable.
- [ ] Escaneá una etiqueta con peso por debajo del mínimo configurado: se ve el
      aviso "por debajo del peso mínimo" y el total cobra el mínimo.
- [ ] Escaneá una etiqueta cuyo peso active el tope de **buffet libre**: se ve el
      cartel y el total queda topado.
- [ ] Con el foco ya en AGREGAR, tocá el campo de peso y corregí el valor: el
      total se recalcula y podés confirmar con el botón.

---

## Cobertura automática

El cálculo del cobro ya está cubierto por `buffet-peso.util.spec.ts`. El
comportamiento del **foco** es de UI y no lo cubren los tests actuales: haría
falta montar el diálogo con TestBed y simular el temporizador, desproporcionado
para el tamaño del cambio. Por eso este checklist.
