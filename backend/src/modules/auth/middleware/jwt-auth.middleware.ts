import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

/** Extend Express Request to carry the decoded JWT payload */
export interface AuthRequest extends Request {
  user?: { userId: string; email: string; role: string };
}

/**
 * jwtAuthMiddleware — replaces NestJS JwtAuthGuard.
 * Reads `Authorization: Bearer <token>`, verifies it, and attaches
 * the decoded payload to req.user. Returns 401 if missing or invalid.
 */
export function jwtAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ statusCode: 401, message: 'Unauthorized — missing Bearer token' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    req.user = { userId: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ statusCode: 401, message: 'Unauthorized — invalid or expired token' });
  }
}
