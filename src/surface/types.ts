export type Observation = {
  state: { surface_kind: "browser"; url: string; title: string; recent_actions: string[] };
  visual: { screenshot_path: string; send_to_llm: boolean; viewport: { width: number; height: number }; visible_text_blocks: string[] };
  accessibility: { controls: Array<{ role: string; name: string; enabled: boolean }> };
  structure: {
    tables: Array<{ name: string; headers: string[]; rows: string[][] }>;
    forms: Array<{ name: string; fields: string[] }>;
    regions: Array<{ name: string; text: string }>;
  };
  policy: Record<string, unknown>;
};

export type ObservationContext = {
  recent_actions: string[];
  policy?: Record<string, unknown>;
};

export type ResolvedAction =
  | { type: "navigate"; url: string }
  | { type: "click"; locator: string }
  | { type: "type"; locator: string; value: string }
  | { type: "select"; locator: string; value: string }
  | { type: "extract"; locator: string; output_key: string }
  | { type: "assert"; text: string }
  | { type: "wait"; ms: number };

export type ActionResult = {
  ok: boolean;
  extracted?: Record<string, unknown>;
  message?: string;
};

export type EvidenceRef = {
  path: string;
  kind: "screenshot" | "trace" | "snapshot";
};

export interface SurfaceAdapter {
  open(entrypoint: string): Promise<void>;
  observe(context: ObservationContext): Promise<Observation>;
  act(action: ResolvedAction): Promise<ActionResult>;
  captureEvidence(label: string): Promise<EvidenceRef>;
}
