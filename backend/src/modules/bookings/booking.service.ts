import { Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { ShowSeat } from '../shows/entities/show-seat.entity';
import { RedisLockService } from '../redis/redis-lock.service';
import { BookingStatus } from '../../common/enums/booking-status.enum';
import { SeatStatus } from '../../common/enums/seat-status.enum';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '../../common/exceptions/http.exception';

/**
 * BookingService — orchestrates the full seat reservation lifecycle.
 *
 * Flow:
 *   lockSeat       → acquireLock (Redis) + ShowSeat=LOCKED + Booking(PENDING)
 *   confirmPayment → releaseLock (Redis) + ShowSeat=BOOKED  + Booking(CONFIRMED)
 *   cancelPayment  → releaseLock (Redis) + ShowSeat=AVAILABLE + Booking(CANCELLED)
 *
 * Redis key schema (frozen): seat:<showId>:<seatId>
 * Lock value = userId — stored in Booking.lockToken for release in confirm/cancel.
 */
export class BookingService {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly showSeatRepo: Repository<ShowSeat>,
    private readonly redisLockService: RedisLockService,
  ) {}

  /**
   * lockSeat — atomically reserves a seat for a user.
   *
   * Steps:
   *   1. Find ShowSeat by (showId, seatId) — 404 if not found
   *   2. Verify ShowSeat.status === AVAILABLE — 409 if LOCKED or BOOKED
   *   3. acquireLock via Redis SET PX NX — 409 if another user holds the lock
   *   4. Persist ShowSeat.status = LOCKED
   *   5. Create PENDING Booking, store userId as lockToken
   */
  async lockSeat(showId: string, seatId: string, userId: string): Promise<Booking> {
    // 1. Find ShowSeat
    const showSeat = await this.showSeatRepo.findOne({
      where: { showId, seatId },
    });
    if (!showSeat) {
      throw new NotFoundException(`Seat ${seatId} not found in show ${showId}`);
    }

    // 2. Check ShowSeat is AVAILABLE in DB
    if (showSeat.status !== SeatStatus.AVAILABLE) {
      throw new ConflictException(
        `Seat is already ${showSeat.status} — cannot lock`,
      );
    }

    // 3. Acquire Redis distributed lock
    const { acquired } = await this.redisLockService.acquireLock(showId, seatId, userId);
    if (!acquired) {
      throw new ConflictException(
        'Seat is being locked by another user — please try again',
      );
    }

    // 4. Persist ShowSeat → LOCKED (DB source of truth reflects Redis state)
    showSeat.status = SeatStatus.LOCKED;
    await this.showSeatRepo.save(showSeat);

    // 5. Create PENDING booking; lockToken = userId for Redis release
    const booking = this.bookingRepo.create({
      userId,
      showSeatId: showSeat.id,
      status: BookingStatus.PENDING,
      lockToken: userId,
    });
    return this.bookingRepo.save(booking);
  }

  /**
   * confirmPayment — finalises a booking after successful payment.
   *
   * Steps:
   *   1. Find booking with showSeat relation — 404 if not found
   *   2. Verify booking.userId === userId — 403 if mismatch
   *   3. Verify booking.status === PENDING — 409 if already confirmed/cancelled
   *   4. Release Redis lock (Lua script)
   *   5. Persist ShowSeat → BOOKED
   *   6. Persist Booking → CONFIRMED
   */
  async confirmPayment(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['showSeat'],
    });
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (booking.userId !== userId) {
      throw new ForbiddenException('Not authorised to confirm this booking');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new ConflictException(
        `Booking is already ${booking.status} — cannot confirm`,
      );
    }

    const { showId, seatId } = booking.showSeat;

    // Release Redis lock — Lua script ensures only owner can release
    await this.redisLockService.releaseLock(showId, seatId, booking.lockToken);

    // ShowSeat → BOOKED (permanent)
    booking.showSeat.status = SeatStatus.BOOKED;
    await this.showSeatRepo.save(booking.showSeat);

    // Booking → CONFIRMED
    booking.status = BookingStatus.CONFIRMED;
    return this.bookingRepo.save(booking);
  }

  /**
   * cancelPayment — voids a pending booking.
   *
   * Steps:
   *   1. Find booking with showSeat relation — 404 if not found
   *   2. Verify booking.userId === userId — 403 if mismatch
   *   3. Verify booking.status === PENDING — 409 if already confirmed/cancelled
   *   4. Release Redis lock (Lua script)
   *   5. Persist ShowSeat → AVAILABLE (seat returns to pool)
   *   6. Persist Booking → CANCELLED
   */
  async cancelPayment(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['showSeat'],
    });
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (booking.userId !== userId) {
      throw new ForbiddenException('Not authorised to cancel this booking');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new ConflictException(
        `Booking is already ${booking.status} — cannot cancel`,
      );
    }

    const { showId, seatId } = booking.showSeat;

    // Release Redis lock
    await this.redisLockService.releaseLock(showId, seatId, booking.lockToken);

    // ShowSeat → AVAILABLE (seat returns to pool for other users)
    booking.showSeat.status = SeatStatus.AVAILABLE;
    await this.showSeatRepo.save(booking.showSeat);

    // Booking → CANCELLED
    booking.status = BookingStatus.CANCELLED;
    return this.bookingRepo.save(booking);
  }

  /** getBooking — fetch a booking by ID for the authenticated user */
  async getBooking(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['showSeat'],
    });
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    if (booking.userId !== userId) {
      throw new ForbiddenException('Not authorised to view this booking');
    }
    return booking;
  }
}
