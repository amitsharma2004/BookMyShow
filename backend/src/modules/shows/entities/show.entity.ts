import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Movie } from '../../movies/entities/movie.entity';
import { Theater } from '../../theaters/entities/theater.entity';
import { ShowSeat } from './show-seat.entity';
import { ShowStatus } from '../../../common/enums/show-status.enum';

/**
 * Show — links a Movie to a Theater at a specific date/time.
 *
 * Composite index on (show_time, movie_id) for query performance
 * on the common "list shows for a movie on a given date" query.
 */
@Index('idx_show_time_movie_id', ['showTime', 'movieId'])
@Entity('shows')
export class Show {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Movie FK ──────────────────────────────────────────────────────────────
  @ManyToOne(() => Movie, (movie) => movie.shows, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'movie_id' })
  movie: Movie;

  @Index('idx_show_movie_id')
  @Column({ name: 'movie_id' })
  movieId: string;

  // ── Theater FK ────────────────────────────────────────────────────────────
  @ManyToOne(() => Theater, (theater) => theater.shows, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'theater_id' })
  theater: Theater;

  @Column({ name: 'theater_id' })
  theaterId: string;

  // ── Scheduling ────────────────────────────────────────────────────────────
  /**
   * showTime is stored with timezone (timestamptz in Postgres).
   * Indexed via composite index above.
   */
  @Column({ name: 'show_time', type: 'timestamptz' })
  showTime: Date;

  @Column({
    type: 'enum',
    enum: ShowStatus,
    default: ShowStatus.ACTIVE,
  })
  status: ShowStatus;

  // ── Relations ─────────────────────────────────────────────────────────────
  @OneToMany(() => ShowSeat, (showSeat) => showSeat.show, { cascade: ['insert'] })
  showSeats: ShowSeat[];

  // ── Audit ─────────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
