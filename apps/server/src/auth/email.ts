import { z } from "zod";

export type ValidateEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: string };

const emailSchema = z.string().email();

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: unknown): ValidateEmailResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Email must be a string" };
  }

  const normalized = normalizeEmail(raw);

  if (normalized.length < 3 || normalized.length > 254) {
    return { ok: false, reason: "Email must be between 3 and 254 characters" };
  }

  // ASCII-only check: characters from 0x00 to 0x7F
  if (!/^[\x00-\x7F]*$/.test(normalized)) {
    return { ok: false, reason: "Email must contain only ASCII characters" };
  }

  const zodResult = emailSchema.safeParse(normalized);
  if (!zodResult.success) {
    return { ok: false, reason: "Invalid email address format" };
  }

  return { ok: true, email: normalized };
}
