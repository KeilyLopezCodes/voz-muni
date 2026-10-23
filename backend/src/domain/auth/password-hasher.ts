// Puerto: la infraestructura usa bcrypt; las pruebas usan un falso.
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verificar(password: string, hash: string): Promise<boolean>;
}
