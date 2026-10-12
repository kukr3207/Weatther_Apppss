import { assertArray, assertInteger, assertObject, assertString, deepFreeze, parseTimestamp } from '../core/validation';

export class CoordinatedRequestError extends Error {
  constructor(codeOrMessage, messageOrAttempts, details = {}) {
    const overloaded = Array.isArray(messageOrAttempts);
    super(overloaded ? codeOrMessage : messageOrAttempts);
    this.name = 'CoordinatedRequestError';
    this.code = overloaded ? 'provider_request_failed' : codeOrMessage;
    this.attempts = overloaded ? messageOrAttempts : details.attempts ?? [];
    this.details = overloaded ? Object.freeze({}) : Object.freeze({ ...details });
  }
}

function timeoutPromise(milliseconds, controller) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${milliseconds} ms.`));
    }, milliseconds);
    controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });
}

function linkedController(parentSignal) {
  const controller = new AbortController();
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  parentSignal?.addEventListener('abort', () => controller.abort(parentSignal.reason), { once: true });
  return controller;
}

export async function executeProviderRequest(providersInput, operation, options = {}) {
  const providers = assertArray(providersInput, 'Providers', { nonEmpty: true });
  const operationName = assertString(operation, 'Provider operation');
  const timeoutMs = assertInteger(options.timeoutMs ?? 10_000, 'Request timeout', { minimum: 1, maximum: 120_000 });
  const attempts = [];
  for (const provider of providers) {
    assertObject(provider, 'Provider');
    const providerId = assertString(provider.id, 'Provider id');
    if (typeof provider[operationName] !== 'function') {
      attempts.push({ providerId, status: 'unsupported', durationMs: 0 });
      continue;
    }
    const startedAt = Date.now();
    const controller = linkedController(options.signal);
    try {
      const result = await Promise.race([
        provider[operationName](...((options.arguments ?? [])), { signal: controller.signal }),
        timeoutPromise(timeoutMs, controller),
      ]);
      controller.abort();
      attempts.push({ providerId, status: 'success', durationMs: Date.now() - startedAt });
      return deepFreeze({ providerId, result, attempts, fallbackUsed: attempts.length > 1 });
    } catch (error) {
      controller.abort();
      if (options.signal?.aborted) throw error;
      attempts.push({
        providerId,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (options.shouldRetry && !options.shouldRetry(error, provider)) break;
    }
  }
  throw new CoordinatedRequestError(`Every provider failed to complete ${operationName}.`, attempts);
}

export async function executeProviderQuorum(providersInput, operation, options = {}) {
  const providers = assertArray(providersInput, 'Providers', { nonEmpty: true });
  const required = assertInteger(options.required ?? Math.ceil(providers.length / 2), 'Provider quorum', {
    minimum: 1,
    maximum: providers.length,
  });
  const operationName = assertString(operation, 'Provider operation');
  const startedAt = Date.now();
  const settled = await Promise.allSettled(providers.map(async (provider) => ({
    providerId: provider.id,
    value: await provider[operationName](...((options.arguments ?? [])), { signal: options.signal }),
  })));
  const successes = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failures = settled.filter((result) => result.status === 'rejected').map((result, index) => ({
    providerId: providers[index]?.id ?? 'unknown',
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  }));
  if (successes.length < required) {
    throw new CoordinatedRequestError(`Provider quorum failed: ${successes.length} of ${required} succeeded.`, failures);
  }
  return deepFreeze({ successes, failures, required, durationMs: Date.now() - startedAt });
}

export function createRequestDeduplicator(options = {}) {
  const pending = new Map();
  const completed = new Map();
  const ttlMs = options.ttlMs ?? 5_000;
  return {
    get size() {
      return pending.size;
    },
    async run(keyInput, operation) {
      const key = assertString(keyInput, 'Request key');
      const cached = completed.get(key);
      if (cached && Date.now() - cached.completedAt < ttlMs) return cached.value;
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(operation).then((value) => {
        completed.set(key, { value, completedAt: Date.now() });
        return value;
      }).finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    invalidate(key) {
      completed.delete(key);
    },
    clear() {
      completed.clear();
    },
    stats() {
      return { pending: pending.size, cached: completed.size };
    },
  };
}

export function providerRequestKey(providerId, operation, parameters = {}) {
  const normalized = Object.keys(parameters).sort().map((key) => `${key}=${JSON.stringify(parameters[key])}`).join('&');
  return `${providerId}:${operation}:${normalized}`;
}

export function requestFreshness(response, now = new Date().toISOString(), options = {}) {
  const timestamp = response.fetchedAt ?? response.receivedAt ?? response.issuedAt ?? response.observedAt;
  const ageSeconds = Math.max(0, parseTimestamp(now) - parseTimestamp(timestamp)) / 1000;
  const staleAfterSeconds = options.staleAfterSeconds ?? 600;
  return deepFreeze({
    ageSeconds,
    staleAfterSeconds,
    stale: ageSeconds > staleAfterSeconds,
    timestamp: new Date(parseTimestamp(timestamp)).toISOString(),
  });
}
