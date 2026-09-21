# PLAN: Implementación Role Seed GERENTE_READONLY

**Fecha**: 2026-09-10  
**Branch**: `cursor/gerente-readonly-seed-1175`  
**PR**: [Pendiente]

## Objetivo

Implementar un rol plantilla `GERENTE_READONLY` con permisos de solo lectura para el bot de auditoría Don Franco, permitiendo consultas automatizadas sin riesgo de modificación de datos.

## Contexto

El sistema actualmente cuenta con tres roles plantilla (GERENTE, CAJERO, MOZO) pero no tiene un rol dedicado para auditoría externa o consultas automatizadas. El bot de auditoría Don Franco necesita acceso de solo lectura a:
- Dashboards y KPIs de Ventas, Financiero, RRHH
- Reportes de cierre de mes
- Histórico de ventas y operaciones
- Datos maestros (productos, clientes, proveedores, funcionarios)

Sin un rol específico, el único camino es crear un usuario con rol GERENTE completo (incluye permisos de escritura) o ADMINISTRADOR (acceso total), ambos inaceptables para un bot externo.

## Alcance

### Fase 1: Seed del Rol (Esta Implementación)

✅ **Completado:**
- Agregar rol plantilla `GERENTE_READONLY` al array `ROLES_PLANTILLA` en `electron/utils/seed-system.ts`
- Incluir solo permisos de lectura (`*_VER`) que ya existen en el sistema
- Documentar el proceso de creación del usuario `don-franco-audit`
- Documentar permisos asignados y restricciones

### Fuera de Alcance (Fase 2+)

- Implementación del bot de auditoría Don Franco (proyecto separado)
- API token-based authentication para el bot (requiere feature adicional)
- Nuevos permisos de lectura no existentes en el sistema actual
- Modificación de handlers IPC para soportar permisos específicos

## Cambios Implementados

### 1. Seed del Rol GERENTE_READONLY

**Archivo**: `electron/utils/seed-system.ts`

**Ubicación**: Array `ROLES_PLANTILLA` (línea ~445+)

**Permisos incluidos** (30 permisos de solo lectura):

#### Dashboards y Reportes (9)
- `HOME_DASHBOARD_VER`
- `VENTAS_DASHBOARD_VER`
- `COMPRAS_DASHBOARD_VER`
- `PRODUCTOS_DASHBOARD_VER`
- `FINANCIERO_DASHBOARD_VER`
- `CAJA_MAYOR_DASHBOARD_VER`
- `RRHH_DASHBOARD_VER`
- `VENTAS_REPORTES_VER`
- `FINANCIERO_REPORTES_VER`

#### RRHH (2)
- `RRHH_FUNCIONARIO_VER`
- `RRHH_NOTIFICACIONES_VER`

#### Comisiones (1)
- `COMISION_REGLA_VER`

#### Productos y Stock (6)
- `PRODUCTOS_VER`
- `RECETAS_VER`
- `INGREDIENTES_VER`
- `ADICIONALES_VER`
- `SABORES_VER`
- `STOCK_MOVIMIENTO_VER`

#### Ventas (2)
- `VENTAS_HISTORICO_VER`
- `PEDIDOS_ONLINE_VER`

#### Facturación (1)
- `FACTURACION_VER`

#### Compras (2)
- `COMPRAS_VER`
- `PROVEEDORES_VER`

#### Personas (2)
- `PERSONAS_VER`
- `CLIENTES_VER`

#### Financiero (2)
- `FINANCIERO_CAJA_VER`
- `BANCOS_VER`

#### Sistema (3)
- `MUSICA_VER`
- `COMANDAS_KDS_VER`

**Criterio de selección:**
- Solo permisos que GERENTE ya tiene (subset)
- Solo permisos de lectura (`*_VER` o equivalentes de consulta)
- Excluye todos los permisos de:
  - Creación (`*_CREAR`, `*_GESTIONAR`)
  - Edición (`*_EDITAR`)
  - Aprobación (`*_APROBAR`)
  - Pago/Cobro (`*_PAGAR`, `*_COBRAR`)
  - Configuración (`*_CONFIGURAR`)
  - Operación (`*_OPERAR`, excepto lectura)
  - Eliminación/Anulación (`*_ANULAR`, `*_ELIMINAR`)

### 2. Documentación Creada

#### `docs/auditoria/RUNBOOK-USUARIO-DON-FRANCO-AUDIT.md`
- Proceso paso a paso para crear el usuario `don-franco-audit`
- Lista completa de permisos asignados y sus propósitos
- Restricciones del rol
- Instrucciones de seguridad para manejo de credenciales
- Procedimiento de verificación
- Troubleshooting común
- Guías de mantenimiento (rotación de contraseñas, auditoría)

#### `docs/planes/PLAN-GERENTE-READONLY-SEED.md` (este documento)
- Contexto y objetivo
- Detalle de permisos asignados
- Criterios de diseño
- Próximos pasos

## Consideraciones de Diseño

### ¿Por qué no inventar nuevos permisos?

Se decidió **NO** crear nuevos códigos de permiso (ej. `VENTAS_AUDITORIA_VER`) por:
1. **Regla del ticket**: solo agregar permisos que ya existen y están implementados
2. **Complejidad innecesaria**: los permisos `*_VER` actuales cubren las necesidades de auditoría Fase 1
3. **Mantenimiento**: nuevos permisos requerirían actualizar todos los handlers IPC correspondientes con `ensurePermission`

### ¿Por qué basarse en GERENTE en lugar de crear desde cero?

GERENTE es el rol más completo sin acceso de sistema (ADMINISTRADOR). Sus permisos de lectura representan "todo lo consultable del negocio". Al filtrar solo los `*_VER`, obtenemos automáticamente:
- Cobertura completa de módulos
- Permisos ya implementados y probados
- Actualización automática: si GERENTE gana un nuevo `*_VER`, el seed sync lo agregará a GERENTE_READONLY

### ¿Qué pasa con handlers sin ensurePermission?

Los handlers de solo lectura (`get-*`, `list-*`) generalmente **NO** tienen `ensurePermission` (regla 22 de la skill). Esto es aceptable porque:
- `/api/rpc` es default-allow + JWT válido
- Los handlers de mutación SÍ tienen el guard
- El riesgo es "ver datos sin permiso", no "modificar datos"

**Gotcha conocido**: algunos handlers de lectura SÍ deberían tener `ensurePermission` pero no lo tienen (ej. datos sensibles de RRHH, configuración de sistema). Esto es un **bug preexistente** documentado en `reference/known-bugs.md` y está fuera del alcance de este PR.

### ¿Por qué no incluir permisos de documentos (`DOCUMENTOS_*`)?

El rol GERENTE_READONLY **no** incluye permisos de documentos porque:
- `DOCUMENTOS_IMPRIMIR_TICKET` / `DOCUMENTOS_REIMPRIMIR_*`: son **acciones de impresión** (mutación del spooler)
- `DOCUMENTOS_GENERAR_PDF`: genera archivos (side effect)
- `DOCUMENTOS_ADJUNTAR` / `DOCUMENTOS_ADJUNTOS_ELIMINAR`: mutación de filesystem

El bot de auditoría no necesita imprimir ni generar PDFs, solo consultar datos ya existentes.

## Testing

### Pre-Commit
✅ `npm run build` — Compilación exitosa sin errores de TypeScript

### Manual (Post-Merge)
Pendiente ejecutar en la app:
1. ✓ Verificar que el rol `GERENTE_READONLY` se crea al iniciar la app
2. ✓ Contar que tiene ~30 permisos asignados
3. ✓ Crear usuario `don-franco-audit` con ese rol (seguir RUNBOOK)
4. ✓ Login como `don-franco-audit`
5. ✓ Verificar acceso a dashboards y reportes
6. ✓ Verificar que NO puede editar productos, crear ventas, ni configurar sistema

## Próximos Pasos (Fuera de Este PR)

### Fase 2: API Token Authentication
Para que el bot pueda autenticarse sin password (OAuth/JWT):
1. Implementar generación de API tokens por usuario
2. Endpoint `/api/auth/token` con refresh
3. Almacenar tokens en tabla `api_tokens` (nueva entity)
4. Middleware de autenticación token-based para `/api/rpc`
5. Documentar en `docs/auditoria/API-TOKEN-AUTH.md`

### Fase 3: Endpoints Dedicados de Auditoría (Opcional)
Si los endpoints genéricos de consulta no son suficientes:
1. Crear handlers específicos en `electron/handlers/auditoria.handler.ts`
2. Nuevos permisos `AUDITORIA_*` si es necesario
3. Registrar en `main.ts` y agregar a `GERENTE_READONLY`

### Fase 4: Logs de Auditoría del Bot
Registrar todas las consultas del usuario `don-franco-audit`:
1. Middleware de logging por usuario/IP
2. Tabla `auditoria_accesos` (timestamp, usuario, handler, params hash)
3. Dashboard de auditoría en la UI (opcional)

## Impacto

### En el Sistema
- **Cero breaking changes**: rol nuevo, no modifica roles existentes
- **Seed idempotente**: si el rol ya existe (creado manualmente), solo agrega permisos faltantes
- **Sin migración**: solo seed, no toca schema

### En Usuarios Existentes
- **Ninguno**: roles GERENTE, CAJERO, MOZO no cambian
- Usuarios con roles custom no se ven afectados

### En la App Mobile (PWA)
- **Compatible**: el rol es backend-only, la PWA lo respeta automáticamente vía `/api/rpc`

## Checklist de Terminado

- [x] Rol `GERENTE_READONLY` agregado a `ROLES_PLANTILLA`
- [x] Lista de permisos documentada y justificada
- [x] Runbook de creación del usuario creado
- [x] Plan técnico documentado
- [x] `npm run build` exitoso
- [ ] Commit + push
- [ ] Draft PR a `develop`
- [ ] Manual testing post-merge (checklist arriba)

## Notas Adicionales

### Convención de Naming
- **Rol**: `GERENTE_READONLY` (UPPERCASE, guion bajo separa palabras)
- **Usuario del bot**: `don-franco-audit` (lowercase, guion separa palabras)

Esto sigue la convención del sistema: entidades/roles en UPPERCASE, usuarios/nicknames en lowercase.

### Seed Timing
El rol se crea en `seedRolesPlantilla()` que corre en `seedSystemData()` (línea ~576 de `seed-system.ts`), que a su vez se ejecuta en `DatabaseService.runMigrations()` al iniciar la app. Esto garantiza que el rol esté disponible antes de que el primer usuario haga login.

### Sync Automático
La función `seedRolesPlantilla()` es inteligente: si el rol ya existe (creado manualmente por el usuario), **solo agrega los permisos faltantes**, nunca quita permisos customizados. Esto permite:
- Agregar nuevos `*_VER` al seed en el futuro sin romper instalaciones existentes
- Usuarios pueden personalizar `GERENTE_READONLY` sin que el seed lo sobreescriba

---

**Estado**: ✅ Implementación completa, pendiente PR y testing manual
