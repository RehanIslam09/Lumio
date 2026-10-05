export type NodeEnv = "development" | "test" | "production";

export interface Config {
  port: number;
  nodeEnv: NodeEnv;
  databaseUrl: string;
  corsOrigins: string[];
}

export type ConfigResult =
  | { ok: true; config: Config }
  | { ok: false; errors: string[] };

function isValidOrigin(origin: string): boolean {
  if (origin === "*") {
    return false;
  }
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return origin === url.origin;
  } catch {
    return false;
  }
}

export function parseConfig(
  env: Record<string, string | undefined> | undefined | null,
): ConfigResult {
  try {
    const errors: string[] = [];
    const raw = (env ?? {}) as Record<string, string | undefined>;

    // 1. PORT: optional, default 3001; must be integer 1..65535
    let port = 3001;
    if (raw.PORT !== undefined) {
      const rawPort = raw.PORT.trim();
      const parsedPort = Number(rawPort);
      if (rawPort === "" || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        errors.push("PORT must be an integer between 1 and 65535");
      } else {
        port = parsedPort;
      }
    }

    // 2. NODE_ENV: optional, default 'development'; must be 'development' | 'test' | 'production'
    let nodeEnv: NodeEnv = "development";
    if (raw.NODE_ENV !== undefined) {
      const rawNodeEnv = raw.NODE_ENV.trim();
      if (
        rawNodeEnv === "development" ||
        rawNodeEnv === "test" ||
        rawNodeEnv === "production"
      ) {
        nodeEnv = rawNodeEnv;
      } else {
        errors.push("NODE_ENV must be one of: development, test, production");
      }
    }

    // 3. DATABASE_URL: REQUIRED; must start with postgres:// or postgresql://
    // SECRECY: NEVER leak DB password in errors
    let databaseUrl = "";
    const rawDbUrl = raw.DATABASE_URL?.trim();
    if (!rawDbUrl) {
      errors.push("DATABASE_URL is required");
    } else if (
      !rawDbUrl.startsWith("postgres://") &&
      !rawDbUrl.startsWith("postgresql://")
    ) {
      errors.push(
        "DATABASE_URL must be a valid PostgreSQL connection string starting with postgres:// or postgresql://",
      );
    } else {
      try {
        new URL(rawDbUrl);
        databaseUrl = rawDbUrl;
      } catch {
        errors.push(
          "DATABASE_URL must be a valid PostgreSQL connection string starting with postgres:// or postgresql://",
        );
      }
    }

    // 4. CORS_ORIGINS: optional comma-separated list of valid origins (no "*")
    const corsOrigins: string[] = [];
    const rawCors = raw.CORS_ORIGINS?.trim();
    if (rawCors !== undefined && rawCors !== "") {
      const parts = rawCors
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      for (const origin of parts) {
        if (!isValidOrigin(origin)) {
          errors.push(
            `Invalid CORS origin: "${origin}". Each origin must be an http or https origin without path or trailing slash (e.g. http://localhost:5173). Wildcards are not allowed.`,
          );
        } else {
          corsOrigins.push(origin);
        }
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      config: {
        port,
        nodeEnv,
        databaseUrl,
        corsOrigins,
      },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      errors: [
        `Unexpected error parsing configuration: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}
