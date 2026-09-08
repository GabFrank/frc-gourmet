# Gastos de Caja y Moneda sin Decimales

## Directiva `appCurrencyInput` para Monedas sin Decimales

Las monedas configuradas con `decimales=0` requieren un comportamiento especial en los inputs de monto:

- La directiva `appCurrencyInput` bloquea la entrada de los caracteres `.` y `,` mediante eventos `keydown` e `input`
- Esto previene que el usuario ingrese decimales cuando la moneda no los soporta
- Para USD (dólares) no se aplica cambio de moneda en estos inputs

## Uso en GastoCaja

El campo de monto en los gastos de caja utiliza la directiva `appCurrencyInput`, lo que garantiza:

- Entrada limpia de montos según la configuración de decimales de la moneda seleccionada
- Validación en tiempo real durante la escritura
- Experiencia de usuario consistente con el resto del sistema financiero

## Permisos para Editar Gastos

La edición de gastos de caja está restringida por permisos:

- **Permiso requerido:** `FINANCIERO_CAJA_GESTIONAR`
- **Roles con acceso:** Administrador y Gerente
- **Restricción:** El rol Cajero NO puede editar gastos de caja

## Edición de Gastos en Resumen de Caja

El botón de editar en el listado de gastos:

- Se renderiza siempre (con el permiso `FINANCIERO_CAJA_GESTIONAR`)
- Está habilitado solo para gastos con estado `ACTIVO`
- Los gastos anulados tienen el botón deshabilitado
- Funciona incluso cuando la caja está cerrada
- El resumen de caja lee los gastos `ACTIVO` de forma dinámica desde la base de datos
- El payload del resumen incluye el campo `estado` para habilitar/deshabilitar el botón correctamente

## Restricciones de Edición

Al editar un gasto de caja existente:

- **NO se puede cambiar:** Fecha, Moneda, ni Forma de Pago
- **Se puede cambiar:** Monto, Descripción y Categoría
- Estos campos bloqueados mantienen la integridad contable del registro

## PWA (Móvil)

La funcionalidad de edición de gastos NO está disponible en la versión móvil (PWA). Esta característica está fuera del alcance actual.

## Requerimiento de Reinicio

**Importante:** Este PR modifica tanto handlers como el archivo preload.

- Cualquier cambio en `electron/handlers/*.handler.ts` requiere reiniciar la aplicación o el servidor
- Cualquier cambio en `preload.ts` también requiere reinicio
- Sin reinicio, los cambios no estarán disponibles en el IPC del renderer
