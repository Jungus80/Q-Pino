/**
 * Locally-unique id generator (not cryptographically secure — these ids never leave the
 * device and are just SQLite primary keys, so `Math.random` is fine and avoids pulling in
 * a native crypto dependency just for this).
 */
export function newId(prefix?: string): string {
  const random = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  const id = `${Date.now().toString(36)}-${random}`;
  return prefix ? `${prefix}_${id}` : id;
}
