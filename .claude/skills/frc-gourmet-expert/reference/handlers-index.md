# Índice de handlers IPC

**54 archivos `*.handler.ts`** en `electron/handlers/` (~28.000 líneas totales). Cada uno expone una función `registerXxxHandlers(dataSource, getCurrentUser?)` que se invoca en `main.ts` tras inicializar la BD. Al arranque, `installHandlerRegistry()` monkey-patchea `ipcMain.handle` para que cada canal quede también accesible vía `POST /api/rpc` (modo server). Ver [architecture/electron-bootstrap.md](../architecture/electron-bootstrap.md).

## Tabla principal (orden alfabético)

| Handler | LOC | Dominios / responsabilidad |
|---|---:|---|
| **adjuntos.handler.ts** | 139 | Adjuntos polimórficos (CRUD genérico vinculable a cualquier entidad) |
| **app-mode.handler.ts** | 108 | Modo de operación standalone / server / client; test de conexión a server |
| **asistencias.handler.ts** | 378 | Turno, FuncionarioTurno, Asistencia, Penalizacion + auto-penalización por tardanza |
| **auth.handler.ts** | 212 | Login/logout, LoginSession, JWT (`getJwtSecret`), `verifyPassword` (bcrypt) |
| **backup.handler.ts** | 548 | Backup/restore de BD + `startAutoBackupScheduler` |
| **banking.handler.ts** | 916 | CuentaBancaria, MovimientoBancario, MaquinaPos, AcreditacionPos, Chequera, Cheque + `startAcreditacionesScheduler` |
| **caja-mayor.handler.ts** | 2530 | CajaMayor*, Gasto*, RetiroCaja*, EntradaVaria*, OperacionFinanciera*. Incluye `anular-caja-mayor-movimiento` y `recalcular-saldos`. |
| **caja-mayor-utils.ts** | 51 | (no es handler) `actualizarSaldoCajaMayor()`, `esIngreso()` — helpers del módulo financiero |
| **comisiones.handler.ts** | 723 | ReglaComision*, FuncionarioReglaComision, LiquidacionComision* + motor de evaluación |
| **compras.handler.ts** | 1202 | Proveedor, ProveedorProducto, Compra, CompraDetalle, FormasPago. `finalizar-compra` (transacción: stock + CPP + costo promedio) |
| **configuracion-rrhh.handler.ts** | 165 | ConfiguracionRrhh + helpers getConfigNumber/Boolean/String/Date + `seedConfiguracionRrhh` |
| **convenios.handler.ts** | 527 | Convenios + cobro consolidado de clientes |
| **cotizacion-mercado.handler.ts** | 21 | Scraping on-demand de cotizaciones de mercado |
| **cuentas-por-cobrar.handler.ts** | 788 | CuentaPorCobrar*, `cobrar-cpc-cuota`, cobro en lote |
| **cuentas-por-pagar.handler.ts** | 819 | CompraCategoria, CuentaPorPagar*, `aplicar-pago-cpp`, pago en lote |
| **dashboard-caja-mayor.handler.ts** | 186 | KPIs Caja Mayor |
| **dashboard-compras.handler.ts** | 135 | KPIs Compras |
| **dashboard-financiero.handler.ts** | 150 | KPIs Financiero |
| **dashboard-productos.handler.ts** | 120 | KPIs Productos |
| **dashboard-rrhh.handler.ts** | 169 | KPIs RRHH (nómina, asistencia, cumpleaños, etc.) |
| **dashboard-shortcuts.handler.ts** | 78 | DashboardShortcut (personalización de Home) |
| **dashboard-ventas.handler.ts** | 249 | KPIs Ventas |
| **db-config.handler.ts** | 273 | Configuración de BD (sqlite path / postgres); `db-config-init-postgres` crea rol+DB |
| **documentos-tickets.handler.ts** | 962 | Tickets térmicos (comanda multi-sector, venta, recibos, vales) |
| **empresa.handler.ts** | 96 | Empresa singleton (datos + branding + fiscal) |
| **equipos-comision.handler.ts** | 338 | EquipoComision* |
| **factura-import.handler.ts** | 610 | DocumentoCompraImportado, OcrAlias* + IaConfig. OCR + IA (GPT vision), confirmar = transacción Compra |
| **feriados.handler.ts** | 56 | Feriado |
| **files.handler.ts** | 210 | IPCs genéricos de archivos (save/delete/read/open) + thumbnails. Reemplaza producto-images de images.handler |
| **financiero.handler.ts** | 739 | Moneda, MonedaBillete, MonedaCambio, TipoPrecio, Dispositivo, Caja, CajaMoneda, Conteo* |
| **funcionario-documentos.handler.ts** | 123 | FuncionarioDocumento (filesystem) |
| **horas-extra.handler.ts** | 91 | HoraExtra |
| **images.handler.ts** | 31 | Solo imágenes de perfil (legacy compat). Lo nuevo usa files.handler |
| **kds.handler.ts** | 216 | KDS: comandas en pantalla de cocina (estado por sector); ver kds-sse-routes en server/ |
| **liquidacion-final.handler.ts** | 263 | LiquidacionFinal* + antigüedad / indemnización / vacaciones no gozadas |
| **liquidacion-sueldo.handler.ts** | 954 | LiquidacionSueldo*, Bono, Aguinaldo + `seedLiquidacionConceptos`, `anular-liquidacion-sueldo` |
| **movimientos-cliente.handler.ts** | 217 | MovimientoCliente (tracking saldo cliente) |
| **notificaciones-rrhh.handler.ts** | 354 | NotificacionRrhh + `generarNotificacionesRrhh` (startup + cada 24h) |
| **onboarding.handler.ts** | 161 | Tareas guiadas de onboarding en Home |
| **permissions.handler.ts** | 313 | Permission, RolePermission, `get-permissions-by-user` + `seedPermissions` (94 códigos) |
| **personas.handler.ts** | 927 | Persona, Usuario, Role, UsuarioRole, TipoCliente, Cliente + búsqueda por teléfono |
| **printers.handler.ts** | 137 | Printer (epson/star/thermal; network/usb/bluetooth) |
| **producto-sectores.handler.ts** | 107 | M2M Producto↔Sector (routing de comanda por producto) |
| **productos.handler.ts** | 2275 | Familia, Subfamilia, Producto, Presentacion, CodigoBarra, PrecioVenta, PrecioCosto, Adicional, Observacion + search por modo venta/compra |
| **receta-presentacion.handler.ts** | 556 | Helpers `generarNombreVariacion`, `generarSKU` usados desde recetas.handler (NO se registra como handler propio) |
| **recetas.handler.ts** | 2427 | Receta, RecetaIngrediente*, RecetaAdicionalVinculacion **+ RecetaPresentacion (variaciones) + Sabores** (unificado) |
| **remote-tunnel.handler.ts** | 172 | Acceso remoto vía Cloudflare quick tunnel |
| **reportes-rrhh.handler.ts** | 472 | Exports PDF/Excel (pdfmake + exceljs) |
| **rrhh-funcionarios.handler.ts** | 386 | Cargo, Funcionario, HistoricoCargo, HistoricoSalario + alta transaccional |
| **sabores.handler.ts** | 437 | Sabor + auto-generación de variaciones al crear sabor |
| **sectores-impresoras.handler.ts** | 135 | M2M Sector↔Printer con rol (COMANDA / TICKET_VENTA / PRECUENTA) |
| **system.handler.ts** | 68 | OS info / MAC address. No necesita DB |
| **vacaciones.handler.ts** | 380 | Vacacion, VacacionPeriodo + auto-Asistencia VACACION al marcar GOZADA |
| **vales.handler.ts** | 417 | Vale, MotivoVale + `confirmar-vale` (EGRESO_VALE), `anular-vale` (contra-mov) |
| **ventas.handler.ts** | 3032 | Venta*, Comanda*, PdvMesa, Sector, Reserva, Delivery, PdvAtajo*, PdvConfig. Incluye `procesarStockVenta`/`revertirStockVenta`. El más grande. |

> **Nota:** `receta-presentacion.handler.ts` y `caja-mayor-utils.ts` NO se registran como handlers en `main.ts` — exportan helpers usados por otros handlers.

## Patrón estándar de handler

```typescript
ipcMain.handle('canal', async (_event, ...args) => {
  try {
    // (si muta datos sensibles) validar permiso en backend:
    await ensurePermission(dataSource, getCurrentUser, 'CODIGO_PERMISO');
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

## Validación de permisos en backend

Los handlers sensibles llaman `ensurePermission(dataSource, getCurrentUser, 'CODIGO')` o `checkPermission(...)` (`electron/utils/auth.utils.ts`). Cache por usuario con TTL 30s; en modo server lee el usuario del JWT vía `withRequestUser` (AsyncLocalStorage). Ver [architecture/auth-permissions.md](../architecture/auth-permissions.md). **Grepear el código de permiso real del handler** antes de asumirlo (no inventar).

## Schedulers en main process

| Scheduler | Frecuencia | Qué hace |
|---|---|---|
| `startAcreditacionesScheduler(ds, 5)` | 5 min | Procesa AcreditacionPos PENDIENTE con fechaEsperada ≤ now |
| `startAutoBackupScheduler(...)` | configurable | Backup automático de la BD |
| `setInterval(generarNotificacionesRrhh, 24h)` | 24h | Notificaciones RRHH (cumpleaños, vacaciones, cuotas vencidas, etc.) |

## Servidor HTTP (modo server)

`electron/server/`: `server.ts` (Fastify), `rpc-router.ts` (`POST /api/rpc` → `handlerRegistry.get(method)`), `auth-middleware.ts` + `auth-routes.ts` (login/refresh/logout JWT), `file-routes.ts` (`/api/files/by-url`), `kds-sse-routes.ts` (SSE para KDS), `special-routes.ts`. Puede servir la PWA estática (`dist/mobile`). Ver [architecture/cliente-servidor.md](../architecture/cliente-servidor.md).

## Helpers compartidos

`electron/utils/`:
- `entity.utils.ts`: `setEntityUserTracking(dataSource, entity, userId, isUpdate)` — popula createdBy/updatedBy.
- `auth.utils.ts`: `checkPermission`/`ensurePermission` + cache + `withRequestUser`/`getRequestUser`/`getEffectiveUser`.
- `password.utils.ts`: `hashPassword`/`verifyPassword` (bcryptjs).
- `jwt-secret.utils.ts`: `getJwtSecret()` (keytar + fallback filesystem).
- `handler-registry.ts`: `installHandlerRegistry()`, `handlerRegistry`, `invokeHandler`/`invokeHandlerWithContext`.
- `image-handler.utils.ts`: `saveProfileImage`/`deleteProfileImage`.
- `seed-data.ts` / `seed-system.ts`: seeds iniciales.

`electron/handlers/caja-mayor-utils.ts`:
- `actualizarSaldoCajaMayor(qr, cajaMayorId, monedaId, formaPagoId, monto, tipo)` — único punto de actualización de CajaMayorSaldo.
- `esIngreso(tipo): boolean` — clasifica TipoMovimiento.
