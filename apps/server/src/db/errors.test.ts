import { describe, expect, it } from "vitest";
import { EmailTakenError, getPgError } from "./errors.js";

describe("db errors: getPgError and EmailTakenError", () => {
  it("unwraps a top-level pg error with code and constraint", () => {
    const rawPgErr = {
      code: "23505",
      constraint: "users_email_unique",
      message: "duplicate key value violates unique constraint",
      detail: "Key (email)=(test@example.com) already exists.",
    };
    const parsed = getPgError(rawPgErr);
    expect(parsed).toEqual({
      code: "23505",
      constraint: "users_email_unique",
      message: "duplicate key value violates unique constraint",
      detail: "Key (email)=(test@example.com) already exists.",
      table: undefined,
      schema: undefined,
    });
  });

  it("unwraps DrizzleQueryError with nested cause chain", () => {
    const nestedCause = {
      code: "23505",
      constraint: "users_email_unique",
      message: "duplicate key",
      detail: "already exists",
      table: "users",
      schema: "public",
    };
    const drizzleError = new Error("Failed query: INSERT INTO users...");
    (drizzleError as unknown as { cause: unknown }).cause = {
      name: "DrizzleQueryError",
      cause: nestedCause,
    };

    const parsed = getPgError(drizzleError);
    expect(parsed).toEqual({
      code: "23505",
      constraint: "users_email_unique",
      message: "duplicate key",
      detail: "already exists",
      table: "users",
      schema: "public",
    });
  });

  it("returns null for non-pg errors and primitive types", () => {
    expect(getPgError(null)).toBeNull();
    expect(getPgError(undefined)).toBeNull();
    expect(getPgError("some error string")).toBeNull();
    expect(getPgError(12345)).toBeNull();
    expect(getPgError(new Error("Generic error without cause"))).toBeNull();
    expect(getPgError({ someOtherProp: "no code here" })).toBeNull();
  });

  it("EmailTakenError is an Error with correct name and default message", () => {
    const err = new EmailTakenError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("EmailTakenError");
    expect(err.message).toBe("Email is already registered");

    const custom = new EmailTakenError("custom msg");
    expect(custom.message).toBe("custom msg");
  });
});
