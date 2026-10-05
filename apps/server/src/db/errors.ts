export interface PgErrorDetails {
  code?: string;
  constraint?: string;
  message?: string;
  detail?: string;
  table?: string;
  schema?: string;
}

export class EmailTakenError extends Error {
  constructor(message = "Email is already registered") {
    super(message);
    this.name = "EmailTakenError";
  }
}

export function getPgError(err: unknown): PgErrorDetails | null {
  if (!err || typeof err !== "object") {
    return null;
  }
  let current: unknown = err;
  while (current && typeof current === "object") {
    if ("code" in current && typeof (current as Record<string, unknown>).code === "string") {
      const rec = current as Record<string, unknown>;
      return {
        code: typeof rec.code === "string" ? rec.code : undefined,
        constraint: typeof rec.constraint === "string" ? rec.constraint : undefined,
        message: typeof rec.message === "string" ? rec.message : undefined,
        detail: typeof rec.detail === "string" ? rec.detail : undefined,
        table: typeof rec.table === "string" ? rec.table : undefined,
        schema: typeof rec.schema === "string" ? rec.schema : undefined,
      };
    }
    if ("cause" in current && current.cause && typeof current.cause === "object") {
      current = current.cause;
    } else {
      break;
    }
  }
  return null;
}
