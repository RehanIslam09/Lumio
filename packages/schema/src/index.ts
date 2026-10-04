import { z } from "zod";

export const FlowNodeTypeSchema = z.enum(["start", "scene", "end"]);
export type FlowNodeType = z.infer<typeof FlowNodeTypeSchema>;

export const FlowNodeSchema = z.object({
  id: z.string(),
  type: FlowNodeTypeSchema,
  title: z.string(),
});
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const VariableTypeSchema = z.enum(["number", "string", "boolean"]);
export type VariableType = z.infer<typeof VariableTypeSchema>;

export const VariableNameSchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Variable name must match [A-Za-z_][A-Za-z0-9_]*",
  )
  .refine(
    (name) => name !== "true" && name !== "false",
    "Variable name must not be a reserved boolean literal ('true' or 'false')",
  );

export const VariableSchema = z
  .object({
    id: z.string(),
    name: VariableNameSchema,
    type: VariableTypeSchema,
    initial: z.union([z.number(), z.string(), z.boolean()]).optional(),
  })
  .refine(
    (data) => {
      if (data.initial === undefined) return true;
      if (data.type === "number") {
        return typeof data.initial === "number" && Number.isFinite(data.initial);
      }
      return typeof data.initial === data.type;
    },
    { message: "initial value type must match variable type and numbers must be finite" },
  );
export type Variable = z.infer<typeof VariableSchema>;

export const FlowEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
  effects: z.array(z.string()).optional(),
});
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
  variables: z.array(VariableSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export const IssueRuleIdSchema = z.enum([
  "unreachable-from-start",
  "cannot-reach-end",
  "invalid-expression",
  "undefined-variable",
  "type-mismatch",
  "unused-variable",
  "variable-never-written",
  "variable-never-read",
]);
export type IssueRuleId = z.infer<typeof IssueRuleIdSchema>;

export const IssueSeveritySchema = z.enum(["error", "warning"]);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const IssueLocationSchema = z.object({
  edgeId: z.string(),
  field: z.enum(["condition", "effect"]),
  effectIndex: z.number().int().nonnegative().optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type IssueLocation = z.infer<typeof IssueLocationSchema>;

export const IssueSchema = z
  .object({
    ruleId: IssueRuleIdSchema,
    severity: IssueSeveritySchema,
    nodeId: z.string().optional(),
    variableId: z.string().optional(),
    message: z.string(),
    location: IssueLocationSchema.optional(),
  })
  .refine(
    (issue) => (issue.nodeId !== undefined) !== (issue.variableId !== undefined),
    { message: "Exactly one of nodeId or variableId must be present" },
  );
export type Issue = z.infer<typeof IssueSchema>;

