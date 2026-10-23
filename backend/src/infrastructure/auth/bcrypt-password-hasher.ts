import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '../../domain/auth/password-hasher';

// bcryptjs: el mismo algoritmo que bcrypt (RNF-08) sin compilar código nativo.
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly costo: number = 12) {}

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.costo);
  }

  verificar(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
