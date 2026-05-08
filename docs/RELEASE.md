# Guía de Release — FRC Gourmet

Este documento define el proceso completo de release: ramas, commits, canales (alpha/beta/stable), CI/CD, code signing, auto-update y troubleshooting.

> **Esta guía es autoritativa.** Si algo del README o de skills contradice acá, esto manda.

## TL;DR

```
feat/foo --PR--> dev (alpha) --PR--> release/beta (beta) --PR--> main (stable)
hotfix/foo --PR--> main           --PR--> dev (back-merge obligatorio)
```

- **Conventional commits**: `feat:` (minor), `fix:` (patch), `feat!:` o `BREAKING CHANGE:` (major).
- **Merge commits, NO squash** en promociones entre ramas (semantic-release necesita los commits individuales).
- **CI** valida cada PR (lint + build + commitlint).
- **Push a `dev`/`release/beta`/`main`** dispara `release.yml` → semantic-release → matrix build → instaladores publicados al GitHub Release.
- Auto-update en cliente: electron-updater chequea el canal cada 30 min y notifica.

## Ramas

| Rama | Canal de release | Versión ejemplo | Quién mergea |
|---|---|---|---|
| `main` | **stable** | `1.4.0` | PR desde `release/beta` |
| `release/beta` | **beta** | `1.4.0-beta.3` | PR desde `dev` |
| `dev` | **alpha** | `1.4.0-alpha.7` | PRs desde `feat/*` `fix/*` `refactor/*` |
| `feat/*` `fix/*` etc. | — | — | autor del feature |

`main`, `release/beta`, `dev` deben estar protegidas: no push directo, PR obligatorio, CI verde.

## Convenciones de commit

| Prefijo | Bump | Aparece en CHANGELOG |
|---|---|---|
| `feat:` | minor | sí ("Features") |
| `fix:` | patch | sí ("Bug Fixes") |
| `perf:` | patch | sí ("Performance") |
| `refactor:` | patch | sí ("Refactor") |
| `build:` | patch | oculto |
| `docs:` | — | oculto |
| `chore:` | — | oculto |
| `test:` | — | oculto |
| `ci:` | — | oculto |
| `style:` | — | oculto |
| `feat!:` o footer `BREAKING CHANGE:` | **major** | sí (destacado) |

Ejemplos válidos:
```
feat(productos): agregar variaciones multi-sabor
fix(ventas): cobro multi-pago no calculaba vuelto en USD
refactor(financiero)!: renombrar Caja → Punto de Venta

BREAKING CHANGE: la entity Caja ahora se llama PuntoVenta
```

`commitlint` corre en cada PR. El hook local `husky/commit-msg` también valida antes del push.

## Canales de release

| Canal | Manifest electron-updater | Quién recibe el update |
|---|---|---|
| stable | `latest.yml` (default) | usuarios con canal "stable" en Configuración (default) |
| beta | `beta.yml` | usuarios opt-in desde la pantalla Sistema → Actualizaciones |
| alpha | `alpha.yml` | dev / QA, opt-in |

electron-builder publica al manifest correcto basado en el sufijo de la versión:
- `1.4.0` → `latest.yml`
- `1.4.0-beta.3` → `beta.yml`
- `1.4.0-alpha.7` → `alpha.yml`

## Flujo end-to-end

### 1. Trabajar un feature

```bash
git checkout dev && git pull
git checkout -b feat/mi-cambio
# editar...
git commit -m "feat(modulo): descripcion"
git push -u origin feat/mi-cambio
# Abrir PR a `dev`
```

CI corre `lint + build + commitlint`. Reviewer aprueba → **merge commit** a `dev`.

### 2. Release alpha automática

Push a `dev` dispara `release.yml`:

1. Job `release` corre `semantic-release`:
   - Analiza commits desde el último tag alpha
   - Calcula nueva versión (ej. `1.4.0-alpha.8`)
   - Escribe `package.json` + `CHANGELOG.md`
   - Commit `chore(release): 1.4.0-alpha.8 [skip ci]`
   - Crea tag `v1.4.0-alpha.8`
   - Crea GitHub Release (prerelease=true)
2. Job `build` matrix (win/mac/linux):
   - Pull del commit nuevo
   - Build Angular
   - `electron-builder --publish always` → sube `.exe` / `.dmg` / `.AppImage` + `alpha.yml` al GitHub Release

### 3. Promover alpha → beta

Cuando el conjunto de cambios en `dev` está listo para QA externa:

```bash
git checkout release/beta && git pull
git pull origin dev               # merge dev → release/beta
git push
```

> **Importante:** usar `git merge dev`, **NO** `git merge --squash`. semantic-release lee los commits individuales para calcular el bump correcto.

Push dispara `release.yml` → versión `1.4.0-beta.1`, instaladores publicados, manifest `beta.yml`.

### 4. Promover beta → stable

Después de validar en beta:

```bash
git checkout main && git pull
git merge release/beta            # merge commit, NO squash
git push
```

Genera `1.4.0` (sin sufijo), publica a `latest.yml`.

### 5. Hotfix

```bash
git checkout main && git pull
git checkout -b hotfix/bug-critico
# fix...
git commit -m "fix(modulo): descripcion"
git push -u origin hotfix/bug-critico
# PR a main
```

Después del merge a `main` (genera `1.4.1`), **back-merge obligatorio** a `dev`:

```bash
git checkout dev && git pull
git merge main
git push
```

(También a `release/beta` si está vivo.)

## Code signing

### Windows

1. Comprar certificado **Code Signing** (EV o OV) — recomendado EV de Sectigo/DigiCert (~$300/año).
2. Exportar a `.pfx` con password.
3. Subir como secrets en GitHub:
   ```
   CSC_LINK            = base64 del .pfx (`base64 -i cert.pfx | pbcopy`)
   CSC_KEY_PASSWORD    = password del .pfx
   ```
4. electron-builder firma automáticamente al detectar las env vars.

### macOS

1. Apple Developer Program ($99/año).
2. Crear "Developer ID Application" cert en Apple Developer portal.
3. Notarización con `notarytool`:
   ```
   APPLE_ID                       = email Apple ID
   APPLE_APP_SPECIFIC_PASSWORD    = generada en appleid.apple.com → Security → App-Specific Passwords
   APPLE_TEAM_ID                  = de https://developer.apple.com/account → Membership
   ```
4. En `package.json` cambiar `"notarize": false` → `"notarize": { "teamId": "${APPLE_TEAM_ID}" }`.

### Linux (AppImage)

No requiere firma. Opcionalmente firmar con GPG (no implementado).

## Auto-update en el cliente

`electron-updater` checks:
- Al arrancar (con 8s de delay).
- Cada 30 minutos en background.
- Cuando el usuario hace click "Buscar actualizaciones" en Sistema → Actualizaciones.

Cuando hay update disponible:
1. Se descarga en background.
2. Al terminar, diálogo "Cerrar y actualizar" / "Más tarde".
3. Si acepta: app se cierra, instala el update, relanza.
4. Si rechaza: instala automáticamente al próximo `app.quit()` (config `autoInstallOnAppQuit: true`).

Canal: por defecto `stable`. Cambiar desde Sistema → Actualizaciones (UI pendiente — IPC ya implementado en preload: `autoUpdateSetChannel('beta')`).

## Branch protection rules (configurar en GitHub)

```
main:
  - Require a pull request before merging: ✅
  - Require approvals: 1
  - Dismiss stale reviews: ✅
  - Require status checks:
      - lint-and-build (CI)
      - commitlint
  - Require branches to be up to date: ✅
  - Require conversation resolution: ✅
  - Restrict who can push: solo admins (enforce_admins=true en periodos críticos)

release/beta:
  - mismo que main pero approvals=1

dev:
  - Require PR ✅
  - Require status checks: lint-and-build
  - approvals=0 (o 1 según preferencia)
```

## Secrets requeridos en GitHub Actions

| Secret | Origen | Obligatorio |
|---|---|---|
| `GITHUB_TOKEN` | auto-provisto por Actions | sí |
| `CSC_LINK` | base64 del .pfx Windows | solo para builds firmadas Windows |
| `CSC_KEY_PASSWORD` | password .pfx | solo para builds firmadas Windows |
| `APPLE_ID` | email Apple Dev | solo para notarización mac |
| `APPLE_APP_SPECIFIC_PASSWORD` | generada en appleid | solo notarización mac |
| `APPLE_TEAM_ID` | Team ID Apple | solo notarización mac |

Sin certificados, los builds salen sin firma → SmartScreen / Gatekeeper bloquean al usuario hasta que confirme manualmente. Aceptable para alpha/beta interno; **no aceptable para stable**.

## Verificar versión deployada

```bash
gh release list --repo GabFrank/frc-gourmet
gh release view v1.4.0 --repo GabFrank/frc-gourmet
```

Manifest del canal:
- https://github.com/GabFrank/frc-gourmet/releases/latest/download/latest.yml
- https://github.com/GabFrank/frc-gourmet/releases/download/v1.4.0-beta.3/beta.yml

## Troubleshooting

### "semantic-release no detecta cambios"
- ¿Commits con prefijo válido? (`feat:`, `fix:`, etc.). `chore:`/`docs:` no liberan.
- ¿Estás en una rama configurada en `.releaserc.json` `branches`?
- Correr `npx semantic-release --dry-run` localmente para ver qué decidiría.

### "electron-builder dice 'No suitable application icons found'"
- Falta `build/icon.png` 512×512. Ver `build/README.md`.

### "Mac build se queda colgado en notarize"
- `notarize: false` en package.json. Cuando esté listo, flippear a `{teamId}`.

### "El cliente no recibe la update"
- Verificar que el manifest del canal exista: `https://github.com/GabFrank/frc-gourmet/releases/latest/download/<canal>.yml`
- Verificar canal seteado en cliente: `update-config.json` en userData
- Logs: en macOS `~/Library/Logs/frc-gourmet/main.log`

### "CI rompe en `npm ci` con peer-deps"
- Usamos `--legacy-peer-deps` en todos los workflows. Si agregás un nuevo workflow, no olvidarlo.

## Historial de versiones

Auto-generado en `CHANGELOG.md` por semantic-release. No editar a mano.
