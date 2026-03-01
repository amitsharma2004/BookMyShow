import { RedisLockService, buildLockKey } from './redis-lock.service';
import { Redis } from 'ioredis';

// ── Mock Redis ────────────────────────────────────────────────────────────────
type MockRedis = {
  set: jest.Mock;
  eval: jest.Mock;
  get: jest.Mock;
};

function createMockRedis(): MockRedis {
  return {
    set: jest.fn(),
    eval: jest.fn(),
    get: jest.fn(),
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const SHOW_ID  = 'show-uuid-001';
const SEAT_ID  = 'seat-uuid-001';
const USER_A   = 'user-A-uuid';
const USER_B   = 'user-B-uuid';
const TTL_MS   = 10_000; // 10 s for tests

describe('RedisLockService', () => {
  let service: RedisLockService;
  let redis: MockRedis;

  beforeEach(() => {
    redis = createMockRedis();
    // Direct instantiation — no DI container
    service = new RedisLockService(redis as unknown as Redis, TTL_MS);
  });

  afterEach(() => jest.clearAllMocks());

  // ── buildLockKey ────────────────────────────────────────────────────────────
  describe('buildLockKey (key schema)', () => {
    it('produces frozen key schema seat:<showId>:<seatId>', () => {
      expect(buildLockKey('show-1', 'seat-2')).toBe('seat:show-1:seat-2');
    });

    it('handles UUID-style IDs', () => {
      expect(buildLockKey(SHOW_ID, SEAT_ID)).toBe(`seat:${SHOW_ID}:${SEAT_ID}`);
    });
  });

  // ── acquireLock ─────────────────────────────────────────────────────────────
  describe('acquireLock', () => {
    it('returns { acquired: true } when Redis SET NX succeeds (key did not exist)', async () => {
      redis.set.mockResolvedValue('OK');
      const result = await service.acquireLock(SHOW_ID, SEAT_ID, USER_A);
      expect(result).toEqual({ acquired: true });
    });

    it('calls Redis SET with correct key, userId, PX, TTL, NX (ioredis v5 order)', async () => {
      redis.set.mockResolvedValue('OK');
      await service.acquireLock(SHOW_ID, SEAT_ID, USER_A);
      // ioredis v5 argument order: set(key, value, expiryMode, time, setMode)
      expect(redis.set).toHaveBeenCalledWith(
        `seat:${SHOW_ID}:${SEAT_ID}`,
        USER_A,
        'PX',
        TTL_MS,
        'NX',
      );
    });

    it('returns { acquired: false } when key already exists — contention scenario', async () => {
      // Redis returns null when SET NX fails (key already set)
      redis.set.mockResolvedValue(null);
      const result = await service.acquireLock(SHOW_ID, SEAT_ID, USER_B);
      expect(result).toEqual({ acquired: false });
    });

    it('only first acquirer wins in contention — second call returns false', async () => {
      // User A acquires
      redis.set.mockResolvedValueOnce('OK');
      const r1 = await service.acquireLock(SHOW_ID, SEAT_ID, USER_A);
      expect(r1.acquired).toBe(true);

      // User B tries same seat — Redis NX rejects it
      redis.set.mockResolvedValueOnce(null);
      const r2 = await service.acquireLock(SHOW_ID, SEAT_ID, USER_B);
      expect(r2.acquired).toBe(false);
    });

    it('uses custom TTL when provided', async () => {
      redis.set.mockResolvedValue('OK');
      const customTtl = 5_000;
      await service.acquireLock(SHOW_ID, SEAT_ID, USER_A, customTtl);
      expect(redis.set).toHaveBeenCalledWith(
        expect.any(String), USER_A, 'PX', customTtl, 'NX',
      );
    });

    it('uses default TTL from constructor when no TTL arg provided', async () => {
      redis.set.mockResolvedValue('OK');
      await service.acquireLock(SHOW_ID, SEAT_ID, USER_A);
      expect(redis.set).toHaveBeenCalledWith(
        expect.any(String), USER_A, 'PX', TTL_MS, 'NX',
      );
    });

    it('simulates TTL expiry — second lock on same seat succeeds after expiry', async () => {
      // First acquire by User A
      redis.set.mockResolvedValueOnce('OK');
      const r1 = await service.acquireLock(SHOW_ID, SEAT_ID, USER_A, 1);
      expect(r1.acquired).toBe(true);

      // TTL expires (Redis would have deleted the key)
      // User B can now acquire the same seat
      redis.set.mockResolvedValueOnce('OK');
      const r2 = await service.acquireLock(SHOW_ID, SEAT_ID, USER_B);
      expect(r2.acquired).toBe(true);
    });

    it('different seats on same show can be locked independently', async () => {
      redis.set.mockResolvedValue('OK');
      const r1 = await service.acquireLock(SHOW_ID, 'seat-001', USER_A);
      const r2 = await service.acquireLock(SHOW_ID, 'seat-002', USER_B);
      expect(r1.acquired).toBe(true);
      expect(r2.acquired).toBe(true);
      // Each call used a different key
      expect(redis.set.mock.calls[0][0]).toBe(`seat:${SHOW_ID}:seat-001`);
      expect(redis.set.mock.calls[1][0]).toBe(`seat:${SHOW_ID}:seat-002`);
    });
  });

  // ── releaseLock ─────────────────────────────────────────────────────────────
  describe('releaseLock', () => {
    it('returns true when lock owner releases their own lock (Lua returns 1)', async () => {
      redis.eval.mockResolvedValue(1);
      const result = await service.releaseLock(SHOW_ID, SEAT_ID, USER_A);
      expect(result).toBe(true);
    });

    it('calls eval with a Lua script, key count=1, correct key and userId', async () => {
      redis.eval.mockResolvedValue(1);
      await service.releaseLock(SHOW_ID, SEAT_ID, USER_A);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("GET"'), // Lua script present
        1,
        `seat:${SHOW_ID}:${SEAT_ID}`,
        USER_A,
      );
    });

    it('returns false when lock has already expired (key absent — Lua returns 0)', async () => {
      redis.eval.mockResolvedValue(0);
      const result = await service.releaseLock(SHOW_ID, SEAT_ID, USER_A);
      expect(result).toBe(false);
    });

    it('returns false when non-owner tries to release — Lua userId mismatch (returns 0)', async () => {
      // User A holds the lock; User B attempts release
      redis.eval.mockResolvedValue(0); // Lua: GET returns USER_A ≠ USER_B → 0
      const result = await service.releaseLock(SHOW_ID, SEAT_ID, USER_B);
      expect(result).toBe(false);
    });

    it('Lua script contains DEL guarded by GET comparison', async () => {
      redis.eval.mockResolvedValue(1);
      await service.releaseLock(SHOW_ID, SEAT_ID, USER_A);
      const script = redis.eval.mock.calls[0][0] as string;
      // Verify the Lua script structure
      expect(script).toMatch(/redis\.call\("GET"/);
      expect(script).toMatch(/redis\.call\("DEL"/);
      expect(script).toMatch(/KEYS\[1\]/);
      expect(script).toMatch(/ARGV\[1\]/);
    });
  });

  // ── getLockOwner ────────────────────────────────────────────────────────────
  describe('getLockOwner', () => {
    it('returns userId when lock is held', async () => {
      redis.get.mockResolvedValue(USER_A);
      const owner = await service.getLockOwner(SHOW_ID, SEAT_ID);
      expect(owner).toBe(USER_A);
      expect(redis.get).toHaveBeenCalledWith(`seat:${SHOW_ID}:${SEAT_ID}`);
    });

    it('returns null when lock does not exist (key expired or never set)', async () => {
      redis.get.mockResolvedValue(null);
      const owner = await service.getLockOwner(SHOW_ID, SEAT_ID);
      expect(owner).toBeNull();
    });
  });

  // ── extendLock ──────────────────────────────────────────────────────────────
  describe('extendLock', () => {
    it('returns true when owner successfully extends TTL (Lua returns 1)', async () => {
      redis.eval.mockResolvedValue(1);
      const result = await service.extendLock(SHOW_ID, SEAT_ID, USER_A, 30_000);
      expect(result).toBe(true);
    });

    it('returns false when non-owner tries to extend (Lua userId mismatch)', async () => {
      redis.eval.mockResolvedValue(0);
      const result = await service.extendLock(SHOW_ID, SEAT_ID, USER_B, 30_000);
      expect(result).toBe(false);
    });

    it('returns false when lock has expired before extend is called', async () => {
      redis.eval.mockResolvedValue(0);
      const result = await service.extendLock(SHOW_ID, SEAT_ID, USER_A);
      expect(result).toBe(false);
    });
  });
});
