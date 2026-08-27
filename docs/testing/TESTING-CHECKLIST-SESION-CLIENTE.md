# Checklist de pruebas — Sesión persistente del modo cliente

Cubre el arreglo de la **sesión zombi**: al reabrir la app en modo cliente con
la sesión recordada, la interfaz quedaba logueada pero ningún dato cargaba.

> ⚠️ **Requiere reiniciar la app.** Hay cambios en `main.ts`, `preload.ts` y el
> router de Angular. No alcanza con el hot reload.
>
> ⚠️ **No hay migración.** El refresh token se guarda en el keychain del SO (o
> en un archivo de `userData`), no en la base.

---

## Preparación

Se necesita una PC en **modo cliente** apuntando a un nodo servidor. En la
terminal del servidor, tener a mano la tabla `refresh_tokens` para verificar
emisión, rotación y revocación.

Dónde queda el token persistido:

| SO | Ubicación |
|---|---|
| Windows | Administrador de credenciales → `com.frcgourmet.app` / `client-refresh-token` |
| macOS | Llavero → mismo servicio y cuenta |
| Linux **con** keyring | libsecret / kwallet, mismo servicio |
| Linux **sin** keyring | `~/.config/frc-gourmet/client-refresh-token.local`, permisos `600` |

El caso sin keyring es el normal en una PC de reparto: verificalo ahí.

---

## Parte 1 — El bug original

| # | Paso | Esperado |
|---|---|---|
| 1 | Loguearse en modo cliente, dejar la app funcionando y confirmar que carga datos | Panel de inicio con ventas, cajas y cotización |
| 2 | Cerrar la app por completo y reabrirla | **Entra directo, sin pedir contraseña, y el panel carga los datos** |
| 3 | Esperar más de 15 minutos (el access token dura eso) y reabrir | Igual: entra y carga |
| 4 | ⚠️ Verificar que **no** quede la UI logueada con el panel vacío | Ese era exactamente el bug |

## Parte 2 — Que la sesión muerta se detecte

| # | Paso | Esperado |
|---|---|---|
| 1 | Con la app cerrada, borrar el token del keychain (o el archivo `.local`) y abrir | Pantalla de **login**, con el nickname ya cargado. **No** un panel vacío |
| 2 | Revocar el refresh token desde el servidor (`UPDATE refresh_tokens SET revoked_at = now()`) y reabrir la app | Pantalla de login |
| 3 | Apagar el servidor y reabrir la app | Pantalla de login (no un panel que aparenta funcionar) |
| 4 | Volver a prender el servidor y loguearse | Entra normal |

## Parte 3 — Rotación y logout

| # | Paso | Esperado |
|---|---|---|
| 1 | Loguearse y mirar `refresh_tokens` en el servidor | Aparece una fila nueva, con `token_hash` — **nunca** el token en claro |
| 2 | Dejar pasar más de 15 min con la app abierta y hacer cualquier acción que llame al servidor | El access token se renueva solo; en la tabla, el token viejo queda `revoked_at` y aparece uno nuevo |
| 3 | Verificar el token guardado en el keychain después de esa rotación | Cambió: es el nuevo. Si guardara el viejo, el próximo arranque fallaría |
| 4 | Cerrar sesión desde el menú de usuario | El token queda revocado en el servidor **y** borrado del keychain |
| 5 | Reabrir la app | Pantalla de login. Un logout explícito no se rehidrata |

## Parte 4 — El `device_id` no se pierde (crítico)

Si la sesión se rehidratara por un camino que no reenvía el `deviceId`, el JWT
nuevo vendría con `device_id: null` y los tickets saldrían por la impresora
equivocada.

| # | Paso | Esperado |
|---|---|---|
| 1 | Con la app reabierta y la sesión rehidratada, verificar en el servidor el JWT emitido | Conserva el `device_id` de esa terminal, no `null` |
| 2 | Crear una venta y imprimir el ticket | Sale por la impresora de **esa** terminal |
| 3 | Crear un delivery e imprimir | Sale por la impresora del delivery |
| 4 | Repetir tras un login por **QR** y una rotación | El device grant firma `device_id: null`, pero la primera rotación lo corrige |

## Parte 5 — Rutas por hash (el reload que rompía la app)

| # | Paso | Esperado |
|---|---|---|
| 1 | Con la app abierta y logueada, mirar la URL (DevTools → `location.href`) | Termina en `index.html#/` — **no** en `file:///` a secas |
| 2 | Cerrar sesión y volver a mirar | `index.html#/login`. Antes quedaba `file:///login`, la raíz del filesystem |
| 3 | Estando en el login, usar **Recargar la aplicación** | La app recarga y muestra el login. Antes: pantalla en blanco y `ERR_FILE_NOT_FOUND` en `main.log`, sin recuperación posible sin reiniciar |
| 4 | Loguearse, recargar la aplicación otra vez | Vuelve a entrar normal |
| 5 | Repetir 1–4 en modo **standalone** | Igual: el defecto era transversal a los tres modos |

## Parte 6 — Que no se haya roto la web `/admin`

La web sirve el mismo bundle de Angular con `base-href /admin/`.

| # | Paso | Esperado |
|---|---|---|
| 1 | Abrir `http://<servidor>:7070/admin/` y loguearse | Entra normal; la URL queda `/admin/#/` |
| 2 | Recargar con F5 estando logueado | Sigue logueado (ese shim persiste sus tokens en `localStorage`) |
| 3 | Cerrar sesión | Va al login, sin quedar en blanco |

---

## Tests automáticos

```bash
npm run test:sesion-cliente   # 18 asserts — almacén local + emitir/rotar/revocar
npm run test:api-map          # regresión del contrato del preload
npm run check                 # AOT, antes de pushear
```

El test del almacén ejercita el **fallback de archivo** (sin keyring), que es el
camino real en una PC de reparto, y verifica que el archivo quede en `0600`.
