import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * InitialSchema — creates the full database schema for the Movie Reservation System.
 *
 * Tables created (in dependency order):
 *   1. users
 *   2. movies
 *   3. theaters
 *   4. seats         (FK → theaters)
 *   5. shows         (FK → movies, theaters; composite index on show_time + movie_id)
 *   6. show_seats    (FK → shows, seats; composite unique on show_id + seat_id)
 *   7. bookings      (FK → users, show_seats)
 *
 * Design note (US-007 architect constraint):
 *   - Seat.status is a base default field that defaults to AVAILABLE and is never mutated.
 *   - ShowSeat.status carries the mutable per-show seat status.
 *   - Redis lock key schema: seat:<showId>:<seatId>  (frozen per Phase 4 plan)
 */
export class InitialSchema1740787200000 implements MigrationInterface {
  name = 'InitialSchema1740787200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "seat_status_enum" AS ENUM ('AVAILABLE', 'LOCKED', 'BOOKED')
    `);
    await queryRunner.query(`
      CREATE TYPE "seat_type_enum" AS ENUM ('REGULAR', 'PREMIUM', 'VIP')
    `);
    await queryRunner.query(`
      CREATE TYPE "show_status_enum" AS ENUM ('ACTIVE', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TYPE "booking_status_enum" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED')
    `);

    // ── users ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "email"         VARCHAR NOT NULL UNIQUE,
        "password_hash" VARCHAR NOT NULL,
        "role"          VARCHAR NOT NULL DEFAULT 'USER',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── movies ───────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "movies" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "title"            VARCHAR NOT NULL,
        "description"      TEXT,
        "genre"            TEXT NOT NULL,
        "cast"             TEXT NOT NULL,
        "release_date"     DATE NOT NULL,
        "duration_minutes" INTEGER NOT NULL,
        "poster_url"       VARCHAR,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── theaters ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "theaters" (
        "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name"          VARCHAR NOT NULL,
        "location"      VARCHAR NOT NULL,
        "total_rows"    INTEGER NOT NULL,
        "total_columns" INTEGER NOT NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── seats ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "seats" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "theater_id"  UUID NOT NULL REFERENCES "theaters"("id") ON DELETE CASCADE,
        "row_label"   VARCHAR(2) NOT NULL,
        "seat_number" INTEGER NOT NULL,
        "seat_type"   "seat_type_enum" NOT NULL DEFAULT 'REGULAR',
        "status"      "seat_status_enum" NOT NULL DEFAULT 'AVAILABLE',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_seat_theater_id" ON "seats" ("theater_id")
    `);

    // ── shows ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "shows" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "movie_id"    UUID NOT NULL REFERENCES "movies"("id") ON DELETE RESTRICT,
        "theater_id"  UUID NOT NULL REFERENCES "theaters"("id") ON DELETE RESTRICT,
        "show_time"   TIMESTAMPTZ NOT NULL,
        "status"      "show_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Composite index for the common "list shows for a movie on a given date" query
    await queryRunner.query(`
      CREATE INDEX "idx_show_time_movie_id" ON "shows" ("show_time", "movie_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_show_movie_id" ON "shows" ("movie_id")
    `);

    // ── show_seats ───────────────────────────────────────────────────────────
    // Per-show seat status — the mutable source of truth.
    // Composite unique prevents duplicate ShowSeat rows for the same (show, seat).
    await queryRunner.query(`
      CREATE TABLE "show_seats" (
        "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "show_id"    UUID NOT NULL REFERENCES "shows"("id") ON DELETE CASCADE,
        "seat_id"    UUID NOT NULL REFERENCES "seats"("id") ON DELETE CASCADE,
        "status"     "seat_status_enum" NOT NULL DEFAULT 'AVAILABLE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_show_seat" UNIQUE ("show_id", "seat_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_show_seat_show_id" ON "show_seats" ("show_id")
    `);

    // ── bookings ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"      UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "show_seat_id" UUID NOT NULL REFERENCES "show_seats"("id") ON DELETE RESTRICT,
        "status"       "booking_status_enum" NOT NULL DEFAULT 'PENDING',
        "lock_token"   VARCHAR,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "show_seats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shows"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "theaters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "movies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "booking_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "show_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "seat_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "seat_status_enum"`);
  }
}
