import { existsSync } from 'fs';

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Rate limits
  RATE_LIMIT_CAPACITY: parseInt(process.env.RATE_LIMIT_CAPACITY || '100', 10),
  RATE_LIMIT_REFILL_RATE: parseInt(process.env.RATE_LIMIT_REFILL_RATE || '10', 10),

  // Telemetry (Umami)
  UMAMI_URL: process.env.UMAMI_URL || 'https://go.rafifmsn.com',
  UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID || '',

  // Seed configuration (Smart resolver for both container root /app and monorepo workspace sub-paths)
  SEED_DOMAINS_PATH: process.env.SEED_DOMAINS_PATH ||
    (existsSync('../seed/domains.json') ? '../seed/domains.json' : './seed/domains.json'),

  // Admin Configuration
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',
};
