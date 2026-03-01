import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Seat } from './seat.entity';
import { Show } from '../../shows/entities/show.entity';

@Entity('theaters')
export class Theater {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  location: string;

  @Column({ name: 'total_rows', type: 'int' })
  totalRows: number;

  @Column({ name: 'total_columns', type: 'int' })
  totalColumns: number;

  @OneToMany(() => Seat, (seat) => seat.theater, { cascade: true })
  seats: Seat[];

  @OneToMany(() => Show, (show) => show.theater)
  shows: Show[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
