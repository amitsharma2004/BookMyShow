import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Show } from './show.entity';
import { Seat } from '../../theaters/entities/seat.entity';
import { SeatStatus } from '../../../common/enums/seat-status.enum';

/**
 * ShowSeat — per-show seat status join table.
 *
 * Critical design constraint (from architect):
 *   - This table carries the mutable per-show seat status.
 *   - The base Seat.status field is NEVER mutated by booking operations.
 *   - Composite unique on (show_id, seat_id) prevents duplicate records.
 *
 * Key schema for Redis lock (US-008): seat:<showId>:<seatId>
 * Status mirrors Redis state:
 *   - AVAILABLE  → no Redis lock held
 *   - LOCKED     → Redis lock held (TTL active)
 *   - BOOKED     → payment confirmed; Redis lock released; permanent
 */
@Unique('uq_show_seat', ['showId', 'seatId'])
@Entity('show_seats')
export class ShowSeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Show FK ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Show, (show) => show.showSeats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'show_id' })
  show: Show;

  @Index('idx_show_seat_show_id')
  @Column({ name: 'show_id' })
  showId: string;

  // ── Seat FK ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Seat, (seat) => seat.showSeats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seat_id' })
  seat: Seat;

  @Column({ name: 'seat_id' })
  seatId: string;

  // ── Status ────────────────────────────────────────────────────────────────
  /**
   * Per-show seat status — the only source of truth for seat availability.
   * Default: AVAILABLE (set when the show is created).
   */
  @Column({ type: 'enum', enum: SeatStatus, default: SeatStatus.AVAILABLE })
  status: SeatStatus;

  // ── Audit ─────────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
