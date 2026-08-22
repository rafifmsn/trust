import { getDomain } from 'tldts';
import { domainToASCII } from 'url';

/**
 * Strips schemes (http://, https://, ftp://), paths, ports, query strings, and basic trailing segments.
 * Resolves the string to a cleaned hostname pattern.
 */
export function cleanRawInput(raw: string): string {
  let cleaned = raw.trim().toLowerCase();

  // Strip schemes
  cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, '');

  // Strip trailing paths, queries, ports
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split(':')[0];
  cleaned = cleaned.split('?')[0];

  return cleaned;
}

/**
 * Sanitizes and extracts the eTLD+1 apex domain from a raw entry payload.
 * E.g., "https://sub.domain.co.uk/path?query=1" -> "domain.co.uk"
 */
export function extractApexDomain(raw: string): string {
  const cleanedInput = cleanRawInput(raw);

  // Convert Unicode to Punycode/ASCII first
  const asciiInput = domainToASCII(cleanedInput) || cleanedInput;

  // Parse using tldts to get standard public-suffix aware eTLD+1 apex domains
  const apex = getDomain(asciiInput);

  return apex || asciiInput;
}
