/**
 * Shared helpers for running local check scripts without exhausting RAM or disk.
 */

/**
 * Resolves how many child processes may run at once.
 *
 * Local defaults stay at 1 so agents and laptops do not spawn a pile of tsc /
 * eslint processes. CI may fan out. TYPECHECK_CONCURRENCY / CHECK_CONCURRENCY
 * always win when set.
 *
 * @param {object} options
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {string} options.envName
 * @param {number} options.localDefault
 * @param {number} options.ciDefault
 * @param {number} options.itemCount
 * @returns {number}
 */
export function resolveConcurrency({
  env = process.env,
  envName,
  localDefault,
  ciDefault,
  itemCount,
}) {
  const raw = env[envName];
  let value;

  if (raw != null && String(raw).trim() !== '') {
    value = Number(raw);
    if (!Number.isFinite(value) || value < 1) {
      throw new Error(
        `${envName} must be a positive number, got ${JSON.stringify(raw)}`
      );
    }
    value = Math.floor(value);
  } else {
    value = env.CI ? ciDefault : localDefault;
  }

  return Math.max(1, Math.min(value, Math.max(itemCount, 1)));
}

/**
 * Runs async work over items with a fixed worker count.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function runPool(items, concurrency, worker) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let next = 0;
  const size = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index], index);
      }
    })
  );

  return results;
}

const DEFAULT_MAX_OLD_SPACE_MB = 4096;

/**
 * Caps V8 heap so a single tsc cannot grow until the machine swaps to death.
 * Leaves an existing --max-old-space-size flag untouched.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {number} [maxOldSpaceMb]
 * @returns {NodeJS.ProcessEnv}
 */
export function withHeapCap(env, maxOldSpaceMb = DEFAULT_MAX_OLD_SPACE_MB) {
  const current = env.NODE_OPTIONS ?? '';
  if (/(?:^|\s)--max-old-space-size=/.test(current)) {
    return env;
  }

  return {
    ...env,
    NODE_OPTIONS: `${current} --max-old-space-size=${maxOldSpaceMb}`.trim(),
  };
}
