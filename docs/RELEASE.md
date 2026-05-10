# Guía de Release — FRC Gourmet

Este documento define el proceso completo de release: ramas, commits, canales (alpha/beta/stable), CI/CD, code signing, auto-update y troubleshooting.

> **Esta guía es autoritativa.** Si algo del README o de skills contradice acá, esto manda.

## TL;DR

```
feat/foo --PR--> develop (alpha) --PR--> release/beta (beta) --PR--> master (stable)
hotfix/foo --PR--> master           --PR--> develop (back-merge obligatorio)
```

- **Conventional commits**: `feat:` (minor), `fix:` (patch), `feat!:` o `BREAKING CHANGE:` (major).
- **Merge commits, NO squash** en promociones entre ramas (semantic-release necesita los commits individuales).
- **CI** valida cada PR (lint + build + commitlint).
- **Push a `develop`/`release/beta`/`master`** dispara `release.yml` → semantic-release → matrix build → instaladores publicados al GitHub Release.
- Auto-update en cliente: electron-updater chequea el canal cada 30 min y notifica.

## Ramas

| Rama | Canal de release | Versión ejemplo | Quién mergea |
|---|---|---|---|
| `master` | **stable** | `1.4.0` | PR desde `release/beta` |
| `release/beta` | **beta** | `1.4.0-beta.3` | PR desde `develop` |
| `develop` | **alpha** | `1.4.0-alpha.7` | PRs desde `feat/*` `fix/*` `refactor/*` |
| `feat/*` `fix/*` etc. | — | — | autor del feature |

`master`, `release/beta`, `develop` deben estar protegidas: no push directo, PR obligatorio, CI verde.

> **Nomenclatura alineada con `frc-comercial`** (los 4 repos del SaaS Franco Systems usan `master` + `release/beta` + `develop`). Mantener el mismo patron entre repos del ecosistema.

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
git checkout develop && git pull
git checkout -b feat/mi-cambio
# editar...
git commit -m "feat(modulo): descripcion"
git push -u origin feat/mi-cambio
# Abrir PR a `develop`
```

CI corre `lint + build + commitlint`. Reviewer aprueba → **merge commit** a `develop`.

### 2. Release alpha automática

Push a `develop` dispara `release.yml`:

1. Job `release` corre `semantic-release`:
   - Analiza commits desde el último tag alpha
   - Calcula nueva versión (ej. `1.4.0-alpha.8`)
   - Crea tag `v1.4.0-alpha.8`
   - Crea GitHub Release (prerelease=true) con notas auto-generadas

   > **No** pushea cambios a `develop`/`release/beta`/`master`. La rama queda intacta. `package.json` en la rama mantiene la version anterior (irrelevante — la version real vive en el tag y se patchea en el job build).

2. Job `build` matrix (win/linux):
   - Checkout del tag exacto (`v1.4.0-alpha.8`)
   - **Patch in-place de `package.json`** con la version del tag (sin commit)
   - Build Angular
   - `electron-builder --publish always` → sube `.exe` + `.AppImage` + `alpha.yml` al GitHub Release

### 3. Promover alpha → beta

Cuando el conjunto de cambios en `develop` está listo para QA externa:

```bash
git checkout release/beta && git pull
git pull origin develop           # merge develop → release/beta
git push
```

> **Importante:** usar `git merge develop`, **NO** `git merge --squash`. semantic-release lee los commits individuales para calcular el bump correcto.

Push dispara `release.yml` → versión `1.4.0-beta.1`, instaladores publicados, manifest `beta.yml`.

### 4. Promover beta → stable

Después de validar en beta:

```bash
git checkout master && git pull
git merge release/beta            # merge commit, NO squash
git push
```

Genera `1.4.0` (sin sufijo), publica a `latest.yml`.

### 5. Hotfix

```bash
git checkout master && git pull
git checkout -b hotfix/bug-critico
# fix...
git commit -m "fix(modulo): descripcion"
git push -u origin hotfix/bug-critico
# PR a master
```

Después del merge a `master` (genera `1.4.1`), **back-merge obligatorio** a `develop`:

```bash
git checkout develop && git pull
git merge master
git push
```

(También a `release/beta` si está vivo.)

## Code signing

### Plataformas soportadas

Solo se generan instaladores para **Windows** (NSIS `.exe`) y **Linux** (`.AppImage`). macOS está dropeado del pipeline (no se requieren releases para Mac). Si en el futuro hace falta, hay que reagregar `mac` block en `package.json` y `macos-latest` al matrix de `release.yml`.

### Windows — opciones (de menor a mayor esfuerzo)

#### A) Sin firma (default actual) ✅

`release.yml` corre `electron-builder` sin certs → `.exe` sin firma. Comportamiento al usuario:

1. Usuario descarga `FRC-Gourmet-Setup-X.Y.Z.exe`.
2. SmartScreen warning: "Windows protegió tu PC".
3. Usuario clickea **"Más información"** → **"Ejecutar de todos modos"**.
4. NSIS instala normal.

**Aceptable** para distribución interna o instalaciones controladas. El warning aparece **una vez por instalación**, no en cada uso. Cero costo, cero infra.

#### B) Self-signed cert (gratis, marginal mejora)

Genera un cert auto-firmado, lo importás como "Trusted Root CA" en cada PC cliente, y `electron-builder` lo usa para firmar. Útil solo si controlás todas las PCs target (ej. instalaciones en sucursales propias).

```powershell
# En Windows (PowerShell admin):
$cert = New-SelfSignedCertificate -DnsName "FRC Sistemas Informaticos" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My
Export-PfxCertificate -Cert $cert -FilePath frc-codesign.pfx -Password (ConvertTo-SecureString "tu-password" -AsPlainText -Force)
```

Luego `base64 frc-codesign.pfx > cert.b64` y subir como secret `CSC_LINK` + `CSC_KEY_PASSWORD`. `electron-builder` lo detecta y firma automáticamente.

**Limitación:** SmartScreen sigue avisando porque el cert no tiene reputación con Microsoft. Solo evita el warning si el cert está pre-instalado como trusted en el equipo cliente.

#### C) SignPath Foundation (gratis para OSS)

[signpath.io](https://signpath.io/foundation) firma binarios con un cert OV de SignPath gratis para proyectos open-source. Requiere:
- Repo público en GitHub.
- Aplicar al programa Foundation.
- Integración via su GitHub Action.

Da una firma reconocida y elimina SmartScreen tras un rato (reputation building). FRC Gourmet es repo público → elegible.

#### D) Azure Trusted Signing (~$10/mes)

Microsoft mismo provee firma cloud-based desde 2024. ~$9.99/mes. Reputación inmediata con SmartScreen. Requiere validación de identidad. Reemplaza el modelo viejo de comprar EV cert ($300/año).

### Linux (AppImage)

No requiere firma. AppImage corre directo si tiene permiso de ejecución (`chmod +x`).

### Recomendación actual

Empezar con **A) sin firma** y monitorear el feedback de usuarios. Si el SmartScreen se vuelve molesto en producción → evaluar **C)** SignPath Foundation primero (gratis), si no califica → **D)** Azure Trusted Signing. Saltarse self-signed (B), no aporta valor real.

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
master:
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
  - mismo que master pero approvals=1

develop:
  - Require PR ✅
  - Require status checks: lint-and-build
  - approvals=0 (o 1 según preferencia)
```

## Secrets requeridos en GitHub Actions

| Secret | Origen | Obligatorio |
|---|---|---|
| `GITHUB_TOKEN` | auto-provisto por Actions | sí |
| `CSC_LINK` | base64 del .pfx Windows (self-signed o SignPath/Azure cert) | opcional |
| `CSC_KEY_PASSWORD` | password del .pfx | opcional |

Sin certs Windows los builds salen sin firma → SmartScreen warning una vez por instalación. **Aceptable** para distribución actual. Evaluar firma cuando volumen lo justifique (ver "Code signing" arriba).

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

### "El cliente no recibe la update"
- Verificar que el manifest del canal exista: `https://github.com/GabFrank/frc-gourmet/releases/latest/download/<canal>.yml`
- Verificar canal seteado en cliente: `update-config.json` en userData
- Logs Windows: `%APPDATA%\frc-gourmet\logs\main.log`

### "CI rompe en `npm ci` con peer-deps"
- Usamos `--legacy-peer-deps` en todos los workflows. Si agregás un nuevo workflow, no olvidarlo.

## Historial de versiones

Auto-generado en `CHANGELOG.md` por semantic-release. No editar a mano.

---

## Code signing Windows (SignPath Foundation)

**Estado:** integracion lista en `release.yml`, pendiente aprobacion del programa OSS.

Sin firma, el `.exe` produce SmartScreen warning ("Windows protegio tu PC"). SignPath Foundation firma gratis a proyectos OSS en GitHub publico — perfecto para este repo. Una vez aprobados y con suficiente reputacion (~unas decenas de instalaciones), el warning desaparece.

### Pasos a hacer una vez (tu, no Claude)

1. **Aplicar al programa OSS** en https://signpath.org/products/foundation
   - Repo publico requerido (este repo lo es).
   - Esperar aprobacion (~1-2 semanas).
2. **Crear proyecto + signing policy** en SignPath una vez aprobado.
3. **Configurar 4 secrets en GitHub** (`Settings → Secrets and variables → Actions`):
   - `SIGNPATH_API_TOKEN` — token de API generado en SignPath
   - `SIGNPATH_ORG_ID` — ID de la organizacion
   - `SIGNPATH_PROJECT_SLUG` — slug del proyecto (ej. `frc-gourmet`)
   - `SIGNPATH_POLICY_SLUG` — slug de la signing policy (ej. `release`)

Una vez que esos 4 secrets esten configurados, el step `Detect SignPath availability` del workflow detecta `enabled=true` y bifurca el flujo:

```
Path A (sin SignPath):
  Build app → electron-builder --publish always

Path B (con SignPath, solo Windows):
  Build app → electron-builder --publish never (sin firmar)
            → upload-artifact "unsigned-exe"
            → SignPath/github-action-submit-signing-request@v1
            → scripts/regenerate-updater-manifest.js (recalcula sha512)
            → gh release upload (assets firmados)
```

Linux siempre va por Path A. Windows usa Path B solo cuando los secrets estan presentes; sino fallback a Path A unsigned.

### Por que el script regenera el manifest

`electron-builder` produce `latest.yml` con sha512 + size del `.exe`. Si firmamos el `.exe` despues, el hash cambia y `electron-updater` rechaza la update con "checksum mismatch". `scripts/regenerate-updater-manifest.js` recalcula el sha512 contra el binario firmado y reescribe el yml.

### Fallback si SignPath OSS no aprueba

Plan B documentado en `docs/plan-cliente-servidor.md` decision #5: **Azure Trusted Signing** (~$10/mes), integracion via Action equivalente. Reemplazar el step `Sign Windows installer with SignPath` por el de Azure; el resto del flujo se mantiene.

### Probar el path de SignPath localmente

No se puede — SignPath corre solo en cloud. Lo que SI se puede probar local:
- `npm run electron:build` para validar que el `.exe` se genera.
- `node scripts/regenerate-updater-manifest.js` con un `release/latest.yml` ya generado para verificar que el script no rompe el formato.
