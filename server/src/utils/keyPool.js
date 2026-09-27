// Primary/backup API key failover, shared by Groq and Tavily.
//
// Keys are always tried in order, so the primary carries the load and the
// backup is only spent when the primary is exhausted, revoked, or its
// provider is having a bad moment. A key that fails that way is benched
// for a cooldown, so the next requests go straight to the backup instead
// of paying for a doomed call first. Errors that are the request's own
// fault (bad input, prompt too large) are rethrown immediately - the other
// key would fail in exactly the same way.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * @param {string} name        Label for logs, e.g. "groq".
 * @param {string[]} keys      Ordered keys; primary first.
 * @param {(error: any) => { failover: boolean, cooldownMs?: number, reason?: string }} classify
 *        Decides whether an error should move on to the next key.
 */
export function createKeyPool(name, keys, classify) {
  // benchedUntil[i] is the timestamp before which key i is skipped.
  const benchedUntil = keys.map(() => 0);

  // Available keys first (in order), then benched ones soonest-to-recover
  // first. If every key is benched we still try them rather than failing
  // without a single request - a cooldown is only an estimate.
  function attemptOrder() {
    const now = Date.now();
    const indexes = keys.map((_, i) => i);
    const available = indexes.filter((i) => benchedUntil[i] <= now);
    const benched = indexes
      .filter((i) => benchedUntil[i] > now)
      .sort((a, b) => benchedUntil[a] - benchedUntil[b]);
    return [...available, ...benched];
  }

  return {
    get size() {
      return keys.length;
    },

    /** Runs fn(key) with each key in turn until one succeeds. */
    async run(fn) {
      if (!keys.length) {
        throw new Error(`No ${name} API key configured - set it in .env first.`);
      }

      const order = attemptOrder();
      let lastError;

      for (const [attempt, i] of order.entries()) {
        try {
          const result = await fn(keys[i]);
          benchedUntil[i] = 0;
          return result;
        } catch (error) {
          lastError = error;
          const verdict = classify(error);
          if (!verdict.failover) {
            throw error;
          }

          benchedUntil[i] = Date.now() + (verdict.cooldownMs ?? MINUTE);
          const next = order[attempt + 1];
          console.warn(
            `[${name}] key ${i + 1} failed (${verdict.reason || 'error'}) - ` +
              (next === undefined ? 'no backup key left' : `switching to key ${next + 1}`)
          );
        }
      }

      throw lastError;
    },
  };
}

export const cooldown = { MINUTE, HOUR };

/** Seconds from a Retry-After header, as milliseconds, or null. */
export function retryAfterMs(headers) {
  const raw = typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after'];
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}
