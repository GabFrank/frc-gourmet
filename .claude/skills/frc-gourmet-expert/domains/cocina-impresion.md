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

| Conexión | address |
|---|---|
| network | `IP:port` (resuelto a `tcp://<IP>:<port||9100>`) |
| usb | path device (`/dev/usb/lp0` Linux, `\\.\COM3` Windows). Si en macOS y address contiene `'ticket-'` → usa `lp` command (CUPS) |
| bluetooth | `bt:<MAC>` |

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

- [ ] Auto-impresión al cobrar venta (handler `procesarStockVenta` ya se llama post-cobro; agregar `imprimirTicket(ventaId, printerId)`).
- [ ] Auto-impresión de comanda al agregar items.
- [ ] Templates ESC/POS por tipo de impresora.
- [ ] Relación `Producto → Printer` para enrutar comandas a estaciones.
- [ ] Kitchen Display Screen (KDS) para alternativa digital.
- [ ] Recibos de liquidación RRHH PDF (campo `comprobante_url` ya existe).
- [ ] Resumen de cierre de caja imprimible.
- [ ] Pre-cuenta antes de cobrar.

`PrinterService` Angular en `src/app/services/printer.service.ts`. Componente `PrinterSettingsComponent` en `src/app/components/printer-settings/`.
