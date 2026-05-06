# TODOs pendientes del proyecto

Snapshot **2026-05-06**. Verificar `git log` y memorias antes de afirmar que algo sigue pendiente.

## Recientemente completado (2026-05)

- [x] **Importación de facturas con OCR + IA** — GPT-4o vision + matching por aliases + revisor en tab + reprocesar/descartar. Detalles → [domains/importacion-facturas-ocr.md](../domains/importacion-facturas-ocr.md).
- [x] **`Producto.iva`** (default 10, valores 0/5/10) y **`Producto.registroCompleto`** (boolean para chip "Parcial"). `Producto.subfamilia` ahora nullable.
- [x] **Backup/Restore + Reset BD + Seed admin** (commit `607a880`).

## Acciones inmediatas

- [ ] Limpiar `.js` y `.js.map` del repo (deberían estar en `.gitignore`).
- [ ] Eliminar entidad `RecetaAdicional` legacy (reemplazada por `RecetaAdicionalVinculacion`).
- [ ] **Permisos OCR**: `COMPRAS_IMPORTAR_FACTURA` y `SISTEMA_CONFIGURAR_IA` están seedeados pero no se chequean en sidenav. Agregar `*ngIf="hasPermission(...)"` a las entradas correspondientes.
- [ ] **Inferidor de presentación** (regex en `producto-inference.util.ts`) no detecta unidad cuando la descripción no incluye número/unidad explícita (ej "MANDIOCA" sin tamaño). Mejora futura: que el OCR sugiera unidad y cantidad por separado en el JSON.

## Refactor técnico

- [ ] **Migrar `ngModel` → Reactive Forms** en todo el proyecto. `grep -rn "ngModel" src/app/`. Priorizar los que están dentro de un `[formGroup]` (rompen con `NG01350`). Patrón ya aplicado en `compras/create-edit-compra/`. (`project_todo_ngmodel_to_reactive`)

- [ ] **Sweep de fechas timezone-safe**. `grep -rn "new Date(data\." electron/handlers/` y reemplazar por `parseLocalDate(s)` (helper ya existe en `compras.handler.ts` — moverlo a `electron/utils/date.utils.ts`). Handlers afectados (columnas `date` sin hora):
  - gastos, retiros-caja, caja-mayor, entradas-varias
  - operaciones-financieras, cheques
  - cuentas-por-pagar, cuentas-por-cobrar
  - vales, liquidaciones, prestamos
  - feriados, asistencias, comisiones
  - vacaciones (`fechaCorte`, `fechaDesde/fechaHasta`)
  
  (`project_todo_fechas_local_timezone`)

- [ ] **Componente reutilizable `<app-table-toolbar>`** (header con título + acciones tipo refresh/filtros/export). Pattern provisional: botón refresh manual con `.spinning` class — implementado solo en `caja-mayor-detalle`. (`project_todo_table_toolbar`)

- [ ] **Autocomplete en selects largos**: convertir `mat-select` a `mat-autocomplete` con búsqueda incremental cuando puede haber 20+ items. Casos identificados:
  - Selector de Persona en `create-edit-funcionario-dialog`
  - Selector de Cliente en cobros / CPC
  - Selector de Producto en reglas de comisión
  - Selector de Funcionario en vales / préstamos / asistencias
  
  (`project_todo_autocompletes`)

- [ ] **Migrar componentes legacy a standalone**:
  - `MonedasModule` → standalone
  - `GestionRecetasModule` → standalone
  - `GestionarProductoComponent` y sub-componentes (declarados en AppModule actualmente)

- [ ] **Unificar política de delete**: hoy mixto (soft delete con `activo=false` en algunos, hard delete con checks en otros). Definir criterio: idealmente soft delete universal con `eliminado_en` timestamp.

## Producto / Recetas

- [ ] **UI de Observaciones**: CRUD para `Observacion` y `ProductoObservacion` (entities existen, no hay UI).
- [ ] **Imágenes de producto**: reactivar handler comentado en `images.handler.ts:31-121`. `ProductoImage` entity fue eliminada — usar columna `imageUrl` en `Producto`.
- [ ] **Stock UI**: gestión completa de `StockMovimiento` (componentes eliminados). Necesita UI de movimientos manuales (AJUSTE_POSITIVO, AJUSTE_NEGATIVO, DESCARTE, TRANSFERENCIA).
- [ ] **Combos UI**: entities `Combo` + `ComboProducto` y `ProductoTipo.COMBO` existen, **no hay UI dedicada**. Falta crear.
- [ ] **Promociones UI**: entities `Promocion` + `PromocionPresentacion` existen. 4 tipos (DESCUENTO_PORCENTAJE, DESCUENTO_MONTO, PRODUCTO_GRATIS, COMBO_ESPECIAL). Sin UI ni motor de aplicación en PdV.
- [ ] **Producción UI**: entities `Produccion` + `ProduccionIngrediente` existen, sin UI. Necesita: registrar producción de elaborado → genera `StockMovimiento.PRODUCCION_SALIDA` (ingredientes) + `PRODUCCION_ENTRADA` (producto terminado).
- [ ] **Ensamblado Pizza UI**: `EnsambladoPizza` + `EnsambladoPizzaSabor` + `TamanhoPizza` + `SaborPizza` existen pero sin UI (es legacy del modelo viejo, evaluar deprecar a favor del refactor con `RecetaPresentacion`).

## Ventas / PdV

- [ ] **Reservas UI completa**: entity `Reserva` existe, falta UI para crear/gestionar reservas, calendario, notificaciones de reservas próximas.
- [ ] **Comandas estado avanzado**: estados `EN_PREPARACION`, `LISTO`, `ENTREGADO`, `CANCELADO` existen en `ComandaItem` pero la UI sólo maneja DISPONIBLE/OCUPADO de la Comanda principal. Falta Kitchen Display Screen (KDS).
- [ ] **Impresión real de tickets/comandas**: `printTicketVenta`, `printComanda` se llaman pero la implementación de impresión está en `printers.handler.ts` con `printPosReceipt()`. Falta:
  - Templates ESC/POS por tipo de impresora
  - Auto-impresión al cobrar
  - Relación `Producto → Printer` para enrutar comandas a estaciones específicas
- [ ] **Categorías click → agregar al carrito**: items de categoría se muestran pero no agregan productos al carrito.
- [ ] **UI Precios de Delivery**: ABM visual (actualmente se gestionan desde crear-delivery dialog).
- [ ] **UI Configuración PdV**: dialogo para editar umbrales y parámetros de `PdvConfig` (parcialmente hecho via `pdv-config-dialog`, falta refinamiento).
- [ ] **Cancelar Caja**: cancela caja con ventas, cobros y movimientos de stock. UI parcial.
- [ ] **Retiros de Efectivo desde PdV**: registrar retiros durante turno (entity `RetiroCaja` existe en módulo financiero, falta integración).
- [ ] **Gastos desde PdV**: registrar gastos operativos sin salir del PdV.
- [ ] **Bug findPrecioCosto()**: retorna 0 hardcodeado en vez de buscar el precio de costo real.

## Compras

- [ ] **C-5 Testing E2E** completo: crear borrador → editar → finalizar contado → verificar stock+costo+caja+ProveedorProducto. Después crédito → 6 cuotas → pagar 1 → anular sin/con cuotas pagadas.
- [ ] **Recepción de mercadería**: flag `isRecepcionMercaderia` existe en BD pero sin flujo. Diferenciar OC vs recepción física.
- [ ] **Devoluciones a proveedor** (parciales): no implementado.
- [ ] **Importación de compras desde CSV/Excel**.
- [ ] **Reportes de compras** por categoría/proveedor/producto con exports PDF/Excel.
- [ ] **Alertas stock mínimo** al finalizar compra (chequea contra `producto.stockMinimo`).
- [ ] **Tipo de cambio histórico** para compras en otra moneda (snapshot al finalizar).
- [ ] **Sugerencia de compras** desde POS (productos con stock bajo).
- [ ] **CPP detalle**: link inverso a Compra origen en `cuenta-por-pagar-detalle.component`.
- [ ] **Tab de Productos en `proveedor-detalle`**: mostrar `ProveedorProducto` con último costo y fecha (entidad ya tiene los campos, solo falta UI).
- [ ] **Anular compra con motivo**: dialog adecuado en lugar de `window.prompt` actual.

## RRHH

- [ ] **Crear Persona inline** en `create-edit-funcionario-dialog`: botón "+" junto al select de Persona que abra `CreateEditPersonaComponent` como dialog. Auto-seleccionar al guardar.
- [ ] **Quitar campo "usuario login"** del alta inicial de funcionario. Permitir vincular usuario después desde `funcionario-detalle`.
- [ ] **Reemplazar `cuentaBancariaPropia` (boolean) por `formaCobroSalario` enum** (EFECTIVO | TRANSFERENCIA), meramente informativo.
- [ ] **Visor universal de documentos**: dialog que soporte imágenes (jpg/png/webp), PDF, Word (docx), Excel (xlsx), texto plano. Antes de implementar, buscar deps ya instaladas (`pdfmake` solo genera, no visualiza; revisar `mammoth.js` para docx, `pdf.js` para PDF). Reusar para `FuncionarioDocumento`, comprobantes de Vale/Liquidación/CPP/CPC. Componente shared bajo `src/app/shared/components/visor-documento-dialog/`.
- [ ] **`marcar-asistencia-masiva-dialog` layout roto**: grid actual desborda. Rediseñar layout responsive. Columna Turno se sale del área visible.
- [ ] **Dialog de "Marcar asistencia individual"** en `list-asistencias`: actualmente solo flujo masivo. Agregar botón "Nueva asistencia" con: funcionario (autocomplete), fecha, estado, turno (auto-cargar turno vigente), hora entrada/salida, observación.
- [ ] **Integrar emisión de Vale en dialog Egresos de Caja Mayor**: opción "Vale a funcionario" en `registrar-egreso-dialog`. Reusar handlers `crear-vale` + `confirmar-vale`.
- [ ] **Tasa de interés en préstamo a funcionario**: dialog `crear-prestamo-funcionario-dialog` debe permitir `tasaInteresPorcentaje` (default 0). Calcular monto_total con interés simple (preferido) o compuesto. Extender `CuentaPorPagar` con `tasaInteres` decimal nullable y `tipoCalculoInteres` enum.
- [ ] **Cobrar cuota préstamo func. desde dialog Egresos** (acceso rápido). Análogo TODO para CPC en dialog Ingresos.

## Comisiones

- [ ] (depende del usuario; el motor está implementado, falta validar con datos reales)

## Financiero

- [ ] **UI de TipoPrecio**: componentes eliminados. Sin forma de gestionar tipos de precio desde la UI.
- [ ] **Verificar conversión de moneda y configuración monetaria**: `ConversionMoneda` y `ConfiguracionMonetaria` (en módulo productos por razones legacy) — flujo end-to-end.

## Seguridad (alta prioridad para producción)

- [ ] **Hash de contraseñas con bcrypt/argon2**: actualmente texto plano.
- [ ] **JWT secret en variable de entorno**: actualmente hardcoded `'frc-gourmet-secret-key'` en `auth.handler.ts:9`.
- [ ] **Validación de permisos en backend**: handlers no validan `getCurrentUser` permisos. Vulnerable a invocación desde DevTools.
- [ ] **Idle timeout server-side**: hoy solo `last_activity_time` se actualiza, sin auto-logout.
- [ ] **Refresh tokens** + invalidación.
- [ ] **Recuperación de contraseña**.
- [ ] **Bloqueo por intentos fallidos**.
- [ ] **MFA / 2FA**.
- [ ] **Backup automático de BD + carpetas userData/funcionario-documentos/**: tab "Backup completo" futuro.

## Reportes y exports

- [ ] **Reportes de Ventas** con filtros + exports PDF/Excel.
- [ ] **Reportes de Compras** (ya listados arriba).
- [ ] **Reportes RRHH** ya tiene base (Fase 8) — auditar coverage de cada reporte.
- [ ] **Dashboard de Ventas estadísticas** con datos reales (actualmente placeholder).

## Testing

- [ ] **Test E2E completo**: flujo Producto → Receta → Variaciones → PDV → Venta → Stock.
- [ ] **Test integridad**: cascadas de eliminación, referencias circulares.
- [ ] **Test multi-moneda**: precios, costos, conversiones, pagos.
- [ ] **Test impresión**: tickets, comandas.
- [ ] **Performance**: paginación en todas las listas, carga lazy de relaciones.

---

## Cómo priorizar

Orden recomendado (sólo opinión, depende del negocio):

1. Seguridad básica (hash password + JWT secret env) — gating para producción.
2. Sweep de fechas (riesgo de corrupción de datos).
3. Reactive Forms (estabilidad UI).
4. Visor de documentos (UX RRHH).
5. UI de Combos / Promociones / Producción (features de producto).
6. KDS / impresión avanzada (operativa cocina).
7. Reportes con exports (negocio).
