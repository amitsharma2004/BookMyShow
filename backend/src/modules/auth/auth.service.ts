import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { User } from '../users/entities/user.entity';
import {
  ConflictException,
  UnauthorizedException,
} from '../../common/exceptions/http.exception';

export interface RegisterDto { email: string; password: string; }
export interface LoginDto { email: string; password: string; }

export class AuthService {
  constructor(private readonly userRepo: Repository<User>) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({ email: dto.email, passwordHash });
    await this.userRepo.save(user);

    return { accessToken: this.signToken(user) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { accessToken: this.signToken(user) };
  }

  private signToken(user: User): string {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] },
    );
  }
}
