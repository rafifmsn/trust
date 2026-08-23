import { config } from '../config';

interface TelemetryParams {
  itemCount: number;
  resultsSummary: {
    verified: number;
    typos: number;
    homoglyphs: number;
    unknown: number;
  };
  hostname?: string;
  clientIP?: string;
  userAgent?: string;
}

/**
 * Dispatches verification analytical telemetry asynchronously to the Umami REST interface.
 * Implements a 5-second socket timeout and TCP stream drainage for server safety.
 */
export function recordVerificationTelemetry({ itemCount, resultsSummary, hostname, clientIP, userAgent }: TelemetryParams) {
  if (config.NODE_ENV !== 'production' || !config.UMAMI_WEBSITE_ID) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000);

  // Omit the 'name' parameter so Umami registers this as a standard pageview (updating views/visitor charts)
  const requestBody = {
    payload: {
      hostname: hostname || 'trust.rafifmsn.com',
      url: '/api/v1/verify',
      website: config.UMAMI_WEBSITE_ID,
      data: {
        items_count: itemCount,
        verified_count: resultsSummary.verified,
        typos_count: resultsSummary.typos,
        homoglyphs_count: resultsSummary.homoglyphs,
        unknown_count: resultsSummary.unknown,
      },
    },
    type: 'event',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Forward client details so Umami can track unique sessions, browsers, and geolocations
  if (userAgent) {
    headers['User-Agent'] = userAgent;
  }
  if (clientIP) {
    headers['X-Forwarded-For'] = clientIP;
  }

  fetch(`${config.UMAMI_URL}/api/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: controller.signal, // Attach AbortController signal
  })
    .then((res) => {
      // Safe stream consumption: consume the response body stream to cleanly close/drain the underlying TCP socket
      res.text().catch(() => {});
    })
    .catch((err) => {
      // Safe containment: handle abort log silences internally to prevent Unhandled Promise Rejections
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn('[Telemetry] Track dispatch request timed out after 5000ms. Aborted.');
      } else {
        console.error('[Telemetry] Background dispatch failed:', err instanceof Error ? err.message : err);
      }
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}
