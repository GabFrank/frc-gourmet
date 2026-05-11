#!/usr/bin/env bash
# F1.6 — verifica que cambios en entities tengan migration asociada en el mismo commit.
#
# Reglas:
# - Entity NUEVA (A) sin migration staged → FAIL (caso claro: nueva tabla, falta CREATE TABLE)
# - Entity MODIFICADA (M) con cambios schema-relevantes (@Column/@Entity/@Index/@OneToMany/...)
#   sin migration staged → WARN (no bloquea, dev decide)
# - Entity MODIFICADA solo en comentarios/formato → silencio
#
# Override: `SKIP_ENTITY_MIGRATION_CHECK=1 git commit ...` para saltar el check.

set -e

if [ "${SKIP_ENTITY_MIGRATION_CHECK:-}" = "1" ]; then
  exit 0
fi

# Staged entity files (.entity.ts, no .js)
STAGED_ENTITIES_NEW=$(git diff --cached --name-only --diff-filter=A | grep -E "^src/app/database/entities/.+\.entity\.ts$" || true)
STAGED_ENTITIES_MOD=$(git diff --cached --name-only --diff-filter=M | grep -E "^src/app/database/entities/.+\.entity\.ts$" || true)

# Staged migrations
STAGED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=AM | grep -E "^src/app/database/migrations/.+\.ts$" || true)

# Caso 1: entity nueva sin migration → FAIL
if [ -n "$STAGED_ENTITIES_NEW" ] && [ -z "$STAGED_MIGRATIONS" ]; then
  echo ""
  echo "❌ [check-entity-migration] Hay entities NUEVAS sin migration en el mismo commit:"
  echo "$STAGED_ENTITIES_NEW" | sed 's/^/    /'
  echo ""
  echo "   Una entity nueva exige migration. Generala con:"
  echo "     npm run migration:generate -- src/app/database/migrations/AddEntityXxx"
  echo "   y stagealá."
  echo ""
  echo "   Override (no recomendado): SKIP_ENTITY_MIGRATION_CHECK=1 git commit ..."
  exit 1
fi

# Caso 2: entities modificadas con cambios schema-relevantes sin migration → WARN
if [ -n "$STAGED_ENTITIES_MOD" ] && [ -z "$STAGED_MIGRATIONS" ]; then
  SCHEMA_PATTERNS='@Column|@Entity|@Index|@PrimaryColumn|@PrimaryGeneratedColumn|@OneToOne|@OneToMany|@ManyToOne|@ManyToMany|@JoinColumn|@JoinTable|@Unique|@Check'
  AFFECTED=""
  while IFS= read -r f; do
    if [ -z "$f" ]; then continue; fi
    if git diff --cached "$f" | grep -E "^[+-].*($SCHEMA_PATTERNS)" >/dev/null 2>&1; then
      AFFECTED="$AFFECTED\n    $f"
    fi
  done <<< "$STAGED_ENTITIES_MOD"

  if [ -n "$AFFECTED" ]; then
    echo ""
    echo "⚠️  [check-entity-migration] Entities con cambios schema-relevantes sin migration:"
    echo -e "$AFFECTED"
    echo ""
    echo "   Si el cambio afecta el schema (columnas, índices, FKs), generá migration:"
    echo "     npm run migration:generate -- src/app/database/migrations/AlterXxx"
    echo ""
    echo "   Si es solo cambio de tipos TS / metadata sin SQL, ignorá esta advertencia."
    echo ""
  fi
fi

exit 0
