import { Context } from 'elysia';
import { config } from '../config';
import { redisInstance } from '../db/redis';
import { triageDomains } from '../services/triage';
import { recordVerificationTelemetry } from '../services/telemetry';

export async function handleVerify(ctx: Context & { body: { domains: string[] } }) {
  const { body, request, set } = ctx;

  // 1. IP identification (Prioritizing Cloudflare (cf-connecting-ip) over EdgeOne (eo-connecting-ip))
  const clientIP =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('eo-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1';

  const domainsList = body.domains;
  const count = domainsList.length;

  // Layer 1: Structural Weight Guard (Array length <= 50)
  if (count > 50) {
    set.status = 413;
    return {
      success: false,
      error: 'Payload Too Large: Domains list cannot exceed 50 items.',
    };
  }

  if (count === 0) {
    return {
      success: true,
      data: [],
    };
  }

  // Layer 2: Cost-Based Rate Limiting (Redis Lua Token Bucket)
  const rateLimitKey = `rate_limit:${clientIP}`;
  const now = Date.now() / 1000; // epoch seconds

  try {
    const allowed = await redisInstance.consumeTokens(
      rateLimitKey,
      config.RATE_LIMIT_CAPACITY,
      config.RATE_LIMIT_REFILL_RATE,
      count,
      now
    );

    if (allowed === 0) {
      set.status = 429;
      return {
        success: false,
        error: 'Too Many Requests: Rate limit tokens exhausted for this IP address.',
      };
    }
  } catch (err) {
    // Fallback: If Redis fails, log error and allow request to prevent service outage
    console.error('[RateLimiter] Redis connection failed, bypassing rate limit checks:', err);
  }

  // 3. Execute Triage Pipeline (Layers 3, 4 & 5)
  const results = triageDomains(domainsList);

  // Compute statistics for non-blocking telemetry
  const resultsSummary = {
    verified: 0,
    typos: 0,
    homoglyphs: 0,
    unknown: 0,
  };

  for (const res of results) {
    switch (res.status) {
      case 'VERIFIED':
        resultsSummary.verified++;
        break;
      case 'TYPO_IMPERSONATION':
        resultsSummary.typos++;
        break;
      case 'HOMOGLYPH_IMPERSONATION':
        resultsSummary.homoglyphs++;
        break;
      case 'UNKNOWN':
        resultsSummary.unknown++;
        break;
    }
  }

  // Fire non-blocking Umami tracking ping asynchronously
  recordVerificationTelemetry({
    itemCount: count,
    resultsSummary,
  });

  // 4. Return results
  return {
    success: true,
    data: results,
  };
}
