import React, { useState } from "react";
import type { Variable, VariableType, Issue } from "@repo/schema";

interface VariablesPanelProps {
  variables: Variable[];
  variableIssues: Map<string, Issue[]>;
  onAddVariable: () => void;
  onUpdateVariable: (
    id: string,
    patch: { name?: string; type?: VariableType; initial?: Variable["initial"] | null },
  ) => void;
  onDeleteVariable: (id: string) => void;
}

export const VariablesPanel: React.FC<VariablesPanelProps> = ({
  variables,
  variableIssues,
  onAddVariable,
  onUpdateVariable,
  onDeleteVariable,
}) => {
  return (
    <div className="variables-panel" aria-label="Variables management">
      <div className="variables-header">
        <div className="variables-header-info">
          <h3>Declared Variables</h3>
          <span className="count-badge">{variables.length}</span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onAddVariable}
        >
          + Add variable
        </button>
      </div>

      <div className="variables-list">
        {variables.length === 0 ? (
          <p className="empty-state">No variables declared in this project.</p>
        ) : (
          variables.map((variable) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              issues={variableIssues.get(variable.id) ?? []}
              onUpdate={onUpdateVariable}
              onDelete={onDeleteVariable}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface VariableRowProps {
  variable: Variable;
  issues: Issue[];
  onUpdate: (
    id: string,
    patch: { name?: string; type?: VariableType; initial?: Variable["initial"] | null },
  ) => void;
  onDelete: (id: string) => void;
}

const VariableRow: React.FC<VariableRowProps> = ({
  variable,
  issues,
  onUpdate,
  onDelete,
}) => {
  const [nameDraft, setNameDraft] = useState(variable.name);
  const [numInitialDraft, setNumInitialDraft] = useState(
    typeof variable.initial === "number" ? String(variable.initial) : "0",
  );
  const [strInitialDraft, setStrInitialDraft] = useState(
    typeof variable.initial === "string" ? variable.initial : "",
  );

  const [prevName, setPrevName] = useState(variable.name);
  if (variable.name !== prevName) {
    setPrevName(variable.name);
    setNameDraft(variable.name);
  }

  const [prevInitial, setPrevInitial] = useState(variable.initial);
  if (variable.initial !== prevInitial) {
    setPrevInitial(variable.initial);
    if (typeof variable.initial === "number") {
      setNumInitialDraft(String(variable.initial));
    }
    if (typeof variable.initial === "string") {
      setStrInitialDraft(variable.initial);
    }
  }

  const handleCommitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed !== "" && trimmed !== variable.name) {
      onUpdate(variable.id, { name: trimmed });
    } else {
      setNameDraft(variable.name);
    }
  };

  const handleCommitNumInitial = () => {
    const parsed = Number(numInitialDraft);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed !== variable.initial) {
      onUpdate(variable.id, { initial: parsed });
    } else {
      setNumInitialDraft(typeof variable.initial === "number" ? String(variable.initial) : "0");
    }
  };

  const handleCommitStrInitial = () => {
    if (strInitialDraft !== variable.initial) {
      onUpdate(variable.id, { initial: strInitialDraft });
    }
  };

  return (
    <div className={`variable-card ${issues.length > 0 ? "has-issues" : ""}`}>
      <div className="variable-row-top">
        <div className="field-group var-name-group">
          <label htmlFor={`var-name-${variable.id}`} className="field-label">Name</label>
          <input
            id={`var-name-${variable.id}`}
            type="text"
            className="field-input var-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={handleCommitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCommitName();
              } else if (e.key === "Escape") {
                setNameDraft(variable.name);
              }
            }}
          />
        </div>

        <div className="field-group var-type-group">
          <label htmlFor={`var-type-${variable.id}`} className="field-label">Type</label>
          <select
            id={`var-type-${variable.id}`}
            className="field-select var-type-select"
            value={variable.type}
            onChange={(e) => {
              const newType = e.target.value as VariableType;
              onUpdate(variable.id, { type: newType });
            }}
          >
            <option value="number">number</option>
            <option value="string">string</option>
            <option value="boolean">boolean</option>
          </select>
        </div>

        <button
          type="button"
          className="btn btn-danger-outline btn-sm btn-var-delete"
          onClick={() => onDelete(variable.id)}
          title={`Delete variable ${variable.name}`}
          aria-label={`Delete variable ${variable.name}`}
        >
          ×
        </button>
      </div>

      <div className="variable-row-bottom">
        <div className="field-group var-initial-group">
          <label className="field-label">Initial Value</label>
          {variable.initial === undefined ? (
            <div className="initial-none-row">
              <span className="text-muted">None</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  let defaultInitial: number | string | boolean = 0;
                  if (variable.type === "string") defaultInitial = "";
                  if (variable.type === "boolean") defaultInitial = false;
                  onUpdate(variable.id, { initial: defaultInitial });
                }}
              >
                Set initial
              </button>
            </div>
          ) : (
            <div className="initial-control-row">
              {variable.type === "number" && (
                <input
                  type="number"
                  className="field-input var-initial-input"
                  value={numInitialDraft}
                  onChange={(e) => setNumInitialDraft(e.target.value)}
                  onBlur={handleCommitNumInitial}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCommitNumInitial();
                    } else if (e.key === "Escape") {
                      setNumInitialDraft(String(variable.initial));
                    }
                  }}
                  aria-label={`Initial value for ${variable.name}`}
                />
              )}

              {variable.type === "string" && (
                <input
                  type="text"
                  className="field-input var-initial-input"
                  value={strInitialDraft}
                  onChange={(e) => setStrInitialDraft(e.target.value)}
                  onBlur={handleCommitStrInitial}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCommitStrInitial();
                    } else if (e.key === "Escape") {
                      setStrInitialDraft(String(variable.initial));
                    }
                  }}
                  aria-label={`Initial value for ${variable.name}`}
                />
              )}

              {variable.type === "boolean" && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(variable.initial)}
                    onChange={(e) => onUpdate(variable.id, { initial: e.target.checked })}
                  />
                  <span>{variable.initial ? "true" : "false"}</span>
                </label>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onUpdate(variable.id, { initial: null })}
                title="Remove initial value"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="variable-issues">
          {issues.map((issue, idx) => (
            <div key={idx} className="var-issue-item">
              <span className="rule-tag tag-warning">{issue.ruleId}</span>
              <span className="var-issue-message">{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
