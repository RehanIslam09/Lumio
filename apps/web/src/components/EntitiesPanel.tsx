import React, { useMemo } from "react";
import type { Issue, Project, Entity, EntityKind } from "@repo/schema";
import { sortedEntities, speakerUsage, duplicateNameIds } from "../lib/entities.js";
import { makeEntity } from "../lib/defaults.js";
import { DraftField } from "./DraftField.js";

interface EntitiesPanelProps {
  project: Project;
  expandedEntityId: string | null;
  onToggleExpandEntity: (id: string | null) => void;
  entityIssues: Map<string, Issue[]>;
  onAddEntity: (entity: Entity) => void;
  onUpdateEntity: (
    id: string,
    patch: { name?: string; kind?: EntityKind; description?: string | null },
  ) => void;
  onDeleteEntity: (id: string) => void;
  onSelectNode: (id: string) => void;
}

export const EntitiesPanel: React.FC<EntitiesPanelProps> = ({
  project,
  expandedEntityId,
  onToggleExpandEntity,
  entityIssues,
  onAddEntity,
  onUpdateEntity,
  onDeleteEntity,
  onSelectNode,
}) => {
  const [kindFilter, setKindFilter] = React.useState<"all" | EntityKind>("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  const projectEntities = project.entities;
  const projectNodes = project.nodes;

  // Performance memoization (Amendment 7):
  // sortedEntities keyed on project.entities identity.
  // speakerUsage keyed on project.nodes identity.
  const entities = useMemo(() => sortedEntities(projectEntities), [projectEntities]);
  const usage = useMemo(() => speakerUsage(projectNodes), [projectNodes]);
  const duplicateIds = useMemo(() => duplicateNameIds(projectEntities), [projectEntities]);

  const characterCount = useMemo(() => entities.filter((e) => e.kind === "character").length, [entities]);
  const locationCount = useMemo(() => entities.filter((e) => e.kind === "location").length, [entities]);
  const itemCount = useMemo(() => entities.filter((e) => e.kind === "item").length, [entities]);

  const filteredEntities = useMemo(() => {
    let list = entities;
    if (kindFilter !== "all") {
      list = list.filter((e) => e.kind === kindFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || (e.description && e.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [entities, kindFilter, searchQuery]);

  const handleAdd = (kind: EntityKind) => {
    const existing = project.entities ?? [];
    const newEntity = makeEntity(kind, existing);
    onAddEntity(newEntity);
    onToggleExpandEntity(newEntity.id);
  };

  const handleDelete = (entity: Entity) => {
    const affectedNodeIds = usage.get(entity.id) ?? [];
    const count = affectedNodeIds.length;
    let message = `Delete entity "${entity.name}"?`;
    if (count > 0) {
      message = `Delete "${entity.name}"? It is used as speaker by ${count} node(s). Those speakers will be cleared.`;
    }
    const ok = window.confirm(message);
    if (ok) {
      onDeleteEntity(entity.id);
    }
  };

  return (
    <div className="entities-panel" aria-label="Entities management">
      <div className="entities-header">
        <div className="entities-header-info">
          <h3>Entities</h3>
          <span className="count-badge">{entities.length}</span>
        </div>
        <div className="entities-add-buttons">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => handleAdd("character")}
            title="Add character entity"
          >
            + Character
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => handleAdd("location")}
            title="Add location entity"
          >
            + Location
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => handleAdd("item")}
            title="Add item entity"
          >
            + Item
          </button>
        </div>
      </div>

      {/* Kind Filter Tabs */}
      {entities.length > 0 && (
        <div className="entities-filter-bar">
          <div className="issues-filter-tabs" role="tablist" aria-label="Filter entities by kind">
            <button
              type="button"
              role="tab"
              aria-selected={kindFilter === "all"}
              className={`filter-tab-btn ${kindFilter === "all" ? "active" : ""}`}
              onClick={() => setKindFilter("all")}
            >
              All ({entities.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kindFilter === "character"}
              className={`filter-tab-btn ${kindFilter === "character" ? "active" : ""}`}
              onClick={() => setKindFilter("character")}
            >
              Characters ({characterCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kindFilter === "location"}
              className={`filter-tab-btn ${kindFilter === "location" ? "active" : ""}`}
              onClick={() => setKindFilter("location")}
            >
              Locations ({locationCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kindFilter === "item"}
              className={`filter-tab-btn ${kindFilter === "item" ? "active" : ""}`}
              onClick={() => setKindFilter("item")}
            >
              Items ({itemCount})
            </button>
          </div>
        </div>
      )}

      {entities.length > 3 && (
        <div className="issues-search-bar" style={{ padding: "0 16px" }}>
          <input
            type="text"
            className="field-input issues-search-input"
            placeholder="Search entities by name or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter entities"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              aria-label="Clear entity search"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="entities-list">
        {entities.length === 0 ? (
          <div className="empty-state-card">
            <p className="empty-state">No entities in this story</p>
            <p className="empty-substate">Add characters, locations, or items to build your cast and world lore.</p>
          </div>
        ) : filteredEntities.length === 0 ? (
          <div className="empty-state-card">
            <p className="empty-state">No matching entities</p>
            <p className="empty-substate">Try clearing your search query or switching filters.</p>
          </div>
        ) : (
          filteredEntities.map((entity) => {
            const isExpanded = entity.id === expandedEntityId;
            const nodeIds = usage.get(entity.id) ?? [];
            const isDuplicate = duplicateIds.has(entity.id);
            const issuesForEntity = entityIssues.get(entity.id) ?? [];

            return (
              <div
                key={entity.id}
                className={`entity-card ${isExpanded ? "expanded" : ""}`}
                data-testid={`entity-card-${entity.id}`}
              >
                {/* Collapsed header row: contains no textareas or inputs */}
                <div
                  className="entity-card-header"
                  onClick={() => onToggleExpandEntity(isExpanded ? null : entity.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleExpandEntity(isExpanded ? null : entity.id);
                    }
                  }}
                  aria-expanded={isExpanded}
                  aria-label={`${entity.kind} ${entity.name}`}
                >
                  <div className="entity-summary">
                    <span className={`entity-kind-badge kind-${entity.kind}`}>
                      {entity.kind}
                    </span>
                    <span className="entity-name-display">{entity.name}</span>
                    {entity.kind === "character" && nodeIds.length > 0 && (
                      <span className="entity-usage-badge" title={`Used by ${nodeIds.length} node(s)`}>
                        {nodeIds.length} {nodeIds.length === 1 ? "node" : "nodes"}
                      </span>
                    )}
                    {issuesForEntity.length > 0 && (
                      <span
                        className="entity-issues-badge"
                        title={`${issuesForEntity.length} issue(s)`}
                      >
                        {issuesForEntity.length} {issuesForEntity.length === 1 ? "issue" : "issues"}
                      </span>
                    )}
                  </div>
                  <span className="entity-expand-icon" aria-hidden="true">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </div>

                {/* Only the expanded row renders inputs and textareas (Amendment 7) */}
                {isExpanded && (
                  <div className="entity-card-body">
                    {issuesForEntity.length > 0 && (
                      <div className="entity-issues-list" aria-label="Entity issues">
                        {issuesForEntity.map((issue, idx) => (
                          <div
                            key={`ent-issue-${issue.ruleId}-${issue.entityId}-${idx}`}
                            className="entity-issue-item"
                          >
                            <span className="rule-tag tag-warning">{issue.ruleId}</span>
                            <span className="issue-msg">{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isDuplicate && (
                      <div className="duplicate-name-note" role="note">
                        ⚠️ Another {entity.kind} shares this name
                      </div>
                    )}

                    <DraftField
                      key={`entity-name-${entity.id}`}
                      id={`entity-name-${entity.id}`}
                      label="Name"
                      value={entity.name}
                      onCommit={(nextName) => {
                        if (nextName !== entity.name) {
                          onUpdateEntity(entity.id, { name: nextName });
                        }
                      }}
                    />

                    <div className="field-group">
                      <label htmlFor={`entity-kind-${entity.id}`} className="field-label">
                        Kind
                      </label>
                      <select
                        id={`entity-kind-${entity.id}`}
                        className="field-select"
                        value={entity.kind}
                        onChange={(e) => {
                          const nextKind = e.target.value as EntityKind;
                          if (nextKind !== entity.kind) {
                            onUpdateEntity(entity.id, { kind: nextKind });
                          }
                        }}
                      >
                        <option value="character">character</option>
                        <option value="location">location</option>
                        <option value="item">item</option>
                      </select>
                    </div>

                    <DraftField
                      key={`entity-desc-${entity.id}`}
                      id={`entity-desc-${entity.id}`}
                      label="Description"
                      value={entity.description ?? ""}
                      multiline
                      rows={3}
                      placeholder="Optional entity lore or description..."
                      onCommit={(nextDesc) => {
                        const trimmed = nextDesc.trim();
                        onUpdateEntity(entity.id, {
                          description: trimmed === "" ? null : nextDesc,
                        });
                      }}
                    />

                    {entity.kind === "character" && nodeIds.length > 0 && (
                      <div className="entity-used-by-section">
                        <span className="used-by-title">Used by nodes ({nodeIds.length}):</span>
                        <div className="used-by-list">
                          {nodeIds.slice(0, 20).map((nid) => {
                            const node = project.nodes.find((n) => n.id === nid);
                            return (
                              <button
                                key={nid}
                                type="button"
                                className="node-link-btn"
                                onClick={() => onSelectNode(nid)}
                                title={`Select node "${node?.title ?? nid}" on canvas`}
                              >
                                {node ? node.title : nid}
                              </button>
                            );
                          })}
                          {nodeIds.length > 20 && (
                            <span className="used-by-more">
                              and {nodeIds.length - 20} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="entity-actions-row">
                      <button
                        type="button"
                        className="btn btn-danger btn-xs"
                        onClick={() => handleDelete(entity)}
                      >
                        Delete entity
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
