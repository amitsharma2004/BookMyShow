import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { AppDataSource } from './database/data-source';

// Entities — used to get typed TypeORM repositories
import { User } from './modules/users/entities/user.entity';
import { Movie } from './modules/movies/entities/movie.entity';
import { Theater } from './modules/theaters/entities/theater.entity';
import { Seat } from './modules/theaters/entities/seat.entity';
import { Show } from './modules/shows/entities/show.entity';
import { ShowSeat } from './modules/shows/entities/show-seat.entity';

// Services
import { AuthService } from './modules/auth/auth.service';
import { MoviesService } from './modules/movies/movies.service';
import { TheatersService } from './modules/theaters/theaters.service';
import { ShowsService } from './modules/shows/shows.service';

// Routers
import { createAuthRouter } from './modules/auth/auth.router';
import { createMoviesRouter } from './modules/movies/movies.router';
import { createTheatersRouter } from './modules/theaters/theaters.router';
import { createShowsRouter } from './modules/shows/shows.router';

// Custom exceptions for error handler
import { HttpException } from './common/exceptions/http.exception';

/**
 * createApp — Express application factory.
 *
 * Initialises the TypeORM DataSource, wires repositories → services → routers,
 * and mounts all API routes under /api/v1/.
 * Returns the configured Express app (testable without listening on a port).
 */
export async function createApp() {
  // ── Database ─────────────────────────────────────────────────────────────
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const app = express();

  // ── Global middleware ─────────────────────────────────────────────────────
  app.use(cors());
  app.use(express.json());

  // ── Wire repositories → services ─────────────────────────────────────────
  const userRepo     = AppDataSource.getRepository(User);
  const movieRepo    = AppDataSource.getRepository(Movie);
  const theaterRepo  = AppDataSource.getRepository(Theater);
  const seatRepo     = AppDataSource.getRepository(Seat);
  const showRepo     = AppDataSource.getRepository(Show);
  const showSeatRepo = AppDataSource.getRepository(ShowSeat);

  const authService     = new AuthService(userRepo);
  const moviesService   = new MoviesService(movieRepo);
  const theatersService = new TheatersService(theaterRepo, seatRepo);
  const showsService    = new ShowsService(showRepo, showSeatRepo, seatRepo, movieRepo, theaterRepo);

  // ── Mount routers ─────────────────────────────────────────────────────────
  app.use('/api/v1/auth',     createAuthRouter(authService));
  app.use('/api/v1/movies',   createMoviesRouter(moviesService));
  app.use('/api/v1/theaters', createTheatersRouter(theatersService));
  app.use('/api/v1/shows',    createShowsRouter(showsService));

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ statusCode: 404, message: 'Route not found' });
  });

  // ── Global error handler ──────────────────────────────────────────────────
  // Maps custom HttpException subclasses → proper HTTP status codes.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpException) {
      res.status(err.statusCode).json({ statusCode: err.statusCode, message: err.message });
      return;
    }
    // Unexpected errors — log and return 500
    console.error('[UnhandledError]', err);
    res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  });

  return app;
}
