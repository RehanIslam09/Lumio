import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownBodyField } from "./MarkdownBodyField.js";

describe("MarkdownBodyField component", () => {
  it("renders initial state in Write mode with textarea, counter, and tablist", () => {
    const onCommit = vi.fn();
    const element = React.createElement(MarkdownBodyField, {
      id: "test-body",
      nodeId: "node-1",
      value: "Initial markdown text",
      onCommit,
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("Initial markdown text");
    expect(html).toContain("21 / 20,000");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="test-body-tab-write"');
    expect(html).toContain('id="test-body-tab-preview"');
    expect(html).toContain('aria-selected="true"');
  });

  it("calculates code points correctly for Unicode text and emojis", () => {
    const onCommit = vi.fn();
    const element = React.createElement(MarkdownBodyField, {
      id: "test-body",
      nodeId: "node-1",
      value: "⚔️ Quest", // emoji ⚔️ (2 code points) + ' Quest' (6 code points) = 8
      onCommit,
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("8 / 20,000");
  });

  it("handles empty body gracefully in Write and Preview", () => {
    const onCommit = vi.fn();
    const element = React.createElement(MarkdownBodyField, {
      id: "test-body",
      nodeId: "node-1",
      value: "",
      onCommit,
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("0 / 20,000");
    expect(html).toContain('placeholder="Scene body text or dialogue... (Markdown supported)"');
  });

  it("renders Write and Preview tab buttons with accessible attributes", () => {
    const onCommit = vi.fn();
    const element = React.createElement(MarkdownBodyField, {
      id: "inspect-node-body",
      nodeId: "node-1",
      value: "# Scene 1",
      onCommit,
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain('id="inspect-node-body-tab-write"');
    expect(html).toContain('id="inspect-node-body-tab-preview"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Body Editor View"');
  });

  it("renders warning class when character limit is exceeded", () => {
    const onCommit = vi.fn();
    const longText = "a".repeat(20005);
    const element = React.createElement(MarkdownBodyField, {
      id: "inspect-node-body",
      nodeId: "node-1",
      value: longText,
      onCommit,
    });

    const html = renderToStaticMarkup(element);
    expect(html).toContain("counter-over");
    expect(html).toContain("has-error");
    expect(html).toContain("20,005 / 20,000");
  });

  it("isolates drafts across different node IDs", () => {
    const onCommit = vi.fn();
    const nodeA = React.createElement(MarkdownBodyField, {
      id: "inspect-node-body",
      nodeId: "node-A",
      value: "Node A text",
      onCommit,
    });
    const htmlA = renderToStaticMarkup(nodeA);
    expect(htmlA).toContain("Node A text");
    expect(htmlA).not.toContain("Node B text");

    const nodeB = React.createElement(MarkdownBodyField, {
      id: "inspect-node-body",
      nodeId: "node-B",
      value: "Node B text",
      onCommit,
    });
    const htmlB = renderToStaticMarkup(nodeB);
    expect(htmlB).toContain("Node B text");
    expect(htmlB).not.toContain("Node A text");
  });
});
