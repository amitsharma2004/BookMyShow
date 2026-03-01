import { Redis } from 'ioredis';

/**
 * Key schema — FROZEN per Phase 4 architecture plan.
 * Must not be changed after US-008; US-009 and US-010 rely on this pattern.
 *   seat:<showId>:<seatId>
 */
export const buildLockKey = (showId: string, seatId: string): string =>
  `seat:${showId}:${seatId}`;

/**
 * Lua script for atomic conditional delete.
 *
 * Why Lua? Redis executes Lua scripts atomically (single-threaded).
 * A plain GET + DEL would be a TOCTOU race:
 *   Thread A: GET → matches → (lock expires) → Thread B sets new lock → Thread A DEL (wrong!)
 * The Lua script eliminates this gap entirely.
 *
 * KEYS[1] : lock key  (seat:<showId>:<seatId>)
 * ARGV[1] : userId    (expected owner)
 *
 * Returns: 1 if deleted (owner matched), 0 otherwise (mismatch or key absent).
 */
const RELEASE_LUA_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export interface AcquireResult {
  /** true if the lock was newly acquired; false if already held */
  acquired: boolean;
}

/**
 * RedisLockService — distributed seat lock using Redis SET NX PX.
 *
 * Lock lifecycle:
 *   acquireLock  → SET seat:<showId>:<seatId> <userId> NX PX <ttlMs>
 *   releaseLock  → Lua: GET + DEL only if value == userId
 *
 * US-009 Booking will call acquireLock before creating a PENDING booking,
 * and releaseLock on payment confirm/cancel.
 *
 * US-010 WebSocket will subscribe to Redis keyspace notifications for
 * `__keyevent@0__:expired` to detect TTL expiry and emit AVAILABLE to clients.
 */
export class RedisLockService {
  private readonly defaultTtlMs: number;

  constructor(
    private readonly redis: Redis,
    defaultTtlMs?: number,
  ) {
    this.defaultTtlMs = defaultTtlMs ?? parseInt(process.env.SEAT_LOCK_TTL_MS || '600000', 10);
  }

  /**
   * acquireLock — atomically sets the lock key if it does not exist.
   *
   * Uses:  SET key userId NX PX ttlMs
   *   NX  → only set if key does NOT exist
   *   PX  → expire in ttlMs milliseconds
   *
   * @returns { acquired: true }  — lock obtained; caller owns the seat
   * @returns { acquired: false } — lock already held; 409 Conflict in US-009
   */
  async acquireLock(
    showId: string,
    seatId: string,
    userId: string,
    ttlMs?: number,
  ): Promise<AcquireResult> {
    const key = buildLockKey(showId, seatId);
    const ttl = ttlMs ?? this.defaultTtlMs;

    // SET key value PX ttl NX → 'OK' if set, null if key already exists
    // ioredis v5 argument order: set(key, value, expiryMode, time, setMode)
    const result = await this.redis.set(key, userId, 'PX', ttl, 'NX');

    return { acquired: result === 'OK' };
  }

  /**
   * releaseLock — atomically deletes the lock only if the stored value == userId.
   *
   * Uses a Lua script (mandatory per architecture plan) to guarantee:
   *   - Only the owner can release their own lock
   *   - No race condition between GET and DEL
   *
   * @returns true  — lock released successfully
   * @returns false — key absent (expired) or userId mismatch (not the owner)
   */
  async releaseLock(
    showId: string,
    seatId: string,
    userId: string,
  ): Promise<boolean> {
    const key = buildLockKey(showId, seatId);
    const result = (await this.redis.eval(RELEASE_LUA_SCRIPT, 1, key, userId)) as number;
    return result === 1;
  }

  /**
   * getLockOwner — returns the userId currently holding the lock, or null.
   * Used by US-009 BookingService to validate the calling user owns the lock
   * before confirming/cancelling payment.
   */
  async getLockOwner(showId: string, seatId: string): Promise<string | null> {
    return this.redis.get(buildLockKey(showId, seatId));
  }

  /**
   * extendLock — refreshes the TTL for an existing lock without releasing it.
   * Only extends if the lock is still owned by userId (Lua-guarded).
   * Useful if payment processing takes longer than the initial TTL.
   */
  async extendLock(
    showId: string,
    seatId: string,
    userId: string,
    ttlMs?: number,
  ): Promise<boolean> {
    const key = buildLockKey(showId, seatId);
    const ttl = ttlMs ?? this.defaultTtlMs;

    const EXTEND_SCRIPT = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = (await this.redis.eval(EXTEND_SCRIPT, 1, key, userId, String(ttl))) as number;
    return result === 1;
  }
}
