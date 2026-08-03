/** Opaque unique id (UUID v4). */
export function newId(): string {
  return crypto.randomUUID();
}

/** ISO timestamp. */
export function isoNow(): string {
  return new Date().toISOString();
}
