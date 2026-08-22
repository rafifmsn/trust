import { config } from '../config';

interface TelemetryParams {
  itemCount: number;
  resultsSummary: {
    verified: number;
    typos: number;
    homoglyphs: number;
    unknown: number;
  };
}

/**
 * Dispatches verification analytical telemetry asynchronously to the Umami REST interface.
 * Implements a 5-second socket timeout and TCP stream drainage for server safety.
 */
export function recordVerificationTelemetry({ itemCount, resultsSummary }: TelemetryParams) {
  if (config.NODE_ENV !== 'production' || !config.UMAMI_WEBSITE_ID) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000);

  const requestBody = {
    payload: {
      hostname: 'rafifmsn.com',
      url: '/api/v1/verify',
      website: config.UMAMI_WEBSITE_ID,
      name: 'batch-verify',
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

  fetch(`${config.UMAMI_URL}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Server) Umami/Custom-Client',
    },
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
