import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Theater } from './theater.entity';
import { SeatType } from '../../../common/enums/seat-type.enum';
import { SeatStatus } from '../../../common/enums/seat-status.enum';
import { ShowSeat } from '../../shows/entities/show-seat.entity';

@Entity('seats')
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Theater, (theater) => theater.seats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'theater_id' })
  theater: Theater;

  @Column({ name: 'theater_id' })
  theaterId: string;

  /** Row label: A, B, C … Z */
  @Column({ name: 'row_label', length: 2 })
  rowLabel: string;

  /** Column number within the row: 1 … totalColumns */
  @Column({ name: 'seat_number', type: 'int' })
  seatNumber: number;

  /**
   * Physical classification — set once at creation; never mutated.
   * Row A → PREMIUM; last 2 rows → VIP; rest → REGULAR.
   */
  @Column({ name: 'seat_type', type: 'enum', enum: SeatType, default: SeatType.REGULAR })
  seatType: SeatType;

  /**
   * Base default status — always AVAILABLE.
   * DO NOT mutate this field for booking operations.
   * Per-show status lives in ShowSeat.status.
   */
  @Column({ type: 'enum', enum: SeatStatus, default: SeatStatus.AVAILABLE })
  status: SeatStatus;

  @OneToMany(() => ShowSeat, (showSeat) => showSeat.seat)
  showSeats: ShowSeat[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
