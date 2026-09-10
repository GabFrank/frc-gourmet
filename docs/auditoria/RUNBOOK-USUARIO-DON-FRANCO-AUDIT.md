# RUNBOOK: Crear Usuario don-franco-audit (Bot de Auditoría)

## Objetivo

Crear un usuario de sistema con permisos de solo lectura para el bot de auditoría Don Franco. Este usuario permite consultas automatizadas sin riesgo de modificación de datos.

## Prerequisitos

- Acceso de administrador al sistema FRC Gourmet
- El rol `GERENTE_READONLY` debe existir en el sistema (seed automático desde esta versión)

## Proceso de Creación

### 1. Verificar que el Rol Existe

Al iniciar la aplicación, el sistema crea automáticamente el rol `GERENTE_READONLY` con permisos de solo lectura si no existe.

Para verificar:
1. Navegar a **Sistema → Roles**
2. Buscar el rol `GERENTE_READONLY`
3. Verificar que tiene ~30 permisos asignados (todos terminan en `_VER` o son de consulta)

### 2. Crear la Persona Base

1. Navegar a **Personas → Lista de Personas**
2. Clic en **Nuevo** (F2)
3. Completar los datos:
   - **Nombre**: `DON`
   - **Apellido**: `FRANCO`
   - **Tipo Documento**: `CI` (o el apropiado)
   - **Número Documento**: `00000000` (o un número válido para el bot)
   - **Activo**: ✓

4. Guardar

### 3. Crear el Usuario del Sistema

1. Navegar a **Sistema → Usuarios**
2. Clic en **Nuevo** (F2)
3. Completar los datos:
   - **Persona**: Seleccionar `DON FRANCO`
   - **Nickname**: `don-franco-audit`
   - **Password**: Generar una contraseña segura (ver sección Seguridad)
   - **Activo**: ✓
   - **Debe cambiar password**: ☐ (desmarcar, es un bot)

4. En la sección **Roles**, asignar:
   - ✓ `GERENTE_READONLY`

5. Guardar

### 4. Almacenar las Credenciales

⚠️ **IMPORTANTE**: Las credenciales del bot deben almacenarse de forma segura.

**Para el usuario administrador:**
1. Generar una contraseña segura (mínimo 16 caracteres, incluir mayúsculas, minúsculas, números y símbolos)
2. Guardar las credenciales en el gestor de secrets del bot:
   ```
   Usuario: don-franco-audit
   Password: [contraseña_generada]
   ```

**Para el equipo de desarrollo del bot:**
- Las credenciales deben inyectarse como variables de entorno o secrets del sistema de CI/CD
- NUNCA commitear las credenciales en el código fuente

## Permisos Asignados

El rol `GERENTE_READONLY` incluye **exclusivamente permisos de lectura**:

### Dashboards y Reportes
- `HOME_DASHBOARD_VER`
- `VENTAS_DASHBOARD_VER`
- `COMPRAS_DASHBOARD_VER`
- `PRODUCTOS_DASHBOARD_VER`
- `FINANCIERO_DASHBOARD_VER`
- `CAJA_MAYOR_DASHBOARD_VER`
- `RRHH_DASHBOARD_VER`
- `VENTAS_REPORTES_VER`
- `FINANCIERO_REPORTES_VER`

### Consultas por Módulo
- **RRHH**: `RRHH_FUNCIONARIO_VER`, `RRHH_NOTIFICACIONES_VER`
- **Comisiones**: `COMISION_REGLA_VER`
- **Productos**: `PRODUCTOS_VER`, `RECETAS_VER`, `INGREDIENTES_VER`, `ADICIONALES_VER`, `SABORES_VER`, `STOCK_MOVIMIENTO_VER`
- **Ventas**: `VENTAS_HISTORICO_VER`, `PEDIDOS_ONLINE_VER`
- **Facturación**: `FACTURACION_VER`
- **Compras**: `COMPRAS_VER`, `PROVEEDORES_VER`
- **Personas**: `PERSONAS_VER`, `CLIENTES_VER`
- **Financiero**: `FINANCIERO_CAJA_VER`, `BANCOS_VER`
- **Sistema**: `MUSICA_VER`, `COMANDAS_KDS_VER`

## Restricciones

El usuario `don-franco-audit` **NO PUEDE**:
- Crear, editar o eliminar ningún dato
- Aprobar operaciones
- Realizar pagos o cobros
- Configurar el sistema
- Gestionar usuarios o permisos
- Operar el punto de venta
- Registrar movimientos financieros
- Anular o cancelar operaciones

## Verificación

Para verificar que el usuario fue creado correctamente:

1. Cerrar sesión del administrador
2. Iniciar sesión como `don-franco-audit` con la contraseña asignada
3. Verificar que:
   - Puede ver los dashboards
   - Puede consultar ventas históricas
   - Puede ver reportes de cierre de mes
   - **NO** puede editar productos
   - **NO** puede acceder a configuración de sistema
   - **NO** puede crear o modificar usuarios

## Troubleshooting

### El rol GERENTE_READONLY no aparece
- Verificar que la aplicación se haya iniciado completamente (el seed corre al startup)
- Revisar los logs de la consola: debe aparecer "Rol GERENTE_READONLY: creado con N permisos"

### El usuario no puede ver ciertos datos
- Verificar que el rol `GERENTE_READONLY` está asignado al usuario
- Verificar que los permisos específicos existen en el sistema (navegar a **Sistema → Permisos**)

### Error de permisos al intentar consultar
- Algunos handlers IPC pueden no tener implementado el permiso de lectura correspondiente
- Reportar el caso para agregar el permiso faltante al seed

## Mantenimiento

- **Rotación de contraseñas**: Cambiar la contraseña del bot cada 90 días
- **Auditoría de acceso**: Revisar los logs de acceso del usuario periódicamente
- **Actualización de permisos**: Al actualizar la aplicación, el sistema agregará automáticamente nuevos permisos `*_VER` al rol si existen

## Contacto

Para consultas sobre el usuario de auditoría o problemas de permisos, contactar al equipo de desarrollo o al administrador del sistema.
