import { describe, it, expect } from "vitest";
import { structurallyEqual } from "./equal";

describe("structurallyEqual", () => {
  it("compares primitives and identities correctly", () => {
    expect(structurallyEqual(1, 1)).toBe(true);
    expect(structurallyEqual(1, 2)).toBe(false);
    expect(structurallyEqual("hello", "hello")).toBe(true);
    expect(structurallyEqual("hello", "world")).toBe(false);
    expect(structurallyEqual(true, true)).toBe(true);
    expect(structurallyEqual(true, false)).toBe(false);
    expect(structurallyEqual(null, null)).toBe(true);
    expect(structurallyEqual(undefined, undefined)).toBe(true);
    expect(structurallyEqual(null, undefined)).toBe(false);
    expect(structurallyEqual(NaN, NaN)).toBe(true);
  });

  it("is independent of object key order", () => {
    const a = { x: 1, y: "two", z: true };
    const b = { z: true, x: 1, y: "two" };
    expect(structurallyEqual(a, b)).toBe(true);
  });

  it("treats missing key and undefined as equal", () => {
    const a = { x: 1 };
    const b = { x: 1, y: undefined };
    expect(structurallyEqual(a, b)).toBe(true);
    expect(structurallyEqual(b, a)).toBe(true);

    const c = { x: 1, y: null };
    expect(structurallyEqual(a, c)).toBe(false);
  });

  it("compares arrays by order and length", () => {
    expect(structurallyEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(structurallyEqual([1, 2, 3], [1, 3, 2])).toBe(false);
    expect(structurallyEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(structurallyEqual([1, 2, 3], [1, 2])).toBe(false);
  });

  it("distinguishes arrays from non-arrays and objects", () => {
    expect(structurallyEqual([], {})).toBe(false);
    expect(structurallyEqual({}, [])).toBe(false);
    expect(structurallyEqual([1], { 0: 1 })).toBe(false);
  });

  it("compares deep nested structures", () => {
    const a = {
      nodes: [{ id: "n1", position: { x: 10, y: 20 } }],
      name: "proj",
    };
    const b = {
      name: "proj",
      nodes: [{ position: { y: 20, x: 10 }, id: "n1" }],
    };
    expect(structurallyEqual(a, b)).toBe(true);

    const c = {
      name: "proj",
      nodes: [{ position: { y: 21, x: 10 }, id: "n1" }],
    };
    expect(structurallyEqual(a, c)).toBe(false);
  });
});
