# Dominio: Cocina e impresión térmica

Sistema de impresoras térmicas configurables (driver `epson` / `star`, default EPSON) con `node-thermal-printer`. Conexiones: **system** (spooler del SO por nombre — 2026-07), network (TCP raw), lpr (LPD), usb/serial, bluetooth. Impresión de tickets estructurados (`TicketSpec`), comandas de cocina multi-sector, y KDS digital como alternativa. Descubrimiento de impresoras del SO y de la red (2026-07).

## Entidad Printer

`src/app/database/entities/printer.entity.ts` (tabla `printers`). Nombres reales de columnas (¡no `nombre`/`tipo`/`conexion`!):

```typescript
{
  name: string
  type: string                          // driver: 'epson' | 'star' (default EPSON si desconocido)
  connectionType: string                // 'network' | 'usb' | 'serial' | 'bluetooth' | 'lpr'
  address: string                       // IP, IP/QueueName (lpr), USB device path, MAC bluetooth
  port?: int                            // 9100 default network / 515 default lpr
  dpi?: int
  width?: int                           // ancho físico en mm; printerWidthToChars() lo pasa a chars (58mm→32, 80mm→48)
  characterSet?: string                 // PC437_USA | PC850_MULTILINGUAL | etc.
  isDefault: boolean
  options?: text                        // JSON serializado
  rol?: string                          // fallback global de rol: TICKET_VENTA | COMANDA | PRECUENTA | OFICINA | null
}
```

`rol` es un atajo de enrutamiento global (cuando NO se quiere configurar la M2M `SectorImpresora`): una impresora con `rol='TICKET_VENTA'` se usa para todos los tickets de venta del sistema. La M2M por sector sigue siendo el mecanismo principal. NO existe campo `activo`.

## Configuración por conexión

| Conexión | address | Driver real |
|---|---|---|
| **`system`** (2026-07) | **nombre de la impresora instalada en el SO** | RAW por el **spooler del SO** vía `interface: 'printer:<nombre>'` de node-thermal-printer + driver nativo **`@thiagoelg/node-printer`** (`printDirect` type RAW). Es la vía recomendada para una **USB local en Windows** — sin LPD/share/ANONYMOUS LOGON/firewall. El usuario elige de una lista (dropdown poblado con `list-system-printers`). |
| `network` | `IP` + campo `port` (default 9100) | TCP raw vía `node-thermal-printer` (`tcp://<IP>:<port>`) |
| `lpr` | `IP/QueueName` + campo `port` (default 515) | Cliente LPR propio (RFC 1179) en `electron/utils/lpr.utils.ts`. Usa `node-thermal-printer` solo para armar el buffer ESC/POS en memoria, después envía vía LPR. Pensado para impresoras USB compartidas en otra PC Windows. |
| `usb` / `serial` | path device (`/dev/usb/lp0` Linux, `\\.\COM3` Windows). Caso especial: si `connectionType==='usb'` y `address` empieza con `'ticket-'` → usa `lp -d <name>` (CUPS local) en vez de `node-thermal-printer` | `node-thermal-printer` con path directo |
| `bluetooth` | `bt:<MAC>` | `node-thermal-printer` |

### LPR (RFC 1179) — impresora USB compartida en otra PC Windows

Para el caso "impresora USB conectada a una PC Windows que comparte por LAN sin hardware extra", usamos el cliente LPR propio que implementa el protocolo nativo de Windows (Servicios de impresión LPD).

**Wire format** (lo que mandamos al server LPD):
1. `\x02<queue>\n` → espera ACK `\x00`
2. `\x02<ctrlSize> cfA<jobId><hostname>\n` → ACK → control file body + `\x00` → ACK
3. `\x03<dataSize> dfA<jobId><hostname>\n` → ACK → bytes ESC/POS + `\x00` → ACK

**Control file BSD format** (lo emite `sendLprJob`):
```
H<hostname>
P<user>
J<jobname>
ldfA<jobId><hostname>
UdfA<jobId><hostname>
N<jobname>
```

**Setup en la PC Windows que tiene la impresora USB** (orden crítico):

1. **Activar feature LPD**: *Panel de control → Activar/desactivar características Windows → Servicios de impresión y documentos → ✅ Servidor LPD*. Reinicia el Spooler automáticamente.
2. **Agregar la impresora** localmente en Windows. **Driver recomendado: "Generic / Text Only"** (Fabricante: Genérico) para que los bytes ESC/POS pasen raw al USB sin interpretación del spooler.
3. **Compartir** la impresora con un *Share name* sin espacios, ej: `Cocina`, `Barra`, `Parrila`. Ese share name es el **queue name** que va después del `/` en el campo `address` de la app.
4. **Firewall**: regla entrante TCP 515 permitida en **ambos perfiles** (privada y pública).
5. ⚠️ **Crítico**: agregar `ANONYMOUS LOGON` con permiso "Imprimir" al ACE de la impresora compartida (*click derecho → Propiedades → Seguridad → Agregar → "ANONYMOUS LOGON" → Imprimir*). **Sin este paso, LPDSVC rechaza con código `\x01` cualquier petición remota** aunque acepte loopback local. Detalles → [[feedback-windows-lpd-anonymous-logon]].

**Verificación** desde otra máquina:
```bash
printf '\x02barra\n' | nc -w 3 <ip-windows> 515 | xxd
# Esperado: 00 (ACK). Si retorna 01, falta el ACE ANONYMOUS LOGON.
```

**No requiere** el servicio LPR/cliente de Windows del lado de la app — solo el lado servidor LPD donde está la impresora.

## Handlers

### `electron/handlers/printers.handler.ts` (ABM de impresoras)
- `get-printers`: lista todas
- `add-printer`: crear (si `isDefault=true`, desactiva las demás). Permiso `IMPRESORAS_GESTIONAR`
- `update-printer`: editar (usa `Not(printerId)` para no desmarcarse a sí misma al setear default)
- `delete-printer`
- `print-test-page(printerId)`: genera contenido de prueba y llama `printPosReceipt()` (utility)
- **`list-system-printers`** (2026-07): impresoras instaladas en el SO vía `event.sender.getPrintersAsync()` (Electron). Sin dependencias. En `ALWAYS_LOCAL_CHANNELS` (hardware local del cliente).
- **`scan-network-printers({mdns?, tcpScan?, tcpPort?})`** (2026-07): descubre impresoras de red — mDNS (`bonjour-service`, JS puro) de `_pdl-datastream/_printer/_ipp` + barrido TCP opcional del /24 local en `:9100`. Util en `electron/utils/network-printer-scan.utils.ts`. Best-effort, nunca lanza.
- **`test-printer-connection(config)`** (2026-07): prueba conectividad sin guardar ni imprimir (`probePrinterConnection` en `ticket.utils.ts`). network/system → build + isPrinterConnected; lpr → TCP a `:515`; usb/serial/bluetooth → ok optimista.

**Spooler del SO (`system`):** `electron/utils/system-printer.utils.ts` → `getSystemPrinterDriver()` hace `require('@thiagoelg/node-printer')` **lazy + tolerante a fallos** (no rompe dev/Linux; falla con mensaje claro solo al imprimir). El módulo es **`optionalDependency`** con `asarUnpack` — se compila en el release de Windows; en Linux necesita CUPS para compilar (si no compila, la vía `system` degrada). `buildThermalPrinter` (ticket.utils) y `printPosReceipt` (printer.utils) tienen branch `system` que pasa `interface: 'printer:<addr>'` + `driver`, con `isPrinterConnected` envuelto en try/catch (el interface `printer:` hace `throw false` si no está disponible).

> ⚠️ **Packaging (bug resuelto 2026-07):** `release.yml` instala con `npm ci --omit=optional` (para saltear `canvas`/cairo, que rompe el build). Como `@thiagoelg/node-printer` es una `optionalDependency`, ese flag **también lo excluía del bundle** → la app instalada en Windows tiraba `Cannot find module '@thiagoelg/node-printer'` al imprimir por la vía `system`. Fix: paso extra en el job `build` (solo Windows) que hace `npm install --no-save @thiagoelg/node-printer@0.6.2` después del `npm ci` (verificado que `--no-save` no re-arrastra canvas), para que electron-builder lo empaquete y recompile contra Electron. **Si volvés a tocar el install de CI, no vuelvas a un `--omit=optional` global sin re-incluir este módulo.**

### `electron/handlers/documentos-tickets.handler.ts` (impresión de tickets — implementado)

Cada handler `print-*` retorna `{ ok, printed: [...], errors: [...] }` y **nunca hace throw** (el caller decide si bloquea o muestra toast). Las funciones `printXxxInternal(...)` son reusables desde los hooks de auto-impresión (sin chequeo de permisos; esos viven en los wrappers IPC). Contenido vía `TicketSpec` estructurado + `printTicketSpec(printer, spec)` de `ticket.utils.ts`.

- `print-comanda({ventaId, soloItemsNoImpresos?, sectorIdFilter?, forceReprint?})`: ticket de cocina multi-sector. La venta debe tener mesa o comanda.
- `print-venta-ticket({ventaId, printerId?})`: comprobante de venta.
- `print-precuenta({ventaId, printerId?})`: pre-cuenta (no fiscal).
- `print-recibo-cobro-cuota-ticket`, `print-recibo-pago-cuota-ticket`, `print-retiro-caja-ticket`, `print-vale-ticket`, `print-pagare-cpc-ticket`, `print-etiqueta-delivery`, `print-acreditacion-pos-ticket`, `print-conteo-caja-ticket`.

Resolución de impresora por rol (`getPrinterByRol`): 1) `printerId` explícito; 2) `dispositivoId` + rol TICKET_VENTA/PRECUENTA → `Dispositivo.printerTicket` (impresora local del PdV); 3) `sectorId` → M2M `SectorImpresora`; 4) fallback global `Printer.rol`; 5) `Printer.isDefault`.

### Ruteo por sector (ABM)
- `electron/handlers/producto-sectores.handler.ts`: `get-producto-sectores(productoId)`, `set-producto-sectores(productoId, sectorIds[])`.
- `electron/handlers/sectores-impresoras.handler.ts`: `get-sectores-impresoras`, `get-sector-impresoras-by-sector(sectorId)`, `create-sector-impresora`, `update-sector-impresora`, `delete-sector-impresora`.

### `electron/handlers/kds.handler.ts` (Kitchen Display System — implementado)
- `get-kds-comandas({sectorIds?, estados?, incluirEntregados?})`: feed de items en preparación (filas planas por (ventaItem, sector); el front agrupa por venta en tickets).
- `update-comanda-item-estado(id, nuevoEstado)`, `bump-comanda-item(id)` (avanza), `recall-comanda-item(id)` (retrocede). Flujo PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO (o CANCELADO). Sella timestamps y emite evento (`broadcastComandaEvent`) para refrescar pantallas en vivo.
- ABM de `KdsPantalla`: `get-kds-pantallas`, `get-kds-pantalla`, `create-kds-pantalla`, `update-kds-pantalla`, `delete-kds-pantalla`.
- Estos handlers NO imprimen — solo mueven estado digital, reusando el ruteo por sector.

## Utility printer.utils.ts

`electron/utils/printer.utils.ts` → `printPosReceipt(printer, content): Promise<boolean>` (usado por `print-test-page`; los tickets estructurados van por `printTicketSpec` de `ticket.utils.ts`). Devuelve boolean, **no hace throw**:

```typescript
async function printPosReceipt(printer, content): Promise<boolean> {
  // 1. CUPS shortcut: connectionType==='usb' && address.startsWith('ticket-')
  if (printer.connectionType === 'usb' && printer.address.startsWith('ticket-')) {
    exec('lp -d <address> <tempFile>')   // funciona en cualquier OS con CUPS
    return true
  }

  // 2. Resolver interface según connectionType
  //    network → tcp://<address>:<port||9100>
  //    usb/serial → address (path directo)
  //    bluetooth → bt:<address>
  //    lpr → 'tcp://127.0.0.1:1' (dummy; el ThermalPrinter solo arma el buffer)
  const thermalPrinter = new ThermalPrinter({
    type: getPrinterType(printer.type),            // EPSON | STAR
    interface: interfaceConfig,
    width: printerWidthToChars(printer.width),     // mm físicos → chars (58→32, 80→48)
    characterSet: getCharacterSet(printer.characterSet) ?? PC437_USA,
  });

  // 3. LPR: armar buffer ESC/POS y enviarlo por sendLprJob (NO usa execute())
  if (printer.connectionType === 'lpr') {
    thermalPrinter.alignCenter(); thermalPrinter.println(content);
    thermalPrinter.cut(); thermalPrinter.beep();
    const buffer = thermalPrinter.getBuffer();
    return (await sendLprJob(buffer, { host, port||515, queue, ... })).ok
  }

  // 4. Resto: verificar conexión + imprimir
  if (!await thermalPrinter.isPrinterConnected()) return false
  thermalPrinter.alignCenter(); thermalPrinter.println(content);
  thermalPrinter.cut(); thermalPrinter.beep();
  await thermalPrinter.execute();
  return true
}
```

## Qué se imprime (estado actual)

| Documento | Estado | Handler / función |
|---|---|---|
| Test page | ✅ | `print-test-page` |
| Ticket de venta | ✅ con auto-impresión al cobrar (`PdvConfig.autoImprimirTicketVenta`) | `print-venta-ticket` / `printVentaTicketInternal` |
| Comanda de cocina | ✅ con auto-impresión al agregar items (`PdvConfig.autoImprimirComanda`), multi-sector + worker de retry | `print-comanda` / `printComandaInternal` |
| Pre-cuenta | ✅ | `print-precuenta` |
| Recibo cobro/pago de cuota (CPC/CPP) | ✅ | `print-recibo-cobro-cuota-ticket` / `print-recibo-pago-cuota-ticket` |
| Retiro de caja | ✅ | `print-retiro-caja-ticket` |
| Vale / adelanto funcionario | ✅ | `print-vale-ticket` |
| Pagaré CPC (venta a crédito) | ✅ | `print-pagare-cpc-ticket` |
| Etiqueta delivery | ✅ | `print-etiqueta-delivery` |
| Acreditación POS | ✅ | `print-acreditacion-pos-ticket` |
| Acta de conteo de caja | ✅ | `print-conteo-caja-ticket` |
| Resumen completo de cierre de caja | ❌ TODO | — |
| Recibo de liquidación RRHH | ❌ TODO (existe `comprobante_url` en LiquidacionSueldo) | — |

## Qué ítems entran al ticket de venta / pre-cuenta

**Sólo los `VentaItem` con `estado = ACTIVO`.** El contenido lo arma
`buildVentaTicketLines(dataSource, ventaId, { width, isPrecuenta })` — separada de
`printVentaTicketInternal` justamente para poder testearla sin impresora; devuelve
`{ lines, bruto, descItems, descuentoTotal, totalPrincipal, itemsImpresos }`.
`printVentaTicketInternal` sólo resuelve la impresora y manda a imprimir.

Hasta 2026-08 el ticket cargaba **todos** los ítems sin filtrar por estado: un ítem
cancelado en el PdV salía impreso y, peor, sumaba a los totales → **total inflado**, y
el mozo le mostraba al cliente más de lo que debía pagar. Fix: filtro
`estado: EstadoVentaItem.ACTIVO`, mismo criterio que ya usaban la comanda, el cobro, el
descuento de stock y los reportes.

> **Gotcha importante: `Venta.total` NO se persiste nunca.** Ningún flujo del repo lo
> escribe — al cobrar, `cobrar-venta-dialog` manda `estado`/`formaPago`/`pago`/
> `fechaCierre` y nada más; la venta a crédito (`cuentas-por-cobrar.handler.ts`) tampoco.
> Por eso el TOTAL del ticket **siempre** sale del recálculo local
> `bruto - descItems - descPago + aumPago` (la rama `venta.total > 0` de
> `buildVentaTicketLines` es defensiva y hoy no se ejecuta), y por eso el ítem cancelado
> inflaba también el comprobante post-cobro, no sólo la pre-cuenta. Ojo al leer otros
> módulos: hay consumidores de `Venta.total` que por esto reciben 0 — ver
> [reference/known-bugs.md](../reference/known-bugs.md).

**Adicionales/extras:** se listan como sub-líneas indentadas bajo su producto
(`+ EXTRA QUESO`, `+ 2x TOCINO`), sólo los `activo = true` y sólo de ítems no
cancelados. **Sin monto por adicional**: en pizzas `VentaItem.precioAdicionales` está
ponderado por la proporción de cada sabor (`pdv.component.ts` → `addVariacionItem`), así
que la suma de los `precioCobrado` de las filas `VentaItemAdicional` NO coincide con lo
que se cobra. La plata siempre sale de `precioAdicionales`, nunca de recalcular las filas.

`getVentaItemAdicionales` también filtra `activo = true`.

Test: `npm run test:ticket-venta` (`scripts/test-ticket-venta-e2e.ts`) — arma el ticket
contra SQLite y lo asserta sobre `renderTicketToPlainText`. Pruebas manuales:
`docs/testing/TESTING-CHECKLIST-TICKET-CANCELADOS.md`.

## Estructura de un ticket de venta (ilustrativo)

> Layout de referencia. La salida real la arma `buildVentaTicketLines` con `ticketHeaderEmpresa` (datos de empresa/timbrado desde BD) y columnas CANT/DESCRIPCION/TOTAL via `ticketColumns`. El título real es "COMPROBANTE DE VENTA" (la pre-cuenta no lleva título; cierra con `*** NO ES COMPROBANTE FISCAL ***`).

```
==============================
       FRC GOURMET
   Calle Falsa 123 - Asunción
       Tel: 021-123456
==============================
Fecha: 2026-05-05 14:32
Mesa:  3
Cajero: Juan Pérez
==============================
Cant  Producto              Precio
------------------------------
 1    Pizza Margherita      45.000
 2    Coca Cola 500ml        8.000
        (Sub: 16.000)
 1    Empanada Carne         5.000
------------------------------
Subtotal:                   66.000
Descuento (10%):            -6.600
TOTAL:                      59.400
==============================
Forma pago: EFECTIVO
Pago:       60.000 PYG
Vuelto:        600 PYG
==============================
       Gracias por su visita
```

## Estructura de una comanda de cocina

Salida real de `printComandaInternal` (un ticket por impresora/sector). El encabezado de empresa lo arma `ticketHeaderEmpresa`:

```
==============================
** COMANDA - COCINA **
   2026-05-05 14:32:10
------------------------------
MESA               3
VENTA              #123
------------------------------
1  PIZZA MARGHERITA
   SIN OREGANO / + EXTRA QUESO
2  COCA 500ML
==============================
```

El enrutamiento a estación (cocina, barra, parrilla, etc.) es **100% por la M2M `producto_sectores`** (ver abajo), NO por un campo `Producto.estacion` (ese campo no existe). El flag `Producto.requiereComanda` decide si el item se imprime; mesa/comanda solo deciden SI imprimir, no DÓNDE.

## Documentación existente

`docs/integraciones/thermal-printer-implementation.md` (cubre `PrinterConfig`, `printThermalReceipt`, `getPrinterType`, `getCharacterSet`, `generateReceiptContent`, manejo por OS).

`docs/integraciones/imagenes-perfil.md` (parcialmente desactivado para producto-images, vigente para profile-images).

`thermal-printer-example.ts` (en root) — referencia / ejemplo histórico.

## Implementado

- [x] **Botón "Reimprimir comanda"** en el PdV (`pdv.component.ts:reimprimirComanda` → `api.callIpc('print-comanda', {ventaId, forceReprint:true})`). Menú en `pdv.component.html`.
- [x] **Auto-impresión de comanda al agregar items** — `ventas.handler.ts:autoPrintComandaIfNeeded`, gate por `venta.mesa || venta.comanda` + `PdvConfig.autoImprimirComanda`. Routing por M2M `producto_sectores` → `sectores_impresoras` (rol COMANDA). Tracking en `venta_items.impreso`/`fecha_impresion`/`impresiones` (JSON log por sector) + worker de retry para items fallidos.
- [x] **Auto-impresión de ticket al cobrar venta** — `updateVenta(CONCLUIDA)` dispara `printVentaTicketInternal` si `PdvConfig.autoImprimirTicketVenta`.
- [x] **Pre-cuenta antes de cobrar** — `print-precuenta`.
- [x] **Relación Producto → Sector(es) → Impresora(s)** — M2M `producto_sectores` + `sectores_impresoras` + flag `Producto.requiereComanda`. UI en `gestionar-producto` (multi-select) y `Configuración → Sectores e impresoras` (`sectores-impresoras-settings.component`).
- [x] **KDS (Kitchen Display System)** — `kds.handler.ts` + entidad `KdsPantalla` + páginas en `src/app/pages/ventas/kds/`.
- [x] **Conexión LPR seleccionable** en `printer-settings` (con port default 515 y texto de ayuda del formato `IP/recurso`).

## Pendientes (TODO)

- [~] **Wizard de configuración LPR** (UI guiada). **Parcialmente superado (2026-07):** para una USB local en Windows ahora conviene la conexión **`system`** (spooler por nombre, sin LPD ni ACE). El botón **"Probar conexión"** ya existe (`test-printer-connection`). El wizard LPR guiado sigue pendiente para el caso de impresora compartida en OTRA PC. ⚠️ **Validación funcional de `system`/mDNS pendiente en Windows real** (no testeable en CI Linux; solo se verificó compilación).
- [ ] Templates ESC/POS configurables por tipo de impresora.
- [ ] Recibos de liquidación RRHH PDF (campo `comprobante_url` ya existe).
- [ ] Resumen completo de cierre de caja imprimible (hoy existe `print-conteo-caja-ticket`, acta breve de conteo).

`PrinterService` Angular en `src/app/services/printer.service.ts`. Componente `PrinterSettingsComponent` en `src/app/components/printer-settings/`. Settings de ruteo en `src/app/components/sectores-impresoras-settings/`. Eventos de impresión en vivo: `src/app/services/printer-events.service.ts`.

---

## Actualización 2026-07 — KDS (frontend) + impresión

### KDS (Kitchen Display Screen) — capa frontend/PWA

Un **único `KdsComponent`** reusado por 3 superficies:
- **Desktop (tab):** `src/app/pages/ventas/kds/kds.component.ts`, abierto con `openKdsTab()` (menú, permiso `COMANDAS_KDS_VER`).
- **PWA / TV:** exportado por `shared-core/public-api.ts`, envuelto por `projects/mobile/src/app/pages/kds/kds.page.ts`, ruta `/kds` (full-screen, fuera del shell, `authGuard`).

**Transporte** (`esWeb = !(window.api?.callIpc)`): en Electron/PWA usa `callIpc`; en navegador puro (Google TV) hace `fetch` a `${webBase}/api/rpc` con Bearer. ⚠️ El router `/api/rpc` responde `{result: <valor>}` mientras `callIpc` devuelve el valor directo → hay que **desenvolver `data.result`** en web (`5e0e73c`). Token/server de query o `localStorage` (`kds.token`/`kds.server`).

**Tiempo real:** Electron → canal IPC `onComandaEvent`. Web con token → **SSE** a `/api/kds/stream?token=&sectores=` (`electron/server/kds-sse-routes.ts`, auth por token en query porque EventSource no manda headers; heartbeat 25s). PWA (shim sin token en query) → cae al **poll de respaldo de 12s**. Tick de 1s para timers/semáforo.

**Modo TV** (`7abfe85`): `tvMode` = escala grande + márgenes anti-overscan (persistido); `toggleFullscreen()`. **Detalle por ítem** (`761e400`): removidos/cambios/adicionales/observaciones (mismo detalle que el ticket de cocina; el handler `get-kds-comandas` los adjunta desde `VentaItemAdicional`/`VentaItemObservacion`/`VentaItemIngredienteModificacion`). **Bump bar/numpad:** escribir nº de ticket + Enter = bump; clic = avanza, clic derecho = recall. **Semáforo** verde/amarillo/rojo por antigüedad (umbrales configurables por `KdsPantalla`). ABM de pantallas: `list-kds-pantallas` + `create-edit-kds-pantalla-dialog`.

Auth del TV: reusa el `authGuard` + shim HTTP del PWA (`154f193`); se loguea una vez con un usuario de servicio (`COMANDAS_KDS_VER`) y el token se renueva solo.

### Impresión — cambios

- **`printer.width` = COLUMNAS, no mm** (`5ad4eaf`/`3353173`). La UI (`printer-settings`) elige columnas directamente: 32 (58mm), 40 (matriz 76mm), 42/48 (80mm). `printerWidthToChars()` es dual: `< 50` = ya es cantidad de columnas; `>= 50` = valor legacy en mm mapeado por densidad. (Reemplaza la nota vieja de "ancho en mm".)
- **`connectionType` térmica genérica:** drivers `epson`/`star`/**`thermal`**.
- **Comanda de cocina mejorada** (`53fc2fa`, `bf5ed4a`): `SIN X` invertido, `ADD`/adicionales, `CAMBIAR` en negrita, mesa/ticket en grande, corte + safe-area. **Pizza estructurada, una por línea** (`bf5ed4a`): se arma desde `VentaItemSabor` (`recetaPresentacion.sabor/.presentacion`), imprime tamaño + `1/N` por sabor (fracción si proporción uniforme, `%` si manual) en `size:'tall'` bold.
- **Ticket de cierre de caja** (`a4761a4`): handler `print-cierre-caja({cajaId, printerId?})` + `printCierreCajaInternal` usando `resumen-caja.utils.ts` `computeResumenCaja()` (apertura/cierre, tiempo abierto, arqueo por moneda, retiros). **Auto-impresión al cerrar** desde `create-caja-dialog`. Distinto de `print-conteo-caja-ticket` (acta breve).

> Ambos TODOs históricos "KDS" e "impresión real de tickets/comandas" quedan **completados** con esto (ver [workflows/todos-pendientes.md](../workflows/todos-pendientes.md)).


---

## El detalle del ítem en los tickets (2026-08-25)

Los tres tickets —venta, pre-cuenta y delivery— arman el detalle de cada ítem
con **`cargarDetalleDeItems`** (`documentos-tickets.handler.ts`): variación,
ingredientes sacados, cambios, adicionales y observaciones, todo en una consulta
por lote.

Antes esa recolección vivía **adentro de `printComandaInternal`**, así que la
comanda de cocina era el único ticket que mostraba el detalle: el del cliente
imprimía sólo el nombre del producto —«1 PIZZA» en vez de «1 PIZZA GRANDE
CALABRESA, sin cebolla»—, y en delivery esa hoja es lo único que recibe.

**La fuente común no lleva prefijos.** Cada ticket pone el suyo: la cocina usa
`ADD` y `>>` y el video invertido para lo que hay que sacar; el del cliente usa
`+` y texto plano. Si agregás un prefijo en la recolección, se filtra a los tres.

**El nombre se compone en vivo**, no se lee de `RecetaPresentacion.nombre_generado`
— ver `electron/utils/nombre-variacion.utils.ts` y el apartado de abajo.

⚠️ **`ticketColumns` TRUNCA lo que no entra.** En una impresora de 58mm la
descripción tiene ~26 columnas, así que cualquier detalle largo se corta sin
aviso: «GRANDE · 1/2 CALABRESA + 1/2 4 QUESOS» salía como «1/2 CALABRESA +» y el
cliente perdía su segunda mitad. Por eso el detalle pasa por `envolverDetalle`,
que corta por palabra. Si agregás una línea nueva al ticket, usala.

### `nombre_generado` es un snapshot, no la verdad

`RecetaPresentacion.nombre_generado` se calcula UNA vez, al crear la variación.
Hasta 2026-08-25 nadie lo recalculaba: renombrar un producto, una presentación o
un sabor lo dejaba describiendo algo que ya no existe. En el catálogo real de
producción 8 de 61 estaban podridas («PICADA DE LA CASA…» con el producto ya
renombrado a «PICADA DON FRANCO»; «PIZZA GRANDE PIZZA» con el sabor ya renombrado
a «PEPPERONI»).

Ahora `update-sabor`, `update-producto` y `update-presentacion` llaman a
`recalcularNombresDeVariacion`. Aun así, **para cualquier cosa que vea el cliente
se compone en vivo**: el campo queda como caché para las pantallas de gestión.

### `mostrarEnNombre`

`Presentacion` y `Sabor` tienen `mostrarEnNombre` (default `true`). Sirve para
apagar una parte que no aporta: hay presentaciones llamadas «TRADICIONAL» que
existen sólo porque el nombre es obligatorio (QUESADILLAS salía como
«QUESADILLAS TRADICIONAL CARNE») y sabores únicos que no distinguen nada
(«MILANESITA DON FRANCO GRANDE TRADICIONAL»).

Es una marca explícita y **no** una heurística sobre el texto: en AROS DE CEBOLLA
y PAPAS FRITAS «TRADICIONAL» **sí** distingue, contra BACON Y CHEDDAR.

---

> 📄 **El catálogo completo de lo que imprime el sistema** —los 13 tickets, qué
> decide cada uno, quién lo recibe y las convenciones de formato— está en
> [tickets-impresos.md](tickets-impresos.md). Este documento cubre la cocina y
> el KDS; ese otro cubre el papel en general.

## El gate de "va a cocina" (2026-08-24)

Una venta genera `ComandaItem` -y por lo tanto llega al KDS y a la impresora del
sector- sólo si pasa el gate de `ventas.handler.ts`:

```ts
mesa || comanda || delivery || canalOrigen !== 'LOCAL'
```

Antes era sólo `mesa || comanda`, y por eso **los ítems de un delivery nunca se
imprimían en la impresora de su producto**: la venta de un delivery no tiene mesa
ni comanda. El único papel que salía era el ticket único del reparto, que usa el
rol `TICKET_VENTA` y no respeta la asignación por producto.

Al desplegar ese cambio, **la cocina empieza a recibir comandas de delivery que
antes no recibía**. Es lo correcto, pero es un cambio visible en la operación:
conviene avisar antes de que aparezcan tickets nuevos.

### Son TRES gates, y hay que moverlos juntos (2026-08-25)

El predicado de arriba está escrito en **tres lugares distintos**, y cada uno
decide una cosa diferente:

| Dónde | Qué decide |
|---|---|
| `ventas.handler.ts` → `crearComandaItemsSiCorresponde` | Si se crea el `ComandaItem` — o sea, si el KDS lo ve |
| `ventas.handler.ts` → `autoPrintComandaIfNeeded` | Si se dispara la impresión automática |
| `documentos-tickets.handler.ts` → `printComandaInternal` | Si efectivamente sale papel |

El fix de 2026-08-24 movió los dos primeros y **se olvidó del tercero**. El
síntoma fue de los peores posibles: el pedido aparecía en la pantalla de
cocina (gate 1 pasó), la impresión se disparaba (gate 2 pasó), y
`printComandaInternal` cortaba por el early return devolviendo `ok: true` **sin
un solo error**. Ningún delivery imprimió su comanda, y no había nada en los
logs que lo dijera. Se descubrió recién probando con la impresora física.

Los tres cargan hoy `relations: ['mesa', 'comanda', 'delivery']`. **Eso no es
opcional**: si una relación no se carga, `venta.delivery?.id` lee `undefined`,
el gate da false y volvés a tener el mismo bug mudo. Hay tests de regresión en
`scripts/test-ticket-venta-e2e.ts` (bloque «gate cocina»).

### La línea de tamaño no repite el nombre del producto

El encabezado del ítem ya imprime `1 PIZZA`. La línea siguiente lleva **sólo el
tamaño** (`GRANDE`), vía `componerEncabezadoComanda`. Componía
`producto + presentación` y salía `1 PIZZA` / `PIZZA GRANDE`. Respeta
`mostrarEnNombre` de la presentación: apagado, no imprime la línea.

Detalle en [domains/pedidos-online.md](pedidos-online.md) y
[domains/recetas-sabores-variaciones.md](recetas-sabores-variaciones.md).
