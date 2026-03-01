import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BookingService } from './booking.service';
import {
  jwtAuthMiddleware,
  AuthRequest,
} from '../auth/middleware/jwt-auth.middleware';

// ── Zod schema ────────────────────────────────────────────────────────────────
const PaymentSchema = z.object({
  bookingId: z.string().uuid('bookingId must be a valid UUID'),
});

function validateBody(schema: z.ZodSchema) {
  return (req: any, res: Response, next: NextFunction) => {
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

export function createPaymentRouter(bookingService: BookingService): Router {
  const router = Router();

  /**
   * POST /api/v1/payments/confirm
   *
   * Confirms a PENDING booking after successful payment:
   *   - Releases Redis lock (Lua script)
   *   - Sets ShowSeat.status = BOOKED
   *   - Sets Booking.status = CONFIRMED
   *
   * Body: { bookingId: UUID }
   * Auth: Bearer JWT required (must be booking owner)
   */
  router.post(
    '/confirm',
    jwtAuthMiddleware,
    validateBody(PaymentSchema),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const booking = await bookingService.confirmPayment(
          req.body.bookingId,
          req.user!.userId,
        );
        res.json(booking);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /api/v1/payments/cancel
   *
   * Cancels a PENDING booking:
   *   - Releases Redis lock (Lua script)
   *   - Sets ShowSeat.status = AVAILABLE (seat returns to pool)
   *   - Sets Booking.status = CANCELLED
   *
   * Body: { bookingId: UUID }
   * Auth: Bearer JWT required (must be booking owner)
   */
  router.post(
    '/cancel',
    jwtAuthMiddleware,
    validateBody(PaymentSchema),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const booking = await bookingService.cancelPayment(
          req.body.bookingId,
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
