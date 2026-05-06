# Índice de handlers IPC

35 archivos en `electron/handlers/`, ~20.000 líneas totales. Cada uno se registra en `main.ts` (líneas 87-122).

## Tabla principal

| Handler | LOC | Dominios cubiertos | Notas |
|---|---:|---|---|
| **auth.handler.ts** | 164 | Usuario login/logout, LoginSession, JWT | Texto plano password ⚠️ |
| **personas.handler.ts** | 758 | Persona, Usuario, Role, UsuarioRole, TipoCliente, Cliente | + búsqueda cliente por teléfono |
| **permissions.handler.ts** | 241 | Permission, RolePermission, get-permissions-by-user | + seedPermissions (~56 códigos) |
| **dashboard-shortcuts.handler.ts** | 78 | DashboardShortcut | Personalización de Home |
| **system.handler.ts** | 30 | OS info | MAC address para multi-dispositivo |
| **images.handler.ts** | 121 | Profile images | Producto images comentado (deshabilitado) |
| **printers.handler.ts** | 129 | Printer | epson/star/thermal, network/usb/bluetooth |
| **productos.handler.ts** | 1871 | Familia, Subfamilia, Producto, Presentacion, CodigoBarra, PrecioVenta, PrecioCosto, Adicional, Observacion | + search por modo venta/compra |
| **recetas.handler.ts** | 2078 | Receta, RecetaIngrediente, RecetaIngredienteIntercambiable, RecetaAdicionalVinculacion, **+ RecetaPresentacion (handlers de variaciones)** | El handler aparte `receta-presentacion.handler.ts` NO se registra |
| **sabores.handler.ts** | 437 | Sabor + auto-generación de variaciones al crear sabor | |
| **receta-presentacion.handler.ts** | 556 | (no registrado) | Helpers `generarNombreVariacion`, `generarSKU` se usan desde recetas.handler |
| **financiero.handler.ts** | 716 | Moneda, MonedaBillete, MonedaCambio, TipoPrecio, Dispositivo, Caja, CajaMoneda, Conteo, ConteoDetalle | |
| **caja-mayor.handler.ts** | 1901 | CajaMayor, CajaMayorMovimiento, CajaMayorSaldo, CajaMayorConfiguracion, Gasto, GastoCategoria, GastoDetalle, RetiroCaja, RetiroCajaDetalle, EntradaVaria, EntradaVariaCategoria, OperacionFinanciera, OperacionFinancieraCategoria | El handler más grande. Incluye anular-caja-mayor-movimiento con bloqueos. |
| **caja-mayor-utils.ts** | 51 | `actualizarSaldoCajaMayor()`, `esIngreso()` | Helpers compartidos por todo módulo financiero |
| **banking.handler.ts** | 1032 | CuentaBancaria, MovimientoBancario, MaquinaPos, AcreditacionPos, Chequera, Cheque | + scheduler `procesarAcreditacionesPendientes` cada 5 min |
| **cuentas-por-pagar.handler.ts** | 790 | CompraCategoria, CompraCuota (deprecated), CuentaPorPagar, CuentaPorPagarCuota | `aplicarPagoCpoCuota`, `pagar-cuotas-compras-lote` |
| **cuentas-por-cobrar.handler.ts** | 501 | CuentaPorCobrar, CuentaPorCobrarCuota | `cobrar-cpc-cuota`, `cobrar-cuotas-lote` |
| **movimientos-cliente.handler.ts** | 65 | MovimientoCliente | Tracking de saldo cliente |
| **compras.handler.ts** | 1196 | Proveedor, ProveedorProducto, Compra, CompraDetalle, FormasPago | Refactor 2026-05-05 (pago unificado vía CPP) |
| **factura-import.handler.ts** | 470 | DocumentoCompraImportado, OcrAliasProveedor, OcrAliasProducto + IaConfig (JSON userData) | Importación facturas con OCR + IA. Endpoints: `ia-config-{get,set,test}`, `factura-import-{pick-file,process,reprocess,get,list,descartar,match,confirm}`. Usa GPT-4o vision (1 llamada). PDFs renderizados a PNG con pdfjs-dist + @napi-rs/canvas. Confirmar = transacción Compra ABIERTO + upsert aliases. Detalles → [domains/importacion-facturas-ocr.md](../domains/importacion-facturas-ocr.md) |
| **ventas.handler.ts** | 2579 | Venta, VentaItem, VentaItemSabor, VentaItemAdicional, VentaItemIngredienteModificacion, VentaItemObservacion, Comanda, ComandaItem, PdvMesa, Sector, Reserva, Delivery, PrecioDelivery, PdvCategoria*, PdvAtajoGrupo*, PdvAtajoItem*, PdvConfig | El segundo más grande. Incluye `procesarStockVenta` (323 líneas) y `revertirStockVenta`. |
| **rrhh-funcionarios.handler.ts** | 373 | Cargo, Funcionario, HistoricoCargo, HistoricoSalario | + transacción de alta funcionario |
| **funcionario-documentos.handler.ts** | 105 | FuncionarioDocumento | Filesystem en `userData/funcionario-documentos/{id}/` |
| **asistencias.handler.ts** | 366 | Turno, FuncionarioTurno, Asistencia, Penalizacion | + auto-generación de penalizaciones tardanza |
| **feriados.handler.ts** | 51 | Feriado | |
| **horas-extra.handler.ts** | 87 | HoraExtra | |
| **vales.handler.ts** | 245 | Vale, MotivoVale | + `confirmar-vale` (genera EGRESO_VALE) y `anular-vale` (contra-mov) |
| **liquidacion-sueldo.handler.ts** | 870 | LiquidacionSueldo, LiquidacionItem, LiquidacionConcepto, Bono, Aguinaldo | + `generar-liquidacion-borrador`, `pagar-liquidacion`, `anular-liquidacion-sueldo` (revierte vales/cuotas/comisiones/aguinaldos) |
| **vacaciones.handler.ts** | 231 | Vacacion, VacacionPeriodo | + auto-genera Asistencia VACACION al marcar GOZADA |
| **liquidacion-final.handler.ts** | 259 | LiquidacionFinal, LiquidacionFinalItem | + cálculos de antigüedad / indemnización / vacaciones no gozadas |
| **comisiones.handler.ts** | 714 | ReglaComision, ReglaComisionProducto, ReglaComisionRequisito, FuncionarioReglaComision, LiquidacionComision, LiquidacionComisionItem | + motor de evaluación |
| **equipos-comision.handler.ts** | 329 | EquipoComision, EquipoComisionMiembro, EquipoComisionRegla | |
| **configuracion-rrhh.handler.ts** | 159 | ConfiguracionRrhh, getConfigNumber/Boolean/String/Date helpers | + seed valores PY |
| **dashboard-rrhh.handler.ts** | 168 | KPIs RRHH | Total nómina, asistencia, vales, próximos cumpleaños, etc. |
| **notificaciones-rrhh.handler.ts** | 354 | NotificacionRrhh + auto-generación | Run al startup + cada 24h via setInterval |
| **reportes-rrhh.handler.ts** | 515 | Exports PDF/Excel | pdfmake + exceljs |

## Patrón estándar de handler

```typescript
ipcMain.handle('canal', async (_event, ...args) => {
  try {
    const repo = dataSource.getRepository(MiEntidad);
    // ... lógica
    const userId = getCurrentUser?.()?.id;
    await setEntityUserTracking(dataSource, entity, userId, isUpdate);
    return await repo.save(entity);
  } catch (error) {
    console.error('Error canal:', error);
    throw error;
  }
});
```

## Patrones de error handling (inconsistentes)

Dos modos coexisten:
- **`throw error`** → renderer recibe Promise rejection (preferido en handlers nuevos).
- **`return { success: false, message: '...' }`** → renderer recibe objeto con flag (común en handlers viejos).

**Antes de cambiar, chequear cómo lo consume el renderer.**

## Handler registration order (main.ts:90-122)

```
1. registerPrinterHandlers
2. registerPersonasHandlers  (necesita getCurrentUser)
3. registerAuthHandlers      (también setCurrentUser)
4. registerImageHandlers
5. registerProductosHandlers
6. registerFinancieroHandlers
7. registerComprasHandlers
8. registerSystemHandlers
9. registerVentasHandlers
10. registerRecetasHandlers (incluye sabores y variaciones)
11. registerCajaMayorHandlers
12. registerBankingHandlers + startAcreditacionesScheduler
13. registerCuentasPorPagarHandlers
14. registerDashboardShortcutsHandlers
15. registerPermissionsHandlers + seedPermissions
16. registerConfiguracionRrhhHandlers + seedConfiguracionRrhh
17-26. RRHH handlers (Fase 1-6)
27. registerCuentasPorCobrarHandlers (Fase 7)
28. registerMovimientosClienteHandlers (Fase 7)
29-31. Fase 8 (Notificaciones, Dashboard, Reportes)
+ migración 1-vez de vendedor_id
+ seedInitialData, seedLiquidacionConceptos
+ generarNotificacionesRrhh (al startup + cada 24h)
```

## Schedulers en main process

| Scheduler | Frecuencia | Qué hace |
|---|---|---|
| `startAcreditacionesScheduler(ds, 5)` | 5 min | Procesa AcreditacionPos PENDIENTE con fechaEsperada ≤ now |
| `setInterval(generarNotificacionesRrhh, 24h)` | 24h | Notificaciones RRHH (cumpleaños, vacaciones próximas, cuotas vencidas, etc.) |

## Helpers compartidos

`electron/utils/`:
- `entity.utils.ts`: `setEntityUserTracking(dataSource, entity, userId, isUpdate)` — popula createdBy/updatedBy.
- `image-handler.utils.ts`: `saveImage`, `deleteImage` para profile + producto images.
- `document-handler.utils.ts`: documentos RRHH en filesystem.
- `seed-data.ts`: seedInitialData con monedas, formas pago, proveedores, cuentas bancarias.
- `printer.utils.ts`: `printPosReceipt(config, content)` con node-thermal-printer.

`electron/handlers/caja-mayor-utils.ts`:
- `actualizarSaldoCajaMayor(qr, cajaMayorId, monedaId, formaPagoId, monto, tipo)` — único punto de actualización de CajaMayorSaldo.
- `esIngreso(tipo): boolean` — clasifica TipoMovimiento.
