import type { Project } from "@repo/schema";

/**
 * Creates a minimal empty project containing one start node titled "Start",
 * with zero edges and zero variables.
 */
export function makeEmptyProject(id: string, name: string): Project {
  return {
    id,
    name,
    nodes: [
      {
        id: "node_1",
        title: "Start",
        type: "start",
      },
    ],
    edges: [],
    variables: [],
  };
}
