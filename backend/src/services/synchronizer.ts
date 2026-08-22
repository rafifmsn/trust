import { readFileSync, existsSync } from 'fs';
import { config } from '../config';
import { redisInstance, redisSubInstance } from '../db/redis';

// Local, fast-path memory copy of the whitelist.
export let activeWhitelist = new Set<string>();
export let maxWhitelistLength = 0;

/**
 * Validates and sanitizes seed inputs
 */
function sanitizeSeedDomains(domains: unknown): string[] {
  if (!Array.isArray(domains)) {
    throw new Error('Seed domain data must be a JSON array of strings.');
  }
  return domains
    .map(d => String(d).trim().toLowerCase())
    .filter(d => d.length > 0 && d.includes('.') && !d.includes(' ') && d.length <= 253);
}

/**
 * Hydrates state from seed/domains.json and loads it into Redis and local RAM on start.
 */
export async function initializeState() {
  console.log('[Synchronizer] Initializing startup state...');

  // 1. Establish Redis connection with retry loop
  try {
    await waitForRedis();
  } catch (err) {
    console.error('[Synchronizer] Redis availability failure during bootstrap:', err);
    throw err; // propagates startup crash
  }

  let domains: string[] = [];

  // 2. Read the seed file
  if (existsSync(config.SEED_DOMAINS_PATH)) {
    try {
      const raw = readFileSync(config.SEED_DOMAINS_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      domains = sanitizeSeedDomains(parsed);
      console.log(`[Synchronizer] Loaded ${domains.length} sanitized domains from seed file.`);
    } catch (err) {
      console.error('[Synchronizer] Failed to read or validate seed file:', err);
    }
  } else {
    console.warn(`[Synchronizer] Seed file not found at ${config.SEED_DOMAINS_PATH}. Starting empty.`);
  }

  // 3. Hydrate local RAM cache immediately for fast bootstrap
  const newSet = new Set<string>();
  let newMax = 0;
  for (const domain of domains) {
    newSet.add(domain);
    if (domain.length > newMax) {
      newMax = domain.length;
    }
  }
  activeWhitelist = newSet;
  maxWhitelistLength = newMax;

  // 4. Sync to Redis (overwriting the base set and keys)
  if (domains.length > 0) {
    try {
      const pipeline = redisInstance.pipeline();

      // Retrieve existing keys to clean them up (so deleted seeds don't linger)
      const oldKeys = await redisInstance.smembers('whitelist_set');
      for (const oldKey of oldKeys) {
        pipeline.del(`whitelist_doc:${oldKey}`);
      }
      pipeline.del('whitelist_set');

      // Populate new seeds
      for (const domain of domains) {
        pipeline.sadd('whitelist_set', domain);
        pipeline.set(`whitelist_doc:${domain}`, 'VERIFIED');
      }

      await pipeline.exec();
      console.log('[Synchronizer] Redis database state successfully seeded.');
    } catch (err) {
      console.error('[Synchronizer] Failed to seed Redis database state:', err);
    }
  }

  // 5. Setup sub-channel listener for hot resets
  setupSubscriptionListener();
}

async function waitForRedis(retries = 5, delayMs = 1500): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`[Redis] Checking connection status (attempt ${i}/${retries})...`);
      await redisInstance.ping();
      console.log('[Redis] Server is reachable and ready.');
      return;
    } catch (err) {
      console.warn(`[Redis] Connection attempt ${i} failed. Retrying in ${delayMs}ms...`);
      if (i === retries) {
        throw new Error(`Failed to establish connection to Redis server after ${retries} attempts: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

/**
 * Sets up subscription listener on the Pub/Sub channel.
 */
function setupSubscriptionListener() {
  redisSubInstance.subscribe('state:updates', (err) => {
    if (err) {
      console.error('[Synchronizer] Subscription subscription error:', err);
    } else {
      console.log('[Synchronizer] Subscribed to state:updates hot-reload channel.');
    }
  });

  redisSubInstance.on('message', async (channel, message) => {
    if (channel === 'state:updates' && message === 'RELOAD_DOMAINS') {
      console.log('[Synchronizer] Hot-reload notification received. Pulling updates from Redis...');
      try {
        // Fetch keys from whitelist set cleanly without using KEYS command
        const members = await redisInstance.smembers('whitelist_set');

        const newSet = new Set<string>();
        let newMax = 0;
        for (const member of members) {
          newSet.add(member);
          if (member.length > newMax) {
            newMax = member.length;
          }
        }

        // Swap reference atomically for zero-downtime hot-reload
        activeWhitelist = newSet;
        maxWhitelistLength = newMax;
        console.log(`[Synchronizer] Local RAM cache hot-reloaded. Count: ${activeWhitelist.size}, Max Length: ${maxWhitelistLength}`);
      } catch (err) {
        console.error('[Synchronizer] Failed to complete hot-reload from Redis:', err);
      }
    }
  });
}

/**
 * Reloads seed file into Redis and notifies all nodes to synchronize.
 */
export async function triggerStateSync() {
  console.log('[Synchronizer] Manual reload triggered. Reading seed file...');

  if (!existsSync(config.SEED_DOMAINS_PATH)) {
    throw new Error(`Seed domain file not found at ${config.SEED_DOMAINS_PATH}`);
  }

  const raw = readFileSync(config.SEED_DOMAINS_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  const domains = sanitizeSeedDomains(parsed);

  const pipeline = redisInstance.pipeline();

  // Clear previous Redis values
  const oldMembers = await redisInstance.smembers('whitelist_set');
  for (const member of oldMembers) {
    pipeline.del(`whitelist_doc:${member}`);
  }
  pipeline.del('whitelist_set');

  // Push new ones
  for (const domain of domains) {
    pipeline.sadd('whitelist_set', domain);
    pipeline.set(`whitelist_doc:${domain}`, 'VERIFIED');
  }

  await pipeline.exec();

  // Broadcast to all backend instances
  await redisInstance.publish('state:updates', 'RELOAD_DOMAINS');
  console.log('[Synchronizer] Update broadcast sent to pub/sub.');
}
