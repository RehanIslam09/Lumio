export type TestSafetyResult =
  | { ok: true }
  | { ok: false; reason: string };

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function normalizeHost(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1).toLowerCase();
  }
  return host.toLowerCase();
}

function parseUrlSafe(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function checkTestDatabaseUrl(testUrl: unknown, devUrl?: unknown): TestSafetyResult {
  if (typeof testUrl !== "string" || testUrl.trim().length === 0) {
    return { ok: false, reason: "TEST_DATABASE_URL is missing or empty." };
  }

  const testParsed = parseUrlSafe(testUrl);
  if (!testParsed) {
    return { ok: false, reason: "TEST_DATABASE_URL cannot be parsed as a valid URL." };
  }

  if (testParsed.protocol !== "postgres:" && testParsed.protocol !== "postgresql:") {
    return { ok: false, reason: "TEST_DATABASE_URL must use postgres: or postgresql: protocol." };
  }

  const testDbName = testParsed.pathname.replace(/^\//, "");
  if (!testDbName.endsWith("_test") || testDbName.length <= 5) {
    return { ok: false, reason: "TEST_DATABASE_URL database name must end with '_test'." };
  }

  const normalizedTestHost = normalizeHost(testParsed.hostname);
  if (!ALLOWED_HOSTS.has(normalizedTestHost) && !ALLOWED_HOSTS.has(testParsed.hostname.toLowerCase())) {
    return { ok: false, reason: "TEST_DATABASE_URL host must be localhost, 127.0.0.1, or ::1." };
  }

  if (typeof devUrl === "string" && devUrl.trim().length > 0) {
    const devParsed = parseUrlSafe(devUrl);
    if (devParsed && (devParsed.protocol === "postgres:" || devParsed.protocol === "postgresql:")) {
      const devDbName = devParsed.pathname.replace(/^\//, "");
      const normalizedDevHost = normalizeHost(devParsed.hostname);
      const testPort = testParsed.port || "5432";
      const devPort = devParsed.port || "5432";

      if (normalizedTestHost === normalizedDevHost && testPort === devPort && testDbName === devDbName) {
        return { ok: false, reason: "TEST_DATABASE_URL must not point to the same database as dev DATABASE_URL." };
      }
    }
  }

  return { ok: true };
}
