export const ACCESS_DENIED = "You do not have access.";

export function firstAffected<T>(
  rows: readonly T[] | null | undefined,
): T | null {
  if (!rows || rows.length === 0) {
    return null;
  }
  const row = rows[0];
  return row ?? null;
}
