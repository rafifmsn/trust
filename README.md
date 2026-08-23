<p align="center">
  <img src="./trust-thumb.jpg" alt="Trust" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/rafifmsn/trust/actions/workflows/ci.yml">
    <img src="https://github.com/rafifmsn/trust/actions/workflows/ci.yml/badge.svg" alt="CI Build Status" />
  </a>
  <a href="https://github.com/rafifmsn/trust/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/rafifmsn/trust" alt="License" />
  </a>
  <a href="https://elysiajs.com">
    <img src="https://img.shields.io/badge/built%20with-Elysia-0085de.svg" alt="Built with Elysia" />
  </a>
</p>

<p align="center">A high-performance, containerized link verification microservice built natively with Bun, Elysia, Redis, and Astro. Designed to classify incoming URLs/domains against a trusted whitelist database using high-throughput, sub-millisecond O(1) fast-path lookups.</p>

## Technical Highlights
* **Decoupled Monorepo Architecture**: Clean separation of frontend UI (Astro, Starwind UI) and backend API (Elysia, Bun, Redis) using Bun Workspaces.
* **Dynamic Dev Proxying**: Elysia dynamically proxies static routes to the Astro hot-reloading dev server in development, enabling real-time UI changes on the backend port (3000) without manual rebuilding.
* **High Throughput**: Capable of processing up to ~14,500 domain verifications per second under concurrency.
* **Hybrid Data Store**: Local RAM caches provide $<1\text{ms}$ query fast-path lookups, backed by a centralized Redis state synchronization cluster.
* **Zero-Downtime Hot-Reload**: Whitelist seeding changes take effect instantly across all mesh instances via Redis Pub/Sub channels without stack restarts.
* **Zero-Allocation Levenshtein**: Edit distance matrix calculation uses module-scoped, pre-allocated `Int32Array` buffers to completely eliminate JavaScript garbage collection overhead.

## Repository Tree
```
├── Dockerfile                    # Multi-stage optimized Alpine builder (Node 22 + Bun)
├── docker-compose.yml            # Base Docker Compose services & network mapping
├── docker-compose.benchmark.yml  # K6 benchmarking configuration
├── docker-compose.override.yml   # Local development configuration override
├── docker-compose.prod.yml       # Production VPS configuration override
├── docs/
│   └── architecture.md           # Deep-dive architecture & decision blueprint
├── package.json                  # Root workspaces package configuration
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions CI pipeline
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts              # Elysia entrypoint and process signal handlers
│   │   ├── config.ts             # Env configuration parser
│   │   ├── routes/               # Route definitions & static file serving/proxy
│   │   ├── controllers/          # Domain triage and sync controls
│   │   └── utils/                # eTLD+1 Sanitizer (Punycode normalizer) & Levenshtein
│   └── tests/
│       └── unit.test.ts          # Backend unit test suite
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro       # Core dashboard UI
│   │   │   └── 404.astro         # Custom static 404 error page
│   │   └── layouts/              # Base templates & Starwind styling
│   └── astro.config.ts           # Astro static compilation config
└── seed/
    └── domains.json              # Whitelist base seed file
```

## Quick Start Configuration

### 1. File Setup
Copy the environment variables blueprint to create your active profile:
```bash
cp .env.example .env
```

### 2. Local Workspaces Developer Commands
Since this repository uses Bun Workspaces, you can run all commands directly from the root directory:

* **Install all dependencies** (for both frontend and backend):
  ```bash
  bun install
  ```
* **Run entire stack in development** (starts both Astro dev server + Elysia backend concurrently with hot-reloading):
  ```bash
  bun run dev:all
  ```
* **Run specific workspaces**:
  * Backend API only: `bun run dev:backend` (or manually: `cd backend && bun run dev`)
  * Frontend UI only: `bun run dev:frontend` (or manually: `cd frontend && bun run dev`)
* **Build Frontend Assets**:
  ```bash
  bun run build:frontend
  ```

*The API is now listening at http://localhost:3000. In development mode, Elysia dynamically reverse-proxies assets to Astro's hot-reloading server on port 4321. Note: You may see a temporary browser console warning regarding Vite WebSocket connection fallback — this is safe and expected behavior.*

## Managing Whitelisted Brands (Seeding)

### How to Add New Domains to the Whitelist:
1. Open the seed file at [`seed/domains.json`](./seed/domains.json).
2. Append your new target apex domain to the array (e.g. `"mybrand.com"`).
3. Save the file.
4. **Load the changes using one of the following methods**:

   * **Option A: Trigger a Live Cluster Sync (Zero Downtime - Recommended)**
     Send an authenticated request to the hot-reload endpoint. Elysia will instantly reconcile the Redis state and broadcast a reload notification to all worker nodes to atomically swap their memory pointers:
     ```bash
     curl -X POST -H "Authorization: Bearer <ADMIN_API_KEY>" http://localhost:3000/api/v1/admin/sync
     ```

   * **Option B: Restart the API Container (With Short Downtime)**
     If you don't want to use the API sync endpoint, you can force the API process to restart. This restarts the Bun API runner process while keeping the `redis-store` database container fully alive:
     ```bash
     docker compose restart trust
     ```

## Running Tests
Unit tests run against a local Redis setup. To execute the backend test suite:
```bash
cd backend
bun test
```
*Tests verify domain sanitization, Levenshtein edit distance logic, exact RAM whitelist matching, and Punycode-based homoglyph spoofing.*

## API Endpoints Reference

### 1. Domain Verification
* **Method**: `POST`
* **Path**: `/api/v1/verify`
* **Headers**: `Content-Type: application/json`
* **Body Schema**: (Maximum of 50 domains per request)
```json
{
  "domains": ["google.com", "paypa1.com", "googĺe.com", "unregistered.com"]
}
```
* **Sample Response**:
```json
{
  "success": true,
  "data": [
    {
      "input": "google.com",
      "matched": "google.com",
      "status": "VERIFIED"
    },
    {
      "input": "paypa1.com",
      "matched": "paypal.com",
      "status": "TYPO_IMPERSONATION"
    },
    {
      "input": "googĺe.com",
      "matched": null,
      "status": "HOMOGLYPH_IMPERSONATION"
    },
    {
      "input": "unregistered.com",
      "matched": null,
      "status": "UNKNOWN"
    }
  ]
}
```

* **Classification Statuses**:
  * `VERIFIED`: Exact match against a whitelisted brand.
  * `TYPO_IMPERSONATION`: Fuzzy match within edit distance of 1 from a whitelisted brand (typosquatting).
  * `HOMOGLYPH_IMPERSONATION`: Contains Unicode lookalike characters (homoglyph spoofing).
  * `UNKNOWN`: Safe/unrecognized domain that does not resemble any whitelisted brands.

### 2. Administrative Hot-Reload
* **Method**: `POST`
* **Path**: `/api/v1/admin/sync`
* **Headers**: `Authorization: Bearer <ADMIN_API_KEY>`

## Deployment & Docker Integration

### Multi-Stage Docker Build
Our [`Dockerfile`](./Dockerfile) compiles the Astro frontend under `node:22-alpine` to satisfy Astro engine requirements, then copies the compiled static assets into the fast `oven/bun:1.2.2-alpine` runtime runner for Elysia.

To build and run the production stack:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Load Testing & Benchmarks (k6)

To measure the API's performance without resource contention (preventing `k6` and the API from competing for CPU cycles on the same machine), we use a dedicated hardware-partitioned benchmark compose file:

1. **Start the isolated benchmark stack**:
   This pins the API to CPU cores `0-1` (capped at 512MB RAM) and Redis to core `2` (capped at 256MB RAM with disk-writing disabled for optimal performance):
   ```bash
   docker compose -f docker-compose.benchmark.yml up -d --build
   ```

2. **Run the k6 load test**:
   You can run `k6` directly via Docker (which will execute on CPU cores `3` and above):
   ```bash
   docker run --rm --network host -i grafana/k6 run - <backend/tests/k6-load.js
   ```
   Or if you have `k6` installed locally:
   ```bash
   k6 run backend/tests/k6-load.js
   ```

3. **Tear down the benchmark stack**:
   ```bash
   docker compose -f docker-compose.benchmark.yml down
   ```

### Performance Benchmark Results

Here are the results of a 30-second load test run under the isolated benchmark configuration:

#### Host System Specifications
AMD Ryzen 5 6600H (6 Cores / 12 Threads) @ 4.56GHz, Ubuntu 24.04.4 LTS (Kernel 7.0.0)

#### Container Resource Allocations
* **Elysia API container (`trust-backend`)**: Pinned to CPU cores `0-1`, Memory Limit: `512MB`
* **Redis container (`redis-store`)**: Pinned to CPU core `2`, Memory Limit: `256MB` (Append-Only File disabled)

#### k6 Load Test Metrics (270 Max VUs)
| Metric | Value |
| :--- | :--- |
| **Throughput (Request Rate)** | **16,827.75 req/s** |
| **Total Processed Requests** | **505,178** |
| **Average Response Latency** | **4.16 ms** |
| **Median Response Latency** | **3.88 ms** |
| **p90 Response Latency** | **7.81 ms** |
| **p95 Response Latency** | **8.82 ms** |
| **Max Response Latency** | **18.86 ms** |
| **Network Data Received** | **116 MB** (3.9 MB/s) |
| **Network Data Sent** | **367 MB** (12 MB/s) |

#### System Behavior Under Scaling Load
![System Behavior Under Scaling Load](./benchmark.png)

**Performance Analysis**: Latency remains exceptionally flat at a stable ~4ms up to the system's **Tipping Point of 16,800 req/s**. Beyond this threshold, memory utilization hits its allocated 512MB limit, causing response times to scale linearly due to request queuing while keeping the memory footprint strictly capped and safe from container out-of-memory (OOM) crashes.

> Note: 99.44% of HTTP requests returned 429 (Rate Limited) or 413 (Payload Too Large). This is the correct, expected behavior of the triage pipeline under load, proving that the abuse protection layers actively shield the API from resource depletion under heavy stress.

> The deep-dive of engineering decisions, mathematical optimizations, and serverless constraints are available in **[docs/architecture.md](./docs/architecture.md)**.
