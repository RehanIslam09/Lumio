import type { Project, FlowNode } from "@repo/schema";
import {
  parseCondition,
  parseEffect,
  evaluateCondition,
  applyEffect,
  initialState,
  type VariableState,
} from "@repo/dsl";
import type {
  Session,
  Step,
  Choice,
  SessionParseCache,
  StartSessionOptions,
  StartSessionResult,
  ChooseResult,
  SessionStatus,
} from "./types.js";

export * from "./types.js";

function createParseCache(): SessionParseCache {
  return {
    conditions: new Map(),
    effects: new Map(),
  };
}

/**
 * Lists outgoing choices from the current node in project.edges order.
 * Evaluates conditions against current session variable state.
 * Targets missing in project.nodes return status 'error'.
 */
export function listChoices(session: Session): readonly Choice[] {
  const outgoing = session.project.edges.filter((e) => e.from === session.nodeId);
  const choices: Choice[] = [];

  for (const edge of outgoing) {
    const targetNode = session.project.nodes.find((n) => n.id === edge.to);
    if (!targetNode) {
      choices.push({
        edgeId: edge.id,
        targetNodeId: edge.to,
        targetTitle: undefined,
        status: "error",
        reason: "target node missing",
        conditionText: edge.condition,
      });
      continue;
    }

    if (edge.condition !== undefined && edge.condition.trim().length > 0) {
      const condText = edge.condition;
      let parsed = session.cache.conditions.get(condText);
      if (!parsed) {
        parsed = parseCondition(condText);
        session.cache.conditions.set(condText, parsed);
      }

      if (!parsed.ok) {
        choices.push({
          edgeId: edge.id,
          targetNodeId: edge.to,
          targetTitle: targetNode.title,
          status: "error",
          reason: parsed.error.message,
          conditionText: condText,
        });
        continue;
      }

      const evalRes = evaluateCondition(parsed.value, session.state);
      if (!evalRes.ok) {
        choices.push({
          edgeId: edge.id,
          targetNodeId: edge.to,
          targetTitle: targetNode.title,
          status: "error",
          reason: evalRes.error.message,
          conditionText: condText,
        });
        continue;
      }

      if (!evalRes.value) {
        choices.push({
          edgeId: edge.id,
          targetNodeId: edge.to,
          targetTitle: targetNode.title,
          status: "blocked",
          reason: "Condition evaluated to false",
          conditionText: condText,
        });
        continue;
      }

      choices.push({
        edgeId: edge.id,
        targetNodeId: edge.to,
        targetTitle: targetNode.title,
        status: "available",
        conditionText: condText,
      });
    } else {
      choices.push({
        edgeId: edge.id,
        targetNodeId: edge.to,
        targetTitle: targetNode.title,
        status: "available",
      });
    }
  }

  return choices;
}

function determineNodeStatus(
  node: FlowNode,
  session: Session,
): { status: SessionStatus; message?: string } {
  // Amendment 7: A node of type 'end' is always 'ended' (even with outgoing edges)
  if (node.type === "end") {
    return { status: "ended" };
  }

  const choices = listChoices(session);
  const available = choices.filter((c) => c.status === "available");

  if (available.length === 0) {
    const msg =
      choices.length === 0
        ? "Stuck: no outgoing paths from this node"
        : "Stuck: all outgoing paths are blocked or have errors";
    return { status: "stuck", message: msg };
  }

  return { status: "playing" };
}

/**
 * Initializes a new deterministic playtest session from a project snapshot.
 * Respects optional startNodeId if present in project; else uses first 'start' node.
 */
export function startSession(
  project: Project,
  options?: StartSessionOptions,
): StartSessionResult {
  let startNode: FlowNode | undefined;

  if (options?.startNodeId) {
    startNode = project.nodes.find((n) => n.id === options.startNodeId);
  } else {
    startNode = project.nodes.find((n) => n.type === "start");
  }

  if (!startNode) {
    return { ok: false, error: "no-start-node" };
  }

  const state = initialState(project.variables);
  const visits = new Map<string, number>([[startNode.id, 1]]);
  const cache = createParseCache();
  if (options?.cache) Object.assign(cache, options.cache);

  const interimSession: Session = {
    project,
    startNodeId: startNode.id,
    nodeId: startNode.id,
    state,
    visits,
    history: [],
    status: "playing",
    cache,
  };

  const { status, message } = determineNodeStatus(startNode, interimSession);

  return {
    ok: true,
    session: {
      ...interimSession,
      status,
      message,
    },
  };
}

/**
 * Traverses an outgoing edge choice.
 * Validates availability.
 * Applies effects in order atomically; if any fails, nothing changes.
 * Updates visits, records step in history (capped at 1000), and computes new status.
 */
export function choose(session: Session, edgeId: string): ChooseResult {
  const choices = listChoices(session);
  const chosenChoice = choices.find((c) => c.edgeId === edgeId);

  if (!chosenChoice || chosenChoice.status !== "available") {
    return {
      ok: false,
      error: chosenChoice?.reason ?? "Choice is not available",
    };
  }

  const edge = session.project.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { ok: false, error: "Edge not found" };
  }

  const targetNode = session.project.nodes.find((n) => n.id === chosenChoice.targetNodeId);
  if (!targetNode) {
    return { ok: false, error: "target node missing" };
  }

  // Atomically apply effects in order
  let nextState: VariableState = session.state;
  for (const effText of edge.effects ?? []) {
    let parsed = session.cache.effects.get(effText);
    if (!parsed) {
      parsed = parseEffect(effText);
      session.cache.effects.set(effText, parsed);
    }

    if (!parsed.ok) {
      return { ok: false, error: parsed.error.message };
    }

    const applyRes = applyEffect(parsed.value, nextState);
    if (!applyRes.ok) {
      return { ok: false, error: applyRes.error.message };
    }
    nextState = applyRes.state;
  }

  // Next visits
  const nextVisits = new Map(session.visits);
  nextVisits.set(targetNode.id, (nextVisits.get(targetNode.id) ?? 0) + 1);

  // History step
  const step: Step = {
    nodeId: session.nodeId,
    state: session.state,
    visits: session.visits,
    chosenEdgeId: edgeId,
    status: session.status,
    message: session.message,
  };

  // History capped at 1000
  const nextHistory =
    session.history.length >= 1000
      ? [...session.history.slice(1), step]
      : [...session.history, step];

  const interimSession: Session = {
    project: session.project,
    startNodeId: session.startNodeId,
    nodeId: targetNode.id,
    state: nextState,
    visits: nextVisits,
    history: nextHistory,
    status: "playing",
    cache: session.cache,
  };

  const { status, message } = determineNodeStatus(targetNode, interimSession);

  return {
    ok: true,
    session: {
      ...interimSession,
      status,
      message,
    },
  };
}

/**
 * Restores the previous session step exactly.
 * No-op at the start of a session.
 */
export function back(session: Session): Session {
  if (session.history.length === 0) {
    return session;
  }

  const lastIndex = session.history.length - 1;
  const lastStep = session.history[lastIndex];
  if (!lastStep) return session;

  const prevHistory = session.history.slice(0, lastIndex);

  return {
    project: session.project,
    startNodeId: session.startNodeId,
    nodeId: lastStep.nodeId,
    state: lastStep.state,
    visits: lastStep.visits,
    history: prevHistory,
    status: lastStep.status,
    message: lastStep.message,
    cache: session.cache,
  };
}

/**
 * Restarts the session from the original start node with fresh initial state.
 */
export function restart(session: Session): Session {
  const restarted = startSession(session.project, { startNodeId: session.startNodeId });
  if (!restarted.ok) {
    // Fallback if original start node was somehow removed
    return session;
  }
  return {
    ...restarted.session,
    cache: session.cache,
  };
}
