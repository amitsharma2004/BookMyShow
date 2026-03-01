import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../modules/users/entities/user.entity';
import { Movie } from '../modules/movies/entities/movie.entity';
import { Theater } from '../modules/theaters/entities/theater.entity';
import { Seat } from '../modules/theaters/entities/seat.entity';
import { Show } from '../modules/shows/entities/show.entity';
import { ShowSeat } from '../modules/shows/entities/show-seat.entity';
import { Booking } from '../modules/bookings/entities/booking.entity';
import { InitialSchema1740787200000 } from './migrations/1740787200000-InitialSchema';

dotenv.config();

/**
 * TypeORM DataSource used by the CLI for migration commands.
 * Usage:
 *   npm run migration:run    — apply all pending migrations
 *   npm run migration:revert — revert the last migration
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [User, Movie, Theater, Seat, Show, ShowSeat, Booking],
  migrations: [InitialSchema1740787200000],
  migrationsTableName: 'typeorm_migrations',
});
