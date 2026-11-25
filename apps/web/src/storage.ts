type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readPreference(name: string, storage?: PreferenceStorage): string | null {
  try {
    const target = storage ?? window.localStorage;
    const key = `poros-${name}`;
    const current = target.getItem(key);
    if (current !== null) return current;
    const legacyKey = `kleos-${name}`;
    const legacy = target.getItem(legacyKey);
    if (legacy !== null) {
      try {
        target.setItem(key, legacy);
        target.removeItem(legacyKey);
      } catch {
        // Still return the old preference if storage is read-only or full.
      }
    }
    return legacy;
  } catch {
    return null;
  }
}
