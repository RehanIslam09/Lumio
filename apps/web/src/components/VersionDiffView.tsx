import React, { useState } from "react";
import type { VersionSummaryDto } from "../api/types.js";
import type { ProjectDiff, DiffLine } from "../lib/diff.js";

export interface VersionDiffViewProps {
  versionA: number;
  versionB: number;
  versionsList: VersionSummaryDto[];
  diff: ProjectDiff;
  onSelectVersions: (vA: number, vB: number) => void;
  onBack: () => void;
}

export type DiffFilter = "all" | "narrative" | "structure";

export const VersionDiffView: React.FC<VersionDiffViewProps> = ({
  versionA,
  versionB,
  versionsList,
  diff,
  onSelectVersions,
  onBack,
}) => {
  const [filter, setFilter] = useState<DiffFilter>("all");

  // Sorted versions ascending for dropdowns
  const sortedVersions = [...versionsList].sort((a, b) => a.versionNumber - b.versionNumber);

  const handleSelectA = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextA = Number(e.target.value);
    if (nextA !== versionA) {
      onSelectVersions(nextA, versionB);
    }
  };

  const handleSelectB = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextB = Number(e.target.value);
    if (nextB !== versionB) {
      onSelectVersions(versionA, nextB);
    }
  };

  // Filtered lists
  const filteredNodes = diff.nodes.filter((n) => {
    if (n.type === "unchanged") return false;
    if (filter === "narrative") return n.hasNarrativeChange;
    if (filter === "structure") return n.type === "added" || n.type === "removed" || n.hasLayoutChange;
    return true;
  });

  const filteredEdges = diff.edges.filter((e) => {
    if (e.type === "unchanged") return false;
    if (filter === "narrative") return e.hasNarrativeChange;
    if (filter === "structure") return e.type === "added" || e.type === "removed" || e.hasStructuralChange;
    return true;
  });

  const filteredEntities = diff.entities.filter((ent) => {
    if (ent.type === "unchanged") return false;
    if (filter === "structure") return false;
    return true;
  });

  const filteredVariables = diff.variables.filter((v) => {
    if (v.type === "unchanged") return false;
    if (filter === "structure") return false;
    return true;
  });

  const showProjectName = diff.projectName.changed && filter !== "structure";
  const hasFilteredChanges =
    showProjectName ||
    filteredNodes.length > 0 ||
    filteredEdges.length > 0 ||
    filteredEntities.length > 0 ||
    filteredVariables.length > 0;

  return (
    <div className="version-diff-view" role="region" aria-label="Version comparison view">
      {/* Top Header & Navigation */}
      <div className="diff-top-bar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onBack}
          aria-label="Back to Version List"
        >
          ← Back to Version List
        </button>

        <div className="diff-selectors">
          <label className="diff-selector-label" htmlFor="diff-select-older">
            Older:
            <select
              id="diff-select-older"
              className="field-select diff-select"
              value={versionA}
              onChange={handleSelectA}
            >
              {sortedVersions.map((v) => (
                <option key={v.versionNumber} value={v.versionNumber} disabled={v.versionNumber === versionB}>
                  v{v.versionNumber} {v.versionNumber === versionA ? "(Older)" : ""}
                </option>
              ))}
            </select>
          </label>

          <span className="diff-arrow" aria-hidden="true">→</span>

          <label className="diff-selector-label" htmlFor="diff-select-newer">
            Newer:
            <select
              id="diff-select-newer"
              className="field-select diff-select"
              value={versionB}
              onChange={handleSelectB}
            >
              {sortedVersions.map((v) => (
                <option key={v.versionNumber} value={v.versionNumber} disabled={v.versionNumber === versionA}>
                  v{v.versionNumber} {v.versionNumber === versionB ? "(Newer)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="diff-heading-row">
        <h3 className="diff-heading-title">
          Comparing v{versionA} (Older) → v{versionB} (Newer)
        </h3>

        {/* Change summary stats pills */}
        <div className="diff-summary-pills">
          {diff.summary.totalChanges === 0 ? (
            <span className="diff-pill diff-pill-neutral">0 changes</span>
          ) : (
            <>
              {diff.summary.nodesAdded > 0 && (
                <span className="diff-pill diff-pill-added">+{diff.summary.nodesAdded} nodes</span>
              )}
              {diff.summary.nodesRemoved > 0 && (
                <span className="diff-pill diff-pill-removed">-{diff.summary.nodesRemoved} nodes</span>
              )}
              {diff.summary.nodesModified > 0 && (
                <span className="diff-pill diff-pill-modified">~{diff.summary.nodesModified} nodes</span>
              )}
              {diff.summary.edgesAdded > 0 && (
                <span className="diff-pill diff-pill-added">+{diff.summary.edgesAdded} edges</span>
              )}
              {diff.summary.edgesRemoved > 0 && (
                <span className="diff-pill diff-pill-removed">-{diff.summary.edgesRemoved} edges</span>
              )}
              {diff.summary.edgesModified > 0 && (
                <span className="diff-pill diff-pill-modified">~{diff.summary.edgesModified} edges</span>
              )}
              {(diff.summary.entitiesAdded > 0 || diff.summary.entitiesModified > 0 || diff.summary.entitiesRemoved > 0) && (
                <span className="diff-pill diff-pill-neutral">
                  entities: +{diff.summary.entitiesAdded} ~{diff.summary.entitiesModified} -{diff.summary.entitiesRemoved}
                </span>
              )}
              {(diff.summary.variablesAdded > 0 || diff.summary.variablesModified > 0 || diff.summary.variablesRemoved > 0) && (
                <span className="diff-pill diff-pill-neutral">
                  vars: +{diff.summary.variablesAdded} ~{diff.summary.variablesModified} -{diff.summary.variablesRemoved}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="diff-filter-bar" role="tablist" aria-label="Diff categories">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={`diff-filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All Changes ({diff.summary.totalChanges})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "narrative"}
          className={`diff-filter-btn ${filter === "narrative" ? "active" : ""}`}
          onClick={() => setFilter("narrative")}
        >
          Narrative Only ({diff.summary.narrativeChanges})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "structure"}
          className={`diff-filter-btn ${filter === "structure" ? "active" : ""}`}
          onClick={() => setFilter("structure")}
        >
          Structure &amp; Layout ({diff.summary.structuralChanges + diff.summary.layoutChanges})
        </button>
      </div>

      {/* Comparison Body Content */}
      <div className="diff-content-scroll">
        {!hasFilteredChanges ? (
          <div className="diff-empty-state">
            <p>
              No differences found between v{versionA} and v{versionB}
              {filter !== "all" ? ` under the "${filter}" filter` : ""}.
            </p>
            <p className="diff-empty-sub">The story documents are identical in this view.</p>
          </div>
        ) : (
          <div className="diff-sections-list">
            {/* 1. Project Title */}
            {showProjectName && (
              <div className="diff-card">
                <div className="diff-card-header">
                  <span className="diff-type-badge badge-modified">Modified</span>
                  <span className="diff-card-title">Project Title</span>
                </div>
                <div className="diff-prop-row">
                  <span className="diff-prop-from">{diff.projectName.from}</span>
                  <span className="diff-prop-arrow">→</span>
                  <span className="diff-prop-to">{diff.projectName.to}</span>
                </div>
              </div>
            )}

            {/* 2. Nodes Section */}
            {filteredNodes.length > 0 && (
              <div className="diff-group">
                <h4 className="diff-group-title">Nodes ({filteredNodes.length})</h4>
                {filteredNodes.map((node) => (
                  <div key={node.id} className={`diff-card diff-card-${node.type}`}>
                    <div className="diff-card-header">
                      <span className={`diff-type-badge badge-${node.type}`}>
                        {node.type.toUpperCase()}
                      </span>
                      <span className="diff-card-title">
                        {node.title.to ?? node.title.from ?? node.id}
                      </span>
                      <span className="diff-card-id">({node.id})</span>
                    </div>

                    <div className="diff-card-body">
                      {node.title.changed && node.type === "modified" && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Title:</span>
                          <span className="diff-prop-from">{node.title.from}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{node.title.to}</span>
                        </div>
                      )}

                      {node.nodeType.changed && node.type === "modified" && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Type:</span>
                          <span className="diff-prop-from">{node.nodeType.from}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{node.nodeType.to}</span>
                        </div>
                      )}

                      {node.speakerId.changed && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Speaker:</span>
                          <span className="diff-prop-from">{node.speakerId.from ?? "(none)"}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{node.speakerId.to ?? "(none)"}</span>
                        </div>
                      )}

                      {node.position.changed && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Position:</span>
                          <span className="diff-prop-from">
                            {node.position.from ? `(${Math.round(node.position.from.x)}, ${Math.round(node.position.from.y)})` : "(none)"}
                          </span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">
                            {node.position.to ? `(${Math.round(node.position.to.x)}, ${Math.round(node.position.to.y)})` : "(none)"}
                          </span>
                        </div>
                      )}

                      {node.body.changed && node.body.lines && node.body.lines.length > 0 && (
                        <div className="diff-body-section">
                          <span className="diff-prop-label">Narrative Body:</span>
                          <div className="diff-lines-container" role="region" aria-label={`Body diff for ${node.id}`}>
                            {node.body.lines.map((line: DiffLine, idx: number) => (
                              <div key={idx} className={`diff-line diff-line-${line.type}`}>
                                <span className="diff-line-marker" aria-hidden="true">
                                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                                </span>
                                <span className="diff-line-text">{line.text || " "}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. Edges Section */}
            {filteredEdges.length > 0 && (
              <div className="diff-group">
                <h4 className="diff-group-title">Edges ({filteredEdges.length})</h4>
                {filteredEdges.map((edge) => (
                  <div key={edge.id} className={`diff-card diff-card-${edge.type}`}>
                    <div className="diff-card-header">
                      <span className={`diff-type-badge badge-${edge.type}`}>
                        {edge.type.toUpperCase()}
                      </span>
                      <span className="diff-card-title">
                        {edge.from.to ?? edge.from.from} → {edge.to.to ?? edge.to.from}
                      </span>
                      <span className="diff-card-id">({edge.id})</span>
                    </div>

                    <div className="diff-card-body">
                      {(edge.from.changed || edge.to.changed) && edge.type === "modified" && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Endpoints:</span>
                          <span className="diff-prop-from">{edge.from.from} → {edge.to.from}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{edge.from.to} → {edge.to.to}</span>
                        </div>
                      )}

                      {edge.condition.changed && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Condition:</span>
                          <span className="diff-prop-from">{edge.condition.from ?? "(none)"}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{edge.condition.to ?? "(none)"}</span>
                        </div>
                      )}

                      {edge.effects.changed && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Effects:</span>
                          <span className="diff-prop-from">
                            {edge.effects.from && edge.effects.from.length > 0 ? edge.effects.from.join(", ") : "(none)"}
                          </span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">
                            {edge.effects.to && edge.effects.to.length > 0 ? edge.effects.to.join(", ") : "(none)"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 4. Entities Section */}
            {filteredEntities.length > 0 && (
              <div className="diff-group">
                <h4 className="diff-group-title">Entities ({filteredEntities.length})</h4>
                {filteredEntities.map((ent) => (
                  <div key={ent.id} className={`diff-card diff-card-${ent.type}`}>
                    <div className="diff-card-header">
                      <span className={`diff-type-badge badge-${ent.type}`}>
                        {ent.type.toUpperCase()}
                      </span>
                      <span className="diff-card-title">
                        {ent.name.to ?? ent.name.from}
                      </span>
                      <span className="diff-card-id">({ent.kind.to ?? ent.kind.from})</span>
                    </div>
                    <div className="diff-card-body">
                      {ent.name.changed && ent.type === "modified" && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Name:</span>
                          <span className="diff-prop-from">{ent.name.from}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{ent.name.to}</span>
                        </div>
                      )}
                      {ent.description.changed && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Description:</span>
                          <span className="diff-prop-from">{ent.description.from ?? "(none)"}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{ent.description.to ?? "(none)"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 5. Variables Section */}
            {filteredVariables.length > 0 && (
              <div className="diff-group">
                <h4 className="diff-group-title">Variables ({filteredVariables.length})</h4>
                {filteredVariables.map((v) => (
                  <div key={v.id} className={`diff-card diff-card-${v.type}`}>
                    <div className="diff-card-header">
                      <span className={`diff-type-badge badge-${v.type}`}>
                        {v.type.toUpperCase()}
                      </span>
                      <span className="diff-card-title">{v.name.to ?? v.name.from}</span>
                      <span className="diff-card-id">({v.varType.to ?? v.varType.from})</span>
                    </div>
                    <div className="diff-card-body">
                      {v.initial.changed && (
                        <div className="diff-prop-row">
                          <span className="diff-prop-label">Initial:</span>
                          <span className="diff-prop-from">{String(v.initial.from ?? "(none)")}</span>
                          <span className="diff-prop-arrow">→</span>
                          <span className="diff-prop-to">{String(v.initial.to ?? "(none)")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
