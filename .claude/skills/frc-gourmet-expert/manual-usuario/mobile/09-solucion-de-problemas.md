# Capítulo 9 — Solución de problemas

## "No se pudo conectar con el servidor" (al iniciar sesión)

La app no encuentra la PC del local. Revisá, en orden:

1. **¿La PC del local está encendida?** Tiene que estarlo, y con FRC Gourmet abierto.
2. **¿Está en modo servidor?** En la PC: *Sistema → Modo de operación → Servidor*.
3. **¿Estás en la red correcta?** En el local, conectado al mismo wifi. Fuera del local,
   con la red privada (mesh) activa en tu teléfono.
4. **¿La dirección es correcta?** Confirmá la URL con tu administrador
   (`http://…:7070`).

## Aviso flotante "Sin conexión con el servidor"

Aparece cuando la app pierde el contacto con la PC mientras la usabas:

- Esperá unos segundos: si fue algo momentáneo, el aviso se va solo.
- Si no vuelve, repasá los mismos puntos de arriba (PC encendida, en red, en modo
  servidor).
- **Mientras esté el aviso, no podés guardar ni cargar datos.** La app no guarda nada en el
  celular: necesita el servidor para todo.

## Me sacó a la pantalla de login solo

Tu sesión caducó o fue cerrada (por inactividad prolongada o porque el administrador la
cerró). Simplemente **volvé a iniciar sesión** con tu usuario y contraseña.

## "Credenciales inválidas"

Usuario o contraseña incorrectos.

- Revisá el **bloqueo de mayúsculas**: la contraseña distingue mayúsculas y minúsculas.
- Si seguís sin entrar, pedile al administrador que verifique tu usuario (que exista y esté
  **Activo**) y, si hace falta, te reinicie la contraseña.

## No veo el botón "+" para crear (o no aparece "Eliminar")

No es un error: tu usuario **no tiene permiso** para gestionar esa sección. Pediselo al
administrador. Ver [Capítulo 8](08-permisos-y-roles.md).

## "Sin permiso para guardar / eliminar"

Intentaste una acción para la que tu rol no está autorizado. El administrador debe
asignarte el permiso correspondiente.

## "No se pudo guardar" / "No se pudieron cargar…"

Suele ser un problema de **conexión** o un dato rechazado por el servidor:

1. Verificá que no estés "Sin conexión".
2. Revisá que los campos obligatorios estén completos.
3. Reintentá. Si persiste, anotá qué estabas haciendo y avisá a soporte.

## Al editar un funcionario no me deja cambiar el cargo o el salario

Es **correcto y a propósito**. Esos cambios generan historial y se hacen desde la app de
escritorio. En mobile, al editar un funcionario solo podés cambiar código interno,
jornalero/valor de jornal, observación y el estado Activo. Ver
[Capítulo 4](04-modulo-rrhh.md).

## No me deja eliminar un funcionario

Los funcionarios no se eliminan: se **inactivan**. Abrí el funcionario y apagá el
interruptor **Activo**.

## No veo las imágenes de los productos

Las imágenes se traen desde la PC del local. Si hay un problema momentáneo de conexión
pueden no cargar. Recargá la pantalla; si persiste, avisá a soporte.

## La app se ve "rara" o desactualizada

Como es una app web, a veces conviene **recargar**:

- Cerrá y volvé a abrir la app (o el navegador).
- Si la instalaste en la pantalla de inicio, cerrala por completo y abrila de nuevo.

## La función que busco no está / dice "pronto"

Algunas funciones todavía no están en mobile (PdV, recetas, sabores, Caja Mayor, monedas,
importación con IA, reportes, y ciertas operaciones de RRHH). Se hacen en la app de
escritorio. Ver [Capítulo 10](10-limitaciones-y-version-escritorio.md).

---

**Próximo capítulo →** [10 — Qué falta en mobile y se hace desde el escritorio](10-limitaciones-y-version-escritorio.md)
