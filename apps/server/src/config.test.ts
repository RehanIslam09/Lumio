import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseConfig } from "./config.js";

describe("parseConfig", () => {
  it("parses valid config with all options provided", () => {
    const env = {
      PORT: "4000",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://lumio:secret@localhost:5432/lumio",
      CORS_ORIGINS: "http://localhost:5173,https://lumio.app",
    };

    const result = parseConfig(env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config).toEqual({
      port: 4000,
      nodeEnv: "production",
      databaseUrl: "postgresql://lumio:secret@localhost:5432/lumio",
      corsOrigins: ["http://localhost:5173", "https://lumio.app"],
      sessionTtlDays: 30,
    });
  });

  it("applies defaults for PORT, NODE_ENV, and CORS_ORIGINS", () => {
    const env = {
      DATABASE_URL: "postgres://localhost:5432/lumio",
    };

    const result = parseConfig(env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config).toEqual({
      port: 3001,
      nodeEnv: "development",
      databaseUrl: "postgres://localhost:5432/lumio",
      corsOrigins: [],
      sessionTtlDays: 30,
    });
  });

  it("parses valid SESSION_TTL_DAYS and defaults to 30", () => {
    const resDefault = parseConfig({ DATABASE_URL: "postgres://localhost/db" });
    expect(resDefault.ok).toBe(true);
    if (resDefault.ok) {
      expect(resDefault.config.sessionTtlDays).toBe(30);
    }

    const resCustom = parseConfig({
      DATABASE_URL: "postgres://localhost/db",
      SESSION_TTL_DAYS: "14",
    });
    expect(resCustom.ok).toBe(true);
    if (resCustom.ok) {
      expect(resCustom.config.sessionTtlDays).toBe(14);
    }

    const resMin = parseConfig({
      DATABASE_URL: "postgres://localhost/db",
      SESSION_TTL_DAYS: "1",
    });
    expect(resMin.ok).toBe(true);
    if (resMin.ok) {
      expect(resMin.config.sessionTtlDays).toBe(1);
    }

    const resMax = parseConfig({
      DATABASE_URL: "postgres://localhost/db",
      SESSION_TTL_DAYS: "90",
    });
    expect(resMax.ok).toBe(true);
    if (resMax.ok) {
      expect(resMax.config.sessionTtlDays).toBe(90);
    }
  });

  it("rejects invalid SESSION_TTL_DAYS values", () => {
    const invalid = ["0", "91", "-5", "30.5", "abc", "", "   "];
    for (const val of invalid) {
      const res = parseConfig({
        DATABASE_URL: "postgres://localhost/db",
        SESSION_TTL_DAYS: val,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.includes("SESSION_TTL_DAYS"))).toBe(true);
      }
    }
  });

  it("rejects invalid PORT values", () => {
    const cases = ["0", "-1", "65536", "99999", "abc", "3001.5", ""];
    for (const port of cases) {
      const result = parseConfig({
        PORT: port,
        DATABASE_URL: "postgresql://localhost:5432/lumio",
      });
      expect(result.ok, `Expected port ${port} to be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.toLowerCase().includes("port"))).toBe(true);
      }
    }
  });

  it("rejects invalid NODE_ENV values", () => {
    const cases = ["staging", "dev", "prod", "invalid"];
    for (const nodeEnv of cases) {
      const result = parseConfig({
        NODE_ENV: nodeEnv,
        DATABASE_URL: "postgresql://localhost:5432/lumio",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.toLowerCase().includes("node_env"))).toBe(true);
      }
    }
  });

  it("requires DATABASE_URL and rejects missing or empty values", () => {
    const emptyCases = [{}, { DATABASE_URL: "" }, { DATABASE_URL: "   " }];
    for (const env of emptyCases) {
      const result = parseConfig(env);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.toLowerCase().includes("database_url"))).toBe(true);
      }
    }
  });

  it("rejects non-postgres DATABASE_URL schemes", () => {
    const nonPostgres = [
      "mysql://lumio:secret@localhost:3306/lumio",
      "http://localhost:5432",
      "sqlite://lumio.db",
      "not-a-url",
    ];
    for (const url of nonPostgres) {
      const result = parseConfig({ DATABASE_URL: url });
      expect(result.ok).toBe(false);
    }
  });

  it("never leaks database password in errors (SECRECY)", () => {
    const password = "super_secret_db_password_xyz987!";
    const testCases = [
      `mysql://lumio:${password}@localhost:3306/lumio`,
      `postgresql://lumio:${password}@not-a-valid-host:invalid-port/db`,
      `http://lumio:${password}@localhost/db`,
    ];

    for (const url of testCases) {
      const result = parseConfig({ DATABASE_URL: url });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const errorText = result.errors.join(" ");
        expect(errorText).not.toContain(password);
      }
    }
  });

  it("parses and trims CORS_ORIGINS correctly", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost:5432/lumio",
      CORS_ORIGINS: " http://localhost:5173 , https://lumio.app  ",
    };
    const result = parseConfig(env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.corsOrigins).toEqual(["http://localhost:5173", "https://lumio.app"]);
  });

  it("rejects invalid CORS_ORIGINS including wildcard and paths", () => {
    const invalidOrigins = [
      "*",
      "http://localhost:5173/",
      "http://localhost:5173/api",
      "not-an-origin",
      "ftp://localhost",
    ];

    for (const origin of invalidOrigins) {
      const result = parseConfig({
        DATABASE_URL: "postgresql://localhost:5432/lumio",
        CORS_ORIGINS: origin,
      });
      expect(result.ok, `Origin "${origin}" should be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.toLowerCase().includes("cors"))).toBe(true);
      }
    }
  });

  it("never throws for arbitrary string dictionary inputs (fuzz/property)", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.option(fc.string(), { nil: undefined })),
        (env) => {
          const result = parseConfig(env);
          expect(typeof result.ok).toBe("boolean");
          if (result.ok) {
            expect(typeof result.config.port).toBe("number");
            expect(["development", "test", "production"]).toContain(result.config.nodeEnv);
            expect(typeof result.config.databaseUrl).toBe("string");
            expect(Array.isArray(result.config.corsOrigins)).toBe(true);
          } else {
            expect(Array.isArray(result.errors)).toBe(true);
            expect(result.errors.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
