/**
 * Deep structural equality helper.
 * - Ignores object key order
 * - Treats missing object key and undefined value as equal
 * - Compares arrays by order and length
 * - Compares primitives via Object.is
 */
export function structurallyEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (a === null || typeof a !== "object" || b === null || typeof b !== "object") {
    return false;
  }

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (aIsArray !== bIsArray) return false;

  if (aIsArray && bIsArray) {
    const arrA = a as readonly unknown[];
    const arrB = b as readonly unknown[];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!structurallyEqual(arrA[i], arrB[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  const allKeys = new Set([...keysA, ...keysB]);

  for (const key of allKeys) {
    const valA = objA[key];
    const valB = objB[key];
    if (!structurallyEqual(valA, valB)) {
      return false;
    }
  }

  return true;
}
