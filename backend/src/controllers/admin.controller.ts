import { Context } from 'elysia';
import { config } from '../config';
import { triggerStateSync } from '../services/synchronizer';

export async function handleAdminSync(ctx: Context) {
  const { set, request } = ctx;

  // 1. Authorize admin request
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!config.ADMIN_API_KEY || token !== config.ADMIN_API_KEY) {
    set.status = 401;
    return {
      success: false,
      error: 'Unauthorized: Missing or invalid administrative authorization token.',
    };
  }

  try {
    await triggerStateSync();
    return {
      success: true,
      message: 'Synchronizer successfully read new seeds and triggered cluster-wide hot-reload.',
    };
  } catch (err) {
    set.status = 500;
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
