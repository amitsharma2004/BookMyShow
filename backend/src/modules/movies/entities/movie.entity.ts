import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Show } from '../../shows/entities/show.entity';

@Entity('movies')
export class Movie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'simple-array' })
  genre: string[];

  @Column({ type: 'simple-array' })
  cast: string[];

  @Column({ name: 'release_date', type: 'date' })
  releaseDate: string;

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes: number;

  @Column({ nullable: true, name: 'poster_url' })
  posterUrl: string;

  @OneToMany(() => Show, (show) => show.movie)
  shows: Show[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
