import { Repository } from 'typeorm';
import { Movie } from './entities/movie.entity';
import { CreateMovieDto } from './dto/create-movie.dto';
import { NotFoundException } from '../../common/exceptions/http.exception';

export class MoviesService {
  constructor(private readonly movieRepo: Repository<Movie>) {}

  async create(dto: CreateMovieDto): Promise<Movie> {
    const movie = this.movieRepo.create(dto);
    return this.movieRepo.save(movie);
  }

  async findAll(page = 1, limit = 20): Promise<{ movies: Movie[]; total: number }> {
    const [movies, total] = await this.movieRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { movies, total };
  }

  async findOne(id: string): Promise<Movie> {
    const movie = await this.movieRepo.findOne({ where: { id } });
    if (!movie) throw new NotFoundException(`Movie ${id} not found`);
    return movie;
  }

  async update(id: string, dto: Partial<CreateMovieDto>): Promise<Movie> {
    const movie = await this.findOne(id);
    Object.assign(movie, dto);
    return this.movieRepo.save(movie);
  }

  async remove(id: string): Promise<void> {
    const movie = await this.findOne(id);
    await this.movieRepo.remove(movie);
  }
}
