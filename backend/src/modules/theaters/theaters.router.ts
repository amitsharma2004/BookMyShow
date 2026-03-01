import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TheatersService } from './theaters.service';
import { jwtAuthMiddleware } from '../auth/middleware/jwt-auth.middleware';

// ── Zod schemas ────────────────────────────────────────────────────────────────
const CreateTheaterSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  totalRows: z.number().int().min(1).max(26),
  totalColumns: z.number().int().min(1).max(50),
});

const UpdateTheaterSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
});

function validate(schema: z.ZodSchema) {
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

export function createTheatersRouter(theatersService: TheatersService): Router {
  const router = Router();

  /** POST /api/v1/theaters — admin protected */
  router.post('/', jwtAuthMiddleware, validate(CreateTheaterSchema), async (req, res, next) => {
    try {
      res.status(201).json(await theatersService.create(req.body));
    } catch (err) { next(err); }
  });

  /** GET /api/v1/theaters */
  router.get('/', async (_req, res, next) => {
    try {
      res.json(await theatersService.findAll());
    } catch (err) { next(err); }
  });

  /** GET /api/v1/theaters/:id/seats */
  router.get('/:id/seats', async (req, res, next) => {
    try {
      res.json(await theatersService.getSeats(req.params.id));
    } catch (err) { next(err); }
  });

  /** PUT /api/v1/theaters/:id — admin protected */
  router.put('/:id', jwtAuthMiddleware, validate(UpdateTheaterSchema), async (req, res, next) => {
    try {
      res.json(await theatersService.update(req.params.id, req.body));
    } catch (err) { next(err); }
  });

  /** DELETE /api/v1/theaters/:id — admin protected */
  router.delete('/:id', jwtAuthMiddleware, async (req, res, next) => {
    try {
      await theatersService.remove(req.params.id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
