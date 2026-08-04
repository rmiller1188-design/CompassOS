const DEFAULT_RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function withRetry(operation, options = {}) {
  const {
    attempts = 5,
    baseDelayMs = 250,
    maxDelayMs = 8_000,
    jitter = Math.random,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    isRetryable = (error) => DEFAULT_RETRYABLE.has(error?.status),
  } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !isRetryable(error)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const delay = Math.round(exponential * (0.5 + jitter() * 0.5));
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function* paginate(fetchPage, initialCursor = null) {
  let cursor = initialCursor;
  const seen = new Set();
  do {
    const key = cursor ?? "__initial__";
    if (seen.has(key)) throw new Error("Pagination cursor cycle detected");
    seen.add(key);
    const page = await fetchPage(cursor);
    if (!page || !Array.isArray(page.items)) throw new TypeError("Page must include an items array");
    yield page;
    cursor = page.nextCursor ?? null;
  } while (cursor);
}

export async function collectPages(fetchPage, initialCursor = null) {
  const items = [];
  let finalCursor = initialCursor;
  for await (const page of paginate(fetchPage, initialCursor)) {
    items.push(...page.items);
    finalCursor = page.nextCursor ?? finalCursor;
  }
  return { items, finalCursor };
}
