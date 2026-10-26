import { describe, it, expect } from "vitest";
import React from "react";
import { isSafeUrl, parseInline, renderMarkdown } from "./markdown.js";

type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode; className?: string }>;

// Helper to extract text content from ReactNode structure
function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return "";
}

describe("Markdown Renderer & Security", () => {
  describe("isSafeUrl", () => {
    it("accepts valid https, http, and mailto links", () => {
      expect(isSafeUrl("https://example.com")).toBe(true);
      expect(isSafeUrl("http://example.com/story?act=1&scene=2")).toBe(true);
      expect(isSafeUrl("mailto:writer@lumio.studio")).toBe(true);
    });

    it("rejects javascript: and variants with case, whitespace, or control characters", () => {
      expect(isSafeUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeUrl("JAVASCRIPT:alert(1)")).toBe(false);
      expect(isSafeUrl("java\tscript:alert(1)")).toBe(false);
      expect(isSafeUrl("java\nscript:alert(1)")).toBe(false);
      expect(isSafeUrl("  javascript:alert(1)  ")).toBe(false);
      expect(isSafeUrl("javascript\u0000:alert(1)")).toBe(false);
    });

    it("rejects data: and vbscript: URLs", () => {
      expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
      expect(isSafeUrl("blob:https://example.com/uuid")).toBe(false);
      expect(isSafeUrl("file:///C:/Windows/System32")).toBe(false);
    });

    it("rejects malformed or empty URLs", () => {
      expect(isSafeUrl("")).toBe(false);
      expect(isSafeUrl("   ")).toBe(false);
      expect(isSafeUrl("not-a-valid-url")).toBe(false);
      expect(isSafeUrl("mailto:")).toBe(false);
      expect(isSafeUrl("mailto:foo:bar")).toBe(false);
    });
  });

  describe("Inline formatting", () => {
    it("parses bold, italic, strikethrough, and inline code", () => {
      const result = parseInline("Text with **bold**, *italic*, ~~deleted~~, and `code`.");
      expect(result.length).toBeGreaterThan(0);

      const boldNode = result.find(
        (n) => React.isValidElement(n) && (n as React.ReactElement<{ className?: string }>).props.className === "markdown-bold",
      ) as React.ReactElement<{ children: React.ReactNode }>;
      expect(boldNode).toBeDefined();
      expect(extractText(boldNode)).toBe("bold");

      const italicNode = result.find(
        (n) => React.isValidElement(n) && (n as React.ReactElement<{ className?: string }>).props.className === "markdown-italic",
      );
      expect(italicNode).toBeDefined();
      expect(extractText(italicNode)).toBe("italic");

      const strikeNode = result.find(
        (n) => React.isValidElement(n) && (n as React.ReactElement<{ className?: string }>).props.className === "markdown-del",
      );
      expect(strikeNode).toBeDefined();
      expect(extractText(strikeNode)).toBe("deleted");

      const codeNode = result.find(
        (n) => React.isValidElement(n) && (n as React.ReactElement<{ className?: string }>).props.className === "markdown-inline-code",
      );
      expect(codeNode).toBeDefined();
      expect(extractText(codeNode)).toBe("code");
    });

    it("renders safe links as <a> with rel='noopener noreferrer' and target='_blank'", () => {
      const result = parseInline("Visit [Lumio](https://lumio.studio) for docs.");
      const link = result.find(
        (n) => React.isValidElement(n) && n.type === "a",
      ) as React.ReactElement<{ href?: string; rel?: string; target?: string; children?: React.ReactNode }>;

      expect(link).toBeDefined();
      expect(link.props.href).toBe("https://lumio.studio");
      expect(link.props.target).toBe("_blank");
      expect(link.props.rel).toBe("noopener noreferrer");
      expect(extractText(link)).toBe("Lumio");
    });

    it("renders dangerous links as inert text instead of <a>", () => {
      const result = parseInline("Click [here](javascript:alert(1)) now.");
      const link = result.find((n) => React.isValidElement(n) && n.type === "a");
      expect(link).toBeUndefined();

      const inert = result.find(
        (n) => React.isValidElement(n) && (n as React.ReactElement<{ className?: string }>).props.className === "markdown-inert-link",
      );
      expect(inert).toBeDefined();
      expect(extractText(inert)).toBe("[here](javascript:alert(1))");
    });

    it("handles Unicode, non-Latin text, and emojis safely", () => {
      const text = "**勇気**と*希望* — ⚔️ `quest_01`";
      const result = parseInline(text);
      expect(extractText(result)).toBe("勇気と希望 — ⚔️ quest_01");
    });
  });

  describe("Block structures", () => {
    it("renders headings H1 through H6 with correct semantic tags", () => {
      const input = [
        "# Heading 1",
        "## Heading 2",
        "### Heading 3",
        "#### Heading 4",
        "##### Heading 5",
        "###### Heading 6",
      ].join("\n\n");

      const rendered = renderMarkdown(input) as ElementWithChildren;
      expect(React.isValidElement(rendered)).toBe(true);

      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];
      expect(children).toHaveLength(6);
      expect(children[0]?.type).toBe("h1");
      expect(children[1]?.type).toBe("h2");
      expect(children[2]?.type).toBe("h3");
      expect(children[3]?.type).toBe("h4");
      expect(children[4]?.type).toBe("h5");
      expect(children[5]?.type).toBe("h6");
      expect(extractText(children[0])).toBe("Heading 1");
      expect(extractText(children[5])).toBe("Heading 6");
    });

    it("renders fenced code blocks verbatim without parsing interior markup", () => {
      const input = "```\nfunction test() {\n  return **not-bold**;\n}\n```";
      const rendered = renderMarkdown(input) as ElementWithChildren;
      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];

      expect(children[0]?.type).toBe("pre");
      expect(extractText(children[0])).toContain("return **not-bold**;");
    });

    it("renders blockquotes with soft line breaks", () => {
      const input = "> First line of quote\n> Second line of quote";
      const rendered = renderMarkdown(input) as ElementWithChildren;
      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];

      expect(children[0]?.type).toBe("blockquote");
      expect(extractText(children[0])).toContain("First line of quote");
      expect(extractText(children[0])).toContain("Second line of quote");
    });

    it("renders unordered and ordered lists", () => {
      const input = "- Item Alpha\n- Item Beta\n\n1. Step One\n2. Step Two";
      const rendered = renderMarkdown(input) as ElementWithChildren;
      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];

      expect(children[0]?.type).toBe("ul");
      expect(children[1]?.type).toBe("ol");

      const ulChildren = React.Children.toArray(children[0]?.props.children) as ElementWithChildren[];
      expect(ulChildren).toHaveLength(2);
      expect(extractText(ulChildren[0])).toBe("Item Alpha");

      const olChildren = React.Children.toArray(children[1]?.props.children) as ElementWithChildren[];
      expect(olChildren).toHaveLength(2);
      expect(extractText(olChildren[0])).toBe("Step One");
    });

    it("preserves soft line breaks with <br /> within paragraphs", () => {
      const input = "Speaker: Hello there.\nListener: General Kenobi.";
      const rendered = renderMarkdown(input) as ElementWithChildren;
      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];

      expect(children[0]?.type).toBe("p");
      const pKids = React.Children.toArray(children[0]?.props.children);
      const hasBr = pKids.some((k) => React.isValidElement(k) && k.type === "br");
      expect(hasBr).toBe(true);
      expect(extractText(children[0])).toBe("Speaker: Hello there.Listener: General Kenobi.");
    });

    it("renders empty state placeholder when input is empty or whitespace", () => {
      const empty1 = renderMarkdown("") as ElementWithChildren;
      expect(empty1.props.className).toBe("markdown-empty");
      expect(extractText(empty1)).toContain("(No narrative text)");

      const empty2 = renderMarkdown("   \n\n  \t  ") as ElementWithChildren;
      expect(empty2.props.className).toBe("markdown-empty");

      const empty3 = renderMarkdown(null) as ElementWithChildren;
      expect(empty3.props.className).toBe("markdown-empty");
    });
  });

  describe("Security & XSS Neutralization", () => {
    it("renders raw script tags as inert text nodes, never executing markup", () => {
      const malicious = '<script>alert("xss")</script>';
      const rendered = renderMarkdown(malicious) as ElementWithChildren;
      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];

      // Should be in a normal <p>, containing literal string
      expect(children[0]?.type).toBe("p");
      expect(extractText(children[0])).toBe('<script>alert("xss")</script>');
    });

    it("renders img onerror attributes as inert text, never generating img DOM tags", () => {
      const malicious = '<img src=x onerror="alert(1)">';
      const rendered = renderMarkdown(malicious) as ElementWithChildren;
      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];

      expect(children[0]?.type).toBe("p");
      expect(extractText(children[0])).toBe('<img src=x onerror="alert(1)">');
    });

    it("does not generate arbitrary HTML attributes from markdown text", () => {
      const input = "Hello [link](https://safe.com) onload=alert(1)";
      const rendered = renderMarkdown(input) as ElementWithChildren;
      const children = React.Children.toArray(rendered.props.children) as ElementWithChildren[];

      expect(extractText(children[0])).toContain("onload=alert(1)");
      expect((children[0]?.props as Record<string, unknown>).onload).toBeUndefined();
    });
  });
});
