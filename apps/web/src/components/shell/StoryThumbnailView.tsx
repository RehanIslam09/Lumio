import React, { useEffect, useId, useRef, useState } from "react";
import type { ThumbnailNode } from "./storyThumbnail.js";
import { formatThumbnailStats } from "./storyThumbnail.js";
import type { PreviewLoader, ThumbnailLoadState } from "./storyThumbnailLoader.js";

export interface StoryThumbnailViewProps {
  projectId: string;
  latestVersion: number;
  loader: PreviewLoader;
  variant?: "card" | "resume" | "list";
}

function buildPathSegments(
  edges: readonly { from: string; to: string; weight: number }[],
  nodeMap: Map<string, ThumbnailNode>,
  curve: boolean,
): string {
  const parts: string[] = [];
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) continue;

    const x1 = Math.round(fromNode.x * 10) / 10;
    const y1 = Math.round(fromNode.y * 10) / 10;
    const x2 = Math.round(toNode.x * 10) / 10;
    const y2 = Math.round(toNode.y * 10) / 10;

    if (curve) {
      const dx = x2 - x1;
      const cx1 = Math.round((x1 + dx * 0.5) * 10) / 10;
      const cx2 = Math.round((x2 - dx * 0.5) * 10) / 10;
      parts.push(`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`);
    } else {
      parts.push(`M ${x1} ${y1} L ${x2} ${y2}`);
    }
  }
  return parts.join(" ");
}

export const StoryThumbnailView: React.FC<StoryThumbnailViewProps> = ({
  projectId,
  latestVersion,
  loader,
  variant = "card",
}) => {
  const patternId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadState, setLoadState] = useState<ThumbnailLoadState | null>(() => {
    return loader.get(projectId, latestVersion) ?? null;
  });

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      // Guard: render skeleton and load immediately in environments without IntersectionObserver
      return loader.subscribe(projectId, latestVersion, setLoadState);
    }

    let unsubscribe: (() => void) | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          if (!unsubscribe) {
            unsubscribe = loader.subscribe(projectId, latestVersion, setLoadState);
          }
        } else {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        }
      },
      { rootMargin: "200px" },
    );

    const el = containerRef.current;
    if (el) observer.observe(el);

    return () => {
      observer.disconnect();
      if (unsubscribe) unsubscribe();
    };
  }, [projectId, latestVersion, loader]);

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    loader.retry(projectId, latestVersion, setLoadState);
  };

  const isList = variant === "list";

  const renderContent = () => {
    if (!loadState || loadState.status === "loading") {
      return (
        <div className="dash-thumb-skeleton" aria-hidden="true">
          <div className="dash-thumb-skeleton-wave" />
          <span className="dash-thumb-skeleton-text">Loading graph…</span>
        </div>
      );
    }

    if (loadState.status === "error") {
      return (
        <div className="dash-thumb-error">
          <span className="dash-thumb-error-msg">Preview unavailable</span>
          <button
            type="button"
            className="dash-thumb-retry-btn"
            onClick={handleRetry}
            title="Retry loading preview"
          >
            Retry
          </button>
        </div>
      );
    }

    const { data } = loadState;
    if (data.nodes.length === 0) {
      return (
        <div className="dash-thumb-empty">
          <span className="dash-thumb-empty-text">No scenes yet</span>
        </div>
      );
    }

    const nodeMap = new Map<string, ThumbnailNode>(data.nodes.map((n) => [n.id, n]));
    const useCurves = data.edges.length <= 120;

    // Bucket edges into 3 weight tiers
    let maxWeight = 1;
    for (const e of data.edges) {
      if (e.weight > maxWeight) maxWeight = e.weight;
    }

    const step = (maxWeight - 1) / 3;
    const tier1Cutoff = 1 + step;
    const tier2Cutoff = 1 + 2 * step;

    const tier1Edges = data.edges.filter((e) => e.weight <= tier1Cutoff);
    const tier2Edges = data.edges.filter((e) => e.weight > tier1Cutoff && e.weight <= tier2Cutoff);
    const tier3Edges = data.edges.filter((e) => e.weight > tier2Cutoff);

    const pathTier1 = buildPathSegments(tier1Edges, nodeMap, useCurves);
    const pathTier2 = buildPathSegments(tier2Edges, nodeMap, useCurves);
    const pathTier3 = buildPathSegments(tier3Edges, nodeMap, useCurves);

    return (
      <svg
        className="dash-thumb-svg"
        viewBox={`0 0 ${data.width} ${data.height}`}
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern
            id={patternId}
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="rgba(255, 255, 255, 0.07)" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="#0c111d" />
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />

        {/* 3 Weight Tier Edge Paths (ONE <path> per bucket) */}
        {pathTier1.length > 0 && (
          <path
            d={pathTier1}
            fill="none"
            stroke="rgba(148, 163, 184, 0.28)"
            strokeWidth={data.edges.length > 80 ? "0.8" : "1.2"}
            strokeLinecap="round"
          />
        )}
        {pathTier2.length > 0 && (
          <path
            d={pathTier2}
            fill="none"
            stroke="rgba(99, 102, 241, 0.45)"
            strokeWidth={data.edges.length > 80 ? "1.2" : "1.8"}
            strokeLinecap="round"
          />
        )}
        {pathTier3.length > 0 && (
          <path
            d={pathTier3}
            fill="none"
            stroke="rgba(129, 140, 248, 0.75)"
            strokeWidth={data.edges.length > 80 ? "1.8" : "2.5"}
            strokeLinecap="round"
          />
        )}

        {/* Nodes */}
        {data.nodes.map((node) => {
          let fill = "#6366f1"; // scene: muted indigo
          if (node.kind === "start") fill = "#10b981"; // start: emerald
          else if (node.kind === "end") fill = "#a855f7"; // end: violet

          const baseR = 2.4;
          // Clamp node radius to max 5px in 320x180 thumbnail frame
          const r = Math.min(5, baseR + Math.log2(node.weight) * 0.6);

          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={r}
              fill={fill}
              stroke="rgba(12, 17, 29, 0.85)"
              strokeWidth="1"
            />
          );
        })}
      </svg>
    );
  };

  const stats = loadState?.status === "ready" ? loadState.data.stats : null;
  const formattedStats = stats ? formatThumbnailStats(stats) : null;

  return (
    <div
      ref={containerRef}
      className={`dash-thumb-container dash-thumb-${variant}`}
      data-testid={`story-thumb-${projectId}`}
    >
      <div className="dash-thumb-media">
        {renderContent()}
        {formattedStats?.overviewLabel && (
          <span
            className="dash-thumb-sampled-pill"
            title={formattedStats.overviewTooltip}
          >
            {formattedStats.overviewLabel}
          </span>
        )}
      </div>

      {formattedStats && !isList && variant !== "resume" && (
        <div className="dash-thumb-caption" aria-label={formattedStats.summary}>
          <span className="dash-thumb-counts">{formattedStats.summary}</span>
        </div>
      )}
    </div>
  );
};
