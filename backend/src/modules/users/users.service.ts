import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

export class UsersService {
  constructor(private readonly userRepo: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }
}
