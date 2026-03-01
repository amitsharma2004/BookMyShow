import Redis from 'ioredis';

/**
 * createRedisClient — factory that returns a configured ioredis instance.
 *
 * Redis is used for:
 *   - US-008: Distributed seat locking (SET NX PX + Lua release)
 *   - US-010: Keyspace notifications for TTL expiry → AVAILABLE seat events
 *
 * Key schema (frozen per architecture plan):
 *   seat:<showId>:<seatId>  →  userId (lock owner)
 */
export function createRedisClient(): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    lazyConnect: true,
    // Reconnect strategy: exponential back-off up to 30 s
    retryStrategy: (times: number) => Math.min(times * 200, 30_000),
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  return client;
}
