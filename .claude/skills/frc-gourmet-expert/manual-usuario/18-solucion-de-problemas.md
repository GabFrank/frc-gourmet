# Capítulo 18 — Solución de problemas

## La app no abre

1. Verificá que cerraste cualquier instancia abierta antes.
2. Verificá que el archivo `.db` existe en:
   - macOS: `~/Library/Application Support/frc-gourmet/frc-gourmet.db`
   - Windows: `%APPDATA%\frc-gourmet\frc-gourmet.db`
   - Linux: `~/.config/frc-gourmet/frc-gourmet.db`
3. Si el archivo se borró: la app crea uno nuevo vacío al arrancar (perdés todos los datos).
4. Si no carga: contactar soporte. Posiblemente corrupción de BD.

**Backup recomendado: copiá el `.db` a un USB/nube semanalmente.**

## No puedo iniciar sesión

- ¿CapsLock activado?
- Verificá el nickname (el sistema lo trata case-insensitive: `admin = ADMIN = Admin`).
- Si dice "Usuario inactivo": el admin debe reactivarte (cap. 3, `activo = true`).
- Si olvidaste contraseña: el admin debe editarla (no hay recuperación auto).

## La pantalla está rota / colores raros / texto invisible

- Cambiá el tema (menú de usuario 👤 → Tema claro / Tema oscuro). A veces el cambio fuerza un re-render.
- Cerrá y abrí la pestaña.
- Cerrá y abrí la app.
- Si persiste: posible bug de UI. Reportá.

## Una pestaña no responde

- Click en × para cerrarla.
- Volvé al menú lateral y abrila de nuevo.
- Si la app entera está colgada: cerrarla con Task Manager / Force Quit y reabrir.

## El producto no aparece en el PdV

- Verificá `esVendible = true`.
- Verificá `activo = true`.
- Si tiene presentaciones: que al menos una esté activa.
- Si tiene precios: que al menos uno esté activo y principal.

## El producto no aparece en compras

- Verificá `esComprable = true`.
- (Es un flag distinto a `esVendible`.)

## Stock no se descuenta al vender

- Verificá `controlaStock = true` en el producto (para RETAIL) o sus ingredientes (para elaborado).
- Si era un combo con depth > 2: límite de recursión, no procesa.
- Si la venta falló al concluir: el descuento de stock es fire-and-forget. La venta puede haberse cobrado pero stock no procesado. Ir a admin para re-procesar.

## Mesa quedó OCUPADA pero no hay venta

Bug raro de race condition. Solución manual:
- Avisar al admin que ejecute query de fix:
```sql
UPDATE pdv_mesas SET estado = 'DISPONIBLE'
WHERE estado = 'OCUPADO'
  AND id NOT IN (SELECT mesa_id FROM ventas WHERE estado = 'ABIERTA' AND mesa_id IS NOT NULL);
```

## El cobro rechaza la moneda

- Verificá que la caja tenga esa moneda en su configuración (`CajaMoneda`).
- Verificá que haya tipo de cambio (`MonedaCambio`) entre la moneda y la principal.

## Saldo de Caja Mayor desfasado

- Posible movimiento sin transacción atómica que dejó saldos inconsistentes.
- Solución: admin ejecuta `recalcular-saldos` (re-construye desde movimientos).
- Backup antes.

## No puedo anular un movimiento

Mensaje "Anular desde X módulo" significa que el movimiento está vinculado a otro módulo (vale, liquidación, CPP, etc.). Ir al módulo origen y anular desde ahí (revierte todo).

## Compra no aparece en pagar-compras-dialog

- Si era contado pre-refactor 2026-05-05: no tiene CPP, aparece como "PAGADA" en lista.
- Si era crédito o post-refactor: debería aparecer. Verificar que cuotas estén en estado PENDIENTE/PARCIAL.

## Liquidación de sueldo no incluye comisión

- Verificá que la `LiquidacionComision` esté en estado APROBADA del período correcto.
- El funcionario debe tener `usuario_id` vinculado.

## Liquidación calcula IPS mal

- Verificar `IPS_PORCENTAJE_FUNCIONARIO` en Config RRHH.
- Sistema aplica al `salarioBase`, no al `totalHaberes`.

## Vacaciones acumuladas mal

- El sistema cuenta días según `fechaIngreso` y `fechaCorte`. Verificar que la fechaIngreso del funcionario sea correcta.
- Si hay error histórico, ajustar manualmente la `Vacacion` (días generados / gozados).

## Notificación que no aparece o aparece duplicada

- Las notificaciones se generan cada 24h. Las nuevas pueden tardar.
- Si ves duplicadas (raro): la deduplicación falló. Borrar las dobles manualmente.

## Imagen de producto no se muestra

- La funcionalidad de imágenes de producto está **parcialmente desactivada** en esta versión.
- Solo perfiles funcionan.

## Reporte PDF/Excel no se genera

- Verificar que tengas permiso de exportar.
- Si el reporte tiene > 10.000 filas: timeout. Filtrar más.

## Impresora no imprime

- Test print desde **Configuración → Impresoras** para verificar conexión.
- Verificá tipo (epson/star/thermal) coincide con tu impresora física.
- Si network: ping a la IP.
- Si USB en macOS: usar CUPS (ver capítulo 2).

## La app está lenta

- Cantidad de pestañas abiertas — cerrar las que no usás.
- Cantidad de productos / asistencias / liquidaciones acumuladas — el sistema es escalable pero no infinito.
- BD de varios años — considerar archivar.

## Pérdida de datos

⚠️ **Antes de cualquier troubleshoot que toque la BD**:

1. Cerrar la app.
2. Backup del `.db`:
   ```bash
   cp ~/Library/Application\ Support/frc-gourmet/frc-gourmet.db /ruta/backup/db-$(date +%Y%m%d).bak
   ```
3. Si tenés que restaurar:
   ```bash
   cp /ruta/backup/db-fecha.bak ~/Library/Application\ Support/frc-gourmet/frc-gourmet.db
   ```

## Errores que solo ve el desarrollador

Errores tipo "Error invoking remote method 'foo': Error: bar" → reportar al equipo de desarrollo con:
- Captura de pantalla.
- Hora del error.
- Qué estabas haciendo.
- Logs si los tenés (terminal donde corre Electron en dev).

## Reportar bugs

- GitHub Issues (si está habilitado).
- Email al equipo de desarrollo.

Incluir:
- Versión de la app (se muestra en la barra superior, junto al nombre de la empresa: "FRC Gourmet vX.Y.Z").
- OS (macOS / Windows / Linux).
- Pasos para reproducir.
- Captura.
- Backup del `.db` si es relevante (cuidado con datos sensibles).

---

**Próximo capítulo →** [19 — Glosario](19-glosario.md)
