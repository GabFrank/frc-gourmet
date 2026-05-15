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

> **La app crea automáticamente el rol/usuario y la BD.** El operador solo instala Postgres y le da las credenciales del superusuario.

### B.1 — Pre-requisito: instalar Postgres en el servidor

- **Windows:** descargar el installer de EnterpriseDB desde `postgresql.org/download/windows` (Postgres 16, x86-64). Wizard normal:
  - Dejar todos los componentes (PostgreSQL Server, pgAdmin, Command Line Tools)
  - Anotar la **password del superusuario `postgres`** (la app la va a pedir, no se guarda)
  - Puerto `5432`, locale default
- **Linux:** `apt install postgresql` / `dnf install postgresql-server` / Docker.
- **macOS dev:** `brew install postgresql@16` o Postgres.app.

Verificar que esté escuchando:
```bash
# Linux/macOS
pg_isready -h localhost -p 5432

# Windows PowerShell
Get-Service postgresql*
```

NO hace falta crear nada en pgAdmin ni correr `CREATE DATABASE`. La app lo hace.

### B.2 — Configurar Postgres desde la app

1. Abrir la app — arranca en SQLite default (por `DEFAULT_APP_SETTINGS`).
2. Login con `admin/admin` (al ser primer arranque la P0-3 va a pedirte cambiar la password antes de entrar — ponele una nueva).
3. Ir a **Sistema → Configuración BD**.
4. Cambiar tipo a **Postgres** y completar:
   - **Host:** `localhost` (o IP del PC donde corre Postgres)
   - **Port:** `5432`
   - **Superuser:** `postgres` / password = la del installer (NO se guarda, solo se usa para crear)
   - **Target database:** `frc_gourmet` (la que la app va a crear)
   - **Target username:** `frc_user` (el rol que la app va a crear)
   - **Target password:** elegir una (se guarda en keytar)
   - **Schema:** vacío
   - **SSL:** según servidor (default off en LAN)
5. Botón **"Inicializar BD"** — el handler `db-config-init-postgres` se conecta como superuser y hace `CREATE ROLE` + `CREATE DATABASE` + `GRANT`. Idempotente: si ya existe, no falla.
6. Botón **"Probar conexión"** — corre `SELECT 1` con el target user → debe devolver "Conexion OK."
7. Botón **"Guardar"** — persiste config en `app-settings.json` y password del target en **keytar**. La password del superuser NO se guarda.
8. Botón **"Reiniciar app"** — `app.relaunch() + app.exit(0)`.

### B.3 — Primer arranque con Postgres

Al reiniciar:
1. `readAppSettings` ve `database.type === 'postgres'`.
2. `DatabaseService.initialize` arma `DataSourceOptions` con `type: 'postgres'`, lee password del target de keytar.
3. Conecta. La DB tiene 0 tablas (fue creada por `init-postgres` pero está vacía).
4. `getMigrations('postgres')` devuelve `BaselinePostgres` + incrementales.
5. `runMigrations` crea estructura completa (~150 tablas).
6. Handlers + seeds corren idénticos a SQLite — todo `dataSource.getRepository(...)` queda transparente.
7. Login `admin/admin` funciona porque el seed corrió. La P0-3 va a forzar cambio de password también acá.

### B.4 — Verificación

Desde pgAdmin o `psql -h localhost -U frc_user -d frc_gourmet`:
```sql
\dt                                     -- ~150 tablas
SELECT count(*) FROM permisos;          -- ~48
SELECT count(*) FROM monedas;           -- 3 (PYG, USD, BRL)
SELECT nickname FROM usuarios;          -- 'admin'
SELECT descripcion FROM roles;          -- ADMINISTRADOR, GERENTE, CAJERO, MOZO
SELECT count(*) FROM feriados;          -- 10 (año en curso)
```

### B.5 — Troubleshooting

**Error "postgres package has not been found"** al probar conexión → el bundle del `.exe` no incluye el driver `pg`. Solo afecta builds previos al fix de PR #24 / v1.1.1. Solución: actualizar la app (auto-update toma el latest stable). Detalle → [../conventions/pitfalls-typeorm-electron.md](../conventions/pitfalls-typeorm-electron.md).

**Error "password authentication failed for user postgres"** → la password del superusuario no es la que pusiste en el installer. En Windows, si te olvidaste: editar `pg_hba.conf` para poner `trust` temporalmente, reiniciar servicio, conectar sin password, hacer `ALTER USER postgres WITH PASSWORD 'nueva'`, volver `pg_hba.conf` a `scram-sha-256`.

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
- ❌ NO dejar `admin/admin` en producción. (P0-3 ya lo fuerza: dialog bloqueante al primer login).

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
