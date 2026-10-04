import { ProjectSchema, type Project } from "@repo/schema";

const rawSampleProject: Project = {
  id: "proj_genshin_quest",
  name: "Prologue: The Outlander Who Caught the Wind",
  nodes: [
    {
      id: "node_cathedral",
      type: "start",
      title: "Favonius Cathedral",
      position: { x: 0, y: 140 },
    },
    {
      id: "node_knights_hq",
      type: "scene",
      title: "Knights of Favonius HQ",
    },
    {
      id: "node_city_gate",
      type: "scene",
      title: "Mondstadt Main Gate",
    },
    {
      id: "node_whispering_woods",
      type: "scene",
      title: "Whispering Woods",
    },
    {
      id: "node_windrise",
      type: "scene",
      title: "Windrise Ancient Tree",
    },
    {
      id: "node_falcon_temple",
      type: "scene",
      title: "Temple of the Falcon",
    },
    {
      id: "node_stormterror_approach",
      type: "scene",
      title: "Stormterror's Lair Entrance",
    },
    {
      id: "node_wind_barrier",
      type: "scene",
      title: "Guocui Wind Barrier",
    },
    {
      id: "node_dvalin_perch",
      type: "scene",
      title: "Dvalin's High Perch",
    },
    {
      id: "node_end_victory",
      type: "end",
      title: "Song of Freedom (Triumph)",
    },
    {
      id: "node_end_retreat",
      type: "end",
      title: "Dawn Winery Sanctuary",
    },
    // Problem nodes: Trap Cycle (cannot reach end)
    {
      id: "node_abyss_ruins_a",
      type: "scene",
      title: "Abyss Labyrinth Ruins A",
    },
    {
      id: "node_abyss_ruins_b",
      type: "scene",
      title: "Abyss Labyrinth Ruins B",
    },
    // Problem node: Dead end (cannot reach end)
    {
      id: "node_starsnatch_cliff",
      type: "scene",
      title: "Starsnatch Precipice (Dead End)",
    },
    // Problem node: Unreachable from start (orphan)
    {
      id: "node_nameless_island",
      type: "scene",
      title: "Nameless Island (Unreachable)",
    },
  ],
  edges: [
    // Main progression
    {
      id: "edge_cathedral_to_hq",
      from: "node_cathedral",
      to: "node_knights_hq",
      effects: ["sigil_power = 20"],
    },
    {
      id: "edge_hq_to_gate",
      from: "node_knights_hq",
      to: "node_city_gate",
      condition: "sigil_power > 5",
      effects: ["adventurer_rank = 15"], // written but never read -> variable-never-read
    },
    {
      id: "edge_gate_to_woods",
      from: "node_city_gate",
      to: "node_whispering_woods",
      condition: "paimon_hungry == true", // read without initial and never written -> variable-never-written
    },
    {
      id: "edge_gate_to_windrise",
      from: "node_city_gate",
      to: "node_windrise",
    },
    {
      id: "edge_woods_to_temple",
      from: "node_whispering_woods",
      to: "node_falcon_temple",
    },
    {
      id: "edge_windrise_to_temple",
      from: "node_windrise",
      to: "node_falcon_temple",
    },
    {
      id: "edge_temple_to_approach",
      from: "node_falcon_temple",
      to: "node_stormterror_approach",
    },
    // Problem edge: Undefined variable
    {
      id: "edge_approach_to_barrier",
      from: "node_stormterror_approach",
      to: "node_wind_barrier",
      condition: "sigil_power >= 10 && abyssal_tear > 0", // undefined variable: abyssal_tear
    },
    // Problem edge: Type mismatch
    {
      id: "edge_barrier_to_perch",
      from: "node_wind_barrier",
      to: "node_dvalin_perch",
      effects: ['sigil_power = "max_resonance"'], // type mismatch: string assigned to number
    },
    {
      id: "edge_perch_to_victory",
      from: "node_dvalin_perch",
      to: "node_end_victory",
      condition: "sigil_power > 0",
    },
    {
      id: "edge_perch_to_retreat",
      from: "node_dvalin_perch",
      to: "node_end_retreat",
    },
    // Problem branch: Leading to dead end
    {
      id: "edge_woods_to_cliff",
      from: "node_whispering_woods",
      to: "node_starsnatch_cliff",
    },
    // Problem branch: Leading to trap cycle
    {
      id: "edge_windrise_to_abyss_a",
      from: "node_windrise",
      to: "node_abyss_ruins_a",
    },
    {
      id: "edge_abyss_a_to_b",
      from: "node_abyss_ruins_a",
      to: "node_abyss_ruins_b",
    },
    {
      id: "edge_abyss_b_to_a",
      from: "node_abyss_ruins_b",
      to: "node_abyss_ruins_a",
    },
    // Edge from unreachable node
    {
      id: "edge_island_to_victory",
      from: "node_nameless_island",
      to: "node_end_victory",
    },
  ],
  variables: [
    // Used properly
    { id: "var_sigil", name: "sigil_power", type: "number", initial: 10 },
    // Written but never read
    { id: "var_rank", name: "adventurer_rank", type: "number", initial: 12 },
    // Never read and never written
    { id: "var_favor", name: "favonius_favor", type: "string", initial: "neutral" },
    // Read without initial and never written
    { id: "var_paimon", name: "paimon_hungry", type: "boolean" },
  ],
};

// Validate project with Zod schema at module load
export const sampleProject: Project = ProjectSchema.parse(rawSampleProject);

/**
 * Returns a variant of the sample project with or without an unparseable expression.
 * When includeSyntaxError is true: introduces a syntax error, causing `invalid-expression`
 * and triggering the project-wide suppression of variable usage issues.
 */
export function getSampleProjectWithSyntaxError(includeSyntaxError: boolean): Project {
  if (!includeSyntaxError) {
    return sampleProject;
  }

  return {
    ...sampleProject,
    edges: sampleProject.edges.map((edge) => {
      if (edge.id === "edge_cathedral_to_hq") {
        return {
          ...edge,
          condition: "sigil_power >>?? @@syntax_err@@",
        };
      }
      return edge;
    }),
  };
}
