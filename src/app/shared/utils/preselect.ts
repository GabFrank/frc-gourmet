/**
 * Helpers de pre-selección para selects/autocompletes en diálogos.
 *
 * Regla general: pre-seleccionar la opción "obvia" para ahorrar clics en flujos
 * de alto volumen (caja, pagos, compras). SOLO aplica a creación / estado vacío;
 * nunca debe sobrescribir un valor ya existente (modo edición).
 *
 * Prioridad estándar:
 *   1. Una sola opción disponible  -> esa.
 *   2. Opción marcada como principal/predeterminada/default -> esa.
 *   3. (opcional) Última usada por el usuario (localStorage), cuando hay varias.
 */

/**
 * Devuelve la opción a pre-seleccionar siguiendo la prioridad:
 *   única opción -> opción "principal" -> null.
 *
 * @param items lista de opciones ya filtradas (solo activas/válidas).
 * @param principalKeys claves booleanas a probar para detectar la principal.
 */
export function preselectSingleOrPrincipal<T extends Record<string, any>>(
  items: T[] | null | undefined,
  principalKeys: string[] = ['principal', 'predeterminada', 'predeterminado', 'default', 'esPrincipal'],
): T | null {
  const list = items || [];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  for (const key of principalKeys) {
    const found = list.find((it) => !!it?.[key]);
    if (found) return found;
  }
  return null;
}

/** Clave de localStorage para "última usada". */
function lastUsedKey(scope: string): string {
  return `lastSelected:${scope}`;
}

/**
 * Guarda la última opción usada para un scope dado.
 */
export function rememberSelection(scope: string, key: string | number | null | undefined): void {
  if (key == null) return;
  try {
    localStorage.setItem(lastUsedKey(scope), String(key));
  } catch {
    /* localStorage no disponible: ignorar */
  }
}

/**
 * Devuelve la opción "última usada" si todavía está presente en la lista.
 * Si no hay registro previo o ya no existe, cae a {@link preselectSingleOrPrincipal}.
 *
 * @param getKey extrae la clave comparable de cada item (normalmente el id).
 */
export function preselectLastUsedOrPrincipal<T extends Record<string, any>>(
  items: T[] | null | undefined,
  scope: string,
  getKey: (t: T) => string | number,
  principalKeys?: string[],
): T | null {
  const list = items || [];
  if (list.length === 0) return null;
  try {
    const stored = localStorage.getItem(lastUsedKey(scope));
    if (stored != null) {
      const found = list.find((it) => String(getKey(it)) === stored);
      if (found) return found;
    }
  } catch {
    /* ignorar */
  }
  return preselectSingleOrPrincipal(list, principalKeys);
}
