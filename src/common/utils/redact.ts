export const REDACTED = '[REDACTED]';

/** Short names that must match exactly (a substring match would hit e.g. "classname") */
const EXACT_SENSITIVE_KEYS = new Set(['ssn', 'iban', 'cvv', 'cvc', 'pin', 'otp']);

/** Substrings of the normalized key (lowercase, only letters and digits) */
const SENSITIVE_KEY_PARTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'apikey',
  'cookie',
  'accountnumber',
  'routingnumber',
  'cardnumber',
  'taxid',
  'identitynumber',
];

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    EXACT_SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
  );
};

const redact = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    return '[binary]';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (seen.has(value)) {
    return '[circular]';
  }
  if (depth >= MAX_DEPTH) {
    return '[truncated]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    }
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redact(child, depth + 1, seen);
  }
  return result;
};

/**
 * Returns a copy of `value` that is safe to log: credentials, tokens and banking /
 * identity fields are masked, binary content is replaced, and depth / array size are
 * bounded. The original object is never mutated.
 */
export function redactSensitive(value: unknown): unknown {
  return redact(value, 0, new WeakSet());
}
