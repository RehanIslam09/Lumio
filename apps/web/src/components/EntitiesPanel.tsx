import React, { useState, useMemo } from "react";
import type { Project, Entity, EntityKind } from "@repo/schema";
import { sortedEntities, speakerUsage, duplicateNameIds } from "../lib/entities.js";
import { makeEntity } from "../lib/defaults.js";
import { DraftField } from "./DraftField.js";

interface EntitiesPanelProps {
  project: Project;
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
  onAddEntity,
  onUpdateEntity,
  onDeleteEntity,
  onSelectNode,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const projectEntities = project.entities;
  const projectNodes = project.nodes;

  // Performance memoization (Amendment 7):
  // sortedEntities keyed on project.entities identity.
  // speakerUsage keyed on project.nodes identity.
  const entities = useMemo(() => sortedEntities(projectEntities), [projectEntities]);
  const usage = useMemo(() => speakerUsage(projectNodes), [projectNodes]);
  const duplicateIds = useMemo(() => duplicateNameIds(projectEntities), [projectEntities]);

  const handleAdd = (kind: EntityKind) => {
    const existing = project.entities ?? [];
    const newEntity = makeEntity(kind, existing);
    onAddEntity(newEntity);
    setExpandedId(newEntity.id);
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

      <div className="entities-list">
        {entities.length === 0 ? (
          <p className="empty-state">No entities in this project. Add characters, locations, or items to build your cast and world.</p>
        ) : (
          entities.map((entity) => {
            const isExpanded = entity.id === expandedId;
            const nodeIds = usage.get(entity.id) ?? [];
            const isDuplicate = duplicateIds.has(entity.id);

            return (
              <div
                key={entity.id}
                className={`entity-card ${isExpanded ? "expanded" : ""}`}
                data-testid={`entity-card-${entity.id}`}
              >
                {/* Collapsed header row: contains no textareas or inputs */}
                <div
                  className="entity-card-header"
                  onClick={() => setExpandedId(isExpanded ? null : entity.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(isExpanded ? null : entity.id);
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
                  </div>
                  <span className="entity-expand-icon" aria-hidden="true">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </div>

                {/* Only the expanded row renders inputs and textareas (Amendment 7) */}
                {isExpanded && (
                  <div className="entity-card-body">
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
                          {nodeIds.slice(0, 20).map((nid) => (
                            <button
                              key={nid}
                              type="button"
                              className="node-link-btn"
                              onClick={() => onSelectNode(nid)}
                              title={`Select node ${nid} on canvas`}
                            >
                              {nid}
                            </button>
                          ))}
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
