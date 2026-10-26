import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Project } from "@repo/schema";
import { simulate } from "../playtest/simulate.js";
import { crossCheck, type Finding, type FindingKind } from "../playtest/crossCheck.js";
import {
  ALL_FINDING_KINDS,
  buildVerdict,
  computeOutcomeDistribution,
  getFindingSeverity,
  groupFindingsBySeverity,
  type FindingSeverity,
} from "./simulationPresentation.js";

export interface SimulationDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly project: Project;
  readonly onSelectTarget: (target: { kind: "node" | "edge"; id: string }) => void;
  readonly triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

interface LastRunOptions {
  readonly runs: number;
  readonly seed: number;
  readonly maxSteps: number;
}

// Preset definitions for quick exploratory runs
interface Preset {
  readonly name: string;
  readonly runs: number;
  readonly maxSteps: number;
  readonly desc: string;
}

const PRESETS: readonly Preset[] = [
  { name: "Quick Check", runs: 100, maxSteps: 100, desc: "Fast preliminary traversal sanity check" },
  { name: "Standard QA", runs: 500, maxSteps: 200, desc: "Standard QA depth balance" },
  { name: "Deep Analysis", runs: 1500, maxSteps: 500, desc: "Thorough multi-branch path exploration" },
];

const KIND_METADATA: Record<
  FindingKind,
  { label: string; badgeClass: string }
> = {
  "stuck-spot": {
    label: "Stuck Spot",
    badgeClass: "finding-stuck",
  },
  "ending-never-reached": {
    label: "Ending Unreached",
    badgeClass: "finding-ending-unreached",
  },
  "never-visited-but-reachable": {
    label: "Never Visited",
    badgeClass: "finding-never-visited",
  },
  "unreachable-confirmed": {
    label: "Orphan Scene",
    badgeClass: "finding-orphan",
  },
  "loop-suspect": {
    label: "Infinite Loop Trap",
    badgeClass: "finding-loop",
  },
  "edge-never-available": {
    label: "Choice Inactive",
    badgeClass: "finding-choice-unusable",
  },
};

// Inline SVG Icons (16px, stroke 1.5, currentColor)
const IconSparkles: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12 3v3m0 12v3M3 12h3m12 0h3m-3.5-6.5-2 2m-7 7-2 2m0-11 2 2m7 7 2 2" />
  </svg>
);

const IconInfo: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4m0-4h.01" />
  </svg>
);

const IconClose: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const IconDice: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="8" cy="8" r="1" />
    <circle cx="16" cy="8" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="8" cy="16" r="1" />
    <circle cx="16" cy="16" r="1" />
  </svg>
);

const IconPlay: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
);

const IconCheckCircle: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

const IconAlertOctagon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

const IconRepeat: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

const IconGhost: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
  </svg>
);

const IconAlertTriangle: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" x2="12" y1="9" y2="13" />
    <line x1="12" x2="12.01" y1="17" y2="17" />
  </svg>
);

const IconExternalLink: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

// rAF Count-Up Hook with matchMedia guard and cleanup (A4)
function useCountUp(targetValue: number, durationMs = 600): number {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const prevTargetRef = useRef(targetValue);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || durationMs <= 0) {
      return;
    }

    const startValue = prevTargetRef.current;
    prevTargetRef.current = targetValue;
    const startTime = performance.now();
    let frameId: number | null = null;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (targetValue - startValue) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [targetValue, durationMs]);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion || durationMs <= 0) {
    return targetValue;
  }

  return displayValue;
}

// Single metric card with rAF count-up and sr-only accessible plain text
const MetricCard: React.FC<{
  label: string;
  value: number;
  subtitle: string;
  badge: string;
  badgeClass?: string;
  icon: React.ReactNode;
}> = ({ label, value, subtitle, badge, badgeClass, icon }) => {
  const animatedValue = useCountUp(value, 600);

  return (
    <div className={`sim-metric-card ${badgeClass ?? ""}`}>
      <div className="sim-metric-top">
        <span className="sim-metric-icon">{icon}</span>
        <span className={`sim-metric-badge ${badgeClass ?? ""}`}>{badge}</span>
      </div>
      <div className="sim-metric-val-wrap">
        <span className="sim-metric-val" aria-hidden="true">
          {animatedValue.toLocaleString()}
        </span>
        <span className="sr-only">
          {value.toLocaleString()} {label}
        </span>
      </div>
      <div className="sim-metric-label">{label}</div>
      <div className="sim-metric-sub">{subtitle}</div>
    </div>
  );
};

export interface SimulationDialogContentProps {
  readonly project: Project;
  readonly onClose: () => void;
  readonly onSelectTarget: (target: { kind: "node" | "edge"; id: string }) => void;
}

export const SimulationDialogContent: React.FC<SimulationDialogContentProps> = ({
  project,
  onClose,
  onSelectTarget,
}) => {
  const [runsInput, setRunsInput] = useState<number>(500);
  const [maxStepsInput, setMaxStepsInput] = useState<number>(200);
  const [seedInput, setSeedInput] = useState<number>(42);
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [selectedKindFilter, setSelectedKindFilter] = useState<string>("all");
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>("all");
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Initial simulation computation
  const initialResult = useMemo(() => {
    return simulate(project, { runs: 500, maxSteps: 200, seed: 42 });
  }, [project]);

  const [simResult, setSimResult] = useState(initialResult);
  const [lastRun, setLastRun] = useState<LastRunOptions>({
    runs: initialResult.ok ? initialResult.runs : 500,
    seed: 42,
    maxSteps: 200,
  });

  const handleRunSimulation = useCallback(
    (runs = runsInput, maxSteps = maxStepsInput, seed = seedInput) => {
      setIsRunning(true);
      // Run on next tick so UI can render the "Running..." state
      setTimeout(() => {
        const nextResult = simulate(project, { runs, maxSteps, seed });
        setSimResult(nextResult);
        if (nextResult.ok) {
          setLastRun({
            runs: nextResult.runs,
            seed,
            maxSteps,
          });
        }
        setIsRunning(false);
      }, 30);
    },
    [project, runsInput, maxStepsInput, seedInput]
  );

  const applyPreset = (preset: Preset) => {
    setRunsInput(preset.runs);
    setMaxStepsInput(preset.maxSteps);
    handleRunSimulation(preset.runs, preset.maxSteps, seedInput);
  };

  const randomizeSeed = () => {
    const nextSeed = Math.floor(Math.random() * 100000);
    setSeedInput(nextSeed);
    handleRunSimulation(runsInput, maxStepsInput, nextSeed);
  };

  const handleNavigateToTarget = (target: { kind: "node" | "edge"; id: string }) => {
    onSelectTarget(target);
    onClose();
  };

  // Cross-check findings
  const findings: readonly Finding[] = useMemo(() => {
    if (!simResult.ok) return [];
    return crossCheck(project, simResult);
  }, [project, simResult]);

  // Verdict sentence
  const verdict = useMemo(() => {
    return buildVerdict(simResult);
  }, [simResult]);

  // Outcome distribution percentages
  const outcomes = useMemo(() => {
    if (!simResult.ok) {
      return { ended: 0, stuck: 0, stepLimit: 0, endedPct: 0, stuckPct: 0, stepLimitPct: 0 };
    }
    return computeOutcomeDistribution(simResult.runs, simResult.outcomeCounts);
  }, [simResult]);

  // Endings breakdown
  const endingsList = useMemo(() => {
    if (!simResult.ok) return [];
    const totalRuns = simResult.runs;
    const endNodes = project.nodes.filter((n) => n.type === "end");
    return endNodes.map((n) => {
      const count = simResult.endCounts.get(n.id) ?? 0;
      const pct = totalRuns > 0 ? Math.round((count / totalRuns) * 100) : 0;
      return { id: n.id, title: n.title || n.id, count, pct };
    });
  }, [project.nodes, simResult]);

  // Grouped findings by severity
  const groupedFindings = useMemo(() => {
    return groupFindingsBySeverity(findings);
  }, [findings]);

  // Filtered findings by kind or severity
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (selectedKindFilter !== "all" && f.kind !== selectedKindFilter) return false;
      if (selectedSeverityFilter !== "all") {
        const sev = getFindingSeverity(f.kind);
        if (sev !== selectedSeverityFilter) return false;
      }
      return true;
    });
  }, [findings, selectedKindFilter, selectedSeverityFilter]);

  return (
    <div className="sim-dialog-shell">
      {/* Header */}
      <header className="sim-dialog-header">
        <div className="sim-header-title-group">
          <div className="sim-header-badge">
            <IconSparkles />
            <span>Analytics Engine</span>
          </div>
          <h2 id="sim-dialog-title" className="sim-dialog-title">
            Story Simulation &amp; Path Coverage
          </h2>
          <p className="sim-dialog-subtitle">
            Automated virtual playtesting to verify branch reachability, endings, and dead ends.
          </p>
        </div>

        <div className="sim-header-actions">
          <button
            type="button"
            className={`btn ${showHowItWorks ? "btn-primary" : "btn-secondary"} btn-sm sim-how-btn`}
            onClick={() => setShowHowItWorks((prev) => !prev)}
            aria-expanded={showHowItWorks}
            title={showHowItWorks ? "Hide explanation guide" : "Learn how story simulation works"}
          >
            <IconInfo />
            <span>{showHowItWorks ? "Hide Guide" : "How It Works"}</span>
          </button>
          <button
            type="button"
            className="sim-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <IconClose />
          </button>
        </div>
      </header>

      {/* "How It Works" Inline Panel */}
      {showHowItWorks && (
        <section className="sim-how-it-works-panel" aria-label="Simulation Tutorial Guide">
          <div className="sim-how-header">
            <div className="sim-how-title-box">
              <span className="how-badge">Quick Guide</span>
              <h3>How Story Simulation Works in Lumio</h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs sim-how-dismiss"
              onClick={() => setShowHowItWorks(false)}
            >
              Got it ✕
            </button>
          </div>

          <div className="sim-how-grid">
            <div className="sim-how-step">
              <div className="step-num">1</div>
              <div className="step-content">
                <h4>Virtual Playtesters</h4>
                <p>
                  Automated readers traverse your story from the <strong>Start</strong> scene. At each choice, they evaluate variable conditions and follow eligible branches.
                </p>
              </div>
            </div>

            <div className="sim-how-step">
              <div className="step-num">2</div>
              <div className="step-content">
                <h4>Three Possible Outcomes</h4>
                <p>
                  <span className="status-dot green" /> <strong>Ended:</strong> Reached an End node.<br />
                  <span className="status-dot red" /> <strong>Stuck:</strong> Trapped by unmet choice conditions.<br />
                  <span className="status-dot amber" /> <strong>Loop:</strong> Exceeded step limit in a cycle.
                </p>
              </div>
            </div>

            <div className="sim-how-step">
              <div className="step-num">3</div>
              <div className="step-content">
                <h4>Hidden Unreachable Scenes</h4>
                <p>
                  A scene may look visually connected on canvas, but if variable conditions make reaching it impossible, simulation flags it as <strong>Never Visited</strong>.
                </p>
              </div>
            </div>

            <div className="sim-how-step">
              <div className="step-num">4</div>
              <div className="step-content">
                <h4>Show on Canvas</h4>
                <p>
                  Click <strong>Show on canvas ↗</strong> beside any finding to navigate directly to the scene on the graph and adjust its conditions in the Inspector.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Body: Left Rail + Results Pane */}
      <div className="sim-dialog-body">
        {/* Left Rail (Sticky ~280px) */}
        <aside className="sim-left-rail" aria-label="Simulation Controls">
          <div className="sim-rail-section">
            <span className="sim-rail-label">QA Presets</span>
            <div className="sim-preset-segmented" role="group" aria-label="Presets">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`preset-btn ${runsInput === p.runs && maxStepsInput === p.maxSteps ? "active" : ""}`}
                  onClick={() => applyPreset(p)}
                  title={p.desc}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="sim-rail-inputs">
            <div className="sim-input-block">
              <label htmlFor="sim-input-runs" className="sim-input-label">
                Virtual Readers (Runs)
              </label>
              <input
                id="sim-input-runs"
                type="number"
                className="sim-large-input"
                value={runsInput}
                min={1}
                max={5000}
                onChange={(e) => setRunsInput(Number(e.target.value))}
              />
              <span className="sim-input-hint">Range: 1 – 5,000</span>
              {simResult.ok && simResult.clamped.some((c) => c.includes("runs")) && (
                <span className="sim-clamping-note">Clamped to limit</span>
              )}
            </div>

            <div className="sim-input-block">
              <label htmlFor="sim-input-steps" className="sim-input-label">
                Max Steps Per Run
              </label>
              <input
                id="sim-input-steps"
                type="number"
                className="sim-large-input"
                value={maxStepsInput}
                min={1}
                max={2000}
                onChange={(e) => setMaxStepsInput(Number(e.target.value))}
              />
              <span className="sim-input-hint">Range: 1 – 2,000</span>
              {simResult.ok && simResult.clamped.some((c) => c.includes("maxSteps")) && (
                <span className="sim-clamping-note">Clamped to limit</span>
              )}
            </div>

            <div className="sim-input-block">
              <div className="sim-seed-label-row">
                <label htmlFor="sim-input-seed" className="sim-input-label">
                  Random Seed
                </label>
                <button
                  type="button"
                  className="sim-seed-dice-btn"
                  onClick={randomizeSeed}
                  title="Randomize seed"
                  aria-label="Generate random seed"
                >
                  <IconDice />
                </button>
              </div>
              <input
                id="sim-input-seed"
                type="number"
                className="sim-large-input font-mono"
                value={seedInput}
                onChange={(e) => setSeedInput(Number(e.target.value))}
              />
              <span className="sim-input-hint">Reproducible integer</span>
            </div>
          </div>

          <div className="sim-rail-actions">
            <button
              type="button"
              className="btn btn-primary sim-run-btn"
              disabled={isRunning}
              onClick={() => handleRunSimulation()}
            >
              <IconPlay />
              <span>{isRunning ? "Running..." : "Run Simulation"}</span>
            </button>
            <span className="sim-last-run-footnote">
              Last run: {lastRun.runs.toLocaleString()} runs, seed {lastRun.seed}
            </span>
          </div>
        </aside>

        {/* Results Pane */}
        <main className="sim-results-pane" aria-label="Simulation Results">
          {!simResult.ok ? (
            <div className="sim-error-card sim-error-banner" role="alert">
              <span className="sim-error-icon">
                <IconAlertTriangle />
              </span>
              <div className="sim-error-content">
                <h3>Cannot run simulation: Project has no Start node</h3>
                <p>{verdict.sentence}</p>
                <span className="sim-error-hint">
                  Place a Start node on the canvas to define where story playthroughs begin.
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* a) Verdict Banner */}
              <section className={`sim-verdict-banner sim-verdict-${verdict.severity}`}>
                <div className="verdict-icon-badge">
                  {verdict.severity === "success" ? (
                    <IconCheckCircle />
                  ) : verdict.severity === "warning" ? (
                    <IconAlertTriangle />
                  ) : (
                    <IconAlertOctagon />
                  )}
                  <span className="verdict-label-text">{verdict.label}</span>
                </div>
                <p className="sim-verdict-sentence" aria-live="polite">
                  {verdict.sentence}
                </p>
              </section>

              {/* b) Outcome Distribution Bar */}
              <section className="sim-distribution-card" aria-label="Outcome Distribution">
                <div className="sim-distribution-header">
                  <h4>Playthrough Outcomes Distribution</h4>
                  <span className="sim-runs-count-pill">{simResult.runs.toLocaleString()} Total Runs</span>
                </div>

                <div
                  className="sim-distribution-bar"
                  role="progressbar"
                  aria-label="Simulation outcomes breakdown"
                  aria-valuenow={outcomes.endedPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  {outcomes.endedPct > 0 && (
                    <div
                      className="sim-dist-segment sim-dist-ended"
                      style={{ width: `${outcomes.endedPct}%` }}
                      tabIndex={0}
                      title={`Ended: ${outcomes.ended.toLocaleString()} (${outcomes.endedPct}%)`}
                    />
                  )}
                  {outcomes.stuckPct > 0 && (
                    <div
                      className="sim-dist-segment sim-dist-stuck"
                      style={{ width: `${outcomes.stuckPct}%` }}
                      tabIndex={0}
                      title={`Stuck: ${outcomes.stuck.toLocaleString()} (${outcomes.stuckPct}%)`}
                    />
                  )}
                  {outcomes.stepLimitPct > 0 && (
                    <div
                      className="sim-dist-segment sim-dist-steplimit"
                      style={{ width: `${outcomes.stepLimitPct}%` }}
                      tabIndex={0}
                      title={`Loop Timeout: ${outcomes.stepLimit.toLocaleString()} (${outcomes.stepLimitPct}%)`}
                    />
                  )}
                </div>

                <div className="sim-distribution-legend">
                  <div className="legend-item" tabIndex={0}>
                    <span className="legend-dot dot-ended" />
                    <span className="legend-name">Ended:</span>
                    <span className="legend-val">{outcomes.ended.toLocaleString()} ({outcomes.endedPct}%)</span>
                  </div>
                  <div className="legend-item" tabIndex={0}>
                    <span className="legend-dot dot-stuck" />
                    <span className="legend-name">Stuck:</span>
                    <span className="legend-val">{outcomes.stuck.toLocaleString()} ({outcomes.stuckPct}%)</span>
                  </div>
                  <div className="legend-item" tabIndex={0}>
                    <span className="legend-dot dot-steplimit" />
                    <span className="legend-name">Loop Timeout:</span>
                    <span className="legend-val">{outcomes.stepLimit.toLocaleString()} ({outcomes.stepLimitPct}%)</span>
                  </div>
                </div>
              </section>

              {/* c) Four Key Metrics + Footnote */}
              <section className="sim-metrics-section" aria-label="Key Simulation Metrics">
                <div className="sim-metrics-grid">
                  <MetricCard
                    label="Reached End"
                    value={simResult.outcomeCounts.ended}
                    subtitle={`${outcomes.endedPct}% finished story`}
                    badge="Finished"
                    badgeClass="badge-green"
                    icon={<IconCheckCircle />}
                  />
                  <MetricCard
                    label="Stuck at Scene"
                    value={simResult.outcomeCounts.stuck}
                    subtitle={`${outcomes.stuckPct}% blocked choices`}
                    badge="Dead Ends"
                    badgeClass="badge-rose"
                    icon={<IconAlertOctagon />}
                  />
                  <MetricCard
                    label="Step Limit"
                    value={simResult.outcomeCounts.stepLimit}
                    subtitle={`${outcomes.stepLimitPct}% timeout limit`}
                    badge="Loops"
                    badgeClass="badge-amber"
                    icon={<IconRepeat />}
                  />
                  <MetricCard
                    label="Never Visited"
                    value={simResult.neverVisited.length}
                    subtitle="Unreached scenes"
                    badge="Unreached"
                    badgeClass="badge-purple"
                    icon={<IconGhost />}
                  />
                </div>
                <div className="sim-metrics-footnote">
                  <span>Total Runs: <strong>{simResult.runs.toLocaleString()}</strong></span>
                  <span className="dot-sep">•</span>
                  <span>Longest Run: <strong>{simResult.longestRun} scenes</strong></span>
                </div>
              </section>

              {/* d) Endings Table */}
              <section className="sim-section endings-section" aria-label="Story Endings">
                <div className="sim-section-header">
                  <h3 className="sim-section-title">
                    <IconCheckCircle />
                    <span>Story Endings Reached ({endingsList.length})</span>
                  </h3>
                </div>

                {endingsList.length === 0 ? (
                  <div className="sim-empty-endings-notice">
                    <span className="notice-icon"><IconAlertTriangle /></span>
                    <p>No story End nodes exist in this project.</p>
                  </div>
                ) : (
                  <div className="sim-endings-table">
                    {endingsList.map((end) => (
                      <div key={end.id} className="sim-ending-row">
                        <div className="ending-info">
                          <strong className="ending-title">{end.title}</strong>
                          <span className="ending-count-label">
                            {end.count.toLocaleString()} playthroughs ({end.pct}%)
                          </span>
                        </div>
                        <div className="ending-bar-track">
                          <div
                            className="ending-bar-fill"
                            style={{ width: `${Math.min(100, Math.max(end.count > 0 ? 3 : 0, end.pct))}%` }}
                          />
                        </div>
                        <button
                          type="button"
                          className="ending-jump-btn"
                          onClick={() => handleNavigateToTarget({ kind: "node", id: end.id })}
                          title={`Select node "${end.title}" on canvas`}
                        >
                          <span>Show on canvas</span>
                          <IconExternalLink />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* e) Findings Section */}
              <section className="sim-section findings-section" aria-label="Graph Diagnostics">
                <div className="sim-section-header">
                  <div className="findings-title-group">
                    <h3 className="sim-section-title">
                      <IconSparkles />
                      <span>Reachability &amp; Graph Findings ({findings.length})</span>
                    </h3>
                    <span className="findings-subtitle">
                      Topological graph cross-check compared against simulated reader choices.
                    </span>
                  </div>

                  {findings.length > 0 && (
                    <div className="findings-filter-bar">
                      <div className="filter-pill-group" role="tablist" aria-label="Severity filter">
                        <button
                          type="button"
                          className={`filter-pill ${selectedSeverityFilter === "all" ? "active" : ""}`}
                          onClick={() => setSelectedSeverityFilter("all")}
                        >
                          All ({findings.length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill pill-high ${selectedSeverityFilter === "high" ? "active" : ""}`}
                          onClick={() => setSelectedSeverityFilter("high")}
                        >
                          High ({groupedFindings.high.length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill pill-med ${selectedSeverityFilter === "medium" ? "active" : ""}`}
                          onClick={() => setSelectedSeverityFilter("medium")}
                        >
                          Medium ({groupedFindings.medium.length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill pill-low ${selectedSeverityFilter === "low" ? "active" : ""}`}
                          onClick={() => setSelectedSeverityFilter("low")}
                        >
                          Low ({groupedFindings.low.length})
                        </button>
                      </div>

                      <div className="filter-pill-group filter-kind-group" role="tablist" aria-label="Kind filter">
                        <button
                          type="button"
                          className={`filter-pill ${selectedKindFilter === "all" ? "active" : ""}`}
                          onClick={() => setSelectedKindFilter("all")}
                        >
                          All Kinds
                        </button>
                        {ALL_FINDING_KINDS.map((kind) => {
                          const count = findings.filter((f) => f.kind === kind).length;
                          if (count === 0) return null;
                          return (
                            <button
                              key={kind}
                              type="button"
                              className={`filter-pill ${selectedKindFilter === kind ? "active" : ""}`}
                              onClick={() => setSelectedKindFilter(kind)}
                            >
                              {KIND_METADATA[kind].label} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {findings.length === 0 ? (
                  <div className="sim-clean-card">
                    <IconCheckCircle />
                    <div>
                      <strong>All paths clear!</strong>
                      <p>Every node is reachable, choices are active, and no traps or dead ends were encountered.</p>
                    </div>
                  </div>
                ) : filteredFindings.length === 0 ? (
                  <div className="sim-empty-note">No findings in the selected filter.</div>
                ) : (
                  <div className="sim-findings-rows">
                    {filteredFindings.map((f, idx) => {
                      const meta = KIND_METADATA[f.kind];
                      const sev: FindingSeverity = getFindingSeverity(f.kind);
                      const rawId = f.nodeId ?? f.edgeId ?? "";

                      let nodeTitle = "";
                      if (f.nodeId) {
                        const node = project.nodes.find((n) => n.id === f.nodeId);
                        nodeTitle = node?.title ?? f.nodeId;
                      } else if (f.edgeId) {
                        const edge = project.edges.find((e) => e.id === f.edgeId);
                        if (edge) {
                          const fromT = project.nodes.find((n) => n.id === edge.from)?.title ?? edge.from;
                          const toT = project.nodes.find((n) => n.id === edge.to)?.title ?? edge.to;
                          nodeTitle = `${fromT} → ${toT}`;
                        }
                      }

                      return (
                        <div
                          key={`${f.kind}-${rawId}-${idx}`}
                          className={`sim-finding-row sev-${sev} ${meta?.badgeClass ?? ""}`}
                        >
                          <div className="finding-row-icon">
                            {sev === "high" ? (
                              <IconAlertOctagon />
                            ) : sev === "medium" ? (
                              <IconAlertTriangle />
                            ) : (
                              <IconInfo />
                            )}
                          </div>

                          <div className="finding-row-body">
                            <div className="finding-row-header">
                              <span className={`finding-sev-chip sev-${sev}`}>
                                {sev.toUpperCase()}
                              </span>
                              <h4 className="finding-kind-title">
                                {meta?.label ?? f.kind}
                                {nodeTitle && <span className="finding-node-name"> — {nodeTitle}</span>}
                              </h4>
                            </div>

                            <p className="finding-message-clamped" title={f.message}>
                              {f.message}
                            </p>

                            {rawId && (
                              <details className="finding-id-disclosure">
                                <summary>Details (ID)</summary>
                                <code>{rawId}</code>
                              </details>
                            )}
                          </div>

                          {(f.nodeId || f.edgeId) && (
                            <div className="finding-row-action">
                              <button
                                type="button"
                                className="sim-canvas-action-btn"
                                onClick={() => {
                                  if (f.nodeId) {
                                    handleNavigateToTarget({ kind: "node", id: f.nodeId });
                                  } else if (f.edgeId) {
                                    handleNavigateToTarget({ kind: "edge", id: f.edgeId });
                                  }
                                }}
                                title="Show element on canvas and close dialog"
                              >
                                <span>Show on canvas</span>
                                <IconExternalLink />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* f) Footnote: Confidence Note (A5) */}
              <div className="sim-confidence-footer">
                <IconInfo />
                <span>{simResult.confidenceNote}</span>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="sim-dialog-footer">
        <div className="sim-footer-tip">
          <span>Tip: Selecting &quot;Show on canvas&quot; focuses the scene and closes this dialog for immediate editing.</span>
        </div>
        <div className="sim-footer-actions">
          <button type="button" className="btn btn-secondary sim-footer-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </footer>
    </div>
  );
};

export const SimulationDialog: React.FC<SimulationDialogProps> = ({
  isOpen,
  onClose,
  project,
  onSelectTarget,
  triggerRef,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
    triggerRef?.current?.focus();
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    handleClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="sim-dialog"
      onCancel={handleCancel}
      aria-labelledby="sim-dialog-title"
    >
      {isOpen && (
        <SimulationDialogContent
          project={project}
          onSelectTarget={onSelectTarget}
          onClose={handleClose}
        />
      )}
    </dialog>
  );
};
