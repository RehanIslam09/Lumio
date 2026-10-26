import React from "react";
import { AUTH_FEATURES } from "./authPresentation.js";

/**
 * Decorative 9-node branching story graph for the auth showcase panel.
 * Non-interactive, pure SVG with restrained flow animation.
 */
const ShowcaseGraphSvg: React.FC = () => {
  // 9 nodes in a branching story layout (start -> branches -> endings)
  // Coordinates designed for a 480x260 viewBox
  const nodes = [
    { id: "n1", x: 44, y: 130, kind: "start", label: "Start" },
    { id: "n2", x: 136, y: 75, kind: "scene", label: "Discovery" },
    { id: "n3", x: 136, y: 185, kind: "scene", label: "Encounter" },
    { id: "n4", x: 232, y: 50, kind: "scene", label: "Allies" },
    { id: "n5", x: 232, y: 130, kind: "scene", label: "Conflict" },
    { id: "n6", x: 232, y: 210, kind: "scene", label: "Betrayal" },
    { id: "n7", x: 334, y: 80, kind: "scene", label: "Resolution" },
    { id: "n8", x: 430, y: 70, kind: "end", label: "Triumph" },
    { id: "n9", x: 430, y: 190, kind: "end", label: "Tragedy" },
  ];

  // Connecting branching edges
  const edges = [
    { d: "M 44 130 C 90 130, 90 75, 136 75" },
    { d: "M 44 130 C 90 130, 90 185, 136 185" },
    { d: "M 136 75 C 184 75, 184 50, 232 50" },
    { d: "M 136 75 C 184 75, 184 130, 232 130" },
    { d: "M 136 185 C 184 185, 184 130, 232 130" },
    { d: "M 136 185 C 184 185, 184 210, 232 210" },
    { d: "M 232 50 C 283 50, 283 80, 334 80" },
    { d: "M 232 130 C 283 130, 283 80, 334 80" },
    { d: "M 232 210 C 331 210, 331 190, 430 190" },
    { d: "M 334 80 C 382 80, 382 70, 430 70" },
  ];

  return (
    <div className="auth-showcase-graph" aria-hidden="true">
      <svg
        viewBox="0 0 480 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="auth-graph-svg"
      >
        <defs>
          <pattern
            id="auth-grid-dots"
            x="0"
            y="0"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="currentColor" fillOpacity="0.08" />
          </pattern>
          <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4f75ff" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="pulse-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0" />
            <stop offset="50%" stopColor="#a5b4fc" stopOpacity="1" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Faint dot grid */}
        <rect width="480" height="260" fill="url(#auth-grid-dots)" />

        {/* Static base paths */}
        <g className="auth-graph-edges">
          {edges.map((edge, i) => (
            <path
              key={`edge-${i}`}
              d={edge.d}
              stroke="url(#edge-gradient)"
              strokeWidth="1.75"
              strokeLinecap="round"
              fill="none"
              className="auth-edge-base"
            />
          ))}
        </g>

        {/* Highlight pulse path */}
        <g className="auth-graph-pulse">
          <path
            d="M 44 130 C 90 130, 90 75, 136 75 C 184 75, 184 130, 232 130 C 283 130, 283 80, 334 80 C 382 80, 382 70, 430 70"
            stroke="url(#pulse-gradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            className="auth-pulse-path"
          />
        </g>

        {/* 9 Nodes */}
        <g className="auth-graph-nodes">
          {nodes.map((node) => {
            const isStart = node.kind === "start";
            const isEnd = node.kind === "end";
            const fillColor = isStart
              ? "#10b981"
              : isEnd
              ? node.id === "n8"
                ? "#06b6d4"
                : "#f43f5e"
              : "#6366f1";
            const haloColor = isStart ? "rgba(16, 185, 129, 0.25)" : "rgba(99, 102, 241, 0.2)";

            return (
              <g key={node.id} className="auth-graph-node">
                {/* Node halo glow */}
                <circle cx={node.x} cy={node.y} r="13" fill={haloColor} />
                {/* Node outer ring */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="7.5"
                  fill="#0b0f19"
                  stroke={fillColor}
                  strokeWidth="1.75"
                />
                {/* Node center point */}
                <circle cx={node.x} cy={node.y} r="3" fill={fillColor} />
                {/* Node tiny label */}
                <text
                  x={node.x}
                  y={node.y + 19}
                  textAnchor="middle"
                  className="auth-node-label"
                  fill="currentColor"
                  fillOpacity="0.65"
                  fontSize="9.5"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export const AuthShowcase: React.FC = () => {
  // Use first 3 proof points from verified AUTH_FEATURES
  const proofPoints = AUTH_FEATURES.slice(0, 3);

  return (
    <aside className="auth-showcase-panel" aria-label="Product Showcase">
      <div className="auth-showcase-glow" aria-hidden="true" />
      <div className="auth-showcase-content">
        <div className="auth-showcase-badge">
          <span className="auth-brand-glyph" aria-hidden="true">
            ◆
          </span>
          <span>Lumio Narrative Studio</span>
        </div>

        <h2 className="auth-showcase-heading">Branch your story. Test every path.</h2>
        <p className="auth-showcase-tagline">
          The visual narrative workbench designed for game writers, narrative designers, and technical directors.
        </p>

        <ShowcaseGraphSvg />

        <ul className="auth-proof-list" aria-label="Key Capabilities">
          {proofPoints.map((item) => (
            <li key={item.id} className="auth-proof-item">
              <span className="auth-proof-icon" aria-hidden="true">
                ✓
              </span>
              <div className="auth-proof-text">
                <strong className="auth-proof-title">{item.title}</strong>
                <span className="auth-proof-desc">{item.description}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};
