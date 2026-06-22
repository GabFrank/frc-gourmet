# Dominio: Cocina e impresión térmica

Sistema de impresoras configurables (epson / star / thermal genérica) con node-thermal-printer.

## Entidad Printer

`src/app/database/entities/printer.entity.ts`:

```typescript
{
  nombre: string
  tipo: 'epson' | 'star' | 'thermal'   // tipo de driver
  conexion: 'network' | 'usb' | 'bluetooth'
  address: string                       // IP, USB device path, MAC bluetooth
  port?: int                            // 9100 default network
  characterSet?: string                 // PC437_USA | PC850_MULTILINGUAL | etc.
  width: int                            // chars (32 común, 48 wide)
  isDefault: boolean
  activo
}
```

## Configuración por conexión

| Conexión | address | Driver real |
|---|---|---|
| `network` | `IP` + campo `port` (default 9100) | TCP raw vía `node-thermal-printer` (`tcp://<IP>:<port>`) |
| `lpr` | `IP/QueueName` + campo `port` (default 515) | Cliente LPR propio (RFC 1179) en `electron/utils/lpr.utils.ts`. Usa `node-thermal-printer` solo para armar el buffer ESC/POS en memoria, después envía vía LPR. Pensado para impresoras USB compartidas en otra PC Windows. |
| `usb` | path device (`/dev/usb/lp0` Linux, `\\.\COM3` Windows). Si en macOS y address contiene `'ticket-'` → usa `lp` command (CUPS local) | `node-thermal-printer` con path directo |
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

`electron/handlers/printers.handler.ts` (129 líneas):
- `get-printers`: lista todas
- `add-printer`: crear (si `isDefault=true`, desactivar las anteriores con `Not(printerId)` en línea 60)
- `update-printer`: editar
- `delete-printer`
- `print-test-page(printerId)`: genera contenido de prueba y llama `printPosReceipt()` (utility)

## Utility printer.utils.ts

`electron/utils/printer.utils.ts:33-118` (`printPosReceipt(config, content)`):

```typescript
async function printPosReceipt(config, content) {
  // 1. CUPS shortcut (macOS, address con 'ticket-')
  if (Linux/macOS && address.contains('ticket-')) {
    exec('lp -d <name> <tempFile>')
    return
  }

  // 2. Configurar ThermalPrinter según tipo
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON | STAR,
    interface: 'tcp://...' | 'printer:USB...' | 'bt:...',
    width: config.width,
    characterSet: PC437_USA | PC850_MULTILINGUAL | ...
  });

  // 3. Verificar conexión
  isConnected = await printer.isPrinterConnected()
  if (!isConnected) throw new Error('Impresora no conectada')

  // 4. Imprimir
  printer.alignCenter();
  printer.println(content);
  printer.cut();
  printer.beep();
  await printer.execute();
}
```

## Qué se imprime (estado actual)

⚠️ **Implementación parcial**:

| Documento | Estado |
|---|---|
| Test page | ✅ implementado (`printers.handler.ts`) |
| Ticket de venta | ⚠️ partial (falta auto-impresión al cobrar) |
| Comanda de cocina | ⚠️ partial |
| Resumen de cierre de caja | ❌ TODO |
| Pre-cuenta | ❌ TODO |
| Recibo de liquidación RRHH | ❌ TODO (existe `comprobante_url` en LiquidacionSueldo) |

## Estructura de un ticket de venta (especificación)

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

```
========================
  COMANDA #C-007
========================
Mesa: 3
Hora: 14:32
Mozo: Juan Pérez
========================

* 1 Pizza Margherita
   - SIN orégano
   - + Extra queso

* 1 Pizza Calabresa Mediana
   - Mitad y mitad con Pepperoni
   - Bien cocida

* 2 Coca 500ml
========================
```

Idealmente se enrutaría a estación específica (cocina caliente, fría, parrilla, barra) según `Producto.estacion` (campo TODO).

## Documentación existente

`docs/integraciones/thermal-printer-implementation.md` (cubre `PrinterConfig`, `printThermalReceipt`, `getPrinterType`, `getCharacterSet`, `generateReceiptContent`, manejo por OS).

`docs/integraciones/imagenes-perfil.md` (parcialmente desactivado para producto-images, vigente para profile-images).

`thermal-printer-example.ts` (en root) — referencia / ejemplo histórico.

## Pendientes (TODO)

- [ ] **Botón "Reimprimir comanda"** en el PdV / detalle de venta. Llama a `print-comanda` con `{ventaId, forceReprint: true}` (o `{soloItemsNoImpresos: false}` para incluir solo no-impresos). Con badge visible si hay items con `impreso=false` después de un intento fallido — esos quedan a la espera de reimpresión manual (no se auto-reintentan al agregar el siguiente item, para evitar duplicados en cocina).
- [ ] **Wizard de configuración LPR** (UI). Al crear/editar una impresora con `connectionType=lpr`, mostrar un diálogo con los pasos para configurar la PC Windows que tiene la impresora USB compartida: activar feature LPD, instalar driver Generic/Text Only, compartir con share name sin espacios, firewall TCP 515, **agregar ACE ANONYMOUS LOGON** (este paso es el más fácil de olvidar y deja LPDSVC rechazando todo). Incluir un botón "Probar conexión" que haga el handshake `\x02<queue>\n` antes de guardar, con mensaje de error específico (`código 1 → falta ACE ANONYMOUS LOGON`, `timeout → firewall/puerto`, etc.).
- [ ] Auto-impresión al cobrar venta (handler `procesarStockVenta` ya se llama post-cobro; agregar `imprimirTicket(ventaId, printerId)`).
- [x] Auto-impresión de comanda al agregar items — implementado en `ventas.handler.ts:autoPrintComandaIfNeeded` con gate por `venta.mesa || venta.comanda` + `PdvConfig.autoImprimirComanda`. Routing por M2M `producto_sectores` → `sectores_impresoras`. Tracking en `venta_items.impreso`/`fecha_impresion`/`impresiones` (JSON log por sector).
- [x] Relación Producto → Sector(es) → Impresora(s) — M2M `producto_sectores` + `sectores_impresoras` + flag `Producto.requiereComanda`. UI en `gestionar-producto` (multi-select) y `Configuración → Sectores e impresoras`.
- [ ] Templates ESC/POS por tipo de impresora.
- [ ] Kitchen Display Screen (KDS) para alternativa digital.
- [ ] Recibos de liquidación RRHH PDF (campo `comprobante_url` ya existe).
- [ ] Resumen de cierre de caja imprimible.
- [ ] Pre-cuenta antes de cobrar.

`PrinterService` Angular en `src/app/services/printer.service.ts`. Componente `PrinterSettingsComponent` en `src/app/components/printer-settings/`.
