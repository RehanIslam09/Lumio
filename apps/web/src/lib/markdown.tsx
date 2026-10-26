import React from "react";

/**
 * Strict protocol allowlist for links.
 * Only http:, https:, and mailto: are permitted.
 * Blocks javascript:, vbscript:, data:, and obfuscated schemes.
 */
export function isSafeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  // Strip control chars (including null bytes, tabs, newlines, zero-width) and outer whitespace
  const sanitized = rawUrl.replace(/[\u0000-\u001F\u007F-\u009F\s]/g, "");
  if (!sanitized) return false;

  const lower = sanitized.toLowerCase();

  // Reject known dangerous schemes explicitly
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("file:")
  ) {
    return false;
  }

  // Handle mailto:
  if (lower.startsWith("mailto:")) {
    const address = sanitized.slice(7);
    return address.length > 0 && !address.includes(":");
  }

  // Handle http: and https:
  try {
    const parsed = new URL(sanitized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Creates a fresh regex for inline token parsing to ensure recursive calls
 * have isolated lastIndex state and avoid infinite regex loops.
 */
function createInlineRegex(): RegExp {
  return /(?:`([^`\n]+)`|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^()\s]+(?:\([^()\s]*\)[^()\s]*)*)\))/g;
}

/**
 * Parses inline formatting for a single line into React elements.
 */
export function parseInline(text: string, keyPrefix = ""): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = createInlineRegex();

  while ((match = regex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;

    // Plain text before match
    if (matchStart > lastIndex) {
      nodes.push(text.slice(lastIndex, matchStart));
    }

    const key = `${keyPrefix}-${matchStart}`;

    if (match[1] !== undefined) {
      // Inline code
      nodes.push(
        <code key={key} className="markdown-inline-code">
          {match[1]}
        </code>,
      );
    } else if (match[2] !== undefined) {
      // Bold (recursively parse inside with its own regex)
      nodes.push(
        <strong key={key} className="markdown-bold">
          {parseInline(match[2], `${key}-b`)}
        </strong>,
      );
    } else if (match[3] !== undefined) {
      // Strikethrough
      nodes.push(
        <del key={key} className="markdown-del">
          {parseInline(match[3], `${key}-d`)}
        </del>,
      );
    } else if (match[4] !== undefined) {
      // Italic
      nodes.push(
        <em key={key} className="markdown-italic">
          {parseInline(match[4], `${key}-i`)}
        </em>,
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // Link
      const label = match[5];
      const rawUrl = match[6];
      if (isSafeUrl(rawUrl)) {
        nodes.push(
          <a
            key={key}
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="markdown-link"
          >
            {label}
          </a>,
        );
      } else {
        // Unsafe or rejected URL: render inert text safely
        nodes.push(
          <span key={key} className="markdown-inert-link">
            [{label}]({rawUrl})
          </span>,
        );
      }
    }

    lastIndex = matchEnd;
  }

  // Trailing text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * Parses a paragraph's lines, preserving soft line breaks with <br />.
 */
function renderParagraphLines(lines: string[], keyPrefix: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) {
      result.push(<br key={`${keyPrefix}-br-${idx}`} />);
    }
    const inlineNodes = parseInline(line, `${keyPrefix}-l${idx}`);
    result.push(...inlineNodes);
  });
  return result;
}

/**
 * Pure, zero-dependency Markdown renderer for Lumio narrative text.
 * Parses headings, blockquotes, lists, code blocks, and paragraphs safely into React elements.
 */
export function renderMarkdown(content: string | null | undefined): React.ReactNode {
  if (!content || content.trim() === "") {
    return (
      <div className="markdown-empty" aria-label="Empty content">
        <em>(No narrative text)</em>
      </div>
    );
  }

  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }

    // 1. Blank line: skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 2. Fenced Code Block (```)
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++; // skip opening line
      while (i < lines.length) {
        const cl = lines[i];
        if (cl === undefined || cl.trimStart().startsWith("```")) break;
        codeLines.push(cl);
        i++;
      }
      if (i < lines.length && lines[i]?.trimStart().startsWith("```")) {
        i++; // skip closing line
      }
      elements.push(
        <pre key={`code-${blockKey++}`} className="markdown-code-block">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // 3. Headings (# through ######)
    const headingMatch = line.match(/^(#{1,6})\s*(.*)$/);
    if (headingMatch && headingMatch[1]) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2] ?? "";
      const children = parseInline(headingText, `h-${blockKey}`);
      const key = `heading-${blockKey++}`;

      switch (level) {
        case 1:
          elements.push(<h1 key={key} className="markdown-h1">{children}</h1>);
          break;
        case 2:
          elements.push(<h2 key={key} className="markdown-h2">{children}</h2>);
          break;
        case 3:
          elements.push(<h3 key={key} className="markdown-h3">{children}</h3>);
          break;
        case 4:
          elements.push(<h4 key={key} className="markdown-h4">{children}</h4>);
          break;
        case 5:
          elements.push(<h5 key={key} className="markdown-h5">{children}</h5>);
          break;
        case 6:
        default:
          elements.push(<h6 key={key} className="markdown-h6">{children}</h6>);
          break;
      }
      i++;
      continue;
    }

    // 4. Blockquotes (> ...)
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const ql = lines[i];
        if (!ql || (!ql.startsWith("> ") && ql !== ">")) break;
        quoteLines.push(ql.startsWith("> ") ? ql.slice(2) : "");
        i++;
      }
      elements.push(
        <blockquote key={`quote-${blockKey++}`} className="markdown-blockquote">
          {renderParagraphLines(quoteLines, `bq-${blockKey}`)}
        </blockquote>,
      );
      continue;
    }

    // 5. Unordered list (- or *)
    if (/^[\*\-]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const ul = lines[i];
        if (!ul || !/^[\*\-]\s+/.test(ul)) break;
        items.push(ul.replace(/^[\*\-]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${blockKey++}`} className="markdown-ul">
          {items.map((item, idx) => (
            <li key={`ul-item-${idx}`} className="markdown-li">
              {parseInline(item, `ul-${blockKey}-item-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 6. Ordered list (1. 2. etc)
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const ol = lines[i];
        if (!ol || !/^\d+\.\s+/.test(ol)) break;
        items.push(ol.replace(/^\d+\.\s+/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${blockKey++}`} className="markdown-ol">
          {items.map((item, idx) => (
            <li key={`ol-item-${idx}`} className="markdown-li">
              {parseInline(item, `ol-${blockKey}-item-${idx}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // 7. Regular paragraph (collect consecutive lines until blank line or block syntax)
    const pLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (cur === undefined) break;
      if (cur.trim() === "") break;
      if (cur.trimStart().startsWith("```")) break;
      if (/^#{1,6}\s*/.test(cur)) break;
      if (cur.startsWith("> ") || cur === ">") break;
      if (/^[\*\-]\s+/.test(cur)) break;
      if (/^\d+\.\s+/.test(cur)) break;
      pLines.push(cur);
      i++;
    }

    if (pLines.length > 0) {
      elements.push(
        <p key={`p-${blockKey++}`} className="markdown-p">
          {renderParagraphLines(pLines, `p-${blockKey}`)}
        </p>,
      );
    } else {
      i++;
    }
  }

  return <div className="markdown-rendered">{elements}</div>;
}
