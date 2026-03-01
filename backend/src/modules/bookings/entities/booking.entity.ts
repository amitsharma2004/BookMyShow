import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ShowSeat } from '../../shows/entities/show-seat.entity';
import { BookingStatus } from '../../../common/enums/booking-status.enum';

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => ShowSeat, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'show_seat_id' })
  showSeat: ShowSeat;

  @Column({ name: 'show_seat_id' })
  showSeatId: string;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  /** Redis lock token stored for Lua-script safe release */
  @Column({ name: 'lock_token', nullable: true })
  lockToken: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
