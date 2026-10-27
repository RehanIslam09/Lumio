import { describe, it, expect } from "vitest";
import React from "react";
import { LandingPage } from "./LandingPage.js";

// Helper to recursively collect all text inside a React element tree
function collectText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!node || typeof node !== "object") {
    return "";
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join(" ");
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: unknown };
    return collectText(props.children);
  }
  return "";
}

// Helper to recursively find elements by tag or predicate
function findElements(
  node: unknown,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const matches: React.ReactElement[] = [];

  function walk(current: unknown) {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      for (const item of current) walk(item);
      return;
    }
    if (React.isValidElement(current)) {
      if (predicate(current)) {
        matches.push(current);
      }
      const props = current.props as { children?: unknown };
      walk(props.children);
    }
  }

  walk(node);
  return matches;
}

describe("LandingPage component (W-034)", () => {
  it("renders a single semantic h1 with the approved hero headline", () => {
    const vdom = LandingPage({});
    const h1Elements = findElements(vdom, (el) => el.type === "h1");

    expect(h1Elements).toHaveLength(1);
    const h1Text = collectText(h1Elements[0]);
    expect(h1Text).toContain("Architect complex game stories with mathematical consistency.");
  });

  it("provides main landmark with id='main-content' for accessible skip navigation", () => {
    const vdom = LandingPage({});
    expect(React.isValidElement(vdom)).toBe(true);
    if (!React.isValidElement(vdom)) throw new Error("Expected element");

    expect(vdom.type).toBe("main");
    const mainProps = vdom.props as { id?: string; className?: string };
    expect(mainProps.id).toBe("main-content");
    expect(mainProps.className).toContain("landing-page");
  });

  it("contains primary and secondary CTAs routing to /editor and /dashboard", () => {
    const vdom = LandingPage({});
    const links = findElements(vdom, (el) => {
      const props = el.props as { href?: string };
      return typeof props.href === "string";
    });

    const hrefs = links.map((l) => (l.props as { href: string }).href);

    // Hero and CTA actions should both include /editor and /dashboard
    expect(hrefs.filter((h) => h === "/editor").length).toBeGreaterThanOrEqual(2);
    expect(hrefs.filter((h) => h === "/dashboard").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the authentic product visual grounded in the prologue sample fixture", () => {
    const vdom = LandingPage({});
    const allText = collectText(vdom);

    // Fixture title and node titles
    expect(allText).toContain("Prologue: The Outlander Who Caught the Wind");
    expect(allText).toContain("Favonius Cathedral");
    expect(allText).toContain("Knights of Favonius HQ");
    expect(allText).toContain("Starsnatch Precipice");
    expect(allText).toContain("Song of Freedom (Triumph)");

    // Real rule IDs from the checker test suite
    expect(allText).toContain("cannot-reach-end");
    expect(allText).toContain("undefined-variable");
    expect(allText).toContain("variable-never-read");

    // Clearly labeled as fixture preview
    expect(allText).toContain("Fixture Preview");
    expect(allText).toContain("Verifiable Fixture Data");
  });

  it("renders all 5 core capabilities with distinct descriptions", () => {
    const vdom = LandingPage({});
    const h3Elements = findElements(vdom, (el) => el.type === "h3");
    const h3Titles = h3Elements.map(collectText);

    expect(h3Titles).toContain("Visual Branching Authoring");
    expect(h3Titles).toContain("Automated Consistency Checker");
    expect(h3Titles).toContain("Conditions and effects that can't silently break");
    expect(h3Titles).toContain("Play your story as a reader");
    expect(h3Titles).toContain("Test thousands of playthroughs in seconds");
  });

  it("renders truthful simulation limit derived from MAX_RUNS simulation configuration", async () => {
    const { MAX_RUNS } = await import("../../playtest/simulate.js");
    const vdom = LandingPage({});
    const allText = collectText(vdom);

    expect(allText).toContain(`Simulate up to ${MAX_RUNS.toLocaleString()} randomized playthroughs.`);
    expect(allText).not.toContain("10,000 randomized playthroughs");
  });

  it("renders the 4-step authoring workflow pipeline with approved writer-friendly steps", () => {
    const vdom = LandingPage({});
    const allText = collectText(vdom);

    expect(allText).toContain("From first idea to a story that works");
    expect(allText).toContain("01");
    expect(allText).toContain("Draft & structure");
    expect(allText).toContain("02");
    expect(allText).toContain("Add logic");
    expect(allText).toContain("03");
    expect(allText).toContain("Check as you write");
    expect(allText).toContain("04");
    expect(allText).toContain("Playtest and simulate");
  });

  it("renders semantic footer with technical stack and navigation links", () => {
    const vdom = LandingPage({});
    const footers = findElements(vdom, (el) => el.type === "footer");
    expect(footers).toHaveLength(1);

    const footerText = collectText(footers[0]);
    expect(footerText).toContain("TypeScript");
    expect(footerText).toContain("React Flow");
    expect(footerText).toContain("PostgreSQL");

    const footerLinks = findElements(footers[0], (el) => {
      const props = el.props as { href?: string };
      return typeof props.href === "string";
    });
    const footerHrefs = footerLinks.map((l) => (l.props as { href: string }).href);
    expect(footerHrefs).toContain("/editor");
    expect(footerHrefs).toContain("/dashboard");
    expect(footerHrefs).toContain("/login");
    expect(footerHrefs).toContain("/register");
  });
});
