const secretKeys = new Set(["token", "api_key", "password", "secret", "GEMINI_API_KEY"]);

export function substituteParams(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => String(params[key.trim()] ?? ""));
  }
  if (Array.isArray(value)) return value.map((item) => substituteParams(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, substituteParams(nested, params)])
    );
  }
  return value;
}

export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (secretKeys.has(key) || /token|secret|password|api/i.test(key)) return [key, "[REDACTED]"];
      if (key === "member_id" && typeof value === "string") return [key, `****${value.slice(-2)}`];
      return [key, value];
    })
  );
}
