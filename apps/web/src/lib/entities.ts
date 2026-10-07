import {
  type Project,
  type FlowNode,
  type Entity,
  getEntities,
  countCodePoints,
  MAX_NODE_BODY_CODE_POINTS,
} from "@repo/schema";

/**
 * Computes entityId -> nodeId[] mapping in O(nodes).
 */
export function speakerUsage(input: Project | readonly FlowNode[]): Map<string, string[]> {
  const nodes = "nodes" in input ? input.nodes : input;
  const usage = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.speakerId) {
      const existing = usage.get(node.speakerId);
      if (existing) {
        existing.push(node.id);
      } else {
        usage.set(node.speakerId, [node.id]);
      }
    }
  }
  return usage;
}

const KIND_ORDER: Record<string, number> = {
  character: 1,
  location: 2,
  item: 3,
};

/**
 * Deterministically sorts entities by:
 * 1. Kind: character, location, item
 * 2. Name: case-insensitive
 * 3. ID: alphabetical
 */
export function sortedEntities(
  input?: Project | readonly Entity[],
): readonly Entity[] {
  if (input === undefined) return [];
  const entities: readonly Entity[] = "nodes" in input ? (input.entities ?? []) : input;
  return [...entities].sort((a, b) => {
    const kindA = KIND_ORDER[a.kind] ?? 99;
    const kindB = KIND_ORDER[b.kind] ?? 99;
    if (kindA !== kindB) return kindA - kindB;

    const nameComp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    if (nameComp !== 0) return nameComp;

    return a.id.localeCompare(b.id);
  });
}

export interface SpeakerOption {
  id: string;
  name: string;
  label: string;
}

/**
 * Returns selectable speaker options (characters only).
 * Disambiguates label with ID only if multiple characters share the same name.
 */
export function speakerOptions(project: Project): SpeakerOption[] {
  const characters = getEntities(project).filter((e) => e.kind === "character");
  const nameCounts = new Map<string, number>();

  for (const char of characters) {
    nameCounts.set(char.name, (nameCounts.get(char.name) ?? 0) + 1);
  }

  return characters.map((char) => {
    const isDuplicate = (nameCounts.get(char.name) ?? 0) > 1;
    return {
      id: char.id,
      name: char.name,
      label: isDuplicate ? `${char.name} (${char.id})` : char.name,
    };
  });
}

/**
 * Returns set of entity IDs that share a case-insensitive name with another entity of the same kind.
 */
export function duplicateNameIds(
  input?: Project | readonly Entity[],
): Set<string> {
  if (input === undefined) return new Set();
  const entities: readonly Entity[] = "nodes" in input ? (input.entities ?? []) : input;
  const duplicates = new Set<string>();
  const byKindAndName = new Map<string, Entity[]>();

  for (const entity of entities) {
    const key = `${entity.kind}:${entity.name.trim().toLowerCase()}`;
    const group = byKindAndName.get(key);
    if (group) {
      group.push(entity);
    } else {
      byKindAndName.set(key, [entity]);
    }
  }

  for (const group of byKindAndName.values()) {
    if (group.length > 1) {
      for (const entity of group) {
        duplicates.add(entity.id);
      }
    }
  }

  return duplicates;
}

export interface BodyCounterResult {
  count: number;
  max: number;
  isOverLimit: boolean;
  overCount: number;
}

/**
 * Live code-point counter using shared countCodePoints from @repo/schema.
 */
export function bodyCounter(text: string): BodyCounterResult {
  const count = countCodePoints(text);
  const max = MAX_NODE_BODY_CODE_POINTS;
  const isOverLimit = count > max;
  const overCount = isOverLimit ? count - max : 0;
  return {
    count,
    max,
    isOverLimit,
    overCount,
  };
}
