export const DEFAULT_TOOL_OUTPUT_LIMIT = 1_500;
export const MIN_TOOL_OUTPUT_LIMIT = 128;

function safeSerialize(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "null";

  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "bigint") return item.toString();
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
    return serialized ?? "[unsupported output]";
  } catch {
    return "[unserializable output]";
  }
}

/**
 * Serializes a tool result and enforces Chrome's current ~1.5K-character guidance.
 * The suffix is explicit so an agent never mistakes a partial payload for a full result.
 */
export function limitToolOutput(value: unknown, maxChars = DEFAULT_TOOL_OUTPUT_LIMIT): string {
  const budget = Math.max(MIN_TOOL_OUTPUT_LIMIT, Math.floor(maxChars));
  const serialized = safeSerialize(value);
  if (serialized.length <= budget) return serialized;

  const suffix = "\n… [output truncated; narrow the request]";
  return `${serialized.slice(0, budget - suffix.length)}${suffix}`;
}
