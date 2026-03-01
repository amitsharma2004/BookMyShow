import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MoviesService } from './movies.service';
import { jwtAuthMiddleware } from '../auth/middleware/jwt-auth.middleware';

// ── Zod schemas ────────────────────────────────────────────────────────────────
const CreateMovieSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  genre: z.array(z.string()).min(1),
  cast: z.array(z.string()).min(1),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  durationMinutes: z.number().int().positive(),
  posterUrl: z.string().url().optional(),
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

export function createMoviesRouter(moviesService: MoviesService): Router {
  const router = Router();

  /** POST /api/v1/movies — admin protected */
  router.post('/', jwtAuthMiddleware, validate(CreateMovieSchema), async (req, res, next) => {
    try {
      const movie = await moviesService.create(req.body);
      res.status(201).json(movie);
    } catch (err) { next(err); }
  });

  /** GET /api/v1/movies?page=&limit= */
  router.get('/', async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      res.json(await moviesService.findAll(page, limit));
    } catch (err) { next(err); }
  });

  /** GET /api/v1/movies/:id */
  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await moviesService.findOne(req.params.id));
    } catch (err) { next(err); }
  });

  /** PUT /api/v1/movies/:id — admin protected */
  router.put('/:id', jwtAuthMiddleware, async (req, res, next) => {
    try {
      res.json(await moviesService.update(req.params.id, req.body));
    } catch (err) { next(err); }
  });

  /** DELETE /api/v1/movies/:id — admin protected */
  router.delete('/:id', jwtAuthMiddleware, async (req, res, next) => {
    try {
      await moviesService.remove(req.params.id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
