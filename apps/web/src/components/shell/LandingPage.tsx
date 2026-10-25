import React from "react";
import { Link } from "../../router/Link.js";

/**
 * LandingPage component for Lumio (W-034).
 * Introduces Lumio as a narrative-engineering workbench for branching game stories.
 * All preview values are grounded in Lumio's verified sample fixture (sampleProject.ts).
 */
export const LandingPage: React.FC = () => {
  return (
    <main className="shell-main landing-page" id="main-content">
      {/* 1. Hero Section */}
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="landing-hero-kicker">
          <span className="landing-kicker-badge">Narrative Engineering Workbench</span>
        </div>

        <h1 id="hero-heading" className="landing-hero-title">
          Architect complex game stories with mathematical consistency.
        </h1>

        <p className="landing-hero-lead">
          Lumio combines visual branching graph authoring, deterministic static consistency
          diagnostics, a typed narrative DSL, interactive playtesting, and Monte Carlo story
          simulation into a unified workbench for game writers and narrative designers.
        </p>

        <div className="landing-hero-actions">
          <Link href="/editor" className="shell-btn-primary landing-btn-primary">
            Launch Development Editor →
          </Link>
          <Link href="/dashboard" className="shell-btn-secondary landing-btn-secondary">
            View Story Dashboard
          </Link>
        </div>

        <div className="landing-hero-badges" aria-label="Core Technical Highlights">
          <span className="landing-hero-badge">
            <span className="badge-dot dot-green" /> Deterministic Static Analysis
          </span>
          <span className="landing-hero-badge">
            <span className="badge-dot dot-blue" /> Pure AST Narrative DSL
          </span>
          <span className="landing-hero-badge">
            <span className="badge-dot dot-purple" /> Live Playtest Runtime
          </span>
          <span className="landing-hero-badge">
            <span className="badge-dot dot-cyan" /> Monte Carlo Path Coverage
          </span>
        </div>
      </section>

      {/* 2. Authentic Product Visual (Workflow Preview) */}
      <section className="landing-preview-section" aria-labelledby="preview-heading">
        <div className="landing-preview-header">
          <div>
            <span className="landing-section-kicker">Visual Workflow</span>
            <h2 id="preview-heading" className="landing-section-title">
              Real-time Story Graph & Diagnostics Workbench
            </h2>
          </div>
          <span className="landing-preview-badge">Fixture Preview</span>
        </div>

        <div className="landing-workbench-preview">
          {/* Mock Workbench Chrome */}
          <div className="workbench-chrome">
            <div className="workbench-chrome-left">
              <span className="window-dot dot-red" />
              <span className="window-dot dot-yellow" />
              <span className="window-dot dot-green" />
              <span className="workbench-title">Prologue: The Outlander Who Caught the Wind</span>
            </div>
            <div className="workbench-chrome-right">
              <span className="workbench-metric">14 Nodes</span>
              <span className="workbench-metric">17 Edges</span>
              <span className="workbench-metric">4 Variables</span>
              <span className="workbench-tag">Sample Fixture</span>
            </div>
          </div>

          {/* Workbench Body: Graph Canvas + Issues Sidebar */}
          <div className="workbench-body">
            {/* Graph Canvas Mini Preview */}
            <div className="workbench-canvas">
              <div className="preview-canvas-grid" />

              {/* Node: Start */}
              <div className="preview-node node-start" style={{ top: "40px", left: "32px" }}>
                <div className="preview-node-header">
                  <span className="node-kind-tag kind-start">Start</span>
                  <span className="node-id-label">node_cathedral</span>
                </div>
                <div className="preview-node-title">Favonius Cathedral</div>
              </div>

              {/* Edge 1 connector line */}
              <div
                className="preview-edge-line"
                style={{ top: "82px", left: "212px", width: "90px" }}
              >
                <span className="edge-effect-pill">sigil_power = 20</span>
              </div>

              {/* Node: Scene (Knights HQ) */}
              <div className="preview-node node-scene" style={{ top: "40px", left: "302px" }}>
                <div className="preview-node-header">
                  <span className="node-kind-tag kind-scene">Scene</span>
                  <span className="node-speaker-tag">Jean</span>
                </div>
                <div className="preview-node-title">Knights of Favonius HQ</div>
              </div>

              {/* Edge 2 connector line */}
              <div
                className="preview-edge-line"
                style={{ top: "82px", left: "482px", width: "90px" }}
              >
                <span className="edge-cond-pill">[sigil_power &gt; 5]</span>
              </div>

              {/* Node: Problem Scene (Dead End) */}
              <div
                className="preview-node node-scene node-has-issue"
                style={{ top: "180px", left: "302px" }}
              >
                <div className="preview-node-header">
                  <span className="node-kind-tag kind-scene">Scene</span>
                  <span className="node-issue-indicator">1 Issue</span>
                </div>
                <div className="preview-node-title">Starsnatch Precipice</div>
                <div className="preview-node-subtitle">Dead end: cannot reach end</div>
              </div>

              {/* Node: End */}
              <div className="preview-node node-end" style={{ top: "40px", left: "572px" }}>
                <div className="preview-node-header">
                  <span className="node-kind-tag kind-end">End</span>
                  <span className="node-id-label">node_end_victory</span>
                </div>
                <div className="preview-node-title">Song of Freedom (Triumph)</div>
              </div>
            </div>

            {/* Diagnostics Panel Preview */}
            <div className="workbench-sidebar">
              <div className="sidebar-tab-header">
                <span className="sidebar-tab is-active">Diagnostics (3 Active)</span>
                <span className="sidebar-tab">Variables</span>
              </div>

              <div className="sidebar-issues-list">
                <div className="preview-issue-card issue-error">
                  <div className="issue-card-header">
                    <span className="issue-pill pill-error">Error</span>
                    <span className="issue-rule">cannot-reach-end</span>
                  </div>
                  <p className="issue-message">
                    Node &quot;Starsnatch Precipice&quot; has no path to any end node.
                  </p>
                  <span className="issue-target">Node: node_starsnatch_cliff</span>
                </div>

                <div className="preview-issue-card issue-error">
                  <div className="issue-card-header">
                    <span className="issue-pill pill-error">Error</span>
                    <span className="issue-rule">undefined-variable</span>
                  </div>
                  <p className="issue-message">
                    Variable &quot;abyssal_tear&quot; is used in condition but not declared.
                  </p>
                  <span className="issue-target">Edge: Stormterror &rarr; Barrier</span>
                </div>

                <div className="preview-issue-card issue-warning">
                  <div className="issue-card-header">
                    <span className="issue-pill pill-warning">Warning</span>
                    <span className="issue-rule">variable-never-read</span>
                  </div>
                  <p className="issue-message">
                    Variable &quot;adventurer_rank&quot; is assigned but never read in story flow.
                  </p>
                  <span className="issue-target">Variable: adventurer_rank</span>
                </div>
              </div>
            </div>
          </div>

          <div className="workbench-caption">
            <span className="caption-icon">&bull;</span>
            <span>
              <strong>Verifiable Fixture Data:</strong> Diagnostics displayed above reflect the
              actual rules triggered by Lumio&apos;s verified Prologue sample fixture. Graph
              reachability and DSL typechecking evaluate in-memory without server round-trips.
            </span>
          </div>
        </div>
      </section>

      {/* 3. Core Capabilities */}
      <section className="landing-capabilities" aria-labelledby="capabilities-heading">
        <div className="landing-section-intro">
          <span className="landing-section-kicker">Core Architecture</span>
          <h2 id="capabilities-heading" className="landing-section-title">
            Engineered for complex, non-linear game narrative
          </h2>
          <p className="landing-section-desc">
            Standard writing tools lack structural verification; general diagramming software lacks
            game runtime semantics. Lumio bridges narrative design with compiler-grade static analysis.
          </p>
        </div>

        <div className="capabilities-grid">
          <article className="capability-card">
            <div className="capability-icon-wrap icon-purple">
              <span className="capability-icon">&loz;</span>
            </div>
            <h3 className="capability-title">Visual Branching Authoring</h3>
            <p className="capability-desc">
              Create and connect start, scene, and end nodes with React Flow. Write rich scene bodies
              up to 20,000 code points, assign character speakers, and maintain referential
              integrity with linear undo/redo history.
            </p>
          </article>

          <article className="capability-card">
            <div className="capability-icon-wrap icon-red">
              <span className="capability-icon">&Delta;</span>
            </div>
            <h3 className="capability-title">Automated Consistency Checker</h3>
            <p className="capability-desc">
              Deterministic forward and reverse BFS algorithms instantly flag unreachable nodes,
              trapped cycles, dead ends, orphan characters, and unused variables before you export
              to your game engine.
            </p>
          </article>

          <article className="capability-card">
            <div className="capability-icon-wrap icon-blue">
              <span className="capability-icon">&lambda;</span>
            </div>
            <h3 className="capability-title">Typed Narrative DSL</h3>
            <p className="capability-desc">
              A pure hand-written recursive descent parser and typechecker powers conditions and
              atomic effects. Evaluate arithmetic, boolean logic, and state mutations with precise
              source error spans.
            </p>
          </article>

          <article className="capability-card">
            <div className="capability-icon-wrap icon-green">
              <span className="capability-icon">&bull;</span>
            </div>
            <h3 className="capability-title">Interactive Playtesting</h3>
            <p className="capability-desc">
              Step through choices as a player directly in the browser. Evaluate conditional choice
              availability, inspect state variable transformations, and step backward with full
              state-restoring history.
            </p>
          </article>

          <article className="capability-card capability-card-wide">
            <div className="capability-icon-wrap icon-cyan">
              <span className="capability-icon">&Sigma;</span>
            </div>
            <h3 className="capability-title">Monte Carlo Story Simulation</h3>
            <p className="capability-desc">
              Simulate up to 10,000 randomized playthroughs with seeded PRNG execution. Cross-check
              topological reachability against dynamic coverage to detect unreachable branches,
              verify ending distributions, and eliminate player soft-locks.
            </p>
          </article>
        </div>
      </section>

      {/* 4. Workflow Section */}
      <section className="landing-workflow" aria-labelledby="workflow-heading">
        <div className="landing-section-intro">
          <span className="landing-section-kicker">Authoring Pipeline</span>
          <h2 id="workflow-heading" className="landing-section-title">
            From narrative concept to mathematically verified graph
          </h2>
        </div>

        <div className="workflow-steps">
          <div className="workflow-step">
            <span className="workflow-step-num">01</span>
            <h3 className="workflow-step-title">Draft &amp; Structure</h3>
            <p className="workflow-step-desc">
              Plot scenes and choices on an infinite canvas with color-coded nodes, character speaker
              entities, and fluid handle-based connections.
            </p>
          </div>

          <div className="workflow-step">
            <span className="workflow-step-num">02</span>
            <h3 className="workflow-step-title">Script Logic</h3>
            <p className="workflow-step-desc">
              Attach typed conditions (<code>gold &gt;= 50</code>) and atomic state effects
              (<code>reputation += 10</code>) directly to branch edges using the narrative DSL.
            </p>
          </div>

          <div className="workflow-step">
            <span className="workflow-step-num">03</span>
            <h3 className="workflow-step-title">Verify Invariants</h3>
            <p className="workflow-step-desc">
              Continuous background diagnostics catch dead ends, broken speaker references, and
              type mismatches without breaking your creative flow.
            </p>
          </div>

          <div className="workflow-step">
            <span className="workflow-step-num">04</span>
            <h3 className="workflow-step-title">Simulate &amp; Validate</h3>
            <p className="workflow-step-desc">
              Execute Monte Carlo simulations across thousands of runs to ensure all endings are
              reachable and choice distributions remain balanced.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Closing Call-To-Action */}
      <section className="landing-cta" aria-labelledby="cta-heading">
        <div className="landing-cta-inner">
          <h2 id="cta-heading" className="landing-cta-title">
            Ready to engineer your branching narrative?
          </h2>
          <p className="landing-cta-desc">
            Explore the active development editor today. Author story nodes, test conditions, run
            simulations, and save your project locally or to the cloud.
          </p>
          <div className="landing-cta-actions">
            <Link href="/editor" className="shell-btn-primary landing-btn-primary">
              Launch Development Editor &rarr;
            </Link>
            <Link href="/dashboard" className="shell-btn-secondary landing-btn-secondary">
              View Story Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* 6. Minimal Footer */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="shell-brand-logo">&diams;</span>
            <span className="shell-brand-text">Lumio</span>
            <span className="landing-footer-subtext">Narrative Design Platform</span>
          </div>

          <p className="landing-footer-meta">
            Built with TypeScript, React Flow, and PostgreSQL. Client-side routing established in
            W-033. Product landing introduced in W-034.
          </p>

          <nav className="landing-footer-links" aria-label="Footer Navigation">
            <Link href="/editor" className="footer-link">
              Editor
            </Link>
            <Link href="/dashboard" className="footer-link">
              Dashboard
            </Link>
            <Link href="/login" className="footer-link">
              Sign In
            </Link>
            <Link href="/register" className="footer-link">
              Register
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
};
