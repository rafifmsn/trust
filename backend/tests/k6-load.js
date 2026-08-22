import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    // Scenario 1: Exact matches, served O(1) from local memory
    exact_match: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      exec: 'runExactMatch',
    },
    // Scenario 2: Algorithmic fuzzy-matching, exercises Levenshtein checks
    fuzzy_match: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30s',
      exec: 'runFuzzyMatch',
    },
    // Scenario 3: Abuse mitigation, checks 429 rate limiter and 413 bounds limit
    abuse_mitigation: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '10s', target: 100 },
        { duration: '20s', target: 200 },
      ],
      exec: 'runAbuseMitigation',
    },
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Payloads definitions
const EXACT_DOMAINS = [
  'paypal.com',
  'google.com',
  'github.com',
  'stripe.com',
  'binance.com',
  'facebook.com',
  'amazon.com',
  'apple.com',
  'microsoft.com',
  'netflix.com',
];

const FUZZY_DOMAINS = [
  'paypa1.com',
  'go0gle.com',
  'githb.com',
  'striipe.com',
  'b1nance.com',
  'faceboook.com',
  'amaz0n.com',
  'app1e.com',
  'micr0soft.com',
  'netf1ix.com',
];

const ABUSE_DOMAINS = Array.from({ length: 60 }, (_, i) => `abuse-domain-${i}.com`);

export function runExactMatch() {
  const payload = JSON.stringify({
    domains: EXACT_DOMAINS.slice(0, 10), // Batch size 10
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': `1.1.1.${__VU % 255}`, // Dynamic IP to simulate distributed traffic
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/verify`, payload, params);

  check(res, {
    'Exact Match status is 200': (r) => r.status === 200,
    'Exact Match contains correct data': (r) => {
      if (r.status !== 200) return false;
      const json = r.json();
      return json && json.data && json.data.every(d => d.status === 'VERIFIED');
    },
  });

  sleep(0.01); // 10ms wait loop
}

export function runFuzzyMatch() {
  const payload = JSON.stringify({
    domains: FUZZY_DOMAINS.slice(0, 10), // Batch size 10
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': `2.2.2.${__VU % 255}`,
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/verify`, payload, params);

  check(res, {
    'Fuzzy Match status is 200': (r) => r.status === 200,
    'Fuzzy Match flags typo impersonations': (r) => {
      if (r.status !== 200) return false;
      const json = r.json();
      return json && json.data && json.data.every(d => d.status === 'TYPO_IMPERSONATION');
    },
  });

  sleep(0.02); // 20ms wait loop (since Levenshtein is compute-heavy)
}

export function runAbuseMitigation() {
  // Rotate between rate limit abuse (429) & payload size abuse (413)
  const isSizeAbuse = Math.random() > 0.5;

  const payload = JSON.stringify({
    domains: isSizeAbuse ? ABUSE_DOMAINS : EXACT_DOMAINS.slice(0, 5),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      // For size abuse, we use dynamic IPs. For rate-limiting, we pin the IP to force hitting token buckets
      'CF-Connecting-IP': isSizeAbuse ? `3.3.3.${__VU % 255}` : '4.4.4.4',
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/verify`, payload, params);

  if (isSizeAbuse) {
    check(res, {
      'Size abuse returns 413': (r) => r.status === 413,
    });
  } else {
    // Expect 200 initially, then 429 once client IP goes over rate limit bounds
    check(res, {
      'Rate limit returns 200 or 429': (r) => r.status === 200 || r.status === 429,
    });
  }

  sleep(0.005); // 5ms wait loop to flood the container
}
