import { describe, expect, it } from "vitest";
import { check } from "@repo/checker";
import { sampleProject, getSampleProjectWithSyntaxError } from "./sampleProject.js";

describe("sampleProject checker rules verification", () => {
  it("triggers all semantic rules when syntax error is false", () => {
    const issues = check(sampleProject);
    const ruleIds = new Set(issues.map((i) => i.ruleId));

    expect(ruleIds.has("unreachable-from-start")).toBe(true);
    expect(ruleIds.has("cannot-reach-end")).toBe(true);
    expect(ruleIds.has("undefined-variable")).toBe(true);
    expect(ruleIds.has("type-mismatch")).toBe(true);
    expect(ruleIds.has("unused-variable")).toBe(true);
    expect(ruleIds.has("variable-never-written")).toBe(true);
    expect(ruleIds.has("variable-never-read")).toBe(true);
  });

  it("triggers invalid-expression and suppresses usage rules when syntax error is true", () => {
    const projectWithSyntaxErr = getSampleProjectWithSyntaxError(true);
    const issues = check(projectWithSyntaxErr);
    const ruleIds = new Set(issues.map((i) => i.ruleId));

    expect(ruleIds.has("invalid-expression")).toBe(true);
    expect(ruleIds.has("unused-variable")).toBe(false);
    expect(ruleIds.has("variable-never-written")).toBe(false);
    expect(ruleIds.has("variable-never-read")).toBe(false);
  });
});
