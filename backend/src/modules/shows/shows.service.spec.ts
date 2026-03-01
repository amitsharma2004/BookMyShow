import { Repository, SelectQueryBuilder } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '../../common/exceptions/http.exception';
import { ShowsService } from './shows.service';
import { Show } from './entities/show.entity';
import { ShowSeat } from './entities/show-seat.entity';
import { Seat } from '../theaters/entities/seat.entity';
import { Movie } from '../movies/entities/movie.entity';
import { Theater } from '../theaters/entities/theater.entity';
import { ShowStatus } from '../../common/enums/show-status.enum';
import { SeatStatus } from '../../common/enums/seat-status.enum';
import { SeatType } from '../../common/enums/seat-type.enum';

// ── Typed mock factory ──────────────────────────────────────────────────────
type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

function createMockRepo<T>(): MockRepo<T> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const movieId = 'movie-uuid-1';
const theaterId = 'theater-uuid-1';
const showId = 'show-uuid-1';

const mockMovie: Partial<Movie> = { id: movieId, title: 'Inception' };
const mockTheater: Partial<Theater> = { id: theaterId, name: 'PVR Central', totalRows: 3, totalColumns: 2 };
const mockShow: Partial<Show> = {
  id: showId,
  movieId,
  theaterId,
  showTime: new Date('2026-06-15T19:30:00Z'),
  status: ShowStatus.ACTIVE,
  movie: mockMovie as Movie,
  theater: mockTheater as Theater,
};

const mockSeats: Partial<Seat>[] = [
  { id: 'seat-1', theaterId, rowLabel: 'A', seatNumber: 1, seatType: SeatType.PREMIUM, status: SeatStatus.AVAILABLE },
  { id: 'seat-2', theaterId, rowLabel: 'A', seatNumber: 2, seatType: SeatType.PREMIUM, status: SeatStatus.AVAILABLE },
  { id: 'seat-3', theaterId, rowLabel: 'B', seatNumber: 1, seatType: SeatType.REGULAR, status: SeatStatus.AVAILABLE },
  { id: 'seat-4', theaterId, rowLabel: 'B', seatNumber: 2, seatType: SeatType.REGULAR, status: SeatStatus.AVAILABLE },
  { id: 'seat-5', theaterId, rowLabel: 'C', seatNumber: 1, seatType: SeatType.VIP, status: SeatStatus.AVAILABLE },
  { id: 'seat-6', theaterId, rowLabel: 'C', seatNumber: 2, seatType: SeatType.VIP, status: SeatStatus.AVAILABLE },
];

const mockShowSeats: Partial<ShowSeat>[] = mockSeats.map((s, i) => ({
  id: `show-seat-${i + 1}`,
  showId,
  seatId: s.id,
  seat: s as Seat,
  status: SeatStatus.AVAILABLE,
}));

// ── Test suite ───────────────────────────────────────────────────────────────
describe('ShowsService', () => {
  let service: ShowsService;
  let showRepo: MockRepo<Show>;
  let showSeatRepo: MockRepo<ShowSeat>;
  let seatRepo: MockRepo<Seat>;
  let movieRepo: MockRepo<Movie>;
  let theaterRepo: MockRepo<Theater>;

  beforeEach(() => {
    showRepo = createMockRepo<Show>();
    showSeatRepo = createMockRepo<ShowSeat>();
    seatRepo = createMockRepo<Seat>();
    movieRepo = createMockRepo<Movie>();
    theaterRepo = createMockRepo<Theater>();

    // Direct instantiation — no NestJS DI container needed
    service = new ShowsService(
      showRepo as unknown as Repository<Show>,
      showSeatRepo as unknown as Repository<ShowSeat>,
      seatRepo as unknown as Repository<Seat>,
      movieRepo as unknown as Repository<Movie>,
      theaterRepo as unknown as Repository<Theater>,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  // createShow
  // ─────────────────────────────────────────────────────────────────────────
  describe('createShow', () => {
    it('creates a show and bulk-inserts ShowSeat records for every theater seat', async () => {
      movieRepo.findOne.mockResolvedValue(mockMovie);
      theaterRepo.findOne.mockResolvedValue(mockTheater);
      showRepo.create.mockReturnValue({ ...mockShow });
      showRepo.save.mockResolvedValue({ ...mockShow });
      seatRepo.find.mockResolvedValue(mockSeats);
      showSeatRepo.save.mockResolvedValue(mockShowSeats);

      const result = await service.createShow({
        movieId,
        theaterId,
        showTime: '2026-06-15T19:30:00Z',
      });

      expect(result.id).toBe(showId);
      expect(result.status).toBe(ShowStatus.ACTIVE);

      // One ShowSeat per seat — all AVAILABLE
      const savedSeats = showSeatRepo.save.mock.calls[0][0] as Partial<ShowSeat>[];
      expect(savedSeats).toHaveLength(mockSeats.length);
      savedSeats.forEach((ss) => {
        expect(ss.status).toBe(SeatStatus.AVAILABLE);
        expect(ss.showId).toBe(showId);
      });

      // Seat.status was NOT mutated (seatRepo.save was never called)
      expect(seatRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when movie does not exist', async () => {
      movieRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createShow({ movieId: 'bad-movie', theaterId, showTime: '2026-06-15T19:30:00Z' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when theater does not exist', async () => {
      movieRepo.findOne.mockResolvedValue(mockMovie);
      theaterRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createShow({ movieId, theaterId: 'bad-theater', showTime: '2026-06-15T19:30:00Z' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid showTime', async () => {
      movieRepo.findOne.mockResolvedValue(mockMovie);
      theaterRepo.findOne.mockResolvedValue(mockTheater);
      await expect(
        service.createShow({ movieId, theaterId, showTime: 'not-a-date' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when theater has no seats', async () => {
      movieRepo.findOne.mockResolvedValue(mockMovie);
      theaterRepo.findOne.mockResolvedValue(mockTheater);
      showRepo.create.mockReturnValue({ ...mockShow });
      showRepo.save.mockResolvedValue({ ...mockShow });
      seatRepo.find.mockResolvedValue([]); // no seats

      await expect(
        service.createShow({ movieId, theaterId, showTime: '2026-06-15T19:30:00Z' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // findAll
  // ─────────────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    let qb: Partial<SelectQueryBuilder<Show>>;

    beforeEach(() => {
      qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockShow], 1]),
      };
      showRepo.createQueryBuilder.mockReturnValue(qb as SelectQueryBuilder<Show>);
    });

    it('returns paginated shows', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.shows).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('applies movieId filter', async () => {
      await service.findAll({ movieId, page: 1, limit: 20 });
      expect(qb.andWhere).toHaveBeenCalledWith('show.movieId = :movieId', { movieId });
    });

    it('applies date range filter for a given date', async () => {
      await service.findAll({ date: '2026-06-15', page: 1, limit: 20 });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'show.showTime BETWEEN :dayStart AND :dayEnd',
        expect.objectContaining({
          dayStart: expect.any(Date),
          dayEnd: expect.any(Date),
        }),
      );
    });

    it('throws BadRequestException for invalid date format', async () => {
      await expect(
        service.findAll({ date: 'not-a-date', page: 1, limit: 20 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('returns a show when found', async () => {
      showRepo.findOne.mockResolvedValue(mockShow);
      const result = await service.findOne(showId);
      expect(result.id).toBe(showId);
    });

    it('throws NotFoundException for unknown show', async () => {
      showRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('bad-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getShowSeats
  // ─────────────────────────────────────────────────────────────────────────
  describe('getShowSeats', () => {
    it('returns merged seat map — ShowSeat.status, not Seat.status', async () => {
      showRepo.findOne.mockResolvedValue(mockShow);

      // One seat is BOOKED — Seat.status remains AVAILABLE (it should never be read)
      const mixedShowSeats: Partial<ShowSeat>[] = [
        {
          id: 'ss-1', showId, seatId: 'seat-1',
          seat: { id: 'seat-1', rowLabel: 'A', seatNumber: 1, seatType: SeatType.PREMIUM, status: SeatStatus.AVAILABLE } as Seat,
          status: SeatStatus.BOOKED,  // ← per-show status
        },
        {
          id: 'ss-2', showId, seatId: 'seat-2',
          seat: { id: 'seat-2', rowLabel: 'A', seatNumber: 2, seatType: SeatType.PREMIUM, status: SeatStatus.AVAILABLE } as Seat,
          status: SeatStatus.AVAILABLE,
        },
      ];

      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mixedShowSeats),
      };
      showSeatRepo.createQueryBuilder.mockReturnValue(qb as any);

      const seats = await service.getShowSeats(showId);

      expect(seats).toHaveLength(2);

      // First seat: ShowSeat says BOOKED — Seat.status (AVAILABLE) must be ignored
      expect(seats[0].status).toBe(SeatStatus.BOOKED);
      expect(seats[0].rowLabel).toBe('A');
      expect(seats[0].seatNumber).toBe(1);
      expect(seats[0].seatType).toBe(SeatType.PREMIUM);
      expect(seats[0].showSeatId).toBe('ss-1');
      expect(seats[0].id).toBe('seat-1');

      // Second seat: AVAILABLE
      expect(seats[1].status).toBe(SeatStatus.AVAILABLE);
    });

    it('throws NotFoundException for unknown show', async () => {
      showRepo.findOne.mockResolvedValue(null);
      await expect(service.getShowSeats('bad-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // cancelShow
  // ─────────────────────────────────────────────────────────────────────────
  describe('cancelShow', () => {
    it('cancels an active show', async () => {
      showRepo.findOne.mockResolvedValue({ ...mockShow, status: ShowStatus.ACTIVE });
      showRepo.save.mockResolvedValue({ ...mockShow, status: ShowStatus.CANCELLED });

      const result = await service.cancelShow(showId);
      expect(result.status).toBe(ShowStatus.CANCELLED);
      expect(showRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ShowStatus.CANCELLED }),
      );
    });

    it('throws ConflictException when show is already cancelled', async () => {
      showRepo.findOne.mockResolvedValue({ ...mockShow, status: ShowStatus.CANCELLED });
      await expect(service.cancelShow(showId)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for unknown show', async () => {
      showRepo.findOne.mockResolvedValue(null);
      await expect(service.cancelShow('bad-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
