# TODOs pendientes del proyecto

Snapshot **2026-05-06**, **auditado 2026-06-08**, **revisado 2026-06-28** (seguridad P0 + RecetaAdicional) contra el código. Verificar `git log` y memorias antes de afirmar que algo sigue pendiente.

> 📌 **El orden de ataque está en `## Plan de implementación priorizado (P0→P5)` al final.** Lo de arriba es el catálogo detallado.

## Recientemente completado (auditado 2026-06-08)

- [x] **Imagen en Presentación + Sabor** — `app-file-upload` implementado en `producto-presentaciones-precios` y `sabor-dialog`. (Estaba listado como pendiente: era drift.)
- [x] **Handler producto↔sector** (`producto-sectores.handler.ts`: get/set) — backend listo; solo falta la UI de asignación en `gestionar-producto`.
- [x] **Validación de permisos en backend** — sweep `ensurePermission` en ~178 handlers (memoria `project_todo_sweep_handlers_auth`).
- [x] **Caja Mayor Fases 2-4** (Bancos+POS, Compras+CPP/CPC, Cheques+Op.Financieras+Entradas Varias) — la nota vieja "4 fases pendientes" era drift; solo Fase 5 (arqueos+reportes) queda parcial.

## Recientemente completado (2026-05)

- [x] **Sistema unificado de imágenes y adjuntos (release 1)** — branch `feat/files-imagenes-adjuntos`. Cimientos shared (`<app-file-upload>`, `<app-document-viewer>` con PDF inline via `pdfjs-dist`, helper `image-resize.utils.ts` con thumbnails 96/400px usando `@napi-rs/canvas`, helper IPC genérico `files.handler.ts`, util frontend `image-url.util.ts`). Custom protocol `app://` simplificado a un solo handler genérico. Entity polimórfica `Adjunto` declarada (no usada todavía). Aplicado: `Producto.imageUrl` (info-general + thumbnail en `list-productos`), `FuncionarioDocumento` con visor inline. Detalles → [domains/archivos-y-adjuntos.md](../domains/archivos-y-adjuntos.md).
- [x] **Dashboards: padrón unificado + chips rango + bugs (2026-05-07)** — fix B1 SQL `pc.presentacion_id` (productos), fix B2 chart Ventas en 0 Gs (sumar desde `venta_items`), helper compartido `electron/utils/dashboard-rangos.util.ts` con `today/week/month/last-month/3months/6months`, chips de rango + stat chips sincronizados en Ventas/Home/Compras/Caja Mayor. Caja Mayor dashboard ahora lista cajas activas con click → detalle directo (`cajaMayorIdShortcut`). Branch `fix/dashboards-bugs-rangos`.
- [x] **Importación de facturas con OCR + IA** — GPT-4o vision + matching por aliases + revisor en tab + reprocesar/descartar. Detalles → [domains/importacion-facturas-ocr.md](../domains/importacion-facturas-ocr.md).
- [x] **`Producto.iva`** (default 10, valores 0/5/10) y **`Producto.registroCompleto`** (boolean para chip "Parcial"). `Producto.subfamilia` ahora nullable.
- [x] **Backup/Restore + Reset BD + Seed admin** (commit `607a880`).

## Acciones inmediatas

- [ ] **Onboarding task "Agregar una impresora"** — Agregar entry al catálogo `electron/handlers/onboarding-tasks.config.ts` para que la pantalla inicial guíe a configurar al menos una impresora:
  ```ts
  {
    key: 'IMPRESORAS',
    titulo: 'Agregar una impresora',
    descripcion: 'Para imprimir comandas de cocina, tickets de venta y pre-cuentas. Soporta network, USB o LPR (compartida desde otra PC Windows).',
    icono: 'print',
    actionTabKey: 'IMPRESORAS',  // verificar que el TabsService tenga ese key, o usar dialog directo
    detect: async (ds) => ({ count: await ds.getRepository(Printer).count({ where: { activo: true } }) }),
  }
  ```
  Idealmente complementado con segunda tarea opcional "Configurar sectores de impresión" (M2M `sectores_impresoras`) y tercera "Asignar sector a productos" (M2M `producto_sectores`), pero esas dependen de la primera. Ver patrón en `MAQUINAS_POS` / `CUENTAS_BANCARIAS` del mismo archivo.
- [ ] **Wizard guiado de configuración LPR (Impresora compartida Windows)** — En `printer-settings.component`, cuando el usuario elige `connectionType=lpr`, abrir un dialog modal con instrucciones paso a paso para configurar la PC Windows servidor:
  1. Activar feature "Servidor LPD" en *Características de Windows*.
  2. Instalar impresora con driver **Generic / Text Only**.
  3. Compartir con un *Share name* sin espacios.
  4. Firewall: regla entrante TCP 515 en perfiles privada y pública.
  5. ⚠️ **Agregar ACE `ANONYMOUS LOGON`** con permiso "Imprimir" en *Seguridad* de la impresora. **Sin esto LPDSVC rechaza con código 1 cualquier conexión remota** aunque acepte loopback local (perdimos 30 min de debug por esto, ver [[feedback-windows-lpd-anonymous-logon]]).
  6. Anotar la IP de esa PC y el share name → formato address en la app: `IP/ShareName`.

  Incluir botón **"Probar conexión"** que dispare un handshake LPR (`\x02<queue>\n` → leer 1 byte) antes de guardar. Mapeo de errores legibles:
  - `código 1 (\x01)` → "El servidor LPD rechazó la cola. Verificá que la impresora esté compartida con ese nombre y que `ANONYMOUS LOGON` tenga permiso de imprimir (paso 5)".
  - `timeout / connection refused` → "No se puede conectar al puerto 515. Verificá firewall y que el servicio LPD esté corriendo (paso 1+4)".
  - `ACK 0x00` → "Cola accesible, podés guardar".
- [ ] **Adjuntos polimórficos release 2 — solo falta UI** (auditado 2026-06-08). El **backend ya está**: handler genérico `adjuntos.handler.ts` (`get-adjuntos`/`create-adjunto`/`delete-adjunto`) + permisos para ~18 tipos (`documentos-permissions.config.ts`: GASTO, CPP, CPP_CUOTA, CPC, CPC_CUOTA, CHEQUE, RETIRO_CAJA, ENTRADA_VARIA, OPERACION_FINANCIERA, MOVIMIENTO_BANCARIO, ACREDITACION_POS, COMPRA, VENTA, VALE, PRESTAMO_FUNCIONARIO, LIQUIDACION_SUELDO, LIQUIDACION_FINAL, ASISTENCIA). El componente `<app-adjuntos-list>` está cableado **solo a GASTO**. **Falta:** sumar `<app-adjuntos-list entidadTipo="...">` al resto de los dialogs/detalles.
- [ ] **Imagen en Presentación + Sabor** — columnas `imageUrl` ya existen en BD. Falta UI: thumbnail clickeable en cada presentacion del producto (dialog con `<app-file-upload>`), idem en `create-edit-sabor-dialog`. Dejar fallback al `producto.imageUrl` si la presentacion no tiene la suya.
- [ ] **Migrar `create-edit-persona` a `<app-file-upload>`** — actualmente usa `<input type=file>` artesanal con `save-profile-image` legacy. Reemplazar por shared `<app-file-upload carpeta="profile-images">` mantiene los mismos URLs `app://profile-images/<file>` sin migración de datos. Beneficia: thumbnails automáticos, preview consistente.
- [ ] **Migrar `PdvCategoriaItem.imagen` (base64 → app://)** — hoy guarda base64 directo en BD (anti-patrón). Crear job de migración que: lee cada `imagen` que empieza con `data:image/...`, llama `save-file` con carpeta='producto-images' o nueva 'pdv-images', actualiza la columna con la URL devuelta, y opcionalmente elimina el data URL viejo (o deja la columna apuntando al archivo). Patrón: tab de "Mantenimiento BD" con botón "Migrar imágenes legacy".
- [ ] **Backup/restore extender a carpetas userData** — el backup actual cubre solo la BD. Sumar `userData/{profile-images,producto-images,funcionario-documentos,factura-imports,adjuntos}` al ZIP de backup. Restore correspondiente.
- [ ] Limpiar `.js` y `.js.map` del repo (deberían estar en `.gitignore`).
- [x] Eliminar entidad `RecetaAdicional` legacy (verificado 2026-06-28: ya no existe el `.entity.ts` ni referencias; solo queda `RecetaAdicionalVinculacion`).
- [ ] **Permisos OCR**: `COMPRAS_IMPORTAR_FACTURA` y `SISTEMA_CONFIGURAR_IA` están seedeados pero no se chequean en sidenav. Agregar `*ngIf="hasPermission(...)"` a las entradas correspondientes.
- [ ] **Inferidor de presentación** (regex en `producto-inference.util.ts`) no detecta unidad cuando la descripción no incluye número/unidad explícita (ej "MANDIOCA" sin tamaño). Mejora futura: que el OCR sugiera unidad y cantidad por separado en el JSON.

## Refactor técnico

- [ ] **Sweep `appCurrencyInput` global**. Directiva nueva en `src/app/shared/directives/currency-input.directive.ts` formatea inputs monetarios con separador locale-aware (PYG sin decimales, USD/BRL con coma decimal). Aplicada SOLO en `compras/create-edit-compra/` (costoUnitario + subtotal). Falta escanear y aplicar al resto del proyecto. Patrón:
  ```html
  <input matInput type="text" inputmode="decimal"
         formControlName="campo" appCurrencyInput [decimals]="decimalesMoneda" />
  ```
  Donde `decimalesMoneda` es propiedad reactiva en el componente, recalculada cuando cambia `monedaId` (ver `recalcDecimalesMoneda()` en create-edit-compra). **No usar getter** (regla del proyecto). Buscar candidatos:
  ```bash
  grep -rn 'type="number".*min="0".*step' src/app
  grep -rn "monto\|importe\|costo\|precio\|saldo\|total" src/app/pages --include="*.html"
  ```
  Lugares prioritarios (alto impacto):
  - **PdV cobrar venta** (`cobrar-venta-dialog`): inputs de monto pagado por forma.
  - **Caja Mayor**: registrar gasto, retiro, entrada varia, operacion financiera (montos).
  - **CPP / CPC**: pagar cuotas (montos a pagar).
  - **Bancos**: movimientos bancarios, acreditaciones POS.
  - **RRHH**: vales (monto), liquidaciones (montos), prestamos.
  - **Productos**: precios de venta/costo en `gestionar-producto`.
  - **Conteos**: `conteo-detalle` (cantidades de billetes ya manejan locale propio, revisar).
  
  Para precios de venta donde la moneda es la del precio (no la del form), pasar `[decimals]="precio.moneda?.decimales || 0"`.
  
  El locale `es-PY` esta registrado globalmente en `main.ts` (DecimalPipe usa `'es-PY'` por default via `LOCALE_ID`). Para mostrar valores read-only, pipe ya formatea: `{{ valor | number:(dec === 0 ? '1.0-0' : '1.2-2') }}`. (`project_todo_currency_input_global`)

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

- [x] **Hash de contraseñas con bcrypt** (HECHO, verificado 2026-06-28): `electron/utils/password.utils.ts` (`hashPassword`/`verifyPassword` con `bcryptjs`, 10 rounds) + migración one-shot `migrate-passwords.ts` que hashea los plaintext legacy al arranque. `verifyPassword` solo cae a comparación plaintext como fallback si el valor aún no fue hasheado.
- [x] **JWT secret fuera del código** (HECHO, verificado 2026-06-28): `electron/utils/jwt-secret.utils.ts` (`getJwtSecret`) lee el secret de keytar (fallback a archivo local en userData) y lo genera si no existe. Ya NO está hardcodeado.
- [x] **Validación de permisos en backend** (HECHO, auditado 2026-06-08): sweep `ensurePermission` en ~178 handlers IPC (memoria `project_todo_sweep_handlers_auth`).
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

## Plan de implementación priorizado (P0→P5)

Reorganizado **2026-06-08** tras auditar el código (espejo de la memoria `project_roadmap_prioritizado`). Orden por urgencia × impacto × esfuerzo. Es una propuesta; el negocio puede reordenar. Ataca de arriba hacia abajo.

### P0 — Gating de producción (seguridad) 🔴
- ✅ **Hash de contraseñas (bcrypt)** — HECHO (verificado 2026-06-28, `password.utils.ts`).
- ✅ **JWT secret fuera del código** — HECHO (verificado 2026-06-28, `jwt-secret.utils.ts`, en keytar).
- ✅ **Validación de permisos backend** — HECHO.
- Restante (2º orden): idle timeout server-side, bloqueo por intentos fallidos, refresh tokens (existe `RefreshToken` entity + `password-recovery.handler.ts`; auditar cobertura real).

### P1 — Correctness / riesgo de datos
- **Sweep fechas timezone-safe** (`parseLocalDate`) en handlers con columnas `date` — parcial, completar los restantes.
- **Anular compra con dialog** en vez de `window.prompt` (`compra-detalle.component`).

### P2 — Quick wins con backend ya listo (alto valor / bajo esfuerzo)
- **Botón Reimprimir comanda** (handler `print-comanda` ya soporta `forceReprint`; falta solo la UI).
- **Auto-impresión al cobrar venta** (campo `autoImprimirTicketVenta` ya existe; falta el `imprimirTicket` post-cobro).
- **Printer Settings UI**: traducir a español + acciones con mat-menu.
- **UI producto→sectores** (handler listo; desbloquea pizza mitad-y-mitad cocina+bar).
- **Onboarding task "Agregar impresora"** + **wizard de configuración LPR** (ver detalle arriba en "Acciones inmediatas").

### P3 — Sweeps de calidad / consistencia
- **Preselecciones** en dialogs (única opción / principal / última-usada).
- Sweep **`appCurrencyInput`** global (inputs monetarios locale-aware).
- **ngModel → Reactive Forms** (~35 archivos).
- Rollout **`<app-table-toolbar>`** (3/~16 migrados).
- **Adjuntos UI por entidad** (backend genérico + permisos listos; UI solo en GASTO).

### P4 — Completar features con base existente
- **Caja Mayor Fase 5**: arqueos/cortes formales + reportes imprimibles.
- UI de **Combos / Promociones / Producción** (entidades existen, sin UI).
- **Reportes** Ventas/Compras con exports PDF/Excel.
- **Compras secundarias**: recepción de mercadería, devoluciones, tab Productos en proveedor-detalle, link CPP→Compra en detalle, C-5 testing E2E.
- **Visor universal de documentos** (UX RRHH).

### P5 — Features grandes / nuevas
- **Pago mixto** reutilizable (efectivo+banco, N líneas).
- **Clientes F3/F4**: loyalty/puntos, direcciones múltiples, cumpleaños, import CSV, reportes avanzados.
- **KDS** (Kitchen Display Screen) + impresión ESC/POS avanzada.
- **Reservas** UI completa.

### Continuo (transversal)
- Testing E2E (Producto→Receta→PdV→Venta→Stock; Compras contado/crédito; multi-moneda).
- Probar margen/precio sugerido de receta con una receta con ingredientes (implementado, sin probar).
