/**
 * Generates the next sequential ID with a given prefix.
 * Returns `${prefix}_${n}` with the smallest integer n >= 1 that is not taken.
 */
export function nextId(existingIds: readonly string[], prefix: string): string {
  const pattern = new RegExp(`^${escapeRegex(prefix)}_(\\d+)$`);
  const taken = new Set<number>();

  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (match && match[1] !== undefined) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isSafeInteger(n) && n >= 1) {
        taken.add(n);
      }
    }
  }

  let candidate = 1;
  while (taken.has(candidate)) {
    candidate++;
  }

  return `${prefix}_${candidate}`;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
