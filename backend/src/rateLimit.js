const crypto = require('node:crypto');
const { HttpError } = require('./http');
const { pocketBase } = require('./pocketbase');

const DEFAULT_NAMESPACE = 'global';
const localBuckets = new Map();
const localFallbackBuckets = new Map();
let lastLocalSweepAt = 0;

function buildBucketKey(parts) {
  const normalized = parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join('|');
  return normalized || 'anonymous';
}

function hashBucketKey(parts) {
  return crypto.createHash('sha256').update(buildBucketKey(parts)).digest('hex');
}

async function getBucket(scope, key) {
  const filter = `bucket_key = "${key}"`;
  const result = await pocketBase.adminRequest(
    `/api/collections/rate_limit_buckets/records?filter=${encodeURIComponent(filter)}&perPage=1`,
  );
  return result.items?.[0] || null;
}

async function enforceRateLimit({ scope, identity, limit, windowMs, failClosed = false }) {
  if (!scope || !identity) return;
  const max = Number(limit);
  const window = Number(windowMs);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(window) || window <= 0) return;

  const bucketKey = hashBucketKey([scope, identity]);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + window).toISOString();

  try {
    enforceLocalBurstLimit(bucketKey, max, window, now);
    for (let attempt = 0; attempt < 3; attempt += 1) {
    const bucket = await getBucket(scope, bucketKey);
    if (!bucket) {
      try {
        await pocketBase.adminRequest('/api/collections/rate_limit_buckets/records', {
          method: 'POST',
          body: {
            bucket_key: bucketKey,
            scope,
            count: 1,
            window_start: nowIso,
            expires_at: expiresAt,
            created_at: nowIso,
            updated_at: nowIso,
          },
        });
        return;
      } catch (error) {
        if (error.status === 409) continue;
        throw error;
      }
    }

    const currentCount = Number(bucket.count || 0);
    const expiresAtMs = bucket.expires_at ? new Date(bucket.expires_at).getTime() : 0;
    const isExpired = !Number.isFinite(expiresAtMs) || expiresAtMs <= now;

    if (isExpired) {
      const resetFilter = encodeURIComponent(
        `id = "${bucket.id}" && count = ${currentCount}`,
      );
      const reset = await pocketBase.adminRequest(
        `/api/collections/rate_limit_buckets/records/${encodeURIComponent(bucket.id)}?filter=${resetFilter}`,
        {
          method: 'PATCH',
          body: {
            count: 1,
            window_start: nowIso,
            expires_at: expiresAt,
            updated_at: nowIso,
          },
        },
      ).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      });
      if (reset?.id) return;
      continue;
    }

    if (currentCount >= max) {
      const retryAfter = Math.max(1, Math.ceil((expiresAtMs - now) / 1000));
      throw new HttpError(429, 'Too many requests. Please slow down.', {
        code: 'rate_limited',
        retry_after_seconds: retryAfter,
      });
    }

    const incrementFilter = encodeURIComponent(
      `id = "${bucket.id}" && count = ${currentCount}`,
    );
    const incremented = await pocketBase.adminRequest(
      `/api/collections/rate_limit_buckets/records/${encodeURIComponent(bucket.id)}?filter=${incrementFilter}`,
      {
        method: 'PATCH',
        body: {
          count: currentCount + 1,
          updated_at: nowIso,
        },
      },
    ).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
    if (incremented?.id) return;
    }

    throw new HttpError(429, 'Too many concurrent requests. Please retry later.', {
      code: 'rate_limited_concurrent',
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.status === 429) throw error;
    enforceLocalFallbackLimit(bucketKey, max, window, now);
    if (failClosed) {
      throw new HttpError(503, 'Rate limiter is unavailable.', {
        code: 'rate_limiter_unavailable',
      });
    }
  }
}

function enforceLocalBurstLimit(bucketKey, limit, windowMs, now = Date.now()) {
  sweepLocalBuckets(now);
  const localWindowMs = 1000;
  const scaledLimit = Math.max(1, Math.min(limit, Math.max(5, Math.ceil(limit * (localWindowMs / windowMs)))));
  const existing = localBuckets.get(bucketKey);
  if (!existing || existing.expiresAt <= now) {
    localBuckets.set(bucketKey, { count: 1, expiresAt: now + localWindowMs });
    return;
  }
  if (existing.count >= scaledLimit) {
    const retryAfter = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
    throw new HttpError(429, 'Too many requests. Please slow down.', {
      code: 'rate_limited_local',
      retry_after_seconds: retryAfter,
    });
  }
  existing.count += 1;
}

function sweepLocalBuckets(now = Date.now()) {
  if (now - lastLocalSweepAt < 30 * 1000) return;
  lastLocalSweepAt = now;
  for (const [key, bucket] of localBuckets) {
    if (!bucket || bucket.expiresAt <= now) {
      localBuckets.delete(key);
    }
  }
  for (const [key, bucket] of localFallbackBuckets) {
    if (!bucket || bucket.expiresAt <= now) {
      localFallbackBuckets.delete(key);
    }
  }
}

function enforceLocalFallbackLimit(bucketKey, limit, windowMs, now = Date.now()) {
  sweepLocalBuckets(now);
  const existing = localFallbackBuckets.get(bucketKey);
  if (!existing || existing.expiresAt <= now) {
    localFallbackBuckets.set(bucketKey, { count: 1, expiresAt: now + windowMs });
    return;
  }
  if (existing.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
    throw new HttpError(429, 'Too many requests. Please slow down.', {
      code: 'rate_limited_local_fallback',
      retry_after_seconds: retryAfter,
    });
  }
  existing.count += 1;
}

function withScope(scope, fn) {
  return (context) => fn({ ...context, scope: context.scope || scope });
}

module.exports = {
  DEFAULT_NAMESPACE,
  buildBucketKey,
  enforceRateLimit,
  enforceLocalFallbackLimit,
  hashBucketKey,
  enforceLocalBurstLimit,
  sweepLocalBuckets,
  withScope,
};
