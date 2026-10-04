import React from "react";
import type { Project } from "@repo/schema";
import { DraftField } from "./DraftField.js";
import { checkEffectDraft } from "../lib/draftCheck.js";

interface EdgeEffectsSectionProps {
  effects: readonly string[];
  variables: Project["variables"];
  onUpdateEffects: (effects: string[] | null) => void;
}

export const EdgeEffectsSection: React.FC<EdgeEffectsSectionProps> = ({
  effects,
  variables,
  onUpdateEffects,
}) => {
  return (
    <div className="effects-section">
      <div className="effects-header">
        <label className="field-label">Effects ({effects.length})</label>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            onUpdateEffects([...effects, ""]);
          }}
        >
          + Add effect
        </button>
      </div>

      {effects.length === 0 ? (
        <p className="empty-substate">No effects configured for this edge.</p>
      ) : (
        <div className="effects-list">
          {effects.map((effectStr, idx) => (
            <div key={idx} className="effect-row">
              <div className="effect-input-wrapper">
                <DraftField
                  id={`inspect-edge-effect-${idx}`}
                  label={`Effect ${idx + 1}`}
                  value={effectStr}
                  placeholder="e.g. gold -= 10"
                  checkDraft={(draft) => checkEffectDraft(draft, variables)}
                  onCommit={(nextEffect) => {
                    const trimmed = nextEffect.trim();
                    const nextList = [...effects];
                    nextList[idx] = trimmed;
                    onUpdateEffects(nextList);
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-danger-outline btn-sm btn-remove-effect"
                onClick={() => {
                  const nextList = effects.filter((_, i) => i !== idx);
                  onUpdateEffects(nextList.length > 0 ? nextList : null);
                }}
                title="Remove this effect"
                aria-label={`Remove effect ${idx + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
