import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PayloadAcceso } from '../../../src/domain/auth/token-service';
import { JwtTokenService } from '../../../src/infrastructure/auth/jwt-token-service';

const secreto = 'secreto-de-prueba-de-al-menos-32-caracteres';
const ahora = new Date('2026-10-22T15:00:00.000Z');
const payload: PayloadAcceso = { sub: '7', rol: 'coordinador', dep: 3 };

describe('JwtTokenService', () => {
  const servicio = new JwtTokenService(secreto);

  it('verifica un token que emitió y devuelve su payload', () => {
    const { token } = servicio.emitirAcceso(payload, ahora);

    expect(servicio.verificarAcceso(token, ahora)).toEqual(payload);
  });

  it('el token vence 15 minutos después de emitirse', () => {
    const { expiraEn } = servicio.emitirAcceso(payload, ahora);

    expect(expiraEn).toEqual(new Date('2026-10-22T15:15:00.000Z'));
  });

  it('el payload firmado tiene sub, rol y dep, y usa HS256', () => {
    const { token } = servicio.emitirAcceso({ sub: '1', rol: 'vecino', dep: null }, ahora);
    const decodificado = jwt.decode(token, { complete: true });

    expect(decodificado?.header.alg).toBe('HS256');
    expect(decodificado?.payload).toMatchObject({ sub: '1', rol: 'vecino', dep: null });
  });

  it('rechaza un token firmado con otro secreto', () => {
    const { token } = new JwtTokenService('otro-secreto-distinto-de-al-menos-32-chars').emitirAcceso(payload, ahora);

    expect(servicio.verificarAcceso(token, ahora)).toBeNull();
  });

  it('rechaza un token vencido', () => {
    const { token, expiraEn } = servicio.emitirAcceso(payload, ahora);

    expect(servicio.verificarAcceso(token, new Date(expiraEn.getTime() - 1000))).toEqual(payload);
    expect(servicio.verificarAcceso(token, expiraEn)).toBeNull();
  });

  it('rechaza un texto que no es JWT', () => {
    expect(servicio.verificarAcceso('no-es-un-token', ahora)).toBeNull();
  });

  it('genera tokens de renovación aleatorios de 32 bytes en base64url', () => {
    const token = servicio.generarRenovacion();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(servicio.generarRenovacion()).not.toBe(token);
  });

  it('el hash de un token de renovación es su SHA-256 en hexadecimal', () => {
    const token = servicio.generarRenovacion();
    const hash = servicio.hashRenovacion(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token);
  });
});
