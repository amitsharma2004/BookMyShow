import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BookingService } from './booking.service';
import {
  jwtAuthMiddleware,
  AuthRequest,
} from '../auth/middleware/jwt-auth.middleware';

// ── Zod schema ────────────────────────────────────────────────────────────────
const LockSeatSchema = z.object({
  showId: z.string().uuid('showId must be a valid UUID'),
  seatId: z.string().uuid('seatId must be a valid UUID'),
});

function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        statusCode: 400,
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function createBookingRouter(bookingService: BookingService): Router {
  const router = Router();

  /**
   * POST /api/v1/bookings/lock
   *
   * Acquires a Redis distributed lock on the seat and creates a PENDING booking.
   * Returns 409 if the seat is already LOCKED/BOOKED or another user holds the Redis lock.
   *
   * Body: { showId: UUID, seatId: UUID }
   * Auth: Bearer JWT required
   */
  router.post(
    '/lock',
    jwtAuthMiddleware,
    validateBody(LockSeatSchema),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const { showId, seatId } = req.body;
        const userId = req.user!.userId;
        const booking = await bookingService.lockSeat(showId, seatId, userId);
        res.status(201).json(booking);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /api/v1/bookings/:id
   *
   * Fetch a booking by ID (authenticated user must own the booking).
   */
  router.get(
    '/:id',
    jwtAuthMiddleware,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const booking = await bookingService.getBooking(
          req.params.id,
          req.user!.userId,
        );
        res.json(booking);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
