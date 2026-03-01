import { Repository } from 'typeorm';
import { Show } from './entities/show.entity';
import { ShowSeat } from './entities/show-seat.entity';
import { Seat } from '../theaters/entities/seat.entity';
import { Movie } from '../movies/entities/movie.entity';
import { Theater } from '../theaters/entities/theater.entity';
import { ShowStatus } from '../../common/enums/show-status.enum';
import { SeatStatus } from '../../common/enums/seat-status.enum';
import { CreateShowDto } from './dto/create-show.dto';
import { QueryShowsDto } from './dto/query-shows.dto';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '../../common/exceptions/http.exception';

/** Shape returned by GET /shows/:id/seats */
export interface ShowSeatView {
  id: string;          // seat.id
  showSeatId: string;  // showSeat.id
  rowLabel: string;
  seatNumber: number;
  seatType: string;
  status: SeatStatus;  // per-show status from ShowSeat — never from Seat
}

export class ShowsService {
  constructor(
    private readonly showRepo: Repository<Show>,
    private readonly showSeatRepo: Repository<ShowSeat>,
    private readonly seatRepo: Repository<Seat>,
    private readonly movieRepo: Repository<Movie>,
    private readonly theaterRepo: Repository<Theater>,
  ) {}

  /**
   * Create a new show and auto-generate ShowSeat records
   * for every seat in the theater — all initialised to AVAILABLE.
   *
   * Design note: We do NOT mutate Seat.status here. ShowSeat is the
   * sole source of truth for per-show seat availability.
   */
  async createShow(dto: CreateShowDto): Promise<Show> {
    // Validate movie exists
    const movie = await this.movieRepo.findOne({ where: { id: dto.movieId } });
    if (!movie) throw new NotFoundException(`Movie ${dto.movieId} not found`);

    // Validate theater exists
    const theater = await this.theaterRepo.findOne({ where: { id: dto.theaterId } });
    if (!theater) throw new NotFoundException(`Theater ${dto.theaterId} not found`);

    // Validate showTime is a valid date
    const showTime = new Date(dto.showTime);
    if (isNaN(showTime.getTime())) {
      throw new BadRequestException('Invalid showTime — must be a valid ISO 8601 date-time');
    }

    // Create the show record
    const show = this.showRepo.create({
      movieId: dto.movieId,
      theaterId: dto.theaterId,
      showTime,
      status: ShowStatus.ACTIVE,
    });
    const savedShow = await this.showRepo.save(show);

    // Fetch all seats for this theater
    const seats = await this.seatRepo.find({
      where: { theaterId: dto.theaterId },
      order: { rowLabel: 'ASC', seatNumber: 'ASC' },
    });

    if (seats.length === 0) {
      throw new BadRequestException(
        `Theater ${dto.theaterId} has no seats. Generate the seat grid first.`,
      );
    }

    // Bulk-create ShowSeat records — one per seat, all AVAILABLE
    const showSeats: Partial<ShowSeat>[] = seats.map((seat) => ({
      showId: savedShow.id,
      seatId: seat.id,
      status: SeatStatus.AVAILABLE,
    }));
    await this.showSeatRepo.save(showSeats as ShowSeat[]);

    return savedShow;
  }

  /**
   * List shows with optional filters:
   *   - movieId: exact match
   *   - date: returns all shows whose showTime falls on that calendar day (UTC)
   * Returns paginated result with total count.
   */
  async findAll(query: QueryShowsDto): Promise<{
    shows: Show[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { movieId, date, page = 1, limit = 20 } = query;
    const qb = this.showRepo
      .createQueryBuilder('show')
      .leftJoinAndSelect('show.movie', 'movie')
      .leftJoinAndSelect('show.theater', 'theater')
      .where('show.status = :status', { status: ShowStatus.ACTIVE });

    if (movieId) {
      qb.andWhere('show.movieId = :movieId', { movieId });
    }

    if (date) {
      // Match all shows that start on the given calendar day (UTC)
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      if (isNaN(dayStart.getTime())) {
        throw new BadRequestException('Invalid date format — use YYYY-MM-DD');
      }
      qb.andWhere('show.showTime BETWEEN :dayStart AND :dayEnd', { dayStart, dayEnd });
    }

    qb.orderBy('show.showTime', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [shows, total] = await qb.getManyAndCount();
    return { shows, total, page, limit };
  }

  /**
   * Get a single show by ID (includes movie + theater relations).
   * Throws 404 if not found.
   */
  async findOne(id: string): Promise<Show> {
    const show = await this.showRepo.findOne({
      where: { id },
      relations: ['movie', 'theater'],
    });
    if (!show) throw new NotFoundException(`Show ${id} not found`);
    return show;
  }

  /**
   * GET /shows/:id/seats
   *
   * Merges ShowSeat.status (per-show) with Seat metadata (row, number, type).
   * The Seat.status field is intentionally ignored — only ShowSeat.status matters.
   * Results ordered by rowLabel ASC, seatNumber ASC.
   */
  async getShowSeats(showId: string): Promise<ShowSeatView[]> {
    // Ensure show exists
    await this.findOne(showId);

    const showSeats = await this.showSeatRepo
      .createQueryBuilder('ss')
      .innerJoinAndSelect('ss.seat', 'seat')
      .where('ss.showId = :showId', { showId })
      .orderBy('seat.rowLabel', 'ASC')
      .addOrderBy('seat.seatNumber', 'ASC')
      .getMany();

    return showSeats.map((ss) => ({
      id: ss.seat.id,
      showSeatId: ss.id,
      rowLabel: ss.seat.rowLabel,
      seatNumber: ss.seat.seatNumber,
      seatType: ss.seat.seatType,
      status: ss.status,  // ← per-show status; Seat.status is never read here
    }));
  }

  /**
   * Cancel a show — sets status to CANCELLED.
   * Does not affect ShowSeat records (they remain as historical data).
   */
  async cancelShow(id: string): Promise<Show> {
    const show = await this.findOne(id);
    if (show.status === ShowStatus.CANCELLED) {
      throw new ConflictException(`Show ${id} is already cancelled`);
    }
    show.status = ShowStatus.CANCELLED;
    return this.showRepo.save(show);
  }
}
