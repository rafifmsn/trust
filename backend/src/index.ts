import { initializeState } from './services/synchronizer';
import { app } from './routes';
import { config } from './config';
import { redisInstance, redisSubInstance } from './db/redis';

// Boot strap state
await initializeState();

// Start Elysia Server
app.listen(config.PORT);

console.log(`[API] Server is listening on http://localhost:${config.PORT} in ${config.NODE_ENV} mode.`);

// Graceful shutdown handler
const handleShutdown = async (signal: string) => {
  console.log(`\n[API] Received ${signal}. Starting graceful shutdown...`);

  try {
    // 1. Unsubscribe from Pub/Sub
    console.log('[Redis] Unsubscribing from state channels...');
    await redisSubInstance.unsubscribe('state:updates');

    // 2. Shut down Redis clients
    console.log('[Redis] Terminating connection pools...');
    await Promise.all([
      redisInstance.quit(),
      redisSubInstance.quit()
    ]);
    console.log('[Redis] Connections drained successfully.');
  } catch (err) {
    console.error('[Shutdown] Error draining connection pools:', err);
  }

  console.log('[API] Shutdown complete. Exiting process.');
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export type App = typeof app;
