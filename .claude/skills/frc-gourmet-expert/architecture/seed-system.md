# Sistema de Seeds

Los seeds dejan la BD operable apenas se instala el sistema. Todos son **idempotentes** (`count > 0 → skip`, o lookup por clave única) y corren en cada arranque después de `runMigrations()`. Aplica igual a SQLite y Postgres.

## Orden de ejecución

En `main.ts` (dentro del `then` del `DataSource.initialize`, tras registrar handlers):

```
1. seedInitialData          (electron/utils/seed-data.ts)
2. seedPermissions          (electron/handlers/permissions.handler.ts)
3. seedConfiguracionRrhh    (electron/handlers/configuracion-rrhh.handler.ts)
4. seedLiquidacionConceptos (electron/handlers/liquidacion-sueldo.handler.ts)
5. seedSystemData           (electron/utils/seed-system.ts)
```

El orden importa: `seedSystemData` corre al final porque crea el rol ADMINISTRADOR y lo vincula a TODOS los permisos ya sembrados.

## Contenido de cada seed

### 1. `seedInitialData` — datos generales del negocio

`electron/utils/seed-data.ts`. Funciones:

| Función | Qué siembra | Notas |
|---|---|---|
| `seedMonedas` | GUARANI (principal, 0 dec), DOLAR (2 dec), REAL (2 dec) | Universal PY |
| `seedFormasPago` | EFECTIVO, TARJETA DEBITO/CREDITO, TRANSFERENCIA, PIX, CHEQUE | EFECTIVO es la `principal` |
| `seedGastoCategorias` | 10 padres + ~25 subcategorías (Servicios básicos, Mantenimiento, Operativo, Personal, Impuestos, Marketing, Alquiler, Transporte, Gastos financieros, Otros) | |
| `seedProveedores` | Solo `PROVEEDOR GENERAL` | Limpiado 2026-05-11 (antes incluía ANDE/ESSAP/TIGO) |
| `seedCompraCategorias` | 5 padres + subcategorías (Insumos, Bebidas, Descartables, Equipamiento, Limpieza, Otros) | |
| `linkFormasPagoBancarias` | Vincula tarjetas → todas las POS activas; transferencia/PIX → todas las cuentas activas | No-op si no hay POS ni cuentas creadas (cliente nuevo) |

**Quitados 2026-05-11** (eran datos placeholder peligrosos): `seedCuentasBancarias`, `seedMaquinasPos`, `seedMonedasCambio`. El cliente nuevo los crea desde la UI con sus datos reales.

### 2. `seedPermissions` — catálogo de permisos

`electron/handlers/permissions.handler.ts` — array `SEED_PERMISOS` con **94 permisos** cableados por código (`HOME_*`, `VENTAS_*`, `COMANDAS_KDS_*`, `RRHH_*`, `PERSONAS_*`, `USUARIOS_*`, `CLIENTES_*`, `COMISION_*`, `PRODUCTOS_*`, `COMPRAS_*`, `FINANCIERO_*`, `CAJA_MAYOR_*`, `CPC_*`, `EMPRESA_*`, `SISTEMA_*`, etc.). Idempotente por `codigo`.

Agregar un permiso nuevo = añadirlo al array `SEED_PERMISOS`. Al siguiente arranque se inserta y `syncAdminPermissions` se lo asigna al rol ADMINISTRADOR.

### 3. `seedConfiguracionRrhh` — parámetros legales PY

`electron/handlers/configuracion-rrhh.handler.ts:41`. 17 claves: IPS (9% / 16.5%), salario mínimo PYG (referencia 2026, actualizar c/año), días de vacaciones por antigüedad, indemnización (15 días/año, mín 90), recargos HE (50% diurna / 100% nocturna+feriado), tolerancia/penalización tardanza, día de cierre mensual.

Idempotente por `clave`.

### 4. `seedLiquidacionConceptos` — conceptos de liquidación

`electron/handlers/liquidacion-sueldo.handler.ts:43`. 10 conceptos auto-calculados: SALARIO_BASE, IPS_DESCUENTO, ADELANTO_DESCUENTO, VALE_DESCUENTO, HORA_EXTRA, PENALIZACION, BONO_MANUAL, AGUINALDO, COMISION, PRESTAMO_CUOTA.

Idempotente por `codigo`.

### 5. `seedSystemData` — admin + catálogos operativos

`electron/utils/seed-system.ts`. Funciones (en orden):

| Función | Qué siembra | Notas |
|---|---|---|
| `seedAdminUserAndRole` | Persona "ADMINISTRADOR SISTEMA" + Usuario `admin/admin` + Rol ADMINISTRADOR con TODOS los permisos | Solo si tabla `usuarios` vacía |
| `syncAdminPermissions` | Asegura que ADMINISTRADOR tenga TODOS los permisos seedeados (corre cada arranque, idempotente) | Clave cuando se agregan permisos nuevos |
| `seedRolesPlantilla` | Roles `GERENTE` (operativo full salvo sistema), `CAJERO` (dashboards + cobro CPC + asistencias), `MOZO` (mínimo) con permisos curados | Idempotente por `descripcion`; no toca roles ya existentes |
| `seedTipoCliente` | Solo `CONSUMIDOR FINAL` | Reducido 2026-05-11 (antes FRECUENTE 5% / CORPORATIVO 10% con descuentos hardcoded) |
| `seedTipoPrecio` | Solo `PRECIO NORMAL` | Reducido 2026-05-11 (antes DELIVERY + MAYORISTA) |
| `seedMonedasBilletes` | PYG (500-100k), USD (1-100), BRL (2-200) | Universal PY |
| `seedDispositivoDefault` | `TERMINAL PRINCIPAL` (isVenta + isCaja) | Necesario para que arranque |
| `seedSectorDefault` | Solo `SALON` | Reducido 2026-05-11 (antes + TERRAZA + BARRA) |
| `seedCargosBasicos` | ADMINISTRADOR, CAJERO, MOZO, COCINERO, AYUDANTE COCINA, DELIVERY, LIMPIEZA | |
| `seedMotivosVale` | ADELANTO SUELDO, PRESTAMO PERSONAL, EMERGENCIA, OTROS | |
| `seedFamiliaSubfamiliaDefault` | Familia + Subfamilia `GENERAL` | Bloqueante para crear primer producto |
| `seedTurnosDefault` | MAÑANA 06-14, TARDE 14-22, NOCHE 22-06 | Necesario para asistencias |
| `seedFeriadosNacionalesPY` | 10 feriados fijos del año en curso | Movibles (Semana Santa) los carga el usuario |
| `seedObservacionesBasicas` | PARA LLEVAR, SIN HIELO, BIEN COCIDO, etc. | 11 observaciones típicas |

## Idempotencia

- **Por count:** la mayoría de seeds chequea `count() === 0` y skip si hay algo. Si el cliente borra TODOS los registros intencionalmente, el próximo arranque re-siembra.
- **Por key única:** `seedPermissions`, `seedConfiguracionRrhh`, `seedLiquidacionConceptos`, `seedRolesPlantilla` chequean por código/clave. Esto permite añadir nuevos items al array y que se inserten incrementalmente sin tocar los existentes.

## Cómo agregar un seed nuevo

1. Crear la función `seedXxx(dataSource)` en el archivo que corresponda (general → `seed-data.ts`; sistema/admin → `seed-system.ts`; dominio específico → handler del dominio).
2. Patrón:
   ```typescript
   async function seedXxx(dataSource: DataSource) {
     const repo = dataSource.getRepository(Xxx);
     const count = await repo.count();
     if (count > 0) { console.log(`  Xxx: ${count} ya existen, skipping.`); return; }
     // insertar
   }
   ```
3. Llamarla desde el `try` de la función exportada (orden importa si depende de otro seed).
4. Build (`npm run build`) y reinicio de la app.

## Anti-patrones (NO hacer)

- ❌ Seedear datos específicos de un cliente (cuentas bancarias, comisiones POS, tasas de cambio). El cliente los crea desde la UI.
- ❌ Seedear con valores de testing (ej. `minutosAcreditacion: 2` en MaquinaPos). Si necesitás test data, usar `scripts/test-server-standalone.ts` o un seed aparte de dev.
- ❌ Forzar updates sobre datos existentes (ej. pisar config si ya existe). Idempotente = nunca pisar lo que el usuario ya tocó.

## Memoria relacionada

- Setup nuevo cliente → [../workflows/setup-pc-nueva.md](../workflows/setup-pc-nueva.md)
- TODO: forzar cambio de password admin en primer login (requiere columna `requiereCambioPassword` en Usuario).
