import { z } from "zod";
import type { AgentDecision } from "./types.js";

export const geminiAgentDecisionResponseSchema = {
  anyOf: [
    {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["act"] },
        reason_summary: { type: "string", description: "A short, non-executable explanation for the proposed decision." },
        action: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["click", "type", "select", "extract", "assert", "wait"] },
            intent: { type: "string", description: "Stable workflow intent, for example open_member_search." },
            target: {
              type: "object",
              properties: {
                description: { type: "string" },
                semantic: { type: "object", description: "Accessibility clues such as role, name, label, or accessible state." },
                visual: { type: "object", description: "Visible text, nearby text, or region hints." },
                structure: { type: "object", description: "Table, form, row, column, section, or relative-position hints." }
              },
              required: ["description"]
            },
            value: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "object" },
                { type: "array", items: { type: "string" } },
                { type: "null" }
              ]
            },
            output_key: { type: "string" }
          },
          required: ["type", "intent"]
        }
      },
      required: ["decision", "reason_summary", "action"]
    },
    {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["finish"] },
        reason_summary: { type: "string" },
        outputs: { type: "object" }
      },
      required: ["decision", "reason_summary", "outputs"]
    },
    {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["escalate"] },
        reason_summary: { type: "string" },
        code: { type: "string" },
        message: { type: "string" }
      },
      required: ["decision", "reason_summary", "code", "message"]
    }
  ]
} as const;

const proposedActionSchema = z.object({
  type: z.enum(["click", "type", "select", "extract", "assert", "wait"]),
  intent: z.string().min(1),
  target: z.object({
    description: z.string().min(1),
    semantic: z.record(z.unknown()).optional(),
    visual: z.record(z.unknown()).optional(),
    structure: z.record(z.unknown()).optional()
  }).optional(),
  value: z.unknown().optional(),
  output_key: z.string().optional()
});

const agentDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("act"), reason_summary: z.string().min(1), action: proposedActionSchema }),
  z.object({ decision: z.literal("finish"), reason_summary: z.string().min(1), outputs: z.record(z.unknown()) }),
  z.object({ decision: z.literal("escalate"), reason_summary: z.string().min(1), code: z.string().min(1), message: z.string().min(1) })
]);

export function parseAgentDecision(value: unknown): AgentDecision {
  return agentDecisionSchema.parse(value);
}
