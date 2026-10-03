import { z } from "zod";

export const FlowNodeTypeSchema = z.enum(["start", "scene", "end"]);
export type FlowNodeType = z.infer<typeof FlowNodeTypeSchema>;

export const FlowNodeSchema = z.object({
  id: z.string(),
  type: FlowNodeTypeSchema,
  title: z.string(),
});
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export const IssueRuleIdSchema = z.enum([
  "unreachable-from-start",
  "cannot-reach-end",
]);
export type IssueRuleId = z.infer<typeof IssueRuleIdSchema>;

export const IssueSeveritySchema = z.enum(["error", "warning"]);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const IssueSchema = z.object({
  ruleId: IssueRuleIdSchema,
  severity: IssueSeveritySchema,
  nodeId: z.string(),
  message: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;

