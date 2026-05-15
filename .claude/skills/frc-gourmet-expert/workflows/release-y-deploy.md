# Release y deploy

Cómo se publican versiones nuevas, cómo viaja un commit hasta el `.exe` instalado, y cómo deployar la app en un local real.

## Branches y canales

| Branch | Canal | Tipo | Uso |
|---|---|---|---|
| `master` | `stable` | release final | Versión que va al cliente. La branch local `main` está obsoleta (`origin/main` está `gone`). |
| `release/beta` | `beta` | prerelease | Pre-releases para QA controlada. |
| `develop` | `alpha` | prerelease | Trabajo en curso. Cada push genera `vX.Y.Z-alpha.N`. |

Otras branches (`feat/*`, `fix/*`, `chore/*`, `refactor/*`) no disparan release — solo el CI `lint+build`.

## Pipeline de release

### `.github/workflows/release.yml`

Se dispara en **push** a `master`, `release/beta`, `develop`. Dos jobs:

#### Job 1 — `release` (semantic-release)
- Analiza los commits desde el último tag con `conventional-commits` preset.
- Decide la versión (`feat:` → minor, `fix:`/`refactor:`/`perf:`/`build:` → patch, `BREAKING CHANGE` → major). `docs:`/`chore:`/`test:`/`ci:`/`style:` → sin release.
- Crea tag `vX.Y.Z` + GitHub Release (vacío al principio).
- Output: `new_release_version`, `new_release_git_tag`, `new_release_channel`, `new_release_published`.

Config en raíz del repo: `.releaserc` (JSON). Branches y reglas de release ahí.

#### Job 2 — `build` (matrix)
- Solo si `new_release_published == 'true'`.
- Matrix: `windows-latest` + `ubuntu-latest`.
- Checkout exacto al tag recién creado (evita race con el otro runner).
- `node -e "..."` parchea `package.json.version` in-place (semantic-release crea tag pero no pushea bump commit).
- `npm ci --legacy-peer-deps --omit=optional --no-audit --no-fund`
  - **⚠️ `--omit=optional`** es para evitar compilar `canvas` (transitivo de `pdfjs-dist`) — falla porque no hay headers nativos en el runner. La app usa `@napi-rs/canvas` (prebuilt) que monkey-patchea CanvasFactory.
  - Esto históricamente excluía `pg` cuando estaba en `optionalDependencies` → bug "postgres package has not been found". Fix: `pg` debe estar en `dependencies` (PR #24, v1.1.1).
- `npm run build:prod` (Angular + Electron TS).
- `npx electron-builder --publish always` → empaqueta:
  - **Windows:** NSIS installer `.exe` (`x64`, nombre `FRC-Gourmet-Setup-X.Y.Z.exe`)
  - **Linux:** AppImage `.AppImage` (`x64`)
  - **macOS:** no se buildea (target removido — ver branch `feat/drop-mac-target`)
- Sube los artifacts + manifests (`latest.yml`, `alpha.yml`, `beta.yml`) al GitHub Release.

### Firma de código (SignPath, opcional)

El workflow detecta `SIGNPATH_API_TOKEN` secret y bifurca:
- **Sin secret (default):** publica unsigned. Windows muestra SmartScreen warning al instalar ("Windows protegió tu PC" → "Más información" → "Ejecutar de todas formas"). Aceptable para deploy interno en LAN.
- **Con secret:** build sin publish → upload artifact → SignPath firma → regenera manifests con sha512 firmado → `gh release upload` final.

Hoy no hay secrets configurados (`gh secret list` vacío). Si se quiere firmar de verdad, configurar:
- `SIGNPATH_API_TOKEN`, `SIGNPATH_ORG_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_POLICY_SLUG`.

## CI (no es release)

`.github/workflows/ci.yml` — corre en **PRs** a `master`/`release/beta`/`develop` y en **push** a `feat/**`, `fix/**`, `refactor/**`, `chore/**`. Jobs:

- `Lint + Build` matrix ubuntu+windows (typecheck Electron + lint + `ng build production`).
- `Commitlint (PR)` — valida que los commits sigan conventional-commits.
- `Migration run (Postgres baseline + incrementales)` — levanta un Postgres 15 en services y corre `npm run migration:run` driver-aware. Verifica que la baseline + incrementales sean idempotentes y portables. **Crítico**: si una migration nueva no funciona en Postgres, falla acá.

## Branch protection

Tanto `develop` como `master` tienen branch protection con required status checks:
- `Lint + Build (ubuntu-latest)`
- `Lint + Build (windows-latest)`

**No requieren reviews** (`required_approving_review_count: 0`). Los PRs se mergean solos una vez que pasan los checks. Ver con `gh api repos/GabFrank/frc-gourmet/branches/<branch>/protection`.

## Auto-update (electron-updater)

`electron/utils/auto-updater.ts`. Configurado en `main.ts` al arranque.

- **`autoCheck: true`** por default → chequea 8s post-arranque + cada 30 min.
- **Canal:** `stable | beta | alpha`. Se persiste en `app-settings.json:update.channel`. Si no hay config, se **infiere de la versión instalada** (`v1.2.3-alpha.4` → alpha, `v1.2.3` → stable).
- Mapeo a manifests publicados:
  - `stable` → busca `latest.yml`
  - `beta` → `beta.yml`
  - `alpha` → `alpha.yml`
- `autoDownload: true`, `autoInstallOnAppQuit: true`.
- Cuando termina la descarga: dialog "Cerrar y actualizar" / "Más tarde" → `quitAndInstall()`.
- Eventos emitidos por IPC a `auto-update:status` (renderer puede mostrar progress).
- Handlers IPC: `auto-update:get-config`, `auto-update:set-channel`, `auto-update:check-now`, `auto-update:install-now`.

**Importante:** el updater es código JS puro de `electron-updater` — **no depende de drivers nativos** (`pg`, `sqlite3`). Funciona aunque la app no pueda conectar a la BD. Esto fue clave en el fix v1.1.0 → v1.1.1 (app v1.1.0 rota en Postgres se actualizó sola a v1.1.1).

Config legacy `update-config.json` se migra automáticamente a `app-settings.json:update` al primer arranque.

### ⚠️ Builds unsigned + `publisherName` — verificación de firma

`package.json:nsis.publisherName="FRC Sistemas Informaticos"` está seteado pero los `.exe` **no están firmados** (no hay SignPath ni CSC configurados). Por default `electron-updater` corre `Get-AuthenticodeSignature` (PowerShell) para verificar que el binario nuevo coincida con ese publisher, y rechaza el unsigned con error tipo *"publisher names do not match"* o *"no se puede ejecutar este script en el sistema actual"* (Execution Policy de PowerShell).

**Fix aplicado en `electron/utils/auto-updater.ts`:**
```typescript
// En electron-updater 6.x esto NO es boolean — es una FUNCION
//   (publisherNames: string[], path: string) => Promise<string | null>
// donde retornar `null` significa "OK, sin error".
autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null);
```

Asignarle `false` **NO desactiva nada** en v6.x (queda la función default). Histórico: v1.1.1 intentó con `= false` y siguió fallando, v1.3.0 cambió a la función-que-retorna-null y recién ahí v1.4.0 se auto-actualizó por primera vez sin intervención manual. Si en el futuro se configura SignPath, quitar esta línea para reactivar la verificación real.

### Historial de validación

| Versión | Hito |
|---|---|
| `v1.1.0` | Primer release stable. Detectado bug `pg` en bundle. |
| `v1.1.1` | Fix `pg`. Detectado bug auto-update por firma. Intento de fix con `= false`. |
| `v1.1.2` | Re-publicación del fix `pg`. El fix de auto-update seguía sin funcionar. |
| `v1.2.0` | Asignación de roles desde edit-usuario. Auto-update seguía rechazando. |
| `v1.3.0` | **Fix correcto de auto-update** (función en vez de boolean) + window controls custom en toolbar. Última reinstalación manual requerida. |
| `v1.4.0` | **Primer auto-update end-to-end validado en producción.** Header enriquecido (cotizaciones + reloj + version). |

## Flujo de deploy a un local real (LAN, Windows)

Asume **1 PC servidor + N PCs cliente** dentro del local.

### En el PC servidor (una vez)
1. **Instalar Postgres** (installer EnterpriseDB Windows). Anotar password del superusuario.
2. **IP fija en la LAN** (reserva DHCP en el router o IP estática en el adaptador). Crítico — si la IP cambia, los clientes pierden el server.
3. **Descargar e instalar** `FRC-Gourmet-Setup-X.Y.Z.exe` desde el GitHub Release latest. SmartScreen → "Más información" → "Ejecutar".
4. Login `admin/admin` → P0-3 fuerza cambio de password → entrar.
5. **Sistema → Configuración BD** → Postgres → completar superuser + target → "Inicializar BD" → "Guardar" → reiniciar. La app crea rol+BD+tablas+seeds.
6. **Sistema → Modo de operación** → "Server" → puerto 7070 → reiniciar. Expone `/api/*` en LAN.
7. **Firewall Windows:** abrir puerto 7070 entrante (Windows Defender Firewall → Reglas de entrada → Nueva regla → Puerto → TCP 7070).
8. **Auto-start al bootear** (opcional pero recomendado): copiar shortcut al `shell:startup` o crear tarea en Task Scheduler. Si se cierra la app, los clientes pierden el server.

### En cada cliente (por cada PC)
1. Instalar la misma versión del `.exe`.
2. **Sistema → Modo de operación** → "Cliente" → URL del server `http://<ip-servidor>:7070`.
3. **Device picker** (wizard F5.4a) → asignar el dispositivo (elegir existente o crear con nombre tipo "Caja 1", "Mozo Tablet 2").
4. Reiniciar. La app no tiene BD local; todo va por HTTP al servidor.
5. Login: usa los usuarios del servidor (vía `/api/auth/login` → JWT).

### Updates post-deploy
- Mergear a `develop` → genera alpha → si los clientes están en canal alpha, la reciben sola.
- Mergear `develop → master` → genera stable → si están en canal stable, la reciben sola.
- Cada cliente decide el canal desde **Sistema → Actualizaciones** (o donde esté el UI).

## Anti-patrones

- ❌ **NO mergear directo a master** sin pasar por develop. El flujo es `feat/* → develop → master`.
- ❌ **NO usar `git tag` manual.** semantic-release crea los tags solo.
- ❌ **NO bumpear `package.json:version` a mano.** semantic-release lo controla.
- ❌ **NO commitear con mensajes que no respeten conventional-commits.** El CI commitlint los rechaza.
- ❌ **NO agregar dependencias runtime a `optionalDependencies`.** Si la app las necesita en producción, van a `dependencies`. (Lección de v1.1.0 con `pg`).
- ❌ **NO confiar en que el bundle traiga `node_modules` completos.** Validar con un build empaquetado, no solo `npm start`.

## Comandos útiles

```bash
# Ver la versión publicada como Latest
gh release view --json tagName --jq '.tagName'

# Listar runs recientes del workflow Release
gh run list --workflow=release.yml --limit 5

# Estado actual de mergeable + checks de un PR
gh pr view 25 --json mergeStateStatus,statusCheckRollup --jq '{state: .mergeStateStatus, checks: [.statusCheckRollup[] | {name, conclusion}]}'

# Verificar branch protection
gh api repos/GabFrank/frc-gourmet/branches/master/protection --jq '.required_status_checks.contexts'
```

## Historial

- **v1.0.0** — nunca publicada como stable; el proyecto inició con alphas en develop.
- **v1.1.0-alpha.1 ... .10** (2026-04 → 2026-05-14) — alphas iterando F0–F5 cliente/servidor + dominios.
- **v1.1.0** (2026-05-15) — PRIMER release stable. Consolidación de PRs #11–#22.
- **v1.1.1** (2026-05-15, mismas horas) — hotfix `pg` driver faltante en bundle (PR #24).
