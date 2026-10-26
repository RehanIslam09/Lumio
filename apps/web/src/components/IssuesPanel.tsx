import React, { useState, useMemo } from "react";
import type { Issue, Project } from "@repo/schema";
import { getIssueSnippet } from "../lib/snippet.js";

interface IssuesPanelProps {
  project: Project;
  issues: Issue[];
  selectedIssue: Issue | null;
  onSelectIssue: (issue: Issue) => void;
}

type SeverityFilter = "all" | "error" | "warning";

const RULE_TITLES: Record<string, string> = {
  "unreachable-from-start": "Unreachable Scene",
  "cannot-reach-end": "Dead-End Scene",
  "invalid-speaker": "Invalid Speaker Reference",
  "speaker-without-text": "Speaker Without Dialogue",
  "invalid-expression": "Invalid Condition / Effect Syntax",
  "unused-variable": "Unused Variable",
  "variable-never-written": "Variable Never Written",
  "variable-never-read": "Variable Never Read",
  "character-never-speaks": "Silent Character",
  "duplicate-entity-name": "Duplicate Entity Name",
  "duplicate-variable-name": "Duplicate Variable Name",
  "undefined-variable": "Undefined Variable",
  "type-mismatch": "Type Mismatch",
  "cannot-mutate-in-condition": "Side Effect in Condition",
};

export function getFriendlyRuleTitle(ruleId: string): string {
  if (RULE_TITLES[ruleId]) return RULE_TITLES[ruleId];
  return ruleId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const IssuesPanel: React.FC<IssuesPanelProps> = ({
  project,
  issues,
  selectedIssue,
  onSelectIssue,
}) => {
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const errors = useMemo(() => issues.filter((i) => i.severity === "error"), [issues]);
  const warnings = useMemo(() => issues.filter((i) => i.severity === "warning"), [issues]);

  const filteredIssues = useMemo(() => {
    let list = issues;
    if (filter === "error") {
      list = errors;
    } else if (filter === "warning") {
      list = warnings;
    }

    if (!searchQuery.trim()) {
      return list;
    }

    const q = searchQuery.toLowerCase().trim();
    return list.filter((i) => {
      const title = getFriendlyRuleTitle(i.ruleId).toLowerCase();
      const msg = i.message.toLowerCase();
      const rule = i.ruleId.toLowerCase();
      const node = i.nodeId ? project.nodes.find((n) => n.id === i.nodeId)?.title.toLowerCase() : "";
      return title.includes(q) || msg.includes(q) || rule.includes(q) || Boolean(node && node.includes(q));
    });
  }, [issues, errors, warnings, filter, searchQuery, project.nodes]);

  function isSelected(issue: Issue): boolean {
    if (!selectedIssue) return false;
    if (issue.location && selectedIssue.location) {
      return (
        issue.ruleId === selectedIssue.ruleId &&
        issue.location.edgeId === selectedIssue.location.edgeId &&
        issue.location.start === selectedIssue.location.start
      );
    }
    return (
      issue.ruleId === selectedIssue.ruleId &&
      issue.nodeId === selectedIssue.nodeId &&
      issue.variableId === selectedIssue.variableId &&
      issue.entityId === selectedIssue.entityId
    );
  }

  function getTarget(issue: Issue): { type: string; label: string } | null {
    if (issue.nodeId) {
      const node = project.nodes.find((n) => n.id === issue.nodeId);
      return {
        type: "node",
        label: node ? `"${node.title}"` : issue.nodeId,
      };
    }
    if (issue.location?.edgeId) {
      const edge = project.edges.find((e) => e.id === issue.location?.edgeId);
      if (edge) {
        const fromNode = project.nodes.find((n) => n.id === edge.from);
        const toNode = project.nodes.find((n) => n.id === edge.to);
        return {
          type: "edge",
          label: `${fromNode?.title ?? edge.from} → ${toNode?.title ?? edge.to}`,
        };
      }
      return {
        type: "edge",
        label: issue.location.edgeId,
      };
    }
    if (issue.variableId) {
      const v = project.variables.find((v) => v.id === issue.variableId);
      return {
        type: "var",
        label: v ? `$${v.name}` : issue.variableId,
      };
    }
    if (issue.entityId) {
      const ent = (project.entities ?? []).find((e) => e.id === issue.entityId);
      return {
        type: "entity",
        label: ent ? `@${ent.name}` : issue.entityId,
      };
    }
    return null;
  }

  function renderSnippet(issue: Issue) {
    const snippet = getIssueSnippet(project, issue);
    if (!snippet) return null;

    const before = snippet.text.slice(0, snippet.start);
    const highlighted = snippet.text.slice(snippet.start, snippet.end);
    const after = snippet.text.slice(snippet.end);

    return (
      <div className="snippet-box">
        <span className="snippet-field">
          {issue.location?.field}
          {issue.location?.effectIndex !== undefined ? `[${issue.location.effectIndex}]` : ""}:
        </span>
        <code>
          {before}
          <mark className="span-highlight">{highlighted || " "}</mark>
          {after}
        </code>
      </div>
    );
  }

  return (
    <aside className="issues-panel" aria-label="Consistency Checker Issues">
      <div className="issues-header">
        <div className="issues-header-top">
          <h2 className="issues-title">Issues</h2>
          <div className="issues-summary-badges">
            <span className="badge badge-error" title={`${errors.length} error(s)`}>
              {errors.length} {errors.length === 1 ? "Error" : "Errors"}
            </span>
            <span className="badge badge-warning" title={`${warnings.length} warning(s)`}>
              {warnings.length} {warnings.length === 1 ? "Warning" : "Warnings"}
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="issues-filter-tabs" role="tablist" aria-label="Filter issues by severity">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`filter-tab-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({issues.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "error"}
            className={`filter-tab-btn ${filter === "error" ? "active" : ""}`}
            onClick={() => setFilter("error")}
          >
            Errors ({errors.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "warning"}
            className={`filter-tab-btn ${filter === "warning" ? "active" : ""}`}
            onClick={() => setFilter("warning")}
          >
            Warnings ({warnings.length})
          </button>
        </div>

        {/* Search */}
        {issues.length > 3 && (
          <div className="issues-search-bar">
            <input
              type="text"
              className="field-input issues-search-input"
              placeholder="Search issues, rules, or scenes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter issues"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear issue search"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      <div className="issues-scroll">
        {issues.length === 0 ? (
          <div className="empty-state-card issues-clean-card">
            <span className="clean-icon" aria-hidden="true">✓</span>
            <h4 className="clean-title">All Rules Passing</h4>
            <p className="clean-desc">
              No narrative dead ends, unreachable scenes, or DSL syntax errors found in this story.
            </p>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="empty-state-card">
            <p className="empty-state">No matching issues</p>
            <p className="empty-substate">Try clearing your search query or switching filters.</p>
          </div>
        ) : (
          <div className="issues-list" role="list">
            {filteredIssues.map((issue, idx) => {
              const target = getTarget(issue);
              const friendlyTitle = getFriendlyRuleTitle(issue.ruleId);
              const selected = isSelected(issue);

              return (
                <div
                  key={`issue-${issue.ruleId}-${issue.nodeId ?? ""}-${issue.entityId ?? ""}-${issue.location?.edgeId ?? ""}-${idx}`}
                  className={`issue-card severity-${issue.severity} ${selected ? "active" : ""}`}
                  onClick={() => onSelectIssue(issue)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onSelectIssue(issue)}
                  aria-label={`${issue.severity}: ${friendlyTitle}. ${issue.message}`}
                >
                  <div className="issue-card-top">
                    <div className="issue-title-group">
                      <span className={`rule-tag tag-${issue.severity}`}>
                        {issue.severity.toUpperCase()}
                      </span>
                      <strong className="issue-friendly-title">{friendlyTitle}</strong>
                    </div>
                    {target && (
                      <span className="target-tag" title={`${target.type}: ${target.label}`}>
                        {target.label}
                      </span>
                    )}
                  </div>
                  <p className="issue-message">{issue.message}</p>
                  <span className="issue-rule-code" title="Diagnostic rule ID">
                    {issue.ruleId}
                  </span>
                  {renderSnippet(issue)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
