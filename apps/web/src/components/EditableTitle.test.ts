import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditableTitle } from "./EditableTitle.js";
import { TITLE_MAX } from "./titleHelper.js";

describe("EditableTitle Component (W-046)", () => {
  it("renders display button in display mode with title, accessible label, and pencil icon", () => {
    const html = renderToStaticMarkup(
      React.createElement(EditableTitle, {
        name: "Echoes of the Void",
        onRename: vi.fn(),
      }),
    );

    // Real button element
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('class="header-title-display-btn"');
    // Accessible name starts with visible title (label-in-name rule)
    expect(html).toContain('aria-label="Echoes of the Void, edit title"');
    // Full title in title attribute tooltip
    expect(html).toContain('title="Echoes of the Void"');
    // Visible text
    expect(html).toContain("Echoes of the Void");
    // Inline SVG pencil (no emoji)
    expect(html).toContain("<svg");
    expect(html).toContain('class="header-title-pencil"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("supports legacy titles longer than TITLE_MAX (80) without truncation in display mode", () => {
    const legacyTitle = "A".repeat(100);
    const html = renderToStaticMarkup(
      React.createElement(EditableTitle, {
        name: legacyTitle,
        onRename: vi.fn(),
      }),
    );

    expect(html).toContain(legacyTitle);
    expect(html).toContain(`title="${legacyTitle}"`);
    expect(html).toContain(`aria-label="${legacyTitle}, edit title"`);
  });

  it("renders with initialEditMode: input has fixed editLimit maxLength", () => {
    const html = renderToStaticMarkup(
      React.createElement(EditableTitle, {
        name: "Standard Title",
        onRename: vi.fn(),
        initialEditMode: true,
      }),
    );

    expect(html).toContain("<input");
    expect(html).toContain('type="text"');
    expect(html).toContain('class="header-title-input"');
    expect(html).toContain(`maxLength="${TITLE_MAX}"`);
    expect(html).toContain('value="Standard Title"');
  });

  it("renders counter when draft length >= 60 in edit mode", () => {
    const draft65 = "B".repeat(65);
    const html = renderToStaticMarkup(
      React.createElement(EditableTitle, {
        name: draft65,
        onRename: vi.fn(),
        initialEditMode: true,
      }),
    );

    expect(html).toContain('class="header-title-counter tone-neutral"');
    expect(html).toContain("65/80");
  });

  it("renders warning tone on counter when draft length is 75 in edit mode", () => {
    const draft75 = "C".repeat(75);
    const html = renderToStaticMarkup(
      React.createElement(EditableTitle, {
        name: draft75,
        onRename: vi.fn(),
        initialEditMode: true,
      }),
    );

    expect(html).toContain('class="header-title-counter tone-warning"');
    expect(html).toContain("75/80");
  });

  it("renders danger tone on counter when draft length reaches 80 in edit mode", () => {
    const draft80 = "D".repeat(80);
    const html = renderToStaticMarkup(
      React.createElement(EditableTitle, {
        name: draft80,
        onRename: vi.fn(),
        initialEditMode: true,
      }),
    );

    expect(html).toContain('class="header-title-counter tone-danger"');
    expect(html).toContain("80/80");
  });

  it("sets maxLength to original title length for legacy titles > 80", () => {
    const legacy100 = "L".repeat(100);
    const html = renderToStaticMarkup(
      React.createElement(EditableTitle, {
        name: legacy100,
        onRename: vi.fn(),
        initialEditMode: true,
      }),
    );

    expect(html).toContain('maxLength="100"');
    expect(html).toContain('class="header-title-counter tone-danger"');
    expect(html).toContain("100/80");
  });
});
