# Catálogo RPC/API Read-Only para Auditorías Don Franco

**Fecha:** 2026-09-10  
**Repo:** GabFrank/frc-gourmet  
**Branch base:** `develop`  
**Propósito:** Documentar los métodos RPC de solo lectura para el bot de auditorías del Gerente Don Franco (modo server HTTP, NUNCA escribe datos de negocio).

---

## 1. Superficie HTTP del nodo `server`

### 1.1 Auth y sesión

| Endpoint | Método | Payload | Respuesta | Notas |
|---|---|---|---|---|
| `/api/auth/login` | POST | `{ nickname, password, deviceInfo, deviceId? }` | `{ success, usuario, token, sessionId }` | JWT en `token`. `usuario.mustChangePassword` debe ser `false` o bloqueará toda operación. |
| `/api/auth/refresh` | POST | `{ token: refreshToken }` | `{ success, token, refreshToken }` | Renovar access token. En cliente, el refresh token se persiste en keytar/filesystem. |
| `/api/auth/logout` | POST | `{ sessionId }` | `{ success }` | Opcional: marca `LoginSession.is_active = false`. |

**Autenticación:** Todas las llamadas a `/api/rpc` requieren `Authorization: Bearer <token>` en headers.

**Permisos:** El bot debe usar un usuario con rol **GERENTE** (o un usuario dedicado con un subset de permisos GERENTE para auditoría).

### 1.2 Canal RPC único

| Endpoint | Método | Payload | Respuesta |
|---|---|---|---|
| `/api/rpc` | POST | `{ method: "canal-ipc", params: [...args] }` | Resultado del handler | 

**Ejemplo:**

```json
POST /api/rpc
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "method": "get-ventas-by-date-range",
  "params": ["2026-09-01T00:00:00.000Z", "2026-09-10T23:59:59.999Z", null]
}
```

**Respuesta exitosa:** JSON con el resultado del handler (estructura varía por método).

**Respuesta de error:**
- `401 Unauthorized` — token inválido/expirado
- `403 Forbidden` — usuario no tiene el permiso requerido (mensaje: `"DEBE TENER EL PERMISO XXXX"`)
- `500` — error interno del handler (consultar logs del servidor)

---

## 2. Casos de uso: Fase 1

### 2.1 Ventas del día

**Objetivo:** Obtener todas las ventas de un rango de fechas (típicamente "hoy" según jornada comercial configurada).

#### Método recomendado: `get-ventas-by-date-range`

**Signature:**

```typescript
ipcMain.handle('get-ventas-by-date-range', async (
  _event,
  desde: string,    // ISO 8601 (ej. "2026-09-10T00:00:00.000Z")
  hasta: string,    // ISO 8601
  estado?: VentaEstado | null,
  filtros?: {
    cajaIds?: number[];
    canalOrigen?: 'PdV' | 'ONLINE' | 'TELEFONO' | 'WHATSAPP';
    zonaDeliveryId?: number;
    funcionarioId?: number;  // repartidor
  }
) => { ventas: Venta[]; totales: { ... } })
```

**Permisos requeridos:** `VENTAS_HISTORICO_VER` (el rol GERENTE lo tiene).

**Response:**

```json
{
  "ventas": [
    {
      "id": 1234,
      "created_at": "2026-09-10T14:23:00.000Z",
      "estado": "CONCLUIDA",
      "cliente": { "id": 56, "persona": { "nombre": "JUAN PEREZ" } },
      "items": [
        {
          "id": 5678,
          "producto": { "nombre": "PIZZA NAPOLITANA" },
          "cantidad": 1,
          "precioUnitario": 45000,
          "descuento": 0,
          "total": 45000
        }
      ],
      "pago": {
        "id": 999,
        "detalles": [
          { "formaPago": { "nombre": "EFECTIVO" }, "monto": 45000, "moneda": { "simbolo": "Gs" } }
        ]
      },
      "costoDelivery": 5000,
      "delivery": {
        "id": 111,
        "modo": "DELIVERY",
        "estado": "ENTREGADO",
        "zona": { "nombre": "ZONA NORTE" },
        "repartidor": { "persona": { "nombre": "CARLOS GOMEZ" } }
      }
    }
  ],
  "totales": {
    "totalVentas": 1234500,
    "totalItems": 45,
    "costoDelivery": 35000,
    "cantidadVentas": 23
  }
}
```

**Qué hace:**
- Devuelve ventas con `created_at` en el rango especificado
- Incluye joins completos: `items`, `pago`, `delivery`, `cliente`, `mesa`, `comanda`
- Filtra por estado (`null` = todas; `'CONCLUIDA'` = solo cobradas; `'CANCELADA'` = canceladas)
- Opcionalmente filtra por caja, canal, zona o repartidor
- Agrega `totales` del resultado filtrado (suma de pagos en moneda principal)

**Detectar auditoría:** Si `filtros.canalOrigen` o `zonaDeliveryId` o `funcionarioId` vienen poblados, es una consulta analítica. Si solo traen `desde`/`hasta`/`cajaIds`, es consulta operativa estándar.

**Alternativas:**

- **`get-dashboard-ventas-kpis`** (dashboards): Devuelve KPIs agregados (no ventas individuales) con filtros por rango/caja. Útil para auditar totales rápidos sin detalle. Handler: `dashboard-ventas.handler.ts`.
  - Permisos: `VENTAS_DASHBOARD_VER` (GERENTE lo tiene).
  - Params: `{ rango?: 'today'|'week'|'month'|'custom', desde?, hasta?, cajaIds? }`
  - Response: `{ ventasTotales, itemsVendidos, ticketPromedio, delivery: { envios, retiros, ... }, ... }`

- **`db-query`** directo (avanzado): El sistema tiene un helper `dbQuery(dataSource, sql, params)` que normaliza diferencias SQLite/Postgres. Los handlers lo usan internamente. **No expuesto en IPC**; el bot no puede llamarlo.

### 2.2 Cancelaciones

**Objetivo:** Listar ventas canceladas y entender por qué (motivo, usuario, timestamp).

#### Método recomendado: `get-ventas-by-date-range` con filtro `estado='CANCELADA'`

**Params:**

```json
{
  "method": "get-ventas-by-date-range",
  "params": [
    "2026-09-01T00:00:00.000Z",
    "2026-09-10T23:59:59.999Z",
    "CANCELADA"
  ]
}
```

**Permisos requeridos:** `VENTAS_HISTORICO_VER`.

**Response:** Igual que 2.1, pero solo ventas con `estado='CANCELADA'`.

**Información de cancelación:**

```json
{
  "id": 1234,
  "estado": "CANCELADA",
  "motivoCancelacion": "CLIENTE NO PAGO",
  "fechaCancelacion": "2026-09-10T15:30:00.000Z",
  "canceladoPor": { "id": 5, "nickname": "admin" },
  "delivery": {
    "estado": "CANCELADO",
    "motivoCancelacion": "SIN MOTIVO"  // si se canceló vía delivery
  }
}
```

**Qué revisar en auditoría:**
- Ventas canceladas SIN motivo o con motivo genérico
- Ventas canceladas DESPUÉS de cobradas (implica reversión de stock + pago + CPC si era a crédito)
- Cancelaciones masivas por un mismo usuario en poco tiempo
- Deliveries cancelados con `delivery.estado = 'CANCELADO'` pero `venta.estado != 'CANCELADA'` (inconsistencia: bug conocido, ver `known-bugs.md`)

**Handlers relacionados:**

- **`delivery-cancelar`** (handler dedicado): Cancela un delivery/retiro de forma transaccional (revierte stock, pagos, CPC). Requiere `VENTAS_DELIVERY_CANCELAR_COBRADO` si la venta ya estaba cobrada. **⚠️ MUTACIÓN — el bot NO debe llamarlo.**
  
- **`update-venta`** con `estado: 'CANCELADA'`: Path genérico de cancelación. Requiere `VENTAS_PDV`. **⚠️ MUTACIÓN — el bot NO debe llamarlo.**

### 2.3 Productos sin precio / mal registrados

**Objetivo:** Detectar productos que:
1. No tienen `PrecioVenta` activo (no se pueden vender)
2. Tienen precio 0 o negativo
3. `ELABORADO` sin receta vinculada
4. `ELABORADO_CON_VARIACION` sin sabores/variaciones

#### Método recomendado: `get-productos-for-sale-mode`

**Signature:**

```typescript
ipcMain.handle('get-productos-for-sale-mode', async (_event) => Producto[])
```

**Permisos requeridos:** `PRODUCTOS_VER` (GERENTE lo tiene).

**Response:**

```json
[
  {
    "id": 123,
    "nombre": "PIZZA MUZZARELLA",
    "tipo": "ELABORADO_CON_VARIACION",
    "activo": true,
    "presentaciones": [
      {
        "id": 456,
        "descripcion": "MEDIANA",
        "activo": true,
        "preciosVenta": [
          {
            "id": 789,
            "valor": 45000,
            "moneda": { "simbolo": "Gs", "principal": true },
            "tipoPrecio": { "descripcion": "NORMAL" },
            "principal": true,
            "activo": true
          }
        ],
        "receta": {
          "id": 999,
          "nombre": "PIZZA MUZZARELLA MEDIANA",
          "presentacion": { "id": 456 }
        }
      }
    ]
  }
]
```

**Qué revisar en auditoría:**

1. **Productos sin precio:**

```javascript
productos.filter(p => 
  p.presentaciones.some(pres => 
    !pres.preciosVenta?.length || 
    !pres.preciosVenta.some(pv => pv.activo && pv.valor > 0)
  )
)
```

2. **Productos con precio 0 o negativo:**

```javascript
productos.filter(p => 
  p.presentaciones.some(pres => 
    pres.preciosVenta?.some(pv => pv.activo && pv.valor <= 0)
  )
)
```

3. **ELABORADO sin receta:**

```javascript
productos.filter(p => 
  (p.tipo === 'ELABORADO' || p.tipo === 'ELABORADO_CON_VARIACION') &&
  p.presentaciones.some(pres => !pres.receta || !pres.receta.id)
)
```

4. **ELABORADO_CON_VARIACION sin sabores:**

```javascript
// Requiere llamar `get-receta` por cada receta encontrada
// y verificar que tenga RecetaPresentacion (variaciones)
```

**Alternativas:**

- **`get-productos`**: Lista todos los productos (no solo los de venta). Requiere `PRODUCTOS_VER`. Acepta filtro `tipo`, `familiaId`, `subfamiliaId`.
  
- **`get-presentacion`**: Obtiene una presentación específica con sus precios/receta/códigos de barra. Útil para inspeccionar un producto sospechoso en detalle.

---

## 3. Casos de uso: Fase 2/3 (sketch ligero)

### 3.1 Clientes duplicados

**Handlers existentes:**

- **`get-clientes`**: Lista todos los clientes. Params: `activo?: boolean`. Requiere `CLIENTES_VER` (GERENTE lo tiene).
  
- **`search-personas-by-phone`**: Busca personas por teléfono (útil para detectar duplicados por número). Params: `telefono: string`. Requiere `PERSONAS_VER`.

**Estrategia de detección:**

1. Llamar `get-clientes` (devuelve `Cliente[]` con `persona` cargada)
2. Agrupar por `persona.documento`, `persona.telefono` o similitud de nombre (lógica en el bot)
3. Reportar grupos con >1 cliente

**⚠️ No hay handler de fusión de clientes.** Si se detecta duplicado, el gerente debe consolidarlo manualmente.

### 3.2 Créditos vencidos (CPC)

**Handlers existentes:**

- **`get-cuentas-por-cobrar`**: Lista todas las CPC. Params: `clienteId?: number, estado?: CuentaPorCobrarEstado`. Requiere `CPC_GESTIONAR` (GERENTE lo tiene).
  
- **`get-cuentas-por-cobrar-cuotas`**: Lista cuotas de CPC. Params: `cuentaPorCobrarId: number`. Requiere `CPC_GESTIONAR`.

**Estados de CPC:** `'ACTIVO'`, `'PAGADO'`, `'CANCELADO'`.

**Estrategia de detección de vencidos:**

1. Llamar `get-cuentas-por-cobrar` con `estado='ACTIVO'`
2. Para cada CPC, llamar `get-cuentas-por-cobrar-cuotas`
3. Filtrar cuotas con `fechaVencimiento < Date.now()` y `estado != 'PAGADO'`
4. Reportar CPC con cuotas vencidas

**Campos útiles en response:**

```json
{
  "id": 123,
  "cliente": { "persona": { "nombre": "JUAN PEREZ" } },
  "montoTotal": 500000,
  "saldoPendiente": 300000,
  "estado": "ACTIVO",
  "cuotas": [
    {
      "id": 456,
      "numeroCuota": 1,
      "monto": 100000,
      "fechaVencimiento": "2026-08-15T00:00:00.000Z",
      "estado": "VENCIDO"
    }
  ]
}
```

### 3.3 Funcionarios (RRHH)

**Handlers existentes:**

- **`get-funcionarios`**: Lista todos los funcionarios. Params: `activo?: boolean`. Requiere `RRHH_FUNCIONARIO_VER` (GERENTE lo tiene).
  
- **`get-funcionario-resumen-financiero`**: Devuelve resumen de deudas (vales, préstamos, CPC del cliente vinculado) convertidas a moneda principal. Params: `funcionarioId: number`. Requiere `RRHH_FUNCIONARIO_VER`.

**Casos de auditoría:**

1. Funcionarios con vales/préstamos pendientes
2. Funcionarios inactivos con saldo pendiente
3. Funcionarios sin asistencias registradas en período (ausencias no justificadas)

**⚠️ Handlers de RRHH son muchos (~10 archivos).** La documentación completa está en `domains/rrhh.md` y `domains/rrhh-liquidaciones.md`.

---

## 4. Lista DENY: Mutaciones que el bot NUNCA debe invocar

### 4.1 Ventas y PdV

| Método | Qué hace | Por qué NO |
|---|---|---|
| `create-venta`, `update-venta` | Crear/modificar ventas | Altera datos de negocio |
| `create-venta-item`, `update-venta-item`, `delete-venta-item` | Agregar/editar/quitar ítems | Modifica órdenes |
| `finalizar-venta`, `cobrar-venta-credito` | Marcar venta CONCLUIDA / cobrar a crédito | Cierra ventas |
| `registrar-cobro-parcial`, `anular-cobro-parcial` | Cobros parciales por ítem | Altera pagos |
| `crear-pago`, `update-pago`, `delete-pago` | Registrar/modificar pagos | Mueve dinero |
| `crear-pago-detalle`, `update-pago-detalle`, `delete-pago-detalle` | Líneas de pago (efectivo, tarjeta, etc.) | Mueve dinero |
| `create-acreditacion-pos`, `acreditar-transferencia-bancaria` | Acreditar cobros con tarjeta/transferencia | Ledger bancario |
| `delivery-crear`, `delivery-cambiar-estado`, `delivery-cancelar` | Gestión de deliveries | Altera pedidos |
| `delivery-convertir-modo` | Convertir DELIVERY ↔ RETIRO | Cambia costos |
| `set-pdv-mesa-estado`, `transferir-venta-pdv` | Ocupar/liberar mesas, mover cuentas | Operación de sala |
| `procesarStockVenta`, `revertirStockVenta` | Descontar/revertir stock | Inventario |

### 4.2 Productos y recetas

| Método | Qué hace | Por qué NO |
|---|---|---|
| `create-producto`, `update-producto`, `delete-producto` | CRUD productos | Catálogo |
| `create-presentacion`, `update-presentacion`, `delete-presentacion` | CRUD presentaciones | Catálogo |
| `create-precio-venta`, `update-precio-venta`, `delete-precio-venta` | CRUD precios | Altera precios |
| `vincular-receta-a-producto`, `desvincular-receta-de-producto` | Asignar/quitar recetas | Costeo |
| `create-receta`, `update-receta`, `delete-receta` | CRUD recetas | Costeo |
| `create-stock-movimiento` | Registrar movimiento de stock | Inventario |

### 4.3 Financiero y caja

| Método | Qué hace | Por qué NO |
|---|---|---|
| `create-caja`, `update-caja`, `delete-caja` | CRUD de cajas (turnos) | Cierre de caja |
| `create-conteo`, `update-conteo`, `delete-conteo` | Conteos de efectivo | Arqueo |
| `crear-operacion-financiera` | Operaciones de Caja Mayor (gasto, retiro, depósito, etc.) | Mueve dinero |
| `anular-caja-mayor-movimiento` | Anular movimientos | Contabilidad |
| `aplicar-pago-cpp`, `aplicar-pago-cpp-lote` | Pagar cuentas por pagar | Mueve dinero |
| `cobrar-cpc-cuota`, `cobrar-cpc-lote` | Cobrar cuentas por cobrar | Mueve dinero |

### 4.4 RRHH

| Método | Qué hace | Por qué NO |
|---|---|---|
| `create-vale`, `confirmar-vale`, `anular-vale` | CRUD vales | Adelantos |
| `create-funcionario`, `update-funcionario` | CRUD funcionarios | Nómina |
| `create-asistencia`, `update-asistencia` | Registrar asistencias | Control horario |
| `generar-liquidacion-sueldo`, `aprobar-liquidacion-sueldo`, `pagar-liquidacion-sueldo`, `anular-liquidacion-sueldo` | Liquidaciones | Nómina |
| `generar-liquidacion-final` | Liquidación final (despido) | Nómina |

### 4.5 Sistema y configuración

| Método | Qué hace | Por qué NO |
|---|---|---|
| `update-empresa` | Editar datos de empresa | Config |
| `update-pdv-config` | Configurar PdV | Config |
| `set-role-permissions`, `assignRoleToUsuario` | Gestión de permisos | Seguridad |
| `create-usuario`, `update-usuario`, `delete-usuario` | CRUD usuarios | Seguridad |
| `backup-create`, `backup-restore`, `backup-reset` | Backups y reset de BD | Destructivo |
| `set-app-mode` | Cambiar modo standalone/server/client | Config |

---

## 5. Permisos del rol GERENTE (seedeados)

El rol **GERENTE** tiene los siguientes permisos de **lectura** relevantes para auditorías:

### Dashboards y reportes

- `HOME_DASHBOARD_VER`
- `VENTAS_DASHBOARD_VER`
- `COMPRAS_DASHBOARD_VER`
- `PRODUCTOS_DASHBOARD_VER`
- `FINANCIERO_DASHBOARD_VER`
- `CAJA_MAYOR_DASHBOARD_VER`
- `RRHH_DASHBOARD_VER`

### Ventas y clientes

- `VENTAS_HISTORICO_VER` ✅ (clave para auditar ventas)
- `VENTAS_PDV` (operar PdV, incluye lectura)
- `CLIENTES_VER`

### Productos y recetas

- `PRODUCTOS_VER` ✅ (clave para auditar catálogo)
- `RECETAS_VER`
- `INGREDIENTES_VER`
- `ADICIONALES_VER`
- `SABORES_VER`
- `STOCK_MOVIMIENTO_VER`

### Financiero

- `FINANCIERO_CAJA_VER` ✅ (clave para auditar cajas)
- `CAJA_MAYOR_OPERAR` (incluye lectura)
- `BANCOS_VER`
- `CPC_GESTIONAR` ✅ (incluye lectura de CPC)

### RRHH

- `RRHH_FUNCIONARIO_VER` ✅ (clave para auditar RRHH)
- `RRHH_NOTIFICACIONES_VER`
- `RRHH_REPORTE_GENERAR` (exportar reportes)

### Compras

- `COMPRAS_VER`
- `PROVEEDORES_VER`

**⚠️ GERENTE también tiene permisos de ESCRITURA** (ej. `PRODUCTOS_GESTIONAR`, `VENTAS_PDV`, `FINANCIERO_CAJA_OPERAR`). El bot debe **evitar invocar métodos de mutación** aunque el usuario tenga el permiso.

---

## 6. Detección del caso de auditoría en handlers

### 6.1 Indicadores de uso para auditoría

Un handler puede inferir que la llamada es de auditoría (vs operativa) si:

1. **User-Agent:** El JWT podría incluir un claim `audit: true` o `device_id: 'audit-bot'` (requiere modificar el login).
2. **Patrón de llamadas:** El bot consulta rangos amplios (ej. todo el mes) o combina filtros poco usuales (ej. `canalOrigen + zonaDeliveryId`).
3. **Hora:** Llamadas fuera del horario operativo (ej. 3 AM) sugieren procesos batch.
4. **Read-only:** El bot nunca invoca métodos de mutación. Si un usuario con rol GERENTE llama solo `get-*` durante horas, es sospechoso de ser bot.

### 6.2 Logging de auditoría

Actualmente **no hay logging específico de auditoría**. Si se desea, agregar en `auth-middleware.ts` o `rpc-router.ts`:

```typescript
if (method.startsWith('get-') || method.startsWith('search-')) {
  console.log(`[AUDIT] ${user.nickname} -> ${method} at ${new Date().toISOString()}`);
}
```

---

## 7. Notas finales

### 7.1 Host de producción

**⚠️ El servidor de producción NO es Comercial alpha ni el sitio web D1.** Es una PC física del restaurante en LAN (típicamente puerto 7070), configurada en modo `server` con Postgres local y expuesta vía túnel Cloudflare o VPN.

### 7.2 Rate limiting

El servidor tiene rate limiting diferenciado (F1–F4, 2026-09):

- `/api/rpc` (staff): **600 req/min por `device_id`/`user`** (si autenticado) o IP (si anónimo)
- `/api/auth/*`: **30 req/min** (anti brute-force)

El bot debe:

1. **Incluir `deviceInfo` en el login** con un `device_id` único (ej. `'audit-bot-don-franco'`) para tener su propio bucket.
2. **Respetar backoff** ante HTTP 429: exponencial 15s → 30s → 60s → 120s.
3. **Batch de requests:** Priorizar handlers que devuelven múltiples registros (`get-ventas-by-date-range`) en lugar de loops de `get-venta`.

### 7.3 Handlers sin `ensurePermission`

**⚠️ Bug conocido:** `ventas.handler.ts` (el más grande, ~3300 LOC) **no tiene `ensurePermission`** en sus métodos principales (`createVenta`, `updateVenta`, `getVentas`, etc.) y **no está en `BLOCKED_CHANNELS`** del RPC router. Ver `reference/known-bugs.md`.

Implicación: `/api/rpc` es **default-allow**. Cualquier usuario autenticado puede invocar esos handlers, incluso sin el permiso adecuado. El frontend con `*appHasPermission` NO cuenta: la defensa real es el backend.

**Para el bot:** Esto significa que métodos como `get-ventas-by-date-range` son invocables sin `VENTAS_HISTORICO_VER` en este handler específico, pero **depender de esto es arriesgado** (puede corregirse en un futuro parche).

### 7.4 Jornada comercial

La "ventana de hoy" NO es 00:00–23:59 UTC. Es `PdvConfig.inicioJornadaHora` (default **7 AM**) → 06:59 del día siguiente. Un cierre de caja del turno noche (cruza medianoche) pertenece al día "anterior".

**Helper backend:** `getInicioJornada(dataSource)` devuelve la hora configurada (cacheada 60s). Usado en dashboards y reportes.

**Para el bot:** Si audita "ventas de hoy", debe ajustar el rango:

```javascript
const hoy = new Date();
const inicioJornada = 7; // leer de config o asumir 7
const desde = new Date(hoy);
desde.setHours(inicioJornada, 0, 0, 0);
const hasta = new Date(desde);
hasta.setDate(hasta.getDate() + 1);
hasta.setSeconds(hasta.getSeconds() - 1);
```

---

## 8. Checklist de implementación del bot

- [ ] Login con usuario `GERENTE` (o dedicado) → obtener JWT
- [ ] Implementar refresh de token cada ~6 días (o antes de expiración)
- [ ] Persistir refresh token en almacenamiento seguro (NO chat, NO logs)
- [ ] Incluir `Authorization: Bearer <token>` en todas las llamadas a `/api/rpc`
- [ ] Incluir `deviceInfo` con `device_id` único en el login
- [ ] Respetar rate limit: máximo 600 req/min, backoff ante 429
- [ ] Batch de requests: priorizar handlers agregados
- [ ] Ajustar rangos de fecha por jornada comercial (default 7 AM)
- [ ] Validar `usuario.mustChangePassword === false` tras login (bloquea si es `true`)
- [ ] **NUNCA invocar métodos de mutación** de la lista DENY (sección 4)
- [ ] Logs de auditoría: registrar qué consultas hace el bot y cuándo
- [ ] Manejo de errores: 401 → relogin, 403 → permisos insuficientes, 500 → reportar

---

**Fin del catálogo Fase 1.**  
**Próximos pasos:** Ver `PLAN-API-TOKEN-READONLY-GERENTE.md` para opciones de credenciales y deployment.
