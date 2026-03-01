import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';

// ── Zod schemas ────────────────────────────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Validation middleware factory ──────────────────────────────────────────────
function validate(schema: z.ZodSchema) {
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

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  /** POST /api/v1/auth/register */
  router.post('/register', validate(RegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  /** POST /api/v1/auth/login */
  router.post('/login', validate(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
