/**
 * Task 5 ad blocking: keys pruned from YouTube player responses
 * (uBlock Origin's json-prune pattern). The same logic is inlined in
 * src-tauri/resources/embed_player.html (the iframe's fetch/XHR wrapper) —
 * keep the two in sync; this module is the unit-testable copy.
 */
export const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots'] as const;

const AD_KEY_SET: ReadonlySet<string> = new Set(AD_KEYS);

/** Deep-copy `value`, dropping every AD_KEYS key at any depth. Arrays and
 *  non-object values pass through (arrays are pruned element-wise). */
export function pruneAdKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => pruneAdKeys(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (AD_KEY_SET.has(k)) continue;
      out[k] = pruneAdKeys(v);
    }
    return out as T;
  }
  return value;
}

/** Prune ad keys from a JSON text if it looks like a YouTube player response;
 *  returns the original text unchanged otherwise. */
export function prunePlayerResponseJson(text: string): string {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return text;
  }
  if (obj === null || typeof obj !== 'object') return text;
  const rec = obj as Record<string, unknown>;
  const looksLikePlayer =
    'ytInitialPlayerResponse' in rec || 'playabilityStatus' in rec || 'playerAds' in rec;
  if (!looksLikePlayer) return text;
  return JSON.stringify(pruneAdKeys(obj));
}
