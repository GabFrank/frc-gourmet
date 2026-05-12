# Setup en PC nueva

Cómo arrancar la app en una PC nueva — para los 2 backends (SQLite default y Postgres nativo).

## Caso A — SQLite (caso más simple)

1. Instalar la app empaquetada (DMG / installer) o clonar repo y `npm install`.
2. Abrir la app.
3. La app arranca con `app-settings.json` no existente → aplica `DEFAULT_APP_SETTINGS`:
   - `mode: 'standalone'`
   - `database: { type: 'sqlite', path: 'default' }` → `userData/frc-gourmet.db`
4. `DatabaseService.initialize`:
   - Crea el archivo `.db` (sqlite lo crea solo al primer write).
   - Corre `BaselineSqlite` + incrementales → estructura completa.
   - Vuelve `dataSource` listo.
5. `main.ts` registra los handlers IPC y dispara los seeds en orden (`seedInitialData` → `seedPermissions` → `seedConfiguracionRrhh` → `seedLiquidacionConceptos` → `seedSystemData`).
6. Login con `admin/admic` … perdón, `admin/admin`. Avisar al cliente que lo cambie en *Personas → Usuarios*.

Listo. No requiere acción extra del operador.

## Caso B — Postgres nativo

> **La app NO crea la base de datos en Postgres.** El operador debe hacer `CREATE DATABASE` antes.

### B.1 — Pre-requisitos en el servidor Postgres

```sql
-- Conectado como superuser (postgres):
CREATE USER frc_user WITH PASSWORD 'tu-password-seguro';
CREATE DATABASE frc_gourmet OWNER frc_user;
GRANT ALL PRIVILEGES ON DATABASE frc_gourmet TO frc_user;

-- Opcional: schema custom (si se quiere aislar dentro de una DB compartida)
\c frc_gourmet
CREATE SCHEMA frc AUTHORIZATION frc_user;
```

Verificar conectividad desde el PC donde correrá la app:

```bash
psql -h <host> -p 5432 -U frc_user -d frc_gourmet -c '\dt'
```

### B.2 — Configurar el driver en la app

1. Abrir la app — arranca en SQLite default (por `DEFAULT_APP_SETTINGS`).
2. Login con `admin/admin`.
3. Ir a **Sistema → Configuración BD** (el menú).
4. Cambiar tipo a `Postgres` y completar:
   - Host: `localhost` o IP del servidor
   - Port: `5432`
   - Database: `frc_gourmet`
   - Username: `frc_user`
   - Password: la que se eligió arriba
   - Schema: vacío (o `frc` si se creó schema custom)
   - SSL: según servidor
5. Botón **Probar conexión** — debe devolver "Conexion OK." (corre `SELECT 1`).
6. Botón **Guardar** — persiste en `app-settings.json` y password en **keytar**.
7. Botón **Reiniciar app** — `app.relaunch() + app.exit(0)`.

### B.3 — Primer arranque con Postgres

Al reiniciar:
1. `readAppSettings` ve `database.type === 'postgres'`.
2. `DatabaseService.initialize` arma `DataSourceOptions` con `type: 'postgres'`, lee password de keytar.
3. Conecta. La DB tiene 0 tablas.
4. `getMigrations('postgres')` devuelve `BaselinePostgres` + incrementales.
5. `runMigrations` crea estructura completa.
6. Handlers + seeds corren idénticos a SQLite — todo `dataSource.getRepository(...)` queda transparente.
7. Login `admin/admin` funciona porque el seed corrió.

### B.4 — Verificación

```sql
\c frc_gourmet
\dt                       -- ~150 tablas
SELECT count(*) FROM permisos;          -- ~48
SELECT count(*) FROM monedas;           -- 3
SELECT nickname FROM usuarios;          -- 'admin'
SELECT descripcion FROM roles;          -- ADMINISTRADOR, GERENTE, CAJERO, MOZO
SELECT count(*) FROM feriados;          -- 10 (año en curso)
```

## Caso C — Cliente/servidor (F4 mode)

Para LAN con 1 servidor + N clientes:

### C.1 — En el servidor
1. Setup como Caso A o B.
2. *Sistema → Modo de operación* → seleccionar **Server**.
3. Configurar puerto (default 7070).
4. Reiniciar. La app expone `/api/*` en LAN.

### C.2 — En cada cliente
1. Instalar la app.
2. *Sistema → Modo de operación* → seleccionar **Cliente**.
3. Configurar URL del server: `http://<ip-servidor>:7070`.
4. *Sistema → Modo de operación → Device picker* (wizard F5.4a) → elegir o crear el dispositivo asignado a este cliente.
5. Reiniciar. La app NO necesita DB local.
6. Login redirige al server vía HTTP.

## Anti-patrones

- ❌ NO usar `synchronize: true` en producción ni en setup nuevo. Las migrations son la fuente de verdad.
- ❌ NO copiar `frc-gourmet.db` de una PC a Postgres a mano. Si hay datos previos en SQLite, exportar/importar vía backup/restore (botón en *Sistema → Backup*).
- ❌ NO seedear datos del cliente al setup (bancos, POS reales, comisiones). Los carga el cliente desde la UI con sus datos.
- ❌ NO dejar `admin/admin` en producción. TODO: forzar cambio en primer login.

## Tras el seed automático, el cliente DEBE cargar manualmente

(Cosas que **no** se siembran porque son específicas de su negocio):

- **`CuentaBancaria`** — sus cuentas reales (banco, número, titular, alias)
- **`MaquinaPos`** — sus POS reales (proveedor, comisión real, `minutosAcreditacion` real)
- **`MonedaCambio`** — tasas USD/BRL del día (oficial + local)
- **`Familia` / `Subfamilia` reales** — el seed solo deja "GENERAL" como placeholder
- **`Producto`** + presentaciones + precios
- **`PdvConfig` + atajos** — armar las pantallas del PdV
- **`Cliente`** corporativos / frecuentes
- **`Funcionario`** + `HistoricoSalario` + asignación de turnos
- **Configurar permisos** de los roles plantilla si quiere ajustarlos
- **Cambiar password** del admin
