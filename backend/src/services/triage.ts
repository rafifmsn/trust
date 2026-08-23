import { activeWhitelist, maxWhitelistLength, whitelistByLength } from './synchronizer';
import { extractApexDomain } from '../utils/sanitizer';
import { isEditDistanceWithinOne } from '../utils/levenshtein';

export interface VerificationResult {
  input: string;
  matched: string | null;
  status: 'VERIFIED' | 'HOMOGLYPH_IMPERSONATION' | 'TYPO_IMPERSONATION' | 'UNKNOWN';
}

/**
 * Executes the 5-layer domain triage pipeline on a batch of raw domain strings.
 * Note: Layers 1 (size guard) and 2 (rate limiting) are executed at the route handler level.
 */
export function triageDomains(rawDomains: string[]): VerificationResult[] {
  const results: VerificationResult[] = [];

  for (const raw of rawDomains) {
    // Slicing & Apex domain parsing
    const apex = extractApexDomain(raw);

    // Layer 3: Punycode & Homoglyph identification
    if (apex.includes('xn--')) {
      results.push({
        input: raw,
        matched: null,
        status: 'HOMOGLYPH_IMPERSONATION',
      });
      continue;
    }

    // Layer 4: Exact Whitelist Map lookup (Local memory fast path)
    if (activeWhitelist.has(apex)) {
      results.push({
        input: raw,
        matched: apex,
        status: 'VERIFIED',
      });
      continue;
    }

    // Layer 5: Levenshtein distance check against all targets
    // Performance Guard: Exit early if input is invalidly long according to RFC 1035 (>253 chars)
    // or longer than our longest whitelisted brand + edit distance buffer (maxWhitelistLength + 1).
    if (apex.length > 253 || apex.length > maxWhitelistLength + 1) {
      results.push({
        input: raw,
        matched: null,
        status: 'UNKNOWN',
      });
      continue;
    }

    let matchedTarget: string | null = null;
    const len = apex.length;
    const candidateLengths = [len - 1, len, len + 1];

    for (const targetLen of candidateLengths) {
      const candidates = whitelistByLength.get(targetLen);
      if (!candidates) continue;

      for (const target of candidates) {
        if (isEditDistanceWithinOne(apex, target)) {
          matchedTarget = target;
          break;
        }
      }
      if (matchedTarget) break;
    }

    if (matchedTarget) {
      results.push({
        input: raw,
        matched: matchedTarget,
        status: 'TYPO_IMPERSONATION',
      });
    } else {
      results.push({
        input: raw,
        matched: null,
        status: 'UNKNOWN',
      });
    }
  }

  return results;
}
