# Dominio: Cocina e impresión térmica

Sistema de impresoras térmicas configurables (driver `epson` / `star`, default EPSON) con `node-thermal-printer`. Conexiones: network (TCP raw), lpr (LPD), usb/serial, bluetooth. Impresión de tickets estructurados (`TicketSpec`), comandas de cocina multi-sector, y KDS digital como alternativa.

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

## Estructura de un ticket de venta (ilustrativo)

> Layout de referencia. La salida real la arma `printVentaTicketInternal` con `ticketHeaderEmpresa` (datos de empresa/timbrado desde BD) y columnas CANT/DESCRIPCION/TOTAL via `ticketColumns`. El título real es "COMPROBANTE DE VENTA" (o "PRE-CUENTA").

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

- [ ] **Wizard de configuración LPR** (UI guiada). Hoy LPR es solo una opción más del form. Falta el diálogo con los pasos para configurar la PC Windows: activar feature LPD, driver Generic/Text Only, compartir con share name sin espacios, firewall TCP 515, **agregar ACE ANONYMOUS LOGON** (paso más fácil de olvidar; sin él LPDSVC rechaza con código `\x01`). Y un botón "Probar conexión" que haga el handshake `\x02<queue>\n` antes de guardar.
- [ ] Templates ESC/POS configurables por tipo de impresora.
- [ ] Recibos de liquidación RRHH PDF (campo `comprobante_url` ya existe).
- [ ] Resumen completo de cierre de caja imprimible (hoy existe `print-conteo-caja-ticket`, acta breve de conteo).

`PrinterService` Angular en `src/app/services/printer.service.ts`. Componente `PrinterSettingsComponent` en `src/app/components/printer-settings/`. Settings de ruteo en `src/app/components/sectores-impresoras-settings/`. Eventos de impresión en vivo: `src/app/services/printer-events.service.ts`.
