import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { checkTestDatabaseUrl } from "./testSafety.js";

describe("checkTestDatabaseUrl", () => {
  const validDev = "postgresql://lumio:devpass@localhost:5432/lumio";
  const validTest = "postgresql://lumio:testpass@localhost:5432/lumio_test";

  it("accepts a valid test URL pointing to a _test DB on localhost", () => {
    const result = checkTestDatabaseUrl(validTest, validDev);
    expect(result).toEqual({ ok: true });
  });

  it("accepts postgres:// protocol and 127.0.0.1 or ::1 host", () => {
    expect(checkTestDatabaseUrl("postgres://user@127.0.0.1:5432/my_test", validDev)).toEqual({ ok: true });
    expect(checkTestDatabaseUrl("postgresql://user@[::1]:5432/my_test", validDev)).toEqual({ ok: true });
  });

  it("refuses when testUrl is missing or empty", () => {
    const res1 = checkTestDatabaseUrl("", validDev);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.reason).toMatch(/missing|empty/i);
    }

    const res2 = checkTestDatabaseUrl(undefined as unknown as string, validDev);
    expect(res2.ok).toBe(false);
  });

  it("refuses non-postgres protocols", () => {
    const res = checkTestDatabaseUrl("mysql://user:pass@localhost:3306/db_test", validDev);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/protocol|scheme/i);
    }
  });

  it("refuses unparseable URLs", () => {
    const res = checkTestDatabaseUrl("not-a-url", validDev);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/parse/i);
    }
  });

  it("refuses database names that do not end with _test", () => {
    const res = checkTestDatabaseUrl("postgresql://user@localhost:5432/lumio_prod", validDev);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/_test/i);
    }
  });

  it("refuses hosts that are not localhost, 127.0.0.1 or ::1", () => {
    const res = checkTestDatabaseUrl("postgresql://user@remote-db.com:5432/lumio_test", validDev);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/host/i);
    }
  });

  it("refuses when testUrl points to the same database as devUrl", () => {
    const res = checkTestDatabaseUrl("postgresql://user@localhost:5432/lumio_test", "postgresql://user@localhost:5432/lumio_test");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/same database/i);
    }
  });

  it("refuses password-bearing URL and never includes password in reason", () => {
    const password = "s3cretPassword123";
    const res = checkTestDatabaseUrl(`postgresql://user:${password}@remote-host.com:5432/lumio_test`, validDev);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).not.toContain(password);
      expect(res.reason).not.toContain("remote-host.com:5432");
    }
  });

  it("property: arbitrary strings never throw and refusal reason never contains userinfo", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (arbitraryTest, arbitraryDev) => {
          const res = checkTestDatabaseUrl(arbitraryTest, arbitraryDev);
          expect(typeof res.ok).toBe("boolean");
          if (!res.ok) {
            expect(typeof res.reason).toBe("string");
            expect(res.reason.length).toBeGreaterThan(0);
            if (arbitraryTest.length > 0) {
              expect(res.reason).not.toBe(arbitraryTest);
            }
          }
        }
      ),
      { numRuns: 100 }
    );

    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (user, pass) => {
          const urlWithCreds = `postgresql://${user}:${pass}@remote-host.com:5432/db_test`;
          const res = checkTestDatabaseUrl(urlWithCreds);
          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(res.reason).not.toContain(user);
            expect(res.reason).not.toContain(pass);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
