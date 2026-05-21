# Capítulo 1 — Acceso e instalación

## Antes de empezar (lo que prepara el administrador)

Para que el celular pueda entrar, **alguien con acceso a la PC del local** tiene que
haber dejado todo listo. Vos como usuario final no necesitás hacer esto, pero conviene
saber que existe:

1. **La PC del local en "modo servidor".** En la app de escritorio:
   *Sistema → Modo de operación → Servidor*. Esto hace que la PC publique el sistema para
   que los celulares se conecten (por defecto en el puerto 7070).
2. **La red.** El celular y la PC tienen que poder "verse":
   - **En el local (LAN):** ambos en el mismo wifi/red. Es lo más rápido.
   - **Desde afuera (WAN):** mediante la **red privada (mesh)** que el administrador
     configuró (tipo Tailscale/headscale). Con eso, el teléfono alcanza la PC aunque
     estés en otro lado, usando una única dirección.
3. **La dirección (URL) para abrir la app.** El administrador te la pasa. Tiene esta
   pinta: `http://<dirección-de-la-PC>:7070`.

> **Nota técnica:** la red privada prioriza la conexión directa por LAN cuando estás en el
> local (rápida) y usa el camino por internet solo cuando hace falta. No tenés que elegir
> nada: la app usa la misma dirección en ambos casos.

## Abrir la app por primera vez

1. Abrí el navegador del celular o tablet (Chrome en Android, Safari en iPhone/iPad).
2. Escribí la dirección que te pasó el administrador, por ejemplo:
   `http://192.168.1.50:7070` (en el local) o la dirección del mesh.
3. Si todo está bien, aparece la pantalla de **Iniciar sesión**.

Si en lugar de eso ves un error de conexión, mirá el
[Capítulo 9 — Solución de problemas](09-solucion-de-problemas.md).

## Instalar la app en la pantalla de inicio (recomendado)

La app es una **PWA**: se puede "instalar" como si fuera una app nativa, para abrirla con
un ícono sin tener que escribir la dirección cada vez.

### En Android (Chrome)

1. Abrí la dirección en Chrome.
2. Tocá el menú **⋮** (arriba a la derecha).
3. Elegí **"Agregar a la pantalla principal"** (o "Instalar app").
4. Confirmá. Aparece el ícono de FRC Gourmet en tu pantalla de inicio.

### En iPhone / iPad (Safari)

1. Abrí la dirección en Safari.
2. Tocá el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Bajá y elegí **"Agregar a inicio"**.
4. Confirmá. Aparece el ícono en tu pantalla de inicio.

A partir de ahí, abrís la app desde el ícono y se ve a pantalla completa, sin la barra del
navegador.

> **Importante sobre la instalación:** para que la app se instale "del todo" (modo
> aplicación completo, con todas las ventajas) el servidor necesita estar publicado por
> **HTTPS** (conexión segura). Mientras se use **HTTP plano** dentro de la red local,
> igual podés agregarla a la pantalla de inicio y usarla normalmente; lo que puede faltar
> es el modo 100% sin barra de navegador en algunos teléfonos. Consultá con tu
> administrador si ya está habilitado el acceso seguro.

## Configurar manualmente la dirección del servidor (casos especiales)

Normalmente **no hace falta**: si abrís la app desde la dirección del servidor, ya queda
apuntando a él. Pero si un técnico te pide configurarla a mano (por ejemplo durante una
prueba), se hace así desde el navegador:

1. Abrí la app.
2. Abrí la **consola del navegador** (esto suele hacerlo el técnico).
3. Ejecutá:
   ```js
   localStorage.setItem('frc_mobile_server_url', 'http://DIRECCION-DEL-SERVIDOR:7070');
   location.reload();
   ```

Esto es una tarea de soporte; un usuario normal nunca la necesita.

## Recomendaciones de uso

- **Tablet:** la app aprovecha la pantalla grande con una barra de navegación lateral.
  Ideal para trabajo administrativo prolongado.
- **Teléfono:** la navegación pasa a una barra inferior con los accesos principales. Todo
  está pensado para usarse con el dedo (botones grandes, sin tablas con scroll lateral).
- **Tema claro / oscuro:** podés cambiarlo desde la barra superior según la luz del
  ambiente (ver [Capítulo 2](02-login-y-navegacion.md)).

---

**Próximo capítulo →** [02 — Iniciar sesión y navegar](02-login-y-navegacion.md)
