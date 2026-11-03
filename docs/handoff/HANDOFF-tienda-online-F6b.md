# Handoff: tienda online F6 + F6b (personalizar cada sabor). Prompt para continuar

> Copiá todo este archivo como primer mensaje al agente que siga. Está escrito para un agente que no vio la conversación.

---

## Prompt

Sos el desarrollador que sigue con la **tienda online de FRC Gourmet** (repo `GabFrank/frc-gourmet`, Electron + Angular + TypeORM, en producción en el restaurante Don Franco). Antes de tocar nada, leé `CLAUDE.md`, `.claude/skills/frc-gourmet-expert/SKILL.md` y `docs/arquitectura/RADIOGRAFIA-SISTEMA.md`. La documentación cuenta menos entidades y handlers de los que hay: confiá en el código.

### Reglas que no se negocian
- **Nunca** commit directo a `develop` ni a `master`, y **nunca** mergear sin el OK explícito del propietario (Gabriel). Don Franco está en el canal alpha: cada merge `fix:`/`feat:` a develop genera una alpha que se instala sola en producción.
- La tienda va en **PRs en borrador encadenados**. No se mergea nada hasta que el propietario lo diga.
- Si un cambio toca cobro, factura o punto de venta, hay que probarlo **cobrando y facturando de verdad** en un entorno de prueba antes del merge.
- `npm run test:all` en develop ya tiene ~9 suites rojas conocidas. Un PR **no puede sumar fallas nuevas**.

### Cadena de ramas (cada una sale de la anterior)
| Fase | Rama | PR | Estado |
|---|---|---|---|
| F1 seguridad del código de ingreso | `bot/ceo-frc-gourmet/feat-tienda-online` | #323 | borrador |
| F2 recorrido tienda + escritorio | `…-f2` | #324 | borrador |
| F3 claves WhatsApp/Google desde la app | `…-f3` | #326 | borrador |
| F4 pago con tarjeta (uPay) | `…-f4` | #342 | borrador |
| F5 correcciones de auditoría | `…-f5` | #344 | borrador (falta el visto bueno final del auditor) |
| **F6** UX de la carta | `bot/ceo-frc-gourmet/feat-tienda-online-f6` | **sin PR** | hecho, sin push hasta este handoff |
| **F6b** personalizar cada sabor | `bot/ceo-frc-gourmet/feat-tienda-online-f6b` | **sin PR** | hecho, sin push hasta este handoff |

Todas parten de una base vieja (`5979ae50`, antes de #317, #322, #190, #347 y #350). **Hay que rebasar la cadena sobre el develop actual** y volver a correr las pruebas.

**Primera tarea:** abrí los PR en borrador de F6 (base `…-f5`) y de F6b (base `…-f6`), con título `feat(tienda): …`.

### Qué hace F6 (carta), plan `docs/planes/PLAN-tienda-online-F6-ux-carta.md`
- La tienda se ve siempre en tema claro, aunque el celular esté en oscuro.
- Muestra una categoría por vez y se pueden crear **categorías propias** («Entradas»…), con orden, en `/admin/` → Ventas → Configuración → **Categorías de la Tienda** (entidad y migración `TiendaCategorias`).
- En la tarjeta del producto: foto a la izquierda, después nombre y descripción, y el botón de agregar a la derecha.
- Al volver del detalle queda la última categoría elegida, y la barra de categorías la deja visible (arreglo `eb9f21a5`).
- El detalle de la pizza abre desde arriba. Si el navegador pide un archivo de la app que ya no existe, la página se recarga sola con un aviso.

### Qué hace F6b (personalizar cada sabor), plan `docs/planes/PLAN-tienda-pizza-personalizar-sabor.md`
- En la página de la pizza, cada sabor elegido tiene su botón **«Personalizar»**, que abre una **hoja desde abajo** (lo decidió el propietario) para sacar ingredientes opcionales, cambiar los intercambiables y sumar adicionales de ese sabor. Funciona igual que el punto de venta.
- Interruptor `personalizar_sabores` en `tienda_online_config` (migración `1793727685955`, **apagado por defecto**). Se cambia en `/admin/` → **Config Tienda Online**.
- **Servidor:** `electron/utils/tienda-personalizacion-sabor.utils.ts` publica en `menu.get` lo que se puede tocar en cada receta, valida el pedido (13 motivos de rechazo) y calcula el precio. Cada adicional suma su precio × la proporción del sabor, con **un solo redondeo** sobre el total.
- **Materialización** (`materializarPedidoOnlineEnVenta`, `electron/handlers/ventas.handler.ts`): crea `VentaItemSabor` y le cuelga sus `VentaItemIngredienteModificacion` y `VentaItemAdicional`, igual que `persistirPersonalizacionConSabor` del punto de venta.
- **Pruebas:** `npm run test:pedidos-online` da 168/168. Incluye que la caja (`getEstadoCobroVentaInternal`) y los reportes (`getTotalesPorVenta`) cobren lo mismo que el pedido, y el mismo desglose que en el PdV. También pasan `test:tienda-seguridad`, `test:tienda-categorias` y `test:tienda-online-migracion`. La batería completa da 81 suites: 72 OK y 9 rojas, todas preexistentes (backup-http, mesa-ocupacion, mesa-una-venta-abierta, pago-consolidado, pago-consolidado-e2e, permisos, pg-backup, rate-limit-e2e y reporte-delivery).

### Lo que falta (en este orden)
1. **Decisión pendiente del propietario sobre #325.** `src/app/pages/facturacion/facturas/facturar-dialog/facturar-dialog.component.ts` (~L136) precarga cada línea de la factura con `precioVentaUnitario` y deja afuera `precioAdicionales`. Una pizza de ₲ 75.000 (70.000 + borde 5.000) se cobra bien, pero se factura por ₲ 70.000. Ya pasa en el PdV, y la tienda lo haría más frecuente. La recomendación es arreglar **#325 + #240** (que el servidor valide los ítems facturados) antes de prender la personalización. Preguntale al propietario si no lo decidió todavía.
2. **E2E por pantalla en el entorno de prueba:** aceptar un pedido personalizado → venta → cobro → factura, y comprobar que el total de la factura sea igual al del pedido. Requiere #325 resuelta. Mandale capturas al propietario.
3. Objeciones medias de la auditoría:
   - La bandeja de pedidos del escritorio no muestra el detalle por sabor.
   - Falta una prueba de stock: lo que se saca no baja del stock y el reemplazo sí.
   - El plan decía «encendido por defecto» y quedó apagado. Está declarado como desvío y es lo correcto mientras siga #325.
4. Rebasar F1→F6b sobre develop, volver a correr `test:all` y comparar contra develop.
5. Bloqueos externos de la tienda (los gestiona el propietario): credenciales de prueba de uPay, Client ID de Google, Phone Number ID de WhatsApp Business y la prueba de `puente.frcsuite.com`. Lo medio y bajo pendiente está en la issue #343.

### Qué tenés que lanzar para probar
Entorno de prueba con escritorio, PWA y tienda sobre una **SQLite nueva en cada arranque**. Nunca contra una base real.

```bash
npm ci
# Compilar las 3 apps (~4-5 GB de RAM; con poca memoria: NG_BUILD_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=2500)
npx ng build frc-gourmet --configuration web --base-href /admin/
npx ng build mobile --base-href /
npx ng build storefront --base-href /tienda/
# Levantar el servidor de prueba (Fastify + /api/rpc + todos los handlers)
npx ts-node --transpile-only --prefer-ts-exts --project tsconfig.typeorm.json scripts/servidor-prueba-tienda.ts 8000
```
- `http://localhost:8000/admin/` (escritorio), `/` (PWA) y `/tienda/` (tienda).
- **Usuarios:** `admin`/`admin` (todos los permisos) y `david`/`david` (rol admin, para lo que pide un segundo aprobador). Si no entra, probá en mayúscula.
- **Cliente de la tienda:** «Ingresar» → **Email** → «Crear cuenta», con cualquier email inventado y una clave de 8 caracteres o más. El código por WhatsApp no funciona en local.
- Para desarrollar con recarga en caliente: `npm start` (Electron + `ng serve` en el puerto 4201).

### Qué tiene que estar configurado (si no usás la semilla)
`scripts/servidor-prueba-tienda.ts` carga una semilla opcional desde `VISTA_SEMILLA_DIR` (`semilla.json` + `fotos/p-<productoId>.jpg`). Es el catálogo anonimizado de Don Franco y **no está en el repo**. Sin semilla, cargá a mano en `/admin/`:
1. **Moneda** principal PYG con su cotización y las **formas de pago** (por lo menos efectivo).
2. **Producto PIZZA** de tipo con variación: presentaciones (tamaños), **sabores** con su receta por tamaño y precio de venta principal.
3. En cada receta: ingredientes con **«Opcional»** (se pueden sacar) o **«Cambiable»** (con sus opciones de intercambio), y **adicionales vinculados** con su precio (por ejemplo, Borde cheddar).
4. Productos marcados como **disponibles online** y, si querés, categorías de la tienda.
5. **Config Tienda Online:** tienda activa, retiro en el local y/o pedido desde la mesa, pago online apagado y **«Personalizar cada sabor» encendido**.
6. **Timbrado** vigente con su detalle (establecimiento y punto), para poder facturar.
7. **Abrir una caja** en el punto de venta antes de aceptar pedidos: sin caja abierta, el pedido no se acepta.

### Pruebas útiles
`npm run test:pedidos-online`, `test:tienda-seguridad`, `test:tienda-categorias`, `test:tienda-online-migracion` y `test:all`. Las e2e usan SQLite temporal; las migraciones se prueban también contra Postgres local (`test:tienda-online-migracion`).
