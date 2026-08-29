export type CanonicalJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Canonical JSON for immutable payment request fingerprints.
 *
 * Object keys are sorted lexicographically and arrays retain their order.
 * Values that JSON would silently discard or coerce are rejected instead.
 */
export function canonicalizeJson(value: unknown): string {
  const ancestors = new WeakSet<object>();

  const visit = (item: unknown): string => {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError("Canonical JSON numbers must be finite");
      return JSON.stringify(item);
    }
    if (typeof item !== "object") {
      throw new TypeError(`Canonical JSON does not support ${typeof item} values`);
    }
    if (ancestors.has(item)) throw new TypeError("Canonical JSON does not support cycles");

    ancestors.add(item);
    try {
      if (Array.isArray(item)) return `[${item.map((entry) => visit(entry)).join(",")}]`;

      const prototype = Object.getPrototypeOf(item) as object | null;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Canonical JSON objects must be plain records");
      }
      if (
        Object.getOwnPropertySymbols(item).some((symbol) =>
          Object.prototype.propertyIsEnumerable.call(item, symbol),
        )
      ) {
        throw new TypeError("Canonical JSON does not support symbol keys");
      }

      const record = item as Record<string, unknown>;
      const fields = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${visit(record[key])}`);
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(item);
    }
  };

  return visit(value);
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", copyToArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

/** Fixed-loop comparison for equal-length hexadecimal payment digests. */
export function constantTimeEqualHex(left: string, right: string): boolean {
  const maximumLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifySha256Hex(
  value: string | Uint8Array,
  expectedDigest: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/u.test(expectedDigest)) return false;
  return constantTimeEqualHex(await sha256Hex(value), expectedDigest);
}
