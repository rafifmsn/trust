import { describe, expect, it, beforeAll } from 'bun:test';
import { cleanRawInput, extractApexDomain } from '../src/utils/sanitizer';
import { isEditDistanceWithinOne } from '../src/utils/levenshtein';
import { triageDomains } from '../src/services/triage';
import { initializeState, parseSeedFile, whitelistByLength } from '../src/services/synchronizer';

describe('Sanitizer utilities', () => {
  it('should clean raw domain schemes and paths', () => {
    expect(cleanRawInput('https://www.paypal.com/signin?country=US')).toBe('paypal.com');
    expect(cleanRawInput('HTTP://GOOGLE.COM:8080/index.php')).toBe('google.com');
  });

  it('should extract correct eTLD+1 apex domains', () => {
    expect(extractApexDomain('https://sub.domain.co.uk/path')).toBe('domain.co.uk');
    expect(extractApexDomain('https://paypal.com')).toBe('paypal.com');
    expect(extractApexDomain('googĺe.com')).toBe('xn--googe-95a.com');
  });
});

describe('Levenshtein distance calculations', () => {
  it('should identify edit distance <= 1', () => {
    expect(isEditDistanceWithinOne('paypal.com', 'paypa1.com')).toBe(true);
    expect(isEditDistanceWithinOne('google.com', 'go0gle.com')).toBe(true);
    expect(isEditDistanceWithinOne('google.com', 'go0g1e.com')).toBe(false); // edit distance is 2
    expect(isEditDistanceWithinOne('stripe.com', 'stripe.com')).toBe(true);  // edit distance is 0
  });
});

describe('Triage pipeline execution', () => {
  beforeAll(async () => {
    await initializeState();
  });

  it('should categorize whitelisted domains as VERIFIED', () => {
    const results = triageDomains(['https://paypal.com', 'google.com']);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('VERIFIED');
    expect(results[0].matched).toBe('paypal.com');
    expect(results[1].status).toBe('VERIFIED');
    expect(results[1].matched).toBe('google.com');
  });

  it('should identify typo impersonations', () => {
    const results = triageDomains(['paypa1.com', 'go0gle.com']);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('TYPO_IMPERSONATION');
    expect(results[0].matched).toBe('paypal.com');
    expect(results[1].status).toBe('TYPO_IMPERSONATION');
    expect(results[1].matched).toBe('google.com');
  });

  it('should flag homoglyph impersonations', () => {
    const results = triageDomains(['xn--google-xyz.com', 'googĺe.com', 'stripe.cоm']);
    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('HOMOGLYPH_IMPERSONATION');
    expect(results[1].status).toBe('HOMOGLYPH_IMPERSONATION');
    expect(results[2].status).toBe('HOMOGLYPH_IMPERSONATION');
  });

  it('should identify unknown domains', () => {
    const results = triageDomains(['random-unknown-domain.com']);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('UNKNOWN');
  });
});

describe('State synchronization & sharding', () => {
  it('should parse both JSON arrays and raw comma-separated lists of domains', () => {
    const jsonRaw = '["google.com", "paypal.com"]';
    const csvRaw = '"google.com", "paypal.com"';

    const parsedJson = parseSeedFile(jsonRaw);
    const parsedCsv = parseSeedFile(csvRaw);

    expect(parsedJson).toEqual(['google.com', 'paypal.com']);
    expect(parsedCsv).toEqual(['google.com', 'paypal.com']);
  });

  it('should group whitelisted domains by length', () => {
    // google.com is length 10
    // paypal.com is length 10
    expect(whitelistByLength.get(10)).toContain('google.com');
    expect(whitelistByLength.get(10)).toContain('paypal.com');
  });
});
