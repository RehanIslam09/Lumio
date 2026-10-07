import React from "react";
import type { Issue, Project } from "@repo/schema";
import { getIssueSnippet } from "../lib/snippet.js";

interface IssuesPanelProps {
  project: Project;
  issues: Issue[];
  selectedIssue: Issue | null;
  onSelectIssue: (issue: Issue) => void;
}

export const IssuesPanel: React.FC<IssuesPanelProps> = ({
  project,
  issues,
  selectedIssue,
  onSelectIssue,
}) => {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const variableIssues = issues.filter((i) => i.variableId !== undefined);

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
        <h2>Consistency Issues</h2>
        <div className="issues-summary-badges">
          <span className="badge badge-error">{errors.length} Errors</span>
          <span className="badge badge-warning">{warnings.length} Warnings</span>
        </div>
      </div>

      <div className="issues-scroll">
        {issues.length === 0 ? (
          <div className="empty-state">No consistency issues found. All rules pass!</div>
        ) : (
          <>
            {/* Errors */}
            <section className="issue-section" aria-labelledby="heading-errors">
              <h3 id="heading-errors" className="section-title text-error">
                Errors ({errors.length})
              </h3>
              {errors.map((issue, idx) => (
                <div
                  key={`err-${issue.ruleId}-${issue.nodeId ?? ""}-${issue.entityId ?? ""}-${issue.location?.edgeId ?? ""}-${idx}`}
                  className={`issue-card severity-error ${isSelected(issue) ? "active" : ""}`}
                  onClick={() => onSelectIssue(issue)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onSelectIssue(issue)}
                >
                  <div className="issue-card-top">
                    <span className="rule-tag tag-error">{issue.ruleId}</span>
                    {issue.nodeId && <span className="target-tag">node: {issue.nodeId}</span>}
                    {issue.entityId && <span className="target-tag">entity: {issue.entityId}</span>}
                    {issue.location && <span className="target-tag">edge: {issue.location.edgeId}</span>}
                  </div>
                  <p className="issue-message">{issue.message}</p>
                  {renderSnippet(issue)}
                </div>
              ))}
            </section>

            {/* Warnings */}
            <section className="issue-section" aria-labelledby="heading-warnings">
              <h3 id="heading-warnings" className="section-title text-warning">
                Warnings ({warnings.length})
              </h3>
              {warnings.map((issue, idx) => (
                <div
                  key={`warn-${issue.ruleId}-${issue.nodeId ?? ""}-${issue.variableId ?? ""}-${issue.entityId ?? ""}-${idx}`}
                  className={`issue-card severity-warning ${isSelected(issue) ? "active" : ""}`}
                  onClick={() => onSelectIssue(issue)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onSelectIssue(issue)}
                >
                  <div className="issue-card-top">
                    <span className="rule-tag tag-warning">{issue.ruleId}</span>
                    {issue.nodeId && <span className="target-tag">node: {issue.nodeId}</span>}
                    {issue.variableId && <span className="target-tag">var: {issue.variableId}</span>}
                    {issue.entityId && <span className="target-tag">entity: {issue.entityId}</span>}
                  </div>
                  <p className="issue-message">{issue.message}</p>
                  {renderSnippet(issue)}
                </div>
              ))}
            </section>

            {/* Variables Section */}
            <section className="issue-section" aria-labelledby="heading-variables">
              <h3 id="heading-variables" className="section-title text-variable">
                Variable Issues ({variableIssues.length})
              </h3>
              {variableIssues.length === 0 ? (
                <div className="empty-substate">
                  No variable issues (or suppressed due to syntax error).
                </div>
              ) : (
                variableIssues.map((issue, idx) => (
                  <div
                    key={`var-issue-${issue.ruleId}-${issue.variableId}-${idx}`}
                    className={`issue-card severity-variable ${isSelected(issue) ? "active" : ""}`}
                    onClick={() => onSelectIssue(issue)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onSelectIssue(issue)}
                  >
                    <div className="issue-card-top">
                      <span className="rule-tag tag-variable">{issue.ruleId}</span>
                      <span className="target-tag">id: {issue.variableId}</span>
                    </div>
                    <p className="issue-message">{issue.message}</p>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
};
