# API de FRC Gourmet para agentes y bots

Guía para que **cualquier agente, bot o integración** opere FRC Gourmet por HTTP: autenticarse, encontrar el método correcto, armar los parámetros y no romper nada. Todo lo que hace la app de escritorio pasa por los mismos métodos, así que con esto se puede hacer **todo** lo que permita el rol del usuario.

- **Catálogo completo de métodos** (generado del código, no editar a mano): [CATALOGO-RPC.md](CATALOGO-RPC.md). Regenerar con `python3 scripts/generate-api-catalog.py` en cada PR que agregue, quite o cambie un handler.
- **Recetas verificadas** (finanzas, compras, cajas): [RECETAS.md](RECETAS.md).
- Fuente de verdad: `electron/server/rpc-router.ts`, `electron/server/auth-routes.ts`, `electron/handlers/*.ts`.

## 1. Cómo funciona

Cada pantalla de la app llama a un **canal IPC** (`ipcMain.handle('<canal>', ...)`). En modo servidor (`app.frc-gourmet.com` o el servidor del local) esos mismos canales se exponen por un único endpoint:

```
POST /api/rpc
Authorization: Bearer <accessToken>
Content-Type: application/json

{"method": "<canal>", "params": [arg1, arg2, ...]}
```

Respuesta OK: `200 {"result": ...}`. No hay REST por recurso: **todo es `/api/rpc`**.

## 2. Autenticación

| Paso | Llamada | Notas |
|---|---|---|
| Login | `POST /api/auth/login` `{"nickname","password","deviceId"?}` | Devuelve `accessToken` (JWT, **15 min**), `refreshToken` (30 días), `usuario` (con `mustChangePassword`), `sessionId`. |
| Renovar | `POST /api/auth/refresh` `{"refreshToken","deviceId"?}` | Rota el refresh: guardar el nuevo. Error `refresh_invalido_o_expirado` → volver a loguear. |
| Salir | `POST /api/auth/logout` `{"refreshToken"}` | Revoca el refresh. |

- Ante `401` en `/api/rpc`: renovar el token (o loguear de nuevo) y repetir **una vez**.
- Si `usuario.mustChangePassword` es `true`, todo método con permiso responde `403 DEBE CAMBIAR SU CONTRASEÑA…`: cambiarla primero desde la app.
- `deviceId` (opcional) asocia la sesión a un dispositivo: los métodos de PdV que dependen de la caja del dispositivo (p. ej. `crear-compra-simplificada-caja`) lo necesitan.
- **El agente opera con los permisos del usuario con el que se loguea.** Usar un usuario propio por bot, con un rol mínimo (solo lectura si no escribe). Nunca el usuario de una persona.

## 3. Encontrar el método correcto

1. Buscar en [CATALOGO-RPC.md](CATALOGO-RPC.md) por palabra (módulo, entidad, verbo). Cada línea dice el tipo, los parámetros en orden y el permiso:
   `- E \`create-gasto\`(data) 🔒 CAJA_MAYOR_OPERAR`
2. **El nombre es EXACTO, sin alias ni traducción.** La mayoría va en kebab-case (`get-cuentas-bancarias`), pero ~185 métodos viejos van en camelCase (`getProveedores`, `getFormasPago`, `getMonedas`, `getResumenCaja`, casi todo `getVentas…`/`createVenta…`). Un nombre inventado da `404 Handler '…' no registrado en handlerRegistry`.
3. Para saber **qué campos** lleva un objeto (`data`, `filtros`, `payload`): abrir el handler (`electron/handlers/<módulo>.handler.ts`, buscar el canal) y, si hace falta, la entidad (`src/app/database/entities/**`). Para entender **qué hace la pantalla**, buscar el canal en `src/app/**` (servicio Angular que lo llama).
4. Si existen dos métodos parecidos, preferir el que usa la pantalla actual (buscar en `src/app`). Los métodos viejos documentados como "no usar" están en [RECETAS.md](RECETAS.md) §Compras.

## 4. Parámetros

- `params` es un **array posicional**, en el orden del handler (el primer argumento del handler, `event`, no se manda).
  - Recibe un objeto → `"params":[{...}]`. Id y datos → `"params":[5,{...}]`. Nada → `"params":[]`.
- Relaciones: según el método van como **ids sueltos** (`monedaId`, `cajaMayorOrigenId`) o como **objetos** (`gastoCategoria:{id:3}`). Copiar lo que hace el handler o la receta.
- **Nunca inventar ids.** Leerlos antes: `get-monedas`, `getFormasPago`, `get-cajas-mayor`, `get-cuentas-bancarias`, `get-gasto-categorias`, `getProveedores`, `get-dispositivos`.
- Fechas: ISO (`2026-10-26T10:00:00`) o `YYYY-MM-DD` según el filtro. Decimales: pueden venir como número o como string según el método/base: convertir siempre.
- Paginación **no uniforme**: `get-compras-paginado` arranca en `page:1`; la mayoría (`get-operaciones-financieras`, `get-movimientos-cuenta-bancaria`, `get-caja-mayor-movimientos`, `get-cuentas-por-pagar`, `get-entradas-varias`) arranca en `page:0` y solo pagina si se manda `pageSize` (devuelve `{items,total}`, con `total` del histórico completo); sin `pageSize` devuelve un array. Siempre filtrar por fecha para no traer todo.

## 5. Errores

| Código | Significado | Qué hacer |
|---|---|---|
| 401 | Token vencido o inválido | Renovar y repetir una vez. |
| 403 `channel_bloqueado_para_http` | Método solo local (§7) | No se puede por HTTP. No buscar atajos. |
| 403 `PERMISO REQUERIDO …` | El usuario no tiene ese permiso | Pedir el permiso al administrador; no probar otro método "parecido". |
| 404 `no registrado` | Nombre mal escrito o método que no existe en la versión instalada | Revisar el catálogo. Si el nombre es exacto, la versión del servidor es más vieja: avisar. |
| 500 | Error del handler (validación, FK, dato faltante) | Leer el mensaje; corregir los datos. No reintentar a ciegas. |

## 6. Reglas para escribir

1. **Leer antes de escribir**: verificar el estado actual y que la operación no esté ya hecha (evitar duplicados: buscar por número de comprobante, fecha y monto).
2. Clasificación del catálogo: **L** lectura · **E** escritura · **D** destructivo (borra, anula, cancela, cierra) · **B** bloqueado por HTTP. Las E y D cambian datos reales: el agente necesita la aprobación que le corresponda en su plataforma, y las **D solo con OK explícito de una persona responsable**.
3. Una operación por llamada y verificar el resultado con una lectura.
4. Muchas escrituras **no validan saldo** (cajas y cuentas pueden quedar negativas) y varias pasan textos a MAYÚSCULAS.
5. Sin arreglos retroactivos ni "correcciones" de datos sin pedido. Nunca operar la caja que abrió otra persona (cerrarla, ajustarla).
6. Ojo con idempotencia: `anular-gasto` de un gasto bancario **acredita otra vez si se anula dos veces**; `create-*` repetido crea dos registros.
7. La clasificación L/E/D es por nombre: algunas "lecturas" crean una configuración por defecto si falta (marcadas en el catálogo). Ante la duda, leer el handler.

## 7. Bloqueados por HTTP

Lista en `BLOCKED_CHANNELS` y `BLOCKED_PREFIXES` de `electron/server/rpc-router.ts` (marcados **B** en el catálogo): sesión local, reset de base, reinicio, backup/restore, configuración de base y modo de la app, música, auto-update, secretos (notificaciones, IA, refresh del modo cliente), seeds, MAC, selector de archivos, túnel remoto y todo `window:*`. Devuelven 403 aunque existan.

## 8. Otros endpoints (no RPC)

`electron/server/`: `file-routes.ts` (archivos e imágenes), `public-routes.ts` (rutas públicas, p. ej. menú), `kds-sse-routes.ts` / `mesa-sse-routes.ts` / `musica-sse-routes.ts` (eventos en vivo por SSE), `device-auth-routes.ts` (alta de dispositivos por QR), `qr-upload-routes.ts`. Un agente normalmente no los necesita.

## 9. Mantener esta guía

- Handler nuevo, renombrado o borrado → regenerar el catálogo en el mismo PR (`python3 scripts/generate-api-catalog.py`; `--check` falla si quedó desactualizado).
- Flujo nuevo que un agente vaya a usar seguido → agregar su receta en [RECETAS.md](RECETAS.md), con el ejemplo de `params`.
