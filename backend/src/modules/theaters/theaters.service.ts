import { Repository } from 'typeorm';
import { Theater } from './entities/theater.entity';
import { Seat } from './entities/seat.entity';
import { SeatType } from '../../common/enums/seat-type.enum';
import { SeatStatus } from '../../common/enums/seat-status.enum';
import { CreateTheaterDto } from './dto/create-theater.dto';
import { NotFoundException } from '../../common/exceptions/http.exception';

export class TheatersService {
  constructor(
    private readonly theaterRepo: Repository<Theater>,
    private readonly seatRepo: Repository<Seat>,
  ) {}

  async create(dto: CreateTheaterDto): Promise<Theater> {
    const theater = this.theaterRepo.create({
      name: dto.name,
      location: dto.location,
      totalRows: dto.totalRows,
      totalColumns: dto.totalColumns,
    });
    const saved = await this.theaterRepo.save(theater);

    // Auto-generate seat grid: row A → PREMIUM; last 2 rows → VIP; rest → REGULAR
    const seats: Partial<Seat>[] = [];
    for (let r = 0; r < dto.totalRows; r++) {
      const rowLabel = String.fromCharCode(65 + r); // A, B, C...
      const seatType = this.resolveSeatType(r, dto.totalRows);
      for (let c = 1; c <= dto.totalColumns; c++) {
        seats.push({
          theaterId: saved.id,
          rowLabel,
          seatNumber: c,
          seatType,
          status: SeatStatus.AVAILABLE,
        });
      }
    }
    await this.seatRepo.save(seats as Seat[]);
    return saved;
  }

  async findOne(id: string): Promise<Theater> {
    const theater = await this.theaterRepo.findOne({ where: { id } });
    if (!theater) throw new NotFoundException(`Theater ${id} not found`);
    return theater;
  }

  async findAll(): Promise<Theater[]> {
    return this.theaterRepo.find({ order: { createdAt: 'ASC' } });
  }

  async getSeats(theaterId: string): Promise<Seat[]> {
    await this.findOne(theaterId); // 404 guard
    return this.seatRepo.find({
      where: { theaterId },
      order: { rowLabel: 'ASC', seatNumber: 'ASC' },
    });
  }

  async update(id: string, dto: Partial<Pick<CreateTheaterDto, 'name' | 'location'>>): Promise<Theater> {
    const theater = await this.findOne(id);
    if (dto.name) theater.name = dto.name;
    if (dto.location) theater.location = dto.location;
    return this.theaterRepo.save(theater);
  }

  async remove(id: string): Promise<void> {
    const theater = await this.findOne(id);
    await this.theaterRepo.remove(theater);
  }

  private resolveSeatType(rowIndex: number, totalRows: number): SeatType {
    if (rowIndex === 0) return SeatType.PREMIUM; // first row
    if (rowIndex >= totalRows - 2) return SeatType.VIP; // last 2 rows
    return SeatType.REGULAR;
  }
}
