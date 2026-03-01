import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ShowsService } from './shows.service';
import { jwtAuthMiddleware } from '../auth/middleware/jwt-auth.middleware';

// ── Zod schemas ────────────────────────────────────────────────────────────────
const CreateShowSchema = z.object({
  movieId: z.string().uuid('movieId must be a valid UUID'),
  theaterId: z.string().uuid('theaterId must be a valid UUID'),
  showTime: z.string().datetime({ offset: true, message: 'showTime must be ISO 8601 with timezone' }),
});

const QueryShowsSchema = z.object({
  movieId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ statusCode: 400, message: 'Validation failed', errors: result.error.flatten().fieldErrors });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function createShowsRouter(showsService: ShowsService): Router {
  const router = Router();

  /**
   * POST /api/v1/shows
   * Create a show (admin). Auto-generates ShowSeat rows for all theater seats.
   */
  router.post('/', jwtAuthMiddleware, validateBody(CreateShowSchema), async (req, res, next) => {
    try {
      const show = await showsService.createShow(req.body);
      res.status(201).json(show);
    } catch (err) { next(err); }
  });

  /**
   * GET /api/v1/shows?movieId=&date=&page=&limit=
   * List active shows with optional filters.
   */
  router.get('/', async (req, res, next) => {
    try {
      const parsed = QueryShowsSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ statusCode: 400, message: 'Invalid query params', errors: parsed.error.flatten().fieldErrors });
        return;
      }
      res.json(await showsService.findAll(parsed.data));
    } catch (err) { next(err); }
  });

  /**
   * GET /api/v1/shows/:id
   * Get a show by ID (includes movie + theater).
   */
  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await showsService.findOne(req.params.id));
    } catch (err) { next(err); }
  });

  /**
   * GET /api/v1/shows/:id/seats
   * Returns per-show seat map (ShowSeat.status merged with Seat metadata).
   */
  router.get('/:id/seats', async (req, res, next) => {
    try {
      res.json(await showsService.getShowSeats(req.params.id));
    } catch (err) { next(err); }
  });

  /**
   * PATCH /api/v1/shows/:id/cancel
   * Cancel a show (admin).
   */
  router.patch('/:id/cancel', jwtAuthMiddleware, async (req, res, next) => {
    try {
      res.json(await showsService.cancelShow(req.params.id));
    } catch (err) { next(err); }
  });

  return router;
}
