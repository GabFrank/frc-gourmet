# PLAN #350 (revisión de update-caja-mayor) — editar y cerrar una caja mayor

Decisión del propietario (14/11/2026, opción A): «solo se pueden editar los campos permitidos y el cierre de una caja mayor pasa por validación».

## Hoy
- `update-caja-mayor` (`electron/handlers/caja-mayor.handler.ts`) hace `repo.merge(entity, data)` + `save`: cualquier cliente (IPC o `/api/rpc`) puede cambiar `estado` (reabrir una caja cerrada), `fechaApertura`, `fechaCierre`, `responsable`, `activo`, `id`, auditoría.
- Las dos pantallas que cierran (`list-cajas-mayor.component.ts:125`, `caja-mayor-detalle.component.ts:795`) cierran con `updateCajaMayor({estado:'CERRADA', fechaCierre})`: el cierre **no pasa** por `cerrar-caja-mayor`, así que no se notifica el cierre ni se dispara el evento FT `CAJA_CERRADA`.
- `cerrar-caja-mayor` no valida nada: vuelve a cerrar una caja ya cerrada (pisa `fechaCierre`, notifica y dispara FT otra vez). Dos cierres simultáneos notifican dos veces.
- `create-caja-mayor` hace `repo.create({...data})`: un `id` en `data` convierte el alta en un save sobre otra caja.

## Cambio
1. `update-caja-mayor`: lista blanca `nombre`, `descripcion`. `nombre` en mayúsculas y no vacío; `descripcion` en mayúsculas o null.
   - Si `data` trae `estado`, `fechaApertura`, `fechaCierre`, `responsable`, `activo`, `saldos`, `movimientos` o un `id` distinto → error claro `CAMPO_NO_EDITABLE: <campos>` (para cerrar: «Cerrar caja mayor»). Otros campos desconocidos se ignoran.
   - Escribe con `repo.update(id, {nombre, descripcion, updatedBy})` en vez de save de la entidad entera (no pisa columnas que no se tocan).
   - Caja cerrada: se sigue permitiendo cambiar nombre/descripción (no afecta saldos). Caja inexistente → error.
2. `cerrar-caja-mayor` con validación:
   - Inexistente → error; `activo=false` → `CAJA_MAYOR_INACTIVA`; ya `CERRADA` → `CAJA_MAYOR_YA_CERRADA`.
   - Cierre atómico: `UPDATE caja_mayor SET estado='CERRADA', fecha_cierre, updated_by WHERE id=:id AND estado='ABIERTA'`; si `affected=0` → `CAJA_MAYOR_YA_CERRADA` (otro cierre ganó). Notificación y FT solo si este cierre fue el que cambió el estado.
3. Las dos pantallas cierran con `cerrarCajaMayor(id)` y muestran el mensaje del error (ya cerrada / inactiva) en el snackbar.
4. `create-caja-mayor`: toma solo `nombre` (obligatorio, mayúsculas, ≤100), `descripcion` y `responsable` (solo si el usuario existe; lo usa el runbook de carga inicial) de `data` (ignora `id`, `estado`, fechas, `activo`, saldos).
6. Clientes de versiones anteriores que cierran con `update({estado:'CERRADA', fechaCierre})` pasan por el cierre validado (auditoría B del plan). Las pantallas muestran el motivo sin el código técnico y el detalle recarga si el cierre falla.
5. `RepositoryHttpService.updateCajaMayor/cerrarCajaMayor` quedan como están (stubs; el modo cliente usa el canal genérico). No se toca.

## Fuera de alcance
- Validar que no haya cajas de PdV abiertas o saldos pendientes antes de cerrar (regla de negocio no pedida).
- Reabrir una caja mayor (no existe flujo; con el cambio, tampoco por update).
- Que los movimientos rechacen una caja mayor CERRADA (otro tema).

## Pruebas
- `scripts/test-caja-mayor-update.ts` (`npm run test:caja-mayor-update`, SQLite y PG con `CM_PG=<base>`):
  - update de nombre/descripcion OK, en mayúsculas; estado/saldos/fechas sin cambio.
  - update con `estado`, `fechaCierre`, `responsable`, `activo`, `saldos` → `CAMPO_NO_EDITABLE`, nada cambia. Control: en develop el estado cambia.
  - nombre vacío → error.
  - cerrar ABIERTA → CERRADA + fechaCierre; cerrar otra vez → `CAJA_MAYOR_YA_CERRADA` y fechaCierre no cambia; inactiva → `CAJA_MAYOR_INACTIVA`.
  - dos cierres simultáneos (PG): uno OK, otro `CAJA_MAYOR_YA_CERRADA`.
  - create con `id` de otra caja → crea una nueva, la otra intacta; estado ABIERTA aunque manden CERRADA.
  - sin permiso → PERMISO REQUERIDO.
- `test:permissions-e2e` sigue pasando (`cerrar-caja-mayor` con 999).
- test:all sin fallas nuevas (línea base: 3 de entorno).
- Prueba real en clon de Don Franco (donfranco_350cm): editar nombre de la caja mayor real, intento de cambiar estado/saldo rechazado (saldos iguales), cerrar una caja de prueba OK, segundo cierre rechazado. No toca cobro, factura ni PdV.
- UI: captura en modo oscuro del cierre desde el detalle (si la vista lo permite) o snackbar del rechazo.
