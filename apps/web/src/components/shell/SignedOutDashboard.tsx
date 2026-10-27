import React, { useMemo } from "react";
import { Link } from "../../router/Link.js";
import { AUTH_FEATURES } from "./authPresentation.js";
import { sampleProject } from "../../demo/sampleProject.js";
import { buildStoryThumbnail } from "./storyThumbnail.js";

/**
 * Icons for the 4 core Lumio capabilities.
 */
const FeatureIcon: React.FC<{ id: string }> = ({ id }) => {
  if (id === "cloud-save") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      </svg>
    );
  }
  if (id === "playtest") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    );
  }
  if (id === "simulate") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    );
  }
  // checker / default
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
};

export const SignedOutDashboard: React.FC = () => {
  // Pre-calculate thumbnail for the single wide preview using sampleProject
  const thumbnailData = useMemo(() => {
    return buildStoryThumbnail(sampleProject, {
      width: 560,
      height: 220,
      padding: 16,
    });
  }, []);

  return (
    <div className="dash-signed-out-container">
      {/* Hero Section */}
      <section className="dash-signed-out-hero" aria-labelledby="signed-out-heading">
        <div className="dash-signed-out-badge">
          <span className="dash-signed-out-brand-glyph" aria-hidden="true">
            ◆
          </span>
          <span>Lumio Workspace</span>
        </div>

        <h1 id="signed-out-heading" className="dash-signed-out-title">
          Your stories live here
        </h1>
        <p className="dash-signed-out-subtitle">
          Sign in to access your saved narrative projects, branching dialogue graphs, and simulation workbench. Or test the visual editor directly in your browser.
        </p>

        {/* Primary and secondary actions */}
        <div className="dash-signed-out-actions">
          <Link href="/login" className="dash-btn-primary">
            Sign in
          </Link>
          <Link href="/register" className="dash-btn-secondary">
            Create an account
          </Link>
        </div>

        {/* Tertiary action */}
        <div className="dash-signed-out-tertiary-wrap">
          <Link href="/editor" className="dash-signed-out-tertiary">
            Try the editor without an account <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* Non-Interactive Single Wide Story Preview: Real Sample Project */}
      <section
        className="dash-signed-out-preview-section"
        aria-hidden="true"
        tabIndex={-1}
      >
        <div className="dash-preview-strip-header">
          <span className="dash-preview-strip-label">
            Example story · {sampleProject.name}
          </span>
        </div>
        <div className="dash-preview-single-wrap" tabIndex={-1}>
          <div className="dash-preview-card dash-preview-card-wide" tabIndex={-1}>
            <div className="dash-preview-card-media" tabIndex={-1}>
              <svg
                viewBox={`0 0 ${thumbnailData.width} ${thumbnailData.height}`}
                className="dash-preview-svg"
                tabIndex={-1}
              >
                <defs>
                  <linearGradient id="preview-edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
                {/* Edges */}
                {thumbnailData.edges.map((edge, edgeIdx) => {
                  const fromNode = thumbnailData.nodes.find((n) => n.id === edge.from);
                  const toNode = thumbnailData.nodes.find((n) => n.id === edge.to);
                  if (!fromNode || !toNode) return null;
                  return (
                    <line
                      key={`line-${edgeIdx}`}
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="url(#preview-edge-grad)"
                      strokeWidth="1.5"
                    />
                  );
                })}
                {/* Nodes */}
                {thumbnailData.nodes.map((node) => (
                  <circle
                    key={node.id}
                    cx={node.x}
                    cy={node.y}
                    r={node.kind === "start" || node.kind === "end" ? 5 : 3.5}
                    fill={node.kind === "start" ? "#10b981" : node.kind === "end" ? "#a855f7" : "#6366f1"}
                    stroke="#0d1117"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>
            </div>
            <div className="dash-preview-card-body" tabIndex={-1}>
              <div className="dash-preview-meta" tabIndex={-1}>
                <span className="dash-chip-version">v1</span>
                <span className="dash-preview-tag">Example story</span>
              </div>
              <div className="dash-preview-title" tabIndex={-1}>
                {sampleProject.name}
              </div>
            </div>
          </div>
        </div>
        <div className="dash-preview-blur-overlay" tabIndex={-1} />
      </section>

      {/* Feature Cards Grid (AUTH_FEATURES) */}
      <section className="dash-signed-out-features" aria-label="Platform Capabilities">
        <div className="dash-features-grid">
          {AUTH_FEATURES.map((feat) => (
            <article key={feat.id} className="dash-feature-card">
              <div className="dash-feature-icon-wrap" aria-hidden="true">
                <FeatureIcon id={feat.id} />
              </div>
              <h3 className="dash-feature-title">{feat.title}</h3>
              <p className="dash-feature-desc">{feat.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
