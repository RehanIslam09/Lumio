export type ValidatePasswordResult =
  | { ok: true; password: string }
  | { ok: false; reason: string };

export function validatePassword(raw: unknown): ValidatePasswordResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Password must be a string" };
  }

  // Count Unicode code points (Array.from / spread counts code points, not UTF-16 units)
  const codePoints = Array.from(raw).length;

  if (codePoints < 10 || codePoints > 128) {
    return { ok: false, reason: "Password must be between 10 and 128 characters" };
  }

  return { ok: true, password: raw };
}
