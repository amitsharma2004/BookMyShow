import { Repository } from 'typeorm';
import { BookingService } from './booking.service';
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

// ── Mock factories ────────────────────────────────────────────────────────────
type MockRepo<T> = Pick<Repository<T>, 'findOne' | 'create' | 'save'> & {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function mockRepo<T>(): MockRepo<T> {
  return { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
}

type MockLock = {
  acquireLock: jest.Mock;
  releaseLock: jest.Mock;
  getLockOwner: jest.Mock;
};

function mockLockService(): MockLock {
  return {
    acquireLock: jest.fn(),
    releaseLock: jest.fn(),
    getLockOwner: jest.fn(),
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const SHOW_ID    = 'show-uuid-001';
const SEAT_ID    = 'seat-uuid-001';
const USER_A     = 'user-A-uuid';
const USER_B     = 'user-B-uuid';
const BOOKING_ID = 'booking-uuid-001';
const SS_ID      = 'show-seat-uuid-001';

const availableShowSeat: Partial<ShowSeat> = {
  id: SS_ID,
  showId: SHOW_ID,
  seatId: SEAT_ID,
  status: SeatStatus.AVAILABLE,
};

const lockedShowSeat: Partial<ShowSeat> = {
  ...availableShowSeat,
  status: SeatStatus.LOCKED,
};

const pendingBooking: Partial<Booking> = {
  id: BOOKING_ID,
  userId: USER_A,
  showSeatId: SS_ID,
  showSeat: lockedShowSeat as ShowSeat,
  status: BookingStatus.PENDING,
  lockToken: USER_A,
};

// ── Test suite ─────────────────────────────────────────────────────────────────
describe('BookingService', () => {
  let service: BookingService;
  let bookingRepo: MockRepo<Booking>;
  let showSeatRepo: MockRepo<ShowSeat>;
  let redisLock: MockLock;

  beforeEach(() => {
    bookingRepo  = mockRepo<Booking>();
    showSeatRepo = mockRepo<ShowSeat>();
    redisLock    = mockLockService();

    service = new BookingService(
      bookingRepo as unknown as Repository<Booking>,
      showSeatRepo as unknown as Repository<ShowSeat>,
      redisLock as unknown as RedisLockService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── lockSeat ──────────────────────────────────────────────────────────────
  describe('lockSeat', () => {
    it('creates PENDING booking when seat is AVAILABLE and Redis lock acquired', async () => {
      showSeatRepo.findOne.mockResolvedValue({ ...availableShowSeat });
      showSeatRepo.save.mockResolvedValue({ ...availableShowSeat, status: SeatStatus.LOCKED });
      redisLock.acquireLock.mockResolvedValue({ acquired: true });
      bookingRepo.create.mockReturnValue({ ...pendingBooking });
      bookingRepo.save.mockResolvedValue({ ...pendingBooking });

      const result = await service.lockSeat(SHOW_ID, SEAT_ID, USER_A);

      expect(result.status).toBe(BookingStatus.PENDING);
      expect(result.userId).toBe(USER_A);
      expect(result.lockToken).toBe(USER_A);

      // ShowSeat must be persisted as LOCKED
      expect(showSeatRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SeatStatus.LOCKED }),
      );
      // Redis lock must have been acquired with correct key parts
      expect(redisLock.acquireLock).toHaveBeenCalledWith(SHOW_ID, SEAT_ID, USER_A);
    });

    it('throws NotFoundException when ShowSeat does not exist', async () => {
      showSeatRepo.findOne.mockResolvedValue(null);
      await expect(service.lockSeat(SHOW_ID, SEAT_ID, USER_A)).rejects.toThrow(NotFoundException);
      expect(redisLock.acquireLock).not.toHaveBeenCalled();
    });

    it('throws ConflictException when seat is already LOCKED in DB', async () => {
      showSeatRepo.findOne.mockResolvedValue({ ...lockedShowSeat });
      await expect(service.lockSeat(SHOW_ID, SEAT_ID, USER_A)).rejects.toThrow(ConflictException);
      expect(redisLock.acquireLock).not.toHaveBeenCalled();
    });

    it('throws ConflictException when seat is already BOOKED in DB', async () => {
      showSeatRepo.findOne.mockResolvedValue({ ...availableShowSeat, status: SeatStatus.BOOKED });
      await expect(service.lockSeat(SHOW_ID, SEAT_ID, USER_A)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when Redis lock is held by another user — contention', async () => {
      showSeatRepo.findOne.mockResolvedValue({ ...availableShowSeat });
      redisLock.acquireLock.mockResolvedValue({ acquired: false }); // User B holds lock
      await expect(service.lockSeat(SHOW_ID, SEAT_ID, USER_A)).rejects.toThrow(ConflictException);

      // ShowSeat status must NOT be mutated when lock fails
      expect(showSeatRepo.save).not.toHaveBeenCalled();
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });

    it('does not mutate ShowSeat if Redis lock acquisition fails', async () => {
      showSeatRepo.findOne.mockResolvedValue({ ...availableShowSeat });
      redisLock.acquireLock.mockResolvedValue({ acquired: false });
      await expect(service.lockSeat(SHOW_ID, SEAT_ID, USER_A)).rejects.toThrow();
      expect(showSeatRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── confirmPayment ────────────────────────────────────────────────────────
  describe('confirmPayment', () => {
    it('sets Booking=CONFIRMED and ShowSeat=BOOKED, releases Redis lock', async () => {
      bookingRepo.findOne.mockResolvedValue({ ...pendingBooking });
      showSeatRepo.save.mockResolvedValue({ ...lockedShowSeat, status: SeatStatus.BOOKED });
      bookingRepo.save.mockResolvedValue({ ...pendingBooking, status: BookingStatus.CONFIRMED });
      redisLock.releaseLock.mockResolvedValue(true);

      const result = await service.confirmPayment(BOOKING_ID, USER_A);

      expect(result.status).toBe(BookingStatus.CONFIRMED);

      // ShowSeat must be saved as BOOKED
      expect(showSeatRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SeatStatus.BOOKED }),
      );
      // Redis lock must be released with correct args
      expect(redisLock.releaseLock).toHaveBeenCalledWith(SHOW_ID, SEAT_ID, USER_A);
    });

    it('throws NotFoundException for unknown bookingId', async () => {
      bookingRepo.findOne.mockResolvedValue(null);
      await expect(service.confirmPayment('bad-id', USER_A)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when userId does not own the booking', async () => {
      bookingRepo.findOne.mockResolvedValue({ ...pendingBooking, userId: USER_A });
      await expect(service.confirmPayment(BOOKING_ID, USER_B)).rejects.toThrow(ForbiddenException);
      expect(redisLock.releaseLock).not.toHaveBeenCalled();
    });

    it('throws ConflictException when booking is already CONFIRMED', async () => {
      bookingRepo.findOne.mockResolvedValue({
        ...pendingBooking,
        status: BookingStatus.CONFIRMED,
      });
      await expect(service.confirmPayment(BOOKING_ID, USER_A)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when booking is already CANCELLED', async () => {
      bookingRepo.findOne.mockResolvedValue({
        ...pendingBooking,
        status: BookingStatus.CANCELLED,
      });
      await expect(service.confirmPayment(BOOKING_ID, USER_A)).rejects.toThrow(ConflictException);
    });
  });

  // ── cancelPayment ─────────────────────────────────────────────────────────
  describe('cancelPayment', () => {
    it('sets Booking=CANCELLED and ShowSeat=AVAILABLE, releases Redis lock', async () => {
      bookingRepo.findOne.mockResolvedValue({ ...pendingBooking });
      showSeatRepo.save.mockResolvedValue({ ...lockedShowSeat, status: SeatStatus.AVAILABLE });
      bookingRepo.save.mockResolvedValue({ ...pendingBooking, status: BookingStatus.CANCELLED });
      redisLock.releaseLock.mockResolvedValue(true);

      const result = await service.cancelPayment(BOOKING_ID, USER_A);

      expect(result.status).toBe(BookingStatus.CANCELLED);

      // ShowSeat must be restored to AVAILABLE
      expect(showSeatRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SeatStatus.AVAILABLE }),
      );
      expect(redisLock.releaseLock).toHaveBeenCalledWith(SHOW_ID, SEAT_ID, USER_A);
    });

    it('throws NotFoundException for unknown bookingId', async () => {
      bookingRepo.findOne.mockResolvedValue(null);
      await expect(service.cancelPayment('bad-id', USER_A)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when userId does not own the booking', async () => {
      bookingRepo.findOne.mockResolvedValue({ ...pendingBooking, userId: USER_A });
      await expect(service.cancelPayment(BOOKING_ID, USER_B)).rejects.toThrow(ForbiddenException);
      expect(redisLock.releaseLock).not.toHaveBeenCalled();
    });

    it('throws ConflictException when booking is already CONFIRMED', async () => {
      bookingRepo.findOne.mockResolvedValue({
        ...pendingBooking,
        status: BookingStatus.CONFIRMED,
      });
      await expect(service.cancelPayment(BOOKING_ID, USER_A)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when booking is already CANCELLED', async () => {
      bookingRepo.findOne.mockResolvedValue({
        ...pendingBooking,
        status: BookingStatus.CANCELLED,
      });
      await expect(service.cancelPayment(BOOKING_ID, USER_A)).rejects.toThrow(ConflictException);
    });

    it('restores ShowSeat to AVAILABLE so concurrent users can re-lock it', async () => {
      bookingRepo.findOne.mockResolvedValue({ ...pendingBooking });
      redisLock.releaseLock.mockResolvedValue(true);
      bookingRepo.save.mockResolvedValue({ ...pendingBooking, status: BookingStatus.CANCELLED });
      showSeatRepo.save.mockImplementation((ss) => Promise.resolve(ss));

      await service.cancelPayment(BOOKING_ID, USER_A);

      const savedShowSeat = showSeatRepo.save.mock.calls[0][0];
      expect(savedShowSeat.status).toBe(SeatStatus.AVAILABLE);
    });
  });

  // ── getBooking ────────────────────────────────────────────────────────────
  describe('getBooking', () => {
    it('returns booking for authenticated owner', async () => {
      bookingRepo.findOne.mockResolvedValue({ ...pendingBooking });
      const result = await service.getBooking(BOOKING_ID, USER_A);
      expect(result.id).toBe(BOOKING_ID);
    });

    it('throws NotFoundException for unknown booking', async () => {
      bookingRepo.findOne.mockResolvedValue(null);
      await expect(service.getBooking('bad-id', USER_A)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the booking', async () => {
      bookingRepo.findOne.mockResolvedValue({ ...pendingBooking, userId: USER_A });
      await expect(service.getBooking(BOOKING_ID, USER_B)).rejects.toThrow(ForbiddenException);
    });
  });
});
