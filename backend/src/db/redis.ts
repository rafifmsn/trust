import Redis from 'ioredis';
import { config } from '../config';

// Define typed client extending ioredis for our custom defined command
interface CustomRedis extends Redis {
  consumeTokens(
    key: string,
    capacity: number,
    refillRate: number,
    decrement: number,
    now: number
  ): Promise<number>;
}

// Commands Client
export const redisInstance = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
}) as CustomRedis;

// Subscriber Client (strictly for Pub/Sub subscription mapping)
export const redisSubInstance = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const LUA_TOKEN_BUCKET = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local decrement = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Get current bucket stats
local data = redis.call('HMGET', key, 'tokens', 'last_updated')
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if not tokens then
  tokens = capacity
  last_updated = now
else
  local elapsed = now - last_updated
  if elapsed > 0 then
    tokens = math.min(capacity, tokens + (elapsed * refill_rate))
    last_updated = now
  end
end

if tokens >= decrement then
  tokens = tokens - decrement
  redis.call('HMSET', key, 'tokens', tokens, 'last_updated', last_updated)
  redis.call('EXPIRE', key, 86400)
  return 1 -- Allowed
else
  redis.call('HMSET', key, 'tokens', tokens, 'last_updated', last_updated)
  redis.call('EXPIRE', key, 86400)
  return 0 -- Denied
end
`;

// Define the custom lua script on the client
redisInstance.defineCommand('consumeTokens', {
  numberOfKeys: 1,
  lua: LUA_TOKEN_BUCKET,
});

redisInstance.on('connect', () => {
  console.log('[Redis] Command connection established.');
});

redisInstance.on('error', (err) => {
  console.error('[Redis] Main client error:', err);
});

redisSubInstance.on('error', (err) => {
  console.error('[Redis] Sub client error:', err);
});
